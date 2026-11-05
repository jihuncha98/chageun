import {supabase} from './supabase';

/** Display name and friend nickname are separate user-editable fields. */
export type VisibleName={user_id:string;display_name:string|null;nickname:string};

export function personName(displayName:string|null|undefined,nickname:string|null|undefined):string{
 const display=(displayName??'').trim();
 const alias=(nickname??'').trim();
 if(!display)return alias||'차근 사용자';
 return !alias||display===alias?display:`${display} (별명: ${alias})`;
}

/** Only IDs that the signed-in user can see are returned by the server RPC. */
export async function fetchVisibleNames(ids:readonly string[]):Promise<Map<string,VisibleName>>{
 const result=new Map<string,VisibleName>();
 const unique=[...new Set(ids.filter(Boolean))];
 if(!supabase||!unique.length)return result;
 for(let start=0;start<unique.length;start+=100){
  const {data,error}=await supabase.rpc('chageun_visible_names',{p_users:unique.slice(start,start+100)});
  if(error)throw error;
  for(const person of (data??[]) as VisibleName[]){result.set(person.user_id,person);}
 }
 return result;
}

export function visibleLabel(names:ReadonlyMap<string,VisibleName>,id:string,fallback:string):string{
 const found=names.get(id);
 return found?personName(found.display_name,found.nickname):fallback;
}
