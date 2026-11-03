import test from 'node:test';
import assert from 'node:assert/strict';
import {friendLastSeen,friendTime,rankFriends,validFriendCode,type FriendBoardRow} from '../lib/friends';
const person=(id:string,ms:number|null):FriendBoardRow=>({member_id:id,display_name:id,total_ms:ms,studying:false,last_seen_at:null,is_me:id==='me',shared:ms!==null});
test('friends ranking: exact ties share position and private profiles are unranked',()=>{
 const rows=rankFriends([person('me',600000),person('b',1800000),person('c',600000),person('hidden',null)]);
 assert.deepEqual(rows.map(x=>[x.member_id,x.rank]),[['b',1],['c',2],['me',2],['hidden',null]]);
 assert.equal(rows[3].total_ms,null);
});
test('friend time displays completed minutes, not rounded up',()=>{
 assert.equal(friendTime(59999),'0시간 00분');
 assert.equal(friendTime(3600000+30000),'1시간 00분');
 assert.equal(friendTime(7260000),'2시간 01분');
 assert.equal(friendTime(null),'비공개');
});
test('friend codes require exact 16 hexadecimal characters',()=>{
 assert.ok(validFriendCode('abcdef0123456789'));
 assert.ok(validFriendCode(' ABCDEF0123456789 '));
 for(const invalid of ['12345','1234567890ghijkl','abcdefghijklmnop','abcd-ef0123456789'])assert.equal(validFriendCode(invalid),false);
});
test('last active time shows relative intervals without exposing private history',()=>{
 const now=Date.parse('2026-11-04T03:00:00Z');
 assert.equal(friendLastSeen(null,now),'접속 정보 없음');
 assert.equal(friendLastSeen(new Date(now-49000).toISOString(),now),'방금 접속');
 assert.equal(friendLastSeen(new Date(now-5*60000).toISOString(),now),'5분 전 접속');
 assert.equal(friendLastSeen(new Date(now-60*60000).toISOString(),now),'1시간 전 접속');
});
