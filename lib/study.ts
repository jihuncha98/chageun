import {studyDay} from './study-day';
import {validCalendarDate} from './exam-planning';
export const DAY = 86400000;
export type Row = {id:string; deleted_at:string|null};
export type Subject = Row & {name:string; archived:boolean};
export type Task = Row & {day:string; subjectId:string; title:string; done:boolean};
export type Entry = Row & {taskId:string|null; kind:'study'|'nap'; start:number; end:number|null; confirmed:number; device:string; napMinutes:number};
export type Lesson = Row & {weekday:number; start:string; end:string; label:string; room:string};
export type Note = Row & {day:string; text:string};
export type Exam = Row & {name:string; date:string};
// The original study workspace is still schema 1. `exams` is an additive field;
// older saved workspaces/caches are upgraded in memory without erasing records.
export type Study = {schema:1; subjects:Subject[]; tasks:Task[]; entries:Entry[]; lessons:Lesson[]; notes:Note[]; exams:Exam[]};
export const emptyStudy = ():Study=>({schema:1,subjects:[],tasks:[],entries:[],lessons:[],notes:[],exams:[]});
export function normalizeStudy(raw:Study):Study {
 if(raw?.schema!==1)throw Error('지원하지 않는 데이터 형식이에요.');
 if(raw.exams!==undefined&&!Array.isArray(raw.exams))throw Error('시험 데이터 형식을 확인해 주세요.');
 return {...raw,exams:raw.exams===undefined?[]:raw.exams};
}
export const alive = <T extends Row>(rows:T[])=>rows.filter(r=>!r.deleted_at);
export const uid = ()=>{if(crypto.randomUUID)return crypto.randomUUID();const b=crypto.getRandomValues(new Uint8Array(16));b[6]=(b[6]&15)|64;b[8]=(b[8]&63)|128;const h=Array.from(b,x=>x.toString(16).padStart(2,'0')).join('');return `${h.slice(0,8)}-${h.slice(8,12)}-${h.slice(12,16)}-${h.slice(16,20)}-${h.slice(20)}`;};
export const normalize = (s:string)=>s.trim().replace(/\s+/g,' ');
export const subjectKey = (s:string)=>normalize(s).replace(/\s/g,'').toLocaleLowerCase();
export function dayStart(day:string){const n=Date.parse(`${day}T06:00:00+09:00`);if(!Number.isFinite(n)||studyDay(new Date(n))!==day)throw Error('날짜를 확인해 주세요.');return n;}
export const nextDay=(day:string)=>studyDay(new Date(dayStart(day)+DAY));
export const localInput=(ms:number)=>new Date(ms+9*3600000).toISOString().slice(0,19);
export const parseLocal=(s:string)=>Date.parse(`${s}+09:00`);
export const clock=(ms:number)=>new Intl.DateTimeFormat('ko-KR',{timeZone:'Asia/Seoul',hour:'2-digit',minute:'2-digit',hour12:false}).format(ms);
export function duration(ms:number){const sec=Math.max(0,Math.floor(ms/1000));return `${Math.floor(sec/3600).toString().padStart(2,'0')}:${Math.floor(sec/60%60).toString().padStart(2,'0')}:${(sec%60).toString().padStart(2,'0')}`;}
export function sliceDay(e:Entry,day:string,now:number){const lo=dayStart(day);return {start:Math.max(lo,e.start),end:Math.min(lo+DAY,e.end??now)};}
export function total(s:Study,day:string,now:number,taskId?:string){return alive(s.entries).filter(e=>e.kind==='study'&&(!taskId||e.taskId===taskId)).reduce((sum,e)=>{const v=sliceDay(e,day,now);return sum+Math.max(0,v.end-v.start)},0);}
export function activeEntry(s:Study){return alive(s.entries).find(e=>e.end===null);}
export function overlap(a:Entry,b:Entry){return !a.deleted_at&&!b.deleted_at&&a.start<(b.end??Infinity)&&b.start<(a.end??Infinity);}
export function validate(s:Study){
 if(s.schema!==1)throw Error('지원하지 않는 데이터 형식이에요.');
 for(const rows of [s.subjects,s.tasks,s.entries,s.lessons,s.notes,s.exams]){if(!Array.isArray(rows)||new Set(rows.map(r=>r.id)).size!==rows.length)throw Error('중복된 기록이 있어요.');}
 if(new Set(alive(s.subjects).map(x=>subjectKey(x.name))).size!==alive(s.subjects).length)throw Error('같은 이름의 과목이 이미 있어요.');
 for(const sub of s.subjects)if(!normalize(sub.name)||sub.name.length>80)throw Error('과목 이름은 1~80자로 입력해 주세요.');
 for(const t of s.tasks){dayStart(t.day);if(!t.title.trim()||t.title.length>300||!s.subjects.some(x=>x.id===t.subjectId))throw Error('할 일 내용과 과목을 확인해 주세요.');}
 const entries=alive(s.entries).sort((a,b)=>a.start-b.start);
 if(entries.filter(e=>e.end===null).length>1)throw Error('실행 중인 타이머가 둘이에요. 하나를 종료해 주세요.');
 for(let i=0;i<entries.length;i++){const e=entries[i];if(!Number.isFinite(e.start)||e.start<0||e.end!==null&&(!Number.isFinite(e.end)||e.end<e.start))throw Error('시작·종료 시각을 확인해 주세요.');if(e.start>Date.now()+300000||e.end!==null&&e.end>Date.now()+300000)throw Error('미래 시간은 기록할 수 없어요.');if(e.kind==='study'&&!s.tasks.some(t=>t.id===e.taskId))throw Error('연결된 할 일을 찾을 수 없어요.');if(e.end===null&&e.kind==='study'&&s.tasks.some(t=>t.id===e.taskId&&(t.done||t.deleted_at)))throw Error('완료·삭제한 할 일의 타이머는 종료해 주세요.');if(i&&overlap(entries[i-1],e))throw Error(`공부·쪽잠 시간이 겹쳐요: ${clock(entries[i-1].start)} / ${clock(e.start)}. 기록에서 시간을 수정하거나 하나를 휴지통으로 보내 주세요.`);}
 for(const exam of s.exams){if(!validCalendarDate(exam.date)||!exam.name.trim()||exam.name.length>80)throw Error('시험 이름과 날짜를 확인해 주세요.');}
 for(const l of alive(s.lessons)){if(!Number.isInteger(l.weekday)||l.weekday<0||l.weekday>6||!/^([01]\d|2[0-3]):[0-5]\d$/.test(l.start)||!/^([01]\d|2[0-3]):[0-5]\d$|^24:00$/.test(l.end)||l.start>=l.end||!l.label.trim())throw Error('시간표의 요일·시작·종료·내용을 확인해 주세요.');}
 const lessons=alive(s.lessons);for(let i=0;i<lessons.length;i++)for(let j=i+1;j<lessons.length;j++)if(lessons[i].weekday===lessons[j].weekday&&lessons[i].start<lessons[j].end&&lessons[j].start<lessons[i].end)throw Error('같은 요일의 시간표가 겹쳐요.');
}
export function stop(s:Study,now:number){const e=activeEntry(s);if(e){if(now<e.start)throw Error('기기 시각이 시작 시각보다 이전이에요. 시계를 확인해 주세요.');e.end=now;}}
export function start(s:Study,taskId:string|null,device:string,now:number,napMinutes=20){stop(s,now);if(taskId){const t=s.tasks.find(t=>t.id===taskId&&!t.deleted_at);if(!t||t.done)throw Error('진행 가능한 할 일을 선택해 주세요.');}s.entries.push({id:uid(),deleted_at:null,taskId,kind:taskId?'study':'nap',start:now,end:null,confirmed:now,device,napMinutes});}
export function cutEntry(s:Study,id:string,from:number,to:number){const e=s.entries.find(e=>e.id===id&&!e.deleted_at);if(!e||e.end===null)throw Error('먼저 타이머를 정지해 주세요.');if(from===Math.floor(e.start/1000)*1000)from=e.start;if(to===Math.floor(e.end/1000)*1000)to=e.end;if(!Number.isFinite(from)||!Number.isFinite(to)||from<e.start||to>e.end||from>=to)throw Error('기록 안에서 뺄 시간 구간을 지정해 주세요.');const end=e.end;if(from===e.start&&to===end)e.deleted_at=new Date().toISOString();else if(from===e.start)e.start=to;else{e.end=from;if(to<end)s.entries.push({...e,id:uid(),start:to,end});}}
export function scheduleNow(s:Study,now:number){const kst=new Date(now+9*3600000);const weekday=kst.getUTCDay();const hm=kst.toISOString().slice(11,16);const list=alive(s.lessons).filter(l=>l.weekday===weekday).sort((a,b)=>a.start.localeCompare(b.start));return {list,current:list.find(l=>l.start<=hm&&hm<l.end),next:list.find(l=>l.start>hm)};}
export type Conflict={collection:keyof Omit<Study,'schema'>;id:string;local:Row;remote:Row};
/** Three-way merge preserves independent changes. Conflicting rows are never silently overwritten. */
export function mergeStudy(base:Study,local:Study,remote:Study,choices:Record<string,'local'|'remote'>={}){
 const result=structuredClone(normalizeStudy(remote));const conflicts:Conflict[]=[];
 for(const key of ['subjects','tasks','entries','lessons','notes','exams'] as const){const out:Row[]=[];const bm=new Map<string,Row>(normalizeStudy(base)[key].map(x=>[x.id,x]));const lm=new Map<string,Row>(normalizeStudy(local)[key].map(x=>[x.id,x]));const rm=new Map<string,Row>(normalizeStudy(remote)[key].map(x=>[x.id,x]));for(const id of new Set([...lm.keys(),...rm.keys()])){const b=bm.get(id),l=lm.get(id),r=rm.get(id);if(!l){if(r)out.push(r);continue;}if(!r){out.push(l);continue;}const eq=(a:unknown,b:unknown)=>JSON.stringify(a,Object.keys((a??{}) as object).sort())===JSON.stringify(b,Object.keys((b??{}) as object).sort());if(eq(l,b)||eq(l,r))out.push(r);else if(eq(r,b))out.push(l);else{const choice=choices[`${key}:${id}`];if(!choice)conflicts.push({collection:key,id,local:l,remote:r});out.push(choice==='local'?l:r);}}Object.assign(result,{[key]:out});}
 return {result,conflicts};
}
