import test from 'node:test';
import assert from 'node:assert/strict';
import {emptyStudy,DAY,type Entry} from '../lib/study';
import {moveStudyDay,studyStatistics} from '../lib/statistics';

const date=(t:string)=>Date.parse(t);
const entry=(id:string,start:string,end:string,kind:'study'|'nap'='study',deleted_at:string|null=null):Entry=>({id,taskId:kind==='study'?'task':null,kind,start:date(start),end:date(end),confirmed:date(start),device:'test',napMinutes:20,deleted_at});
const setup=()=>{const s=emptyStudy();s.subjects.push({id:'math',name:'수학',archived:false,deleted_at:null});s.tasks.push({id:'task',subjectId:'math',day:'2026-11-03',title:'수학 공부',done:true,deleted_at:null});return s;};

test('KST 06:00 divides a midnight-crossing session and excludes naps',()=>{
 const s=setup();
 s.entries.push(entry('a','2026-11-02T20:30:00Z','2026-11-02T21:30:00Z')); // 05:30–06:30 KST on Nov 3
 s.entries.push(entry('n','2026-11-02T23:00:00Z','2026-11-02T23:20:00Z','nap'));
 const result=studyStatistics(s,date('2026-11-03T01:00:00Z'),7);
 assert.equal(result.today.day,'2026-11-03');assert.equal(result.today.ms,1800000);
 assert.equal(result.yesterday.day,'2026-11-02');assert.equal(result.yesterday.ms,1800000);
 assert.equal(result.periodTotal,3600000);
 assert.equal(result.subjectTotals[0].ms,3600000);
 assert.equal(result.periodDone,1);
});

test('deleted study records do not count; deleted tasks do not increase completion',()=>{
 const s=setup();s.tasks[0].deleted_at='2026-11-04T00:00:00Z';
 s.entries.push(entry('a','2026-11-03T01:00:00Z','2026-11-03T02:00:00Z','study','2026-11-04T00:00:00Z'));
 const result=studyStatistics(s,date('2026-11-03T10:00:00Z'),7);
 assert.equal(result.periodTotal,0);assert.equal(result.periodTasks,0);assert.equal(result.subjectTotals.length,0);
});

test('a completed study session is grouped by its original subject even if task archived/deleted',()=>{
 const s=setup();s.subjects[0].archived=true;s.tasks[0].deleted_at='2026-11-04T00:00:00Z';
 s.entries.push(entry('a','2026-11-03T01:00:00Z','2026-11-03T02:00:00Z'));
 const result=studyStatistics(s,date('2026-11-03T10:00:00Z'),7);
 assert.equal(result.subjectTotals[0].name,'수학');assert.equal(result.subjectTotals[0].percent,100);
});

test('today statistics update with an active timer, not the future',()=>{
 const s=setup();const active=entry('a','2026-11-03T01:00:00Z','2026-11-03T01:00:00Z');active.end=null;s.entries.push(active);
 const at=date('2026-11-03T01:20:00Z');const result=studyStatistics(s,at,7);
 assert.equal(result.today.ms,20*60000);assert.equal(result.periodTotal,20*60000);
});

test('month and leap-day boundaries are calculated as Korean calendar days',()=>{
 assert.equal(moveStudyDay('2028-03-01',-1),'2028-02-29');
 assert.equal(moveStudyDay('2026-01-01',-1),'2025-12-31');
 const r=studyStatistics(setup(),date('2026-01-01T05:00:00Z'),30);
 assert.equal(r.points.length,30);assert.equal(r.points[29].day,'2026-01-01');
 assert.equal(r.points[0].day,moveStudyDay('2026-01-01',-29));
 assert.equal(DAY,86400000);
});

test('subject totals and daily points add up across period boundary',()=>{
 const s=setup();s.entries.push(entry('a','2026-10-28T20:30:00Z','2026-10-28T21:30:00Z'));
 const r=studyStatistics(s,date('2026-11-03T05:00:00Z'),7);
 assert.equal(r.periodTotal,r.points.reduce((sum,p)=>sum+p.ms,0));
 assert.equal(r.periodTotal,r.subjectTotals.reduce((sum,p)=>sum+p.ms,0));
});
