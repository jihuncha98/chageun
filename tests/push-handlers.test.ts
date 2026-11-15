import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
test('push event shows a notification and a tap opens the notification menu',async()=>{
 const handlers=new Map<string,(event:unknown)=>void>();
 const shown:unknown[]=[];
 const opened:string[]=[];
 const scope='https://jihuncha98.github.io/chageun/';
 const worker={registration:{scope,showNotification:async(title:string,options:unknown)=>{shown.push({title,options});}},clients:{
  matchAll:async()=>[],openWindow:async(url:string)=>{opened.push(url);}
 },addEventListener:(name:string,fn:(event:unknown)=>void)=>handlers.set(name,fn)};
 vm.runInNewContext(readFileSync('scripts/push-handlers.js','utf8'),{self:worker});
 let pending:Promise<unknown>=Promise.resolve();
 const waitUntil=(promise:Promise<unknown>)=>{pending=promise;};
 handlers.get('push')!({data:{json:()=>({title:'테스트',body:'내용'})},waitUntil});
 await pending;assert.equal((shown[0] as {title:string}).title,'테스트');
 handlers.get('notificationclick')!({notification:{close:()=>{}},waitUntil});
 await pending;assert.deepEqual(opened,[scope+'?notifications=1']);
 const received:unknown[]=[];
 worker.clients.matchAll=async()=>[{url:scope,postMessage:(message:unknown)=>received.push(message),focus:async()=>{}}] as never;
 handlers.get('notificationclick')!({notification:{close:()=>{}},waitUntil});
 await pending;
 assert.equal(opened.length,1);
 assert.equal((received[0] as {type:string}).type,'chageun-notifications');
});
