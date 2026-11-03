/** Always display the actual Korean clock even when a browser uses another time zone. */
export function kstClockSeconds(ms:number):string {
 return new Date(ms+9*3600000).toISOString().slice(11,19);
}
export function kstDateLabel(ms:number):string {
 return new Intl.DateTimeFormat('ko-KR',{timeZone:'Asia/Seoul',year:'numeric',month:'long',day:'numeric',weekday:'short'}).format(ms);
}
