import Image from 'next/image';
import title1 from '../public/badges/title1.png';
import title2 from '../public/badges/title2.png';
import title3 from '../public/badges/title3.png';
import title4 from '../public/badges/title4.png';
import title5 from '../public/badges/title5.png';
import title6 from '../public/badges/title6.png';
import title7 from '../public/badges/title7.png';
import title8 from '../public/badges/title8.png';
import title9 from '../public/badges/title9.png';
import title10 from '../public/badges/title10.png';

const badges = [title1, title2, title3, title4, title5, title6, title7, title8, title9, title10];
const names = [
 '차근 사용자', '차근 새내기', '차근 애용자', '차근 노력가', '차근 고수',
 '차근 달인', '차근 마스터', '차근 거장', '차근 전설', '차지훈',
];

export function TitleEmblem({level,label}:{level?:number|null;label?:string}){
 const requested=level??names.indexOf(label??'')+1;
 const n=typeof requested==='number'&&Number.isInteger(requested)&&requested>=1&&requested<=badges.length?requested:1;
 return <Image className="title-emblem" src={badges[n-1]} alt="" width={120} height={140} unoptimized/>;
}

export function TitleBadge({label,level}:{label?:string;level?:number}){
 return <em className="rank-title"><TitleEmblem level={level} label={label}/><span>{label??names[0]}</span></em>;
}
