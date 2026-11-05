import test from 'node:test';
import assert from 'node:assert/strict';
import {addCalendarDays,assessmentFormValues,assessmentNotices,readAssessmentNotice,sortedAssessments} from '../lib/assessments';
import {emptyStudy,mergeStudy,normalizeStudy,validate,type Assessment,type Study} from '../lib/study';

const kst=(day:string,hour=12)=>Date.parse(`${day}T${String(hour).padStart(2,'0')}:00:00+09:00`);
function item(id:string,date='2026-11-12',createdAt='2026-11-01T13:00:00+09:00',done=false):Assessment{
 return {id,deleted_at:null,subject:'화학',title:'화학 반응 보고서',date,done,createdAt};
}

test('older workspaces upgrade without losing existing study records',()=>{
 const original=emptyStudy();original.exams.push({id:'exam',deleted_at:null,name:'기말고사',date:'2026-12-15'});
 original.tasks.push({id:'task',deleted_at:null,subjectId:'sub',day:'2026-11-05',title:'수학',done:false});
 original.subjects.push({id:'sub',deleted_at:null,name:'수학',archived:false});
 const legacy=structuredClone(original) as Partial<Study>;
 delete legacy.assessments;delete legacy.noticeReceipts;
 const upgraded=normalizeStudy(legacy as Study);
 assert.deepEqual(upgraded.assessments,[]);
 assert.deepEqual(upgraded.noticeReceipts,[]);
 assert.equal(upgraded.exams[0].name,'기말고사');
 assert.equal(upgraded.tasks[0].title,'수학');
 validate(upgraded);
});

test('assessment form validates subject, title and real calendar dates',()=>{
 assert.deepEqual(assessmentFormValues(' 화 학 ','  보고서   작성 ','2026-11-12'),{subject:'화 학',title:'보고서 작성',date:'2026-11-12'});
 assert.throws(()=>assessmentFormValues('','','2026-11-12'));
 assert.throws(()=>assessmentFormValues('물리','발표','2026-11-31'));
 assert.throws(()=>assessmentFormValues('A'.repeat(81),'발표','2026-11-12'));
});

test('assessments stay in date order even after completion toggle',()=>{
 const list=[item('done','2026-11-01','2026-10-01T00:00:00Z',true),item('later','2026-12-01'),item('soon','2026-11-09')];
 assert.deepEqual(sortedAssessments(list).map(x=>x.id),['done','soon','later']);
 list[0].done=false;assert.deepEqual(sortedAssessments(list).map(x=>x.id),['done','soon','later']);
});

test('Korean midnight changes due-date notices correctly',()=>{
 const one=[item('a')];
 assert.equal(assessmentNotices(one,kst('2026-11-04',23)).length,0);
 assert.deepEqual(assessmentNotices(one,kst('2026-11-05',0)).map(x=>x.daysBefore),[7]);
 assert.deepEqual(assessmentNotices(one,kst('2026-11-09',10)).map(x=>x.daysBefore),[3,7]);
 assert.deepEqual(assessmentNotices(one,kst('2026-11-11',23)).map(x=>x.daysBefore),[1,3,7]);
 assert.deepEqual(assessmentNotices(one,kst('2026-11-12',0)).map(x=>x.daysBefore),[0,1,3]);
 assert.deepEqual(assessmentNotices(one,kst('2026-11-19')).map(x=>x.daysBefore),[]);
});

test('newly added assessment does not backfill notices from before registration',()=>{
 const one=[item('a','2026-11-12','2026-11-10T14:00:00+09:00')];
 assert.equal(assessmentNotices(one,kst('2026-11-10')).length,0);
 assert.deepEqual(assessmentNotices(one,kst('2026-11-11')).map(x=>x.daysBefore),[1]);
});

test('completed and deleted items generate no notifications',()=>{
 const complete=item('done','2026-11-12','2026-11-01T13:00:00+09:00',true);
 const deleted=item('deleted');deleted.deleted_at='2026-11-05T00:00:00Z';
 assert.equal(assessmentNotices([complete,deleted],kst('2026-11-12')).length,0);
});

test('read receipts are synced as rows and do not modify the assignment itself',()=>{
 const s=emptyStudy();s.assessments=[item('a')];
 const id=assessmentNotices(s.assessments,kst('2026-11-05'))[0].id;
 readAssessmentNotice(s,id,kst('2026-11-05'));
 readAssessmentNotice(s,id,kst('2026-11-05'));
 assert.equal(s.noticeReceipts.length,1);
 assert.equal(s.noticeReceipts[0].noticeId,id);
 assert.equal(s.assessments[0].done,false);
 validate(s);
 const base=emptyStudy();base.assessments=[item('a')];
 const remote=structuredClone(base),local=structuredClone(base);
 remote.assessments[0].title='수정한 수행평가';
 local.noticeReceipts=structuredClone(s.noticeReceipts);
 const merged=mergeStudy(base,local,remote);
 assert.equal(merged.conflicts.length,0);
 assert.equal(merged.result.assessments[0].title,'수정한 수행평가');
 assert.equal(merged.result.noticeReceipts.length,1);
});

test('notice IDs vary with due date; old read receipt cannot hide rescheduled notice',()=>{
 const a=item('a');
 const old=assessmentNotices([a],kst('2026-11-05'))[0].id;
 a.date='2026-11-14';
 const fresh=assessmentNotices([a],kst('2026-11-07'))[0].id;
 assert.notEqual(fresh,old);
});

test('invalid assessment cannot corrupt saved study',()=>{
 const s=emptyStudy();s.assessments.push({...item('invalid'),date:'2026-02-30'});
 assert.throws(()=>validate(s),/수행평가/);
});

test('date offsets work across month, year and leap day',()=>{
 assert.equal(addCalendarDays('2026-01-01',-7),'2025-12-25');
 assert.equal(addCalendarDays('2024-03-01',-1),'2024-02-29');
});
