import {createClient} from '@supabase/supabase-js';
const url=process.env.NEXT_PUBLIC_SUPABASE_URL;
const key=process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
/** Bound network waits so a failing connection cannot lock the timer controls forever. */
const timedFetch:typeof fetch=async(input,init)=>{const controller=new AbortController();const timer=setTimeout(()=>controller.abort(),12000);const abort=()=>controller.abort();init?.signal?.addEventListener('abort',abort,{once:true});if(init?.signal?.aborted)controller.abort();try{return await fetch(input,{...init,signal:controller.signal});}finally{clearTimeout(timer);init?.signal?.removeEventListener('abort',abort);}};
export const supabase = url && key ? createClient(url,key,{global:{fetch:timedFetch}}) : null;
