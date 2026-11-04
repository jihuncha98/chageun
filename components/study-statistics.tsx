'use client';
import {useMemo,useState} from 'react';
import {alive,duration,localInput,sliceDay,type Entry,type Study} from '../lib/study';
import {pageCount,pageItems,pageNumbers,RECORDS_PER_PAGE,safePage} from '../lib/pagination';
import {studyStatistics,type StudyPoint} from '../lib/statistics';

const label=(day:string)=>`${Number(day.slice(5,7))}/${Number(day.slice(8,10))}`;
const longTime=duration;

export default function StudyStatistics({data,now,review,pending,busy,onEditEntry,onStopEntry,onDeleteEntry}:{data:Study;now:number;review:boolean;pending:boolean;busy:boolean;onEditEntry:(entry:Entry)=>void;onStopEntry:(entry:Entry)=>void;onDeleteEntry:(entry:Entry)=>void}){
 const [range,setRange]=useState<7|30>(7);
 const [selected,setSelected]=useState<string|null>(null);
 const [recordPage,setRecordPage]=useState(1);
 const [recordDate,setRecordDate]=useState('');
 const report=useMemo(()=>studyStatistics(data,now,range),[data,now,range]);
 const selectedDay=selected&&report.points.some(p=>p.day===selected)?selected:report.endDay;
 const point=report.points.find(p=>p.day===selectedDay) as StudyPoint;
 const dailyTasks=alive(data.tasks).filter(t=>t.day===selectedDay);
 const note=alive(data.notes).find(n=>n.day===selectedDay);
 const max=Math.max(1,...report.points.map(p=>p.ms));
 const delta=report.today.ms-report.yesterday.ms;
 // The history covers all saved dates, not merely the 7/30 day chart window.
 const records=alive(data.entries).filter(e=>!recordDate||Math.max(0,sliceDay(e,recordDate,now).end-sliceDay(e,recordDate,now).start)>0).sort((a,b)=>b.start-a.start||a.id.localeCompare(b.id));
 const totalRecordPages=pageCount(records.length);
 const actualRecordPage=safePage(recordPage,totalRecordPages);
 const visibleRecords=pageItems(records,actualRecordPage);
 const pageShortcuts=pageNumbers(actualRecordPage,totalRecordPages);
 const taskName=(e:Entry)=>e.kind==='nap'?'쪽잠':data.tasks.find(t=>t.id===e.taskId)?.title??'보관된 할 일';
 const subjectName=(e:Entry)=>{const task=data.tasks.find(t=>t.id===e.taskId);return data.subjects.find(subject=>subject.id===task?.subjectId)?.name??'과목';};
 return <div className="statistics-view">
  <section className="card">
   <div className="section-title"><div><h2>공부 통계</h2><p>한국 시간 오전 6시부터 다음 날 오전 6시까지를 하루로 계산해요.</p></div><div className="stats-range" role="group" aria-label="조회 기간"><button className="small" aria-pressed={range===7} onClick={()=>{setRange(7);setSelected(null);}}>최근 7일</button><button className="small" aria-pressed={range===30} onClick={()=>{setRange(30);setSelected(null);}}>최근 30일</button></div></div>
   {pending&&<p className="notice">아직 서버에 보내지 않은 기록이 있어요. 이 통계는 현재 기기 기준이에요.</p>}
   {review?<p role="alert" className="notice error">겹치거나 충돌한 기록이 있어 통계 합계를 숨겼어요. 아래 측정 기록 목록에서 시간을 수정하거나 중복 기록을 휴지통으로 옮겨 주세요.</p>:<>
    <div className="stats-overview">
     <div><span>기간 누적 순공</span><strong>{longTime(report.periodTotal)}</strong><small>{report.startDay} ~ {report.endDay}</small></div>
     <div><span>할 일 완료</span><strong>{report.periodTasks?`${report.periodDone} / ${report.periodTasks}`:'계획 없음'}</strong><small>{report.periodTasks?`완료율 ${Math.round(report.periodDone/report.periodTasks*100)}%`:'할 일을 추가해 보세요.'}</small></div>
     <div><span>오늘 순공</span><strong>{longTime(report.today.ms)}</strong><small>오늘은 진행 중</small></div>
     <div><span>어제 대비</span><strong>{report.yesterday.hasStudyRecord?`${delta>=0?'+':'−'}${longTime(Math.abs(delta))}`:'비교 불가'}</strong><small>{report.yesterday.hasStudyRecord?'오늘 진행 중인 시간과 비교':'어제 순공 기록 없음'}</small></div>
    </div>
   </>}
  </section>
  {!review&&<>
   <section className="card below">
    <div className="section-title"><h2>날짜별 순공 시간</h2><span className="fine">막대를 누르면 해당 날짜의 계획을 볼 수 있어요.</span></div>
    <div className="stats-chart-scroller"><div className="stats-chart" style={{gridTemplateColumns:`repeat(${report.points.length},minmax(${range===7?62:58}px,1fr))`}}>
     {report.points.map(p=><button type="button" className={`stats-day ${p.day===selectedDay?'selected':''}`} key={p.day} aria-pressed={p.day===selectedDay} aria-label={`${p.day} 순공 ${longTime(p.ms)}`} onClick={()=>setSelected(p.day)}>
      <span className="stats-time-caption">{duration(p.ms)}</span><span className="stats-bar-track"><span className="stats-bar-fill" style={{height:`${p.ms?Math.max(4,Math.round(p.ms/max*100)):0}%`}}/></span><span className="stats-date-caption">{label(p.day)}</span>
     </button>)}
    </div></div>
   </section>
   <div className="stats-bottom">
    <section className="card below"><h2>과목별 공부 시간</h2><p className="fine">최근 {range}학습일 · 실제 측정한 순공만 합산</p>{report.subjectTotals.length===0?<p className="empty">이 기간에 공부 기록이 없어요.</p>:report.subjectTotals.map(s=><div className="subject-stat" key={s.id}><div className="subject-stat-head"><strong>{s.name}</strong><span>{longTime(s.ms)} · {s.percent}%</span></div><div className="progress-track" role="progressbar" aria-label={`${s.name} 시간 비중`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={s.percent}><div className="progress-fill" style={{width:`${s.percent}%`}}/></div></div>)}</section>
    <section className="card below"><h2>{selectedDay} 기록</h2><p className="fine">순공 {longTime(point.ms)} · 할 일 완료 {point.done}/{point.tasks}</p>{dailyTasks.length===0?<p>이날 등록된 할 일이 없어요.</p>:<div className="stats-task-list">{dailyTasks.map(t=><div className="record-row" key={t.id}><span>{t.done?'✓':'○'} {data.subjects.find(s=>s.id===t.subjectId)?.name??'과목'} · {t.title}</span><span className="fine">{t.done?'완료':'진행 전'}</span></div>)}</div>}
    {note?.text&&<div className="stats-note"><strong>하루 메모</strong><p>{note.text}</p></div>}<p className="fine">시간을 수정하거나 삭제하려면 아래 측정 기록 목록을 이용해 주세요.</p></section>
   </div>
  </>}
  <section className="card below" aria-label="측정 기록 목록">
   <div className="section-title"><div><h2>측정 기록 목록</h2><p className="fine">전체 기간의 기록을 최신 순으로 보여 줘요. 한 페이지에 {RECORDS_PER_PAGE}개씩 표시해요.</p></div><span className="fine">전체 {records.length}개</span></div>
   <div className="record-filters"><label>학습일별 조회<input aria-label="기록 조회 학습일" type="date" value={recordDate} onChange={e=>{setRecordDate(e.target.value);setRecordPage(1);}}/></label><button className="small" type="button" onClick={()=>{setRecordDate('');setRecordPage(1);}} disabled={!recordDate}>전체 날짜 보기</button></div>
   {records.length===0?<p className="empty">{recordDate?'선택한 학습일에 측정 기록이 없어요.':'아직 측정 기록이 없어요.'}</p>:<>
    {visibleRecords.map(e=><div className="record-row" key={e.id}><div className="record-details"><strong>{taskName(e)}</strong><p>{e.kind==='nap'?'쪽잠 · ':`${subjectName(e)} · `}{localInput(e.start).replace('T',' ')} → {e.end===null?'측정 중':localInput(e.end).replace('T',' ')} · {duration((e.end??now)-e.start)}</p></div><div className="actions">{e.end===null?<button type="button" className="small" disabled={busy} onClick={()=>onStopEntry(e)}>종료</button>:<button type="button" className="small" onClick={()=>onEditEntry(e)}>시간 수정</button>}<button type="button" className="small" disabled={busy} onClick={()=>onDeleteEntry(e)}>휴지통</button></div></div>)}
    <nav className="record-pagination" aria-label="측정 기록 페이지 이동"><button type="button" className="small" onClick={()=>setRecordPage(1)} disabled={actualRecordPage===1}>« 처음</button><button type="button" className="small" onClick={()=>setRecordPage(actualRecordPage-1)} disabled={actualRecordPage===1}>‹ 이전</button>{pageShortcuts.map(n=><button type="button" key={n} className="small record-page-number" aria-current={actualRecordPage===n?'page':undefined} aria-label={`${n}페이지`} onClick={()=>setRecordPage(n)}>{n}</button>)}<button type="button" className="small" onClick={()=>setRecordPage(actualRecordPage+1)} disabled={actualRecordPage===totalRecordPages}>다음 ›</button><button type="button" className="small" onClick={()=>setRecordPage(totalRecordPages)} disabled={actualRecordPage===totalRecordPages}>끝 »</button></nav>
    <p className="fine record-page-caption">{actualRecordPage} / {totalRecordPages}페이지 · {records.length}개 기록 중 {(actualRecordPage-1)*RECORDS_PER_PAGE+1}–{Math.min(records.length,actualRecordPage*RECORDS_PER_PAGE)}번째</p>
   </>}
  </section>
 </div>;
}
