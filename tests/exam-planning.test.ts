import test from 'node:test';
import assert from 'node:assert/strict';
import {calendarDayDifference,ddayLabel,kstToday,monthCells,moveCalendarMonth,taskProgress,validCalendarDate} from '../lib/exam-planning';
import {emptyStudy,mergeStudy,validate} from '../lib/study';

test('D-day changes at Seoul midnight, not at 06:00 study-day boundary',()=>{
 const before=Date.parse('2026-11-03T14:59:59Z'); // KST 23:59:59
 const after=Date.parse('2026-11-03T15:00:00Z'); // KST 00:00:00 Nov 4
 assert.equal(kstToday(before),'2026-11-03');
 assert.equal(kstToday(after),'2026-11-04');
 assert.equal(ddayLabel('2026-11-04',before),'D-1');
 assert.equal(ddayLabel('2026-11-04',after),'D-day');
 assert.equal(ddayLabel('2026-11-03',after),'D+1');
 assert.equal(calendarDayDifference('2027-01-01',Date.parse('2026-12-31T15:00:00Z')),0);
});

test('dates and month calendar handle leap years and year boundary',()=>{
 assert.equal(validCalendarDate('2028-02-29'),true);
 assert.equal(validCalendarDate('2027-02-29'),false);
 assert.equal(validCalendarDate('2026-11-31'),false);
 assert.equal(moveCalendarMonth('2026-12',1),'2027-01');
 assert.equal(moveCalendarMonth('2027-01',-1),'2026-12');
 const cells=monthCells('2028-02');
 assert.equal(cells.filter(Boolean).length,29);
 assert.equal(cells.filter(Boolean)[28],'2028-02-29');
 assert.equal(cells.length%7,0);
});

test('subject completion uses task counts and excludes deleted tasks',()=>{
 const task=(id:string,done:boolean,deleted_at:string|null=null)=>({id,done,deleted_at,day:'2026-11-04',title:'할 일',subjectId:'math'});
 assert.deepEqual(taskProgress([]),{total:0,done:0,percent:null});
 assert.deepEqual(taskProgress([task('a',true),task('b',false),task('c',true,'2026-11-03T00:00:00Z')]),{total:2,done:1,percent:50});
});

test('schema-1 workspace accepts exams, rejects invalid and duplicated exams',()=>{
 const s=emptyStudy();
 s.exams.push({id:'e',name:'기말고사',date:'2026-12-15',deleted_at:null});
 validate(s);
 s.exams.push({id:'e',name:'모의고사',date:'2026-12-17',deleted_at:null});
 assert.throws(()=>validate(s),/중복된 기록/);
 s.exams[1].id='e2';s.exams[1].date='2026-02-30';
 assert.throws(()=>validate(s),/시험 이름과 날짜/);
});

test('independent exam updates merge across devices without deleting school data',()=>{
 const base=emptyStudy();
 base.lessons.push({id:'l',weekday:1,start:'08:00',end:'09:00',label:'학교',room:'교실',deleted_at:null});
 const local=structuredClone(base);
 const remote=structuredClone(base);
 local.exams.push({id:'e1',name:'중간고사',date:'2027-05-10',deleted_at:null});
 remote.exams.push({id:'e2',name:'기말고사',date:'2027-07-10',deleted_at:null});
 const merged=mergeStudy(base,local,remote);
 assert.equal(merged.conflicts.length,0);
 assert.equal(merged.result.exams.length,2);
 assert.deepEqual(merged.result.lessons,base.lessons);
 validate(merged.result);
});
