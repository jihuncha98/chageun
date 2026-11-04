'use client';
import {useEffect,useState,type FormEvent} from 'react';
import type {Session,User} from '@supabase/supabase-js';
import {supabase} from '../lib/supabase';
import {studyDay} from '../lib/study-day';
import StudyDashboard from '../components/study-dashboard';
import {readAppearance,appearanceStorageKeys,type Accent,type FontChoice} from '../lib/appearance';
import {authErrorMessage,authReturnUrl,brandSubtitle} from '../lib/auth-ui';

const tabs=['오늘','시험 대비','통계','친구','그룹','설정'];
const tabIcons=['◷','▦','▥','♧','◎','⚙'];
type AuthMode='login'|'signup'|'forgot'|'recovery';
function PasswordFields({confirmation=false,autoComplete='new-password'}:{confirmation?:boolean;autoComplete?:string}) {
 return <><label>비밀번호<input name="password" type="password" autoComplete={autoComplete} minLength={8} maxLength={128} required placeholder="8자 이상"/></label>{confirmation&&<label>비밀번호 확인<input name="password_confirm" type="password" autoComplete="new-password" minLength={8} maxLength={128} required placeholder="같은 비밀번호를 다시 입력"/></label>}</>;
}
export default function Home(){
 const [tab,setTab]=useState('오늘');
 const [dark,setDark]=useState(false);const [accent,setAccent]=useState<Accent>('blue');const [font,setFont]=useState<FontChoice>('sans');
 const [now,setNow]=useState<Date|null>(null);
 const [session,setSession]=useState<Session|null>(null);
 const [mode,setMode]=useState<AuthMode>('login');
 const [busy,setBusy]=useState(false);const [message,setMessage]=useState('');
 const loggedInUserId=session?.user.id;
 useEffect(()=>{const timer=setTimeout(()=>{try{const a=readAppearance(localStorage);setDark(a.dark);setAccent(a.accent);setFont(a.font);}catch{}},0);return()=>clearTimeout(timer);},[]);
 useEffect(()=>{if('serviceWorker' in navigator&&process.env.NODE_ENV==='production'){void navigator.serviceWorker.register(`${process.env.NEXT_PUBLIC_BASE_PATH??'/chageun'}/sw.js`).catch(()=>{});}const id=setInterval(()=>setNow(new Date()),1000);return()=>clearInterval(id);},[]);
 useEffect(()=>{
  const client=supabase;if(!client)return;
  let active=true;
  void client.auth.getSession().then(({data,error})=>{if(active){setSession(data.session);if(error)setMessage('로그인 상태를 확인하지 못했어요. 다시 시도해 주세요.');}});
  const {data}=client.auth.onAuthStateChange((event,s)=>{
   if(!active)return;
   setSession(s);
   if(event==='PASSWORD_RECOVERY'){setMode('recovery');setMessage('이메일 인증이 완료됐어요. 새로운 비밀번호를 설정해 주세요.');}
   if(event==='SIGNED_OUT'){setMode('login');}
  });
  return()=>{active=false;data.subscription.unsubscribe();};
 },[]);
 useEffect(()=>{const client=supabase;if(!client||!loggedInUserId||mode==='recovery')return;const ping=()=>{if(document.visibilityState==='visible'&&navigator.onLine)void client.rpc('friend_ping');};ping();const interval=setInterval(ping,90000);window.addEventListener('focus',ping);document.addEventListener('visibilitychange',ping);return()=>{clearInterval(interval);window.removeEventListener('focus',ping);document.removeEventListener('visibilitychange',ping)};},[loggedInUserId,mode]);
 function setAppearanceTheme(next:boolean){setDark(next);try{localStorage.setItem(appearanceStorageKeys.theme,next?'dark':'light');}catch{}}
 function setAppearanceAccent(next:Accent){setAccent(next);try{localStorage.setItem(appearanceStorageKeys.accent,next);}catch{}}
 function setAppearanceFont(next:FontChoice){setFont(next);try{localStorage.setItem(appearanceStorageKeys.font,next);}catch{}}
 function changeMode(next:AuthMode){setMode(next);setMessage('');}
 const redirectTo=()=>authReturnUrl(window.location.origin,process.env.NEXT_PUBLIC_BASE_PATH??'/chageun');
 async function login(e:FormEvent<HTMLFormElement>){
  e.preventDefault();if(!supabase)return;setBusy(true);setMessage('');const f=new FormData(e.currentTarget);
  try{const {error}=await supabase.auth.signInWithPassword({email:String(f.get('email')).trim(),password:String(f.get('password'))});if(error)setMessage(authErrorMessage(error,'login'));}
  catch{setMessage('서버에 연결하지 못했어요.');}finally{setBusy(false);}
 }
 async function signUp(e:FormEvent<HTMLFormElement>){
  e.preventDefault();if(!supabase)return;const f=new FormData(e.currentTarget);const password=String(f.get('password'));
  if(password!==String(f.get('password_confirm'))){setMessage('비밀번호와 비밀번호 확인이 일치하지 않아요.');return;}
  setBusy(true);setMessage('');
  try{
   const {data,error}=await supabase.auth.signUp({email:String(f.get('email')).trim(),password,options:{emailRedirectTo:redirectTo()}});
   if(error){setMessage(authErrorMessage(error,'signup'));return;}
   setMode('login');
   setMessage(data.session?'회원가입과 로그인이 완료됐어요. 설정에서 이름을 등록해 주세요.':'가입 요청을 접수했어요. 인증 메일이 도착했다면 메일 속 링크로 인증한 뒤 로그인해 주세요.');
  }catch{setMessage('회원가입 서버에 연결하지 못했어요.');}finally{setBusy(false);}
 }
 async function sendReset(e:FormEvent<HTMLFormElement>){
  e.preventDefault();if(!supabase)return;const f=new FormData(e.currentTarget);setBusy(true);setMessage('');
  try{
   const {error}=await supabase.auth.resetPasswordForEmail(String(f.get('email')).trim(),{redirectTo:redirectTo()});
   if(error){setMessage(authErrorMessage(error,'reset'));return;}
   setMessage('해당 이메일로 등록된 계정이 있다면 재설정 링크를 보냈어요. 받은 편지함과 스팸함을 확인해 주세요.');
  }catch{setMessage('재설정 요청을 전송하지 못했어요.');}finally{setBusy(false);}
 }
 async function setNewPassword(e:FormEvent<HTMLFormElement>){
  e.preventDefault();if(!supabase)return;const f=new FormData(e.currentTarget);const password=String(f.get('password'));
  if(password!==String(f.get('password_confirm'))){setMessage('비밀번호와 비밀번호 확인이 일치하지 않아요.');return;}
  setBusy(true);setMessage('');
  try{
   const {error}=await supabase.auth.updateUser({password});
   if(error){setMessage(authErrorMessage(error,'password'));return;}
   const {error:signoutError}=await supabase.auth.signOut();
   if(signoutError){setMessage('비밀번호는 변경됐지만 로그아웃에 실패했어요. 보안을 위해 로그아웃을 다시 시도해 주세요.');return;}
   setMode('login');setMessage('비밀번호 변경을 완료했어요. 새 비밀번호로 로그인해 주세요.');
  }catch{setMessage('비밀번호 변경 중 연결 오류가 발생했어요. 다시 시도해 주세요.');}finally{setBusy(false);}
 }
 async function logout(){if(!supabase)return;const {error}=await supabase.auth.signOut();if(error)setMessage('로그아웃에 실패했어요. 다시 시도해 주세요.');else{setMode('login');setMessage('');setTab('오늘');}}
 function updateProfileUser(user:User){setSession(current=>current&&current.user.id===user.id?{...current,user}:current);}
 const authenticated=Boolean(session)&&mode!=='recovery';
 const subtitle=brandSubtitle(authenticated,authenticated?session?.user.user_metadata:undefined);
 return <div className={dark?'app dark':'app'} data-accent={accent} data-font={font}>
  <aside><a className="brand" href="#">차근<span>{subtitle}</span></a><nav aria-label="주 메뉴">{tabs.map((t,i)=><button key={t} aria-current={tab===t?'page':undefined} onClick={()=>setTab(t)}><span>{tabIcons[i]}</span>{t}</button>)}</nav><div className="aside-bottom">작은 실천이 쌓이는 곳<br/><strong>오늘도, 차근차근.</strong></div></aside>
  <main><header><span>나만의 공부 공간</span><button className="quiet" onClick={()=>setAppearanceTheme(!dark)} aria-pressed={dark}>{dark?'☀ 라이트 모드':'☾ 다크 모드'}</button></header>
   <section className="heading"><div><p className="eyebrow">CHAGEUN · MY STUDY SPACE</p><h1>{tab==='오늘'?'오늘도 한 걸음, 차근.':tab}</h1><p>나의 속도로 계획하고, 하루의 성실함을 쌓아가요.</p></div><span className="badge">차근 · 나의 공부 공간</span></section>
   {authenticated&&session?<>
    <div className="account-strip"><span>{session.user.email}</span><button className="small" onClick={()=>void logout()}>로그아웃</button></div>
    {now&&<StudyDashboard key={session.user.id} userId={session.user.id} tab={tab} now={now.getTime()} profileUser={session.user} onProfileSaved={updateProfileUser} appearance={{dark,accent,font}} onAppearanceTheme={setAppearanceTheme} onAppearanceAccent={setAppearanceAccent} onAppearanceFont={setAppearanceFont}/>}
   </>:<div className="grid auth-layout">
    <section className="hero"><p>지금 이 순간</p><div className="clock">{now?new Intl.DateTimeFormat('ko-KR',{timeZone:'Asia/Seoul',hour:'2-digit',minute:'2-digit',hour12:false}).format(now):'--:--'}</div><p>{now?`${studyDay(now)} 학습일`:'한국 시간 기준'}</p><div className="hero-note">새벽의 노력도 어제의 기록에.<br/>하루는 오전 6시에 새롭게 시작해요.</div></section>
    <section className="card auth-card"><p className="eyebrow">MY ACCOUNT</p><h2>{mode==='signup'?'새 계정 만들기':mode==='forgot'?'비밀번호 찾기':mode==='recovery'?'새 비밀번호 설정':'나의 공부 공간에 로그인'}</h2>
     {mode==='signup'?<><p>친구도 자신의 이메일로 가입할 수 있어요. 공부 기록은 계정별로 따로 저장돼요.</p><form onSubmit={signUp}><label>이메일<input name="email" type="email" autoComplete="email" required placeholder="본인 이메일" disabled={!supabase||busy}/></label><PasswordFields confirmation/><button className="primary" disabled={!supabase||busy}>{busy?'가입 중…':'회원가입'}</button></form><p className="fine">이메일 인증이 필요한 경우 받은 편지함의 링크를 눌러야 로그인할 수 있어요.</p></>
     :mode==='forgot'?<><p>가입한 이메일로 비밀번호 재설정 안내를 보내요.</p><form onSubmit={sendReset}><label>이메일<input name="email" type="email" autoComplete="email" required placeholder="가입한 이메일" disabled={!supabase||busy}/></label><button className="primary" disabled={!supabase||busy}>{busy?'전송 중…':'재설정 메일 보내기'}</button></form></>
     :mode==='recovery'?<><p>메일의 인증 링크로 접속했어요. 새 비밀번호를 설정해 주세요.</p><form onSubmit={setNewPassword}><PasswordFields confirmation/><button className="primary" disabled={!supabase||busy||!session}>{busy?'변경 중…':'새 비밀번호 저장'}</button></form>{!session&&<p className="notice">복구 세션을 찾지 못했어요. 링크가 만료됐다면 새 메일을 요청해 주세요.</p>}</>
     :<><p>계정의 이메일과 비밀번호로 로그인해 주세요.</p><form onSubmit={login}><label>이메일<input name="email" type="email" autoComplete="username" required placeholder="이메일 주소" disabled={!supabase||busy}/></label><label>비밀번호<input name="password" type="password" autoComplete="current-password" required placeholder="비밀번호" disabled={!supabase||busy}/></label><button className="primary" disabled={!supabase||busy}>{busy?'로그인 중…':'로그인'}</button></form></>}
     {!supabase&&<p className="notice">현재 서버 연결이 설정되지 않았어요. 운영자에게 문의해 주세요.</p>}
     <div className="auth-links">{mode!=='login'&&mode!=='recovery'&&<button type="button" className="small" onClick={()=>changeMode('login')}>로그인으로</button>}{mode!=='signup'&&mode!=='recovery'&&<button type="button" className="small" onClick={()=>changeMode('signup')}>회원가입</button>}{mode!=='forgot'&&mode!=='recovery'&&<button type="button" className="small" onClick={()=>changeMode('forgot')}>비밀번호 찾기</button>}</div>
     {message&&<p className="notice auth-feedback" role="status">{message}</p>}
    </section>
   </div>}
   <footer>차근 · {subtitle}<span>Asia/Seoul · 06:00</span></footer>
  </main>
 </div>;
}
