'use client';
import {ShopAdmin} from './shop';

import {BroadcastAdminPanel} from './broadcast-notices';
import {useCallback,useEffect,useState,type FormEvent} from 'react';
import {supabase} from '../lib/supabase';
import {duration} from '../lib/study';
import {personName} from '../lib/visible-names';

type UserRow={id:string;email:string|null;nickname:string;displayName?:string|null;friendCode:string|null;createdAt:string;isAdmin:boolean};
type StudyRecord={id:string;start:number;end:number|null;title:string;deleted?:boolean};
type StudyRecords={revision:string|null;records:StudyRecord[]};
type NameEdit={id:string;kind:'display'|'nickname';value:string;reason:string};
type Member={userId:string;nickname:string;joinedAt:string|null;status:'accepted'|'pending';isOwner:boolean};
type GroupRow={id:string;name:string;ownerId:string;createdAt:string;members:Member[]};
type Archived={id:string;name:string;deletedAt:string;expiresAt:string;memberCount:number};
type Audit={action:string;reason:string;at:string;targetUserId:string|null;targetGroupId:string|null;detail:Record<string,unknown>};
type Overview={users:UserRow[];groups:GroupRow[];archivedGroups:Archived[];audit:Audit[]};
const EMPTY:Overview={users:[],groups:[],archivedGroups:[],audit:[]};
const kstInput=(ms:number)=>new Date(ms+9*3600000).toISOString().slice(0,23);
const koreanTime=(value:string)=>new Date(value).toLocaleString('ko-KR',{timeZone:'Asia/Seoul'});
const readable=(err:unknown)=>err && typeof err==='object' && 'message' in err && typeof err.message==='string'?err.message:'서버 요청에 실패했어요.';

export default function AdminPanel(){
 const [data,setData]=useState<Overview>(EMPTY);
 const [busy,setBusy]=useState(false);
 const [loading,setLoading]=useState(true);
 const [error,setError]=useState('');
 const [notice,setNotice]=useState('');
 const [search,setSearch]=useState('');
 const [reason,setReason]=useState('');
 const [section,setSection]=useState<'users'|'groups'|'archived'|'history'|'notifications'|'shop'>('users');

 const [study,setStudy]=useState<{user:string;result:StudyRecords}|null>(null);
 async function loadStudy(user:string){
  if(!supabase||busy)return;
  setFeedbackUser(user);setBusy(true);setError('');setNotice('');
  try{
   const {data,error}=await supabase.rpc('chageun_admin_study_records',{p_user:user});
   if(error)throw error;
   setStudy({user,result:data as StudyRecords});
  }catch(error){setError(readable(error));}
  finally{setBusy(false);}
 }
 const [nameEdit,setNameEdit]=useState<NameEdit|null>(null);
 const refresh=useCallback(async()=>{
  if(!supabase)return;
  const {data:result,error:rpcError}=await supabase.rpc('chageun_admin_dashboard');
  if(rpcError)throw rpcError;
  if(!result||!Array.isArray(result.users)||!Array.isArray(result.groups)||
     !Array.isArray(result.archivedGroups)||!Array.isArray(result.audit)||
     result.users.some((user:UserRow)=>!user||typeof user.id!=='string'||
       (user.displayName!=null&&typeof user.displayName!=='string')||(user.nickname!=null&&typeof user.nickname!=='string'))||
     result.groups.some((group:GroupRow)=>!group||!Array.isArray(group.members))){
   throw new Error('회원·그룹 목록의 서버 응답을 확인해 주세요.');
  }
  setData(result as Overview);
 },[]);
 useEffect(()=>{
  let alive=true;
  // Schedule the initial load rather than synchronously dispatching state updates inside an effect.
  // This also prevents a scheduled request from starting after the component is unmounted.
  const timer=setTimeout(()=>{
   void refresh().catch(e=>{if(alive)setError(readable(e));}).finally(()=>{if(alive)setLoading(false);});
  },0);
  return()=>{alive=false;clearTimeout(timer);};
 },[refresh]);
 async function act(fn:string,args:Record<string,unknown>,done:string,actionReason=reason,feedbackId=''):Promise<boolean>{
  setFeedbackUser(feedbackId);
  if(!supabase||busy)return false;
  if(actionReason.trim().length<2||actionReason.trim().length>150){setError('조치 사유를 2~150자로 입력해 주세요.');return false;}
  setBusy(true);setError('');setNotice('');
  try{
   const {error:rpcError}=await supabase.rpc(fn,{...args,p_reason:actionReason.trim()});
   if(rpcError)throw rpcError;
   await refresh();setNotice(done);setReason('');return true;
  }catch(e){setError(readable(e));return false;}
  finally{setBusy(false);}
 }
 function beginNameEdit(user:UserRow,kind:'display'|'nickname'){
  setError('');setNotice('');setFeedbackUser('');
  setNameEdit({id:user.id,kind,value:kind==='display'?user.displayName??'':user.nickname,reason:reason.trim()});
 }
 async function saveName(e:FormEvent<HTMLFormElement>){
  e.preventDefault();
  if(!nameEdit)return;
  const user=data.users.find(u=>u.id===nameEdit.id);
  if(!user||user.isAdmin)return;
  const value=nameEdit.value.trim().replace(/\s+/g,' ');
  const reasonText=nameEdit.reason.trim();
  setFeedbackUser(user.id);setError('');setNotice('');
  if(reasonText.length<2||reasonText.length>150){setError('변경 사유는 2~150자로 입력해 주세요.');return;}
  const isDisplay=nameEdit.kind==='display';
  if(!value||value.length>(isDisplay?24:20)||(!isDisplay&&value.length<2)){
   setError(isDisplay?'표시 이름은 1~24자로 입력해 주세요.':'친구 별명은 2~20자로 입력해 주세요.');return;
  }
  if(value===(isDisplay?user.displayName??'':user.nickname)){
   setNotice('현재 이름과 같아요. 변경할 이름을 입력해 주세요.');return;
  }
  const success=await act(isDisplay?'chageun_admin_set_display_name':'chageun_admin_set_nickname',
   isDisplay?{p_user:user.id,p_name:value,p_expected:user.displayName??null}:{p_user:user.id,p_nickname:value},
   `${isDisplay?'표시 이름':'친구 별명'}을 「${value}」(으)로 변경했어요.`,reasonText,user.id);
  if(success)setNameEdit(null);
 }
 const [feedbackUser,setFeedbackUser]=useState('');

 const adminNames=new Map(data.users.map(user=>[user.id,personName(user.displayName,user.nickname)]));
 const filtered=data.users.filter(x=>`${x.nickname} ${x.displayName??''} ${x.friendCode??''} ${x.email??''}`.toLowerCase().includes(search.trim().toLowerCase()));
 return <div className="admin-panel">
  <section className="card"><p className="eyebrow">ADMINISTRATION</p><h2>차근 전체 관리자</h2>
   <div className="admin-tabs">{([['users','회원 관리'],['groups','그룹 관리'],['archived','삭제된 그룹'],['history','관리 기록'],['notifications','알림 발송'],['shop','크레딧/상점 관리']] as const).map(([key,name])=><button className="small" aria-pressed={section===key} key={key} onClick={()=>setSection(key)}>{name}</button>)}</div>
   {error&&<p role="alert" className="notice error">{error}</p>}{notice&&<p role="status" className="notice">{notice}</p>}
   {loading?<p>관리자 정보를 불러오는 중…</p>:<>
    {section!=='shop'&&section!=='history'&&section!=='notifications'&&<label>관리자 조치 사유 (필수)<input value={reason} maxLength={150} placeholder="예: 그룹 운영 요청, 부적절한 별명 수정" onChange={e=>setReason(e.target.value)}/></label>}
    {section==='users'&&<>
     <label>회원 검색 (표시 이름·별명·이메일·친구 코드)<input value={search} onChange={e=>setSearch(e.target.value)} placeholder="검색어 입력"/></label>
     <div className="admin-list">{filtered.map(user=><div className="admin-item" key={user.id}>
      <div className="admin-item-details"><strong>{personName(user.displayName,user.nickname)}</strong>{user.isAdmin&&<span className="admin-status">전체 관리자</span>}<p>{user.email??'이메일 확인 불가'}</p><small>표시 이름: {user.displayName||'미설정'} · 친구 별명: {user.nickname} · 친구 코드: {user.friendCode??'미설정'}</small></div>
      {!user.isAdmin&&<div className="admin-actions">
       <button className="small" disabled={busy||user.displayName===undefined} onClick={()=>beginNameEdit(user,'display')}>표시 이름 수정</button>
       <button className="small" disabled={busy} onClick={()=>beginNameEdit(user,'nickname')}>친구 별명 수정</button>

       <button className="small" disabled={busy} onClick={()=>void loadStudy(user.id)}>공부 기록 관리</button>
       {study?.user===user.id&&<section className="admin-item">
        <button className="small" onClick={()=>setStudy(null)}>닫기</button>
        {!study.result.records.length&&<p>수정 가능한 공부 기록이 없어요.</p>}
        {study.result.records.map(record=>{
         const maxMinutes=record.end===null?0:Math.ceil((record.end-record.start)/60000)-1;
         return <div className="admin-item" key={record.id}>
        {!record.deleted&&<form onSubmit={async e=>{
         e.preventDefault();
         const form=new FormData(e.currentTarget);
         const hours=Number(form.get('hours'));
         const minutes=Number(form.get('minutes'));
         const totalMinutes=hours*60+minutes;
         const seconds=record.end===null?null:totalMinutes*60;
         if(seconds!==null&&(!Number.isInteger(hours)||hours<0||!Number.isInteger(minutes)||minutes<0||minutes>59||totalMinutes<1||totalMinutes>maxMinutes)){
          setFeedbackUser(user.id);
          setError(`차감 시간은 1분 이상, 최대 ${Math.floor(maxMinutes/60)}시간 ${maxMinutes%60}분까지 입력해 주세요.`);
          return;
         }
         const message=seconds===null?'이 타이머를 지금 정지할까요?':`이 기록에서 ${hours}시간 ${minutes}분을 차감할까요?`;
         if(reason.trim().length<2){setFeedbackUser(user.id);setError('조치 사유를 2~150자로 입력해 주세요.');return;}
         if(!window.confirm(message))return;
         const saved=await act('chageun_admin_adjust_study',{p_user:user.id,p_entry:record.id,p_revision:study.result.revision,p_seconds:seconds},
          seconds===null?'타이머를 정지했어요.':'공부 시간을 차감했어요.',reason,user.id);
         if(saved)setStudy(null);
        }}>
         <strong>{record.title}</strong>
         <p>{koreanTime(new Date(record.start).toISOString())} · {record.end===null?'실행 중':duration(record.end-record.start)}</p>
         {record.end!==null&&(maxMinutes>0?<fieldset>
          <legend>차감 시간</legend>
          <label>시간<input name="hours" type="number" min={0} max={Math.floor(maxMinutes/60)} step={1} placeholder="0"/></label>
          <label>분<input name="minutes" type="number" min={0} max={Math.min(59,maxMinutes)} step={1} placeholder="0"/></label>
         </fieldset>:<p>공부 기록이 1분을 초과해야 차감할 수 있어요.</p>)}
         <button className="small" disabled={busy||(record.end!==null&&maxMinutes<1)}>{record.end===null?'타이머 정지':'공부 시간 차감'}</button>
        </form>}
        {record.end!==null&&<form onSubmit={async e=>{
         e.preventDefault();
         const form=new FormData(e.currentTarget);
         const button=(e.nativeEvent as SubmitEvent).submitter as HTMLButtonElement|null;
         const action=button?.value||'edit';
         const time=(key:string)=>Date.parse(String(form.get(key))+'+09:00');
         const start=action==='edit'?time('start'):null;
         const end=action==='edit'?time('end'):null;
         if(action==='edit'&&(!Number.isFinite(start)||!Number.isFinite(end))){setFeedbackUser(user.id);setError('시작·종료 시각을 확인해 주세요.');return;}
         if(!window.confirm(action==='delete'?'이 기록을 휴지통으로 보낼까요?':action==='restore'?'이 기록을 복구할까요?':'공부 기록의 시각을 변경할까요?'))return;
         if(await act('chageun_admin_edit_study',{p_user:user.id,p_entry:record.id,p_revision:study.result.revision,p_action:action,p_start:start,p_end:end},'공부 기록을 변경했어요.',reason,user.id))setStudy(null);
        }}>
         {record.deleted?<><p>{record.title} · {koreanTime(new Date(record.start).toISOString())} · 휴지통</p><button className="small" value="restore" disabled={busy}>복구</button></>:<>
          <label>시작 시각 (한국)<input type="datetime-local" name="start" step="0.001" defaultValue={kstInput(record.start)} required/></label>
          <label>종료 시각 (한국)<input type="datetime-local" name="end" step="0.001" defaultValue={kstInput(record.end)} required/></label>
          <button className="small" value="edit" disabled={busy}>시각 저장</button>
          <button className="small" value="delete" formNoValidate disabled={busy}>휴지통으로 보내기</button>
         </>}
        </form>}
        </div>})}
       </section>}
       <button className="small" disabled={busy||!user.email} onClick={()=>{
        setFeedbackUser(user.id);setError('');setNotice('');
        if(reason.trim().length<2||reason.trim().length>150){setError('먼저 관리자 조치 사유를 2~150자로 입력해 주세요.');return;}
        const email=window.prompt(`${user.nickname}님의 계정과 공부 기록을 영구 삭제합니다. 남은 정식 그룹원이 있으면 그룹장이 승계됩니다. 없으면 그룹과 초대가 삭제됩니다. 계속하려면 대상 이메일을 입력하세요.`);
        if(email===null)return;
        if(email.trim().toLowerCase()!==user.email?.toLowerCase()){setError('대상 이메일이 일치하지 않아요.');return;}
        void act('chageun_delete_account',{p_user:user.id,p_email:email},'회원 계정을 삭제했어요.',reason,user.id);
       }}>회원 영구 삭제</button>
      </div>}
      {nameEdit?.id===user.id&&<form className="admin-name-editor" onSubmit={e=>void saveName(e)}>
       <h3>{nameEdit.kind==='display'?'표시 이름 수정':'친구 별명 수정'}</h3>
       <p className="fine">{nameEdit.kind==='display'?'다른 사람의 친구·그룹 목록에도 표시되는 이름이에요.':'표시 이름과는 별도로 친구·그룹에서 함께 표시되는 별명이에요.'}</p>
       <label>현재 이름<input readOnly value={nameEdit.kind==='display'?user.displayName??'미설정':user.nickname}/></label>
       <label>새 {nameEdit.kind==='display'?'표시 이름':'친구 별명'}
        <input required minLength={nameEdit.kind==='display'?1:2} maxLength={nameEdit.kind==='display'?24:20}
         value={nameEdit.value} onChange={e=>setNameEdit({...nameEdit,value:e.target.value})} placeholder="변경할 이름"/>
       </label>
       <label>변경 사유 (2~150자)
        <input required minLength={2} maxLength={150} value={nameEdit.reason}
         onChange={e=>setNameEdit({...nameEdit,reason:e.target.value})} placeholder="예: 본인 요청"/>
       </label>
       <div className="admin-actions">
        <button className="small blue" disabled={busy} type="submit">{busy?'저장 중…':'변경 저장'}</button>
        <button className="small" type="button" disabled={busy} onClick={()=>setNameEdit(null)}>취소</button>
       </div>
      </form>}
      {feedbackUser===user.id&&(error||notice)&&<p className={error?'notice error':'notice'} role="status">{error||notice}</p>}
     </div>)}</div>

    </>}
    {section==='groups'&&<div className="admin-list">{data.groups.map(group=><div className="admin-item" key={group.id}>
     <div className="admin-item-details"><strong>{group.name}</strong><p>구성원 {group.members.filter(x=>x.status==='accepted').length}명 · 생성 {koreanTime(group.createdAt)}</p></div>

   <form onSubmit={e=>{
    e.preventDefault();
    const name=String(new FormData(e.currentTarget).get('name')??'').trim();
    if(name!==group.name)void act('chageun_admin_rename_group',{p_group:group.id,p_name:name},'그룹 이름을 변경했어요.');
   }}>
    <label>그룹 이름<input key={group.name} name="name" defaultValue={group.name} minLength={2} maxLength={40} required/></label>
    <button className="small" disabled={busy}>이름 저장</button>
   </form>
   <div className="admin-members">{group.members.map(m=><div className="admin-member" key={m.userId}>
      <span>{adminNames.get(m.userId)??m.nickname} {m.isOwner?'· 그룹 관리자':m.status==='pending'?'· 초대 대기':''}</span>
      <div className="admin-actions">
       {!m.isOwner&&m.status==='accepted'&&<button className="small" disabled={busy} onClick={()=>{if(window.confirm(`${m.nickname}님을 이 그룹의 관리자로 지정할까요?`))void act('chageun_admin_transfer_owner',{p_group:group.id,p_new_owner:m.userId},'그룹 관리자를 변경했어요.');}}>관리자 지정</button>}
       {!m.isOwner&&<button className="small" disabled={busy} onClick={()=>{if(window.confirm(`${m.nickname}님을 그룹에서 강제 탈퇴시킬까요? 새 초대를 받으면 재가입할 수 있어요.`))void act('chageun_admin_remove_member',{p_group:group.id,p_user:m.userId},'그룹원을 강제 탈퇴시켰어요.');}}>강제 탈퇴</button>}
      </div>
     </div>)}</div>
     <div className="admin-actions"><button className="small" disabled={busy} onClick={()=>{
      const typed=window.prompt(`「${group.name}」 그룹을 삭제하려면 그룹 이름을 정확히 입력해 주세요.`);
      if(typed===group.name&&window.confirm('그룹은 즉시 숨겨지고 전체 관리자만 7일 이내에 복구할 수 있어요. 삭제할까요?'))void act('chageun_admin_delete_group',{p_group:group.id,p_confirm_name:typed},'그룹을 7일 복구 대기로 이동했어요.');
      else if(typed!==null&&typed!==group.name)setError('그룹 이름이 일치하지 않아 삭제하지 않았어요.');
     }}>그룹 삭제 (7일 복구)</button></div>
    </div>)}</div>}
    {section==='archived'&&<div className="admin-list">{data.archivedGroups.map(g=><div className="admin-item" key={g.id}><strong>{g.name}</strong><p>삭제: {koreanTime(g.deletedAt)} · 복구 만료: {koreanTime(g.expiresAt)}</p><p>삭제 당시 구성원·초대 {g.memberCount}개</p><button className="small" disabled={busy} onClick={()=>{if(window.confirm(`「${g.name}」 그룹을 복구할까요?`))void act('chageun_admin_restore_group',{p_group:g.id},'그룹을 복구했어요.');}}>그룹 복구</button></div>)}</div>}
    {section==='shop'&&<ShopAdmin users={data.users}/>}
    {section==='notifications'&&<BroadcastAdminPanel/>}
    {section==='history'&&<div className="admin-list">{data.audit.map((l,i)=><div className="admin-item" key={`${l.at}-${i}`}><strong>{l.action}</strong><p>{l.reason}</p><small>{koreanTime(l.at)}</small></div>)}</div>}
   </>}
  </section>
 </div>;
}
