import {monthDays} from '../lib/month-statistics';
import {duration} from '../lib/study';
import {donutBackground} from '../lib/subject-colors';

export type StudyStatisticsPoint = {
 day: string;
 ms: number;
 subjects: {id:string; name:string; color:string; ms:number}[];
};

export function MonthCalendar({month, points, selected, currentStudyDay, onNavigate, onSelect}:{
 month:string; points:StudyStatisticsPoint[]; selected:string; currentStudyDay:string;
 onNavigate:(offset:number)=>void; onSelect:(day:string)=>void;
}){
 const firstDay=new Date(monthDays(month)[0]+'T00:00:00Z').getUTCDay();
 return <section className="card month-calendar">
  <header>
   <button type="button" className="small" aria-label="이전 달" onClick={()=>onNavigate(-1)}>‹</button>
   <h2>{Number(month.slice(0,4))}년 {Number(month.slice(5))}월</h2>
   <button type="button" className="small" aria-label="다음 달" onClick={()=>onNavigate(1)}>›</button>
  </header>
  <div className="month-grid">
   {Array.from('일월화수목금토').map(day=><strong key={day}>{day}</strong>)}
   {Array.from({length:firstDay},(_,i)=><span key={i}/>)}
   {points.map(point=><button type="button" key={point.day} aria-current={point.day===currentStudyDay?'date':undefined}
    aria-pressed={point.day===selected} onClick={()=>onSelect(point.day)}>
    <b>{Number(point.day.slice(8))}</b><small>{point.ms?duration(point.ms).split(':').slice(0,2).join(':'):'·'}</small>
   </button>)}
  </div>
 </section>;
}

export function DailySubjectChart({point}:{point:StudyStatisticsPoint}){
 return <section className="card below">
  <h2>{Number(point.day.slice(5,7))}월 {Number(point.day.slice(8))}일 공부 분석</h2>
  <div className="subject-analysis">
   <div className="study-donut" style={{background:donutBackground(point.subjects)}}><strong>{duration(point.ms)}</strong></div>
   <div>
    {point.subjects.map(subject=><p key={subject.id}><i style={{background:subject.color}}/>
     {subject.name} · {duration(subject.ms)} · {Math.round(100*subject.ms/point.ms)}%</p>)}
    {!point.ms&&<p>공부 기록이 없어요.</p>}
   </div>
  </div>
 </section>;
}
