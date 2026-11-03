import type {Metadata} from 'next';
import './globals.css';
export const metadata:Metadata={title:'차근 | 차지훈의 근면성실',description:'차근차근 쌓아가는 나의 공부 기록'};
export default function Layout({children}:{children:React.ReactNode}){return <html lang="ko"><body>{children}</body></html>}
