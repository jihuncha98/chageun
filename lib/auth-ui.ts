/** User-editable text: display only. Never use as an authorization identifier. */
export const DISPLAY_NAME_KEY='chageun_display_name';
export function cleanDisplayName(value:unknown):string {
 if(typeof value!=='string')return '';
 return value.trim().replace(/\s+/g,' ').replace(/[\u0000-\u001f\u007f]/g,'').slice(0,24).trim();
}
export function storedDisplayName(metadata:unknown):string {
 if(!metadata||typeof metadata!=='object')return '';
 return cleanDisplayName((metadata as Record<string,unknown>)[DISPLAY_NAME_KEY]);
}
export function brandSubtitle(loggedIn:boolean,metadata?:unknown):string {
 if(!loggedIn)return '차지훈의 근면성실';
 return `${storedDisplayName(metadata)||'나'}의 근면성실`;
}
/** Works on the root path and on GitHub Pages' /chageun/ subpath. */
export function authReturnUrl(origin:string,basePath:string):string {
 const base=basePath.trim().replace(/^\/+|\/+$/g,'');
 return `${origin.replace(/\/+$/,'')}/${base?base+'/':''}`;
}
type AuthLikeError={code?:string;message?:string};
export function authErrorMessage(error:AuthLikeError,action:'signup'|'login'|'reset'|'password'|'name'):string {
 const code=error.code??'';
 if(code==='email_address_not_authorized')return '이메일 발송이 제한되어 있어요. 운영자에게 Supabase SMTP 설정을 요청해 주세요.';
 if(code==='over_email_send_rate_limit'||code==='over_request_rate_limit'||code==='over_request_rate_limit')return '이메일 전송 횟수 제한에 도달했어요. 잠시 후 다시 시도해 주세요.';
 if(code==='signup_disabled'||code==='email_provider_disabled')return '현재 새 계정 가입이 차단되어 있어요. 운영자가 Supabase 가입 설정을 확인해야 해요.';
 if(code==='weak_password')return '비밀번호 보안 기준을 충족하지 못했어요. 더 긴 비밀번호로 다시 시도해 주세요.';
 if(code==='email_not_confirmed')return '이메일 인증이 필요해요. 받은 편지함과 스팸함을 확인해 주세요.';
 if(code==='invalid_credentials')return '이메일 또는 비밀번호가 맞지 않아요.';
 if(code==='otp_expired'||code==='flow_state_expired'||code==='bad_jwt')return '인증 링크가 만료되었어요. 새 링크를 요청해 주세요.';
 if(action==='signup')return '회원가입을 완료하지 못했어요. 이메일과 비밀번호를 확인해 주세요.';
 if(action==='login')return '로그인에 실패했어요. 이메일과 비밀번호를 확인해 주세요.';
 if(action==='reset')return '비밀번호 재설정 메일을 보내지 못했어요. 이메일 발송 설정이나 네트워크를 확인해 주세요.';
 if(action==='password')return '비밀번호를 변경하지 못했어요. 링크가 만료되었다면 재설정 메일을 다시 요청해 주세요.';
 return '이름을 저장하지 못했어요. 인터넷 연결을 확인해 주세요.';
}
