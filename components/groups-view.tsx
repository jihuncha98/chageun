'use client';
import {useCallback,useEffect,useRef,useState,type FormEvent} from 'react';
import {supabase} from '../lib/supabase';
import {friendLastSeen,friendTime,validFriendCode} from '../lib/friends';
import {clampGroupPage,GROUP_BOARD_PAGE_SIZE,groupPageCount,groupViewDescription,validGroupName,type GroupBoardRow,type GroupOverview,type StudyGroup} from '../lib/groups';

const message=(error:unknown)=>error instanceof Error?error.message:'연결을 확인해 주세요.';
const initialOverview:GroupOverview={groups:[],invitations:[]};
export default function GroupsView({now}:{now:number}){
 const [overview,setOverview]=useState<GroupOverview>(initialOverview);
 const [board,setBoard]=useState<GroupBoardRow[]>([]);
 const [selectedId,setSelectedId]=useState('');
 const [page,setPage]=useState(1);
 const [memberShown,setMemberShown]=useState(20);
 const [groupName,setGroupName]=useState('');
 const [inviteCode,setInviteCode]=useState('');
 const [busy,setBusy]=useState(false);
 const [shareEnabled,setShareEnabled]=useState(true);
 const [loading,setLoading]=useState(true);
 const [error,setError]=useState('');
 const [notice,setNotice]=useState('');
 const mounted=useRef(true);
 const serial=useRef(0);
 const fetching=useRef(false);
 const selectedRef=useRef('');
 const pageRef=useRef(1);
 const group=overview.groups.find(g=>g.id===selectedId);
 const pageCount=groupPageCount(group?.members.length??0);

 const refresh=useCallback(async(force=false,overrideGroup?:string,overridePage?:number)=>{
  if(!supabase)return;
  if(!navigator.onLine){if(mounted.current){setError('오프라인이에요. 연결을 복구한 뒤 새로고침해 주세요.');setLoading(false);}return;}
  if(fetching.current&&!force)return;
  fetching.current=true;
  const req=++serial.current;
  try{
   const init=await supabase.rpc('friend_profile_upsert');
   if(init.error)throw init.error;
   const {data,error:overviewError}=await supabase.rpc('group_overview');
   if(overviewError)throw overviewError;
   const next=(data??initialOverview) as GroupOverview;
   const requested=overrideGroup??selectedRef.current;
   const target=next.groups.find(g=>g.id===requested)?.id??next.groups[0]?.id??'';
   const total=next.groups.find(g=>g.id===target)?.members.length??0;
   const number=clampGroupPage(overridePage??pageRef.current,total);
   let nextBoard:GroupBoardRow[]=[];
   if(target){
    const {data:rows,error:boardError}=await supabase.rpc('group_board',{
     p_group:target,p_offset:(number-1)*GROUP_BOARD_PAGE_SIZE,p_limit:GROUP_BOARD_PAGE_SIZE
    });
    if(boardError)throw boardError;
    nextBoard=(rows??[]) as GroupBoardRow[];
   }
   if(!mounted.current||req!==serial.current)return;
   setShareEnabled((init.data as {shareEnabled?:boolean}|null)?.shareEnabled!==false);
   selectedRef.current=target;pageRef.current=number;
   setSelectedId(target);setPage(number);setOverview(next);setBoard(nextBoard);setError('');
  }catch(e){if(mounted.current&&req===serial.current)setError(`그룹 정보를 불러오지 못했어요. SQL 003 적용 여부를 확인해 주세요. (${message(e)})`);}
  finally{if(req===serial.current){fetching.current=false;if(mounted.current)setLoading(false);}}
 },[]);
 useEffect(()=>{
  mounted.current=true;
  // Schedule network state updates after effects so React's effect lint stays satisfied.
  const first=setTimeout(()=>{if(mounted.current)void refresh();},0);
  const timer=setInterval(()=>{if(mounted.current)void refresh();},45000);
  const visible=()=>{if(document.visibilityState==='visible')void refresh();};
  const online=()=>void refresh();
  document.addEventListener('visibilitychange',visible);window.addEventListener('online',online);
  return()=>{mounted.current=false;clearTimeout(first);clearInterval(timer);document.removeEventListener('visibilitychange',visible);window.removeEventListener('online',online);};
 },[refresh]);
 async function act(name:string,args:Record<string,unknown>,success:string){
  if(!supabase||busy)return false;
  setBusy(true);setError('');setNotice('');
  try{
   const {data,error:rpcError}=await supabase.rpc(name,args);
   if(rpcError)throw rpcError;
   setNotice(success);
   if(name==='group_create'&&typeof data==='string'){
    selectedRef.current=data;pageRef.current=1;setSelectedId(data);setPage(1);
   }
   await refresh(true);
   return true;
  }catch(e){setError(message(e));return false;}
  finally{setBusy(false);}
 }
 function pick(id:string){selectedRef.current=id;pageRef.current=1;setSelectedId(id);setPage(1);setMemberShown(20);setBoard([]);setError('');void refresh(true,id,1);}
 function changePage(next:number){const n=clampGroupPage(next,group?.members.length??0);pageRef.current=n;setPage(n);setBoard([]);void refresh(true,selectedId,n);}
 async function create(e:FormEvent<HTMLFormElement>){e.preventDefault();if(!validGroupName(groupName)){setError('그룹 이름은 2~40자로 입력해 주세요.');return;}if(await act('group_create',{p_name:groupName.trim()},'그룹을 만들었어요. 친구 코드를 입력해 초대해 보세요.'))setGroupName('');}
 async function invite(e:FormEvent<HTMLFormElement>){e.preventDefault();if(!group)return;if(!validFriendCode(inviteCode)){setError('16자리 친구 코드를 정확히 입력해 주세요.');return;}if(await act('group_invite',{p_group:group.id,p_code:inviteCode.trim().toUpperCase()},'초대를 보냈어요. 상대방이 수락하면 그룹원이 돼요.'))setInviteCode('');}
 const pageNumbers=Array.from({length:Math.min(5,pageCount)},(_,i)=>Math.max(1,Math.min(pageCount-4,page-2))+i);
 return <div className="groups-view">
  <section className="card">
   <div className="section-title"><h2>함께 공부하는 그룹</h2><button className="small" disabled={busy||loading} onClick={()=>void refresh(true)}>새로고침</button></div>
   <p>그룹을 만들고 친구 코드로 초대해 보세요. 초대를 받은 사람이 <strong>수락하면</strong> 그룹원 모두가 서로의 오늘 순공 시간과 공부 상태를 볼 수 있어요. 그룹은 날짜가 바뀌어도 유지돼요.</p>
   <p className="fine">그룹에 가입해도 1:1 친구가 자동 추가되지는 않지만, 그룹 안에서는 별도 친구 신청 없이 서로 연결돼요. 개인 할 일·시간표·과거 기록·이메일은 공유하지 않아요.</p>
   {loading&&<p role="status">그룹을 불러오는 중…</p>}
   {error&&<p role="alert" className="notice error">{error}</p>}
   {notice&&<p role="status" className="notice">{notice}</p>}
   <form className="group-create-form" onSubmit={create}>
    <label>새 그룹 이름<input value={groupName} onChange={e=>setGroupName(e.target.value)} maxLength={40} minLength={2} placeholder="예: 함께 수능 준비" required/></label>
    <button className="primary compact" disabled={busy||loading||!validGroupName(groupName)}>+ 그룹 만들기</button>
   </form>
  </section>
  {overview.invitations.length>0&&<section className="card below"><h2>받은 그룹 초대 · {overview.invitations.length}</h2>
   {overview.invitations.map(inv=><div className="record-row" key={inv.id}><div className="record-details"><strong>{inv.name}</strong><p>{inv.ownerName}님이 그룹으로 초대했어요.</p></div><div className="actions"><button className="small blue" disabled={busy} onClick={()=>void act('group_respond',{p_group:inv.id,p_accept:true},'그룹 초대를 수락했어요.')}>참여</button><button className="small" disabled={busy} onClick={()=>void act('group_respond',{p_group:inv.id,p_accept:false},'그룹 초대를 거절했어요.')}>거절</button></div></div>)}
  </section>}
  {overview.groups.length>0&&<section className="card below"><div className="section-title"><h2>내 그룹</h2><span>{overview.groups.length}개 그룹</span></div>
   <div className="group-picker" role="group" aria-label="그룹 선택">{overview.groups.map(g=><button type="button" className="group-picker-button" aria-pressed={g.id===selectedId} onClick={()=>pick(g.id)} key={g.id}><strong>{g.name}</strong><small>{g.members.length}명 · {g.isOwner?'관리자':'그룹원'}</small></button>)}</div>
  </section>}
  {group&&<>
   <section className="card below">
    <div className="section-title"><h2>{group.name}</h2><span>그룹원 {group.members.length}명</span></div>
    <p>그룹의 공부 시간 순위는 한국 시간 오전 6시에 새 학습일로 시작해요. 그룹 멤버십은 자동 초기화되지 않아요.</p>
    {!shareEnabled&&<p className="notice">{groupViewDescription(false)}</p>}
    <div className="group-rank-list">{board.map(row=><article key={row.member_id} className={`friend-rank-row ${row.is_me?'friend-self':''}`}>
     <div className="friend-rank-number">{row.position===null?'—':`${row.position}위`}</div>
     <div className="friend-rank-user"><strong>{row.display_name}{row.is_me?' (나)':''}</strong><span>{row.shared?(row.studying?'● 공부 중':'○ 공부 중 아님'):'공유하지 않음'}</span><small>{row.shared?friendLastSeen(row.last_seen_at,now):'활동 정보 비공개'}</small></div>
     <div className="friend-rank-time">{friendTime(row.total_ms)}</div>
    </article>)}{board.length===0&&<p className="empty">표시할 순위가 없어요.</p>}</div>
    {pageCount>1&&<div className="record-pagination" role="navigation" aria-label="그룹 순위 페이지">
     <button className="small" onClick={()=>changePage(1)} disabled={busy||page===1} aria-label="첫 페이지">« 처음</button>
     <button className="small" onClick={()=>changePage(page-1)} disabled={busy||page===1} aria-label="이전 페이지">‹ 이전</button>
     {pageNumbers.map(n=><button key={n} className="small" aria-current={n===page?'page':undefined} onClick={()=>changePage(n)} disabled={busy}>{n}</button>)}
     <button className="small" onClick={()=>changePage(page+1)} disabled={busy||page===pageCount} aria-label="다음 페이지">다음 ›</button>
     <button className="small" onClick={()=>changePage(pageCount)} disabled={busy||page===pageCount} aria-label="마지막 페이지">끝 »</button>
    </div>}
   </section>
   <section className="card below"><div className="section-title"><h2>그룹원</h2><span>{group.members.length}명</span></div>
    {group.members.slice(0,memberShown).map(member=><div className="record-row" key={member.userId}>
     <div className="record-details"><strong>{member.nickname}</strong><p>{member.isOwner?'그룹 관리자':'그룹원'}</p></div>
     {group.isOwner&&!member.isOwner&&<div className="actions">
      <button type="button" className="small" disabled={busy} onClick={()=>{if(confirm(`${member.nickname}님에게 그룹 관리자 권한을 넘길까요?`))void act('group_transfer_owner',{p_group:group.id,p_new_owner:member.userId},'그룹 관리자를 변경했어요.');}}>관리자 이전</button>
      <button type="button" className="small" disabled={busy} onClick={()=>{if(confirm(`${member.nickname}님을 이 그룹에서 내보낼까요?`))void act('group_remove_member',{p_group:group.id,p_member:member.userId},'그룹원을 내보냈어요.');}}>내보내기</button>
     </div>}
    </div>)}
    {group.members.length>memberShown&&<button className="small" onClick={()=>setMemberShown(n=>n+20)}>그룹원 더 보기 ({group.members.length-memberShown}명 남음)</button>}
    {group.isOwner&&<>
     <form className="friend-code-form group-invite-form" onSubmit={invite}><label>친구 코드로 초대<input value={inviteCode} onChange={e=>setInviteCode(e.target.value.replace(/\s/g,'').toUpperCase())} maxLength={16} placeholder="상대방의 16자리 친구 코드" required/></label><button className="primary compact" disabled={busy||!validFriendCode(inviteCode)}>초대 보내기</button></form>
     {group.pendingInvites.length>0&&<div className="group-pending"><h3>수락 대기 중 · {group.pendingInvites.length}명</h3>{group.pendingInvites.map(member=><div className="record-row" key={member.userId}><span>{member.nickname}</span><button className="small" disabled={busy} onClick={()=>void act('group_remove_member',{p_group:group.id,p_member:member.userId},'초대를 취소했어요.')}>초대 취소</button></div>)}</div>}
    </>}
   </section>
   <section className="card below"><h2>그룹 관리</h2><p>{group.isOwner?'관리자는 그룹을 삭제하거나 다른 그룹원에게 관리 권한을 넘길 수 있어요.':'그룹에서 나가면 이 그룹을 통한 공부 시간 공유가 끝나요.'}</p>
    {group.isOwner?<button className="small" disabled={busy} onClick={()=>{if(confirm(`「${group.name}」 그룹을 삭제할까요? 모든 그룹원과 초대가 삭제되며 되돌릴 수 없어요. 개인 공부 기록은 삭제되지 않아요.`))void act('group_delete',{p_group:group.id},'그룹을 삭제했어요.');}}>그룹 삭제</button>:<button className="small" disabled={busy} onClick={()=>{if(confirm(`「${group.name}」 그룹에서 나갈까요?`))void act('group_leave',{p_group:group.id},'그룹에서 나왔어요.');}}>그룹 나가기</button>}
   </section>
  </>}
  {!loading&&!overview.groups.length&&!overview.invitations.length&&<p className="empty">아직 참여 중인 그룹이 없어요. 그룹을 만들거나 친구에게 초대를 요청해 보세요.</p>}
 </div>;
}
