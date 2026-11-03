import {alive,DAY,dayStart,nextDay,total,type Study} from './study';
import {studyDay} from './study-day';

/** Statistics use the same KST 06:00–06:00 study day as the timer. */
export function moveStudyDay(day:string,offset:number):string {
 const at=dayStart(day)+offset*DAY;
 return new Date(at+9*3600000).toISOString().slice(0,10);
}
export type StudyPoint={day:string;ms:number;hasStudyRecord:boolean;tasks:number;done:number};
export type SubjectTotal={id:string;name:string;ms:number;percent:number};
export type StudyStatistics={
 points:StudyPoint[];periodTotal:number;periodTasks:number;periodDone:number;
 subjectTotals:SubjectTotal[];today:StudyPoint;yesterday:StudyPoint;startDay:string;endDay:string;
};

function hasRecord(s:Study,day:string,now:number):boolean {
 const lo=dayStart(day),hi=lo+DAY;
 return alive(s.entries).some(e=>e.kind==='study'&&e.start<hi&&(e.end??now)>lo);
}
export function studyStatistics(s:Study,now:number,count:7|30):StudyStatistics {
 const today=studyDay(new Date(now));
 const points:StudyPoint[]=Array.from({length:count},(_,i)=>{
  const day=moveStudyDay(today,i-count+1);
  const tasks=alive(s.tasks).filter(t=>t.day===day);
  return {day,ms:total(s,day,now),hasStudyRecord:hasRecord(s,day,now),tasks:tasks.length,done:tasks.filter(t=>t.done).length};
 });
 const from=dayStart(points[0].day),until=Math.min(dayStart(nextDay(today)),now);
 const times=new Map<string,{name:string;ms:number}>();
 for(const e of alive(s.entries)){
  if(e.kind!=='study')continue;
  const clipped=Math.max(0,Math.min(e.end??now,until)-Math.max(e.start,from));
  if(clipped===0)continue;
  const task=s.tasks.find(t=>t.id===e.taskId);
  const sub=s.subjects.find(x=>x.id===task?.subjectId);
  const id=sub?.id??'missing';const name=sub?.name??'삭제된 과목';
  const group=times.get(id)??{name,ms:0};group.ms+=clipped;times.set(id,group);
 }
 const periodTotal=points.reduce((sum,p)=>sum+p.ms,0);
 const subjectTotals=[...times].map(([id,v])=>({id,name:v.name,ms:v.ms,percent:periodTotal?Math.round(v.ms/periodTotal*100):0})).sort((a,b)=>b.ms-a.ms||a.name.localeCompare(b.name,'ko'));
 const periodTasks=points.reduce((sum,p)=>sum+p.tasks,0);
 const periodDone=points.reduce((sum,p)=>sum+p.done,0);
 const previous=moveStudyDay(today,-1);
 const prevTasks=alive(s.tasks).filter(t=>t.day===previous);
 return {
  points,periodTotal,periodTasks,periodDone,subjectTotals,
  today:points[points.length-1],
  yesterday:{day:previous,ms:total(s,previous,now),hasStudyRecord:hasRecord(s,previous,now),tasks:prevTasks.length,done:prevTasks.filter(t=>t.done).length},
  startDay:points[0].day,endDay:today,
 };
}
