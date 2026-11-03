import {test} from 'node:test';
import {strict as assert} from 'node:assert';
import {pageCount,pageItems,pageNumbers,RECORDS_PER_PAGE,safePage} from '../lib/pagination';

test('records use 7 items per page, first to last',()=>{
 const records=Array.from({length:24},(_,n)=>n+1);
 assert.equal(RECORDS_PER_PAGE,7);
 assert.equal(pageCount(records.length),4);
 assert.deepEqual(pageItems(records,1),[1,2,3,4,5,6,7]);
 assert.deepEqual(pageItems(records,2),[8,9,10,11,12,13,14]);
 assert.deepEqual(pageItems(records,4),[22,23,24]);
});
test('page numbers shrink and stay clamped after deletions',()=>{
 assert.equal(pageCount(0),1);
 assert.equal(safePage(8,pageCount(8)),2);
 assert.equal(safePage(8,pageCount(1)),1);
 assert.deepEqual(pageItems([1,2,3],50),[1,2,3]);
 assert.deepEqual(pageItems([],3),[]);
});
test('number shortcuts stay within total pages',()=>{
 assert.deepEqual(pageNumbers(1,3),[1,2,3]);
 assert.deepEqual(pageNumbers(1,20),[1,2,3,4,5]);
 assert.deepEqual(pageNumbers(10,20),[8,9,10,11,12]);
 assert.deepEqual(pageNumbers(20,20),[16,17,18,19,20]);
});
test('invalid page numbers are safe',()=>{
 assert.equal(safePage(Number.NaN,5),1);
 assert.equal(safePage(-10,5),1);
 assert.equal(safePage(Infinity,5),1);
 assert.equal(safePage(100,5),5);
});
