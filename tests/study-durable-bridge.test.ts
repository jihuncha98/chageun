import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const component=fs.readFileSync('01_UPLOAD_TO_GITHUB_ROOT/components/study-statistics.tsx','utf8');
test('UI reads the durable table and no longer uses disposable preview',()=>{
 assert.match(component,/\.from\('study_daily_rollup_durable'\)/);
 assert.doesNotMatch(component,/\.from\('study_daily_rollup_preview'\)/);
});
test('read query is scoped to signed-in user and study days',()=>{
 assert.match(component,/\.eq\('user_id',userId\)/);
 assert.match(component,/\.gte\('study_day',rollupQueryFrom\(now\)\)/);
 assert.match(component,/\.lte\('study_day',currentStudyDay\)/);
});
test('UI keeps the comparison gate and falls back to original study data',()=>{
 assert.match(component,/rollupMatchesRaw\(data,now,range,rollupState\.rows\)/);
 assert.match(component,/studyStatisticsFromRollup\(data,now,range,rollupState\.rows\):rawReport/);
 assert.match(component,/오래된 측정 기록의 자동 삭제는 아직 비활성화/);
});
test('UI only performs SELECT on rollup, never archive cleanup',()=>{
 assert.doesNotMatch(component,/\.delete\(\)|\.update\(\)|\.insert\(\)/);
 assert.doesNotMatch(component,/archive_old_entries|prune_old_entries|cleanup_entries/);
});
