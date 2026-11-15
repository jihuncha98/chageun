'use client';
import {useEffect,useState} from 'react';
import {supabase} from '../lib/supabase';

function publicKeyBytes(value:string):Uint8Array<ArrayBuffer>{
 const raw=atob(value.replace(/-/g,'+').replace(/_/g,'/'));
 return Uint8Array.from(raw,character=>character.charCodeAt(0));
}
async function pushRequest(body:Record<string,unknown>){
 if(!supabase)throw Error('서버에 연결할 수 없어요.');
 const {data,error}=await supabase.functions.invoke('chageun-push',{body});
 if(error){
  const context=error.context;
  if(context instanceof Response){
   const detail=await context.json().catch(()=>null);
   if(detail?.error)throw Error(detail.error);
  }
  throw Error('알림 서버가 준비되지 않았거나 연결할 수 없어요.');
 }
 return data;
}
async function registration(){
 const base=process.env.NEXT_PUBLIC_BASE_PATH??'/chageun';
 await navigator.serviceWorker.register(base+'/sw.js',{scope:base+'/'});
 return navigator.serviceWorker.ready;
}

export default function PushSettings(){
 const [supported,setSupported]=useState<boolean|null>(null);
 const [enabled,setEnabled]=useState(false);
 const [busy,setBusy]=useState(false);
 const [message,setMessage]=useState('');
 useEffect(()=>{
  let active=true;
  const available='serviceWorker' in navigator&&'PushManager' in window&&'Notification' in window;
  const timer=setTimeout(()=>{
   setSupported(available);
   if(available)void registration().then(r=>r.pushManager.getSubscription()).then(subscription=>{
    if(active)setEnabled(!!subscription);
   }).catch(()=>{if(active)setMessage('알림 연결 상태를 확인할 수 없어요.');});
  },0);
  return()=>{active=false;clearTimeout(timer);};
 },[]);
 async function enable(){
  if(busy)return;
  setBusy(true);setMessage('');
  try{
   // Request directly from the button gesture, before any network waits.
   const permission=await Notification.requestPermission();
   if(permission!=='granted')throw Error('아이패드 설정 → 알림 → 차근에서 알림을 허용해 주세요.');
   const config=await pushRequest({action:'config'});
   const r=await registration();
   const subscription=await r.pushManager.getSubscription()??await r.pushManager.subscribe({
    userVisibleOnly:true,applicationServerKey:publicKeyBytes(config.publicKey)
   });
   await pushRequest({action:'register',subscription:subscription.toJSON()});
   setEnabled(true);setMessage('이 기기 알림을 켰어요. 테스트 알림을 보내 보세요.');
  }catch(error){setMessage(error instanceof Error?error.message:'알림을 켤 수 없어요.');}
  finally{setBusy(false);}
 }
 async function disable(){
  setBusy(true);setMessage('');
  try{
   const subscription=await (await registration()).pushManager.getSubscription();
   if(subscription){
    await pushRequest({action:'unregister',endpoint:subscription.endpoint});
    const removed=await subscription.unsubscribe();
    if(!removed)throw Error('기기 구독 해제에 실패했어요. 다시 눌러 주세요.');
   }
   setEnabled(false);setMessage('이 기기 알림을 껐어요.');
  }catch(error){setMessage(error instanceof Error?error.message:'알림을 끌 수 없어요.');}
  finally{setBusy(false);}
 }
 async function test(){
  setBusy(true);setMessage('');
  try{
   const subscription=await (await registration()).pushManager.getSubscription();
   if(!subscription)throw Error('먼저 이 기기의 알림을 켜 주세요.');
   await pushRequest({action:'test',endpoint:subscription.endpoint});
   setMessage('테스트 알림을 요청했어요. 잠시 후 아이패드 알림 센터를 확인해 주세요.');
  }catch(error){setMessage(error instanceof Error?error.message:'테스트 알림을 요청할 수 없어요.');}
  finally{setBusy(false);}
 }
 return <section className="card below">
  <h2>이 기기 알림</h2>
  <p>관리자의 개인·전체 알림을 잠금 화면과 알림 센터에서 받아요.</p>
  {supported===false?<p className="notice">아이패드는 iPadOS 16.4 이상에서 Safari의 공유 → 홈 화면에 추가 후 차근 아이콘으로 열어 주세요.</p>:
   supported===null?<p>기기 알림 지원을 확인하는 중…</p>:<div className="actions">
    <button className="small" disabled={busy} onClick={()=>void enable()}>이 기기에서 알림 켜기</button>
    {enabled&&<><button className="small" disabled={busy} onClick={()=>void test()}>테스트 알림 보내기</button>
    <button className="small" disabled={busy} onClick={()=>void disable()}>알림 끄기</button></>}
   </div>}
  {message&&<p className="notice" role="status">{message}</p>}
 </section>;
}

export async function stopPushBeforeLogout(){
 if(!('serviceWorker' in navigator))return;
 const base=process.env.NEXT_PUBLIC_BASE_PATH??'/chageun';
 const registered=await navigator.serviceWorker.getRegistration(base+'/');
 const subscription=await registered?.pushManager?.getSubscription();
 if(!subscription)return;
 try{await pushRequest({action:'unregister',endpoint:subscription.endpoint});}
 finally{
  // Browser unsubscribe also invalidates delivery when the server is temporarily offline.
  await subscription.unsubscribe();
 }
}
