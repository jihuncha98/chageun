import {test} from 'node:test';
import assert from 'node:assert/strict';
import {shouldShowFocusMode} from '../lib/focus-mode';
import {emptyStudy,start,stop,uid, type Study} from '../lib/study';

const view={ready:true,review:false,remoteConflict:false};
function seededStudy():Study{
 const s=emptyStudy();
 const subjectId=uid(),taskId=uid();
 s.subjects.push({id:subjectId,name:'수학',archived:false,deleted_at:null});
 s.tasks.push({id:taskId,subjectId,day:'2026-11-05',title:'구분구적법',done:false,deleted_at:null});
 return s;
}
test('focus mode opens from the persisted active timer, even after reloading the view',()=>{
 const s=seededStudy();
 assert.equal(shouldShowFocusMode(s,view),false);
 const taskId=s.tasks[0].id;
 const now=Date.now();
 start(s,taskId,'device-a',now);
 assert.equal(shouldShowFocusMode(s,view),true);
 const reloaded=structuredClone(s);
 assert.equal(shouldShowFocusMode(reloaded,view),true);
 // The same server data is presented as focus mode on another device too.
 assert.equal(shouldShowFocusMode(reloaded,view),true);
 stop(s,now+120000);
 assert.equal(shouldShowFocusMode(s,view),false);
 assert.equal(s.tasks[0].done,false,'stop must never mark a task completed');
 assert.equal(s.entries[0].end,now+120000);
});
test('loading and conflicts retain the recovery path',()=>{
 const s=seededStudy();start(s,s.tasks[0].id,'a',Date.now());
 assert.equal(shouldShowFocusMode(s,{...view,ready:false}),false);
 assert.equal(shouldShowFocusMode(s,{...view,review:true}),false);
 assert.equal(shouldShowFocusMode(s,{...view,remoteConflict:true}),false);
});
test('older nap entries are not treated as active study focus timers',()=>{
 const s=seededStudy();
 s.entries.push({id:uid(),taskId:null,kind:'nap',start:Date.now(),end:null,confirmed:Date.now(),device:'old',napMinutes:20,deleted_at:null});
 assert.equal(shouldShowFocusMode(s,view),false);
});
