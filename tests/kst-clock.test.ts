import {test} from 'node:test';
import {strict as assert} from 'node:assert';
import {kstClockSeconds,kstDateLabel} from '../lib/kst-clock';
test('visible clock uses Korea time including seconds regardless of browser timezone',()=>{
 assert.equal(kstClockSeconds(Date.parse('2026-11-03T18:00:03Z')),'03:00:03');
 assert.equal(kstClockSeconds(Date.parse('2026-11-03T21:00:00Z')),'06:00:00');
});
test('clock stays correct when Korea crosses midnight',()=>{
 assert.equal(kstClockSeconds(Date.parse('2026-11-03T14:59:59Z')),'23:59:59');
 assert.equal(kstClockSeconds(Date.parse('2026-11-03T15:00:00Z')),'00:00:00');
 assert.match(kstDateLabel(Date.parse('2026-11-03T15:00:00Z')),/11월 4일/);
});
