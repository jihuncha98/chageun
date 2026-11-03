'use client';
import {useMemo,useState} from 'react';
import {alive,duration,type Study} from '../lib/study';
import {studyStatistics,type StudyPoint} from '../lib/statistics';

const label=(day:string)=>`${Number(day.slice(5,7))}/${Number(day.slice(8,10))}`;
const longTime=(ms:number)=>{const minutes=Math.floor(ms/60000);return `${Math.floor(minutes/60)}시간 ${String(minutes%60).padStart(2,'0')}분`;};

export default function StudyStatistics({data,now,review,pending}:{data:Study;now:number;review:boolean;pending:boolean}){
 const [range,setRange]=useState<7|30>(7);
 const [selected,setSelected]=useState<string|null>(null);
 const report=useMemo(()=>studyStatistics(data,now,range),[data,now,range]);
 const selectedDay=selected&&report.points.some(p=>p.day===selected)?selected:report.endDay;
 const point=report.points.find(p=>p.day===selectedDay) as StudyPoint;
 const dailyTasks=alive(data.tasks).filter(t=>t.day===selectedDay);
 const note=alive(data.notes).find(n=>n.day===selectedDay);
 const max=Math.max(1,...report.points.map(p=>p.ms));
 const delta=report.today.ms-report.yesterday.ms;
 return <div className="statistics-view">
  <section className="card">
   <div className="section-title"><div><h2>공부 통계</h2><p>한국 시간 오전 6시부터 다음 날 오전 6시까지를 하루로 계산해요.</p></div><div className="stats-range" role="group" aria-label="조회 기간"><button className="small" aria-pressed={range===7} onClick={()=>{setRange(7);setSelected(null);}}>최근 7일</button><button className="small" aria-pressed={range===30} onClick={()=>{setRange(30);setSelected(null);}}>최근 30일</button></div></div>
   {pending&&<p className="notice">아직 서버에 보내지 않은 기록이 있어요. 이 통계는 현재 기기 기준이에요.</p>}
   {review?<p role="alert" className="notice error">겹치거나 충돌한 기록을 해결해야 통계를 정확히 표시할 수 있어요. 먼저 오늘 메뉴에서 기록을 확인해 주세요.</p>:<>
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
    <div className="stats-chart-scroller"><div className="stats-chart" style={{gridTemplateColumns:`repeat(${report.points.length},minmax(${range===7?54:38}px,1fr))`}}>
     {report.points.map(p=><button type="button" className={`stats-day ${p.day===selectedDay?'selected':''}`} key={p.day} aria-pressed={p.day===selectedDay} aria-label={`${p.day} 순공 ${longTime(p.ms)}`} onClick={()=>setSelected(p.day)}>
      <span className="stats-time-caption">{p.ms>0?duration(p.ms).slice(0,5):'0'}</span><span className="stats-bar-track"><span className="stats-bar-fill" style={{height:`${p.ms?Math.max(4,Math.round(p.ms/max*100)):0}%`}}/></span><span className="stats-date-caption">{label(p.day)}</span>
     </button>)}
    </div></div>
   </section>
   <div className="stats-bottom">
    <section className="card below"><h2>과목별 공부 시간</h2><p className="fine">최근 {range}학습일 · 실제 측정한 순공만 합산</p>{report.subjectTotals.length===0?<p className="empty">이 기간에 공부 기록이 없어요.</p>:report.subjectTotals.map(s=><div className="subject-stat" key={s.id}><div className="subject-stat-head"><strong>{s.name}</strong><span>{longTime(s.ms)} · {s.percent}%</span></div><div className="progress-track" role="progressbar" aria-label={`${s.name} 시간 비중`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={s.percent}><div className="progress-fill" style={{width:`${s.percent}%`}}/></div></div>)}</section>
    <section className="card below"><h2>{selectedDay} 기록</h2><p className="fine">순공 {longTime(point.ms)} · 할 일 완료 {point.done}/{point.tasks}</p>{dailyTasks.length===0?<p>이날 등록된 할 일이 없어요.</p>:<div className="stats-task-list">{dailyTasks.map(t=><div className="record-row" key={t.id}><span>{t.done?'✓':'○'} {data.subjects.find(s=>s.id===t.subjectId)?.name??'과목'} · {t.title}</span><span className="fine">{t.done?'완료':'진행 전'}</span></div>)}</div>}
    {note?.text&&<div className="stats-note"><strong>하루 메모</strong><p>{note.text}</p></div>}<p className="fine">기록 수정은 오늘 메뉴에서 날짜를 선택해 진행해 주세요.</p></section>
   </div>
  </>}
 </div>;
}
