import {PGlite} from '@electric-sql/pglite';
import {readFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
import test from 'node:test';
test('push targets, private subscriptions, queue leases, retries and account cleanup',async()=>{
 const db=new PGlite();
 const [a,b,c]=[1,2,3].map(n=>'00000000-0000-0000-0000-'+String(n).padStart(12,'0'));
 try{
  await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;
   create schema chageun_internal;create schema auth;create schema net;
   create table auth.users(id uuid primary key,created_at timestamptz default now()-interval '1 day');
   create table public.chageun_broadcasts(id uuid primary key default gen_random_uuid(),target_user_id uuid,active boolean default true,published_at timestamptz default now());
   create function net.http_post(url text,headers jsonb,body jsonb,timeout_milliseconds integer) returns bigint language sql as $$select 1::bigint$$;
   insert into auth.users(id) values ('${a}'),('${b}'),('${c}');`);
  let sql=await readFile(new URL('../supabase/migrations/012_web_push.sql',import.meta.url),'utf8');
  sql=sql.replace('CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;','');
  sql=sql.slice(0,sql.lastIndexOf('DO $$'))+'COMMIT;';
  await db.exec(sql);await db.exec(sql);
  await db.exec(`insert into public.chageun_push_devices(endpoint,user_id,subscription)
   values ('https://web.push.apple.com/a','${a}','{}'),('https://web.push.apple.com/b','${b}','{}');
   insert into public.chageun_broadcasts(target_user_id) values ('${a}');
   insert into public.chageun_broadcasts(target_user_id) values (null);
   set role authenticated;`);
  await assert.rejects(db.query('select * from public.chageun_push_devices'),/permission denied/);
  await assert.rejects(db.query("select public.chageun_push_config('public','private')"),/permission denied/);
  await assert.rejects(db.query('select * from public.chageun_push_claim()'),/permission denied/);
  await db.exec('reset role;set role service_role');
  const config=(await db.query("select public.chageun_push_config('public','private') as config")).rows;
  assert.deepEqual((await db.query("select public.chageun_push_config('other','other') as config")).rows,config);
  const queue=await db.query<{endpoint:string}>('select * from public.chageun_push_claim()');
  assert.equal(queue.rows.length,3);
  assert.equal(queue.rows.filter(r=>r.endpoint.endsWith('/a')).length,2);
  assert.equal((await db.query('select * from public.chageun_push_claim()')).rows.length,0);
  await db.query("update public.chageun_push_queue set available_at=now()-interval '3 minutes' where endpoint=$1",['https://web.push.apple.com/a']);
  assert.equal((await db.query('select * from public.chageun_push_claim()')).rows.length,2);
  await assert.rejects(db.query('select public.chageun_push_test($1,$2)',['https://web.push.apple.com/a',b]),/1분/);
  await db.query('select public.chageun_push_test($1,$2)',['https://web.push.apple.com/a',a]);
  await assert.rejects(db.query('select public.chageun_push_test($1,$2)',['https://web.push.apple.com/a',a]),/1분/);
  await db.exec(`reset role;delete from auth.users where id='${a}'`);
  assert.deepEqual((await db.query('select user_id from public.chageun_push_devices')).rows,[{user_id:b}]);
  assert.equal((await db.query('select * from public.chageun_push_queue')).rows.length,1);
 }finally{await db.close();}
});
