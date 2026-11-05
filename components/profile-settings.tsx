'use client';
import {useState,type FormEvent} from 'react';
import type {User} from '@supabase/supabase-js';
import {supabase} from '../lib/supabase';
import {authErrorMessage,brandSubtitle,cleanDisplayName,DISPLAY_NAME_KEY,storedDisplayName} from '../lib/auth-ui';

/** Rendered only within the Settings tab, never as a sibling of the entire workspace. */
export default function ProfileSettings({user,onSaved}:{user:User;onSaved:(user:User)=>void}){
 const [draft,setDraft]=useState(()=>storedDisplayName(user.user_metadata));
 const [busy,setBusy]=useState(false);
 const [notice,setNotice]=useState('');
 async function save(e:FormEvent<HTMLFormElement>){
  e.preventDefault();const name=cleanDisplayName(draft);
  if(!name){setNotice('표시할 이름을 입력해 주세요.');return;}
  if(!supabase){setNotice('서버에 연결되지 않았어요.');return;}
  setBusy(true);setNotice('');
  try{
   const {data,error}=await supabase.auth.updateUser({data:{[DISPLAY_NAME_KEY]:name}});
   if(error){setNotice(authErrorMessage(error,'name'));return;}
   onSaved(data.user);setDraft(name);setNotice('이름을 저장했어요. 왼쪽 차근 문구에도 반영됐어요.');
  }catch{setNotice('서버와 연결할 수 없어요. 다시 시도해 주세요.');}
  finally{setBusy(false);}
 }
 async function withdraw(){
  if(!supabase||busy||!user.email)return;
  const email=window.prompt('탈퇴하면 내 계정과 공부 기록이 영구 삭제돼요. 그룹장은 먼저 가입한 정식 구성원이 승계하고, 남은 정식 구성원이 없으면 그룹과 초대가 삭제돼요. 탈퇴하려면 내 이메일을 입력하세요.');
  if(email===null)return;
  if(email.trim().toLowerCase()!==user.email.toLowerCase()){setNotice('이메일이 일치하지 않아요.');return;}
  setBusy(true);
  try{
   const {error}=await supabase.rpc('chageun_delete_account',{p_user:user.id,p_email:email,p_reason:'본인 탈퇴'});
   if(error){setNotice(error.message);return;}
   localStorage.removeItem(`chageun:study:v1:${user.id}`);
   await supabase.auth.signOut({scope:'local'});
   window.location.reload();
  }catch{setNotice('연결을 확인하고 다시 로그인해 계정 상태를 확인해 주세요.');}
  finally{setBusy(false);}
 }
 return <section className="card profile-settings"><p className="eyebrow">MY PROFILE</p><h2>내 이름 설정</h2><p>로그인 후 차근 왼쪽에 표시되는 문구를 바꿔요. 내 계정에 저장되므로 다른 기기에서도 적용돼요.</p><form onSubmit={save}><label>표시할 이름<input type="text" name="display-name" autoComplete="nickname" required maxLength={24} value={draft} onChange={e=>setDraft(e.target.value)} placeholder="예: 지훈"/></label><p className="profile-preview">미리 보기: <strong>{brandSubtitle(true,{[DISPLAY_NAME_KEY]:cleanDisplayName(draft)})}</strong></p><button className="primary compact" disabled={busy}>{busy?'저장 중…':'이름 저장'}</button></form>{notice&&<p className="notice" role="status">{notice}</p>}<p className="fine">친구 메뉴의 공개 별명과는 별도의 설정이며, 이메일 주소는 다른 사용자에게 표시하지 않아요.</p><button className="small" disabled={busy} onClick={()=>void withdraw()}>회원 탈퇴</button></section>;
}
