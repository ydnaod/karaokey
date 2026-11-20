import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {mkdtempSync,mkdirSync,writeFileSync,readFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {io} from 'socket.io-client';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const temp=mkdtempSync(path.join(tmpdir(),'karaokey-test-'));
const port=Number(process.env.TEST_PORT||3191), url=`http://127.0.0.1:${port}`;
mkdirSync(temp+'/cache');mkdirSync(temp+'/bin');
for(const id of ['CACHED00001','CACHED00002'])writeFileSync(temp+'/cache/'+id+'.mp4','fixture');
writeFileSync(temp+'/bin/yt-dlp',`#!/bin/sh
sleep 0.1
case "$1" in
  ytsearch*) echo '{"id":"CACHED00001","title":"Search fixture","duration":180}'; exit 0 ;;
esac
for arg do last="$arg"; done
echo "$last" >> "$CACHE_DIR/jobs.log"
if [ "$last" = "SUCCESS0001" ]; then
  cp "$CACHE_DIR/CACHED00001.mp4" "$CACHE_DIR/SUCCESS0001.mp4"
  exit 0
fi
echo "Intentional fixture failure" >&2
exit 1
`,{mode:0o755});
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const until=async(fn,message)=>{for(let i=0;i<100;i++){const value=await fn();if(value)return value;await sleep(50);}throw Error(message)};
const event=(s,e)=>new Promise((resolve,reject)=>{const t=setTimeout(()=>{s.off(e,done);reject(Error('Timeout '+e))},5000);const done=v=>{clearTimeout(t);resolve(v)};s.once(e,done)});
let proc,logs='',failedExit=false;const clients=[];let token,code;
async function start(){proc=spawn(process.execPath,['--import','tsx','server/src/index.ts'],{cwd:root,env:{...process.env,YTDLP_PATH:temp+'/bin/yt-dlp',PORT:String(port),ROOMS_FILE:temp+'/rooms.json',CACHE_DIR:temp+'/cache',PATH:temp+'/bin:'+process.env.PATH},stdio:['ignore','pipe','pipe']});proc.stdout.on('data',d=>logs+=d);proc.stderr.on('data',d=>logs+=d);proc.on('exit',c=>{if(c!==null&&c!==0)failedExit=true});await until(async()=>{try{return(await fetch(url+'/health')).ok}catch{return false}},'server start');}
async function stop(signal='SIGTERM'){const p=proc;const done=new Promise(r=>p.once('exit',r));p.kill(signal);await done;}
async function connect(i){const s=io(url,{transports:['websocket'],reconnectionDelay:100,reconnectionDelayMax:200});clients.push(s);await event(s,'connect');s.on('room:state',r=>s.snapshot=r);if(i!==0){const p=event(s,'room:joined');s.emit('room:join',{roomCode:code,displayName:'Guest '+i});await p;}return s;}
try{
await start();const host=await connect(0);let p=event(host,'room:created');host.emit('room:create',{displayName:'Host'});({roomCode:code,hostToken:token}=await p);
await Promise.all(Array.from({length:19},(_,i)=>connect(i+1)));
for(const [i,s] of clients.entries())s.emit('queue:add',{url:`https://youtu.be/CACHED0000${i%2+1}`,title:`Song ${i}`});
await until(()=>host.snapshot?.queue.length===20,'20 adds');assert.equal(host.snapshot.participants.length,20);
console.log('PASS: 20 active clients; queue additions and room broadcasts');
host.emit('queue:reorder',{fromIndex:0,toIndex:19});await sleep(50);
host.emit('player:play',{queueItemId:host.snapshot.queue[0].id});await until(()=>host.snapshot.nowPlaying,'play');
const rev=host.snapshot.nowPlaying.revision;
host.emit('playback:report',{revision:rev,positionSeconds:37.5,paused:false});await sleep(50);
const display=io(url,{transports:['websocket']});clients.push(display);await event(display,'connect');p=event(display,'playback:state');display.emit('room:watch',{roomCode:code});assert.equal((await p).nowPlaying.positionSeconds,37.5);
console.log('PASS: late display receives measured host position');
for(let i=0;i<5;i++)host.emit('player:pause');await until(()=>host.snapshot.nowPlaying.paused,'pause');assert.equal(host.snapshot.nowPlaying.positionSeconds,37.5);
const pausedRev=host.snapshot.nowPlaying.revision;host.emit('playback:report',{revision:rev,positionSeconds:0,paused:false});await sleep(50);assert.equal(host.snapshot.nowPlaying.revision,pausedRev);
for(let i=0;i<5;i++)host.emit('player:resume');await until(()=>!host.snapshot.nowPlaying.paused,'resume');
clients[1].emit('player:next');clients[1].emit('playback:report',{revision:host.snapshot.nowPlaying.revision,positionSeconds:999,paused:false});await sleep(50);assert.equal(host.snapshot.nowPlaying.positionSeconds,37.5);
console.log('PASS: idempotent pause/resume, stale reports rejected, guest cannot control');
host.emit('pitch:set',{semitones:-4});await until(()=>host.snapshot.nowPlaying.pitchSemitones===-4,'pitch');
host.emit('playback:report',{revision:host.snapshot.nowPlaying.revision,positionSeconds:51,paused:false});await sleep(2200);
// Hard server restart: same sockets reconnect and rejoin, host credential survives.
for(const [i,s] of clients.entries()){s.on('connect',()=>s.emit(i===20?'room:watch':'room:join',i===20?{roomCode:code}:{roomCode:code,displayName:'Rejoined '+i,hostToken:i===0?token:undefined}));}
await stop('SIGKILL');await start();await until(()=>host.snapshot?.participants.length===20&&host.snapshot.nowPlaying.paused,'20 client recovery');assert.equal(host.snapshot.code,code);assert.equal(host.snapshot.queue.length,20);assert.equal(host.snapshot.nowPlaying.positionSeconds,51);assert.equal(host.snapshot.nowPlaying.pitchSemitones,-4);
console.log('PASS: SIGKILL restart restores code, queue, pitch, position and 20-client rejoin');
// New socket models a page refresh; token explicitly reclaims sole playback authority.
const demoted=event(host,'role:changed');const fresh=io(url,{transports:['websocket']});clients.push(fresh);await event(fresh,'connect');fresh.on('room:state',r=>fresh.snapshot=r);p=event(fresh,'room:joined');fresh.emit('room:join',{roomCode:code,displayName:'Refreshed host',hostToken:token});assert.equal((await p).myRole,'host');assert.equal((await demoted).newRole,'participant');host.disconnect();await until(()=>fresh.snapshot,'fresh snapshot');
console.log('PASS: replacement host reclaims sole authority and demotes previous socket');
const before=fresh.snapshot.queue.length;
for(let i=0;i<20;i++)clients[1+i%19].emit('queue:add',{url:`https://youtu.be/FAILTEST${String(i).padStart(3,'0')}`,title:'Fail '+i});
const searches=Promise.all(Array.from({length:20},()=>fetch(url+'/api/search?q=fixture').then(r=>r.json())));
let peak=0,rss=0;await until(async()=>{const health=await(await fetch(url+'/health')).json();peak=Math.max(peak,health.downloader.active);rss=Math.max(rss,health.rssBytes);return fresh.snapshot.queue.length===before+20&&fresh.snapshot.queue.filter(q=>q.audioFailed).length===20},'download failure drain');assert.ok(peak<=2);assert.ok(!failedExit);
assert.ok((await searches).every(r=>r.results?.length===1));
console.log('PASS: 20 concurrent searches share the downloader budget');
console.log(`PASS: 20 failed downloads do not crash; peak active=${peak}; observed RSS=${Math.round(rss/1024/1024)} MiB`);
// Duplicate new video jobs are shared, success and retry complete without a second download.
for(let i=1;i<6;i++)clients[i].emit('queue:add',{url:'https://youtu.be/SUCCESS0001',title:'Success fixture'});
await until(()=>fresh.snapshot.queue.filter(q=>q.videoId==='SUCCESS0001'&&q.audioReady).length===5,'shared success');
assert.equal(readFileSync(temp+'/cache/jobs.log','utf8').split('\n').filter(x=>x==='SUCCESS0001').length,1);
const retry=fresh.snapshot.queue.find(q=>q.audioFailed);
p=event(fresh,'room:error');fresh.emit('queue:retry',{queueItemId:retry.id});assert.match((await p).message,/Intentional fixture failure/);
await until(()=>fresh.snapshot.queue.find(q=>q.id===retry.id).audioFailed,'retry settles');
console.log('PASS: duplicate download deduplication, success fanout and failed retry recovery');
// Failed queue items block manual next, preserving current track.
for(const q of fresh.snapshot.queue.filter(q=>q.audioReady&&q.id!==fresh.snapshot.nowPlaying.queueItemId))fresh.emit('queue:remove',{queueItemId:q.id});await until(()=>fresh.snapshot.queue.length===21,'remove cached');p=event(fresh,'room:error');fresh.emit('player:next',{revision:fresh.snapshot.nowPlaying.revision});assert.match((await p).message,/AUDIO_NOT_READY/);
for(const q of fresh.snapshot.queue.filter(q=>q.audioFailed))fresh.emit('queue:remove',{queueItemId:q.id});await until(()=>fresh.snapshot.queue.length===1,'remove failed');p=event(display,'playback:state');fresh.emit('player:next',{revision:fresh.snapshot.nowPlaying.revision});assert.equal((await p).nowPlaying,null);await until(()=>fresh.snapshot.queue.length===0,'empty queue');
fresh.emit('player:pause');fresh.emit('player:resume');fresh.emit('player:next');fresh.emit('queue:reorder',{fromIndex:-1,toIndex:0});fresh.emit('queue:add',null);await sleep(100);assert.ok((await fetch(url+'/health')).ok);
console.log('PASS: unfinished next blocked; last song clears display; repeated empty controls and malformed packets survive');
assert.equal(JSON.parse(readFileSync(temp+'/rooms.json')).rooms[0].code,code);
console.log('PASS: atomic durable file readable; no unhandled rejections');
} catch(err){console.error(logs);throw err}finally{clients.forEach(s=>s.disconnect());if(proc?.exitCode===null)await stop();rmSync(temp,{recursive:true,force:true})}
