'use client';
import {useEffect,useRef,useState} from 'react';
import {monthDays,shiftMonth} from '../lib/month-statistics';
import {studyDay} from '../lib/study-day';
import {parseStudyRollup} from '../lib/study-rollup';
import {subjectPalette} from '../lib/subject-colors';
import {supabase} from '../lib/supabase';
import {DailySubjectChart,MonthCalendar,type StudyStatisticsPoint} from './statistics-panels';

export type StatisticsMember={id:string; name:string};

type MonthResult={month:string; points:StudyStatisticsPoint[]; error?:string};

export default function SharedStudyStatistics({member,now,onClose}:{member:StatisticsMember;now:number;onClose:()=>void}){
 const dialog=useRef<HTMLDialogElement>(null);
 const currentStudyDay=studyDay(new Date(now));
 const [month,setMonth]=useState(currentStudyDay.slice(0,7));
 const [selected,setSelected]=useState(currentStudyDay);
 const [result,setResult]=useState<MonthResult|null>(null);
 useEffect(()=>{
  const element=dialog.current;
  element?.showModal();
  return()=>{element?.close();};
 },[]);
 useEffect(()=>{
  const client=supabase;
  const controller=new AbortController();
  async function load(){
   try{
    if(!client)throw Error('서버 연결을 확인해 주세요.');
    const {data,error}=await client.rpc('chageun_shared_study_statistics',{
     p_user:member.id,p_month:month+'-01'
    }).abortSignal(controller.signal);
    if(error)throw Error(error.code==='42501'?'공개된 공부 통계가 없어요.':'공부 통계를 불러오지 못했어요.');
    const subjects=data.subjects as {id:string;name:string;colorIndex?:number}[];
    const names=new Map(subjects.map(subject=>[subject.id,subject.name]));
    const byDay=new Map<string,StudyStatisticsPoint['subjects']>();
    for(const row of parseStudyRollup(data.rows)){
     if(!row.duration_ms)continue;
     const id=row.subject_id;
     const daily=byDay.get(row.study_day)??[];
     daily.push({id,ms:row.duration_ms,name:names.get(id)??'보관된 과목',color:subjectPalette(id,subjects).solid});
     byDay.set(row.study_day,daily);
    }
    const points=monthDays(month).map(day=>{
     const subjects=(byDay.get(day)??[]).sort((a,b)=>b.ms-a.ms);
     return {day,subjects,ms:subjects.reduce((sum,subject)=>sum+subject.ms,0)};
    });
    if(!controller.signal.aborted)setResult({month,points});
   }catch(error){
    if(!controller.signal.aborted)setResult({month,points:[],error:error instanceof Error?error.message:'공부 통계를 불러오지 못했어요.'});
   }
  }
  void load();
  return()=>controller.abort();
 },[member.id,month]);
 const visible=result?.month===month?result:null;
 const point=visible?.points.find(point=>point.day===selected);
 function navigate(offset:number){
  const next=shiftMonth(month,offset);
  setResult(null);
  setMonth(next);
  setSelected(next===currentStudyDay.slice(0,7)?currentStudyDay:next+'-01');
 }
 return <dialog ref={dialog} className="shared-statistics-dialog" aria-labelledby="shared-statistics-title"
  onCancel={event=>{event.preventDefault();onClose();}}
  onClick={event=>{if(event.target===event.currentTarget){const box=event.currentTarget.getBoundingClientRect();if(event.clientX<box.left||event.clientX>box.right||event.clientY<box.top||event.clientY>box.bottom)onClose();}}}>
  <header className="shared-statistics-heading">
   <div><h2 id="shared-statistics-title">{member.name}의 공부 통계</h2><span>조회 전용</span></div>
   <button type="button" className="small" aria-label="공부 통계 닫기" onClick={onClose}>×</button>
  </header>
  {visible?.error?<p role="status" className="notice">{visible.error}</p>:<>
   <MonthCalendar month={month} points={visible?.points??[]} selected={selected} currentStudyDay={currentStudyDay} onNavigate={navigate} onSelect={setSelected}/>
   {point?<DailySubjectChart point={point}/>:<p role="status">공부 통계를 불러오는 중…</p>}
  </>}
 </dialog>;
}
