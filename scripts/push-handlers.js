self.addEventListener('push',event=>{
 let content={title:'차근',body:'새 관리자 알림이 도착했어요.',tag:'chageun'};
 try{content={...content,...event.data.json()};}catch{}
 event.waitUntil(self.registration.showNotification(content.title,{
  body:content.body,tag:content.tag,
  icon:self.registration.scope+'icon-192.png',
  badge:self.registration.scope+'icon-192.png',
  data:{url:self.registration.scope+'?notifications=1'}
 }));
});
self.addEventListener('notificationclick',event=>{
 event.notification.close();
 event.waitUntil((async()=>{
  const windows=await self.clients.matchAll({type:'window',includeUncontrolled:true});
  const existing=windows.find(client=>client.url.startsWith(self.registration.scope));
  if(existing){
   existing.postMessage({type:'chageun-notifications'});
   await existing.focus();
  }else{
   await self.clients.openWindow(self.registration.scope+'?notifications=1');
  }
 })());
});
