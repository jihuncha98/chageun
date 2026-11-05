import test from 'node:test';
import assert from 'node:assert/strict';
import {emptyStudy,type Entry} from '../lib/study';
import {rollupCoversRetainedRaw,studyStatisticsFromRollup} from '../lib/study-rollup';

const at=(x:string)=>Date.parse(x);
function example(){
 const s=emptyStudy();
 s.subjects.push({id:'math',name:'수학',archived:false,deleted_at:null});
 s.tasks.push({id:'task',subjectId:'math',day:'2026-11-05',title:'공부',done:false,deleted_at:null});
 return s;
}
function entry(start:string,end:string|null):Entry{
 return {id:start,taskId:'task',kind:'study',start:at(start),end:end?at(end):null,confirmed:at(start),device:'pad',napMinutes:20,deleted_at:null};
}
test('after old raw entries are pruned, the server keeps previous study time',()=>{
 const s=example();
 s.entries.push(entry('2026-11-05T01:00:00Z','2026-11-05T01:30:00Z'));
 const rows=[
  {study_day:'2026-11-03',subject_id:'math',duration_ms:3600000},
  {study_day:'2026-11-05',subject_id:'math',duration_ms:1800000}
 ];
 const now=at('2026-11-05T02:00:00Z');
 assert.equal(rollupCoversRetainedRaw(s,now,7,rows),true);
 const report=studyStatisticsFromRollup(s,now,7,rows);
 assert.equal(report.periodTotal,5400000);
 assert.equal(report.subjectTotals[0].ms,5400000);
});
test('refuse server summary missing any locally retained completed time',()=>{
 const s=example();s.entries.push(entry('2026-11-05T01:00:00Z','2026-11-05T01:30:00Z'));
 assert.equal(rollupCoversRetainedRaw(s,at('2026-11-05T02:00:00Z'),7,
  [{study_day:'2026-11-05',subject_id:'math',duration_ms:1799000}]),false);
});
test('do not double-count ongoing timer already displayed locally',()=>{
 const s=example();s.entries.push(entry('2026-11-05T01:00:00Z',null));
 const now=at('2026-11-05T01:10:00Z');
 assert.equal(rollupCoversRetainedRaw(s,now,7,[]),true);
 const report=studyStatisticsFromRollup(s,now,7,[]);
 assert.equal(report.today.ms,600000);
});
test('a server subject different from the locally retained subject is not accepted',()=>{
 const s=example();s.entries.push(entry('2026-11-05T01:00:00Z','2026-11-05T01:30:00Z'));
 assert.equal(rollupCoversRetainedRaw(s,at('2026-11-05T02:00:00Z'),7,
  [{study_day:'2026-11-05',subject_id:'other',duration_ms:3600000}]),false);
});
