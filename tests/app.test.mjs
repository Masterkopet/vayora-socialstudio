import test from 'node:test';
import http from 'node:http';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { randomBytes } from 'node:crypto';
import { createApp } from '../src/server.mjs';
import { openStore } from '../src/store.mjs';
import { createInstagram } from '../src/instagram.mjs';

async function fixture(options={}){const directory=await mkdtemp(path.join(os.tmpdir(),'vayora-test-'));const runtime=createApp({dataDir:directory,scheduler:false,origin:'http://localhost:3210',...options});const server=runtime.app.listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));const base=`http://127.0.0.1:${server.address().port}`;async function request(url,method='GET',body,session=null,extra={}){const headers={Host:'localhost:3210',Origin:'http://localhost:3210',...extra};if(body){headers['Content-Type']='application/json';}if(session?.cookie){headers.Cookie=session.cookie;headers['x-csrf-token']=session.csrf;}return new Promise((resolve,reject)=>{const req=http.request(base+url,{method,headers},res=>{const chunks=[];res.on('data',chunk=>chunks.push(chunk));res.on('end',()=>{try{const raw=Buffer.concat(chunks).toString('utf8'),data=res.headers['content-type']?.includes('text/csv')?raw:JSON.parse(raw);resolve({response:{status:res.statusCode,headers:new Headers(res.headers)},data});}catch(e){reject(e);}});});req.on('error',reject);req.end(body?JSON.stringify(body):undefined);});}async function setup(){const password='Test-'+randomBytes(16).toString('hex');const result=await request('/api/auth/setup','POST',{name:'Pemilik Uji',email:'owner@example.test',password});assert.equal(result.response.status,201);return{...result.data,cookie:result.response.headers.get('set-cookie').split(';')[0],password};}return{...runtime,request,setup,async cleanup(){await new Promise(resolve=>server.close(resolve));runtime.close();await safeRemove(directory);}};}

test('session, origin, CSRF, password change and logout protect real records',async()=>{const f=await fixture();try{
 assert.equal((await f.request('/api/workspace')).response.status,401);assert.equal((await f.request('/api/assistant/knowledge')).response.status,401);assert.equal((await f.request('/api/assistant/knowledge/export')).response.status,401);
 assert.equal((await f.request('/api/auth/setup','POST',{},{}, {Origin:'https://untrusted.example'})).response.status,403);
 const session=await f.setup();assert.ok(session.csrf);const stored=f.store.get('SELECT password_hash FROM users');assert.ok(!stored.password_hash.includes(session.password));
 assert.equal((await f.request('/api/workspace','GET',null,session)).response.status,200);const knowledge=await f.request('/api/assistant/knowledge?status=coming_soon','GET',null,session);assert.equal(knowledge.response.status,200);assert.equal(knowledge.data.facts.length,3);assert.equal(knowledge.data.overview.sources.length,14);
 const cookieOnly={cookie:session.cookie,csrf:''};assert.equal((await f.request('/api/workspace/settings','POST',{paused:false},cookieOnly)).response.status,403);
 assert.equal((await f.request('/api/auth/setup','POST',{name:'Other',email:'other@example.test',password:session.password})).response.status,409);
 assert.equal((await f.request('/api/auth/login','POST',{email:'owner@example.test',password:'incorrect'})).response.status,401);
 const next='New-'+randomBytes(16).toString('hex');assert.equal((await f.request('/api/auth/password','POST',{currentPassword:session.password,password:next},session)).response.status,200);
 await f.request('/api/auth/logout','POST',{},session);assert.equal((await f.request('/api/workspace','GET',null,session)).response.status,401);
 assert.equal((await f.request('/api/auth/login','POST',{email:'owner@example.test',password:session.password})).response.status,401);
 assert.equal((await f.request('/api/auth/login','POST',{email:'owner@example.test',password:next})).response.status,200);
 }finally{await f.cleanup();}});

test('one-use editor invitation never grants owner access',async()=>{const f=await fixture();try{const owner=await f.setup();const result=await f.request('/api/team/invites','POST',{email:'editor@example.test'},owner);assert.equal(result.response.status,201);const token=new URL(result.data.url).searchParams.get('invite');const password='Editor-'+randomBytes(12).toString('hex');const join=await f.request('/api/auth/accept-invite','POST',{token,name:'Editor Uji',password,role:'owner'});assert.equal(join.response.status,201);assert.equal(join.data.user.role,'editor');const editor={cookie:join.response.headers.get('set-cookie').split(';')[0],csrf:join.data.csrf};assert.equal((await f.request('/api/instagram/config','POST',{appId:'12345'},editor)).response.status,403);assert.equal((await f.request('/api/assistant/config','POST',{apiKey:'sk-fixture-secret-12345'},editor)).response.status,403);assert.equal((await f.request('/api/assistant/background','POST',{brief:'An image'},editor)).response.status,403);assert.equal((await f.request('/api/assistant/brand','POST',{tone:'changed'},editor)).response.status,403);assert.equal((await f.request('/api/assistant/times','GET',null,editor)).response.status,200);assert.equal((await f.request('/api/auth/accept-invite','POST',{token,name:'Editor Uji',password})).response.status,400);assert.equal((await f.request('/api/invites/'+token)).response.status,404);}finally{await f.cleanup();}});

test('approval, revision conflicts, planning schedules, private media and signed URLs',async()=>{const f=await fixture();try{const session=await f.setup();const mediaId='a'.repeat(64);f.store.run('INSERT INTO media(id,path,mime,name,size,width,height,created_at) VALUES(?,?,?,?,?,?,?,?)',mediaId,'fixture.jpg','image/jpeg','fixture.jpg',10,1080,1350,new Date().toISOString());let result=await f.request('/api/posts','POST',{id:'I01',format:'Gambar',title:'Konten uji',caption:'Caption',mediaIds:[mediaId]},session);assert.equal(result.response.status,201);let item=result.data;const d=new Date(Date.now()+48*3600000);const parts=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Jakarta',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(d);const date=['year','month','day'].map(t=>parts.find(x=>x.type===t).value).join('-');
 assert.equal((await f.request('/api/posts/I01','PUT',{...item,intent:'scheduled',date,time:'12:00',approved:false},session)).response.status,400);
 result=await f.request('/api/posts/I01','PUT',{...item,intent:'scheduled',date,time:'12:00',approved:true},session);assert.equal(result.response.status,200);assert.equal(result.data.status,'scheduled');assert.equal(f.store.setting('publishingEnabled',false),false);
 assert.equal((await f.request('/api/posts/I01','PUT',{...item,intent:'draft'},session)).response.status,409);
 item=result.data;result=await f.request('/api/posts/I01','PUT',{...item,caption:'Caption diubah',approved:false,intent:'review'},session);assert.equal(result.data.approved,false);assert.equal(result.data.scheduleAt,null);
 assert.equal((await f.request('/media/'+mediaId)).response.status,401);
 assert.equal((await f.request('/public/media/'+mediaId+'?expires=0&signature='+'a'.repeat(64))).response.status,403);
 const connect=await f.request('/api/instagram/connect','POST',{},session);assert.equal(connect.response.status,422);assert.match(connect.data.error,/App ID/);
 assert.equal((await f.request('/api/workspace/publishing','POST',{enabled:true,confirmation:'AKTIFKAN'},session)).response.status,400);
 }finally{await f.cleanup();}});

test('version restore enforces revisions and locks, preserves history and clears approval/scheduling',async()=>{const f=await fixture();try{
 const session=await f.setup(),mediaId='v'.repeat(64);f.store.run('INSERT INTO media(id,path,mime,name,size,width,height,created_at) VALUES(?,?,?,?,?,?,?,?)',mediaId,'fixture.jpg','image/jpeg','fixture.jpg',10,1080,1350,new Date().toISOString());
 let r=await f.request('/api/posts','POST',{id:'I01',title:'Original',caption:'Original caption',format:'Gambar',mediaIds:[mediaId]},session);assert.equal(r.response.status,201);
 const original=r.data,baseline=(await f.request('/api/posts/I01/versions','GET',null,session)).data.versions[0];
 r=await f.request('/api/posts/I01','PUT',{...original,caption:'AI replacement',intent:'draft',changeSource:'ai'},session);assert.equal(r.response.status,200);const latest=r.data;
 assert.equal((await f.request('/api/posts/I01/versions','GET',null,session)).data.versions[0].reason,'ai');
 assert.equal((await f.request('/api/posts/I01/restore','POST',{versionId:baseline.id,revision:original.revision},session)).response.status,409);
 r=await f.request('/api/posts/I01/restore','POST',{versionId:baseline.id,revision:latest.revision},session);assert.equal(r.response.status,200);assert.equal(r.data.caption,'Original caption');assert.equal(r.data.status,'draft');assert.equal(r.data.approved,false);assert.equal(r.data.scheduleAt,null);
 assert.equal((await f.request('/api/posts/I01/readiness','GET',null,session)).data.ready,false);
 const restored=f.store.post('I01');f.store.savePost({...restored,status:'published',mediaId:'real-published-lock'},restored.revision);
 assert.equal((await f.request('/api/posts/I01/restore','POST',{versionId:baseline.id,revision:f.store.post('I01').revision},session)).response.status,409);
 assert.equal((await f.request('/api/posts/I01/versions')).response.status,401);
 }finally{await f.cleanup();}});

test('marketing HTTP validates tracking origins, owner configuration, atomic imports and actual CSV export',async()=>{const f=await fixture();try{
 assert.equal((await f.request('/api/marketing')).response.status,401);const owner=await f.setup();
 const invited=await f.request('/api/team/invites','POST',{email:'editor@example.test'},owner),token=new URL(invited.data.url).searchParams.get('invite');const joined=await f.request('/api/auth/accept-invite','POST',{token,name:'Editor',password:owner.password});const editor={cookie:joined.response.headers.get('set-cookie').split(';')[0],csrf:joined.data.csrf};
 assert.equal((await f.request('/api/marketing/config','POST',{publicBase:'https://studio.example.test',enabled:true},editor)).response.status,403);assert.equal((await f.request('/api/marketing/webhook-key','POST',{},editor)).response.status,403);
 let r=await f.request('/api/marketing/campaigns','POST',{name:'=Campaign CSV',channel:'instagram',medium:'organic_social',variant:'hook-a',landingPath:'/'},owner);assert.equal(r.response.status,201);const campaign=r.data,site=(await f.request('/api/marketing','GET',null,owner)).data.status.siteId;
 const event={siteId:site,campaignId:campaign.id,eventId:'test-visit-123456',session:'browser-session-12345',type:'visit',test:true};
 assert.equal((await f.request('/tracking/collect','POST',event,null,{Origin:'https://evil.example'})).response.status,403);assert.equal((await f.request('/tracking/collect','POST',event)).response.status,200);
 assert.equal((await f.request('/api/marketing','GET',null,owner)).data.totals.visits,0);assert.equal((await f.request('/api/marketing?test=1','GET',null,owner)).data.totals.visits,1);
 r=await f.request('/api/marketing/export?test=1','GET',null,owner);assert.equal(r.response.status,200);assert.ok(r.data.includes('\r\n'));assert.ok(r.data.includes('"\'=Campaign CSV"'));assert.ok(r.data.includes('"test"'));
 f.store.insertPost({id:'I01',title:'Performance',caption:'Caption',format:'Gambar',mediaIds:[],status:'draft'});
 const published=new Date(Date.now()-72*3600000).toISOString(),observed=new Date(Date.now()-24*3600000).toISOString(),row={postid:'I01',channel:'tiktok',distribution:'organic',windowhours:48,publishedat:published,observedat:observed,reach:100,saves:5,shares:3};
 r=await f.request('/api/marketing/performance/import','POST',{rows:[row,{...row,postid:'NOPE'}]},owner);assert.equal(r.response.status,400);assert.equal(f.store.all('SELECT * FROM performance_samples').length,0);
 r=await f.request('/api/marketing/performance/import','POST',{rows:[row]},owner);assert.equal(r.response.status,200);assert.equal(r.data.imported,1);assert.equal(f.store.all('SELECT * FROM performance_samples')[0].source,'csv_import');
 assert.equal((await f.request('/tracking/webhook','POST',{campaignId:campaign.id,type:'demo_request',eventId:'backend-request-123'})).response.status,401);
 await f.request('/api/marketing/config','POST',{publicBase:'https://studio.example.test',enabled:true},owner);const key=(await f.request('/api/marketing/webhook-key','POST',{},owner)).data.key;
 r=await f.request('/tracking/webhook','POST',{campaignId:campaign.id,type:'demo_request',eventId:'backend-request-123'},null,{'x-vayora-event-key':key});assert.equal(r.response.status,200);assert.equal((await f.request('/api/marketing','GET',null,owner)).data.totals.demoRequests,1);
 }finally{await f.cleanup();}});

function publisherFixture(){const store=openStore(':memory-placeholder-'+randomBytes(8).toString('hex'));return store;}
async function publishingStore(){const directory=await mkdtemp(path.join(os.tmpdir(),'vayora-publisher-'));const store=openStore(directory);store.set('paused',false);store.set('publishingEnabled',true);store.setSecret('instagram.connection',{token:'private-token-fixture',accountId:'12345',username:'fixture',expiresAt:Date.now()+86400000,refreshedAt:Date.now()});store.insertPost({id:'I01',title:'Fixture',format:'Gambar',caption:'Fixture',mediaIds:['fixture-media'],approved:true,status:'scheduled',scheduleAt:new Date().toISOString()});return{store,async cleanup(){store.close();await safeRemove(directory);}};}
function metaTransport({ambiguous=false}={}){const tracker={publishes:0,published:false};return{tracker,fetch:async(url,init={})=>{const target=new URL(url),pathname=target.pathname;if(pathname.endsWith('content_publishing_limit'))return Response.json({data:[{quota_usage:0,config:{quota_total:100}}]});if(pathname.endsWith('/media_publish')){tracker.publishes++;if(ambiguous)throw new Error('Simulated dropped response');tracker.published=true;return Response.json({id:'published-1'});}if(pathname.endsWith('/media'))return Response.json({id:'container-1'});if(pathname.endsWith('/container-1'))return Response.json({status_code:tracker.published?'PUBLISHED':'FINISHED'});if(pathname.endsWith('/published-1'))return Response.json({permalink:'https://www.instagram.com/p/fixture/'});throw new Error('Unexpected test request');}};}
test('publishing records result and cannot publish an already-published post twice',async()=>{const f=await publishingStore();try{const transport=metaTransport();const ig=createInstagram(f.store,()=>({publicBase:'https://example.test',version:'v27.0'}),{fetch:transport.fetch,wait:async()=>{}});const item=await ig.run('I01',()=> 'https://example.test/media.jpg');assert.equal(item.status,'published');assert.equal(item.mediaId,'published-1');await assert.rejects(()=>ig.run('I01',()=>''),/tidak memenuhi/);assert.equal(transport.tracker.publishes,1);assert.ok(!JSON.stringify(ig.status()).includes('private-token-fixture'));}finally{await f.cleanup();}});
test('ambiguous publish response stays locked until Meta confirms the result',async()=>{const f=await publishingStore();try{const transport=metaTransport({ambiguous:true});const ig=createInstagram(f.store,()=>({publicBase:'https://example.test',version:'v27.0'}),{fetch:transport.fetch,wait:async()=>{}});let item=await ig.run('I01',()=> 'https://example.test/media.jpg');assert.equal(item.status,'uncertain');await assert.rejects(()=>ig.run('I01',()=>''));item=await ig.reconcile('I01');assert.equal(item.status,'uncertain');transport.tracker.published=true;item=await ig.reconcile('I01');assert.equal(item.status,'published');assert.equal(transport.tracker.publishes,1);}finally{await f.cleanup();}});
test('OAuth state is session-bound, single use and access token remains encrypted',async()=>{const f=await publishingStore();try{const transport=async url=>{const u=new URL(url);if(u.hostname==='api.instagram.com')return Response.json({access_token:'short-fixture-token',user_id:'12345'});if(u.pathname==='/access_token')return Response.json({access_token:'long-fixture-token',expires_in:5184000});if(u.pathname.endsWith('/me'))return Response.json({user_id:'12345',username:'fixture'});throw new Error('Unexpected request');};const ig=createInstagram(f.store,()=>({appId:'123456',appSecret:'secret-fixture',publicBase:'https://example.test',version:'v27.0'}),{fetch:transport});const url=new URL(ig.start('owner','session-one'));const state=url.searchParams.get('state');await assert.rejects(()=>ig.callback({state,code:'one'},'owner','wrong-session'),/sesi berbeda/);await ig.callback({state,code:'one'},'owner','session-one');await assert.rejects(()=>ig.callback({state,code:'one'},'owner','session-one'),/kedaluwarsa/);assert.ok(!f.store.get("SELECT value FROM settings WHERE key='instagram.connection'").value.includes('long-fixture-token'));assert.equal(ig.status().connected,true);}finally{await f.cleanup();}});
test('OAuth accepts the documented data-wrapped token response and traces Meta rejections without secrets',async()=>{
  const f=await publishingStore();
  try{
    const config=()=>({appId:'123456',appSecret:'secret-fixture',publicBase:'https://example.test',version:'v27.0'});
    let tokenRequest;
    const documented=async(url,init)=>{const u=new URL(url);
      if(u.hostname==='api.instagram.com'){tokenRequest=Object.fromEntries(init.body);return Response.json({data:[{access_token:'short-fixture-token',user_id:'17841400000000001',permissions:'instagram_business_basic,instagram_business_content_publish'}]});}
      if(u.pathname==='/access_token'){assert.equal(u.searchParams.get('access_token'),'short-fixture-token');return Response.json({access_token:'long-fixture-token',token_type:'bearer',expires_in:5183944});}
      if(u.pathname.endsWith('/me'))return Response.json({user_id:'17841400000000001',username:'vayora'});
      throw new Error('Unexpected request');};
    const ig=createInstagram(f.store,config,{fetch:documented});
    const state=new URL(ig.start('owner','session-one')).searchParams.get('state');
    const result=await ig.callback({state,code:'code-fixture#_'},'owner','session-one');
    assert.equal(result.connected,true);assert.equal(result.username,'vayora');assert.equal(result.accountId,'17841400000000001');
    assert.equal(tokenRequest.code,'code-fixture');assert.equal(tokenRequest.redirect_uri,'https://example.test/auth/instagram/callback');
    const rejecting=async url=>new URL(url).hostname==='api.instagram.com'?Response.json({error_type:'OAuthException',code:400,error_message:'Invalid redirect_uri https://evil.test/x token IGAAabcdefghijklmnopqrstuvwxyz0123456789'},{status:400}):Response.json({});
    const failing=createInstagram(f.store,config,{fetch:rejecting});
    const second=new URL(failing.start('owner','session-one')).searchParams.get('state');
    await assert.rejects(()=>failing.callback({state:second,code:'one'},'owner','session-one'),error=>{
      assert.equal(error.code,'META_REJECTED');assert.match(error.message,/kode 400/);assert.match(error.message,/Invalid redirect_uri/);
      assert.ok(!error.message.includes('evil.test')&&!error.message.includes('IGAAabcdef')&&!error.message.includes('secret-fixture'));return true;});
  }finally{await f.cleanup();}
});

async function safeRemove(directory){const target=path.resolve(directory),base=path.resolve(os.tmpdir());if(!target.startsWith(base+path.sep)||!/^vayora-(test|publisher)-/.test(path.basename(target)))throw Error('Unsafe test cleanup path');await rm(target,{recursive:true,force:true});}

test('Post now requires explicit approval and live setup, replaces only its own schedule and cannot publish twice',async()=>{
 let release;const gate=new Promise(resolve=>release=resolve),transport=metaTransport();
 const f=await fixture({instagram:{fetch:async(url,init)=>{if(new URL(url).pathname.endsWith('content_publishing_limit'))await gate;return transport.fetch(url,init);},wait:async()=>{}}});
 try{
  const owner=await f.setup(),mediaId='b'.repeat(64);f.store.run('INSERT INTO media(id,path,mime,name,size,width,height,created_at) VALUES(?,?,?,?,?,?,?,?)',mediaId,'fixture.jpg','image/jpeg','fixture.jpg',10,1080,1350,new Date().toISOString());
  const first=f.store.insertPost({id:'I01',format:'Gambar',title:'Publish now fixture',caption:'Caption reviewed',mediaIds:[mediaId],status:'scheduled',approved:false,scheduleAt:'2030-01-01T12:00:00Z'});
  f.store.insertPost({id:'I02',format:'Gambar',title:'Other schedule',caption:'Other caption',mediaIds:[mediaId],status:'scheduled',approved:true,scheduleAt:'2030-01-02T12:00:00Z'});
  const payload={revision:first.revision,approved:true,confirmation:'PUBLISH_NOW'};
  assert.equal((await f.request('/api/posts/I01/publish-now','POST',payload,owner)).response.status,422);assert.equal(f.store.post('I01').revision,first.revision);
  f.store.setSecret('instagram.config',{appId:'123456',appSecret:'fixture-secret',version:'v27.0',publicBase:'https://example.test'});f.store.setSecret('instagram.connection',{token:'fixture-token',accountId:'12345',username:'fixture',expiresAt:Date.now()+86400000,refreshedAt:Date.now()});f.store.set('publishingEnabled',true);f.store.set('paused',true);
  assert.equal((await f.request('/api/posts/I01/publish-now','POST',{...payload,approved:false},owner)).response.status,400);
  assert.equal((await f.request('/api/posts/I01/publish-now','POST',{...payload,revision:999},owner)).response.status,409);
  const response=await f.request('/api/posts/I01/publish-now','POST',payload,owner);assert.equal(response.response.status,202);assert.equal(response.data.status,'processing');assert.equal(f.store.setting('paused'),true);assert.equal(f.store.post('I02').scheduleAt,'2030-01-02T12:00:00Z');
  assert.equal((await f.request('/api/posts/I01/publish-now','POST',payload,owner)).response.status,409);
  release();for(let i=0;i<100&&f.store.post('I01').status==='processing';i++)await new Promise(resolve=>setTimeout(resolve,5));
  assert.equal(f.store.post('I01').status,'published');assert.equal(transport.tracker.publishes,1);assert.equal(f.store.post('I02').status,'scheduled');
  assert.equal((await f.request('/api/posts/I01/publish-now','POST',{...payload,revision:f.store.post('I01').revision},owner)).response.status,409);
 }finally{release();await f.cleanup();}
});
