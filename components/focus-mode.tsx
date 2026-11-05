'use client';
import {useEffect,useRef,useState} from 'react';
import {duration} from '../lib/study';

/**
 * This screen is intentionally controlled by the persisted active entry,
 * not by ephemeral "started on this device" React state. That makes the
 * screen survive refreshes and follow cross-device start/stop events.
 */
export default function FocusMode({
  subject,
  taskTitle,
  startedAt,
  now,
  busy,
  status,
  error,
  longSession,
  onContinue,
  onStop,
}:{
  subject:string;
  taskTitle:string;
  startedAt:number;
  now:number;
  busy:boolean;
  status:string;
  error:string;
  longSession:boolean;
  onContinue:()=>void;
  onStop:(stoppedAt:number)=>void;
}){
  const stopButton=useRef<HTMLButtonElement>(null);
  const [stopRequestedAt,setStopRequestedAt]=useState<number|null>(null);
  // A network sync may be in progress when the user presses Stop. Freeze the
  // clock immediately and apply that exact timestamp once the store unlocks.
  useEffect(()=>{
    if(stopRequestedAt===null||busy)return;
    onStop(stopRequestedAt);
    // This single state update clears a user-initiated queued stop.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setStopRequestedAt(null);
  },[stopRequestedAt,busy,onStop]);
  useEffect(()=>{
    const priorOverflow=document.body.style.overflow;
    document.body.style.overflow='hidden';
    stopButton.current?.focus();
    return()=>{document.body.style.overflow=priorOverflow;};
  },[]);

  const elapsed=duration(Math.max(0,(stopRequestedAt??now)-startedAt));
  return (
    <section
      className="chageun-focus-mode"
      role="dialog"
      aria-modal="true"
      aria-labelledby="focus-mode-title"
      aria-describedby="focus-mode-description"
      onKeyDown={e=>{
        // The navigation behind this modal must not be accessible by Tab.
        if(e.key==='Tab') {e.preventDefault();stopButton.current?.focus();}
      }}
    >
      <div className="focus-mode-inner">
        <p className="focus-mode-overline" id="focus-mode-title">차근 · 집중 모드</p>
        <div className="focus-mode-center">
          <div id="focus-mode-description" className="focus-mode-activity">
            <span>{subject}</span>
            <strong>{taskTitle}</strong>
          </div>
          <output className="focus-mode-time" aria-label={`현재 공부 시간 ${elapsed}`} aria-live="off">{elapsed}</output>
          <p className="focus-mode-hint">시간이 흘러가는 동안 공부에 집중해요.</p>
        </div>
        <div className="focus-mode-bottom">
          {longSession&&<div className="focus-mode-warning" role="status">
            150분 넘게 공부 중이에요.
            <button type="button" disabled={busy} onClick={onContinue}>계속 공부 중</button>
          </div>}
          {error&&<p className="focus-mode-error" role="alert">{error}</p>}
          <button
            ref={stopButton}
            type="button"
            className="focus-mode-stop"
            disabled={stopRequestedAt!==null}
            onClick={()=>setStopRequestedAt(Date.now())}
          >
            <span aria-hidden="true">■</span> {stopRequestedAt!==null?'정지 처리 중…':'정지'}
          </button>
          <p className="focus-mode-small">정지하면 원래 차근 화면으로 돌아갑니다.</p>
          {status!=='서버 저장 완료'&&<p className="focus-mode-status" role="status">{status}</p>}
        </div>
      </div>
    </section>
  );
}
