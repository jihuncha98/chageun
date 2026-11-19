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

const glyphs: Record<string,string[]> = {
 '0':['01110','11011','11011','11011','11011','11011','01110'],
 '1':['00100','01100','00100','00100','00100','00100','01110'],
 '2':['01110','11011','00011','00110','01100','11000','11111'],
 '3':['11110','00011','00011','01110','00011','00011','11110'],
 '4':['00011','00111','01111','11011','11111','00011','00011'],
 '5':['11111','11000','11000','11110','00011','00011','11110'],
 '6':['01110','11000','11000','11110','11011','11011','01110'],
 '7':['11111','00011','00110','00110','01100','01100','01100'],
 '8':['01110','11011','11011','01110','11011','11011','01110'],
 '9':['01110','11011','11011','01111','00011','00011','01110'],
 ':':['0','0','1','0','1','0','0'],
};

function PixelTime({elapsed}:{elapsed:string}){
 let width=0;
 const pixels=Array.from(elapsed).flatMap(char=>{
  const glyph=glyphs[char];
  if(!glyph)return [];
  const offset=width;
  width+=glyph[0].length+1;
  return glyph.flatMap((row,y)=>Array.from(row).flatMap((value,x)=>
   value==='1'?[<rect key={`${offset+x}-${y}`} x={offset+x} y={y} width="1" height="1"/>]:[]));
 });
 return <svg viewBox={`0 0 ${width-1} 7`} shapeRendering="crispEdges" fill="currentColor" aria-hidden="true">{pixels}</svg>;
}
