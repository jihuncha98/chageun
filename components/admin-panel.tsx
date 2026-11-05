'use client';
import {useCallback,useEffect,useState} from 'react';
import {supabase} from '../lib/supabase';

type UserRow={id:string;email:string|null;nickname:string;friendCode:string|null;createdAt:string;isAdmin:boolean};
type Member={userId:string;nickname:string;joinedAt:string|null;status:'accepted'|'pending';isOwner:boolean};
type GroupRow={id:string;name:string;ownerId:string;createdAt:string;members:Member[]};
type Archived={id:string;name:string;deletedAt:string;expiresAt:string;memberCount:number};
type Audit={action:string;reason:string;at:string;targetUserId:string|null;targetGroupId:string|null;detail:Record<string,unknown>};
type Overview={users:UserRow[];groups:GroupRow[];archivedGroups:Archived[];audit:Audit[]};
const EMPTY:Overview={users:[],groups:[],archivedGroups:[],audit:[]};
const koreanTime=(value:string)=>new Date(value).toLocaleString('ko-KR',{timeZone:'Asia/Seoul'});
const readable=(err:unknown)=>err instanceof Error?err.message:'서버 요청에 실패했어요.';

export default function AdminPanel(){
 const [data,setData]=useState<Overview>(EMPTY);
 const [busy,setBusy]=useState(false);
 const [loading,setLoading]=useState(true);
 const [error,setError]=useState('');
 const [notice,setNotice]=useState('');
 const [search,setSearch]=useState('');
 const [reason,setReason]=useState('');
 const [section,setSection]=useState<'users'|'groups'|'archived'|'history'>('users');
 const [selection,setSelection]=useState('');
 const refresh=useCallback(async()=>{
  if(!supabase)return;
  const {data:result,error:rpcError}=await supabase.rpc('chageun_admin_dashboard');
  if(rpcError)throw rpcError;
  setData((result??EMPTY) as Overview);
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
 async function act(fn:string,args:Record<string,unknown>,done:string){
  if(!supabase||busy)return;
  if(reason.trim().length<2){setError('먼저 조치 사유를 두 글자 이상 입력해 주세요.');return;}
  setBusy(true);setError('');setNotice('');
  try{
   const {error:rpcError}=await supabase.rpc(fn,{...args,p_reason:reason.trim()});
   if(rpcError)throw rpcError;
   await refresh();setNotice(done);setReason('');
  }catch(e){setError(readable(e));}
  finally{setBusy(false);}
 }
 const selectedUser=data.users.find(x=>x.id===selection);
 const filtered=data.users.filter(x=>`${x.nickname} ${x.friendCode??''} ${x.email??''}`.toLowerCase().includes(search.trim().toLowerCase()));
 return <div className="admin-panel">
  <section className="card"><p className="eyebrow">ADMINISTRATION</p><h2>차근 전체 관리자</h2>
   <p>관리자 권한은 서버에서 확인해요. 별명은 <strong>친구 메뉴의 별명만</strong> 수정하고, 설정의 개인 이름은 변경하지 않아요.</p>
   <p className="notice">회원 계정 영구 삭제는 인증 서버와 그룹 자동 승계 검증을 완료할 때까지 비활성화했어요. 기존 계정과 공부 기록은 이번 업데이트에서 삭제되지 않아요.</p>
   <div className="admin-tabs">{([['users','회원 관리'],['groups','그룹 관리'],['archived','삭제된 그룹'],['history','관리 기록']] as const).map(([key,name])=><button className="small" aria-pressed={section===key} key={key} onClick={()=>setSection(key)}>{name}</button>)}</div>
   {error&&<p role="alert" className="notice error">{error}</p>}{notice&&<p role="status" className="notice">{notice}</p>}
   {loading?<p>관리자 정보를 불러오는 중…</p>:<>
    {section!=='history'&&<label>관리자 조치 사유 (필수)<input value={reason} maxLength={150} placeholder="예: 그룹 운영 요청, 부적절한 별명 수정" onChange={e=>setReason(e.target.value)}/></label>}
    {section==='users'&&<>
     <label>회원 검색 (별명·이메일·친구 코드)<input value={search} onChange={e=>setSearch(e.target.value)} placeholder="검색어 입력"/></label>
     <div className="admin-list">{filtered.map(user=><div className="admin-item" key={user.id}>
      <div className="admin-item-details"><strong>{user.nickname}</strong>{user.isAdmin&&<span className="admin-status">전체 관리자</span>}<p>{user.email??'이메일 확인 불가'}</p><small>친구 코드 {user.friendCode??'미설정'}</small></div>
      {!user.isAdmin&&<div className="admin-actions">
       <button className="small" disabled={busy} onClick={()=>{const value=window.prompt(`${user.nickname}님의 새 친구 별명을 입력해 주세요.`,user.nickname);if(value!==null&&window.confirm(`정말 ${user.nickname}님의 친구 별명을 「${value}」(으)로 변경할까요?`))void act('chageun_admin_set_nickname',{p_user:user.id,p_nickname:value},'친구 별명을 수정했어요.');}}>별명 수정</button>
       <button className="small" disabled={busy} onClick={()=>setSelection(selection===user.id?'':user.id)}>채팅 제한</button>
       <button className="small" disabled aria-label="회원 영구 삭제는 아직 사용할 수 없습니다">회원 삭제 (준비 중)</button>
      </div>}
     </div>)}</div>
     {selectedUser&&!selectedUser.isAdmin&&<div className="admin-limit"><h3>{selectedUser.nickname} · 채팅 제한</h3><p>그룹 채팅 개발 후 서버에서 제한 종료 시각을 검사하도록 연결할 예정이야.</p>
      <div className="admin-actions">{([5,30,60,1440,0] as const).map(n=><button key={n} className="small" disabled={busy} onClick={()=>{const label=n===0?'제한 해제':`${n>=60?n/60+'시간':n+'분'} 제한`;if(window.confirm(`${selectedUser.nickname}님에게 ${label} 조치를 적용할까요?`))void act('chageun_admin_chat_limit',{p_user:selectedUser.id,p_minutes:n},`${label}을(를) 적용했어요.`);}}>{n===0?'제한 해제':n===1440?'24시간':n===60?'1시간':`${n}분`}</button>)}</div>
     </div>}
    </>}
    {section==='groups'&&<div className="admin-list">{data.groups.map(group=><div className="admin-item" key={group.id}>
     <div className="admin-item-details"><strong>{group.name}</strong><p>구성원 {group.members.filter(x=>x.status==='accepted').length}명 · 생성 {koreanTime(group.createdAt)}</p></div>
     <div className="admin-members">{group.members.map(m=><div className="admin-member" key={m.userId}>
      <span>{m.nickname} {m.isOwner?'· 그룹 관리자':m.status==='pending'?'· 초대 대기':''}</span>
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
    {section==='history'&&<div className="admin-list">{data.audit.map((l,i)=><div className="admin-item" key={`${l.at}-${i}`}><strong>{l.action}</strong><p>{l.reason}</p><small>{koreanTime(l.at)}</small></div>)}</div>}
   </>}
  </section>
 </div>;
}
