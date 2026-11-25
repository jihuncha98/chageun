import test from 'node:test';
import assert from 'node:assert/strict';
import {PGlite} from '@electric-sql/pglite';
import {readFile} from 'node:fs/promises';
import {monthDays,daySubjects,shiftMonth} from '../lib/month-statistics';
import {emptyStudy} from '../lib/study';

test('calendar dates, distinct subject slices and durable history',()=>{
 assert.equal(monthDays('2024-02').length,29);
 assert.equal(shiftMonth('2026-12',1),'2027-01');
 const rows=Array.from({length:15},(_,n)=>({study_day:'2026-11-17',subject_id:'sub'+n,duration_ms:30000}));
 const points=daySubjects(emptyStudy(),'2026-11-17',0,rows);
 assert.equal(new Set(points.map(p=>p.color)).size,15);
 assert.equal(points.reduce((n,p)=>n+p.ms,0),450000);
});
test('shop transactions, launch cutoff, day cap, adjustments, permissions and replay',async()=>{
 const db=new PGlite();
 const admin='00000000-0000-0000-0000-000000000001',member='00000000-0000-0000-0000-000000000002';
 try{
 await db.exec(`create role authenticated;create role anon;create schema auth;create schema chageun_internal;
 create table auth.users(id uuid primary key);insert into auth.users values ('${admin}'),('${member}');
 create function auth.uid() returns uuid language sql as $$select current_setting('request.jwt.claim.sub',true)::uuid$$;
 create function chageun_internal.admin_require() returns uuid language plpgsql as $$begin if auth.uid()<>'${admin}' then raise exception 'admin only';end if;return auth.uid();end$$;
 create function public.chageun_visible_names(uuid[]) returns table(user_id uuid,display_name text) language sql as $$select auth.uid(),'me'::text$$;
 create table public.study_group_members(group_id uuid,user_id uuid,status text);
 create function public.friend_board() returns table(member_id uuid,total_ms bigint,studying boolean,shared boolean) language sql as $$select auth.uid(),0::bigint,false,true$$;
 create table public.study_session_facts(user_id uuid,entry_id text,start_ms bigint,end_ms bigint,is_deleted boolean default false,primary key(user_id,entry_id));`);
 const migration=await readFile(new URL('../supabase/migrations/013_shop.sql',import.meta.url),'utf8');
 await db.exec(migration);await db.exec(migration);
 const expansion=await readFile(new URL('../supabase/migrations/018_title_expansion.sql',import.meta.url),'utf8');
 await db.exec(expansion);
 const login=(id:string)=>db.exec(`reset role;set role authenticated;set request.jwt.claim.sub='${id}'`);
 const act=(action:string,item:string|null,target:string|null,n:number|null,options={},id=crypto.randomUUID())=>db.query('select public.chageun_shop_change($1,$2,$3,$4,$5,$6,$7)',[id,action,item,target,n,'테스트',JSON.stringify(options)]);
 const state=async()=>(await db.query<{balance:number;items:{id:string;owned:boolean;equipped:boolean}[]}>("select (j->>'balance')::int balance,j->'items' items from public.chageun_shop_read() j")).rows[0];
 await login(member);await assert.rejects(act('credit',null,member,10),/admin only/);
 await login(admin);await act('catalog','title2',admin,50,{active:true,label:'새내기'});await act('rule',null,admin,1,{cap:60});
 await db.exec("reset role;update chageun_internal.shop_rules set starts='2026-11-17T05:59:50+09:00'");
 const t=Date.parse('2026-11-17T06:00:00+09:00');
 await db.query("insert into public.study_session_facts values($1,'a',$2,$3,false)",[member,t-20000,t+100000]);
 await login(member);assert.equal((await state()).balance,70);
 const req=crypto.randomUUID();await act('buy','title2',null,null,{},req);await act('buy','title2',null,null,{},req);
 assert.equal((await state()).balance,20);await assert.rejects(act('buy','title2',null,null),/구매/);
 await db.query('reset role');await db.query('update public.study_session_facts set end_ms=$1',[t+10000]);
 await login(member);assert.equal((await state()).balance,-30);assert((await state()).items.find(i=>i.id==='title2')?.equipped);
 await db.exec('reset role;update public.study_session_facts set is_deleted=true');await login(member);assert.equal((await state()).balance,-50);
 await db.exec('reset role;update public.study_session_facts set is_deleted=false');await login(member);assert.equal((await state()).balance,-30);
 await login(admin);await act('revoke_item','title2',member,null);await login(member);assert((await state()).items.find(i=>i.id==='title1')?.equipped);
 await assert.rejects(act('buy','title8',null,null),/이전 칭호/);
 await login(admin);await act('credit',null,member,12530);await act('grant_item','title7',member,null);
 await login(member);await assert.rejects(act('buy','title9',null,null),/이전 칭호/);
 for(const id of ['title8','title9','title10']){
  await act('buy',id,null,null);
  assert((await state()).items.find(i=>i.id===id)?.equipped);
 }
 assert.equal((await state()).balance,0);
 const social=()=>db.query('select title,title_level from public.chageun_social_title_labels($1)',[[member]]);
 assert.deepEqual((await social()).rows,[{title:'차지훈',title_level:10}]);
 await login(admin);await act('catalog','title10',admin,7000,{active:true,label:'새 이름'});
 await db.exec('reset role');await db.exec(expansion);
 await login(member);
 assert.deepEqual((await social()).rows,[{title:'새 이름',title_level:10}]);
 assert((await state()).items.some(i=>i.id==='title10'&&i.owned&&i.equipped));
 }finally{await db.close();}
});

test('pending correction preserves pruned historical minutes for the same subject',()=>{
 const base=emptyStudy();
 const t=Date.parse('2026-11-17T08:00:00+09:00');
 base.entries.push({id:'1',taskId:null,kind:'study',start:t,end:t+60000,confirmed:t,device:'a',napMinutes:0,deleted_at:null});
 const work=structuredClone(base);work.entries[0].end=t+30000;
 const saved=[{study_day:'2026-11-17',subject_id:'unknown',duration_ms:360000}];
 assert.equal(daySubjects(work,'2026-11-17',t+90000,saved,base)[0].ms,330000);
});
