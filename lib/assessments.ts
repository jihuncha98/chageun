import {calendarDayDifference,kstToday,validCalendarDate} from './exam-planning';
import {alive,normalize,uid,type Assessment,type Study} from './study';

const DAY_MS=86400000;
export type AssessmentNotice={id:string;assessmentId:string;subject:string;title:string;date:string;createdDate:string;daysBefore:number;label:string};
export function addCalendarDays(day:string,days:number):string {
 if(!validCalendarDate(day)||!Number.isInteger(days))throw Error('날짜를 확인해 주세요.');
 return new Date(Date.parse(day+'T00:00:00Z')+days*DAY_MS).toISOString().slice(0,10);
}
export function sortedAssessments(rows:Assessment[]):Assessment[]{
 return alive(rows).sort((a,b)=>a.date.localeCompare(b.date)||a.subject.localeCompare(b.subject)||a.title.localeCompare(b.title));
}
/** Notifications are derived, not permanently stored. A notice is visible for at most seven calendar days. */
export function assessmentNotices(rows:Assessment[],now:number):AssessmentNotice[]{
 const today=kstToday(now);
 const notices:AssessmentNotice[]=[];
 for(const item of alive(rows)){
  if(item.done||!validCalendarDate(item.date))continue;
  const registered=kstToday(Date.parse(item.createdAt));
  for(const before of [7,3,1,0]){
   const createdDate=addCalendarDays(item.date,-before);
   const age=calendarDayDifference(createdDate,now)*-1;
   if(createdDate<registered||age<0||age>=7)continue;
   notices.push({id:`assessment:${item.id}:${item.date}:${before}`,assessmentId:item.id,subject:item.subject,title:item.title,date:item.date,createdDate,daysBefore:before,label:before===0?'오늘 마감':`마감 ${before}일 전`});
  }
 }
 return notices.sort((a,b)=>b.createdDate.localeCompare(a.createdDate)||a.date.localeCompare(b.date)||a.title.localeCompare(b.title));
}
/** Mark a specific notification as read, preserving synchronization between devices. */
export function readAssessmentNotice(s:Study,id:string,now:number):void {
 const n=assessmentNotices(s.assessments,now).find(n=>n.id===id);
 if(!n)throw Error('알림을 찾지 못했어요.');
 if(!s.noticeReceipts.some(r=>r.noticeId===id&&!r.deleted_at))s.noticeReceipts.push({id:uid(),deleted_at:null,noticeId:id,readAt:new Date(now).toISOString()});
 // Read receipts older than seven days are not needed once their notices expire.
 const cutoff=now-7*DAY_MS;
 s.noticeReceipts=s.noticeReceipts.filter(r=>Date.parse(r.readAt)>=cutoff);
}
export function assessmentFormValues(subject:string,title:string,date:string){
 const cleanSubject=normalize(subject),cleanTitle=normalize(title);
 if(!cleanSubject||cleanSubject.length>80||!cleanTitle||cleanTitle.length>160||!validCalendarDate(date))throw Error('과목(80자 이내), 수행평가 이름(160자 이내), 마감일을 확인해 주세요.');
 return {subject:cleanSubject,title:cleanTitle,date};
}
