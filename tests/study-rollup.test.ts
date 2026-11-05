import test from 'node:test';
import assert from 'node:assert/strict';
import {emptyStudy,type Entry} from '../lib/study';
import {studyStatistics,moveStudyDay} from '../lib/statistics';
import {parseStudyRollup,rollupQueryFrom,studyStatisticsFromRollup,rollupMatchesRaw} from '../lib/study-rollup';

const at=(t:string)=>Date.parse(t);
function fixture(){
 const s=emptyStudy();
 s.subjects.push({id:'math',name:'수학',archived:false,deleted_at:null});
 s.tasks.push({id:'task',subjectId:'math',day:'2026-11-05',title:'미적분',done:false,deleted_at:null});
 return s;
}
function entry(start:string,end:string|null):Entry{
 return {id:start,taskId:'task',kind:'study',start:at(start),end:end===null?null:at(end),confirmed:at(start),device:'pc',napMinutes:20,deleted_at:null};
}
test('saved stats match raw with a completed session crossing the 06:00 study-day boundary',()=>{
 const s=fixture();s.entries.push(entry('2026-11-04T20:30:00Z','2026-11-04T21:30:00Z'));
 const rows=[
  {study_day:'2026-11-04',subject_id:'math',duration_ms:1800000},
  {study_day:'2026-11-05',subject_id:'math',duration_ms:1800000}
 ];
 assert.equal(rollupMatchesRaw(s,at('2026-11-05T01:00:00Z'),7,rows),true);
 const r=studyStatisticsFromRollup(s,at('2026-11-05T01:00:00Z'),7,rows);
 assert.equal(r.today.ms,1800000);assert.equal(r.yesterday.ms,1800000);
 assert.equal(r.periodTotal,3600000);assert.equal(r.subjectTotals[0].ms,3600000);
});
test('ongoing study timer is added on top of completed server totals once',()=>{
 const s=fixture();s.entries.push(entry('2026-11-05T00:00:00Z','2026-11-05T00:10:00Z'));
 s.entries.push(entry('2026-11-05T00:12:00Z',null));
 const now=at('2026-11-05T00:14:00Z');
 const rows=[{study_day:'2026-11-05',subject_id:'math',duration_ms:600000}];
 assert.equal(rollupMatchesRaw(s,now,7,rows),true);
 const result=studyStatisticsFromRollup(s,now,7,rows);
 assert.equal(result.today.ms,720000);assert.equal(result.periodTotal,720000);
 assert.equal(result.subjectTotals[0].ms,720000);
});
test('server rollup contains historical study even if the raw old entry is absent',()=>{
 const s=fixture();const now=at('2026-11-06T01:00:00Z');
 const rows=[{study_day:'2026-11-04',subject_id:'math',duration_ms:4200000}];
 const old=studyStatistics(s,now,7);
 const restored=studyStatisticsFromRollup(s,now,7,rows);
 assert.equal(old.periodTotal,0);assert.equal(restored.periodTotal,4200000);
 // Phase 2 must refuse to apply this to a live account until archive cutover is ready.
 assert.equal(rollupMatchesRaw(s,now,7,rows),false);
});
test('a mismatching saved total never passes the phase-2 safety gate',()=>{
 const s=fixture();s.entries.push(entry('2026-11-05T00:00:00Z','2026-11-05T01:00:00Z'));
 assert.equal(rollupMatchesRaw(s,at('2026-11-05T02:00:00Z'),7,
  [{study_day:'2026-11-05',subject_id:'math',duration_ms:3599000}]),false);
});
test('malformed and unsafe server totals are rejected',()=>{
 assert.deepEqual(parseStudyRollup([{study_day:'2026-11-05',subject_id:'math',duration_ms:'60000'}]),[{study_day:'2026-11-05',subject_id:'math',duration_ms:60000}]);
 for(const bad of [-1,1.2,Number.MAX_SAFE_INTEGER+1,'garbage',null]){
  assert.throws(()=>parseStudyRollup([{study_day:'2026-11-05',subject_id:'math',duration_ms:bad}]));
 }
});
test('query range uses KST 06:00 rather than midnight and handles month changes',()=>{
 assert.equal(rollupQueryFrom(at('2026-11-04T20:59:59Z')),moveStudyDay('2026-11-04',-29));
 assert.equal(rollupQueryFrom(at('2026-11-04T21:00:00Z')),moveStudyDay('2026-11-05',-29));
});
