import assert from 'node:assert/strict';
import test from 'node:test';
import {clampGroupPage,groupPageCount,groupViewDescription,validGroupName,GROUP_BOARD_PAGE_SIZE} from '../lib/groups';

test('groups have no fixed member count maximum; board results are paged',()=>{
 assert.equal(GROUP_BOARD_PAGE_SIZE,15);
 assert.equal(groupPageCount(0),1);
 assert.equal(groupPageCount(1),1);
 assert.equal(groupPageCount(15),1);
 assert.equal(groupPageCount(16),2);
 assert.equal(groupPageCount(1001),67);
 assert.equal(groupPageCount(150000),10000);
});
test('group page selection is bounded to the total',()=>{
 assert.equal(clampGroupPage(-5,35),1);
 assert.equal(clampGroupPage(2,35),2);
 assert.equal(clampGroupPage(10,35),3);
 assert.equal(clampGroupPage(NaN,35),1);
});
test('group names must have 2-40 characters after trimming',()=>{
 assert.equal(validGroupName('가'),false);
 assert.equal(validGroupName(' 공부 친구들 '),true);
 assert.equal(validGroupName('a'.repeat(40)),true);
 assert.equal(validGroupName('a'.repeat(41)),false);
});
test('group privacy description limits the shared data',()=>{
 assert.match(groupViewDescription(true),/오늘 순공 시간/);
 assert.match(groupViewDescription(true),/과거 기록은 비공개/);
 assert.match(groupViewDescription(false),/공부 시간 공유를 켜야/);
});
