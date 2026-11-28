'use client';

import {useRef,useState,type FormEvent} from 'react';
import type {User} from '@supabase/supabase-js';
import {supabase} from '../lib/supabase';

const QUOTE_KEY='chageun_personal_quote';
const QUOTE_LIMIT=100;

export default function PersonalQuote({user,onSaved}:{user:User;onSaved:(user:User)=>void}){
 const dialog=useRef<HTMLDialogElement>(null);
 const [draft,setDraft]=useState('');
 const [saving,setSaving]=useState(false);
 const [error,setError]=useState('');
 const stored=user.user_metadata?.[QUOTE_KEY];
 const quote=typeof stored==='string'?stored:'';

 function openEditor(){
  setDraft(quote);
  setError('');
  dialog.current?.showModal();
 }

 async function save(event:FormEvent<HTMLFormElement>){
  event.preventDefault();
  if(saving)return;
  const nextQuote=draft.trim();
  if(nextQuote===quote){dialog.current?.close();return;}
  if(!supabase){setError('서버에 연결되지 않았어요.');return;}

  setSaving(true);
  setError('');
  try{
   const {data,error}=await supabase.auth.updateUser({data:{[QUOTE_KEY]:nextQuote}});
   if(error||data.user?.id!==user.id){
    setError('명언을 저장하지 못했어요. 다시 시도해 주세요.');
    return;
   }
   onSaved(data.user);
   dialog.current?.close();
  }catch{
   setError('서버에 연결하지 못했어요. 다시 시도해 주세요.');
  }finally{
   setSaving(false);
  }
 }

 return <div className="personal-quote">
  <button type="button" className="personal-quote-edit" aria-haspopup="dialog"
   aria-label={quote?'나의 명언 수정':'나의 명언 추가'} onClick={openEditor}>
   <span className="personal-quote-label">
    나의 명언
    <svg aria-hidden="true" viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
     <path d="m15 5 4 4M4 20l4.5-1 12-12a1.4 1.4 0 0 0 0-2l-2-2a1.4 1.4 0 0 0-2 0l-12 12L4 20Z"/>
    </svg>
   </span>
  </button>
  <p className={quote?'personal-quote-text':'personal-quote-text personal-quote-empty'} dir="auto">
   {quote||'나만의 문구를 적어 보세요'}
  </p>
  <dialog ref={dialog} className="personal-quote-dialog" aria-labelledby="personal-quote-title"
   onCancel={event=>{if(saving)event.preventDefault();}}>
   <h2 id="personal-quote-title">나의 명언</h2>
   <form onSubmit={save}>
    <label>문구 <span className="personal-quote-count">{draft.length}/{QUOTE_LIMIT}</span>
     <input type="text" value={draft} maxLength={QUOTE_LIMIT} autoFocus disabled={saving}
      onChange={event=>setDraft(event.target.value)} placeholder="나에게 힘이 되는 한마디"/>
    </label>
    {error&&<p role="alert" className="notice error">{error}</p>}
    <div className="actions">
     <button type="submit" className="primary compact" disabled={saving}>{saving?'저장 중…':'저장'}</button>
     <button type="button" className="small" disabled={saving} onClick={()=>dialog.current?.close()}>취소</button>
    </div>
   </form>
  </dialog>
 </div>;
}
