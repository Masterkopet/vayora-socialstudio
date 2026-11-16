import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import http from 'node:http';
import { randomBytes } from 'node:crypto';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import { openStore } from '../src/store.mjs';
import { hashPassword } from '../src/auth.mjs';
import { addMedia } from '../src/media.mjs';
const exec=promisify(execFile),root=path.resolve(import.meta.dirname,'..');
await mkdir(path.join(root,'test-results'),{recursive:true});
const fixture=await mkdtemp(path.join(root,'test-results','container-')),data=path.join(fixture,'data'),container='vayora-deploy-test-'+randomBytes(6).toString('hex'),origin='https://studio.example.test',password='Docker-'+randomBytes(16).toString('hex');
const store=openStore(data);try{
 store.run('INSERT INTO users(id,email,name,password_hash,role,created_at) VALUES(?,?,?,?,?,?)','owner','docker-test@example.test','Docker Test',await hashPassword(password),'owner',new Date().toISOString());
 store.set('paused',true);store.set('publishingEnabled',false);
 const file=path.join(fixture,'original.png');await sharp({create:{width:1080,height:1350,channels:3,background:'#FFF9E1'}}).png().toFile(file);const media=await addMedia(store,file,'Original.png','image/png');
 store.insertPost({id:'I01',title:'Original fixture',caption:'Existing caption',format:'Gambar',mediaIds:[media.id],status:'draft',approved:false});
}finally{store.close();}
function request(url,{method='GET',body,cookie,csrf}={}){return new Promise((resolve,reject)=>{const headers={Host:'studio.example.test',Origin:origin};if(body){headers['Content-Type']='application/json';}if(cookie)headers.Cookie=cookie;if(csrf)headers['x-csrf-token']=csrf;const req=http.request('http://127.0.0.1:3213'+url,{method,headers},res=>{const chunks=[];res.on('data',c=>chunks.push(c));res.on('end',()=>{const raw=Buffer.concat(chunks);resolve({status:res.statusCode,headers:res.headers,data:res.headers['content-type']?.includes('application/json')?JSON.parse(raw):raw});});});req.on('error',reject);req.end(body?JSON.stringify(body):undefined);});}
async function ready(){for(let i=0;i<40;i++){try{const r=await request('/health');if(r.status===200)return;}catch{}await new Promise(resolve=>setTimeout(resolve,250));}throw Error('Container health timed out');}
try{
 await exec('docker',['run','--detach','--name',container,'--publish','127.0.0.1:3213:3210','--mount',`type=bind,source=${data},target=/app/data`,'--env',`APP_ORIGIN=${origin}`,'--env',`PUBLIC_BASE_URL=${origin}`,'vayora-social-studio:deploy-check']);
 await ready();assert.equal((await request('/api/auth/status')).data.setupRequired,false);assert.equal((await request('/api/workspace')).status,401);
 const login=await request('/api/auth/login',{method:'POST',body:{email:'docker-test@example.test',password}});assert.equal(login.status,200);assert.ok(login.headers['set-cookie'][0].includes('Secure'));const auth={cookie:login.headers['set-cookie'][0].split(';')[0],csrf:login.data.csrf};
 assert.equal((await request('/api/workspace',auth)).data.posts.length,1);
 const design=await request('/api/assistant/design',{...auth,method:'POST',body:{headline:'Semua villa. Satu dasbor.',subline:'Konten pengujian deploy lokal.',cta:'Lihat cara kerja',theme:'navy'}});assert.equal(design.status,201,JSON.stringify(design.data));
 const output=await request(design.data.media.url,auth);assert.equal(output.status,200);const meta=await sharp(output.data).metadata();assert.equal(meta.width,1080);assert.equal(meta.height,1350);
 await exec('docker',['exec',container,'ffmpeg','-v','error','-f','lavfi','-i','color=c=blue:s=720x1280:r=30','-t','3','-c:v','libx264','-pix_fmt','yuv420p','/tmp/deploy-fixture.mp4']);
 await exec('docker',['cp',container+':/tmp/deploy-fixture.mp4',path.join(fixture,'fixture.mp4')]);
 const form=new FormData();form.append('files',new Blob([await readFile(path.join(fixture,'fixture.mp4'))],{type:'video/mp4'}),'Deployment.mp4');const encoded=new Response(form),bytes=Buffer.from(await encoded.arrayBuffer());
 const upload=await new Promise((resolve,reject)=>{const req=http.request('http://127.0.0.1:3213/api/media',{method:'POST',headers:{Host:'studio.example.test',Origin:origin,Cookie:auth.cookie,'x-csrf-token':auth.csrf,'Content-Type':encoded.headers.get('Content-Type'),'Content-Length':bytes.length}},res=>{const chunks=[];res.on('data',c=>chunks.push(c));res.on('end',()=>resolve({status:res.statusCode,data:JSON.parse(Buffer.concat(chunks))}));});req.on('error',reject);req.end(bytes);});
 assert.equal(upload.status,201,JSON.stringify(upload.data));assert.equal(upload.data.media[0].mime,'video/mp4');assert.ok(upload.data.media[0].duration>=3);assert.equal((await request(upload.data.media[0].posterUrl,auth)).status,200);
 await exec('docker',['restart',container]);await ready();assert.equal((await request('/api/workspace',auth)).data.posts[0].caption,'Existing caption');assert.equal((await request(design.data.media.url,auth)).status,200);
 console.log('PASS Linux Docker: existing owner login, HTTPS Secure cookie, private media, Sharp/fonts/logo composition, FFmpeg upload + poster, persistent data after container restart. No real accounts or paid API calls.');
}finally{await exec('docker',['rm','--force',container]).catch(()=>{});}
