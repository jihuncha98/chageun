'use client';
import {DailySubjectChart,MonthCalendar} from './statistics-panels';
import {useEffect,useState} from 'react';
import {alive,duration,localInput,sliceDay,type Entry,type Study} from '../lib/study';
import {pageCount,pageItems,pageNumbers,RECORDS_PER_PAGE,safePage} from '../lib/pagination';
import {monthDays,shiftMonth,daySubjects} from '../lib/month-statistics';
import {supabase} from '../lib/supabase';
import {parseStudyRollup,type SavedStudyRollup} from '../lib/study-rollup';
import {moveStudyDay} from '../lib/statistics';
import {studyDay} from '../lib/study-day';

export default function StudyStatistics({userId,data,base,now,review,pending,busy,onEditEntry,onStopEntry,onDeleteEntry}:{userId:string;data:Study;base:Study;now:number;review:boolean;pending:boolean;busy:boolean;onEditEntry:(entry:Entry)=>void;onStopEntry:(entry:Entry)=>void;onDeleteEntry:(entry:Entry)=>void}){
 const [monthChoice,setMonth]=useState<string|null>(null);
 const [selected,setSelected]=useState<string|null>(null);
 const [recordPage,setRecordPage]=useState(1);
 const [recordDate,setRecordDate]=useState('');
 // The server keeps completed study facts even after old detail entries are pruned.
 // Archive records are only trusted when they cover the locally retained details.
 const [rollupState,setRollupState]=useState<{source:Study;month:string;rows:SavedStudyRollup[]}|null>(null);
 const [rollupError,setRollupError]=useState('');
 const currentStudyDay=studyDay(new Date(now));
 const month=monthChoice??currentStudyDay.slice(0,7);
 const days=monthDays(month);
 const queryFrom=moveStudyDay(days[0],-1),queryTo=days[days.length-1];
 useEffect(()=>{

  let canceled=false;
  const load=async()=>{
   if(!supabase){if(!canceled)setRollupError('서버 연결을 확인해 주세요.');return;}
   try{
    const collected:unknown[]=[];
    // Supabase/PostgREST commonly caps one query at 1,000 rows. Paginate rather than truncate.
    for(let offset=0;offset<10000;offset+=1000){
     const {data:rows,error}=await supabase.from('study_daily_rollup_durable')
      .select('study_day,subject_id,duration_ms').eq('user_id',userId)
      .gte('study_day',queryFrom).lte('study_day',queryTo)
      .order('study_day',{ascending:true}).order('subject_id',{ascending:true})
      .range(offset,offset+999);
     if(error)throw Error(error.message);
     if(!rows)throw Error('서버에서 통계 정보를 받지 못했어요.');
     collected.push(...rows);
     if(rows.length<1000)break;
     if(offset>=9000)throw Error('서버 통계가 너무 많아 조회를 중단했어요.');
    }
    if(!canceled){setRollupState({source:base,month,rows:parseStudyRollup(collected)});setRollupError('');}
   }catch(e){if(!canceled){setRollupState(null);setRollupError(e instanceof Error?e.message:'서버 통계를 읽지 못했어요.');}}
  };
  // React effect 안에서 동기적으로 setState를 호출하지 않고 조회를 예약해요.
  const timer=setTimeout(()=>{void load();},0);
  return()=>{canceled=true;clearTimeout(timer);};
 },[base,userId,month,queryTo,queryFrom]);
 const rows=rollupState?.month===month&&rollupState.source===base?rollupState.rows:null;
 const points=days.map(day=>{
  const subjects=daySubjects(data,day,now,rows,pending?base:null);
  return {day,subjects,ms:subjects.reduce((n,s)=>n+s.ms,0)};
 });
 const point=points.find(p=>p.day===(selected??currentStudyDay))??points[0];
 const yesterday=daySubjects(data,moveStudyDay(currentStudyDay,-1),now,rows,pending?base:null).reduce((sum,s)=>sum+s.ms,0);
 const today=points.find(p=>p.day===currentStudyDay);
 const monthTasks=alive(data.tasks).filter(t=>t.day.startsWith(month+'-'));
 const total=points.reduce((n,p)=>n+p.ms,0);
 function navigate(offset:number){const next=shiftMonth(month,offset);setMonth(next);setSelected(next===currentStudyDay.slice(0,7)?currentStudyDay:next+'-01');}
 // This list only reflects detailed entries still kept by the server after midnight cleanup.
 const records=alive(data.entries).filter(e=>!recordDate||Math.max(0,sliceDay(e,recordDate,now).end-sliceDay(e,recordDate,now).start)>0).sort((a,b)=>b.start-a.start||a.id.localeCompare(b.id));
 const totalRecordPages=pageCount(records.length);
 const actualRecordPage=safePage(recordPage,totalRecordPages);
 const visibleRecords=pageItems(records,actualRecordPage);
 const pageShortcuts=pageNumbers(actualRecordPage,totalRecordPages);
 const taskName=(e:Entry)=>e.kind==='nap'?'쪽잠':data.tasks.find(t=>t.id===e.taskId)?.title??'보관된 할 일';
 const subjectName=(e:Entry)=>{const task=data.tasks.find(t=>t.id===e.taskId);return data.subjects.find(subject=>subject.id===task?.subjectId)?.name??'과목';};
 return <div className="statistics-view">
  {review?<p className="notice error">겹치는 기록을 아래 목록에서 확인해 주세요. 해결하면 통계가 표시돼요.</p>:<div className="month-layout">
   <MonthCalendar month={month} points={points} selected={point.day} currentStudyDay={currentStudyDay} onNavigate={navigate} onSelect={setSelected}/><div><section className="card"><h2>월간 요약</h2><div className="month-summary"><div>총 순공<strong>{duration(total)}</strong></div><div>공부한 날<strong>{points.filter(p=>p.ms>0).length}일</strong></div></div><details><summary>학습 요약 더 보기</summary><p>할 일 완료 {monthTasks.filter(t=>t.done).length} / {monthTasks.length}</p>{today&&<p>오늘 순공 {duration(today.ms)} · 어제 대비 {yesterday?(today.ms>=yesterday?'+':'−')+duration(Math.abs(today.ms-yesterday)):'비교할 기록 없음'}</p>}</details></section>
   <DailySubjectChart point={point}/></div>
   {(pending||!rows)&&<p role="status">{pending?'기기 기록 기준 · 동기화 대기 중':rollupError||'보관된 월간 기록을 확인하고 있어요.'}</p>}</div>}
  <section className="card below" aria-label="측정 기록 목록">
   <div className="section-title"><div><h2>측정 기록 목록</h2><p className="fine">오늘·어제의 개별 측정 기록만 보관해요(한국 시간 자정 기준). 한 페이지에 {RECORDS_PER_PAGE}개씩 표시해요.</p></div><span className="fine">전체 {records.length}개</span></div>
   <div className="record-filters"><label>학습일별 조회<input aria-label="기록 조회 학습일" type="date" value={recordDate} onChange={e=>{setRecordDate(e.target.value);setRecordPage(1);}}/></label><button className="small" type="button" onClick={()=>{setRecordDate('');setRecordPage(1);}} disabled={!recordDate}>전체 날짜 보기</button></div>
   {records.length===0?<p className="empty">{recordDate?'선택한 학습일에 측정 기록이 없어요.':'아직 측정 기록이 없어요.'}</p>:<>
    {visibleRecords.map(e=><div className="record-row" key={e.id}><div className="record-details"><strong>{taskName(e)}</strong><p>{e.kind==='nap'?'쪽잠 · ':`${subjectName(e)} · `}{localInput(e.start).replace('T',' ')} → {e.end===null?'측정 중':localInput(e.end).replace('T',' ')} · {duration((e.end??now)-e.start)}</p></div><div className="actions">{e.end===null?<button type="button" className="small" disabled={busy} onClick={()=>onStopEntry(e)}>종료</button>:<button type="button" className="small" onClick={()=>onEditEntry(e)}>시간 수정</button>}<button type="button" className="small" disabled={busy} onClick={()=>onDeleteEntry(e)}>휴지통</button></div></div>)}
    <nav className="record-pagination" aria-label="측정 기록 페이지 이동"><button type="button" className="small" onClick={()=>setRecordPage(1)} disabled={actualRecordPage===1}>« 처음</button><button type="button" className="small" onClick={()=>setRecordPage(actualRecordPage-1)} disabled={actualRecordPage===1}>‹ 이전</button>{pageShortcuts.map(n=><button type="button" key={n} className="small record-page-number" aria-current={actualRecordPage===n?'page':undefined} aria-label={`${n}페이지`} onClick={()=>setRecordPage(n)}>{n}</button>)}<button type="button" className="small" onClick={()=>setRecordPage(actualRecordPage+1)} disabled={actualRecordPage===totalRecordPages}>다음 ›</button><button type="button" className="small" onClick={()=>setRecordPage(totalRecordPages)} disabled={actualRecordPage===totalRecordPages}>끝 »</button></nav>
    <p className="fine record-page-caption">{actualRecordPage} / {totalRecordPages}페이지 · {records.length}개 기록 중 {(actualRecordPage-1)*RECORDS_PER_PAGE+1}–{Math.min(records.length,actualRecordPage*RECORDS_PER_PAGE)}번째</p>
   </>}
  </section>
 </div>;
}
