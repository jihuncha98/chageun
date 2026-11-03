import {test} from 'node:test';
import assert from 'node:assert/strict';
import {studyDay} from '../lib/study-day';
for (const [input,expected] of [['2026-11-03T05:59:59+09:00','2026-11-02'],['2026-11-03T06:00:00+09:00','2026-11-03'],['2027-01-01T03:00:00+09:00','2026-12-31'],['2028-03-01T02:00:00+09:00','2028-02-29']]) test(input,()=>assert.equal(studyDay(new Date(input)),expected));
test('invalid input',()=>assert.throws(()=>studyDay(new Date('invalid'))));
