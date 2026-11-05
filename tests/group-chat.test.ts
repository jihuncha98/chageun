import {PGlite} from '@electric-sql/pglite';
import {readFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
import test from 'node:test';

test('group chat membership, moderation, pagination and seven-day expiry',async()=>{
 const db=new PGlite();
 const [member,pending,admin,group]=[1,2,3,4].map(n=>'00000000-0000-0000-0000-'+String(n).padStart(12,'0'));
 try{
  await db.exec(`create role anon; create role authenticated; create schema auth;
   create table auth.users(id uuid primary key,email text,created_at timestamptz);
   create function auth.uid() returns uuid language sql as $$select current_setting('request.jwt.claim.sub',true)::uuid$$;
   create schema cron; create table cron.jobs(command text);
   create function cron.schedule(text,text,text) returns void language sql as $$insert into cron.jobs values ($3)$$;`);
  for(const file of ['001_study_workspace','002_friends','003_groups','004_admin_core','007_group_chat']){
   await db.exec(await readFile(new URL('../supabase/migrations/'+file+'.sql',import.meta.url),'utf8'));
  }
  await db.exec(`insert into auth.users(id) values ('${member}'),('${pending}'),('${admin}');
   insert into public.friend_profiles(user_id) select id from auth.users;
   insert into public.chageun_admin_identity(user_id) values ('${admin}');
   insert into public.study_groups(id,name,owner_id) values ('${group}','test','${member}');
   insert into public.study_group_members(group_id,user_id,status) values ('${group}','${member}','accepted'),('${group}','${pending}','pending');
   insert into chageun_internal.group_messages(group_id,sender,body,created_at) values ('${group}','${member}','expired',now()-interval '7 days');
   insert into chageun_internal.group_messages(group_id,sender,body) select '${group}','${member}',i::text from generate_series(1,50) i;`);
  const login=(id:string)=>db.exec(`reset role; set role authenticated; set request.jwt.claim.sub='${id}'`);
  const read=(before:string|null=null)=>db.query<{message_id:string;body:string}>('select * from public.chageun_chat_read($1,$2)',[group,before]);
  const send=()=>db.query('select public.chageun_chat_send($1,$2)',[group,'안녕']);
  await login(pending);await assert.rejects(read(),/권한/);await assert.rejects(send(),/그룹원/);
  await login(member);await send();await assert.rejects(db.query('select * from chageun_internal.group_messages'),/permission denied/);
  await login(admin);await assert.rejects(send(),/그룹원/);
  const recent=(await read()).rows;
  assert.equal(recent.length,50);assert.equal(recent[0].body,'안녕');
  assert.deepEqual((await read(recent[49].message_id)).rows.map(r=>r.body),['1']);
  await db.query('select public.chageun_admin_chat_limit($1,5,$2)',[member,'제한 테스트']);
  await login(member);await assert.rejects(send(),/제한/);assert.equal((await read()).rows.length,50);
  await db.exec('reset role');
  const command=(await db.query<{command:string}>("select command from cron.jobs where command like '%group_messages%'")).rows[0].command;
  await db.exec(command);
  assert.equal((await db.query('select id from chageun_internal.group_messages')).rows.length,51);
 }finally{await db.close();}
});
