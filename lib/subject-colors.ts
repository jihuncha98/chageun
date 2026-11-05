/** Shared subject colors for tasks and time records. Pure and stable across sessions. */
export type SubjectPalette={solid:string;soft:string;ink:string};
const PALETTE:readonly SubjectPalette[]=[
 {solid:'#456EE3',soft:'#E9EFFF',ink:'#3155B3'},
 {solid:'#E07383',soft:'#FFF0F2',ink:'#B74C64'},
 {solid:'#299A74',soft:'#E5F7EF',ink:'#19765B'},
 {solid:'#8F68C8',soft:'#F1EAFE',ink:'#69449B'},
 {solid:'#C78641',soft:'#FFF2E5',ink:'#985D26'},
 {solid:'#2697AA',soft:'#E5F7FA',ink:'#1B7388'},
 {solid:'#C466A5',soft:'#FDECF7',ink:'#964577'},
 {solid:'#6684CC',soft:'#EBF2FF',ink:'#3D60A6'},
 {solid:'#779B42',soft:'#F1F7E4',ink:'#56752D'},
 {solid:'#CB7552',soft:'#FFF0E8',ink:'#A65632'},
 {solid:'#6D83B1',soft:'#EDF2FA',ink:'#4A638F'},
 {solid:'#7A64BC',soft:'#F0ECFE',ink:'#584597'},
 {solid:'#0E9B92',soft:'#E5F8F5',ink:'#15776F'},
 {solid:'#D0786A',soft:'#FFF0ED',ink:'#A5534A'},
 {solid:'#9C83C6',soft:'#F3EDFA',ink:'#71559C'},
 {solid:'#4997BD',soft:'#E8F4FC',ink:'#286F98'},
 {solid:'#B78940',soft:'#FFF3DC',ink:'#866325'},
 {solid:'#BD718F',soft:'#FCEEF3',ink:'#924763'},
];
// The primary classroom subject names retain intuitive colors.
const SPECIAL:Record<string,number>={국어:1,수학:0,영어:2,한국사:3,역사:3,사회:4,과학:5,물리:10,화학:5,생명과학:8,지구과학:12,음악:6,미술:6,체육:9};
export function subjectPalette(name:string):SubjectPalette{
 const trimmed=name.trim();
 if(!trimmed)return PALETTE[0];
 if(Object.prototype.hasOwnProperty.call(SPECIAL,trimmed))return PALETTE[SPECIAL[trimmed]];
 // FNV-1a: avoid all custom subject names showing the same blue block.
 let hash=2166136261;
 for(const c of trimmed){hash=Math.imul(hash^c.charCodeAt(0),16777619)>>>0;}
 return PALETTE[hash%PALETTE.length];
}
