import {dayStart} from './study';
import {studyDay} from './study-day';

/**
 * A friend/group RPC returns a snapshot rather than a live stream.
 * Only a shared, currently studying member's total can advance on the client.
 * Reconcile with the server on the existing 45-second refresh cycle, and
 * cap extrapolation so a lost connection cannot accumulate unbounded time.
 */
export const MAX_LIVE_PREVIEW_MS = 60000;
export function sharedStudyTime(
 totalMs:number|null,
 studying:boolean|null,
 receivedAt:number,
 now:number,
 online=true
):number|null{
 if(totalMs===null)return null;
 const base=Math.max(0,totalMs);
 if(!Number.isFinite(base)||!Number.isFinite(receivedAt)||receivedAt<=0||!Number.isFinite(now))return base;
 if(now<=receivedAt)return base;
 const today=studyDay(new Date(now));
 const sampledDay=studyDay(new Date(receivedAt));
 // Even completed totals must not be shown as today's after the 06:00 rollover.
 // A fresh RPC is also triggered at the boundary, but this guards that brief gap.
 if(today!==sampledDay){
  if(!studying||!online)return 0;
  return Math.min(MAX_LIVE_PREVIEW_MS,Math.max(0,now-dayStart(today)));
 }
 if(!studying||!online)return base;
 return base+Math.min(MAX_LIVE_PREVIEW_MS,now-receivedAt);
}
