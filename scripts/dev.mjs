import {spawn} from 'node:child_process';
const a=process.argv.slice(2);const args=[];
for(let i=0;i<a.length;i++){if(a[i]==='--strictPort')continue;args.push(a[i]==='--host'?'--hostname':a[i]);}
const child=spawn(process.execPath,['node_modules/next/dist/bin/next','dev','--webpack',...args],{stdio:'inherit'});
child.on('exit',code=>process.exit(code??0));for(const signal of ['SIGTERM','SIGINT'])process.on(signal,()=>child.kill(signal));
