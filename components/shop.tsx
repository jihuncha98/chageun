'use client';
import {TitleEmblem} from './title-badge';
import {useCallback,useEffect,useRef,useState} from 'react';
import {supabase} from '../lib/supabase';

type Kind='title'|'skin'|'theme';
type Item={id:string;kind:Kind;label:string;level:number|null;price:number|null;active:boolean;owned:boolean;equipped:boolean};
type Journal={seq:number;action:string;delta:number;reason:string;item:string|null;created_at:string};
type Inventory={balance:number;items:Item[];history:Journal[];rule:{seconds:number;cap:number;starts:string}|null};
const labels={title:'칭호',skin:'타이머 스킨',theme:'화면 테마'};
const actions:Record<string,string>={credit:'관리자 지급',debit:'관리자 회수',buy:'구매',equip:'장착',grant_item:'상품 지급',revoke_item:'상품 회수',rule:'적립 설정',catalog:'상품 설정',study:'공부 시간 정산'};
const defaults=['classic','standard','title1'];
async function read(user:string|null,before:number|null=null):Promise<Inventory>{
 if(!supabase)throw Error('서버 연결을 확인하세요.');
 const {data,error}=await supabase.rpc('chageun_shop_read',{p_user:user,p_before:before});
 if(error)throw Error(error.message);
 return data;
}
export function EquippedAppearance({user}:{user:string}){
 useEffect(()=>{
  let live=true,version=0;
  const root=document.documentElement;
  function apply(skin:string,theme:string){root.dataset.skin='classic';root.dataset.shopTheme='standard';void skin;void theme;}
  const cache='chageun:equipped:'+user;
  try{const cached=JSON.parse(localStorage.getItem(cache)??'null');if(cached)apply('classic','standard');}catch{}
  async function sync(){if(document.hidden)return;const seq=++version;
   try{const result=await read(null);if(!live||seq!==version)return;
    const skin=result.items.find(i=>i.equipped&&i.kind==='skin')?.id??'classic';
    const theme=result.items.find(i=>i.equipped&&i.kind==='theme')?.id??'standard';
    apply('classic','standard');localStorage.setItem(cache,JSON.stringify({skin,theme}));
   }catch{/* Keep the last account-specific appearance offline. */}
  }
  void sync();const timer=setInterval(sync,60000);
  window.addEventListener('shop-change',sync);document.addEventListener('visibilitychange',sync);
  return()=>{live=false;clearInterval(timer);window.removeEventListener('shop-change',sync);document.removeEventListener('visibilitychange',sync);delete root.dataset.skin;delete root.dataset.shopTheme;};
 },[user]);return null;
}
type Person={id:string;email:string|null;displayName?:string|null};
export function ShopAdmin({users}:{users:Person[]}){
 const [search,setSearch]=useState(''),[id,setId]=useState('');
 const matches=users.filter(u=>[u.displayName,u.email].some(s=>s?.toLowerCase().includes(search.toLowerCase())));
 return <section><label>회원 검색<input value={search} onChange={e=>setSearch(e.target.value)} placeholder="표시 이름 또는 이메일"/></label><label>대상 회원<select value={id} onChange={e=>setId(e.target.value)}><option value="">선택하세요</option>{matches.map(u=><option value={u.id} key={u.id}>{u.displayName} · {u.email}</option>)}</select></label>{id&&<Shop key={id} user={id}/>}</section>;
}
export default function Shop({user=null}:{user?:string|null}){
 const [state,setState]=useState<Inventory|null>(null),[message,setMessage]=useState(''),[busy,setBusy]=useState(false);
 const [kind,setKind]=useState<Kind>('title'),[preview,setPreview]=useState<Item|null>(null);
 const [reason,setReason]=useState(''),[amount,setAmount]=useState(''),[seconds,setSeconds]=useState('');
 const [history,setHistory]=useState<Journal[]>([]),[more,setMore]=useState(false);
 const lock=useRef(false),retry=useRef({key:'',id:''});
 const load=useCallback(async()=>{const next=await read(user);setState(next);setHistory(next.history);setMore(next.history.length===50);},[user]);
 useEffect(()=>{const t=setTimeout(()=>void load().catch(e=>setMessage(e.message)),0);return()=>clearTimeout(t);},[load]);
 async function submit(action:string,item:Item|null=null,n:number|null=null,options:Record<string,unknown>={}){
  if(!supabase||lock.current)return;
  if(user&&(reason.trim().length<2||reason.trim().length>150)){setMessage('사유를 2~150자로 입력하세요.');return;}
  if(!window.confirm([actions[action],item?.label,n!==null?n:action==='buy'?item?.price+' C':'',options.label??'',options.cap!==undefined?'하루 상한 '+options.cap+' C':'',user?reason:''].filter(x=>x!=='').join(' · ')+(['catalog','rule'].includes(action)?' · 전체 회원에 적용됩니다.':'')+' 적용할까요?'))return;
  const params={p_action:action,p_item:item?.id??null,p_user:user,p_amount:n,p_reason:user?reason:'',p_options:options};
  const key=JSON.stringify(params);if(retry.current.key!==key)retry.current={key,id:crypto.randomUUID()};
  lock.current=true;setBusy(true);
  try{const {error}=await supabase.rpc('chageun_shop_change',{...params,p_request:retry.current.id});if(error)throw Error(error.message);
   await load();retry.current.key='';setMessage('적용했어요.');window.dispatchEvent(new Event('shop-change'));
  }catch(e){setMessage(e instanceof Error?e.message:'연결 상태를 확인하세요.');}finally{lock.current=false;setBusy(false);}
 }
 return <div className="shop-view">{message&&<p className="notice" role="status">{message}</p>}{!state?<button className="small" onClick={()=>void load().catch(e=>setMessage(e.message))}>상점 다시 불러오기</button>:<>
 <section className="card shop-wallet"><h2>보유 크레딧</h2><strong className="shop-balance">{state.balance.toLocaleString()} C</strong><p>{state.rule?new Date(state.rule.starts).toLocaleString('ko-KR',{timeZone:'Asia/Seoul'})+'부터 '+state.rule.seconds+'초당 1 C · 하루 적립 한도 없음':'자동 적립 시작 전'}</p>
 {user&&<><label>관리 사유<input value={reason} maxLength={150} onChange={e=>setReason(e.target.value)}/></label><label>크레딧 수량<input type="number" min="1" value={amount} onChange={e=>setAmount(e.target.value)}/></label>{['credit','debit'].map(a=><button key={a} className="small" disabled={busy||Number(amount)<1} onClick={()=>void submit(a,null,Number(amount))}>{actions[a]}</button>)}
 <details><summary>자동 적립 설정</summary><label>1 C당 공부 시간(초)<input type="number" min="1" value={seconds} onChange={e=>setSeconds(e.target.value)}/></label><p>처음에는 저장 시점부터, 이후 변경은 다음 학습일 오전 6시부터 적용돼요.</p><button className="small" disabled={busy||Number(seconds)<1} onClick={()=>void submit('rule',null,Number(seconds),{cap:2147483647})}>적립 기준 저장</button></details></>}</section>
 <div className="shop-tabs">{(['title'] as Kind[]).map(k=><button key={k} className="small" aria-pressed={kind===k} onClick={()=>{setKind(k);setPreview(null);}}>{labels[k]}</button>)}</div>
 <div className="shop-grid">{state.items.filter(i=>i.kind===kind).map(i=>{
 const locked=i.level&&i.level>1&&!state.items.some(p=>p.kind==='title'&&p.level===i.level!-1&&p.owned);
 return <article key={i.id} className="card shop-product">{i.kind==='title'?<TitleEmblem level={i.level}/>:<div className="product-preview" data-product={i.id}>{i.kind==='skin'?<><span>집중 시간</span><strong>00:32:18</strong><span>수학 · 공부 중</span></>:<><span>오늘의 공부</span><strong>차근차근</strong><span>나의 근면성실</span></>}</div>}<h3>{i.level?'LV'+i.level+' · ':''}{i.label}</h3><p>{i.equipped?'장착 중':i.owned?'보유함':locked?'이전 칭호 필요':i.price===null?'가격 미정':i.price+' C'}</p>
 <button className="small" onClick={()=>setPreview(i)}>미리보기</button>{!user?<button className="small" disabled={busy||i.equipped||(!i.owned&&(!!locked||!i.active||i.price===null||i.price>state.balance))} onClick={()=>void submit(i.owned?'equip':'buy',i)}>{i.owned?'장착':'구매'}</button>:!defaults.includes(i.id)&&<>
 <button className="small" disabled={busy} onClick={()=>void submit(i.owned?'revoke_item':'grant_item',i)}>{i.owned?'회수':'지급'}</button>
 <form onSubmit={e=>{e.preventDefault();const f=new FormData(e.currentTarget);void submit('catalog',i,Number(f.get('price')),{label:String(f.get('label')),active:f.has('active')});}}><label>상품명<input name="label" required maxLength={40} defaultValue={i.label}/></label><label>가격(C)<input name="price" type="number" min="0" required defaultValue={i.price??''}/></label><label><input type="checkbox" name="active" defaultChecked={i.active}/> 진열 및 판매</label><button className="small" disabled={busy}>상품 설정 저장</button></form></>}</article>;
 })}</div>{preview&&<section className="card shop-preview" data-preview={preview.id}><h3>{preview.label} 미리보기</h3>{preview.kind==='title'&&<TitleEmblem level={preview.level}/>}<strong>{preview.kind==='skin'?'수학 · 00:32:18':preview.kind==='title'?'내 이름 · '+preview.label:'오늘의 공부'}</strong><button className="small" onClick={()=>setPreview(null)}>닫기</button></section>}
 {user&&<section className="card below"><h3>거래 내역</h3>{history.map(h=><p key={h.seq}>{new Date(h.created_at).toLocaleString('ko-KR')} · {actions[h.action]} · {h.delta} C · {h.item} {h.reason}</p>)}{more&&<button className="small" disabled={busy} onClick={async()=>{setBusy(true);try{const page=await read(user,history.at(-1)?.seq);setHistory([...history,...page.history]);setMore(page.history.length===50);}catch(e){setMessage(String(e));}finally{setBusy(false);}}}>이전 거래</button>}</section>}</>}</div>;
}
