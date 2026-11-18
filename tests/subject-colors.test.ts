import test from 'node:test';
import assert from 'node:assert/strict';
import {emptyStudy,normalizeStudy} from '../lib/study';
import {daySubjects} from '../lib/month-statistics';
import {donutBackground,subjectPalette} from '../lib/subject-colors';

for (const count of [5,15,30,40,45]) {
 test(`stable badge and chart colors with ${count} subjects`,()=>{
  const day='2026-11-18';
  const data=normalizeStudy({...emptyStudy(),subjects:Array.from({length:count},(_,i)=>({
   id:`subject-${i}`,name:`과목 ${i}`,archived:false,deleted_at:null,
  }))});
  const rows=data.subjects.map(s=>({study_day:day,subject_id:s.id,duration_ms:60000}));
  const points=daySubjects(data,day,0,rows);
  assert.equal(new Set(points.map(s=>s.color)).size,Math.min(40,count));
  for(const point of points) assert.equal(point.color,subjectPalette(point.id,data.subjects).solid);
  const reduced=daySubjects({...data,subjects:[...data.subjects].reverse()},day,0,rows.slice(1));
  for(const point of reduced) assert.equal(point.color,points.find(s=>s.id===point.id)?.color);
  assert.match(donutBackground(points)!,/white .*360deg\)$/);
 });
}
