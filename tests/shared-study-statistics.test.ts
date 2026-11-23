import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import test from 'node:test';
import {PGlite} from '@electric-sql/pglite';

test('shared statistics automatically share monthly totals within accepted relationships',async()=>{
 const db=new PGlite();
 const [owner,friend,member,pending,stranger,group]=[1,2,3,4,5,6].map(n=>`00000000-0000-0000-0000-${String(n).padStart(12,'0')}`);
 try{
  await db.exec(`
   create role anon; create role authenticated;
   create schema auth; create table auth.users(id uuid primary key);
   create function auth.uid() returns uuid language sql as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
  `);
  for(const name of ['001_study_workspace','002_friends','003_groups']){
   await db.exec(await readFile(`supabase/migrations/${name}.sql`,'utf8'));
  }
  await db.exec(`
   create table public.study_daily_rollup_durable(user_id uuid,study_day date,subject_id text,duration_ms bigint);
   insert into auth.users values ('${owner}'),('${friend}'),('${member}'),('${pending}'),('${stranger}');
   insert into public.friend_profiles(user_id) select id from auth.users;
   insert into public.friend_links(user_a,user_b,requested_by,status) values
    ('${owner}','${friend}','${owner}','accepted'),('${owner}','${pending}','${owner}','pending');
   insert into public.study_groups(id,owner_id,name) values ('${group}','${owner}','스터디');
   insert into public.study_group_members(group_id,user_id,status) values
    ('${group}','${owner}','accepted'),('${group}','${member}','accepted'),('${group}','${pending}','pending');
   alter table public.study_workspaces disable trigger user;
   insert into public.study_workspaces(user_id,data) values ('${owner}', '{
     "subjects":[{"id":"private","name":"미사용 과목","colorIndex":0},{"id":"math","name":"수학","colorIndex":0},
       {"id":"english","name":"영어","colorIndex":"invalid"},{"id":"history","name":"한국사","colorIndex":5}],
     "notes":[{"text":"개인 메모"}],"tasks":[{"title":"미공개 할 일"}],"entries":[{"start":1000}]
   }');
   insert into public.study_daily_rollup_durable values
    ('${owner}','2026-10-31','math',60000),('${owner}','2026-11-01','math',3600000),
    ('${owner}','2026-11-23','english',1800000),('${owner}','2026-11-23','history',600000),
    ('${owner}','2026-12-01','math',60000),('${friend}','2026-11-23','math',900000);
  `);
  const migration=await readFile('supabase/migrations/016_shared_study_statistics.sql','utf8');
  await db.exec(migration);
  const automatic=await readFile('supabase/migrations/017_automatic_study_statistics.sql','utf8');
  await db.exec(automatic);
  const viewer=(id:string)=>db.exec(`set role authenticated; set request.jwt.claim.sub='${id}'`);
  const read=(month='2026-11-01')=>db.query('select public.chageun_shared_study_statistics($1,$2) as value',[owner,month]);
  const change=(enabled:boolean)=>db.query('select public.chageun_statistics_sharing($1) as enabled',[enabled]);

  await viewer(friend);
  await assert.rejects(db.query('update public.friend_profiles set share_statistics=true'),/permission denied/);
  await viewer(owner);
  assert.deepEqual((await db.query('select public.chageun_statistics_sharing() as enabled')).rows,[{enabled:false}]);
  await db.exec('reset role');
  await db.query('update public.friend_profiles set share_enabled=false where user_id in ($1,$2)',[owner,friend]);

  for(const id of [friend,member]){
   await viewer(id);
   assert.deepEqual((await read()).rows,[{value:{
    rows:[
     {study_day:'2026-11-01',subject_id:'math',duration_ms:3600000},
     {study_day:'2026-11-23',subject_id:'english',duration_ms:1800000},
     {study_day:'2026-11-23',subject_id:'history',duration_ms:600000}
    ],
    subjects:[{id:'math',name:'수학',colorIndex:1},{id:'english',name:'영어',colorIndex:2},{id:'history',name:'한국사',colorIndex:5}]
   }}]);
   await assert.rejects(read('2026-11-15'),/조회할 월/);
  }
  for(const id of [pending,stranger,owner]){
   await viewer(id);
   await assert.rejects(read(),/친구 또는 같은 그룹원/);
  }
  await db.exec('reset role; set role anon');
  await assert.rejects(read(),/permission denied/);
  await db.exec('reset role');
  await db.exec(automatic);
  await viewer(owner);
  await change(true);
  await change(false);
  await viewer(friend);
  assert.equal((await read()).rows.length,1);
  await db.exec('reset role');
  await db.query('delete from public.friend_links where user_a=$1 and user_b=$2',[owner,friend]);
  await db.query('delete from public.study_group_members where group_id=$1 and user_id=$2',[group,member]);
  for(const id of [friend,member]){
   await viewer(id);
   await assert.rejects(read(),/친구 또는 같은 그룹원/);
  }
 }finally{
  await db.close();
 }
});
