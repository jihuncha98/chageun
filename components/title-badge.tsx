const names=['차근 사용자','차근 새내기','차근 애용자','차근 노력가','차근 고수','차근 달인','차근 마스터'];
export function TitleEmblem({level=1}:{level?:number|null}){const n=Math.max(1,Math.min(7,level??1));return <img className="title-emblem" src={(process.env.NEXT_PUBLIC_BASE_PATH??'/chageun')+'/badges/title'+n+'.png'} alt="" width={120} height={140}/>}
export function TitleBadge({label}:{label?:string}){return <em className="rank-title"><TitleEmblem level={names.indexOf(label??'')+1}/><span>{label??names[0]}</span></em>}
