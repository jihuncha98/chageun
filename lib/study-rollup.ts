import {alive,dayStart,DAY,sliceDay,type Study} from './study';
import {moveStudyDay,studyStatistics,type StudyStatistics} from './statistics';

/** One row per user + study day (KST 06:00 boundary) + subject, from the RLS-protected preview table. */
export type SavedStudyRollup={study_day:string;subject_id:string;duration_ms:number};

/** Reject malformed numbers rather than silently showing an incomplete history. */
export function parseStudyRollup(rows:unknown):SavedStudyRollup[]{
 if(!Array.isArray(rows))throw Error('서버 통계 응답 형식을 확인할 수 없어요.');
 return rows.map((r:unknown)=>{
  if(!r||typeof r!=='object')throw Error('서버 통계 행 형식을 확인할 수 없어요.');
  const o=r as Record<string,unknown>;
  const ms=typeof o.duration_ms==='number'?o.duration_ms:
   typeof o.duration_ms==='string'?Number(o.duration_ms):NaN;
  if(typeof o.study_day!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(o.study_day)||
    typeof o.subject_id!=='string'||!o.subject_id||!Number.isSafeInteger(ms)||ms<0)
    throw Error('서버 통계에 유효하지 않은 값이 있어요.');
  return {study_day:o.study_day,subject_id:o.subject_id,duration_ms:ms};
 });
}

/**
 * Compute the same dashboard report using saved, completed-session totals.
 * Add ONLY the ongoing study session locally (completed sessions are already in the server rollup).
 * Tasks and notes are never changed by this function.
 */
export function studyStatisticsFromRollup(s:Study,now:number,count:7|30,rollup:readonly SavedStudyRollup[]):StudyStatistics{
 const raw=studyStatistics(s,now,count); // task counts, task completion, date range
 const points=raw.points.map(p=>({...p,ms:0,hasStudyRecord:false}));
 const dayMap=new Map(points.map(p=>[p.day,p]));
 const bySubject=new Map<string,number>();
 for(const r of rollup){
  const p=dayMap.get(r.study_day);
  if(!p)continue;
  p.ms+=r.duration_ms;
  p.hasStudyRecord=p.hasStudyRecord||r.duration_ms>0;
  bySubject.set(r.subject_id,(bySubject.get(r.subject_id)??0)+r.duration_ms);
 }
 // A running session is NOT in the server table. Split at the exact 06:00 boundary.
 for(const e of alive(s.entries)){
  if(e.kind!=='study'||e.end!==null)continue;
  const task=s.tasks.find(t=>t.id===e.taskId);
  const id=task?.subjectId??'unknown';
  for(const p of points){
   const part=sliceDay(e,p.day,now);
   const ms=Math.max(0,part.end-part.start);
   if(!ms)continue;
   p.ms+=ms;p.hasStudyRecord=true;
   bySubject.set(id,(bySubject.get(id)??0)+ms);
  }
 }
 const periodTotal=points.reduce((sum,p)=>sum+p.ms,0);
 const subjectTotals=[...bySubject].filter(([,ms])=>ms>0).map(([id,ms])=>{
  const name=s.subjects.find(x=>x.id===id)?.name??'삭제된 과목';
  return {id,name,ms,percent:periodTotal?Math.round(ms/periodTotal*100):0};
 }).sort((a,b)=>b.ms-a.ms||a.name.localeCompare(b.name,'ko'));
 const today=points[points.length-1];
 const yesterday=points[points.length-2]??raw.yesterday;
 return {...raw,points,periodTotal,subjectTotals,today,yesterday};
}

/** Phase-2 safety gate: display saved totals only when they match the still-preserved raw records. */
export function rollupMatchesRaw(s:Study,now:number,count:7|30,rows:readonly SavedStudyRollup[]):boolean{
 const raw=studyStatistics(s,now,count);
 const saved=studyStatisticsFromRollup(s,now,count,rows);
 if(raw.points.some((p,i)=>p.ms!==saved.points[i].ms))return false;
 const asMap=(items:StudyStatistics['subjectTotals'])=>new Map(items.map(t=>[t.id,t.ms]));
 const a=asMap(raw.subjectTotals),b=asMap(saved.subjectTotals);
 // When a task is missing the legacy UI uses 'missing' while SQL uses 'unknown'.
 const normalized=(m:Map<string,number>)=>{
  const n=new Map(m);if(n.has('missing')){n.set('unknown',(n.get('unknown')??0)+(n.get('missing')??0));n.delete('missing');}return n;
 };
 const x=normalized(a),y=normalized(b);
 return x.size===y.size&&[...x].every(([id,ms])=>y.get(id)===ms);
}

/** Earliest of the 30 study days shown, inclusive. */
export function rollupQueryFrom(now:number):string{
 const today=new Date(now+9*3600000-6*3600000).toISOString().slice(0,10);
 return moveStudyDay(today,-29);
}
