import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=(path:string)=>readFileSync(new URL(path,import.meta.url),'utf8');
const sql=read('../supabase/migrations/004_admin_core.sql');
const app=read('../app/page.tsx');
const view=read('../components/admin-panel.tsx');
const notices=read('../components/admin-notices.tsx');

test('관리자 권한은 서버 함수에서 확인한다',()=>{
 assert.match(sql,/CREATE OR REPLACE FUNCTION chageun_internal\.admin_require\(\)/);
 assert.match(sql,/public\.chageun_is_admin\(\)/);
 assert.match(sql,/REVOKE ALL ON public\.chageun_admin_identity/);
 assert.match(sql,/WHERE a\.singleton=1 AND a\.user_id=\(SELECT auth\.uid\(\)\)/);
});
test('회원 별명만 변경하고 조치 기록 및 알림을 남긴다',()=>{
 assert.match(sql,/UPDATE public\.friend_profiles SET nickname=trim\(p_nickname\)/);
 assert.match(sql,/admin_log\(me,'nickname_changed'/);
 assert.match(sql,/notify_user\(p_user,'친구 별명 변경'/);
 assert.doesNotMatch(sql,/UPDATE auth\.users SET raw_user_meta_data/);
});
test('삭제된 그룹은 즉시 운영에서 제외하고 7일간 보관한다',()=>{
 assert.match(sql,/CREATE TABLE IF NOT EXISTS chageun_internal\.group_archives/);
 assert.match(sql,/interval '7 days'/);
 assert.match(sql,/DELETE FROM public\.study_groups WHERE id=p_group/);
 assert.match(sql,/CREATE OR REPLACE FUNCTION public\.chageun_admin_restore_group/);
 assert.match(sql,/SELECT x\.user_id INTO selected_owner/);
 assert.match(sql,/JOIN public\.friend_profiles f ON f\.user_id=x\.user_id/);
});
test('회원·채팅·그룹 관리 함수는 권한 검사를 통과해야 한다',()=>{
 for(const fn of ['chageun_admin_set_nickname','chageun_admin_remove_member','chageun_admin_transfer_owner','chageun_admin_delete_group','chageun_admin_restore_group','chageun_admin_chat_limit']){
  const start=sql.indexOf(`CREATE OR REPLACE FUNCTION public.${fn}(`);
  assert.ok(start>=0,`${fn} 함수 존재`);
  const body=sql.slice(start,sql.indexOf('$$;',start)+3);
  assert.match(body,/chageun_internal\.admin_require\(\)/);
 }
});
test('알림과 기록은 서버 작업으로 자동 보관 기간이 적용된다',()=>{
 assert.match(sql,/created_at<=now\(\)-interval '7 days'/);
 assert.match(sql,/created_at<=now\(\)-interval '30 days'/);
 assert.match(sql,/chageun-admin-retention/);
 assert.match(notices,/chageun_mark_admin_notice_read/);
});
test('관리자 메뉴는 권한 확인 후 노출하며 버튼은 서버 RPC를 호출한다',()=>{
 assert.match(app,/rpc\('chageun_is_admin'\)/);
 assert.match(app,/isAdmin\?\[\.\.\.tabs,'관리자'\]/);
 assert.match(view,/chageun_admin_dashboard/);
 assert.match(view,/chageun_admin_delete_group/);
});
