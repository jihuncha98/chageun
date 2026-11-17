begin;
-- Do not attach the reward trigger if a legacy installation allows direct client writes.
do $$ begin
 if has_table_privilege('authenticated','public.study_session_facts','INSERT,UPDATE,DELETE,TRUNCATE') or
    has_table_privilege('anon','public.study_session_facts','INSERT,UPDATE,DELETE,TRUNCATE') then
  raise exception '확정 공부 기록의 쓰기 권한을 먼저 확인하세요. 마이그레이션을 중단합니다.';
 end if;
end $$;
-- Internal tables have no client grants. Default items are virtual entitlements for every account.
create table if not exists chageun_internal.shop_catalog(
 id text primary key, kind text not null check(kind in ('title','skin','theme')), label text not null,
 level integer, price integer check(price>=0), active boolean not null default false, unique(kind,level));
insert into chageun_internal.shop_catalog(id,kind,label,level,active)
select 'title'||n,'title',name,n,n=1 from unnest(array['차근 사용자','차근 새내기','차근 애용자','차근 노력가','차근 고수','차근 달인','차근 마스터']) with ordinality t(name,n)
on conflict do nothing;
insert into chageun_internal.shop_catalog(id,kind,label,active) values
 ('classic','skin','기본 스킨',true),('midnight','skin','미드나이트',false),('pastel','skin','파스텔',false),
 ('standard','theme','기존 화면 설정',true),('lagoon','theme','라군',false) on conflict do nothing;
create table if not exists chageun_internal.shop_owned(
 account uuid references auth.users on delete cascade,item text references chageun_internal.shop_catalog,primary key(account,item));
create table if not exists chageun_internal.shop_worn(
 account uuid references auth.users on delete cascade,kind text,item text references chageun_internal.shop_catalog,primary key(account,kind));
create table if not exists chageun_internal.shop_journal(
 seq bigint generated always as identity primary key,request uuid not null unique default gen_random_uuid(),
 account uuid references auth.users on delete cascade,actor uuid,action text not null,delta bigint not null default 0,
 item text,reason text,details jsonb,created_at timestamptz not null default now());
create index if not exists shop_journal_account on chageun_internal.shop_journal(account,seq desc);
create table if not exists chageun_internal.shop_rules(
 starts timestamptz primary key,seconds integer not null check(seconds>0),cap integer not null check(cap>=0));
create table if not exists chageun_internal.shop_awards(
 account uuid references auth.users on delete cascade,day date,amount integer not null,primary key(account,day));
create or replace function public.chageun_shop_read(p_user uuid default null,p_before bigint default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare u uuid:=coalesce(p_user,auth.uid()); admin boolean:=p_user is not null;
begin
 if auth.uid() is null then raise exception '로그인이 필요해요.'; end if;
 if admin then perform chageun_internal.admin_require(); end if;
 return jsonb_build_object('balance',(select coalesce(sum(delta),0) from chageun_internal.shop_journal where account=u),
 'items',(select jsonb_agg(to_jsonb(c)||jsonb_build_object('owned',c.id in ('title1','classic','standard') or o.item is not null,
 'equipped',c.id=coalesce(w.item,case c.kind when 'title' then 'title1' when 'skin' then 'classic' else 'standard' end)) order by c.kind,c.level,c.id)
 from chageun_internal.shop_catalog c left join chageun_internal.shop_owned o on o.account=u and o.item=c.id
 left join chageun_internal.shop_worn w on w.account=u and w.kind=c.kind where admin or c.active or o.item is not null),
 'history',(select coalesce(jsonb_agg(to_jsonb(h) order by seq desc),'[]') from (select seq,action,delta,item,reason,created_at from chageun_internal.shop_journal where account=u and (p_before is null or seq<p_before) order by seq desc limit 50) h),
 'rule',(select to_jsonb(r) from chageun_internal.shop_rules r order by starts desc limit 1));
end $$;
create or replace function public.chageun_shop_change(p_request uuid,p_action text,p_item text default null,p_user uuid default null,p_amount integer default null,p_reason text default '',p_options jsonb default '{}')
returns void language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid(); u uuid:=coalesce(p_user,actor); c chageun_internal.shop_catalog; balance bigint; change bigint:=0;
 default_item boolean; owned boolean; stamp timestamptz; prior chageun_internal.shop_journal;
begin
 if actor is null or p_request is null then raise exception '로그인이 필요해요.'; end if;
 if p_action not in ('buy','equip') then
  perform chageun_internal.admin_require();
  if length(trim(coalesce(p_reason,''))) not between 2 and 150 then raise exception '사유를 2~150자로 입력하세요.'; end if;
 elsif u<>actor then raise exception '본인만 변경할 수 있어요.'; end if;
 perform pg_advisory_xact_lock(hashtextextended(u::text,13));
 select * into prior from chageun_internal.shop_journal where request=p_request;
 if found then
  if prior.actor=actor and prior.account=u and prior.action=p_action and prior.item is not distinct from p_item and prior.details=jsonb_build_object('amount',p_amount,'options',p_options) and prior.reason=p_reason then return; end if;
  raise exception '다른 작업에 사용된 요청이에요.';
 end if;
 select * into c from chageun_internal.shop_catalog where id=p_item for update;
 default_item:=p_item in ('title1','classic','standard');
 owned:=default_item or exists(select from chageun_internal.shop_owned where account=u and item=p_item);
 if p_action in ('buy','equip','grant_item','revoke_item','catalog') and c.id is null then raise exception '상품을 확인하세요.'; end if;
 if p_action='buy' then
  if owned or not c.active or c.price is null then raise exception '구매할 수 없는 상품이에요.'; end if;
  if c.level>2 and not exists(select from chageun_internal.shop_owned where account=u and item='title'||(c.level-1)) then raise exception '이전 칭호를 먼저 획득하세요.'; end if;
  select coalesce(sum(delta),0) into balance from chageun_internal.shop_journal where account=u;
  if balance<c.price then raise exception '크레딧이 부족해요.'; end if;
  change:=-c.price;
 elsif p_action='equip' and not owned then raise exception '보유하지 않은 상품이에요.';
 elsif p_action='revoke_item' then
  if default_item or not owned then raise exception '회수할 수 없는 상품이에요.'; end if;
  delete from chageun_internal.shop_worn where account=u and item=p_item;
  delete from chageun_internal.shop_owned where account=u and item=p_item;
 elsif p_action='grant_item' and owned then raise exception '이미 보유한 상품이에요.';
 elsif p_action in ('credit','debit') then
  if coalesce(p_amount,0)<=0 then raise exception '양수를 입력하세요.'; end if;
  change:=case when p_action='credit' then p_amount else -p_amount end;
 elsif p_action='catalog' then
  if default_item or length(trim(coalesce(p_options->>'label',''))) not between 1 and 40 or p_amount is null or p_amount<0 then raise exception '상품 설정을 확인하세요.'; end if;
  update chageun_internal.shop_catalog set label=trim(p_options->>'label'),price=p_amount,active=(p_options->>'active')::boolean where id=p_item;
 elsif p_action='rule' then
  perform pg_advisory_xact_lock(132017);
  if p_amount is null or p_amount<=0 or (p_options->>'cap')::integer<0 then raise exception '적립 기준을 확인하세요.'; end if;
  stamp:=case when exists(select from chageun_internal.shop_rules) then (((now() at time zone 'Asia/Seoul'-interval '6 hours')::date+1)+time '06:00') at time zone 'Asia/Seoul' else clock_timestamp() end;
  insert into chageun_internal.shop_rules values(stamp,p_amount,(p_options->>'cap')::integer) on conflict(starts) do update set seconds=excluded.seconds,cap=excluded.cap;
 elsif p_action not in ('equip','grant_item') then raise exception '지원하지 않는 작업이에요.'; end if;
 if p_action in ('buy','grant_item') then insert into chageun_internal.shop_owned values(u,p_item); end if;
 if p_action='equip' or (p_action in ('buy','grant_item') and c.kind='title') then
  insert into chageun_internal.shop_worn values(u,c.kind,p_item) on conflict(account,kind) do update set item=excluded.item;
 end if;
 insert into chageun_internal.shop_journal(request,account,actor,action,delta,item,reason,details) values(p_request,u,actor,p_action,change,p_item,p_reason,jsonb_build_object('amount',p_amount,'options',p_options));
end $$;
-- Facts are the existing server's confirmed study intervals. Recalculate only days touched by OLD/NEW.
create or replace function chageun_internal.shop_settle() returns trigger language plpgsql security definer set search_path='' as $$
declare u uuid:=coalesce(new.user_id,old.user_id); first_ms bigint; d date; lo bigint; hi bigint; earned integer; previous integer; rule chageun_internal.shop_rules;
begin
 select extract(epoch from min(starts))*1000 into first_ms from chageun_internal.shop_rules;
 if first_ms is null or not exists(select from auth.users where id=u) then return null; end if;
 perform pg_advisory_xact_lock(hashtextextended(u::text,13));
 for d in select distinct (to_timestamp(t/1000.0) at time zone 'Asia/Seoul'-interval '6 hours')::date+k
 from (values(old.start_ms,old.end_ms),(new.start_ms,new.end_ms)) v(s,e)
 cross join lateral (select greatest(first_ms,s) as t) clipped
 cross join lateral generate_series(0,(to_timestamp((e-1)/1000.0) at time zone 'Asia/Seoul'-interval '6 hours')::date-(to_timestamp(t/1000.0) at time zone 'Asia/Seoul'-interval '6 hours')::date) k
 where e>t loop
  lo:=extract(epoch from ((d+time '06:00') at time zone 'Asia/Seoul'))*1000; hi:=lo+86400000;
  select * into rule from chageun_internal.shop_rules where starts<to_timestamp(hi/1000.0) order by starts desc limit 1;
  lo:=greatest(lo,ceil(extract(epoch from rule.starts)*1000)::bigint);
  select least(rule.cap,floor(coalesce(sum(least(end_ms,hi)-greatest(start_ms,lo)),0)/(rule.seconds::bigint*1000))) into earned from public.study_session_facts where user_id=u and not is_deleted and start_ms<hi and end_ms>lo;
  select amount into previous from chageun_internal.shop_awards where account=u and day=d;
  if earned<>coalesce(previous,0) then
   insert into chageun_internal.shop_awards values(u,d,earned) on conflict(account,day) do update set amount=excluded.amount;
   insert into chageun_internal.shop_journal(account,action,delta,details,reason) values(u,'study',earned-coalesce(previous,0),jsonb_build_object('day',d,'rule',rule.starts),d::text);
  end if;
 end loop;
 return null;
end $$;
create or replace trigger chageun_shop_settlement after insert or delete or update of start_ms,end_ms,is_deleted on public.study_session_facts for each row execute function chageun_internal.shop_settle();
create or replace function public.chageun_social_labels(p_users uuid[]) returns table(user_id uuid,display_name text,title text)
language sql stable security definer set search_path='' as $$
 select v.user_id,v.display_name,coalesce(c.label,'차근 사용자') from public.chageun_visible_names(p_users) v left join chageun_internal.shop_worn w on w.account=v.user_id and w.kind='title' left join chageun_internal.shop_catalog c on c.id=w.item
$$;
revoke all on function chageun_internal.shop_settle() from public,anon,authenticated;
revoke all on function public.chageun_shop_read(uuid,bigint),public.chageun_social_labels(uuid[]),public.chageun_shop_change(uuid,text,text,uuid,integer,text,jsonb) from public,anon;
grant execute on function public.chageun_shop_read(uuid,bigint),public.chageun_social_labels(uuid[]),public.chageun_shop_change(uuid,text,text,uuid,integer,text,jsonb) to authenticated;
-- Use the same visibility and accepted-member predicates as the existing group board.
create or replace function public.chageun_group_summary(p_group uuid) returns jsonb
language sql stable security definer set search_path='' as $$
 select jsonb_build_object('total',coalesce(sum(f.total_ms),0),'active',count(*) filter(where f.studying)) from public.friend_board() f
 join public.study_group_members m on m.group_id=p_group and m.user_id=f.member_id and m.status='accepted'
 where f.shared and exists(select from public.study_group_members own where own.group_id=p_group and own.user_id=auth.uid() and own.status='accepted')

$$;
revoke all on function public.chageun_group_summary(uuid) from public,anon;
grant execute on function public.chageun_group_summary(uuid) to authenticated;
notify pgrst,'reload schema';
commit;
