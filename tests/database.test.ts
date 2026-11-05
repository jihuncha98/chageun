import {PGlite} from '@electric-sql/pglite';
import {readFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
import test from 'node:test';
test('database upgrade, ownership and timer constraints', async()=>{
const db=new PGlite();
await db.exec(`create role anon;create role authenticated;create schema auth;create table auth.users(id uuid primary key);create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;grant usage on schema auth to authenticated;grant execute on function auth.uid() to authenticated;insert into auth.users values('00000000-0000-0000-0000-000000000001'),('00000000-0000-0000-0000-000000000002');`);
const sql=await readFile(new URL('../supabase/migrations/001_study_workspace.sql',import.meta.url),'utf8');
await db.exec(sql);await db.exec(sql);
const login=async(n:number)=>db.exec(`reset role;set role authenticated;set request.jwt.claim.sub='00000000-0000-0000-0000-${String(n).padStart(12,'0')}';`);
const blank:import('../lib/study').Study={schema:1,subjects:[],tasks:[],entries:[],lessons:[],notes:[],exams:[],assessments:[],noticeReceipts:[]};
const op=(n:number)=>`10000000-0000-0000-0000-${String(n).padStart(12,'0')}`;
async function save(rev:number,n:number,data:unknown=blank){return (await db.query<{result:{ok:boolean;workspace:{revision:number}}}>('select public.save_study_workspace($1,$2,$3) as result',[rev,op(n),JSON.stringify(data)])).rows[0].result;}
await login(1);let res=await save(0,1);assert.equal(res.ok,true);assert.equal(res.workspace.revision,1);
res=await save(0,1);assert.equal(res.ok,true);assert.equal(res.workspace.revision,1);
res=await save(0,2);assert.equal(res.ok,false);assert.equal(res.workspace.revision,1);
await login(2);assert.equal((await db.query('select * from public.study_workspaces')).rows.length,0);await save(0,3);
await db.exec(`update public.study_workspaces set data='${JSON.stringify(blank)}' where user_id='00000000-0000-0000-0000-000000000001';`);
assert.equal((await db.query('select * from public.study_operations')).rows.length,1);
await assert.rejects(db.exec(`insert into public.study_workspaces(user_id) values('00000000-0000-0000-0000-000000000003')`));
await login(1);assert.equal((await db.query<{revision:number}>('select revision from public.study_workspaces')).rows[0].revision,1);
const d=structuredClone(blank);d.subjects=[{id:'s',name:'수학',archived:false,deleted_at:null}];d.tasks=[{id:'t',day:'2026-01-01',title:'할 일',subjectId:'s',done:false,deleted_at:null}];const ent=(id:string,a:number,b:number|null):import('../lib/study').Entry=>({id,kind:'study',taskId:'t',start:a,end:b,confirmed:a,device:'pc',napMinutes:20,deleted_at:null});d.entries=[ent('e',1000,2000)];res=await save(1,4,d);assert.equal(res.ok,true);
d.entries.push(ent('bad',1500,3000));await assert.rejects(save(2,5,d),/OVERLAPPING_TIME/);d.entries=[ent('e',1000,null),ent('b',2000,null)];await assert.rejects(save(2,6,d),/MULTIPLE_ACTIVE_TIMERS/);d.entries=[ent('e',1000,null)];d.tasks[0].done=true;await assert.rejects(save(2,7,d),/INACTIVE_TASK_TIMER/);
await db.exec('reset role;set role anon');await assert.rejects(db.query('select * from public.study_workspaces'));await assert.rejects(save(0,8));
console.log('PASS: migration rerun, authenticated RLS isolation, anonymous denial, operation idempotency, stale revision rejection, interval validation, active task consistency');await db.close();

});
