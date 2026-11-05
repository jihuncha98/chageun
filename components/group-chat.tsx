'use client';
import {useEffect,useRef,useState} from 'react';
import {supabase} from '../lib/supabase';

type Message={message_id:string;nickname:string;body:string;is_mine:boolean;sent_at:string};
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
    const result=await client.rpc('chageun_chat_page',{p_group:groupId,p_before:before});
    if(!active)return;
    setRows(result.error?[]:result.data??[]);
    setError(result.error?.message??'');
   }catch{if(active){setRows([]);setError('채팅을 불러올 수 없어요.');}}
   if(active)timer=setTimeout(load,8000);
  }
  void load();
  return ()=>{active=false;clearTimeout(timer);};
 },[open,groupId,before,revision]);
 const list=useRef<HTMLDivElement>(null);
 const follow=useRef(true);
 useEffect(()=>{
  if(list.current&&follow.current)list.current.scrollTop=list.current.scrollHeight;
 },[rows]);
 async function remove(message:Message){
  if(!supabase||busy)return;
  const reason=message.is_mine?null:window.prompt('메시지 삭제 사유를 입력해 주세요. (2~150자)');
  if(!message.is_mine&&reason===null)return;
  if(!window.confirm(`「${message.body.slice(0,60)}」 메시지를 삭제할까요?`))return;
  setBusy(true);setSendError('');
  try{
   const result=await supabase.rpc('chageun_chat_delete',{p_group:groupId,p_message:message.message_id,p_reason:reason});
   if(result.error){setSendError(result.error.message);return;}
   setRows(current=>current.filter(row=>row.message_id!==message.message_id));
   setRevision(n=>n+1);
  }catch{setSendError('삭제 결과를 확인할 수 없어요. 목록을 다시 확인해 주세요.');}
  finally{setBusy(false);}
 }
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
  <button className="small" aria-expanded={open} onClick={()=>{follow.current=true;setRows([]);setOpen(!open);}}>{open?'채팅 닫기':readOnly?'그룹 채팅 열람':'그룹 채팅 열기'}</button>
  {open&&<><p>메시지는 7일간 보관하며, 전체 관리자가 열람할 수 있어요.</p>
   {error&&<p role="alert">{error}</p>}
   <div ref={list} role="region" aria-label="채팅 메시지" tabIndex={0}
    style={{maxHeight:'min(24rem, 48dvh)',overflowY:'auto',overscrollBehavior:'contain'}}
    onScroll={e=>{const el=e.currentTarget;follow.current=el.scrollHeight-el.scrollTop-el.clientHeight<32;}}>
   {rows.slice().reverse().map(m=><article key={m.message_id}><strong>{m.nickname}</strong> <small>{new Date(m.sent_at).toLocaleString('ko-KR',{timeZone:'Asia/Seoul'})}</small><p style={{whiteSpace:'pre-wrap',overflowWrap:'anywhere'}}>{m.body}</p>{(m.is_mine||readOnly)&&<button className="small" disabled={busy} onClick={()=>void remove(m)}>삭제</button>}</article>)}
   </div>
   {rows.length===50&&<button className="small" onClick={()=>{setPages([...pages,rows[49].message_id]);setRows([]);}}>이전 메시지</button>}
   {before&&<button className="small" onClick={()=>{setPages(pages.slice(0,-1));setRows([]);}}>최근 방향으로</button>}
   {!readOnly&&<form onSubmit={send}><label>메시지<input value={draft} maxLength={1000} disabled={busy} onChange={e=>setDraft(e.target.value)}/></label><button disabled={busy||!draft.trim()}>보내기</button></form>}
   {sendError&&<p role="alert">{sendError}</p>}
  </>}
 </section>;
}
