-- 차근 DB v0 → v1. 기존 로그인 계정은 유지합니다. SQL Editor에서 전체 실행.
begin;
create table if not exists public.study_workspaces (
 user_id uuid primary key references auth.users(id) on delete cascade,
 revision bigint not null default 0,
 data jsonb not null default '{"schema":1,"subjects":[],"tasks":[],"entries":[],"lessons":[],"notes":[]}'::jsonb,
 updated_at timestamptz not null default now()
);
create table if not exists public.study_operations (
 user_id uuid not null references auth.users(id) on delete cascade,
 id uuid not null,
 revision bigint not null,
 created_at timestamptz not null default now(),
 primary key(user_id,id)
);
alter table public.study_workspaces enable row level security;
alter table public.study_operations enable row level security;
drop policy if exists own_workspace on public.study_workspaces;
create policy own_workspace on public.study_workspaces for all to authenticated using ((select auth.uid())=user_id) with check ((select auth.uid())=user_id);
drop policy if exists own_operation on public.study_operations;
create policy own_operation on public.study_operations for all to authenticated using ((select auth.uid())=user_id) with check ((select auth.uid())=user_id);
revoke all on public.study_workspaces, public.study_operations from anon, authenticated;
grant select, insert, update on public.study_workspaces to authenticated;
grant select, insert on public.study_operations to authenticated;

create or replace function public.validate_study_workspace() returns trigger
language plpgsql security invoker set search_path = '' as $$
declare d jsonb := new.data; k text; x jsonb; ids text[]; a jsonb; b jsonb; started numeric; ended numeric;
begin
 if jsonb_typeof(d) is distinct from 'object' or d->>'schema' is distinct from '1' then raise exception 'INVALID_SCHEMA'; end if;
 if octet_length(d::text)>5000000 then raise exception 'WORKSPACE_TOO_LARGE'; end if;
 foreach k in array array['subjects','tasks','entries','lessons','notes'] loop
  if jsonb_typeof(d->k) is distinct from 'array' then raise exception 'INVALID_COLLECTION'; end if;
  ids := array[]::text[];
  for x in select value from jsonb_array_elements(d->k) loop
   if jsonb_typeof(x) is distinct from 'object' or coalesce(x->>'id','')='' or (x->>'id')=any(ids) or not (x ? 'deleted_at') then raise exception 'INVALID_ROW'; end if;
   ids:=array_append(ids,x->>'id');
   if x->>'deleted_at' is not null then perform (x->>'deleted_at')::timestamptz; end if;
  end loop;
 end loop;
 for x in select value from jsonb_array_elements(d->'subjects') loop
  if length(trim(coalesce(x->>'name',''))) not between 1 and 80 or jsonb_typeof(x->'archived') is distinct from 'boolean' then raise exception 'INVALID_SUBJECT'; end if;
 end loop;
 if exists(select 1 from jsonb_array_elements(d->'subjects') subj where subj->>'deleted_at' is null group by lower(regexp_replace(subj->>'name','\s','','g')) having count(*)>1) then raise exception 'DUPLICATE_SUBJECT'; end if;
 for x in select value from jsonb_array_elements(d->'tasks') loop
  perform (x->>'day')::date;
  if x->>'day' is null or length(trim(coalesce(x->>'title',''))) not between 1 and 300 or jsonb_typeof(x->'done') is distinct from 'boolean' or not exists(select 1 from jsonb_array_elements(d->'subjects') s where s->>'id'=x->>'subjectId') then raise exception 'INVALID_TASK'; end if;
 end loop;
 if (select count(*) from jsonb_array_elements(d->'entries') e where e->>'deleted_at' is null and e->>'end' is null)>1 then raise exception 'MULTIPLE_ACTIVE_TIMERS'; end if;
 for x in select value from jsonb_array_elements(d->'entries') loop
  if x->>'kind' is null or x->>'kind' not in ('study','nap') or jsonb_typeof(x->'start') is distinct from 'number' or not (x ? 'end') or jsonb_typeof(x->'confirmed') is distinct from 'number' then raise exception 'INVALID_ENTRY'; end if;
  started:=(x->>'start')::numeric; ended:=(x->>'end')::numeric;
  if started<0 or started>extract(epoch from now())*1000+300000 or ended<started or ended>extract(epoch from now())*1000+300000 then raise exception 'INVALID_TIME'; end if;
  if x->>'kind'='study' and not exists(select 1 from jsonb_array_elements(d->'tasks') t where t->>'id'=x->>'taskId') then raise exception 'MISSING_TASK'; end if;
  if x->>'deleted_at' is null and ended is null and x->>'kind'='study' and exists(select 1 from jsonb_array_elements(d->'tasks') t where t->>'id'=x->>'taskId' and ((t->>'done')::boolean or t->>'deleted_at' is not null)) then raise exception 'INACTIVE_TASK_TIMER'; end if;
 end loop;
 -- Half-open intervals allow an exact stop/start transition without overlap.
 a:=null;
 for b in select value from jsonb_array_elements(d->'entries') e where e->>'deleted_at' is null order by (e->>'start')::numeric loop
  if a is not null and (b->>'start')::numeric<coalesce((a->>'end')::numeric,1e30) then raise exception 'OVERLAPPING_TIME'; end if;
  a:=b;
 end loop;
 for x in select value from jsonb_array_elements(d->'lessons') loop
  if x->>'deleted_at' is not null then continue; end if;
  if not (x ?& array['weekday','start','end','label','room']) or (x->>'weekday')::int not between 0 and 6 or x->>'start' !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' or x->>'end' !~ '^(([01][0-9]|2[0-3]):[0-5][0-9]|24:00)$' or x->>'start'>=x->>'end' or trim(x->>'label')='' then raise exception 'INVALID_LESSON'; end if;
 end loop;
 if exists(select 1 from jsonb_array_elements(d->'lessons') la cross join jsonb_array_elements(d->'lessons') lb where la->>'id'<lb->>'id' and la->>'deleted_at' is null and lb->>'deleted_at' is null and la->>'weekday'=lb->>'weekday' and la->>'start'<lb->>'end' and lb->>'start'<la->>'end') then raise exception 'OVERLAPPING_LESSONS'; end if;
 for x in select value from jsonb_array_elements(d->'notes') loop
  perform (x->>'day')::date;
  if x->>'day' is null or length(coalesce(x->>'text',''))>10000 then raise exception 'INVALID_NOTE'; end if;
 end loop;
 if tg_op='UPDATE' then new.revision:=old.revision+1; else new.revision:=0; end if;
 new.updated_at:=now();return new;
end $$;
revoke all on function public.validate_study_workspace() from public, anon, authenticated;
drop trigger if exists validate_workspace on public.study_workspaces;
create trigger validate_workspace before insert or update on public.study_workspaces for each row execute function public.validate_study_workspace();

create or replace function public.save_study_workspace(expected_revision bigint, operation_id uuid, new_data jsonb)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare u uuid:=auth.uid(); w public.study_workspaces;
begin
 if u is null then raise exception 'LOGIN_REQUIRED'; end if;
 insert into public.study_workspaces(user_id) values(u) on conflict(user_id) do nothing;
 select * into w from public.study_workspaces where user_id=u for update;
 if exists(select 1 from public.study_operations where user_id=u and id=operation_id) then return jsonb_build_object('ok',true,'workspace',to_jsonb(w)); end if;
 if expected_revision<>w.revision or expected_revision is null then return jsonb_build_object('ok',false,'workspace',to_jsonb(w)); end if;
 update public.study_workspaces set data=new_data where user_id=u returning * into w;
 insert into public.study_operations(user_id,id,revision) values(u,operation_id,w.revision);
 return jsonb_build_object('ok',true,'workspace',to_jsonb(w));
end $$;
revoke all on function public.save_study_workspace(bigint,uuid,jsonb) from public, anon;
grant execute on function public.save_study_workspace(bigint,uuid,jsonb) to authenticated;
do $$ begin
 if exists(select 1 from pg_publication where pubname='supabase_realtime') and not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='study_workspaces') then alter publication supabase_realtime add table public.study_workspaces; end if;
end $$;
commit;
