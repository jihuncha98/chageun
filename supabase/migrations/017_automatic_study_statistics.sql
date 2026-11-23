begin;

-- Historical study totals are shared automatically within accepted relationships.
create or replace function public.chageun_shared_study_statistics(p_user uuid, p_month date)
returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  viewer uuid := auth.uid();
  next_month date;
begin
  if viewer is null or p_user is null or viewer = p_user
    or not (
      exists (
        select 1 from public.friend_links
        where user_a = least(viewer, p_user) and user_b = greatest(viewer, p_user)
          and status = 'accepted'
      )
      or exists (
        select 1 from public.study_group_members mine
        join public.study_group_members theirs using (group_id)
        where mine.user_id = viewer and theirs.user_id = p_user
          and mine.status = 'accepted' and theirs.status = 'accepted'
      )
    )
  then
    raise exception '친구 또는 같은 그룹원의 공부 통계만 볼 수 있어요.' using errcode = '42501';
  end if;

  if p_month is null or not isfinite(p_month)
    or extract(day from p_month) <> 1
    or p_month < date '0001-01-01' or p_month >= date '9999-12-01'
  then
    raise exception '조회할 월을 확인해 주세요.' using errcode = '22023';
  end if;

  next_month := (p_month + interval '1 month')::date;
  return (
    with rollup as (
      select study_day, subject_id, duration_ms
      from public.study_daily_rollup_durable
      where user_id = p_user and study_day >= p_month and study_day < next_month and duration_ms > 0
    ), workspace_subjects as (
      select subject.item, subject.position,
        case when jsonb_typeof(subject.item->'colorIndex') = 'number' then
          case when (subject.item->>'colorIndex')::numeric between 0 and 9007199254740991
            and mod((subject.item->>'colorIndex')::numeric, 1) = 0
          then (subject.item->>'colorIndex')::numeric::bigint end
        end as color_index
      from public.study_workspaces w
      cross join lateral jsonb_array_elements(w.data->'subjects') with ordinality as subject(item, position)
      where w.user_id = p_user
    ), ranked_subjects as (
      select *, row_number() over (partition by color_index order by position) as slot_use
      from workspace_subjects
    ), missing_colors as (
      select position, row_number() over (order by position) as slot
      from ranked_subjects where color_index is null or slot_use > 1
    ), unused_colors as (
      select candidate, row_number() over (order by candidate) as slot
      from generate_series(0::bigint, (select count(*) from workspace_subjects)) as candidates(candidate)
      where not exists (select 1 from workspace_subjects where color_index = candidate)
    )
    select jsonb_build_object(
      'rows', coalesce((select jsonb_agg(to_jsonb(r) order by study_day, subject_id) from rollup r), '[]'::jsonb),
      'subjects', coalesce((
        select jsonb_agg(jsonb_build_object(
          'id', s.item->>'id', 'name', s.item->>'name',
          'colorIndex', coalesce(c.candidate, s.color_index)
        ) order by s.position)
        from ranked_subjects s
        left join missing_colors m using (position)
        left join unused_colors c using (slot)
        where exists (select 1 from rollup r where r.subject_id = s.item->>'id')
      ), '[]'::jsonb)
    )
  );
end;
$$;

revoke all on function public.chageun_shared_study_statistics(uuid, date) from public, anon;
grant execute on function public.chageun_shared_study_statistics(uuid, date) to authenticated;

notify pgrst, 'reload schema';
commit;
