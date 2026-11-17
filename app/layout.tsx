import type {Metadata} from 'next';
import './globals.css';
import './ui-refresh.css';
import './broadcast.css';
import './clean-ui.css';
import './social-shop.css';
export const metadata:Metadata={title:'차근 | 차지훈의 근면성실',description:'차근차근 쌓아가는 나의 공부 기록',manifest:(process.env.NEXT_PUBLIC_BASE_PATH??'/chageun')+'/manifest.webmanifest',appleWebApp:{capable:true,title:'차근',statusBarStyle:'default'}};
export default function Layout({children}:{children:React.ReactNode}){return <html lang="ko"><body>{children}</body></html>}
