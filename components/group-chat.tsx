'use client';
import {useEffect,useState} from 'react';
import {supabase} from '../lib/supabase';

type Message={message_id:string;nickname:string;body:string;sent_at:string};
export default function GroupChat({groupId,readOnly=false}:{groupId:string;readOnly?:boolean}){
 const [open,setOpen]=useState(false);
 const [pages,setPages]=useState<string[]>([]);
 const before=pages.at(-1)??null;
 const [rows,setRows]=useState<Message[]>([]);
 const [error,setError]=useState('');
 const [sendError,setSendError]=useState('');
 const [draft,setDraft]=useState('');
 const [busy,setBusy]=useState(false);
 const [revision,setRevision]=useState(0);
 useEffect(()=>{
  if(!open||!supabase)return;
  const client=supabase;
  let active=true;
  let timer:ReturnType<typeof setTimeout>;
  async function load(){
   try{
    const result=await client.rpc('chageun_chat_read',{p_group:groupId,p_before:before});
    if(!active)return;
    setRows(result.error?[]:result.data??[]);
    setError(result.error?.message??'');
   }catch{if(active){setRows([]);setError('채팅을 불러올 수 없어요.');}}
   if(active)timer=setTimeout(load,8000);
  }
  void load();
  return ()=>{active=false;clearTimeout(timer);};
 },[open,groupId,before,revision]);
 async function send(e:React.FormEvent){
  e.preventDefault();
  if(!supabase||busy||!draft.trim())return;
  setBusy(true);setSendError('');
  try{
   const result=await supabase.rpc('chageun_chat_send',{p_group:groupId,p_body:draft.trim()});
   if(result.error){setSendError(result.error.message);return;}
   setDraft('');setRows([]);setPages([]);setRevision(n=>n+1);
  }catch{setSendError('전송 결과를 확인할 수 없어요. 메시지 목록을 확인해 주세요.');}
  finally{setBusy(false);}
 }
 return <section className="card below">
  <button className="small" aria-expanded={open} onClick={()=>{setRows([]);setOpen(!open);}}>{open?'채팅 닫기':readOnly?'그룹 채팅 열람':'그룹 채팅 열기'}</button>
  {open&&<><p>메시지는 7일간 보관하며, 전체 관리자가 열람할 수 있어요.</p>
   {error&&<p role="alert">{error}</p>}
   {rows.slice().reverse().map(m=><article key={m.message_id}><strong>{m.nickname}</strong> <small>{new Date(m.sent_at).toLocaleString('ko-KR',{timeZone:'Asia/Seoul'})}</small><p style={{whiteSpace:'pre-wrap',overflowWrap:'anywhere'}}>{m.body}</p></article>)}
   {rows.length===50&&<button className="small" onClick={()=>{setPages([...pages,rows[49].message_id]);setRows([]);}}>이전 메시지</button>}
   {before&&<button className="small" onClick={()=>{setPages(pages.slice(0,-1));setRows([]);}}>최근 방향으로</button>}
   {!readOnly&&<form onSubmit={send}><label>메시지<input value={draft} maxLength={1000} disabled={busy} onChange={e=>setDraft(e.target.value)}/></label><button disabled={busy||!draft.trim()}>보내기</button>{sendError&&<p role="alert">{sendError}</p>}</form>}
  </>}
 </section>;
}
