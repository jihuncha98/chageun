import Image from 'next/image';
import title8 from '../public/badges/title8.png';
import title9 from '../public/badges/title9.png';
import title10 from '../public/badges/title10.png';

const expandedBadges = [title8, title9, title10];
const names = [
 '차근 사용자', '차근 새내기', '차근 애용자', '차근 노력가', '차근 고수',
 '차근 달인', '차근 마스터', '차근 거장', '차근 전설', '차지훈',
];

export function TitleEmblem({level=1}:{level?:number|null}){
 const n=typeof level==='number'&&Number.isInteger(level)&&level>=1&&level<=names.length?level:1;
 const badge=expandedBadges[n-8];
 const base=(process.env.NEXT_PUBLIC_BASE_PATH??'/chageun').replace(/\/$/,'');
 return <Image className="title-emblem" src={badge??base+'/badges/title'+n+'.png'} alt="" width={120} height={140} unoptimized/>;
}

export function TitleBadge({label,level}:{label?:string;level?:number}){
 return <em className="rank-title"><TitleEmblem level={level??names.indexOf(label??'')+1}/><span>{label??names[0]}</span></em>;
}
