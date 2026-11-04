/** Group membership requires a recipient's acceptance, and lasts until departure/removal/deletion. */
export type GroupMember={userId:string;nickname:string;isOwner:boolean};
export type PendingGroupInvitee={userId:string;nickname:string};
export type StudyGroup={id:string;name:string;ownerId:string;isOwner:boolean;createdAt:string;members:GroupMember[];pendingInvites:PendingGroupInvitee[]};
export type IncomingGroupInvite={id:string;name:string;ownerName:string;invitedAt:string};
export type GroupOverview={groups:StudyGroup[];invitations:IncomingGroupInvite[]};
export type GroupBoardRow={member_id:string;display_name:string;total_ms:number|null;studying:boolean|null;last_seen_at:string|null;is_me:boolean;shared:boolean;position:number|null};
export const GROUP_BOARD_PAGE_SIZE=15;
export function validGroupName(name:string):boolean{return name.trim().length>=2&&name.trim().length<=40;}
export function groupPageCount(memberCount:number,pageSize=GROUP_BOARD_PAGE_SIZE):number{return Math.max(1,Math.ceil(Math.max(0,memberCount)/pageSize));}
export function clampGroupPage(page:number,memberCount:number,pageSize=GROUP_BOARD_PAGE_SIZE):number{
 const pages=groupPageCount(memberCount,pageSize);
 return Number.isInteger(page)?Math.max(1,Math.min(pages,page)):1;
}
/** Only the shared total and status are visible to other members, never private tasks or schedules. */
export function groupViewDescription(isSharing:boolean):string{
 return isSharing?'그룹원과 오늘 순공 시간·공부 상태를 공유해요. 할 일 내용과 과거 기록은 비공개예요.':'친구 메뉴에서 공부 시간 공유를 켜야 다른 그룹원과 시간을 비교할 수 있어요.';
}
