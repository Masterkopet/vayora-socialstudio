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
test('publishing records result and cannot publish an already-published post twice',async()=>{const f=await publishingStore();try{const transport=metaTransport();const ig=createInstagram(f.store,()=>({publicBase:'https://example.test',version:'v27.0'}),{fetch:transport.fetch,wait:async()=>{}});const item=await ig.run('I01',()=> 'https://example.test/media.jpg');assert.equal(item.status,'published');assert.equal(item.mediaId,'published-1');await assert.rejects(()=>ig.run('I01',()=>''),/does not meet the requirements/);assert.equal(transport.tracker.publishes,1);assert.ok(!JSON.stringify(ig.status()).includes('private-token-fixture'));}finally{await f.cleanup();}});
test('ambiguous publish response stays locked until Meta confirms the result',async()=>{const f=await publishingStore();try{const transport=metaTransport({ambiguous:true});const ig=createInstagram(f.store,()=>({publicBase:'https://example.test',version:'v27.0'}),{fetch:transport.fetch,wait:async()=>{}});let item=await ig.run('I01',()=> 'https://example.test/media.jpg');assert.equal(item.status,'uncertain');await assert.rejects(()=>ig.run('I01',()=>''));item=await ig.reconcile('I01');assert.equal(item.status,'uncertain');transport.tracker.published=true;item=await ig.reconcile('I01');assert.equal(item.status,'published');assert.equal(transport.tracker.publishes,1);}finally{await f.cleanup();}});
test('OAuth state is session-bound, single use and access token remains encrypted',async()=>{const f=await publishingStore();try{const transport=async url=>{const u=new URL(url);if(u.hostname==='api.instagram.com')return Response.json({access_token:'short-fixture-token',user_id:'12345'});if(u.pathname==='/access_token')return Response.json({access_token:'long-fixture-token',expires_in:5184000});if(u.pathname.endsWith('/me'))return Response.json({user_id:'12345',username:'fixture'});throw new Error('Unexpected request');};const ig=createInstagram(f.store,()=>({appId:'123456',appSecret:'secret-fixture',publicBase:'https://example.test',version:'v27.0'}),{fetch:transport});const url=new URL(ig.start('owner','session-one'));const state=url.searchParams.get('state');await assert.rejects(()=>ig.callback({state,code:'one'},'owner','wrong-session'),/different session/);await ig.callback({state,code:'one'},'owner','session-one');await assert.rejects(()=>ig.callback({state,code:'one'},'owner','session-one'),/expired/);assert.ok(!f.store.get("SELECT value FROM settings WHERE key='instagram.connection'").value.includes('long-fixture-token'));assert.equal(ig.status().connected,true);}finally{await f.cleanup();}});
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
      assert.equal(error.code,'META_REJECTED');assert.match(error.message,/code 400/);assert.match(error.message,/Invalid redirect_uri/);
      assert.ok(!error.message.includes('evil.test')&&!error.message.includes('IGAAabcdef')&&!error.message.includes('secret-fixture'));return true;});
  }finally{await f.cleanup();}
});
// Dashboard "Generate token" flow: Meta answers /me for the token in the Authorization header and refreshes without a secret.
function tokenTransport(accounts,calls=[]){return async(url,init={})=>{const u=new URL(url);calls.push(u);
  if(u.pathname==='/refresh_access_token'){assert.equal(u.searchParams.get('grant_type'),'ig_refresh_token');assert.equal(u.searchParams.has('client_secret'),false);return Response.json({access_token:'IGAArefreshedtoken0000000000',token_type:'bearer',expires_in:5183944});}
  if(u.pathname.endsWith('/me')){const token=String(init.headers?.Authorization||'').replace(/^Bearer /,'');const account=accounts[token];return account?Response.json(account):Response.json({error:{message:'Invalid OAuth access token - Cannot parse access token',type:'OAuthException',code:190}},{status:400});}
  throw new Error('Unexpected request '+u.pathname);};}
test('pasted dashboard token connects without an app secret, refreshes without one, and a rejected paste keeps the saved connection',async()=>{
  const f=await publishingStore();
  try{
    const calls=[];const config=()=>({appId:'',appSecret:'',publicBase:'https://example.test',version:'v27.0'});
    const ig=createInstagram(f.store,config,{fetch:tokenTransport({IGAAgoodtoken1234567890abc:{user_id:'17841400000000002',username:'vayora'}},calls)});
    await assert.rejects(()=>ig.connectToken('',  'owner'),error=>error.code==='TOKEN_REQUIRED');
    await assert.rejects(()=>ig.connectToken('IGAA token with spaces 123456','owner'),error=>error.code==='TOKEN_FORMAT');
    assert.equal(calls.length,0,'format errors never reach Meta');
    await assert.rejects(()=>ig.connectToken('IGAArejectedtoken000000000','owner'),error=>error.code==='TOKEN_REJECTED'&&/Generate a new token/.test(error.message));
    assert.equal(ig.status().connected,true,'a rejected paste must not invalidate the working connection');assert.equal(ig.status().username,'fixture');
    const result=await ig.connectToken('  IGAAgoodtoken1234567890abc  ','owner');
    assert.equal(result.connected,true);assert.equal(result.configured,false);assert.equal(result.method,'token');assert.equal(result.expiresKnown,false);
    assert.equal(result.username,'vayora');assert.equal(result.accountId,'17841400000000002');
    assert.ok(!f.store.get("SELECT value FROM settings WHERE key='instagram.connection'").value.includes('IGAAgoodtoken'),'token is stored encrypted');
    await ig.refresh();assert.ok(!calls.some(u=>u.pathname==='/refresh_access_token'),'no refresh within the first 24 hours');
    f.store.setSecret('instagram.connection',{...f.store.secret('instagram.connection'),refreshedAt:Date.now()-25*3600000});
    await ig.refresh();
    const saved=f.store.secret('instagram.connection');
    assert.equal(saved.token,'IGAArefreshedtoken0000000000');assert.equal(saved.expiresKnown,true);
    assert.ok(Math.abs(saved.expiresAt-(Date.now()+5183944000))<60000,'real expiry learned from the refresh');
  }finally{await f.cleanup();}
});
test('token endpoint is owner-only, needs no Meta app config, and switching accounts turns publishing off',async()=>{
  const f=await fixture({instagram:{fetch:tokenTransport({IGAAfirstaccount0000000000:{user_id:'111',username:'first'},IGAAsecondaccount000000000:{user_id:'222',username:'second'}})}});
  try{
    const owner=await f.setup();
    assert.equal((await f.request('/api/instagram/token','POST',{token:'IGAAfirstaccount0000000000'})).response.status,401);
    const first=await f.request('/api/instagram/token','POST',{token:'IGAAfirstaccount0000000000'},owner);
    assert.equal(first.response.status,200);assert.equal(first.data.connected,true);assert.equal(first.data.configured,false);assert.equal(first.data.username,'first');
    const blocked=await f.request('/api/workspace/publishing','POST',{enabled:true,confirmation:'AKTIFKAN'},owner);
    assert.equal(blocked.response.status,400);assert.match(blocked.data.error,/public HTTPS/);
    f.store.set('publishingEnabled',true);f.store.set('paused',false);
    const same=await f.request('/api/instagram/token','POST',{token:'IGAAfirstaccount0000000000'},owner);
    assert.equal(same.response.status,200);assert.equal(f.store.setting('publishingEnabled',false),true,'renewing the same account keeps publishing on');
    const second=await f.request('/api/instagram/token','POST',{token:'IGAAsecondaccount000000000'},owner);
    assert.equal(second.data.username,'second');assert.equal(f.store.setting('publishingEnabled',true),false);assert.equal(f.store.setting('paused',false),true);
    assert.ok(f.store.get("SELECT id FROM events WHERE title='Instagram account changed'"));
    const wrong=await f.request('/api/instagram/token','POST',{token:'IGAArejectedtoken000000000'},owner);
    assert.equal(wrong.response.status,422);assert.match(wrong.data.error,/Meta rejected the token/);
    assert.equal((await f.request('/api/instagram/status','GET',null,owner)).data.username,'second');
    const invite=await f.request('/api/team/invites','POST',{email:'editor@example.test'},owner);const inviteToken=new URL(invite.data.url).searchParams.get('invite');
    const join=await f.request('/api/auth/accept-invite','POST',{token:inviteToken,name:'Editor Uji',password:'Editor-'+randomBytes(12).toString('hex')});
    const editor={cookie:join.response.headers.get('set-cookie').split(';')[0],csrf:join.data.csrf};
    assert.equal((await f.request('/api/instagram/token','POST',{token:'IGAAfirstaccount0000000000'},editor)).response.status,403);
  }finally{await f.cleanup();}
});
test('scheduler keeps a pasted token alive while the queue is paused',async()=>{
  const calls=[];const f=await fixture({instagram:{fetch:tokenTransport({},calls)}});
  try{
    f.store.set('paused',true);f.store.set('publishingEnabled',false);
    f.store.setSecret('instagram.connection',{token:'IGAApausedtoken0000000000',accountId:'333',username:'paused',method:'token',expiresKnown:false,expiresAt:Date.now()+30*86400000,refreshedAt:Date.now()-25*3600000,invalid:false});
    await f.tick();
    assert.ok(calls.some(u=>u.pathname==='/refresh_access_token'),'refresh runs although publishing is paused');
    assert.equal(f.store.secret('instagram.connection').token,'IGAArefreshedtoken0000000000');assert.equal(f.store.setting('paused',false),true);
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
// Unified login (Facebook) tokens start with EAA and live on graph.facebook.com. `me` is a User node (no username field),
// so the Instagram account comes from debug_token's granted assets, or from Pages / Business assets.
const FB_IG='17841400000000009';
function facebookTransport(mode,calls=[]){return async(url,init={})=>{const u=new URL(url);calls.push(u);
  const error=(code,message)=>Response.json({error:{message,type:'OAuthException',code}},{status:400});
  if(u.hostname!=='graph.facebook.com')throw new Error('Facebook token must not call '+u.hostname);
  const p=u.pathname,account=id=>id===FB_IG?{id,username:'vayora'}:id==='111'?{id,username:'one'}:id==='222'?{id,username:'two'}:null;
  if(p.endsWith('/debug_token')){if(mode==='expired')return error(190,'Error validating access token: Session has expired');
    const appToken=String(init.headers?.Authorization||'')==='Bearer 123456|app-secret-fixture';if(mode==='appdebug'&&!appToken)return error(100,'(#100) You must provide an app access token, or a user access token that is an owner or developer of the app');
    const ids=mode==='debug'||(mode==='appdebug'&&appToken)?[FB_IG]:mode==='many'?['111','222']:[];return Response.json({data:{is_valid:true,granular_scopes:[{scope:'instagram_basic',target_ids:ids},{scope:'ads_read'}]}});}
  if(p.endsWith('/me/accounts')){if(mode==='expired')return error(190,'Error validating access token: Session has expired');if(mode==='page')return Response.json({data:[{id:'p0'},{id:'p1',instagram_business_account:{id:FB_IG,username:'vayora'}}]});return error(10,'(#10) Application does not have permission for this action');}
  if(p.endsWith('/me/businesses')){if(mode==='expired')return error(190,'Error validating access token: Session has expired');return mode==='business'?Response.json({data:[{id:'b1'}]}):error(200,'(#200) Requires business_management permission');}
  if(p.endsWith('/b1/instagram_business_accounts'))return Response.json({data:[{id:FB_IG,username:'vayora'}]});
  if(p.endsWith('/me/permissions')){if(mode==='expired')return error(190,'Error validating access token: Session has expired');}
  if(p.endsWith('/me/permissions'))return Response.json({data:[{permission:'instagram_basic',status:'granted'},{permission:'instagram_content_publish',status:'granted'},{permission:'ads_read',status:'declined'}]});
  if(p.endsWith('/me')){if(mode==='expired')return error(190,'Error validating access token: Session has expired');if(u.searchParams.get('fields')!=='id,name')throw new Error('me is a User node: only id,name are valid');return Response.json({id:'999',name:'Owner Vayora'});}
  const match=p.match(/\/(\d+)$/);if(match&&u.searchParams.get('fields')==='id,username')return account(match[1])?Response.json(account(match[1])):error(100,'(#100) Tried accessing nonexisting field (username) on node type (User)');
  if(p.endsWith('/content_publishing_limit'))return Response.json({data:[{quota_usage:0,config:{quota_total:100}}]});
  if(p.endsWith('/media_publish'))return Response.json({id:'published-fb'});
  if(p.endsWith('/media'))return Response.json({id:'container-fb'});
  if(p.endsWith('/container-fb'))return Response.json({status_code:'FINISHED'});
  if(p.endsWith('/published-fb'))return Response.json({permalink:'https://www.instagram.com/p/fb/'});
  throw new Error('Unexpected request '+p);};}
test('Unified login token finds the Instagram account, never expires locally, and publishes on graph.facebook.com',async()=>{
  const f=await publishingStore();
  try{
    const config=()=>({appId:'',appSecret:'',publicBase:'https://example.test',version:'v27.0'});
    for(const mode of ['debug','page','business']){
      const calls=[];const ig=createInstagram(f.store,config,{fetch:facebookTransport(mode,calls),wait:async()=>{}});
      const result=await ig.connectToken('EAAfunifiedtoken0000000000','owner');
      assert.equal(result.connected,true,mode);assert.equal(result.api,'facebook');assert.equal(result.noExpiry,true);assert.equal(result.username,'vayora');assert.equal(result.accountId,FB_IG);assert.equal(result.configured,false);
      assert.ok(!f.store.get("SELECT value FROM settings WHERE key='instagram.connection'").value.includes('EAAfunified'),'token is stored encrypted');
      await ig.refresh();assert.ok(!calls.some(u=>u.pathname.includes('refresh_access_token')),'Facebook tokens are never refreshed');
      assert.equal((await ig.check()).username,'vayora');
    }
    const calls=[];const ig=createInstagram(f.store,config,{fetch:facebookTransport('debug',calls),wait:async()=>{}});
    await ig.connectToken('EAAfunifiedtoken0000000000','owner');
    f.store.insertPost({id:'F01',title:'Facebook path',format:'Gambar',caption:'F',mediaIds:['fixture-media'],approved:true,status:'scheduled',scheduleAt:new Date().toISOString()});
    const item=await ig.run('F01',()=>'https://example.test/public/media/fixture');
    assert.equal(item.status,'published');assert.equal(item.mediaId,'published-fb');
    assert.ok(calls.every(u=>u.hostname==='graph.facebook.com'),'every call uses the Facebook host');
    assert.ok(calls.some(u=>u.pathname.endsWith(`/${FB_IG}/media_publish`)));
  }finally{await f.cleanup();}
});
test('Unified login token errors are specific: expired, no account, several accounts',async()=>{
  const f=await publishingStore();
  try{
    const config=()=>({appId:'',appSecret:'',publicBase:'https://example.test',version:'v27.0'});
    const connect=mode=>createInstagram(f.store,config,{fetch:facebookTransport(mode)}).connectToken('EAAfunifiedtoken0000000000','owner');
    await assert.rejects(()=>connect('expired'),error=>error.code==='TOKEN_REJECTED');
    await assert.rejects(()=>connect('none'),error=>error.code==='PROFILE_INVALID'&&/not found/.test(error.message)&&/me\/accounts: rejected \(code 10\)/.test(error.message)&&/me\/businesses: rejected \(code 200\)/.test(error.message)&&/me=999/.test(error.message)&&/permissions=instagram_basic,instagram_content_publish/.test(error.message)&&/permissions=instagram_basic,instagram_content_publish( ·|$)/.test(error.message)&&/assets=instagram_basic:0/.test(error.message)&&/Enter the App ID and App Secret/.test(error.message));
    await assert.rejects(()=>connect('many'),error=>error.code==='ACCOUNT_AMBIGUOUS'&&/@one, @two/.test(error.message));
    assert.equal(createInstagram(f.store,config,{fetch:facebookTransport('debug')}).status().username,'fixture','failed pastes keep the saved connection');
  }finally{await f.cleanup();}
});
test('failed token connections are recorded in History without the token',async()=>{
  const f=await fixture({instagram:{fetch:facebookTransport('none')}});
  try{
    const owner=await f.setup();
    const bad=await f.request('/api/instagram/token','POST',{token:'EAAsecretfailedtoken000000'},owner);
    assert.equal(bad.response.status,422);assert.match(bad.data.error,/not found/);
    const event=f.store.get("SELECT detail FROM events WHERE title='Token connection did not succeed'");
    assert.ok(event);assert.match(event.detail,/me\/accounts/);assert.ok(!event.detail.includes('EAAsecretfailedtoken'));
    const format=await f.request('/api/instagram/token','POST',{token:'salah format'},owner);assert.equal(format.response.status,422);
    assert.equal(f.store.all("SELECT id FROM events WHERE title='Token connection did not succeed'").length,1,'format typos are not logged');
  }finally{await f.cleanup();}
});
test('an app token (App ID|Secret) lets debug_token reveal the granted Instagram account; without it the error says how',async()=>{
  const f=await publishingStore();
  try{
    const withApp=()=>({appId:'123456',appSecret:'app-secret-fixture',publicBase:'https://example.test',version:'v27.0'});
    const ig=createInstagram(f.store,withApp,{fetch:facebookTransport('appdebug')});
    const result=await ig.connectToken('EAAfunifiedtoken0000000000','owner');
    assert.equal(result.username,'vayora');assert.equal(result.accountId,FB_IG);
    assert.ok(!f.store.get("SELECT value FROM settings WHERE key='instagram.connection'").value.includes('app-secret-fixture'),'the app token is never stored with the connection');
    const withoutApp=()=>({appId:'',appSecret:'',publicBase:'https://example.test',version:'v27.0'});
    await assert.rejects(()=>createInstagram(f.store,withoutApp,{fetch:facebookTransport('appdebug')}).connectToken('EAAfunifiedtoken0000000000','owner'),
      error=>error.code==='PROFILE_INVALID'&&/Enter the App ID and App Secret/.test(error.message)&&/debug_token: rejected \(code 100\)/.test(error.message));
  }finally{await f.cleanup();}
});
test('a system-user token with no listed assets connects with the owner-given account id, verified against Meta',async()=>{
  const f=await publishingStore();
  try{
    const config=()=>({appId:'123456',appSecret:'app-secret-fixture',publicBase:'https://example.test',version:'v27.0'});
    const calls=[];const ig=createInstagram(f.store,config,{fetch:facebookTransport('none',calls)});
    await assert.rejects(()=>ig.connectToken('EAAfunifiedtoken0000000000','owner','12ab'),error=>error.code==='ACCOUNT_ID_FORMAT');
    assert.equal(calls.length,0,'a malformed id never reaches Meta');
    await assert.rejects(()=>ig.connectToken('EAAfunifiedtoken0000000000','owner','55555'),error=>error.code==='ACCOUNT_NOT_ACCESSIBLE'&&/code 100/.test(error.message)&&/system user/.test(error.message));
    assert.equal(ig.status().username,'fixture','a refused id keeps the saved connection');
    const result=await ig.connectToken('EAAfunifiedtoken0000000000','owner',` ${FB_IG} `);
    assert.equal(result.connected,true);assert.equal(result.username,'vayora');assert.equal(result.accountId,FB_IG);assert.equal(result.api,'facebook');
    assert.ok(!calls.some(u=>/debug_token|me\/accounts|me\/businesses/.test(u.pathname)),'a given id skips discovery');
  }finally{await f.cleanup();}
});
test('delete hides content everywhere, keeps its id reserved and history, and refuses unsafe deletes',async()=>{
  const f=await fixture();
  try{
    const owner=await f.setup(),mediaId='d'.repeat(64);
    f.store.run('INSERT INTO media(id,path,mime,name,size,width,height,created_at) VALUES(?,?,?,?,?,?,?,?)',mediaId,'fixture.jpg','image/jpeg','fixture.jpg',10,1080,1350,new Date().toISOString());
    const created=await f.request('/api/posts','POST',{id:'I01',format:'Gambar',title:'Akan dihapus',caption:'C',mediaIds:[mediaId]},owner);assert.equal(created.response.status,201);
    const item=created.data;
    assert.equal((await f.request('/api/posts/I01?revision='+(item.revision+5),'DELETE',null,owner)).response.status,409,'stale revision is refused');
    const done=await f.request('/api/posts/I01?revision='+(item.revision),'DELETE',null,owner);
    assert.equal(done.response.status,200);assert.equal(done.data.id,'I01');
    const workspace=await f.request('/api/workspace','GET',null,owner);
    assert.ok(!workspace.data.posts.some(p=>p.id==='I01'),'deleted content leaves the library');
    assert.equal((await f.request('/api/posts/I01?revision='+(item.revision+1),'DELETE',null,owner)).response.status,404,'deleted content is not found again');
    assert.equal(f.store.post('I01').status,'deleted','row is kept so the id stays reserved');
    assert.ok(f.store.get("SELECT id FROM events WHERE post_id='I01' AND title='Content deleted'"),'deletion is recorded in history');
    const copy=await f.request('/api/posts','POST',{id:'I02',format:'Gambar',title:'Sumber',caption:'C',mediaIds:[mediaId]},owner);
    const dup=await f.request('/api/posts/I02/duplicate','POST',{},owner);assert.notEqual(dup.data.id,'I01','a new copy never reuses a deleted id');
    for(const status of ['processing','uncertain']){
      f.store.savePost({...f.store.post('I02'),status});
      const blocked=await f.request('/api/posts/I02?revision='+(f.store.post('I02').revision),'DELETE',null,owner);
      assert.equal(blocked.response.status,409,status+' cannot be deleted');
    }
    f.store.savePost({...f.store.post('I02'),status:'published',mediaId:'ig-1'});
    const invite=await f.request('/api/team/invites','POST',{email:'editor-del@example.test'},owner);const inviteToken=new URL(invite.data.url).searchParams.get('invite');
    const join=await f.request('/api/auth/accept-invite','POST',{token:inviteToken,name:'Editor Hapus',password:'Editor-'+randomBytes(12).toString('hex')});
    const editor={cookie:join.response.headers.get('set-cookie').split(';')[0],csrf:join.data.csrf};
    assert.equal((await f.request('/api/posts/I02?revision='+(f.store.post('I02').revision),'DELETE',null,editor)).response.status,403,'only the owner removes published content');
    const removed=await f.request('/api/posts/I02?revision='+(f.store.post('I02').revision),'DELETE',null,owner);assert.equal(removed.response.status,200);
    assert.match(f.store.get("SELECT detail FROM events WHERE post_id='I02' AND title='Content deleted'").detail,/published post stays online/);
    assert.ok(copy.data);
  }finally{await f.cleanup();}
});
test('a scheduled item that is deleted is never published by the scheduler',async()=>{
  const f=await publishingStore();
  try{
    const item=f.store.post('I01');f.store.savePost({...item,status:'deleted',scheduleAt:null});
    assert.ok(!f.store.posts().some(p=>p.id==='I01'),'scheduler reads posts() which excludes deleted content');
  }finally{await f.cleanup();}
});
