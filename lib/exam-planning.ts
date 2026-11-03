import type {Task} from './study';

const CALENDAR_DAY = 86400000;

/** Today's civil date in Seoul. Exams change at 00:00; study days change at 06:00. */
export function kstToday(now:number):string {
 return new Date(now + 9 * 3600000).toISOString().slice(0,10);
}

export function validCalendarDate(date:string):boolean {
 if(!/^\d{4}-\d{2}-\d{2}$/.test(date))return false;
 const n=Date.parse(`${date}T00:00:00Z`);
 return Number.isFinite(n)&&new Date(n).toISOString().slice(0,10)===date;
}

export function calendarDayDifference(date:string,now:number):number {
 if(!validCalendarDate(date))throw Error('날짜를 확인해 주세요.');
 return Math.round((Date.parse(`${date}T00:00:00Z`)-Date.parse(`${kstToday(now)}T00:00:00Z`))/CALENDAR_DAY);
}

export function ddayLabel(date:string,now:number):string {
 const diff=calendarDayDifference(date,now);
 return diff>0?`D-${diff}`:diff===0?'D-day':`D+${-diff}`;
}

export function moveCalendarMonth(month:string,by:number):string {
 if(!/^\d{4}-\d{2}$/.test(month)||!validCalendarDate(`${month}-01`)||!Number.isInteger(by))throw Error('달을 확인해 주세요.');
 const [year,mon]=month.split('-').map(Number);
 return new Date(Date.UTC(year,mon-1+by,1)).toISOString().slice(0,7);
}

export function monthCells(month:string):(string|null)[] {
 if(!/^\d{4}-\d{2}$/.test(month)||!validCalendarDate(`${month}-01`))throw Error('달을 확인해 주세요.');
 const [year,mon]=month.split('-').map(Number);
 const offset=new Date(Date.UTC(year,mon-1,1)).getUTCDay();
 const length=new Date(Date.UTC(year,mon,0)).getUTCDate();
 const cells=[...Array<string|null>(offset).fill(null)];
 for(let d=1;d<=length;d++)cells.push(`${month}-${String(d).padStart(2,'0')}`);
 while(cells.length%7!==0)cells.push(null);
 return cells;
}

export function taskProgress(tasks:Task[]):{total:number;done:number;percent:number|null} {
 const alive=tasks.filter(t=>!t.deleted_at);
 const done=alive.filter(t=>t.done).length;
 return {total:alive.length,done,percent:alive.length?Math.round(done/alive.length*100):null};
}
