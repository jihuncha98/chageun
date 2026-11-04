'use client';
import {useCallback,useEffect,useMemo,useRef,useState,type FormEvent} from 'react';
import {supabase} from '../lib/supabase';
import {sharedStudyTime} from '../lib/live-board-time';
import {studyDay} from '../lib/study-day';
import {friendLastSeen,friendTime,rankFriends,validFriendCode,type FriendBoardRow,type FriendOverview,type FriendProfile} from '../lib/friends';

const message=(error:unknown)=>error instanceof Error?error.message:'연결을 확인해 주세요.';
/** Realtime totals come from the existing private workspace through narrow, authenticated RPCs. */
export default function FriendsView({now}:{now:number}){
 const [overview,setOverview]=useState<FriendOverview|null>(null);
 const [board,setBoard]=useState<FriendBoardRow[]>([]);
 const [boardReceivedAt,setBoardReceivedAt]=useState(0);
 const [nickname,setNickname]=useState('');
 const [code,setCode]=useState('');
 const [busy,setBusy]=useState(false);
 const [loading,setLoading]=useState(true);
 const [error,setError]=useState('');
 const [notice,setNotice]=useState('');
 const alive=useRef(true);
 const initialized=useRef(false);
 const refreshing=useRef(false);
 const refreshSeq=useRef(0);
 const refresh=useCallback(async(force=false)=>{
  const client=supabase;
  if(refreshing.current&&!force)return;
  const requestNumber=++refreshSeq.current;
  if(!client){if(alive.current){setError('Supabase 연결을 확인해 주세요.');setLoading(false);}return;}
  if(!navigator.onLine){if(alive.current){setError('오프라인 상태예요. 인터넷을 연결하면 새로고침해 주세요.');setLoading(false);}return;}
  refreshing.current=true;
  try{
   const init=await client.rpc('friend_profile_upsert');
   if(init.error)throw new Error(`친구 기능을 불러오지 못했어요. SQL 002 적용 여부를 확인해 주세요. (${init.error.message})`);
   const [overviewResult,boardResult]=await Promise.all([
    client.rpc('friend_overview'),client.rpc('friend_board')
   ]);
   if(overviewResult.error)throw overviewResult.error;
   if(boardResult.error)throw boardResult.error;
   if(!alive.current||requestNumber!==refreshSeq.current)return;
   const next=overviewResult.data as FriendOverview;
   setOverview(next);
   setBoard((boardResult.data??[]) as FriendBoardRow[]);
   setBoardReceivedAt(Date.now());
   if(!initialized.current){setNickname(next.profile.nickname);initialized.current=true;}
   setError('');
  }catch(e){if(alive.current&&requestNumber===refreshSeq.current)setError(message(e));}
  finally{if(requestNumber===refreshSeq.current){refreshing.current=false;if(alive.current)setLoading(false);}}
 },[]);
 useEffect(()=>{
  alive.current=true;
  // Defer the first fetch until after this effect completes. React's
  // set-state-in-effect lint rule rejects synchronous refresh() here.
  const initialRefresh=setTimeout(()=>{if(alive.current)void refresh();},0);
  const interval=setInterval(()=>void refresh(),45000);
  const onVisible=()=>{if(document.visibilityState==='visible')void refresh();};
  const onOnline=()=>void refresh();
  document.addEventListener('visibilitychange',onVisible);
  window.addEventListener('online',onOnline);
  return()=>{alive.current=false;clearTimeout(initialRefresh);clearInterval(interval);document.removeEventListener('visibilitychange',onVisible);window.removeEventListener('online',onOnline);};
 },[refresh]);
 const currentStudyDay=studyDay(new Date(now));
 const lastStudyDay=useRef(currentStudyDay);
 useEffect(()=>{
  if(lastStudyDay.current===currentStudyDay)return;
  lastStudyDay.current=currentStudyDay;
  const timer=setTimeout(()=>{if(alive.current)void refresh(true);},0);
  return()=>clearTimeout(timer);
 },[currentStudyDay,refresh]);
 async function act(name:string,args:Record<string,unknown>,success:string){
  if(!supabase||busy)return false;
  setBusy(true);setError('');setNotice('');
  try{
   const {error:failed}=await supabase.rpc(name,args);
   if(failed)throw failed;
   setNotice(success);
   await refresh(true);
   return true;
  }catch(e){setError(message(e));return false;}
  finally{setBusy(false);}
 }
 async function saveProfile(e:FormEvent<HTMLFormElement>){
  e.preventDefault();
  if(!overview)return;
  if(nickname.trim().length<2||nickname.trim().length>20){setError('별명은 2~20자로 입력해 주세요.');return;}
  await act('friend_preferences',{p_nickname:nickname.trim(),p_enabled:overview.profile.shareEnabled},'프로필을 저장했어요.');
 }
 async function share(enabled:boolean){
  if(!overview)return;
  await act('friend_preferences',{p_nickname:overview.profile.nickname,p_enabled:enabled},enabled?'오늘 공부 시간 공개를 켰어요.':'오늘 공부 시간 공유를 껐어요.');
 }
 async function request(e:FormEvent<HTMLFormElement>){
  e.preventDefault();
  if(!validFriendCode(code)){setError('친구 코드는 영문·숫자 16자리예요.');return;}
  const sent=await act('friend_send_request',{p_code:code.trim().toUpperCase()},'친구 요청을 보냈어요. 상대방이 수락해야 공부 시간이 보여요.');
  if(sent)setCode('');
 }
 const ranked=useMemo(()=>rankFriends(board),[board]);
 const incoming=overview?.connections.filter(c=>c.status==='pending'&&!c.requestedByMe)??[];
 const outgoing=overview?.connections.filter(c=>c.status==='pending'&&c.requestedByMe)??[];
 const connected=overview?.connections.filter(c=>c.status==='accepted')??[];
 const self=board.find(r=>r.is_me);
 const profile:FriendProfile|undefined=overview?.profile;
 return <div className="friends-view">
  <section className="card">
   <div className="section-title"><h2>친구와 공부하기</h2><button className="small" onClick={()=>void refresh()} disabled={busy||loading}>새로고침</button></div>
   <p>직접 친구 요청을 수락했거나 같은 그룹의 초대를 수락한 사람끼리 오늘 공부 시간을 확인할 수 있어요. 학습일은 오전 6시에 새로 시작해요.</p>
   {typeof navigator!=='undefined'&&!navigator.onLine&&<p className="notice">오프라인이에요. 인터넷을 연결하면 친구 상태를 새로 확인할 수 있어요.</p>}
   {loading&&<p role="status">친구 공간을 불러오는 중…</p>}
   {error&&<p role="alert" className="notice error">{error}</p>}
   {notice&&<p role="status" className="notice">{notice}</p>}
   {profile&&<>
    <div className="friend-profile-grid">
     <div className="friend-code-panel"><span className="eyebrow">MY FRIEND CODE</span><strong>{profile.code}</strong><button className="small" onClick={async()=>{try{await navigator.clipboard.writeText(profile.code);setNotice('친구 코드를 복사했어요.');}catch{setNotice('코드를 길게 눌러 직접 복사해 주세요.');}}}>코드 복사</button><p>이 코드로 친구 요청을 받을 수 있어요. 이메일은 공개되지 않아요.</p></div>
     <form onSubmit={saveProfile}><label>내 별명<input value={nickname} onChange={e=>setNickname(e.target.value)} maxLength={20} minLength={2} required placeholder="친구에게 보일 별명"/></label><button className="small blue" disabled={busy}>별명 저장</button></form>
    </div>
    <div className="friend-share-strip"><div><strong>오늘 공부 시간 공유</strong><p>{profile.shareEnabled?'직접 친구 또는 같은 그룹원에게 오늘 순공 시간·공부 상태·최근 접속이 보여요.':'내 공부 시간과 상태를 친구에게 공개하지 않아요. 이때 나도 친구의 시간을 볼 수 없어요.'}</p></div><button className="small" disabled={busy} onClick={()=>void share(!profile.shareEnabled)}>{profile.shareEnabled?'공유 끄기':'공유 켜기'}</button></div>
   </>}
  </section>
  {profile&&<>
   <section className="card below"><h2>친구 추가</h2><form className="friend-code-form" onSubmit={request}><label>친구 코드<input value={code} onChange={e=>setCode(e.target.value.replace(/\s/g,'').toUpperCase())} maxLength={16} required placeholder="상대방의 16자리 코드" autoCapitalize="characters"/></label><button className="primary compact" disabled={busy||!validFriendCode(code)}>요청 보내기</button></form>
    {(incoming.length>0||outgoing.length>0)&&<div className="friend-requests">
      {incoming.length>0&&<><h3>받은 요청 · {incoming.length}</h3>{incoming.map(c=><div className="record-row" key={c.id}><div><strong>{c.nickname}</strong><p>친구 요청이 도착했어요.</p></div><div className="actions"><button className="small blue" disabled={busy} onClick={()=>void act('friend_respond',{p_other:c.id,p_accept:true},'친구 요청을 수락했어요.')}>수락</button><button className="small" disabled={busy} onClick={()=>void act('friend_respond',{p_other:c.id,p_accept:false},'친구 요청을 거절했어요.')}>거절</button></div></div>)}</>}
      {outgoing.length>0&&<><h3>보낸 요청 · {outgoing.length}</h3>{outgoing.map(c=><div className="record-row" key={c.id}><div><strong>{c.nickname}</strong><p>상대방 수락 대기 중</p></div><button className="small" disabled={busy} onClick={()=>void act('friend_disconnect',{p_other:c.id},'친구 요청을 취소했어요.')}>요청 취소</button></div>)}</>}
    </div>}
   </section>
   <section className="card below"><div className="section-title"><h2>오늘의 친구 순공 시간</h2><span>나 + 직접 친구·그룹원</span></div>
    <p>읽을 때마다 서버 기록에서 계산하며 서버 기록은 약 45초마다 다시 확인하고, 공부 중인 시간은 화면에서 초 단위로 갱신해요. 동점은 같은 순위로 표시해요. 공부 시간은 성과를 평가하는 점수가 아니라 참고 정보예요.</p>
    {self&&!self.shared&&<p className="notice">공유를 끄면 친구들의 시간과 상태도 보이지 않아요.</p>}
    {ranked.map(row=><article key={row.member_id} className={`friend-rank-row ${row.is_me?'friend-self':''}`}>
     <div className="friend-rank-number">{row.rank===null?'—':`${row.rank}위`}</div>
     <div className="friend-rank-user"><strong>{row.display_name}{row.is_me?' (나)':''}</strong><span>{row.shared?(row.studying?'● 공부 중':'○ 공부 중 아님'):'공유하지 않음'}</span><small>{row.shared?friendLastSeen(row.last_seen_at,now):'활동 정보 비공개'}</small></div>
     <div className="friend-rank-time">{friendTime(sharedStudyTime(row.total_ms,row.studying,boardReceivedAt,now,typeof navigator==='undefined'||navigator.onLine))}</div>
    </article>)}
    {ranked.length===0&&<p className="empty">아직 표시할 데이터가 없어요.</p>}
   </section>
   <section className="card below"><h2>내 친구</h2>{connected.length===0?<p>아직 친구가 없어요. 코드를 공유하고 요청을 수락하면 여기에 나타나요.</p>:connected.map(c=><div className="record-row" key={c.id}><strong>{c.nickname}</strong><button className="small" disabled={busy} onClick={()=>{if(confirm(`${c.nickname}님을 친구 목록에서 삭제할까요? 이후 서로 공부 시간이 보이지 않아요.`))void act('friend_disconnect',{p_other:c.id},'친구 관계를 삭제했어요.');}}>친구 삭제</button></div>)}<p className="fine">직접 친구 관계만 여기에서 삭제할 수 있어요. 그룹원은 그룹 메뉴에서 관리해요. 할 일·시간표·과거 기록·이메일은 공유하지 않아요.</p></section>
  </>}
 </div>;
}
