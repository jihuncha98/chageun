import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

// Read the component from the actual repository layout, not from the upload ZIP layout.
const component=fs.readFileSync(new URL('../components/study-statistics.tsx',import.meta.url),'utf8');

test('statistics UI reads the permanent rollup rather than the temporary preview',()=>{
 assert.match(component,/\.from\('study_daily_rollup_durable'\)/);
 assert.doesNotMatch(component,/\.from\('study_daily_rollup_preview'\)/);
});

test('rollup query is restricted to current user and the selected study-day window',()=>{
 assert.match(component,/\.eq\('user_id',userId\)/);
 assert.match(component,/\.gte\('study_day',rollupQueryFrom\(now\)\)/);
 assert.match(component,/\.lte\('study_day',currentStudyDay\)/);
});

test('after 1.14 archive cleanup UI checks retained detail coverage and preserves fallback',()=>{
 // After archive, permanent totals can exceed the retained 2-day raw history.
 // The former rollupMatchesRaw gate and its pre-archive help text are now obsolete.
 assert.match(component,/rollupCoversRetainedRaw\(data,now,range,rollupState\.rows\)/);
 assert.match(component,/studyStatisticsFromRollup\(data,now,range,rollupState\.rows\):rawReport/);
 assert.match(component,/개별 측정 기록은 오늘과 어제만 보관/);
 assert.doesNotMatch(component,/rollupMatchesRaw\(data,now,range,rollupState\.rows\)/);
});

test('statistics UI never directly modifies archived study data',()=>{
 assert.doesNotMatch(component,/\.delete\(\)|\.update\(\)|\.insert\(\)/);
 assert.doesNotMatch(component,/archive_old_entries|prune_old_entries|cleanup_entries/);
});
