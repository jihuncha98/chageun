import test from 'node:test';
import assert from 'node:assert/strict';
import {MAX_LIVE_PREVIEW_MS,sharedStudyTime} from '../lib/live-board-time';
const sample=Date.parse('2026-11-04T15:10:00+09:00');
test('a live shared timer advances in seconds between 45-second RPC snapshots',()=>{
 assert.equal(sharedStudyTime(127000,true,sample,sample+1000),128000);
 assert.equal(sharedStudyTime(127000,true,sample,sample+45200),172200);
});
test('completed and private records never advance',()=>{
 assert.equal(sharedStudyTime(127000,false,sample,sample+12000),127000);
 assert.equal(sharedStudyTime(127000,null,sample,sample+12000),127000);
 assert.equal(sharedStudyTime(null,true,sample,sample+12000),null);
 assert.equal(sharedStudyTime(0,true,sample,sample+12000,false),0);
});
test('running totals do not drift for minutes if the network connection is lost',()=>{
 assert.equal(sharedStudyTime(127000,true,sample,sample+120000),127000+MAX_LIVE_PREVIEW_MS);
 assert.equal(sharedStudyTime(127000,true,sample,sample-1000),127000);
});
test('06:00 Korea study-day rollover prevents yesterday’s totals carrying over',()=>{
 const old=Date.parse('2026-11-05T05:59:58+09:00');
 const start=Date.parse('2026-11-05T06:00:00+09:00');
 assert.equal(sharedStudyTime(7200000,true,old,start+2500),2500);
 assert.equal(sharedStudyTime(7200000,false,old,start+2500),0); // never carry yesterday into the new day
});
