-- Read only. Return this result before applying 013_shop.
select jsonb_build_object(
 'facts_columns',(select jsonb_object_agg(column_name,data_type) from information_schema.columns where table_schema='public' and table_name='study_session_facts'),
 'fact_triggers',(select jsonb_agg(pg_get_triggerdef(oid)) from pg_trigger where tgrelid=to_regclass('public.study_session_facts') and not tgisinternal),
 'workspace_triggers',(select jsonb_agg(pg_get_triggerdef(oid)) from pg_trigger where tgrelid=to_regclass('public.study_workspaces') and not tgisinternal),
 'admin_check',to_regprocedure('chageun_internal.admin_require()') is not null,
 'visible_names',to_regprocedure('public.chageun_visible_names(uuid[])') is not null,
 'credit_installed',to_regprocedure('public.chageun_shop_read(uuid,bigint)') is not null,
 'client_can_change_facts',(select bool_or(has_table_privilege(r.rolname,c.oid,'INSERT,UPDATE,DELETE,TRUNCATE')) from pg_roles r,pg_class c where r.rolname in ('anon','authenticated') and c.oid=to_regclass('public.study_session_facts')),
 'chat_job',(select jsonb_agg(jsonb_build_object('active',active,'command',command)) from cron.job where jobname='chageun-group-chat-expiry')
) as schema_check;
