import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import test from 'node:test';
const sql=readFileSync('supabase/migrations/003_groups.sql','utf8');
test('group tables deny direct anon and authenticated table access',()=>{
 assert.match(sql,/alter table public\.study_groups enable row level security/i);
 assert.match(sql,/alter table public\.study_group_members enable row level security/i);
 assert.match(sql,/revoke all on public\.study_groups,public\.study_group_members from public,anon,authenticated/i);
});
test('group invitations require acceptance and do not expose pending invitees in the board',()=>{
 assert.match(sql,/function public\.group_respond\(/i);
 assert.match(sql,/where group_id=p_group and user_id=me and status='pending'/i);
 assert.match(sql,/mine\.status='accepted'/i);
 assert.match(sql,/theirs\.status='accepted'/i);
});
test('only accepted group members can view a group board; sharing opt-out still applies',()=>{
 assert.match(sql,/where group_id=p_group and user_id=me and status='accepted'/i);
 assert.match(sql,/case when p\.user_id=me or \(my_share and p\.share_enabled\)/i);
 assert.match(sql,/limit p_limit offset p_offset/i);
});
test('group functions are authenticated-only and private study workspaces are not reset',()=>{
 assert.match(sql,/grant execute on function public\.group_board\(uuid,integer,integer\) to authenticated/i);
 assert.match(sql,/grant execute on function public\.group_overview\(\) to authenticated/i);
 assert.doesNotMatch(sql,/drop table|truncate table|delete from public\.study_workspaces/i);
});
