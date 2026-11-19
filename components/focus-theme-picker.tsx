'use client';

import {useEffect,useState} from 'react';
import {focusThemes,focusThemeImage,readFocusTheme,saveFocusTheme,type FocusTheme} from '../lib/focus-themes';

export default function FocusThemePicker(){
 const [selected,setSelected]=useState<FocusTheme>(focusThemes[0]);
 const [message,setMessage]=useState('');
 useEffect(()=>{
  const timer=setTimeout(()=>setSelected(readFocusTheme()),0);
  return ()=>clearTimeout(timer);
 },[]);
 return <section className="card">
  <h2>타이머 테마</h2>
  <p>모든 테마를 무료로 적용할 수 있어요.</p>
  <p role="status">{message}</p>
  <div className="shop-grid">
   {focusThemes.map(theme=><article className="card shop-product" key={theme.id}>
    <div className="focus-theme-thumbnail" style={{
     backgroundColor:theme.color,
     backgroundImage:theme.id==='default'?undefined:`url("${focusThemeImage(theme)}")`,
    }} aria-hidden="true"><strong>00:04:05</strong></div>
    <h3>{theme.label}</h3>
    <button className="small" disabled={theme.id===selected.id} onClick={()=>{
     try{
      saveFocusTheme(theme);
      setSelected(theme);
      setMessage(`${theme.label}를 적용했어요.`);
     }catch{
      setMessage('이 브라우저에서 테마 설정을 저장할 수 없어요.');
     }
    }}>{theme.id===selected.id?'적용 중':'무료 적용'}</button>
   </article>)}
  </div>
 </section>;
}
