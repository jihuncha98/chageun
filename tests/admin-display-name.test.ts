import {PGlite} from '@electric-sql/pglite';
import {readFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
import test from 'node:test';

test('표시 이름 변경 권한, 동시 변경 보호, 친구 별명 보존 및 알림',async()=>{
 const db=new PGlite();
 const admin='00000000-0000-0000-0000-000000000001';
 const member='00000000-0000-0000-0000-000000000002';
 try {
  await db.exec(`create role anon; create role authenticated; create schema auth;
   create table auth.users(id uuid primary key, email text, created_at timestamptz, updated_at timestamptz, raw_user_meta_data jsonb);
   create function auth.uid() returns uuid language sql as $$ select current_setting('request.jwt.claim.sub', true)::uuid $$;
   insert into auth.users(id,raw_user_meta_data) values ('${admin}',null),('${member}','{"theme":"blue"}');
   create table public.friend_profiles(user_id uuid, nickname text, friend_code text);
   insert into public.friend_profiles values ('${member}','친구별명','CODE');
   create table public.study_groups(id uuid,name text,owner_id uuid,created_at timestamptz);
   create table public.study_group_members(group_id uuid,user_id uuid,status text,joined_at timestamptz);`);
  for(const file of ['004_admin_core.sql','005_admin_display_name.sql']){
   await db.exec(await readFile(new URL('../supabase/migrations/'+file,import.meta.url),'utf8'));
  }
  await db.exec(`insert into public.chageun_admin_identity(user_id) values ('${admin}'); set role anon;`);
  const change=(expected:string|null)=>db.query('select public.chageun_admin_set_display_name($1,$2,$3,$4)',[member,' 새   이름 ',expected,'회원 요청']);
  await assert.rejects(change(null),/permission denied/);
  await db.exec(`reset role; set role authenticated; set request.jwt.claim.sub='${member}';`);
  await assert.rejects(change(null),/관리자 권한/);
  await db.exec(`set request.jwt.claim.sub='${admin}';`);
  await change(null);
  await assert.rejects(change(null),/표시 이름이 바뀌었어요/);
  await change('새 이름');
  const dashboard=(await db.query<{result:{users:{id:string;displayName:string;nickname:string}[]}}>('select public.chageun_admin_dashboard() as result')).rows[0].result;
  const row=dashboard.users.find(user=>user.id===member);
  assert.equal(row?.nickname,'친구별명');
  assert.equal(row?.displayName,'새 이름');
  await db.exec('reset role');
  assert.deepEqual((await db.query('select raw_user_meta_data from auth.users where id=$1',[member])).rows,[{raw_user_meta_data:{theme:'blue',chageun_display_name:'새 이름'}}]);
  assert.deepEqual((await db.query('select user_id from public.chageun_admin_notices')).rows,[{user_id:member}]);
  assert.deepEqual((await db.query('select action from public.chageun_admin_audit')).rows,[{action:'display_name_changed'}]);
 } finally { await db.close(); }
});
