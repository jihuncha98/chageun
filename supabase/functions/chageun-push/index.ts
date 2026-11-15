import {createClient} from 'npm:@supabase/supabase-js@2';
import webpush from 'npm:web-push@3.6.7';

const database = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
const cors = {
 'Access-Control-Allow-Origin':'https://jihuncha98.github.io',
 'Access-Control-Allow-Headers':'authorization, x-client-info, apikey, content-type',
 'Access-Control-Allow-Methods':'POST, OPTIONS',
 'Vary':'Origin'
};
const respond = (value:unknown,status=200)=>new Response(JSON.stringify(value),{status,headers:{...cors,'Content-Type':'application/json'}});
function endpointAllowed(value:unknown):value is string {
 if(typeof value!=='string'||value.length>4096)return false;
 try{
  const url=new URL(value);
  return url.protocol==='https:'&&!url.username&&!url.password&&(!url.port||url.port==='443')&&
   (url.hostname==='web.push.apple.com'||url.hostname.endsWith('.push.apple.com')||
    url.hostname==='fcm.googleapis.com'||url.hostname==='updates.push.services.mozilla.com'||
    url.hostname.endsWith('.notify.windows.com'));
 }catch{return false;}
}

Deno.serve(async(request:Request)=>{
 if(request.method==='OPTIONS')return new Response(null,{headers:cors});
 if(request.method!=='POST')return respond({error:'POST required'},405);
 try{
  const body=await request.json();
  let user;
  if(body.action==='deliver'){
   if(!request.headers.get('x-worker-token'))return respond({error:'Unauthorized'},401);
  }else{
  const token=request.headers.get('Authorization')?.replace(/^Bearer /i,'');
  if(!token)return respond({error:'로그인해 주세요.'},401);
  const {data:auth,error:authError}=await database.auth.getUser(token);
  if(authError||!auth.user)return respond({error:'로그인 상태를 확인해 주세요.'},401);
  user=auth.user;
  }
  const candidate=webpush.generateVAPIDKeys();
  const configResult=await database.rpc('chageun_push_config',{p_public:candidate.publicKey,p_private:candidate.privateKey});
  if(configResult.error)throw configResult.error;
  const config=configResult.data;
  webpush.setVapidDetails('https://jihuncha98.github.io/chageun/',config.publicKey,config.privateKey);
  if(body.action==='deliver'){
   if(request.headers.get('x-worker-token')!==config.workerToken)return respond({error:'Unauthorized'},401);
   const {data:jobs,error}=await database.rpc('chageun_push_claim');
   if(error)throw error;
   let sent=0;
   for(const job of jobs??[]){
    const {data:device,error:deviceError}=await database.from('chageun_push_devices').select('*').eq('endpoint',job.endpoint).maybeSingle();
    if(deviceError)throw deviceError;
    if(!device)continue;
    let title='차근 테스트 알림',text='아이패드 알림이 연결됐어요.';
    if(job.broadcast_id){
     const {data:notice,error:noticeError}=await database.from('chageun_broadcasts').select('title,body,active,target_user_id').eq('id',job.broadcast_id).maybeSingle();
     if(noticeError)throw noticeError;
     if(!notice?.active||(notice.target_user_id&&notice.target_user_id!==device.user_id)){
      await database.from('chageun_push_queue').update({state:'sent'}).eq('id',job.id);
      continue;
     }
     title=notice.title;text=notice.body.slice(0,200);
    }
    try{
     if(!endpointAllowed(device.endpoint))throw Object.assign(new Error('Invalid endpoint'),{statusCode:410});
     await webpush.sendNotification(device.subscription,JSON.stringify({
      title,body:text,tag:job.broadcast_id??'chageun-test',url:'/chageun/?notifications=1'
     }),{TTL:3600,timeout:10000,urgency:'normal'});
     await database.from('chageun_push_queue').update({state:'sent'}).eq('id',job.id);
     sent++;
    }catch(error){
     const status=(error as {statusCode?:number}).statusCode;
     if(status===404||status===410){
      await database.from('chageun_push_devices').delete().eq('endpoint',job.endpoint);
     }else{
      await database.from('chageun_push_queue').update({
       state:job.attempts>=4?'failed':'pending',
       available_at:new Date(Date.now()+60000*job.attempts).toISOString()
      }).eq('id',job.id);
     }
    }
   }
   return respond({sent});
  }
  if(!user)return respond({error:'로그인해 주세요.'},401);
  if(body.action==='config')return respond({publicKey:config.publicKey});
  const endpoint=body.subscription?.endpoint??body.endpoint;
  if(!endpointAllowed(endpoint))return respond({error:'지원하지 않는 알림 주소예요.'},400);
  if(body.action==='register'){
   const subscription=body.subscription;
   if(typeof subscription.keys?.p256dh!=='string'||typeof subscription.keys?.auth!=='string'||
      !/^[A-Za-z0-9_-]{80,100}$/.test(subscription.keys.p256dh)||!/^[A-Za-z0-9_-]{20,30}$/.test(subscription.keys.auth)){
    return respond({error:'기기의 알림 정보를 확인해 주세요.'},400);
   }
   const {data:existing}=await database.from('chageun_push_devices').select('user_id').eq('endpoint',endpoint).maybeSingle();
   if(existing&&existing.user_id!==user.id)return respond({error:'이 기기의 이전 계정에서 알림을 끈 뒤 다시 켜 주세요.'},409);
   const {count,error:countError}=await database.from('chageun_push_devices').select('*',{count:'exact',head:true}).eq('user_id',user.id);
   if(countError)throw countError;
   if(!existing&&(count??0)>=10)return respond({error:'계정당 최대 10개 기기를 연결할 수 있어요.'},400);
   const {error}=await database.from('chageun_push_devices').upsert({endpoint,user_id:user.id,subscription:{endpoint,keys:subscription.keys}},{onConflict:'endpoint'});
   if(error)throw error;
   return respond({ok:true});
  }
  if(body.action==='unregister'){
   const {error}=await database.from('chageun_push_devices').delete().eq('endpoint',endpoint).eq('user_id',user.id);
   if(error)throw error;
   return respond({ok:true});
  }
  if(body.action==='test'){
   const {error}=await database.rpc('chageun_push_test',{p_endpoint:endpoint,p_user:user.id});
   if(error)return respond({error:'테스트 알림은 연결된 기기에서 1분 간격으로 보낼 수 있어요.'},400);
   return respond({ok:true});
  }
  return respond({error:'Unknown action'},400);
 }catch(error){
  console.error(error instanceof Error?error.message:'Push function failed');
  return respond({error:'알림 서버 연결을 확인해 주세요.'},500);
 }
});
