/** Seven records per page, stable even when records are added or deleted. */
export const RECORDS_PER_PAGE = 7;

export function pageCount(itemCount:number,pageSize=RECORDS_PER_PAGE):number{
 return Math.max(1,Math.ceil(Math.max(0,itemCount)/pageSize));
}
export function safePage(requested:number,total:number):number{
 return Math.min(Math.max(1,Math.floor(Number.isFinite(requested)?requested:1)),Math.max(1,total));
}
export function pageItems<T>(items:readonly T[],requested:number,pageSize=RECORDS_PER_PAGE):T[]{
 const page=safePage(requested,pageCount(items.length,pageSize));
 return items.slice((page-1)*pageSize,page*pageSize);
}
/** Numbered shortcuts with first/last jumps provided by separate controls. */
export function pageNumbers(page:number,total:number,limit=5):number[]{
 const count=Math.max(1,total);
 const shown=Math.min(count,Math.max(1,limit));
 const current=safePage(page,count);
 const first=Math.max(1,Math.min(current-Math.floor(shown/2),count-shown+1));
 return Array.from({length:shown},(_,index)=>first+index);
}
