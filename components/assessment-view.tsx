'use client';
import {useState,type FormEvent} from 'react';
import {assessmentFormValues,assessmentNotices,readAssessmentNotice,sortedAssessments} from '../lib/assessments';
import {ddayLabel,kstToday} from '../lib/exam-planning';
import {alive,uid,type Assessment,type Study} from '../lib/study';

type Props={data:Study;write:(change:(draft:Study)=>void)=>Promise<boolean>;busy:boolean;now:number};
function formField(form:FormData,name:string){return String(form.get(name)??'');}

export default function AssessmentView({data,write,busy,now}:Props){
 const today=kstToday(now);
 const [editing,setEditing]=useState<Assessment|null>(null);
 const [error,setError]=useState('');
 const rows=sortedAssessments(data.assessments);
 const active=rows.filter(x=>!x.done).length;
 const subjects=[...new Set(alive(data.subjects).map(x=>x.name).concat(rows.map(x=>x.subject)))].sort((a,b)=>a.localeCompare(b,'ko'));
 async function save(e:FormEvent<HTMLFormElement>){
  e.preventDefault();setError('');
  const form=e.currentTarget;
  try{
  const fields=new FormData(form);
  const values=assessmentFormValues(formField(fields,'subject'),formField(fields,'title'),formField(fields,'date'));
  const saved=await write(d=>{
   if(editing){
    const row=d.assessments.find(x=>x.id===editing.id&&!x.deleted_at);
    if(!row)throw Error('수행평가를 찾지 못했어요.');
    Object.assign(row,values);
   }else d.assessments.push({id:uid(),deleted_at:null,...values,done:false,createdAt:new Date().toISOString()});
  });
  if(saved){setEditing(null);form.reset();}else setError('저장하지 못했어요. 상단의 동기화 상태를 확인해 주세요.');
  }catch(err){setError(err instanceof Error?err.message:'수행평가 저장 중 오류가 발생했어요.');}
 }
 return <div className="assessments-view">
  <section className="card">
   <div className="section-title"><div><p className="eyebrow">PERFORMANCE ASSESSMENTS</p><h2>수행평가 D-day</h2></div><span>한국 시간 자정에 갱신 · 진행 중 {active}개</span></div>
   <p className="fine">완료해도 목록에 남고, 오른쪽 체크를 다시 누르면 완료를 취소할 수 있어요. 항목 삭제는 직접 선택할 때만 이루어져요.</p>
   {rows.length===0?<div className="assessment-empty"><strong>등록된 수행평가가 없어요.</strong><p>아래에서 과목과 수행평가 이름, 마감일을 추가해 보세요.</p></div>:
    <div className="assessment-list">{rows.map(item=><div className={`assessment-row ${item.done?'assessment-finished':''}`} key={item.id}>
     <div className="assessment-main"><span className="subject-tag">{item.subject}</span><strong className={item.done?'assessment-done':''}>{item.title}</strong><small>마감 {item.date}</small></div>
     <strong className="assessment-day">{ddayLabel(item.date,now)}</strong>
     <div className="assessment-actions">
      <button type="button" className={`assessment-check ${item.done?'is-checked':''}`} title={item.done?'완료 취소':'완료 처리'} aria-label={`${item.title} ${item.done?'완료 취소':'완료 처리'}`} aria-pressed={item.done} disabled={busy} onClick={()=>void write(d=>{const x=d.assessments.find(x=>x.id===item.id);if(x)x.done=!x.done;})}>{item.done?'✓':'○'}</button>
      <button type="button" className="small" disabled={busy} onClick={()=>setEditing(item)}>수정</button>
      <button type="button" className="small" disabled={busy} onClick={()=>{if(confirm(`‘${item.title}’ 수행평가를 삭제할까요? 삭제한 항목은 설정의 휴지통에서 복구할 수 있어요.`))void write(d=>{const x=d.assessments.find(x=>x.id===item.id);if(x)x.deleted_at=new Date().toISOString();});}}>삭제</button>
     </div>
    </div>)}</div>}
  </section>
  <section className="card below">
   <div className="section-title"><div><p className="eyebrow">ADD OR EDIT</p><h2>{editing?'수행평가 수정':'수행평가 추가'}</h2></div><span>계정별로 별도 저장</span></div>
   <form key={editing?.id??'new-assessment'} onSubmit={save}>
    <div className="assessment-form-grid">
     <label>과목<input name="subject" list="assessment-subjects" maxLength={80} required placeholder="예: 화학" defaultValue={editing?.subject??''}/></label>
     <label>마감일<input name="date" type="date" required defaultValue={editing?.date??today}/></label>
    </div>
    <datalist id="assessment-subjects">{subjects.map(x=><option value={x} key={x}/>)}</datalist>
    <label>수행평가 이름<input name="title" maxLength={160} required placeholder="예: 화학 반응의 세계 보고서" defaultValue={editing?.title??''}/></label>
    <div className="actions"><button className="primary compact" disabled={busy}>{editing?'수정 저장':'수행평가 등록'}</button>{editing&&<button type="button" className="small" onClick={()=>setEditing(null)}>취소</button>}</div>
   </form>
   {error&&<p className="notice error" role="alert">{error}</p>}
   <p className="fine">마감 7일 전 · 3일 전 · 1일 전 · 당일에 차근 내부 알림이 표시돼요. 완료하거나 삭제한 수행평가는 새 알림이 발생하지 않아요.</p>
  </section>
 </div>;
}

export function AssessmentNotifications({data,write,busy,now}:Props){
 const notices=assessmentNotices(data.assessments,now);
 const reads=new Set(alive(data.noticeReceipts).map(x=>x.noticeId));
 return <div className="notifications-view">
  <section className="card">
   <div className="section-title"><div><p className="eyebrow">YOUR NOTIFICATIONS</p><h2>알림</h2></div><span>최근 7일</span></div>
   <p className="fine">현재는 수행평가 마감 알림이 표시돼요. 관리자 조치 알림은 관리자 기능 개발 시 연결할 예정이에요.</p>
   {notices.length===0?<div className="assessment-empty"><strong>확인할 알림이 없어요.</strong><p>수행평가를 등록하면 마감일이 가까워질 때 이곳에서 확인할 수 있어요.</p></div>:
    <div className="assessment-notice-list">{notices.map(n=><div className={`assessment-notice ${reads.has(n.id)?'has-read':''}`} key={n.id}>
     <div className="assessment-notice-text"><div className="assessment-notice-heading"><strong>{n.label}</strong>{!reads.has(n.id)&&<span className="notification-unread-dot" aria-label="읽지 않음"/>}</div><p>{n.subject} · {n.title}</p><small>{n.createdDate} 알림 · 마감일 {n.date}</small></div>
     {reads.has(n.id)?<span className="assessment-read-status">읽음</span>:<button type="button" className="small" disabled={busy} onClick={()=>void write(d=>readAssessmentNotice(d,n.id,Date.now()))}>읽음 처리</button>}
    </div>)}</div>}
   <p className="fine">알림은 생성일로부터 7일 동안만 표시되고, 이후 목록에서 자동으로 사라져요. 수행평가 원본은 삭제되지 않아요.</p>
  </section>
 </div>;
}
