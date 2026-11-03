import {readdir,writeFile} from 'node:fs/promises';
import {join,relative} from 'node:path';
const root='out';const base=process.env.NEXT_PUBLIC_BASE_PATH??'/chageun';const files=[];
async function walk(dir){for(const e of await readdir(dir,{withFileTypes:true})){const p=join(dir,e.name);if(e.isDirectory())await walk(p);else if(/\.(js|css|woff2)$/.test(p)&&!p.endsWith('sw.js'))files.push(`${base}/${relative(root,p).replaceAll('\\','/')}`);}}
await walk(root);files.push(`${base}/`,`${base}/index.html`);
await writeFile(join(root,'sw.js'),`const CACHE='chageun-shell-${Date.now()}';const FILES=${JSON.stringify(files)};
self.addEventListener('install',e=>{e.waitUntil(caches.open(CACHE).then(c=>c.addAll(FILES)));});
self.addEventListener('activate',e=>{e.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k.startsWith('chageun-shell-')&&k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim()));});
self.addEventListener('fetch',e=>{const u=new URL(e.request.url);if(e.request.method!=='GET'||u.origin!==self.location.origin)return;if(e.request.mode==='navigate'&&(u.pathname==='${base}/'||u.pathname==='${base}/index.html')){e.respondWith(fetch(e.request).catch(()=>caches.match('${base}/')));return;}if(FILES.includes(u.pathname))e.respondWith(caches.match(e.request).then(c=>c||fetch(e.request)));});`);
