'use client';
import {useEffect,useRef,useState} from 'react';
import {focusThemes,focusThemeImage,readFocusTheme} from '../lib/focus-themes';
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
  const [theme,setTheme]=useState<(typeof focusThemes)[number]>(focusThemes[0]);
  useEffect(()=>{
    const timer=setTimeout(()=>setTheme(readFocusTheme()),0);
    return ()=>clearTimeout(timer);
  },[]);
  const pixel=theme.id!=='default';
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
      className={`chageun-focus-mode${pixel?' focus-mode-pixel':''}`}
      style={pixel?{
        backgroundColor:theme.color,
        backgroundImage:`linear-gradient(#0002,#0003), url("${focusThemeImage(theme)}")`,
      }:undefined}
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
          <output className="focus-mode-time" aria-label={`현재 공부 시간 ${elapsed}`} aria-live="off">{pixel?<PixelTime elapsed={elapsed}/>:elapsed}</output>
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
            style={pixel?{background:theme.color,borderColor:theme.accent}:undefined}
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

// Fixed width bitmap glyphs on a 22-row grid. The smaller steps soften curves.
const glyphs: Record<string,string> = {
  '0': 'M6 0h4v1H6zM4 1h8v1H4zM4 2h8v1H4zM3 3h10v1H3zM3 4h4v1H3zM10 4h3v1H10zM2 5h4v1H2zM10 5h4v1H10zM2 6h4v1H2zM10 6h4v1H10zM2 7h4v1H2zM10 7h4v1H10zM2 8h4v1H2zM10 8h4v1H10zM2 9h4v1H2zM7 9h2v1H7zM10 9h4v1H10zM2 10h4v1H2zM7 10h2v1H7zM10 10h4v1H10zM2 11h4v1H2zM7 11h7v1H7zM2 12h4v1H2zM7 12h2v1H7zM10 12h4v1H10zM2 13h4v1H2zM10 13h4v1H10zM2 14h4v1H2zM10 14h4v1H10zM2 15h4v1H2zM10 15h4v1H10zM2 16h4v1H2zM10 16h4v1H10zM3 17h4v1H3zM10 17h3v1H10zM3 18h10v1H3zM4 19h8v1H4zM4 20h8v1H4zM6 21h4v1H6z',
  '1': 'M7 0h3v1H7zM3 1h7v1H3zM3 2h7v1H3zM3 3h7v1H3zM3 4h7v1H3zM7 5h3v1H7zM7 6h3v1H7zM7 7h3v1H7zM7 8h3v1H7zM7 9h3v1H7zM7 10h3v1H7zM7 11h3v1H7zM7 12h3v1H7zM7 13h3v1H7zM7 14h3v1H7zM7 15h3v1H7zM7 16h3v1H7zM7 17h3v1H7zM3 18h11v1H3zM3 19h11v1H3zM3 20h11v1H3zM3 21h11v1H3z',
  '2': 'M4 0h6v1H4zM2 1h10v1H2zM2 2h11v1H2zM2 3h3v1H2zM8 3h5v1H8zM9 4h4v1H9zM10 5h4v1H10zM10 6h3v1H10zM10 7h3v1H10zM9 8h4v1H9zM9 9h4v1H9zM8 10h4v1H8zM7 11h4v1H7zM6 12h5v1H6zM6 13h4v1H6zM5 14h4v1H5zM4 15h4v1H4zM3 16h4v1H3zM2 17h4v1H2zM2 18h12v1H2zM2 19h12v1H2zM2 20h12v1H2zM2 21h11v1H2z',
  '3': 'M4 0h6v1H4zM2 1h10v1H2zM2 2h11v1H2zM2 3h11v1H2zM10 4h3v1H10zM10 5h4v1H10zM10 6h3v1H10zM9 7h4v1H9zM5 8h7v1H5zM5 9h6v1H5zM5 10h7v1H5zM5 11h8v1H5zM9 12h4v1H9zM10 13h4v1H10zM10 14h4v1H10zM10 15h4v1H10zM10 16h4v1H10zM10 17h4v1H10zM2 18h12v1H2zM2 19h11v1H2zM2 20h10v1H2zM3 21h7v1H3z',
  '4': 'M9 0h3v1H9zM8 1h4v1H8zM8 2h4v1H8zM7 3h5v1H7zM6 4h6v1H6zM6 5h6v1H6zM5 6h3v1H5zM9 6h3v1H9zM5 7h3v1H5zM9 7h3v1H9zM4 8h3v1H4zM9 8h3v1H9zM4 9h2v1H4zM9 9h3v1H9zM3 10h3v1H3zM9 10h3v1H9zM2 11h3v1H2zM9 11h3v1H9zM2 12h3v1H2zM9 12h3v1H9zM2 13h12v1H2zM2 14h13v1H2zM2 15h13v1H2zM2 16h13v1H2zM9 17h3v1H9zM9 18h3v1H9zM9 19h3v1H9zM9 20h3v1H9zM9 21h3v1H9z',
  '5': 'M3 0h9v1H3zM3 1h10v1H3zM3 2h10v1H3zM3 3h10v1H3zM3 4h3v1H3zM3 5h3v1H3zM3 6h3v1H3zM3 7h3v1H3zM3 8h8v1H3zM3 9h9v1H3zM3 10h10v1H3zM3 11h1v1H3zM8 11h5v1H8zM10 12h4v1H10zM10 13h4v1H10zM10 14h4v1H10zM10 15h4v1H10zM10 16h4v1H10zM9 17h5v1H9zM2 18h11v1H2zM2 19h11v1H2zM2 20h10v1H2zM4 21h6v1H4z',
  '6': 'M7 0h5v1H7zM5 1h8v1H5zM4 2h9v1H4zM3 3h5v1H3zM11 3h2v1H11zM3 4h4v1H3zM3 5h3v1H3zM2 6h4v1H2zM2 7h4v1H2zM2 8h10v1H2zM2 9h11v1H2zM2 10h12v1H2zM2 11h5v1H2zM10 11h4v1H10zM2 12h4v1H2zM10 12h4v1H10zM2 13h4v1H2zM11 13h3v1H11zM2 14h4v1H2zM11 14h3v1H11zM2 15h4v1H2zM11 15h3v1H11zM2 16h4v1H2zM11 16h3v1H11zM3 17h3v1H3zM10 17h4v1H10zM3 18h4v1H3zM9 18h5v1H9zM4 19h9v1H4zM4 20h8v1H4zM6 21h5v1H6z',
  '7': 'M3 0h10v1H3zM2 1h12v1H2zM2 2h12v1H2zM2 3h12v1H2zM10 4h3v1H10zM9 5h4v1H9zM9 6h4v1H9zM9 7h3v1H9zM8 8h4v1H8zM8 9h4v1H8zM7 10h4v1H7zM7 11h4v1H7zM7 12h4v1H7zM7 13h3v1H7zM6 14h4v1H6zM6 15h4v1H6zM5 16h4v1H5zM5 17h4v1H5zM5 18h4v1H5zM4 19h4v1H4zM4 20h4v1H4zM4 21h3v1H4z',
  '8': 'M5 0h6v1H5zM4 1h8v1H4zM3 2h10v1H3zM3 3h4v1H3zM9 3h4v1H9zM3 4h3v1H3zM10 4h3v1H10zM2 5h4v1H2zM10 5h4v1H10zM3 6h3v1H3zM10 6h4v1H10zM3 7h3v1H3zM10 7h3v1H10zM3 8h4v1H3zM9 8h4v1H9zM4 9h8v1H4zM5 10h6v1H5zM4 11h9v1H4zM3 12h4v1H3zM9 12h4v1H9zM2 13h4v1H2zM10 13h4v1H10zM2 14h3v1H2zM11 14h3v1H11zM2 15h3v1H2zM11 15h3v1H11zM2 16h3v1H2zM11 16h3v1H11zM2 17h4v1H2zM10 17h4v1H10zM2 18h5v1H2zM9 18h5v1H9zM3 19h10v1H3zM4 20h8v1H4zM5 21h6v1H5z',
  '9': 'M5 0h5v1H5zM4 1h8v1H4zM3 2h9v1H3zM2 3h5v1H2zM9 3h4v1H9zM2 4h4v1H2zM10 4h3v1H10zM2 5h3v1H2zM10 5h4v1H10zM2 6h3v1H2zM10 6h4v1H10zM2 7h3v1H2zM10 7h4v1H10zM2 8h3v1H2zM10 8h4v1H10zM2 9h4v1H2zM9 9h5v1H9zM2 10h12v1H2zM3 11h11v1H3zM3 12h11v1H3zM4 13h6v1H4zM11 13h3v1H11zM10 14h4v1H10zM10 15h4v1H10zM10 16h3v1H10zM9 17h4v1H9zM3 18h2v1H3zM8 18h5v1H8zM3 19h9v1H3zM3 20h8v1H3zM4 21h5v1H4z',
  ':': 'M1 5h3v3H1zM1 14h3v3H1z',
};

function PixelTime({elapsed}:{elapsed:string}){
 let width=0;
 const digits=Array.from(elapsed).map((char,index)=>{
  const offset=width;
  width+=char===':'?7:18;
  return <path key={index} d={glyphs[char]} transform={`translate(${offset} 0)`}/>;
 });
 return <svg viewBox={`0 0 ${width-2} 22`} shapeRendering="crispEdges" fill="currentColor" aria-hidden="true">{digits}</svg>;
}
