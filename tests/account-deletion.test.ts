import {PGlite} from '@electric-sql/pglite';
import {readFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
import test from 'node:test';

test('withdrawal and admin deletion preserve other members and transfer ownership',async()=>{
 const db=new PGlite();
 const [admin,owner,other,group]=[1,2,3,4].map(n=>'00000000-0000-0000-0000-'+String(n).padStart(12,'0'));
 try{
  await db.exec(`create role anon; create role authenticated; create schema auth;
   create table auth.users(id uuid primary key,email text,created_at timestamptz,raw_user_meta_data jsonb);
   create function auth.uid() returns uuid language sql as $$select current_setting('request.jwt.claim.sub',true)::uuid$$;`);
  for(const file of ['001_study_workspace','002_friends','003_groups','004_admin_core','005_admin_display_name','006_account_deletion']){
   await db.exec(await readFile(new URL('../supabase/migrations/'+file+'.sql',import.meta.url),'utf8'));
  }
  await db.exec(`create table chageun_internal.workspace_precleanup_backup(user_id uuid);
   insert into auth.users(id,email) values ('${admin}','admin@test'),('${owner}','owner@test'),('${other}','other@test');
   insert into public.chageun_admin_identity(user_id) values ('${admin}');
   insert into public.friend_profiles(user_id) select id from auth.users;
   insert into public.study_workspaces(user_id) select id from auth.users;
   insert into chageun_internal.workspace_precleanup_backup select id from auth.users;
   create table public.study_daily_rollup_durable(user_id uuid references auth.users(id) on delete cascade,duration_ms bigint);
   insert into public.study_daily_rollup_durable values ('${owner}',1000),('${other}',9000);
   insert into public.friend_links(user_a,user_b,requested_by,status) values ('${owner}','${other}','${owner}','accepted');
   insert into public.study_groups(id,name,owner_id) values ('${group}','test','${owner}');
   insert into public.study_group_members(group_id,user_id,status) values ('${group}','${owner}','accepted'),('${group}','${other}','accepted');
   set role authenticated; set request.jwt.claim.sub='${owner}';`);
  const remove=(target:string,email:string)=>db.query('select public.chageun_delete_account($1,$2,$3)',[target,email,'삭제 요청']);
  await assert.rejects(remove(other,'other@test'),/관리자 권한/);
  await assert.rejects(remove(owner,'wrong'),/이메일/);
  await remove(owner,'owner@test');
  await db.exec('reset role');
  assert.deepEqual((await db.query('select owner_id from public.study_groups')).rows,[{owner_id:other}]);
  assert.deepEqual((await db.query('select user_id,duration_ms::int from public.study_daily_rollup_durable')).rows,[{user_id:other,duration_ms:9000}]);
  assert.equal((await db.query('select * from public.friend_links')).rows.length,0);
  for(const table of ['public.study_workspaces','chageun_internal.workspace_precleanup_backup']){
   assert.deepEqual((await db.query('select user_id from '+table+' order by user_id')).rows,[{user_id:admin},{user_id:other}]);
  }
  await db.exec(`set role authenticated; set request.jwt.claim.sub='${admin}'`);
  await assert.rejects(remove(admin,'admin@test'),/관리자 계정/);
  await remove(other,'other@test');
  await db.exec('reset role');
  assert.deepEqual((await db.query('select id from auth.users')).rows,[{id:admin}]);
  assert.equal((await db.query('select id from public.study_groups')).rows.length,0);
 }finally{await db.close();}
});
