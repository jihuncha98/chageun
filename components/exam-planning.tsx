'use client';

import {useState, type FormEvent} from 'react';
import {activeEntry,alive,normalize,stop,subjectKey,uid,type Exam,type Study,type Task} from '../lib/study';
import {ddayLabel,kstToday,monthCells,moveCalendarMonth,taskProgress} from '../lib/exam-planning';

const weekDays=['일','월','화','수','목','금','토'];
function get(f:FormData,name:string){return String(f.get(name)??'');}

export default function ExamPlanning({data,write,busy,now}:{
 data:Study;
 write:(fn:(draft:Study)=>void)=>Promise<boolean>;
 busy:boolean;
 now:number;
}) {
 const today=kstToday(now);
 const [month,setMonth]=useState(()=>today.slice(0,7));
 const [selectedDate,setSelectedDate]=useState(()=>today);
 const [editingExam,setEditingExam]=useState<Exam|null>(null);
 const [editingTask,setEditingTask]=useState<Task|null>(null);
 const [error,setError]=useState('');
 const exams=alive(data.exams).sort((a,b)=>a.date.localeCompare(b.date)||a.name.localeCompare(b.name));
 const currentTasks=alive(data.tasks).filter(t=>t.day===selectedDate);
 const dayProgress=taskProgress(currentTasks);
 const subjects=alive(data.subjects);
 const subjectName=(id:string)=>data.subjects.find(s=>s.id===id)?.name??'과목';
 const subjectProgress=Array.from(new Set(currentTasks.map(t=>t.subjectId))).map(id=>({
  id,name:subjectName(id),...taskProgress(currentTasks.filter(t=>t.subjectId===id))
 })).sort((a,b)=>a.name.localeCompare(b.name,'ko'));
 const dateExams=exams.filter(e=>e.date===selectedDate);

 async function saveExam(e:FormEvent<HTMLFormElement>) {
  e.preventDefault();setError('');
  const form=e.currentTarget;
  const f=new FormData(form);
  const name=normalize(get(f,'name'));
  const date=get(f,'date');
  const saved=await write(d=>{
   if(editingExam){const row=d.exams.find(x=>x.id===editingExam.id);if(!row)throw Error('시험을 찾지 못했어요.');row.name=name;row.date=date;}
   else d.exams.push({id:uid(),deleted_at:null,name,date});
  });
  if(saved){setEditingExam(null);form.reset();}else setError('시험 저장을 확인해 주세요. 화면 위쪽에 표시된 오류도 확인해 주세요.');
 }

 async function saveTask(e:FormEvent<HTMLFormElement>) {
  e.preventDefault();setError('');
  const form=e.currentTarget;
  const f=new FormData(form);
  const name=normalize(get(f,'subject'));
  const title=normalize(get(f,'title'));
  const saved=await write(d=>{
   let sub=alive(d.subjects).find(s=>subjectKey(s.name)===subjectKey(name));
   if(!sub){sub={id:uid(),name,archived:false,deleted_at:null};d.subjects.push(sub);}
   if(sub.archived)throw Error('보관된 과목이에요. 설정에서 보관을 해제해 주세요.');
   if(editingTask){const t=d.tasks.find(x=>x.id===editingTask.id);if(!t)throw Error('할 일을 찾지 못했어요.');t.day=selectedDate;t.subjectId=sub.id;t.title=title;}
   else d.tasks.push({id:uid(),deleted_at:null,day:selectedDate,subjectId:sub.id,title,done:false});
  });
  if(saved){setEditingTask(null);form.reset();}else setError('계획을 저장하지 못했어요. 화면 위쪽의 메시지도 확인해 주세요.');
 }

 function chooseDate(date:string){setSelectedDate(date);setEditingTask(null);}
 function changeMonth(direction:number){
  const next=moveCalendarMonth(month,direction);
  setMonth(next);chooseDate(`${next}-01`);
 }

 return <div className="exam-section">
  <section className="card">
   <div className="section-title"><div><p className="eyebrow">EXAM COUNTDOWN</p><h2>시험 D-day</h2></div><span>한국 시간 자정에 갱신</span></div>
   <div className="exam-list">
    {exams.length===0?<p>등록된 시험이 없어요. 아래에서 중간고사·기말고사·모의고사 등의 날짜를 추가해 보세요.</p>:
     exams.map(exam=><div className="exam-row" key={exam.id}>
      <div className="exam-details"><strong>{exam.name}</strong><p>{exam.date}</p></div>
      <strong className="exam-d-day">{ddayLabel(exam.date,now)}</strong>
      <div className="actions"><button className="small" type="button" onClick={()=>setEditingExam(exam)}>수정</button>
       <button className="small" type="button" disabled={busy} onClick={()=>{
        if(window.confirm(`‘${exam.name}’ 시험을 휴지통으로 옮길까요?`))void write(d=>{d.exams.find(x=>x.id===exam.id)!.deleted_at=new Date().toISOString();});
       }}>휴지통</button></div>
     </div>)}
   </div>
   <form key={editingExam?.id??'new-exam'} className="exam-form" onSubmit={saveExam}>
    <h3>{editingExam?'시험 수정':'시험 날짜 추가'}</h3>
    <div className="exam-form-grid"><label>시험 이름<input name="name" required maxLength={80} placeholder="예: 2학기 기말고사" defaultValue={editingExam?.name??''}/></label>
     <label>시험 날짜<input name="date" type="date" required defaultValue={editingExam?.date??today}/></label></div>
    <div className="actions"><button className="primary compact" disabled={busy}>{editingExam?'수정 저장':'시험 등록'}</button>
     {editingExam&&<button className="small" type="button" onClick={()=>setEditingExam(null)}>취소</button>}</div>
   </form>
  </section>

  <section className="card below">
   <div className="section-title"><div><p className="eyebrow">STUDY PLANNER</p><h2>월간 공부 계획</h2></div><span>계획을 누르면 날짜별로 확인할 수 있어요</span></div>
   <div className="calendar-toolbar">
    <div className="actions"><button className="small" type="button" aria-label="이전 달" onClick={()=>changeMonth(-1)}>‹</button>
     <strong>{month.slice(0,4)}년 {Number(month.slice(5))}월</strong>
     <button className="small" type="button" aria-label="다음 달" onClick={()=>changeMonth(1)}>›</button></div>
    <button className="small" type="button" onClick={()=>{setMonth(today.slice(0,7));chooseDate(today);}}>오늘로</button>
   </div>
   <div className="calendar-grid" role="group" aria-label={`${month} 공부 계획 달력`}>
    {weekDays.map(w=><div className="weekday-heading" key={w}>{w}</div>)}
    {monthCells(month).map((date,i)=>{
     if(date===null)return <div className="calendar-empty" key={`blank-${i}`} aria-hidden="true"/>;
     const plan=taskProgress(data.tasks.filter(t=>t.day===date));
     const hasExam=exams.some(x=>x.date===date);
     return <button className={`calendar-day ${date===selectedDate?'chosen':''} ${date===today?'is-today':''}`} key={date} type="button" aria-pressed={date===selectedDate}
      aria-label={`${date}, 계획 ${plan.done}/${plan.total}개 완료${hasExam?', 시험 있음':''}`} onClick={()=>chooseDate(date)}>
       <span className="calendar-number">{Number(date.slice(-2))}</span>
       {hasExam&&<span className="calendar-exam-mark">시험</span>}
       {plan.total>0&&<span className="calendar-plan-count">{plan.done}/{plan.total} 완료</span>}
     </button>;
    })}
   </div>
   <p className="fine">달력의 계획은 ‘오늘’ 메뉴의 할 일과 동일한 데이터예요. 날짜별 할 일은 오전 6시 기준 학습일로 관리합니다.</p>
  </section>

  <section className="card below">
   <div className="section-title"><h2>{selectedDate} 공부 계획</h2><span>{dayProgress.done}/{dayProgress.total}개 완료{dayProgress.percent===null?'':` · ${dayProgress.percent}%`}</span></div>
   {dateExams.map(x=><p className="calendar-exam-note" key={x.id}>시험 · {x.name}</p>)}
   <div className="progress-track" role="progressbar" aria-label="선택 날짜 계획 완료율" aria-valuemin={0} aria-valuemax={100} aria-valuenow={dayProgress.percent??0}>
    <div className="progress-fill" style={{width:`${dayProgress.percent??0}%`}}/>
   </div>
   {currentTasks.length===0?<p>이 날짜에는 아직 계획이 없어요.</p>:currentTasks.map(t=><div className="plan-row" key={t.id}>
    <button className="check" disabled={busy} aria-label={`${t.title} ${t.done?'완료 취소':'완료'}`} aria-pressed={t.done}
     onClick={()=>{if(activeEntry(data)?.taskId===t.id&&!window.confirm('실행 중인 타이머를 정지하고 완료할까요?'))return;void write(d=>{if(activeEntry(d)?.taskId===t.id)stop(d,Date.now());const x=d.tasks.find(x=>x.id===t.id)!;x.done=!x.done;});}}>{t.done?'✓':'○'}</button>
    <div className="plan-text"><span className="subject-tag">{subjectName(t.subjectId)}</span><strong className={t.done?'plan-done':''}>{t.title}</strong></div>
    <div className="actions"><button className="small" type="button" onClick={()=>setEditingTask(t)}>수정</button>
     <button className="small" type="button" disabled={busy} onClick={()=>{
      if(window.confirm('이 계획을 휴지통으로 옮길까요? 기존 공부 기록은 그대로 보존됩니다.'))void write(d=>{
       const x=d.tasks.find(x=>x.id===t.id)!;
       if(d.entries.some(e=>!e.deleted_at&&e.end===null&&e.taskId===t.id))throw Error('이 계획의 타이머를 먼저 정지해 주세요.');
       x.deleted_at=new Date().toISOString();
      });
     }}>휴지통</button></div>
   </div>)}
   <form key={`${editingTask?.id??'new-plan'}-${selectedDate}`} className="exam-form" onSubmit={saveTask}>
    <h3>{editingTask?'공부 계획 수정':'선택한 날짜에 계획 추가'}</h3>
    <datalist id="calendar-subjects">{subjects.filter(x=>!x.archived).map(sub=><option key={sub.id} value={sub.name}/>)}</datalist>
    <div className="exam-form-grid"><label>과목<input name="subject" list="calendar-subjects" required maxLength={80} placeholder="과목 입력 또는 선택" defaultValue={editingTask?subjectName(editingTask.subjectId):''}/></label>
     <label>공부할 내용<input name="title" required maxLength={300} placeholder="예: 수학 기출문제 10개" defaultValue={editingTask?.title??''}/></label></div>
    <div className="actions"><button className="primary compact" disabled={busy}>{editingTask?'수정 저장':'계획 추가'}</button>
     {editingTask&&<button className="small" type="button" onClick={()=>setEditingTask(null)}>취소</button>}</div>
   </form>
  </section>

  <section className="card below">
   <div className="section-title"><h2>과목별 진행률</h2><span>{selectedDate} 기준</span></div>
   <p className="fine">진행률 = 완료한 할 일 수 ÷ 해당 과목의 전체 계획 수. 공부 시간과는 별도로 계산해요.</p>
   {subjectProgress.length===0?<p>과목별 진행률을 보려면 위에서 공부 계획을 추가해 주세요.</p>:
    subjectProgress.map(x=><div className="subject-progress" key={x.id}>
     <div className="section-title"><strong>{x.name}</strong><span>{x.done}/{x.total}개 · {x.percent}%</span></div>
     <div className="progress-track" role="progressbar" aria-label={`${x.name} 계획 완료율`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={x.percent??0}>
      <div className="progress-fill" style={{width:`${x.percent??0}%`}}/>
     </div>
    </div>)}
  </section>
  {error&&<p role="alert" className="notice error">{error}</p>}
 </div>;
}
