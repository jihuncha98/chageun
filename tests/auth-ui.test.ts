import {test} from 'node:test';
import {strict as assert} from 'node:assert';
import {authErrorMessage,authReturnUrl,brandSubtitle,cleanDisplayName,storedDisplayName} from '../lib/auth-ui';

test('before login retains the original motto',()=>{assert.equal(brandSubtitle(false,{chageun_display_name:'다른 사람'}),'차지훈의 근면성실')});
test('each user has an independent name and a neutral fallback',()=>{
 assert.equal(brandSubtitle(true,{chageun_display_name:'서연'}),'서연의 근면성실');
 assert.equal(brandSubtitle(true,{chageun_display_name:'지훈'}),'지훈의 근면성실');
 assert.equal(brandSubtitle(true,{}),'나의 근면성실');
});
test('display name is normalized and capped without trusting unexpected metadata',()=>{
 assert.equal(cleanDisplayName('  김   철수\n'),'김 철수');
 assert.equal(cleanDisplayName('가'.repeat(42)).length,24);
 assert.equal(storedDisplayName({chageun_display_name:3}),'');
 assert.equal(storedDisplayName(null),'');
});
test('redirect URL supports GitHub Pages subpath and development root',()=>{
 assert.equal(authReturnUrl('https://jihuncha98.github.io','/chageun'),'https://jihuncha98.github.io/chageun/');
 assert.equal(authReturnUrl('https://example.org/','/'),'https://example.org/');
 assert.equal(authReturnUrl('http://localhost:3000',''),'http://localhost:3000/');
});
test('auth failures explain mail configuration and signup restrictions',()=>{
 assert.match(authErrorMessage({code:'email_address_not_authorized'},'signup'),/SMTP/);
 assert.match(authErrorMessage({code:'signup_disabled'},'signup'),/가입/);
 assert.match(authErrorMessage({code:'invalid_credentials'},'login'),/이메일 또는 비밀번호/);
 assert.match(authErrorMessage({code:'otp_expired'},'password'),/만료/);
});
