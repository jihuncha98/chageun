import {supabase} from './supabase';
import {emptyStudy, mergeStudy, normalizeStudy, uid, validate, type Study} from './study';
type Workspace={revision:number;data:Study};
type Cache={base:Study;work:Study;revision:number;operation:string|null;review:boolean};
export type View={data:Study;ready:boolean;pending:boolean;review:boolean;status:string;error:string;remote:Workspace|null;busy:boolean};
export const initialView:View={data:emptyStudy(),ready:false,pending:false,review:false,status:'불러오는 중',error:'',remote:null,busy:false};
const errorMessage=(error:unknown)=>error instanceof Error?error.message:'알 수 없는 저장 오류가 발생했어요.';
export function createStudyStore(userId:string,client=supabase){
 const key=`chageun:study:v1:${userId}`;let cache:Cache|null=null;let view=initialView;let closed=false;let busy=false;const listeners=new Set<()=>void>();
 const emit=(patch:Partial<View>)=>{if(closed)return;view={...view,...patch};listeners.forEach(fn=>fn());};
 const read=()=>{const raw=localStorage.getItem(key);if(!raw)return null;const c=JSON.parse(raw) as Cache;if(c.work?.schema!==1||!Number.isInteger(c.revision))throw Error('기기의 저장 형식을 확인할 수 없어요. 원본을 백업한 뒤 문의해 주세요.');return {...c,base:normalizeStudy(c.base),work:normalizeStudy(c.work)};};
 const save=(c:Cache)=>{localStorage.setItem(key,JSON.stringify(c));cache=c;emit({data:c.work,ready:true,pending:!!c.operation,review:c.review});};
 const locked=async(fn:()=>Promise<void>)=>{if(!navigator.locks){emit({error:'이 브라우저는 안전한 기기 저장 잠금을 지원하지 않아요. 최신 Safari 또는 Chrome으로 열어 주세요.'});return;}await navigator.locks.request(key,async()=>{if(closed)return;try{cache=read()??cache;await fn();}catch(e){emit({error:e instanceof Error?e.message:'저장 공간 또는 연결을 확인해 주세요.'});}});};
 const syncInside=async()=>{
  if(!client||!navigator.onLine){emit({status:'오프라인 · 이 기기에 저장',busy:false});return;}
  const response=await client.from('study_workspaces').select('revision,data').eq('user_id',userId).maybeSingle();
  if(response.error)throw Error(`서버를 불러오지 못했어요. SQL 적용과 인터넷 연결을 확인해 주세요. (${response.error.code})`);
  const raw:Workspace=response.data??{revision:0,data:emptyStudy()};const remote:Workspace={...raw,data:normalizeStudy(raw.data)};
  if(!cache||!cache.operation){save({base:remote.data,work:remote.data,revision:remote.revision,operation:null,review:false});emit({status:'서버 저장 완료',remote:null,error:''});return;}
  if(cache.revision!==remote.revision){
   const m=mergeStudy(cache.base,cache.work,remote.data);
   if(m.conflicts.length){emit({remote,status:'확인 필요 · 다른 기기에서도 수정했어요',review:true});return;}
   cache={...cache,base:remote.data,work:m.result,revision:remote.revision,operation:uid()};save(cache);
  }
  try{validate(cache.work);}catch(e){save({...cache,review:true});emit({status:'확인 필요 · 겹친 시간을 수정해 주세요',error:(e as Error).message});return;}
  const result=await client.rpc('save_study_workspace',{expected_revision:cache.revision,operation_id:cache.operation,new_data:cache.work});
  if(result.error)throw Error(`동기화하지 못했어요. 기기 기록은 유지됩니다. ${result.error.message}`);
  const resultWorkspace=result.data.workspace as Workspace;const w:Workspace={...resultWorkspace,data:normalizeStudy(resultWorkspace.data)};
  if(!result.data.ok){emit({remote:w,status:'확인 필요 · 다른 기기의 변경 확인',review:true});return;}
  save({base:w.data,work:w.data,revision:w.revision,operation:null,review:false});emit({status:'서버 저장 완료',remote:null,error:''});
 };
 const sync=async()=>{if(busy||closed)return;busy=true;emit({busy:true});try{await locked(syncInside);}catch(error){emit({error:errorMessage(error),status:cache?.operation?'동기화 대기 · 이 기기에 저장':'서버 확인 실패'});}finally{busy=false;emit({busy:false});}};
 const update=async(change:(draft:Study)=>void)=>{let saved=false;if(busy||closed){emit({error:'저장 중이에요. 잠시 후 다시 눌러 주세요.'});return false;}busy=true;emit({busy:true,error:''});try{await locked(async()=>{if(!cache)throw Error('처음 한 번은 인터넷에 연결해 데이터를 불러와 주세요.');const draft=structuredClone(cache.work);change(draft);if(!cache.review&&!view.remote)validate(draft);save({...cache,work:draft,operation:uid()});saved=true;emit({status:'동기화 대기 · 이 기기에 저장'});await syncInside();});}catch(error){emit({error:errorMessage(error),status:cache?.operation?'동기화 대기 · 이 기기에 저장':view.status});}finally{busy=false;emit({busy:false});}return saved;};
 const resolve=async(choices:Record<string,'local'|'remote'>)=>{await locked(async()=>{if(!cache||!view.remote)return;const remote=view.remote;const m=mergeStudy(cache.base,cache.work,remote.data,choices);if(m.conflicts.length)throw Error('모든 충돌 항목을 선택해 주세요.');save({base:remote.data,work:m.result,revision:remote.revision,operation:uid(),review:true});emit({remote:null,error:'',status:'합친 기록을 확인하는 중'});await syncInside();});};
 let channel:ReturnType<NonNullable<typeof supabase>['channel']>|null=null;let timer:ReturnType<typeof setInterval>|null=null;
 const onStorage=(e:StorageEvent)=>{if(e.key===key){try{cache=read();if(cache)emit({data:cache.work,pending:!!cache.operation,review:cache.review});}catch{emit({error:'다른 탭의 저장 상태를 읽지 못했어요.'});}}};
 const start=()=>{void locked(async()=>{cache=read();if(cache)emit({data:cache.work,ready:true,pending:!!cache.operation,review:cache.review,status:cache.operation?'동기화 대기 · 이 기기 기록':'서버 확인 중'});}).then(sync);window.addEventListener('online',sync);window.addEventListener('focus',sync);window.addEventListener('storage',onStorage);timer=setInterval(sync,30000);if(client)channel=client.channel(`study:${userId}`).on('postgres_changes',{event:'*',schema:'public',table:'study_workspaces',filter:`user_id=eq.${userId}`},()=>void sync()).subscribe();};
 const destroy=()=>{closed=true;if(timer)clearInterval(timer);window.removeEventListener('online',sync);window.removeEventListener('focus',sync);window.removeEventListener('storage',onStorage);if(channel&&client)void client.removeChannel(channel);};
 return {get:()=>view,subscribe:(fn:()=>void)=>{listeners.add(fn);return()=>{listeners.delete(fn);}},start,destroy,update,sync,resolve,getConflicts:()=>cache&&view.remote?mergeStudy(cache.base,cache.work,view.remote.data).conflicts:[],getLocal:()=>cache};
}
export type StudyStore=ReturnType<typeof createStudyStore>;
