import {alive,sliceDay,type Study} from './study';
import type {SavedStudyRollup} from './study-rollup';

import {assignSubjectColors,subjectPalette} from './subject-colors';
export function monthDays(month:string){
 const [year,m]=month.split('-').map(Number);
 return Array.from({length:new Date(Date.UTC(year,m,0)).getUTCDate()},(_,i)=>month+'-'+String(i+1).padStart(2,'0'));
}
export function shiftMonth(month:string,offset:number){
 const [year,m]=month.split('-').map(Number);
 return new Date(Date.UTC(year,m-1+offset,1)).toISOString().slice(0,7);
}
export function daySubjects(data:Study,day:string,now:number,rows:SavedStudyRollup[]|null,base:Study|null=null){
 const finished=new Map<string,number>(),running=new Map<string,number>();
 for(const e of alive(data.entries)){
  if(e.kind!=='study')continue;
  const part=sliceDay(e,day,now),ms=part.end-part.start;
  if(ms<=0)continue;
  const id=data.tasks.find(t=>t.id===e.taskId)?.subjectId??'unknown';
  const target=e.end===null?running:finished;
  target.set(id,(target.get(id)??0)+ms);
 }
 const saved=new Map((rows??[]).filter(r=>r.study_day===day).map(r=>[r.subject_id,r.duration_ms]));
 // Apply pending edits as differences against the last synced workspace. Archived
 // sessions may already have been pruned locally and must remain in monthly totals.
 const original=new Map<string,number>();
 if(base)for(const e of alive(base.entries)){
  if(e.kind!=='study'||e.end===null)continue;
  const part=sliceDay(e,day,now),id=base.tasks.find(t=>t.id===e.taskId)?.subjectId??'unknown';
  if(part.end>part.start)original.set(id,(original.get(id)??0)+part.end-part.start);
 }
 const reference=base?original:finished;
 const values=rows&&[...reference].every(([id,ms])=>(saved.get(id)??0)>=ms)?saved:finished;
 if(base&&values===saved){
  for(const [id,ms] of original)values.set(id,(values.get(id)??0)-ms);
  for(const [id,ms] of finished)values.set(id,(values.get(id)??0)+ms);
 }
 for(const [id,ms] of running)values.set(id,(values.get(id)??0)+ms);
 const subjects=assignSubjectColors(data.subjects);
 return [...values].filter(([,ms])=>ms>0).map(([id,ms])=>({
  id,ms,color:subjectPalette(id,subjects).solid,
  name:subjects.find(subject=>subject.id===id)?.name??'보관된 과목',
 })).sort((a,b)=>b.ms-a.ms);
}
