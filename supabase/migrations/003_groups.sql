-- 차근 v1.4: 초대 수락 기반 그룹. 002_friends.sql 적용 이후 실행하세요.
-- 기존 데이터는 변경하거나 초기화하지 않으며 그룹 멤버 수에 애플리케이션 제한을 두지 않습니다.
-- 승인된 그룹원끼리만 공개에 동의한 '오늘 공부 시간/공부 상태'를 공유합니다.
begin;

create table if not exists public.study_groups (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(trim(name)) between 2 and 40),
  owner_id uuid not null references public.friend_profiles(user_id) on delete cascade,
  created_at timestamptz not null default now()
);
create table if not exists public.study_group_members (
  group_id uuid not null references public.study_groups(id) on delete cascade,
  user_id uuid not null references public.friend_profiles(user_id) on delete cascade,
  invited_by uuid references public.friend_profiles(user_id) on delete set null,
  status text not null check (status in ('pending','accepted')),
  created_at timestamptz not null default now(),
  joined_at timestamptz,
  primary key (group_id,user_id)
);
create index if not exists study_group_members_user_status on public.study_group_members(user_id,status,group_id);
create index if not exists study_group_members_group_status on public.study_group_members(group_id,status);

alter table public.study_groups enable row level security;
alter table public.study_group_members enable row level security;
-- 외부에서 테이블을 직접 읽거나 수정할 수 없습니다. 아래 검증된 함수만 사용합니다.
revoke all on public.study_groups,public.study_group_members from public,anon,authenticated;

create or replace function public.group_create(p_name text)
returns uuid language plpgsql security definer set search_path='' as $$
declare me uuid:=auth.uid(); new_group uuid;
begin
  if me is null then raise exception '로그인이 필요해요.'; end if;
  if p_name is null or char_length(trim(p_name)) not between 2 and 40 then raise exception '그룹 이름은 2~40자로 입력해 주세요.'; end if;
  if not exists(select 1 from public.friend_profiles where user_id=me) then
    raise exception '친구 프로필을 먼저 만들어 주세요.';
  end if;
  insert into public.study_groups(name,owner_id) values(trim(p_name),me) returning id into new_group;
  insert into public.study_group_members(group_id,user_id,invited_by,status,joined_at)
    values(new_group,me,me,'accepted',now());
  return new_group;
end $$;

create or replace function public.group_invite(p_group uuid,p_code text)
returns void language plpgsql security definer set search_path='' as $$
declare me uuid:=auth.uid(); target uuid;
begin
  if me is null then raise exception '로그인이 필요해요.'; end if;
  if not exists(select 1 from public.study_groups where id=p_group and owner_id=me) then
    raise exception '그룹 관리자만 멤버를 초대할 수 있어요.';
  end if;
  if p_code is null or trim(p_code) !~* '^[a-f0-9]{16}$' then raise exception '16자리 친구 코드를 확인해 주세요.'; end if;
  select user_id into target from public.friend_profiles where friend_code=upper(trim(p_code));
  if target is null then raise exception '해당 친구 코드를 찾지 못했어요.'; end if;
  if target=me then raise exception '자기 자신은 초대할 필요가 없어요.'; end if;
  insert into public.study_group_members(group_id,user_id,invited_by,status)
    values(p_group,target,me,'pending') on conflict do nothing;
  if not found then raise exception '이미 그룹원이거나 초대가 대기 중이에요.'; end if;
end $$;

create or replace function public.group_respond(p_group uuid,p_accept boolean)
returns void language plpgsql security definer set search_path='' as $$
declare me uuid:=auth.uid(); changed integer;
begin
  if me is null then raise exception '로그인이 필요해요.'; end if;
  if p_accept is null then raise exception '초대 처리 방법을 확인해 주세요.'; end if;
  if p_accept then
    update public.study_group_members set status='accepted',joined_at=now()
      where group_id=p_group and user_id=me and status='pending';
  else
    delete from public.study_group_members where group_id=p_group and user_id=me and status='pending';
  end if;
  get diagnostics changed=row_count;
  if changed<>1 then raise exception '처리할 그룹 초대가 없어요.'; end if;
end $$;

create or replace function public.group_remove_member(p_group uuid,p_member uuid)
returns void language plpgsql security definer set search_path='' as $$
declare me uuid:=auth.uid(); changed integer;
begin
  if me is null then raise exception '로그인이 필요해요.'; end if;
  if not exists(select 1 from public.study_groups where id=p_group and owner_id=me) then
    raise exception '그룹 관리자만 멤버를 삭제할 수 있어요.';
  end if;
  if p_member=me then raise exception '그룹 관리자는 그룹을 삭제하거나 관리자 권한을 이전해 주세요.'; end if;
  delete from public.study_group_members where group_id=p_group and user_id=p_member;
  get diagnostics changed=row_count;
  if changed<>1 then raise exception '해당 그룹원을 찾지 못했어요.'; end if;
end $$;

create or replace function public.group_leave(p_group uuid)
returns void language plpgsql security definer set search_path='' as $$
declare me uuid:=auth.uid(); changed integer;
begin
  if me is null then raise exception '로그인이 필요해요.'; end if;
  if exists(select 1 from public.study_groups where id=p_group and owner_id=me) then
    raise exception '그룹 관리자는 권한을 이전하거나 그룹을 삭제한 뒤 나갈 수 있어요.';
  end if;
  delete from public.study_group_members where group_id=p_group and user_id=me and status='accepted';
  get diagnostics changed=row_count;
  if changed<>1 then raise exception '참여 중인 그룹이 아니에요.'; end if;
end $$;

create or replace function public.group_transfer_owner(p_group uuid,p_new_owner uuid)
returns void language plpgsql security definer set search_path='' as $$
declare me uuid:=auth.uid(); changed integer;
begin
  if me is null then raise exception '로그인이 필요해요.'; end if;
  if not exists(select 1 from public.study_groups where id=p_group and owner_id=me) then
    raise exception '그룹 관리자만 관리자 권한을 이전할 수 있어요.';
  end if;
  if p_new_owner=me or not exists(
    select 1 from public.study_group_members where group_id=p_group and user_id=p_new_owner and status='accepted'
  ) then raise exception '참여 중인 다른 그룹원을 선택해 주세요.'; end if;
  update public.study_groups set owner_id=p_new_owner where id=p_group and owner_id=me;
  get diagnostics changed=row_count;
  if changed<>1 then raise exception '관리자 권한을 이전할 수 없어요.'; end if;
end $$;

create or replace function public.group_delete(p_group uuid)
returns void language plpgsql security definer set search_path='' as $$
declare me uuid:=auth.uid(); changed integer;
begin
  if me is null then raise exception '로그인이 필요해요.'; end if;
  delete from public.study_groups where id=p_group and owner_id=me;
  get diagnostics changed=row_count;
  if changed<>1 then raise exception '그룹 관리자만 그룹을 삭제할 수 있어요.'; end if;
end $$;

create or replace function public.group_overview()
returns jsonb language plpgsql security definer set search_path='' as $$
declare me uuid:=auth.uid(); groups jsonb; invitations jsonb;
begin
  if me is null then raise exception '로그인이 필요해요.'; end if;
  select coalesce(jsonb_agg(
    jsonb_build_object(
      'id',g.id,'name',g.name,'ownerId',g.owner_id,'isOwner',g.owner_id=me,
      'createdAt',g.created_at,
      'members',(select coalesce(jsonb_agg(jsonb_build_object(
        'userId',m.user_id,'nickname',p.nickname,'isOwner',m.user_id=g.owner_id
      ) order by (m.user_id<>g.owner_id),lower(p.nickname)),'[]'::jsonb)
        from public.study_group_members m join public.friend_profiles p on p.user_id=m.user_id
        where m.group_id=g.id and m.status='accepted'),
      'pendingInvites',(case when g.owner_id=me then
        (select coalesce(jsonb_agg(jsonb_build_object('userId',m.user_id,'nickname',p.nickname) order by m.created_at),'[]'::jsonb)
         from public.study_group_members m join public.friend_profiles p on p.user_id=m.user_id
         where m.group_id=g.id and m.status='pending')
        else '[]'::jsonb end)
    ) order by g.created_at desc
  ),'[]'::jsonb) into groups
  from public.study_groups g
  join public.study_group_members mine on mine.group_id=g.id and mine.user_id=me and mine.status='accepted';

  select coalesce(jsonb_agg(jsonb_build_object(
    'id',g.id,'name',g.name,'ownerName',owner.nickname,'invitedAt',mine.created_at
  ) order by mine.created_at desc),'[]'::jsonb) into invitations
  from public.study_group_members mine
  join public.study_groups g on g.id=mine.group_id
  join public.friend_profiles owner on owner.user_id=g.owner_id
  where mine.user_id=me and mine.status='pending';

  return jsonb_build_object('groups',groups,'invitations',invitations);
end $$;

-- 1:1 친구뿐 아니라 같은 그룹에서 서로 참여를 수락한 사람도 '오늘 순공 시간'을 볼 수 있습니다.
-- 실제 1:1 친구 관계를 자동 생성하지 않으므로 그룹 탈퇴 후에는 그룹으로 연결된 공유 권한이 사라집니다.
-- 공유 끄기는 1:1 친구와 그룹에 동일하게 적용됩니다.
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
    where p.user_id=me
       or exists(select 1 from public.friend_links l where l.status='accepted'
         and ((l.user_a=me and l.user_b=p.user_id) or (l.user_b=me and l.user_a=p.user_id)))
       or exists(select 1 from public.study_group_members mine
           join public.study_group_members theirs on theirs.group_id=mine.group_id
           where mine.user_id=me and mine.status='accepted'
             and theirs.user_id=p.user_id and theirs.status='accepted');
end $$;

-- 그룹별 순위는 서버에서 계산하고 페이지별로 전달합니다. 멤버 수 제한과는 별개입니다.
create or replace function public.group_board(p_group uuid,p_offset integer default 0,p_limit integer default 15)
returns table(member_id uuid,display_name text,total_ms bigint,studying boolean,last_seen_at timestamptz,is_me boolean,shared boolean,"position" bigint)
language plpgsql security definer set search_path='' as $$
declare me uuid:=auth.uid();
begin
  if me is null then raise exception '로그인이 필요해요.'; end if;
  if not exists(select 1 from public.study_group_members
    where group_id=p_group and user_id=me and status='accepted') then
    raise exception '그룹원이 아니어서 기록을 볼 수 없어요.';
  end if;
  if p_offset is null or p_offset<0 or p_limit is null or p_limit<1 or p_limit>50 then
    raise exception '페이지 범위가 올바르지 않아요.';
  end if;
  return query
    with ranked as (
      select fb.member_id,fb.display_name,fb.total_ms,fb.studying,fb.last_seen_at,fb.is_me,fb.shared,
        case when fb.total_ms is null then null::bigint
          else rank() over(order by fb.total_ms desc nulls last) end as place
      from public.friend_board() fb
      join public.study_group_members gm on gm.user_id=fb.member_id
      where gm.group_id=p_group and gm.status='accepted'
    )
    select r.member_id,r.display_name,r.total_ms,r.studying,r.last_seen_at,r.is_me,r.shared,r.place
    from ranked r order by r.total_ms desc nulls last,r.display_name,r.member_id
    limit p_limit offset p_offset;
end $$;

revoke all on function public.group_create(text) from public,anon;
revoke all on function public.group_invite(uuid,text) from public,anon;
revoke all on function public.group_respond(uuid,boolean) from public,anon;
revoke all on function public.group_remove_member(uuid,uuid) from public,anon;
revoke all on function public.group_leave(uuid) from public,anon;
revoke all on function public.group_transfer_owner(uuid,uuid) from public,anon;
revoke all on function public.group_delete(uuid) from public,anon;
revoke all on function public.group_overview() from public,anon;
revoke all on function public.group_board(uuid,integer,integer) from public,anon;
revoke all on function public.friend_board() from public,anon;
grant execute on function public.group_create(text) to authenticated;
grant execute on function public.group_invite(uuid,text) to authenticated;
grant execute on function public.group_respond(uuid,boolean) to authenticated;
grant execute on function public.group_remove_member(uuid,uuid) to authenticated;
grant execute on function public.group_leave(uuid) to authenticated;
grant execute on function public.group_transfer_owner(uuid,uuid) to authenticated;
grant execute on function public.group_delete(uuid) to authenticated;
grant execute on function public.group_overview() to authenticated;
grant execute on function public.group_board(uuid,integer,integer) to authenticated;
grant execute on function public.friend_board() to authenticated;
commit;
