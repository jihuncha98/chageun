-- Read only. Compare the existing service totals to the baseline immediately after migration.
select jsonb_build_object('accounts',(select count(*) from auth.users),
 'workspaces',(select count(*) from public.study_workspaces),
 'groups',(select count(*) from public.study_groups),
 'friends',(select count(*) from public.friend_links),
 'study_ms',(select sum(duration_ms) from public.study_daily_rollup_durable),
 'new_shop_installed',to_regprocedure('public.chageun_shop_read(uuid,bigint)') is not null,
 'settlement_trigger',(select tgenabled from pg_trigger where tgrelid='public.study_session_facts'::regclass and tgname='chageun_shop_settlement')
) as totals;
