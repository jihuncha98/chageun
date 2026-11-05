'use client';
import {useCallback,useEffect,useState} from 'react';
import {supabase} from '../lib/supabase';
export type AdminNotice={id:string;title:string;body:string;createdAt:string;readAt:string|null};
export async function fetchMyAdminNotices():Promise<AdminNotice[]>{
 if(!supabase)return [];
 const {data,error}=await supabase.rpc('chageun_my_admin_notices');
 if(error)throw error;
 return Array.isArray(data)?data as AdminNotice[]:[];
}
export default function AdminNotices(){
 const [items,setItems]=useState<AdminNotice[]>([]);const [error,setError]=useState('');
 const load=useCallback(async()=>{try{setItems(await fetchMyAdminNotices());setError('');}catch{setError('관리자 조치 알림을 불러오지 못했어요. 연결을 확인해 주세요.');}},[]);
 useEffect(()=>{const timer=setTimeout(()=>{void load();},0);return()=>clearTimeout(timer);},[load]);
 async function mark(id:string){if(!supabase)return;const {error:e}=await supabase.rpc('chageun_mark_admin_notice_read',{p_notice:id});if(e){setError('읽음 처리에 실패했어요.');return;}await load();}
 return <section className="card below"><div className="section-title"><h2>관리자 조치 알림</h2><button className="small" onClick={()=>void load()}>새로고침</button></div>
 <p>관리자 조치 알림은 해당 회원만 볼 수 있으며 작성 후 7일 동안 보관돼요. 계정 삭제 알림은 보내지 않아요.</p>
 {error&&<p role="alert" className="notice error">{error}</p>}
 {items.length===0&&<p className="empty">최근 7일 동안의 관리자 조치 알림이 없어요.</p>}
 {items.map(n=><div className="record-row" key={n.id}><div className="record-details"><strong>{n.title}{!n.readAt?' · 새 알림':''}</strong><p>{n.body}</p><small>{new Date(n.createdAt).toLocaleString('ko-KR',{timeZone:'Asia/Seoul'})}</small></div>{!n.readAt&&<button className="small" onClick={()=>void mark(n.id)}>읽음 처리</button>}</div>)}
 </section>;
}
