'use client';
import {useEffect,useState} from 'react';
import {supabase} from '../lib/supabase';

export default function StatisticsSharingSettings(){
 const [enabled,setEnabled]=useState<boolean|null>(null);
 const [saving,setSaving]=useState(false);
 const [notice,setNotice]=useState('');
 useEffect(()=>{
  const client=supabase;
  const controller=new AbortController();
  async function load(){
   try{
    if(!client)throw Error('서버에 연결되지 않았어요.');
    const {data,error}=await client.rpc('chageun_statistics_sharing').abortSignal(controller.signal);
    if(controller.signal.aborted)return;
    if(error)throw Error(error.message);
    setEnabled(data===true);
   }catch{
    if(!controller.signal.aborted)setNotice('통계 공개 설정을 불러오지 못했어요.');
   }
  }
  void load();
  return()=>controller.abort();
 },[]);
 async function toggle(){
  if(!supabase||enabled===null||saving)return;
  setSaving(true);
  setNotice('');
  try{
   const {data,error}=await supabase.rpc('chageun_statistics_sharing',{p_enabled:!enabled});
   if(error)throw Error(error.message);
   setEnabled(data===true);
  }catch{
   setNotice('통계 공개 설정을 저장하지 못했어요.');
  }finally{
   setSaving(false);
  }
 }
 return <section className="card below">
  <div className="section-title">
   <h2>내 공부 통계 공개</h2>
   <button type="button" className="small" aria-pressed={enabled??undefined} disabled={enabled===null||saving} onClick={()=>void toggle()}>
    {saving?'저장 중…':enabled===null?(notice?'확인 불가':'확인 중…'):enabled?'공개 끄기':'공개 켜기'}
   </button>
  </div>
  <p>켜면 직접 친구와 같은 그룹원이 날짜별 순공 시간과 과목별 합계를 볼 수 있어요.</p>
  {notice&&<p role="status" className="notice">{notice}</p>}
 </section>;
}
