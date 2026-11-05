import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import test from 'node:test';
import {personName,visibleLabel} from '../lib/visible-names';

test('표시 이름과 별명은 분리된 채로 함께 읽힌다',()=>{
 assert.equal(personName('테스트용 수정','윤서준'),'테스트용 수정 (별명: 윤서준)');
 assert.equal(personName('테스트용 수정','테스트용 수정'),'테스트용 수정');
 assert.equal(personName(null,'윤서준'),'윤서준');
 assert.equal(personName('  이름  ','  별명  '),'이름 (별명: 별명)');
 assert.equal(personName('',''),'차근 사용자');
});

test('같은 회원 ID로 다른 화면에 나타나는 이름을 통일한다',()=>{
 const visible=new Map([['member',{user_id:'member',display_name:'새 이름',nickname:'공개 별명'}]]);
 assert.equal(visibleLabel(visible,'member','기존 별명'),'새 이름 (별명: 공개 별명)');
 assert.equal(visibleLabel(visible,'missing','기존 별명'),'기존 별명');
});

test('사용자 목록은 관계 검증 RPC로만 조회하며 원본 공부 기록을 변경하지 않는다',()=>{
 const sql=readFileSync('supabase/migrations/009_visible_names.sql','utf8');
 assert.match(sql,/RETURNS TABLE\(user_id uuid,display_name text,nickname text\)/);
 assert.match(sql,/auth\.uid\(\)/);
 assert.match(sql,/public\.friend_links/);
 assert.match(sql,/mine\.status='accepted'/);
 assert.match(sql,/peer\.status='accepted'/);
 assert.match(sql,/JOIN auth\.users u/);
 assert.match(sql,/GRANT EXECUTE ON FUNCTION public\.chageun_visible_names\(uuid\[\]\) TO authenticated/);
 assert.doesNotMatch(sql,/DELETE FROM (public\.study_workspaces|public\.friend_profiles|chageun_internal\.group_messages)/i);
});

test('그룹 채팅 메시지의 보관 기간과 권한 검사는 그대로 적용된다',()=>{
 const sql=readFileSync('supabase/migrations/009_visible_names.sql','utf8');
 assert.match(sql,/m\.created_at>now\(\)-interval '7 days'/);
 assert.match(sql,/public\.chageun_is_admin\(\)/);
 assert.match(sql,/m\.sender=auth\.uid\(\)/);
 assert.match(sql,/chageun_internal\.name_label/);
});
