'use client';
import {useEffect,useState,useSyncExternalStore,type FormEvent} from 'react';
import type {User} from '@supabase/supabase-js';
import {createStudyStore,initialView,type StudyStore} from '../lib/study-store';
import {studyDay} from '../lib/study-day';
import {kstClockSeconds,kstDateLabel} from '../lib/kst-clock';
import {type Appearance,type Accent,type FontChoice} from '../lib/appearance';
import ExamPlanning from './exam-planning';
import AssessmentView,{AssessmentNotifications} from './assessment-view';
import AdminNotices from './admin-notices';
import {assessmentNotices} from '../lib/assessments';
import FriendsView from './friends-view';
import GroupsView from './groups-view';
import StudyStatistics from './study-statistics';
import ProfileSettings from './profile-settings';
import FocusMode from './focus-mode';
import {shouldShowFocusMode} from '../lib/focus-mode';
import {ddayLabel,kstToday} from '../lib/exam-planning';
import {DAY,activeEntry,alive,clock,cutEntry,dayStart,duration,localInput,nextDay,normalize,parseLocal,reusableTasks,reuseTask,scheduleNow,sliceDay,start,stop,subjectKey,total,uid,type Entry,type Study,type Task,type Lesson} from '../lib/study';
function describeRecord(row:object){const r=row as Record<string,unknown>;const status=r.deleted_at?' · 휴지통':'';if('start' in r&&typeof r.start==='number')return `${localInput(r.start).replace('T',' ')} → ${r.end===null?'측정 중':localInput(Number(r.end)).replace('T',' ')}${status}`;return `${r.title??r.name??r.label??r.text??'기록'}${'day' in r?' · '+r.day:''}${r.done?' · 완료':''}${r.archived?' · 보관 중':''}${status}`;}
const weekdays=['일','월','화','수','목','금','토'];
const colors=['#2563eb','#7c3aed','#0891b2','#dc7a14','#d64778','#14865a'];
function field(f:FormData,key:string){return String(f.get(key)??'');}
function download(name:string,value:unknown){const a=document.createElement('a');const u=URL.createObjectURL(new Blob([JSON.stringify(value,null,2)],{type:'application/json'}));a.href=u;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(u),1000);}
type AppearanceControls={appearance:Appearance;onAppearanceTheme:(dark:boolean)=>void;onAppearanceAccent:(accent:Accent)=>void;onAppearanceFont:(font:FontChoice)=>void};
type ProfileControls={profileUser:User;onProfileSaved:(user:User)=>void;onUnreadCountChange:(count:number)=>void};
export default function StudyDashboard({userId,tab,now,...controls}:{userId:string;tab:string;now:number}&AppearanceControls&ProfileControls){
 const [store,setStore]=useState<StudyStore|null>(null);
 // The store owns external subscriptions and must be created and disposed together.
 // eslint-disable-next-line react-hooks/set-state-in-effect
 useEffect(()=>{const s=createStudyStore(userId);setStore(s);s.start();return()=>s.destroy();},[userId]); // store is owned by this authenticated mount
 return store?<Dashboard store={store} tab={tab} now={now} {...controls}/>:<section className="card">공부 공간을 연결하고 있어요…</section>;
}
export function Dashboard({store,tab,now,profileUser,onProfileSaved,onUnreadCountChange,...appearanceControls}:{store:StudyStore;tab:string;now:number}&AppearanceControls&ProfileControls){
 const v=useSyncExternalStore(store.subscribe,store.get,()=>initialView);const s=v.data;
 const unreadNotices=assessmentNotices(s.assessments,now).filter(n=>!s.noticeReceipts.some(r=>!r.deleted_at&&r.noticeId===n.id)).length;
 useEffect(()=>{onUnreadCountChange(unreadNotices);},[onUnreadCountChange,unreadNotices]);
 const [selected,setSelected]=useState<string|null>(null);const day=selected??studyDay(new Date(now));
 const [editing,setEditing]=useState<Task|null>(null);const [entryEdit,setEntryEdit]=useState<Entry|null>(null);const [manual,setManual]=useState(false);const [editorTab,setEditorTab]=useState('');const [entryError,setEntryError]=useState('');const [choices,setChoices]=useState<Record<string,'local'|'remote'>>({});const [uiError,setUiError]=useState('');
 const [device,setDevice]=useState('');
 const [showAllPreviousTasks,setShowAllPreviousTasks]=useState(false);
 // Browser-only persisted device identity is read after hydration.
 // eslint-disable-next-line react-hooks/set-state-in-effect
 useEffect(()=>{try{let d=localStorage.getItem('chageun:device');if(!d){d=uid();localStorage.setItem('chageun:device',d);}setDevice(d);}catch{setUiError('기기 저장 공간을 사용할 수 없어요. 브라우저 설정을 확인해 주세요.');}},[]);
 const active=activeEntry(s);const subjects=alive(s.subjects);const tasks=alive(s.tasks).filter(t=>t.day===day);const scheduled=scheduleNow(s,now);
 const previousTasks=reusableTasks(s,day);const shownPreviousTasks=showAllPreviousTasks?previousTasks:previousTasks.slice(0,6);
 const subject=(id:string)=>s.subjects.find(x=>x.id===id)?.name??'과목';
 const taskLabel=(id:string|null)=>id?s.tasks.find(x=>x.id===id)?.title??'보관된 할 일':'이전 쪽잠 기록';
 const write=(fn:(d:Study)=>void)=>{setUiError('');return store.update(fn);};
 // A file may take a moment to parse; a background sync can begin before the import finishes.
 // Wait for that sync to finish instead of rejecting the user's one-time file selection.
 const importWrite=async(fn:(d:Study)=>void):Promise<boolean>=>{
  for(let attempt=0;attempt<2;attempt++){
   const deadline=Date.now()+12000;
   while(store.get().busy&&Date.now()<deadline){await new Promise<void>(resolve=>setTimeout(resolve,150));}
   if(store.get().busy){setUiError('서버 동기화가 오래 걸리고 있어요. 상단의 저장 상태를 확인해 주세요.');return false;}
   const saved=await write(fn);
   if(saved)return true;
   // Retry only a concurrent-sync race, not validation errors or storage failures.
   if(!store.get().error.includes('저장 중이에요'))return false;
  }
  return false;
 };
 function showEntryEditor(entry:Entry|null){setEditorTab(tab);setEntryError('');setEntryEdit(entry);setManual(!entry);window.setTimeout(()=>{const editor=document.getElementById('record-editor');editor?.scrollIntoView({behavior:'smooth',block:'start'});const first=editor?.querySelector('select,input') as HTMLElement|null;first?.focus({preventScroll:true});},0);}
 function begin(taskId:string){if(!device)return;if(v.review||v.remote){setUiError('먼저 충돌한 기록을 확인해 주세요.');return;}if(active?.device!==device&&active&&!confirm('다른 기기에서 실행한 타이머를 정지하고 전환할까요?'))return;write(d=>start(d,taskId,device,Date.now()));}
 function mutateTask(t:Task,action:'done'|'delete'|'defer'){if(active?.taskId===t.id&&!confirm('실행 중인 타이머를 정지하고 처리할까요?'))return;write(d=>{if(activeEntry(d)?.taskId===t.id)stop(d,Date.now());const x=d.tasks.find(x=>x.id===t.id)!;if(action==='done')x.done=!x.done;else if(action==='delete')x.deleted_at=new Date().toISOString();else x.day=nextDay(x.day);});}
 async function saveTask(e:FormEvent<HTMLFormElement>){e.preventDefault();const f=new FormData(e.currentTarget);const title=normalize(field(f,'title'));const name=normalize(field(f,'subject'));const id=editing?.id;const form=e.currentTarget;const saved=await write(d=>{let sub=alive(d.subjects).find(x=>subjectKey(x.name)===subjectKey(name));if(!sub){sub={id:uid(),name,archived:false,deleted_at:null};d.subjects.push(sub);}else if(sub.archived)sub.archived=false;if(id){const t=d.tasks.find(x=>x.id===id)!;t.title=title;t.subjectId=sub.id;}else d.tasks.push({id:uid(),day,subjectId:sub.id,title,done:false,deleted_at:null});});if(saved){setEditing(null);form.reset();}}
 async function saveEntry(e:FormEvent<HTMLFormElement>){e.preventDefault();setEntryError('');try{const f=new FormData(e.currentTarget);const startTime=parseLocal(field(f,'start'));const endTime=parseLocal(field(f,'end'));const saved=await write(d=>{if(entryEdit){const x=d.entries.find(x=>x.id===entryEdit.id)!;if(x.end===null)throw Error('타이머 정지 후 수정해 주세요.');x.start=startTime;x.end=endTime;}else d.entries.push({id:uid(),deleted_at:null,taskId:field(f,'task'),kind:'study',start:startTime,end:endTime,confirmed:startTime,device,napMinutes:20});});if(saved){setEntryEdit(null);setManual(false);setEditorTab('');}else setEntryError(store.get().error||'기록을 저장하지 못했어요. 입력 내용을 확인해 주세요.');}catch(error){setEntryError(error instanceof Error?error.message:'저장 중 오류가 발생했어요.');}}
 const recordEditor=(editorTab===tab&&(manual||entryEdit))?<section id="record-editor" key={entryEdit?.id??'manual'} className="card below editor"><h2>{entryEdit?'공부 시간 수정':'공부 기록 직접 추가'}</h2><form onSubmit={saveEntry} onInvalid={()=>setEntryError('할 일과 시작·종료 시각을 모두 올바르게 입력해 주세요.')}>{!entryEdit&&<label>할 일<select name="task" required><option value="">선택해 주세요</option>{alive(s.tasks).map(t=><option value={t.id} key={t.id}>{t.day} · {t.title}</option>)}</select></label>}<div className="two"><label>시작 (한국 시간)<input name="start" type="datetime-local" step="1" required defaultValue={entryEdit?localInput(entryEdit.start):''}/></label><label>종료 (한국 시간)<input name="end" type="datetime-local" step="1" required defaultValue={entryEdit?localInput(entryEdit.end??now):''}/></label></div><div className="actions"><button className="primary compact" disabled={v.busy}>{v.busy?'저장 중…':'저장'}</button><button type="button" className="small" onClick={()=>{setEntryEdit(null);setManual(false);setEntryError('');setEditorTab('');}}>닫기</button></div>{entryError&&<p role="alert" className="notice error">{entryError}</p>}</form>{entryEdit&&<form className="below" onSubmit={async e=>{e.preventDefault();const f=new FormData(e.currentTarget);const saved=await write(d=>cutEntry(d,entryEdit.id,parseLocal(field(f,'from')),parseLocal(field(f,'to'))));if(saved){setEntryEdit(null);setManual(false);setEditorTab('');}}}><h3>잠든 시간 빼기</h3><div className="two"><label>뺄 구간 시작<input name="from" type="datetime-local" step="1" required defaultValue={localInput(entryEdit.start)}/></label><label>뺄 구간 종료<input name="to" type="datetime-local" step="1" required defaultValue={localInput(entryEdit.end??now)}/></label></div><button className="small" disabled={v.busy}>이 구간 제외</button></form>}</section>:null;
 const entries=alive(s.entries).filter(e=>{const x=sliceDay(e,day,now);return x.end>x.start||e.end===null&&studyDay(new Date(e.start))===day;}).sort((a,b)=>a.start-b.start);
 const nextExam=alive(s.exams).filter(x=>x.date>=kstToday(now)).sort((a,b)=>a.date.localeCompare(b.date))[0];
 const confirmation=active&&active.kind==='study'&&now-active.confirmed>=150*60000;
 const conflict=store.getConflicts();
 // Focus is driven by the active saved timer, so it also reappears after reload
 // and on other devices. Conflicts are an exception: keep recovery UI reachable.
 if(shouldShowFocusMode(s,{ready:v.ready,review:v.review,remoteConflict:!!v.remote})&&active){
  const activeTask=s.tasks.find(t=>t.id===active.taskId);
  return <FocusMode
   key={active.id}
   subject={activeTask?subject(activeTask.subjectId):'공부'}
   taskTitle={taskLabel(active.taskId)}
   startedAt={active.start}
   now={now}
   busy={v.busy}
   status={v.status}
   error={uiError||v.error}
   longSession={Boolean(confirmation)}
   onContinue={()=>void write(d=>{const e=activeEntry(d);if(e)e.confirmed=Date.now();})}
   onStop={stoppedAt=>void write(d=>{
    const live=activeEntry(d);
    if(live?.id===active.id)stop(d,stoppedAt);
   })}
  />;
 }
 return <>
 <div className="sync-strip"><span className={v.pending||v.review?'pending':''}>{v.busy?'동기화 중…':v.status}</span><button className="small" onClick={()=>void store.sync()} disabled={v.busy}>다시 동기화</button></div>
 {(uiError||v.error)&&<div role="alert" className="notice error">{uiError||v.error}</div>}
 {v.pending&&<p className="fine">현재 이 기기에 저장된 기록입니다. 서버 저장 완료 전에는 다른 기기에서 보이지 않을 수 있어요. 동기화 전 브라우저 데이터를 지우지 마세요.</p>}
 {(v.review||v.remote)&&<section className="card conflict"><h2>기록 확인이 필요해요</h2><p>서로 다른 기기의 기록을 자동으로 버리지 않아요. 충돌한 항목은 선택하고, 겹친 시간은 통계 메뉴의 측정 기록 목록에서 수정해 주세요. 해결 전에는 합계를 표시하지 않아요.</p><button className="small" onClick={()=>download('chageun-conflict-backup.json',store.getLocal())}>기기 원본 내려받기</button>{conflict.map(c=><div key={`${c.collection}:${c.id}`} className="conflict-item"><p>{c.collection==='entries'?'타이머 기록':c.collection==='tasks'?'할 일':c.collection==='subjects'?'과목':'설정'} · {c.id.slice(0,8)}</p><details><summary>두 기록 비교</summary><p>이 기기: {describeRecord(c.local)}</p><p>다른 기기: {describeRecord(c.remote)}</p></details><select aria-label="사용할 기록" value={choices[`${c.collection}:${c.id}`]??''} onChange={e=>setChoices({...choices,[`${c.collection}:${c.id}`]:e.target.value as 'local'|'remote'})}><option value="">선택해 주세요</option><option value="local">이 기기의 변경 사용</option><option value="remote">다른 기기의 변경 사용</option></select></div>)}{v.remote&&<button className="primary" onClick={()=>void store.resolve(choices)}>선택한 내용으로 합치기</button>}</section>}
 <div className="workspace-tab-content" key={tab}>
 {!v.ready?<section className="card"><h2>공부 데이터를 준비하고 있어요</h2><p>처음에는 인터넷 연결과 Supabase SQL 적용이 필요해요.</p></section>:tab==='오늘'?<>
 <section className="exam-today-banner" aria-label="다가오는 시험"><div><span className="eyebrow">NEXT EXAM · 시험 D-day</span><h2>{nextExam?nextExam.name:'예정된 시험이 없어요'}</h2><p>{nextExam?`${nextExam.date} · 한국 시간 자정 기준`:'시험 대비 메뉴에서 시험 날짜를 등록해 보세요.'}</p></div><strong className="exam-countdown">{nextExam?ddayLabel(nextExam.date,now):'D-day'}</strong></section>
 <div className="today-controls"><div className="daybar"><label className="daybar-date">학습일<input aria-label="조회 학습일" type="date" value={day} onChange={e=>e.target.value&&setSelected(e.target.value)}/></label><button className="small daybar-today" onClick={()=>setSelected(null)}>오늘</button><span className="daybar-range">06:00 ~ 다음 날 06:00</span></div><div className="live-clock" aria-label={`현재 한국 시간 ${kstClockSeconds(now)}`}><span className="eyebrow">현재 시각 · 한국 시간</span><strong>{kstClockSeconds(now)}</strong><small>{kstDateLabel(now)}</small></div></div>
 <section className="today-top"><div className="summary-card"><p>{day===studyDay(new Date(now))?'오늘':'선택한 날'} 순공 시간</p><strong>{v.review?'확인 필요':duration(total(s,day,now))}</strong><p>완료 {tasks.filter(t=>t.done).length} / {tasks.length} · {v.pending?'이 기기 기준':'동기화된 기록'}</p></div><div className="card current-class"><p className="eyebrow">지금 학교에서는 · {clock(now)}</p><h2>{scheduled.current?.label??'등록된 일정 없음'}</h2><p>{scheduled.current?`${scheduled.current.start}–${scheduled.current.end} ${scheduled.current.room}`:'설정에서 학교 시간표를 등록할 수 있어요.'}</p><p>다음: {scheduled.next?`${scheduled.next.start} ${scheduled.next.label} ${scheduled.next.room}`:'오늘 남은 일정 없음'}</p></div></section>
 <section className="card running"><div><p className="eyebrow">지금 할 일</p><h2>{active?taskLabel(active.taskId):'할 일을 골라 시작해 보세요'}</h2><p>{active?`${clock(active.start)} 시작 · ${active.device===device?'이 기기':'다른 기기'}에서 시작`:'아래 할 일의 시작 버튼을 누르면 시간이 기록돼요.'}</p></div><strong className="timer">{active?duration(now-active.start):'00:00:00'}</strong>{active&&<button className="primary compact" disabled={v.busy} onClick={()=>write(d=>stop(d,Date.now()))}>정지</button>}</section>
 {confirmation&&<div role="alert" className="notice attention">150분이 지났어요. 계속 공부 중인가요? 타이머는 계속 기록하고 있어요.<button className="small" onClick={()=>write(d=>{const e=activeEntry(d);if(e)e.confirmed=Date.now();})}>계속 공부 중</button></div>}
 <div className="study-columns"><div><section className="card"><div className="section-title"><h2>오늘의 할 일</h2><span>{tasks.length}개</span></div><form key={editing?.id??'new'} onSubmit={saveTask} className="task-form"><label>과목<input name="subject" list="subject-names" required maxLength={80} defaultValue={editing?subject(editing.subjectId):''} placeholder="직접 입력하거나 선택"/></label><datalist id="subject-names">{subjects.filter(x=>!x.archived).map(x=><option key={x.id} value={x.name}/>)}</datalist><label>공부할 내용<input name="title" required maxLength={300} defaultValue={editing?.title??''} placeholder="예: 수학 오답 5문제 풀기"/></label><div className="actions"><button className="primary compact" disabled={v.busy}>{editing?'수정 저장':'+ 할 일 추가'}</button>{editing&&<button type="button" className="small" onClick={()=>setEditing(null)}>취소</button>}</div></form><div className="reuse-panel"><div className="section-title"><h3>이전에 했던 할 일</h3><span>{previousTasks.length}개 재사용 가능</span></div><p className="fine">과목과 내용을 다시 입력하지 않고, 아래 버튼을 눌러 선택한 학습일에 추가해요. 완료 표시와 공부 시간은 복사되지 않아요.</p>{previousTasks.length?<><div className="reuse-list">{shownPreviousTasks.map(t=><button key={t.id} className="small reuse-option" type="button" disabled={v.busy||v.review||!!v.remote} title={`${subject(t.subjectId)} · ${t.title} — ${day}에 추가`} onClick={()=>void write(d=>{reuseTask(d,t.id,day);})}><span>＋</span><span className="reuse-label"><small>{subject(t.subjectId)}</small><strong>{t.title}</strong></span></button>)}</div>{previousTasks.length>6&&<button type="button" className="small reuse-more" onClick={()=>setShowAllPreviousTasks(x=>!x)}>{showAllPreviousTasks?'간단히 보기':`이전 할 일 ${previousTasks.length-6}개 더 보기`}</button>}</>:<p className="fine">다른 날짜에 등록한 할 일이 생기면 여기서 한 번에 다시 추가할 수 있어요.</p>}</div><p className="fine task-stop-hint">‘■ 정지’는 시간 측정만 끝내고, ‘✓ 완료 처리’는 할 일 자체를 완료할 때만 눌러요.</p><div className="task-list">{!tasks.length&&<p className="empty">작은 할 일 하나부터 적어 볼까요?</p>}{tasks.map(t=><article className={`task ${t.done?'done':''}`} key={t.id}><div className="task-main"><div><span className="subject-tag">{subject(t.subjectId)}</span><h3>{t.title}</h3><span className="elapsed">{v.review?'확인 필요':duration(total(s,day,now,t.id))}</span></div></div><div className="actions">{active?.taskId===t.id?<button className="small task-stop" type="button" disabled={v.busy} onClick={()=>void write(d=>stop(d,Date.now()))}>■ 정지</button>:<button className="small blue" type="button" disabled={v.busy||t.done||v.review||!!v.remote} onClick={()=>begin(t.id)}>▶ 시작</button>}<button className="small task-complete" type="button" aria-pressed={t.done} title="이 버튼만 할 일을 완료 처리해요. 타이머 정지와 별개예요." disabled={v.busy||active?.taskId===t.id} onClick={()=>mutateTask(t,'done')}>{t.done?'✓ 완료 취소':'✓ 완료 처리'}</button><button className="small" type="button" onClick={()=>setEditing(t)}>수정</button><button className="small" disabled={v.busy} onClick={()=>mutateTask(t,'defer')}>다음 날로</button><button className="small" disabled={v.busy} onClick={()=>mutateTask(t,'delete')}>휴지통</button></div></article>)}</div></section>
 <section className="card below"><h2>하루 메모</h2><form key={day+s.notes.find(n=>n.day===day)?.text} onSubmit={e=>{e.preventDefault();const text=field(new FormData(e.currentTarget),'note');write(d=>{const note=d.notes.find(n=>n.day===day&&!n.deleted_at);if(note)note.text=text;else d.notes.push({id:uid(),day,text,deleted_at:null});});}}><label>오늘 기억할 것<textarea name="note" maxLength={10000} defaultValue={alive(s.notes).find(n=>n.day===day)?.text??''} placeholder="오늘 잘한 일, 내일 기억할 것"/></label><button className="small" disabled={v.busy}>메모 저장</button></form></section>
 </div><section className="card timeline-card"><div className="section-title"><h2>실제 공부 기록</h2><button className="small" onClick={()=>showEntryEditor(null)}>+ 직접 기록</button></div><p>30분 눈금 · 실제 시작·종료 시각 그대로</p><div className="timeline-scroll"><div className="timeline">{Array.from({length:49},(_,i)=><div className="tick" style={{top:i*28}} key={i}><span>{`${Math.floor((360+i*30)%1440/60).toString().padStart(2,'0')}:${i%2?'30':'00'}`}</span></div>)}{entries.map(e=>{const x=sliceDay(e,day,now);const t=s.tasks.find(t=>t.id===e.taskId);const index=Math.max(0,s.subjects.findIndex(s=>s.id===t?.subjectId));return <button key={e.id} className={`time-block ${e.kind==='nap'?'nap':''}`} style={{top:(x.start-dayStart(day))/DAY*1344,height:Math.max(3,(x.end-x.start)/DAY*1344),background:e.kind==='nap'?'#64748b':colors[index%colors.length]}} title={`${taskLabel(e.taskId)} ${clock(e.start)}–${e.end?clock(e.end):'측정 중'}`} onClick={()=>{if(e.end===null){setUiError('정지한 뒤 기록을 수정할 수 있어요.');return;}showEntryEditor(e);}}>{taskLabel(e.taskId)}</button>;})}</div></div></section></div>

 {recordEditor}
 <section className="card below"><h2>오늘 학교 시간표</h2><p>수업 안내이며 순공 시간으로 자동 합산되지 않아요.</p><div className="school-list">{scheduled.list.map(l=><div key={l.id} className={l.id===scheduled.current?.id?'current':''}><time>{l.start}–{l.end}</time><strong>{l.label}</strong><span>{l.room}</span></div>)}</div></section>
 </>:tab==='시험 대비'?<ExamPlanning data={s} write={write} busy={v.busy} now={now}/>:tab==='수행평가'?<AssessmentView data={s} write={write} busy={v.busy} now={now}/>:tab==='알림'?<><AssessmentNotifications data={s} write={write} busy={v.busy} now={now}/><AdminNotices/></>:tab==='통계'?<><StudyStatistics userId={profileUser.id} data={s} now={now} review={v.review||!!v.remote} pending={v.pending} busy={v.busy} onEditEntry={showEntryEditor} onStopEntry={e=>void write(d=>{const x=d.entries.find(x=>x.id===e.id);if(x&&x.end===null)x.end=Date.now();})} onDeleteEntry={e=>{if(confirm('이 기록을 휴지통으로 옮길까요? 순공 시간에서 제외됩니다.'))void write(d=>{const x=d.entries.find(x=>x.id===e.id);if(x){x.end=x.end??Date.now();x.deleted_at=new Date().toISOString();}});}}/>{recordEditor}</>:tab==='설정'?<><ProfileSettings key={profileUser.id} user={profileUser} onSaved={onProfileSaved}/><Settings data={s} write={write} importWrite={importWrite} getSaveError={()=>store.get().error||store.get().status} busy={v.busy} onBackup={()=>download(`chageun-backup-${new Date(now+9*3600000).toISOString().slice(0,10)}.json`,{format:'chageun-data-export-v1',exportedAt:new Date(now).toISOString(),syncStatus:v.status,data:store.getLocal()?.work??s})} {...appearanceControls}/></>:tab==='친구'?<FriendsView now={now}/>:tab==='그룹'?<GroupsView now={now}/>:<section className="card"><h2>메뉴를 찾을 수 없어요</h2><p>다른 메뉴를 선택해 주세요.</p></section>}
 </div>
 </>;
}
function Settings({data:s,write,importWrite,getSaveError,busy,onBackup,appearance,onAppearanceTheme,onAppearanceAccent,onAppearanceFont}:{data:Study;write:(f:(d:Study)=>void)=>Promise<boolean>;importWrite:(f:(d:Study)=>void)=>Promise<boolean>;getSaveError:()=>string;busy:boolean;onBackup:()=>void}&AppearanceControls){
 const [weekday,setWeekday]=useState(1);const [editing,setEditing]=useState<Lesson|null>(null);const [error,setError]=useState('');const [importNotice,setImportNotice]=useState('');
 const lessons=alive(s.lessons).filter(l=>l.weekday===weekday).sort((a,b)=>a.start.localeCompare(b.start));
 const accents:[Accent,string][]=[['blue','차근 블루'],['violet','라벤더'],['mint','민트'],['coral','코랄']];
 const fonts:[FontChoice,string][]=[['sans','기본 고딕'],['serif','명조'],['rounded','둥근 고딕']];
 return <><section className="card appearance-settings"><p className="eyebrow">MAKE CHAGEUN YOURS</p><h2>나만의 차근 꾸미기</h2><p>앱의 색상과 글꼴을 취향대로 바꿀 수 있어요. 설정은 이 브라우저에 저장되고 새로고침 후에도 유지돼요.</p><div className="appearance-group"><h3>화면 밝기</h3><div className="appearance-button-group"><button type="button" className="small" aria-pressed={!appearance.dark} onClick={()=>onAppearanceTheme(false)}>☀ 라이트</button><button type="button" className="small" aria-pressed={appearance.dark} onClick={()=>onAppearanceTheme(true)}>☾ 다크</button></div></div><div className="appearance-group"><h3>테마 색상</h3><div className="appearance-color-choices">{accents.map(([key,label])=><button className="appearance-color-option" key={key} type="button" aria-pressed={appearance.accent===key} onClick={()=>onAppearanceAccent(key)}><span className={`appearance-dot accent-${key}`}/><span>{label}</span>{appearance.accent===key&&<span aria-hidden="true">✓</span>}</button>)}</div></div><div className="appearance-group"><h3>글꼴</h3><div className="appearance-button-group">{fonts.map(([key,label])=><button type="button" key={key} className={`small font-choice font-${key}`} aria-pressed={appearance.font===key} onClick={()=>onAppearanceFont(key)}>{label}</button>)}</div><p className="fine">사용 중인 기기에 설치된 글꼴에 따라 표시 모양이 조금 달라질 수 있어요.</p></div></section>
 <section className="card below"><h2>내 학교 시간표</h2><p>수업·쉬는 시간·식사·자습을 직접 등록할 수 있어요. 시간표는 내 계정에만 저장돼요.</p><label>요일<select value={weekday} onChange={e=>{setWeekday(Number(e.target.value));setEditing(null);}}>{weekdays.map((w,i)=><option key={w} value={i}>{w}요일</option>)}</select></label><form key={editing?.id??weekday} onSubmit={async e=>{e.preventDefault();const form=e.currentTarget;const f=new FormData(form);const saved=await write(d=>{const value={weekday,start:field(f,'start'),end:field(f,'end'),label:normalize(field(f,'label')),room:normalize(field(f,'room'))};if(editing)Object.assign(d.lessons.find(x=>x.id===editing.id)!,value);else d.lessons.push({...value,id:uid(),deleted_at:null});});if(saved){setEditing(null);form.reset();}}}><div className="two"><label>시작<input type="time" name="start" defaultValue={editing?.start} required/></label><label>종료 (24:00 입력 가능)<input name="end" pattern="([01][0-9]|2[0-3]):[0-5][0-9]|24:00" placeholder="09:20" defaultValue={editing?.end} required/></label></div><div className="two"><label>교시·과목 또는 일정<input name="label" defaultValue={editing?.label} required maxLength={160} placeholder="1교시 · 수학"/></label><label>교실<input name="room" defaultValue={editing?.room} maxLength={80} placeholder="2-1"/></label></div><div className="actions"><button className="primary compact" disabled={busy}>{editing?'수정 저장':'일정 추가'}</button>{editing&&<button type="button" className="small" onClick={()=>setEditing(null)}>취소</button>}</div></form>{lessons.map(l=><div className="record-row" key={l.id}><div><strong>{l.start}–{l.end} {l.label}</strong><p>{l.room}</p></div><div className="actions"><button className="small" onClick={()=>setEditing(l)}>수정</button><button className="small" disabled={busy} onClick={()=>write(d=>{d.lessons.find(x=>x.id===l.id)!.deleted_at=new Date().toISOString();})}>휴지통</button></div></div>)}<label>준비된 시간표 가져오기 (JSON)
  <input type="file" accept=".json,application/json" disabled={busy} onChange={async e=>{
   const input=e.currentTarget;const file=input.files?.[0];if(!file)return;
   setError('');setImportNotice('');
   try{
    const parsed:unknown=JSON.parse(await file.text());
    if(!parsed||typeof parsed!=='object'||!('lessons' in parsed)||!Array.isArray(parsed.lessons))throw Error('시간표 파일 형식이 맞지 않아요. lessons 배열이 필요해요.');
    const incoming=(parsed.lessons as unknown[]).map((item,index)=>{
     const l=item as Partial<Lesson>|null;
     if(!l||!Number.isInteger(l.weekday)||l.weekday! < 0||l.weekday! > 6||typeof l.start!=='string'||typeof l.end!=='string'||typeof l.label!=='string'||!l.label.trim()||typeof l.room!=='string'&&l.room!==undefined)throw Error(`${index+1}번째 일정의 요일·시간·내용을 확인해 주세요.`);
     return {weekday:l.weekday!,start:l.start,end:l.end,label:l.label,room:l.room??''};
    });
    if(!incoming.length)throw Error('가져올 시간표 일정이 없어요.');
    const same=(a:Pick<Lesson,'weekday'|'start'|'end'|'label'|'room'>,b:Pick<Lesson,'weekday'|'start'|'end'|'label'|'room'>)=>a.weekday===b.weekday&&a.start===b.start&&a.end===b.end&&a.label===b.label&&a.room===b.room;
    const collides=(a:Pick<Lesson,'weekday'|'start'|'end'>,b:Pick<Lesson,'weekday'|'start'|'end'>)=>a.weekday===b.weekday&&a.start<b.end&&b.start<a.end;
    const present=alive(s.lessons);
    const additions:typeof incoming=[];let duplicates=0;
    for(const item of incoming){
     if([...present,...additions].some(other=>same(other,item))){duplicates++;continue;}
     if([...present,...additions].some(other=>collides(other,item)))throw Error(`${weekdays[item.weekday]}요일 ${item.start}–${item.end} 일정이 기존 시간표와 겹쳐요. 기존 일정을 확인해 주세요.`);
     additions.push(item);
    }
    if(!additions.length){setWeekday(incoming[0].weekday);setImportNotice(`이미 ${duplicates}개 일정이 등록돼 있어요. 요일별 시간표를 확인해 주세요.`);return;}
    if(!confirm(`${additions.length}개 일정을 내 계정에 추가할까요?${duplicates?` (기존 중복 ${duplicates}개 제외)`:''}`))return;
    const saved=await importWrite(d=>{for(const l of additions)d.lessons.push({id:uid(),deleted_at:null,...l});});
    if(!saved){const reason=getSaveError();setError(`시간표를 저장하지 못했어요. 원인: ${reason||'알 수 없는 저장 오류'}. 이 문구를 알려주면 다음 원인을 확인할 수 있어요.`);return;}
    setWeekday(additions[0].weekday);
    setImportNotice(`${additions.length}개 일정을 추가했어요.${duplicates?` 기존 일정 ${duplicates}개는 중복 등록하지 않았어요.`:''} 위쪽에서 서버 저장 상태를 확인해 주세요.`);
   }catch(err){setError(err instanceof Error?err.message:'파일을 읽거나 시간표를 추가하지 못했어요.');}
   finally{input.value='';}
  }}/>
 </label>{importNotice&&<p role="status" className="notice">{importNotice}</p>}{error&&<p role="alert" className="notice error">{error}</p>}</section>
 <section className="card below"><h2>내 데이터 백업</h2><p>공부 기록, 할 일, 시간표, 시험 및 수행평가 계획을 현재 기기 기준 JSON 파일로 내려받아요. 동기화 대기 중이라면 서버에 없는 기록도 파일에 포함될 수 있어요.</p><button className="small blue" onClick={onBackup}>JSON 백업 내려받기</button><p className="fine">백업 파일에는 개인 공부 정보가 담겨 있으니 타인에게 공유하지 마세요. 현재 웹앱에서는 이 파일을 직접 불러오는 복구 기능을 제공하지 않아요.</p></section>
 <section className="card below"><h2>휴지통 · 복구</h2><p>휴지통에 있는 기록을 되살릴 수 있어요. 7일 후 자동 완전 삭제는 아직 적용되지 않았어요.</p>{(['tasks','entries','lessons','exams','assessments'] as const).map(key=>s[key].filter(r=>r.deleted_at).map(r=><div className="record-row" key={r.id}><span>{key==='tasks'?(r as Task).title:key==='lessons'?(r as Lesson).label:key==='exams'?(r as {name:string}).name:key==='assessments'?(r as {title:string}).title:`공부 기록 ${clock((r as Entry).start)}`}</span><button className="small" disabled={busy} onClick={()=>write(d=>{d[key].find(x=>x.id===r.id)!.deleted_at=null;})}>복구</button></div>))}</section></>;
}
