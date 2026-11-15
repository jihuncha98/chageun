'use client';
import {useCallback,useEffect,useState,type FormEvent} from 'react';
import {supabase} from '../lib/supabase';

type Broadcast={id:string;title:string;body:string;publishedAt:string;readAt:string|null;targetUserId:string|null};
type AdminBroadcast=Omit<Broadcast,'readAt'>&{active:boolean;targetEmail:string|null};
type UserRow={id:string;email:string|null;nickname:string;displayName?:string|null;isAdmin:boolean};
type AdminDashboard={users:UserRow[]};
const time=(iso:string)=>new Date(iso).toLocaleString('ko-KR',{timeZone:'Asia/Seoul'});
const errorText=(e:unknown)=>e && typeof e==='object' && 'message' in e && typeof e.message==='string'?e.message:'요청을 완료하지 못했어요.';
const audience=(id:string|null)=>id?'개인 알림':'전체 공지';
function signalChange(){if(typeof window!=='undefined')window.dispatchEvent(new Event('chageun:broadcast-change'));}
export async function fetchMyBroadcasts():Promise<Broadcast[]>{
 if(!supabase)return [];
 const {data,error}=await supabase.rpc('chageun_my_broadcasts');
 if(error)throw error;
 return Array.isArray(data)?data as Broadcast[]:[];
}
async function acknowledge(id:string){
 if(!supabase)throw Error('서버에 연결할 수 없어요.');
 const {error}=await supabase.rpc('chageun_mark_broadcast_read',{p_broadcast:id});
 if(error)throw error;
 signalChange();
}
export function BroadcastInbox(){
 const [items,setItems]=useState<Broadcast[]>([]);
 const [error,setError]=useState('');
 const [busy,setBusy]=useState<string|null>(null);
 const load=useCallback(async()=>{try{setItems(await fetchMyBroadcasts());setError('');}catch{setError('알림을 불러오지 못했어요.');}},[]);
 useEffect(()=>{const t=setTimeout(()=>void load(),0);window.addEventListener('chageun:broadcast-change',load);return()=>{clearTimeout(t);window.removeEventListener('chageun:broadcast-change',load);};},[load]);
 const mark=async(id:string)=>{setBusy(id);try{await acknowledge(id);await load();}catch(e){setError(errorText(e));}finally{setBusy(null);}};
 return <section className="card broadcast-inbox"><div className="section-title"><h2>관리자 알림</h2><button className="small" onClick={()=>void load()}>새로고침</button></div>
  {error&&<p className="notice error" role="alert">{error}</p>}
  {items.length===0?<p className="broadcast-empty">등록된 알림이 없어요.</p>:<div className="broadcast-list">{items.map(x=><article key={x.id} className="broadcast-item"><div className="broadcast-item-top"><strong>{x.title}</strong><span className="broadcast-new">{audience(x.targetUserId)}</span>{!x.readAt&&<span className="broadcast-new">NEW</span>}<time>{time(x.publishedAt)}</time></div><p className="broadcast-body">{x.body}</p>{!x.readAt&&<button className="small" disabled={busy!==null} onClick={()=>void mark(x.id)}>{busy===x.id?'처리 중…':'읽음 처리'}</button>}</article>)}</div>}
 </section>;
}
export function BroadcastPopup({userId}:{userId:string}){
 const [items,setItems]=useState<Broadcast[]>([]);
 const [saving,setSaving]=useState(false);
 const [error,setError]=useState('');
 const load=useCallback(async()=>{try{setItems(await fetchMyBroadcasts());}catch{/* 다른 기능은 정상 유지 */}},[]);
 useEffect(()=>{
  let mounted=true;
  const start=setTimeout(()=>{if(mounted)void load();},0);
  const timer=setInterval(()=>{if(document.visibilityState==='visible')void load();},60000);
  const visible=()=>{if(document.visibilityState==='visible')void load();};
  document.addEventListener('visibilitychange',visible);
  window.addEventListener('chageun:broadcast-change',load);
  return()=>{mounted=false;clearTimeout(start);clearInterval(timer);document.removeEventListener('visibilitychange',visible);window.removeEventListener('chageun:broadcast-change',load);};
 },[userId,load]);
 const current=items.find(n=>!n.readAt);
 if(!current)return null;
 const close=async()=>{setSaving(true);setError('');try{await acknowledge(current.id);setItems(before=>before.map(x=>x.id===current.id?{...x,readAt:new Date().toISOString()}:x));}catch{setError('읽음 처리에 실패했어요. 다시 시도해 주세요.');}finally{setSaving(false);}};
 return <div className="broadcast-overlay" role="presentation"><section className="broadcast-dialog" role="dialog" aria-modal="true" aria-labelledby="broadcast-dialog-title" aria-describedby="broadcast-dialog-body">
  <div className="broadcast-dialog-heading"><span className="broadcast-label">차근 · {audience(current.targetUserId)}</span><time>{time(current.publishedAt)}</time></div>
  <h2 id="broadcast-dialog-title">{current.title}</h2>
  <p id="broadcast-dialog-body" className="broadcast-body">{current.body}</p>
  {error&&<p role="alert" className="notice error">{error}</p>}
  <div className="broadcast-dialog-actions"><span>알림 메뉴에서 다시 확인할 수 있어요.</span><button className="primary" autoFocus disabled={saving} onClick={()=>void close()}>{saving?'처리 중…':'확인'}</button></div>
 </section></div>;
}
export function BroadcastAdminPanel(){
 const [scope,setScope]=useState<'all'|'personal'>('all');
 const [targetId,setTargetId]=useState('');
 const [search,setSearch]=useState('');
 const [users,setUsers]=useState<UserRow[]>([]);
 const [title,setTitle]=useState('');const [body,setBody]=useState('');
 const [items,setItems]=useState<AdminBroadcast[]>([]);
 const [error,setError]=useState('');const [message,setMessage]=useState('');const [busy,setBusy]=useState(false);
 const load=useCallback(async()=>{
  if(!supabase)return;
  const [history,people]=await Promise.all([
   supabase.rpc('chageun_admin_broadcasts'),supabase.rpc('chageun_admin_dashboard')
  ]);
  if(history.error)throw history.error;
  if(people.error)throw people.error;
  setItems(Array.isArray(history.data)?history.data as AdminBroadcast[]:[]);
  const result=people.data as AdminDashboard|null;
  setUsers(Array.isArray(result?.users)?result.users:[]);
 },[]);
 useEffect(()=>{const t=setTimeout(()=>{void load().catch(()=>setError('발송 내역을 불러오지 못했어요.'));},0);return()=>clearTimeout(t);},[load]);
 const selectable=users.filter(u=>[u.nickname,u.displayName??'',u.email??''].join(' ').toLowerCase().includes(search.toLowerCase())).slice(0,150);
 const selected=users.find(x=>x.id===targetId);
 const send=async(e:FormEvent<HTMLFormElement>)=>{
  e.preventDefault();if(!supabase||busy)return;
  const t=title.trim(),b=body.trim();if(!t||!b)return;
  if(scope==='personal'&&!selected){setError('알림 받을 회원을 먼저 선택해 주세요.');return;}
  const to=scope==='all'?'전체 회원':`${selected?.nickname??''} (${selected?.email??'이메일 미설정'})`;
  if(!window.confirm(`${to}에게 알림을 발송할까요?`))return;
  setBusy(true);setError('');setMessage('');
  try{
   const {error:e}=await supabase.rpc('chageun_admin_broadcast_publish_target',{
    p_title:t,p_body:b,p_target:scope==='all'?null:targetId
   });
   if(e)throw e;
   setTitle('');setBody('');setMessage(`${to}에게 알림을 발송했어요.`);
   await load();signalChange();
  }catch(e){setError(errorText(e));}finally{setBusy(false);}
 };
 const remove=async(id:string,name:string)=>{
  if(!supabase||busy||!window.confirm(`「${name}」 알림을 수신자에게서 숨길까요?`))return;
  setBusy(true);setError('');setMessage('');
  try{const {error:e}=await supabase.rpc('chageun_admin_broadcast_remove',{p_broadcast:id});if(e)throw e;setMessage('알림을 숨겼어요.');await load();signalChange();}catch(e){setError(errorText(e));}finally{setBusy(false);}
 };
 return <div className="broadcast-admin"><div className="section-title"><h2>알림 발송</h2><span className="broadcast-admin-tag">관리자 전용</span></div>
  <form onSubmit={e=>void send(e)} className="broadcast-admin-form">
   <label>발송 대상<select value={scope} onChange={e=>{setScope(e.target.value as 'all'|'personal');setTargetId('');setSearch('');setError('');}}><option value="all">전체 회원</option><option value="personal">개별 회원</option></select></label>
   {scope==='personal'&&<><label>회원 검색<input value={search} onChange={e=>setSearch(e.target.value)} placeholder="이름 또는 이메일"/></label><label>받는 회원<select value={targetId} required onChange={e=>setTargetId(e.target.value)}><option value="">선택해 주세요</option>{selectable.map(u=><option key={u.id} value={u.id}>{u.nickname} · {u.email??'이메일 없음'}</option>)}{selected&&!selectable.some(u=>u.id===selected.id)&&<option value={selected.id}>{selected.nickname} · {selected.email??'이메일 없음'}</option>}</select></label></>}
   <label>제목<input value={title} onChange={e=>setTitle(e.target.value)} maxLength={100} required placeholder="알림 제목"/></label>
   <label>내용<textarea rows={3} value={body} onChange={e=>setBody(e.target.value)} maxLength={2000} required placeholder="전달할 내용"/></label>
   <div className="broadcast-admin-actions"><button type="submit" className="primary" disabled={busy||!title.trim()||!body.trim()||(scope==='personal'&&!selected)}>{busy?'처리 중…':'알림 발송'}</button></div>
  </form>
  {error&&<p className="notice error" role="alert">{error}</p>}{message&&<p className="notice" role="status">{message}</p>}
  <div className="broadcast-history"><h3>발송 내역</h3>{items.length===0?<p className="broadcast-empty">발송한 알림이 없어요.</p>:items.map(x=><div className="broadcast-history-row" key={x.id}><div><strong>{x.title}</strong><small>{time(x.publishedAt)} · {x.targetUserId?`개인: ${x.targetEmail??'탈퇴한 회원'}`:'전체 회원'} · {x.active?'게시 중':'숨김'}</small></div>{x.active&&<button className="small" disabled={busy} onClick={()=>void remove(x.id,x.title)}>알림 숨김</button>}</div>)}</div>
 </div>;
}
