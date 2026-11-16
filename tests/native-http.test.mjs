import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, readFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import sharp from 'sharp';
import { createApp } from '../src/server.mjs';

test('native Web Request transport preserves private uploads, HEAD and byte-range media playback',async()=>{
 const directory=await mkdtemp(path.join(os.tmpdir(),'vayora-native-')),runtime=createApp({dataDir:directory,scheduler:false,origin:'http://localhost:3210'});
 const request=(route,options={})=>runtime.app.fetch(new Request('http://localhost:3210'+route,{...options,headers:{Host:'localhost:3210',Origin:'http://localhost:3210',...options.headers}}));
 try{
  const account=await request('/api/auth/setup',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name:'Native Transport',email:'native@example.test',password:'Only-for-testing-12345'})});assert.equal(account.status,201);const user=await account.json(),cookie=account.headers.getSetCookie()[0].split(';')[0];
  const form=new FormData(),image=await sharp({create:{width:1080,height:1350,channels:3,background:'#00285c'}}).png().toBuffer();form.append('files',new Blob([image],{type:'image/png'}),'Fixture.png');
  const uploaded=await request('/api/media',{method:'POST',headers:{Cookie:cookie,'x-csrf-token':user.csrf},body:form});assert.equal(uploaded.status,201);const media=(await uploaded.json()).media[0];
  assert.equal((await request(media.url)).status,401);
  const full=await request(media.url,{headers:{Cookie:cookie}}),bytes=Buffer.from(await full.arrayBuffer());assert.equal(full.status,200);assert.equal(full.headers.get('Content-Type'),'image/jpeg');
  const head=await request(media.url,{method:'HEAD',headers:{Cookie:cookie}});assert.equal(head.status,200);assert.equal(Number(head.headers.get('Content-Length')),bytes.length);assert.equal((await head.arrayBuffer()).byteLength,0);
  const partial=await request(media.url,{headers:{Cookie:cookie,Range:'bytes=0-15'}});assert.equal(partial.status,206);assert.equal(partial.headers.get('Content-Range'),`bytes 0-15/${bytes.length}`);assert.deepEqual(Buffer.from(await partial.arrayBuffer()),bytes.subarray(0,16));
  const suffix=await request(media.url,{headers:{Cookie:cookie,Range:'bytes=-7'}});assert.equal(suffix.status,206);assert.deepEqual(Buffer.from(await suffix.arrayBuffer()),bytes.subarray(-7));
  const invalid=await request(media.url,{headers:{Cookie:cookie,Range:'bytes=999999999-'}});assert.equal(invalid.status,416);assert.equal(invalid.headers.get('Content-Range'),'bytes */'+bytes.length);
  const blocked=await request('/api/media',{method:'POST',headers:{Cookie:cookie},body:new FormData()});assert.equal(blocked.status,403);
 }finally{runtime.close();const target=path.resolve(directory);assert.ok(target.startsWith(path.resolve(os.tmpdir())+path.sep)&&path.basename(target).startsWith('vayora-native-'));await rm(target,{recursive:true,force:true});}
});
