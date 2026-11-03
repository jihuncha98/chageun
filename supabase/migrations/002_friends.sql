-- 차근 DB v1 → v2: 승인한 친구에게만 '오늘 순공 시간/공부 상태'를 공개합니다.
-- 기존 study_workspaces, 기록, 로그인, 시간표는 수정하거나 초기화하지 않습니다.
-- 주의: Supabase SQL Editor에서 001 적용 후 이 SQL을 1회 실행하세요. 재실행도 안전합니다.
begin;

create table if not exists public.friend_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  nickname text not null default '차근 사용자' check (char_length(trim(nickname)) between 2 and 20),
  friend_code text not null unique default upper(substr(replace(gen_random_uuid()::text,'-',''),1,16)),
  share_enabled boolean not null default true,
  last_seen timestamptz default now(),
  created_at timestamptz not null default now()
);
create table if not exists public.friend_links (
  user_a uuid not null references public.friend_profiles(user_id) on delete cascade,
  user_b uuid not null references public.friend_profiles(user_id) on delete cascade,
  requested_by uuid not null,
  status text not null default 'pending' check (status in ('pending','accepted')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key(user_a,user_b),
  check (user_a < user_b),
  check (requested_by in (user_a,user_b))
);
create index if not exists friend_links_b_status on public.friend_links(user_b,status);

alter table public.friend_profiles enable row level security;
alter table public.friend_links enable row level security;
-- 직접 테이블 접근은 전면 차단합니다. 아래 제한된 SECURITY DEFINER RPC만 공개합니다.
revoke all on public.friend_profiles,public.friend_links from public,anon,authenticated;

create or replace function public.friend_profile_upsert(p_nickname text default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare me uuid := auth.uid(); chosen text; p public.friend_profiles;
begin
  if me is null then raise exception '로그인이 필요해요.'; end if;
  if p_nickname is not null and char_length(trim(p_nickname)) not between 2 and 20 then
    raise exception '별명은 2~20자로 입력해 주세요.';
  end if;
  chosen := coalesce(trim(p_nickname),'차근 사용자');
  insert into public.friend_profiles(user_id,nickname)
    values(me,chosen) on conflict(user_id) do nothing;
  if p_nickname is not null then
    update public.friend_profiles set nickname=chosen where user_id=me;
  end if;
  select * into p from public.friend_profiles f where f.user_id=me;
  return jsonb_build_object('nickname',p.nickname,'code',p.friend_code,'shareEnabled',p.share_enabled);
end $$;

create or replace function public.friend_preferences(p_nickname text,p_enabled boolean)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare me uuid := auth.uid(); p public.friend_profiles;
begin
  if me is null then raise exception '로그인이 필요해요.'; end if;
  if p_nickname is null or char_length(trim(p_nickname)) not between 2 and 20 or p_enabled is null then
    raise exception '별명 또는 공개 설정을 확인해 주세요.';
  end if;
  update public.friend_profiles
    set nickname=trim(p_nickname),share_enabled=p_enabled
    where user_id=me returning * into p;
  if not found then raise exception '친구 메뉴에서 프로필을 먼저 만들어요.'; end if;
  return jsonb_build_object('nickname',p.nickname,'code',p.friend_code,'shareEnabled',p.share_enabled);
end $$;

create or replace function public.friend_ping()
returns void language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then raise exception '로그인이 필요해요.'; end if;
  update public.friend_profiles set last_seen=now() where user_id=auth.uid();
end $$;

create or replace function public.friend_send_request(p_code text)
returns void language plpgsql security definer set search_path = '' as $$
declare me uuid := auth.uid(); peer uuid; a uuid; b uuid;
begin
  if me is null then raise exception '로그인이 필요해요.'; end if;
  if p_code is null or length(trim(p_code)) not between 12 and 32 then
    raise exception '친구 코드를 확인해 주세요.';
  end if;
  select p.user_id into peer from public.friend_profiles p
    where p.friend_code=upper(trim(p_code)) and p.share_enabled;
  if peer is null then raise exception '해당 친구 코드를 찾지 못했어요.'; end if;
  if peer=me then raise exception '자신에게 친구 요청을 보낼 수 없어요.'; end if;
  if not exists(select 1 from public.friend_profiles p where p.user_id=me) then
    raise exception '친구 프로필을 먼저 만들어 주세요.';
  end if;
  a:=least(me,peer); b:=greatest(me,peer);
  insert into public.friend_links(user_a,user_b,requested_by,status)
    values(a,b,me,'pending') on conflict(user_a,user_b) do nothing;
  if not found then raise exception '이미 친구이거나 처리 중인 요청이 있어요.'; end if;
end $$;

create or replace function public.friend_respond(p_other uuid,p_accept boolean)
returns void language plpgsql security definer set search_path = '' as $$
declare me uuid := auth.uid(); a uuid; b uuid;
begin
  if me is null then raise exception '로그인이 필요해요.'; end if;
  if p_other is null or p_other=me or p_accept is null then raise exception '요청 정보를 확인해 주세요.'; end if;
  a:=least(me,p_other); b:=greatest(me,p_other);
  if p_accept then
    update public.friend_links l set status='accepted',updated_at=now()
    where l.user_a=a and l.user_b=b and l.status='pending' and l.requested_by<>me;
  else
    delete from public.friend_links l
    where l.user_a=a and l.user_b=b and l.status='pending' and l.requested_by<>me;
  end if;
  if not found then raise exception '수락하거나 거절할 친구 요청을 찾지 못했어요.'; end if;
end $$;

create or replace function public.friend_disconnect(p_other uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare me uuid := auth.uid(); a uuid; b uuid;
begin
  if me is null then raise exception '로그인이 필요해요.'; end if;
  if p_other is null or p_other=me then raise exception '친구 정보를 확인해 주세요.'; end if;
  a:=least(me,p_other); b:=greatest(me,p_other);
  delete from public.friend_links l where l.user_a=a and l.user_b=b
    and (l.status='accepted' or l.requested_by=me);
  if not found then raise exception '삭제할 친구 관계 또는 요청이 없어요.'; end if;
end $$;

create or replace function public.friend_overview()
returns jsonb language plpgsql security definer set search_path = '' as $$
declare me uuid := auth.uid(); p public.friend_profiles; links jsonb;
begin
  if me is null then raise exception '로그인이 필요해요.'; end if;
  select * into p from public.friend_profiles f where f.user_id=me;
  if not found then raise exception '친구 프로필을 먼저 만들어 주세요.'; end if;
  select coalesce(jsonb_agg(jsonb_build_object(
      'id',peer.user_id,'nickname',peer.nickname,'status',l.status,
      'requestedByMe',l.requested_by=me,'createdAt',l.created_at
    ) order by l.created_at desc),'[]'::jsonb) into links
  from public.friend_links l
  join public.friend_profiles peer on peer.user_id=case when l.user_a=me then l.user_b else l.user_a end
  where l.user_a=me or l.user_b=me;
  return jsonb_build_object(
    'profile',jsonb_build_object('nickname',p.nickname,'code',p.friend_code,'shareEnabled',p.share_enabled),
    'connections',links);
end $$;

-- 학습일: 한국 시간 오전 06:00 ~ 다음 날 06:00.
-- 서버의 원본 공부 기록에서 읽을 때마다 합산하므로 편집·삭제와 실행 중 타이머가 반영됩니다.
-- 승인된 양쪽 관계 + 양쪽 공개 동의가 없으면 시간/상태/마지막 접속을 반환하지 않습니다.
create or replace function public.friend_board()
returns table(member_id uuid,display_name text,total_ms bigint,studying boolean,last_seen_at timestamptz,is_me boolean,shared boolean)
language plpgsql security definer set search_path = '' as $$
declare me uuid := auth.uid(); my_share boolean; kst_day date;
        lo bigint; hi bigint; moment_ms bigint;
begin
  if me is null then raise exception '로그인이 필요해요.'; end if;
  select p.share_enabled into my_share from public.friend_profiles p where p.user_id=me;
  if not found then raise exception '친구 프로필을 먼저 만들어 주세요.'; end if;
  kst_day := ((now() at time zone 'Asia/Seoul') - interval '6 hours')::date;
  lo := (extract(epoch from ((kst_day::timestamp + interval '6 hours') at time zone 'Asia/Seoul'))*1000)::bigint;
  hi := lo+86400000;
  moment_ms := (extract(epoch from now())*1000)::bigint;
  return query
    select p.user_id as member_id,p.nickname as display_name,
      case when p.user_id=me or (my_share and p.share_enabled) then coalesce(st.millis,0) else null end as total_ms,
      case when p.user_id=me or (my_share and p.share_enabled)
        then coalesce(st.active,false) and p.last_seen>=now()-interval '3 minutes' else null end as studying,
      case when p.user_id=me or (my_share and p.share_enabled) then p.last_seen else null end as last_seen_at,
      (p.user_id=me) as is_me,
      (p.user_id=me or (my_share and p.share_enabled)) as shared
    from public.friend_profiles p
    left join public.study_workspaces w on w.user_id=p.user_id
    left join lateral (
      select coalesce(sum(greatest(0::bigint,
        least(coalesce((e.item->>'end')::bigint,moment_ms),hi)-greatest((e.item->>'start')::bigint,lo)
      )) filter(where e.item->>'kind'='study' and e.item->>'deleted_at' is null),0)::bigint as millis,
      coalesce(bool_or(e.item->>'kind'='study' and e.item->>'deleted_at' is null and e.item->>'end' is null),false) as active
      from jsonb_array_elements(coalesce(w.data->'entries','[]'::jsonb)) e(item)
    ) st on true
    where p.user_id=me or exists(
      select 1 from public.friend_links l where l.status='accepted'
        and ((l.user_a=me and l.user_b=p.user_id) or (l.user_b=me and l.user_a=p.user_id))
    );
end $$;

-- 기존 함수가 교체되더라도 PUBLIC 기본 실행 권한을 허용하지 않습니다.
revoke all on function public.friend_profile_upsert(text) from public,anon;
revoke all on function public.friend_preferences(text,boolean) from public,anon;
revoke all on function public.friend_ping() from public,anon;
revoke all on function public.friend_send_request(text) from public,anon;
revoke all on function public.friend_respond(uuid,boolean) from public,anon;
revoke all on function public.friend_disconnect(uuid) from public,anon;
revoke all on function public.friend_overview() from public,anon;
revoke all on function public.friend_board() from public,anon;
grant execute on function public.friend_profile_upsert(text) to authenticated;
grant execute on function public.friend_preferences(text,boolean) to authenticated;
grant execute on function public.friend_ping() to authenticated;
grant execute on function public.friend_send_request(text) to authenticated;
grant execute on function public.friend_respond(uuid,boolean) to authenticated;
grant execute on function public.friend_disconnect(uuid) to authenticated;
grant execute on function public.friend_overview() to authenticated;
grant execute on function public.friend_board() to authenticated;
commit;
