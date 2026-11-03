/** Only aggregated, mutually shared information is ever returned by the friend RPC. */
export type FriendProfile={nickname:string;code:string;shareEnabled:boolean};
export type FriendConnection={id:string;nickname:string;status:'pending'|'accepted';requestedByMe:boolean;createdAt:string};
export type FriendOverview={profile:FriendProfile;connections:FriendConnection[]};
export type FriendBoardRow={member_id:string;display_name:string;total_ms:number|null;studying:boolean|null;last_seen_at:string|null;is_me:boolean;shared:boolean};
export type RankedFriend=FriendBoardRow&{rank:number|null};

/** Ties share a position, and the next available place is skipped: 1, 1, 3. */
export function rankFriends(rows:FriendBoardRow[]):RankedFriend[]{
 const ordered=[...rows].sort((a,b)=>{
  if(a.total_ms===null)return b.total_ms===null?a.display_name.localeCompare(b.display_name,'ko'):1;
  if(b.total_ms===null)return -1;
  return b.total_ms-a.total_ms||a.display_name.localeCompare(b.display_name,'ko')||a.member_id.localeCompare(b.member_id);
 });
 let last:number|null=null;let rank=0;
 return ordered.map((row,i)=>{
  if(row.total_ms===null)return {...row,rank:null};
  if(last!==row.total_ms){rank=i+1;last=row.total_ms;}
  return {...row,rank};
 });
}
export function friendTime(ms:number|null):string{
 if(ms===null)return '비공개';
 const totalMinutes=Math.floor(Math.max(0,ms)/60000);
 return `${Math.floor(totalMinutes/60)}시간 ${String(totalMinutes%60).padStart(2,'0')}분`;
}
export function friendLastSeen(iso:string|null,now:number):string{
 if(!iso)return '접속 정보 없음';
 const parsed=Date.parse(iso);if(!Number.isFinite(parsed))return '접속 정보 없음';
 const delta=Math.max(0,Math.floor((now-parsed)/60000));
 if(delta<1)return '방금 접속';
 if(delta<60)return `${delta}분 전 접속`;
 if(delta<1440)return `${Math.floor(delta/60)}시간 전 접속`;
 return `${Math.floor(delta/1440)}일 전 접속`;
}
export function validFriendCode(text:string):boolean{return /^[a-f0-9]{16}$/i.test(text.trim());}
