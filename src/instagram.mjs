import { randomBytes } from 'node:crypto';
import { hash } from './store.mjs';

export function publicHTTPS(value) {
  try { const url = new URL(value); const host = url.hostname.toLowerCase(); return url.protocol === 'https:' && url.pathname==='/' && !url.search && !url.hash && !url.username && !url.password && !['localhost','127.0.0.1','[::1]','0.0.0.0'].includes(host) && !/^(10\.|192\.168\.|169\.254\.|172\.(1[6-9]|2\d|3[01])\.)/.test(host) && !host.endsWith('.local'); } catch { return false; }
}
const fail = (message, code='META_ERROR') => Object.assign(new Error(message), { status: 422, code });
// Meta's own short error text (e.g. "Invalid redirect_uri") is the only way to trace a rejected
// connection. Keep it, but strip URLs and long token-like strings and cap the length.
export const metaReason = value => typeof value === 'string' ? value.replace(/https?:\/\/\S+/g,'[url]').replace(/[A-Za-z0-9_|.\-]{32,}/g,'[…]').replace(/\s+/g,' ').trim().slice(0,160) : '';
export function createInstagram(store, getConfig, options = {}) {
  const transport = options.fetch || fetch;
  const wait = options.wait || (ms => new Promise(resolve => setTimeout(resolve,ms)));
  const version = () => getConfig().version || 'v27.0';
  const connection = () => store.secret('instagram.connection');
  function status() {
    const config = getConfig(), c = connection();
    return { configured: !!(config.appId && config.appSecret), publicUrlReady: publicHTTPS(config.publicBase), callbackUrl: config.publicBase ? `${config.publicBase.replace(/\/$/,'')}/auth/instagram/callback` : null, appId: config.appId || '', version: config.version, publicBase: config.publicBase || '', connected: !!c?.token && (c.noExpiry || c.expiresAt > Date.now()) && !c.invalid, method: c ? (c.method || 'oauth') : null, api: c ? (c.api || 'instagram') : null, noExpiry: !!c?.noExpiry, expiresKnown: c ? c.expiresKnown !== false : null, username: c?.username || null, accountId: c?.accountId || null, expiresAt: c?.expiresAt || null, error: c?.invalid ? 'Instagram permission needs to be reconnected.' : null };
  }
  // `token` names the token a request used: only a rejection of the stored token marks the saved connection invalid,
  // so a wrong pasted token or a failed reconnect never breaks a working connection.
  async function request(url, init = {}, { token } = {}) {
    let response; try { response = await transport(url,{...init,signal:AbortSignal.timeout(25000)}); } catch { throw fail('The connection to Meta did not complete. Check the result status before trying again.','META_NETWORK'); }
    let body; try { body = await response.json(); } catch { throw fail('The Meta response could not be read.','META_RESPONSE'); }
    if (!response.ok || body.error) {
      // Graph errors are {error:{message,code}}; the OAuth token endpoint uses {error_type,code,error_message}.
      const raw = typeof body.error === 'object' ? body.error : { message: body.error_message || 'Permintaan Meta ditolak.', code: body.code };
      if (Number(raw.code) === 190) { const c = connection(); if(c && token && c.token === token) store.setSecret('instagram.connection',{...c,invalid:true}); }
      // Never include request URLs, secrets, access tokens, or raw response bodies; only Meta's sanitized error text.
      const reason=metaReason(raw.error_user_msg||raw.message);
      throw fail(Number(raw.code)===190?'Instagram permission expired. Reconnect the account.':`Meta rejected the request${raw.code?' (code '+raw.code+')':''}${reason?': '+reason:''}. Check the permissions and media specifications.`,Number(raw.code)===190?'META_AUTH':'META_REJECTED');
    }
    return body;
  }
  // Tokens from "API setup with Unified login" (EAA…) belong to graph.facebook.com; Instagram-login tokens (IGAA…) to graph.instagram.com.
  // Both hosts expose the same publishing endpoints, so only the host differs.
  const graphHost = api => api === 'facebook' ? 'graph.facebook.com' : 'graph.instagram.com';
  async function graph(path, params = {}, method = 'GET', token = connection()?.token, api = connection()?.api) {
    if(!token) throw fail('Instagram is not connected.','NOT_CONNECTED');
    const url = new URL(`https://${graphHost(api)}/${version()}/${path}`);
    const init = { method, headers: { Authorization:`Bearer ${token}` } };
    if(method==='GET') Object.entries(params).forEach(([k,v])=>url.searchParams.set(k,String(v)));
    else {init.headers['Content-Type']='application/x-www-form-urlencoded';init.body=new URLSearchParams(Object.entries(params).map(([k,v])=>[k,String(v)]));}
    return request(url,init,{token});
  }
  // Quick connection: the owner pastes the long-lived token from Meta's App Dashboard
  // (Instagram > API setup with Instagram login > Generate token). No App ID, secret or redirect URI is needed.
  async function connectToken(rawToken, userId, rawAccountId) {
    const token=typeof rawToken==='string'?rawToken.trim():'';
    if(!token)throw fail('Paste the access token from Meta first.','TOKEN_REQUIRED');
    if(token.length<20||token.length>2048||!/^[A-Za-z0-9_.|-]+$/.test(token))throw fail('Token format not recognized. Copy the whole token again from Generate token in Meta.','TOKEN_FORMAT');
    // Optional: a system-user token with no assigned assets cannot reveal its Instagram account, so the owner may give its id.
    const manualId=rawAccountId==null?'':String(rawAccountId).trim();
    if(manualId&&!/^\d{5,25}$/.test(manualId))throw fail('The Instagram account ID must be a number (5–25 digits).','ACCOUNT_ID_FORMAT');
    const now=Date.now();
    if(/^EAA/.test(token)){
      // Unified login (Facebook) token: find the Instagram professional account it can publish to. Meta gives no expiry date
      // without the app secret, so the token is trusted until Meta rejects it (then the owner is asked to reconnect).
      const account=await findFacebookAccount(token,manualId);
      store.setSecret('instagram.connection',{token,accountId:account.id,username:account.username,method:'token',api:'facebook',noExpiry:true,expiresKnown:false,expiresAt:null,refreshedAt:now,invalid:false});
    } else {
    let profile;
    try{profile=await graph('me',{fields:'user_id,username,account_type'},'GET',token,'instagram');}
    catch(error){if(error.code==='META_AUTH')throw fail('Meta rejected the token as invalid or expired. Generate a new token and paste it again.','TOKEN_REJECTED');throw error;}
    const id=String(profile.user_id||profile.id||'');if(!/^\d+$/.test(id)||!profile.username)throw fail('No Instagram professional account was found for this token.','PROFILE_INVALID');
    // Dashboard tokens last 60 days from generation; the exact expiry is learned on the first refresh (allowed after 24 hours).
    store.setSecret('instagram.connection',{token,accountId:id,username:profile.username,method:'token',api:'instagram',expiresKnown:false,expiresAt:now+60*86400000,refreshedAt:now,invalid:false});
    }
    store.event(null,'Instagram connected',`Account @${connection().username} connected with a token.`,'connection',userId);
    return status();
  }
  // Facebook-graph discovery. Meta's Unified login does not document which node a generated token answers on, so each probe
  // is tried in turn and Meta's sanitized reason is reported when none works: (a) the token is bound to the Instagram account
  // itself, (b) the account is reached through a Facebook Page the token can see.
  async function findFacebookAccount(token, manualId='') {
    if(manualId){
      // Use the owner's id only if this token can actually read that Instagram account on graph.facebook.com.
      let ig;try{ig=await graph(manualId,{fields:'id,username'},'GET',token,'facebook');}
      catch(error){if(error.code==='META_AUTH')throw fail('Meta rejected the token as invalid or expired. Generate a new token and paste it again.','TOKEN_REJECTED');throw fail(`Instagram account ID ${manualId} cannot be accessed with this token. ${String(error.message).replace(/\. Check the permissions and media specifications\.$/,'.')} Make sure the account is assigned to the app system user in Business settings.`,'ACCOUNT_NOT_ACCESSIBLE');}
      if(String(ig.id||'')!==manualId||!ig.username)throw fail(`ID ${manualId} is not an Instagram professional account that this token can access.`,'ACCOUNT_NOT_ACCESSIBLE');
      return {id:manualId,username:ig.username};
    }
    // A Facebook user/system-user token is not an Instagram node, so `me` cannot answer. Meta lists the assets a Unified login
    // token was granted in debug_token's granular_scopes (target_ids), but only for an app access token (App ID|App Secret) or
    // a token owned by an app developer; Pages and Business assets are tried as fallbacks. Each probe's sanitized Meta reason
    // is kept so a failure explains itself.
    const config=getConfig(),appToken=config.appId&&config.appSecret?`${config.appId}|${config.appSecret}`:null;
    const reasons=[],notes=[],found=[],candidates=new Set();let rejected=false,answered=0;
    const add=(id,username)=>{id=String(id||'');if(/^\d+$/.test(id)&&username&&!found.some(x=>x.id===id))found.push({id,username});};
    const attempt=async(label,run)=>{try{await run();answered++;}catch(error){if(error.code==='META_AUTH')rejected=true;reasons.push(`${label}: ${String(error.message).replace(/^Meta rejected the request/,'rejected').replace(/\. Check the permissions and media specifications\.$/,'')}`);}};
    // debug_token fields are ids, types and scope names only (no secrets), so they are safe to show for diagnosis.
    const scan=info=>{const data=info.data||{};notes.push(`token=${String(data.type||'?')}`);for(const key of ['user_id','profile_id'])if(data[key]){notes.push(`${key}=${String(data[key])}`);candidates.add(String(data[key]));}
      const grants=(data.granular_scopes||[]).map(grant=>`${grant.scope}:${(grant.target_ids||[]).length}`);notes.push(`assets=${grants.join(',')||'-'}`);
      for(const grant of data.granular_scopes||[])if(/^instagram_/.test(grant.scope))for(const id of grant.target_ids||[])candidates.add(String(id));};
    await attempt(appToken?'debug_token (app token)':'debug_token',async()=>scan(await graph('debug_token',{input_token:token},'GET',appToken||token,'facebook')));
    await attempt('me',async()=>{const me=await graph('me',{fields:'id,name'},'GET',token,'facebook');if(/^\d+$/.test(String(me.id||'')))candidates.add(String(me.id));notes.push(`me=${String(me.id||'?')}`);});
    await attempt('me/accounts',async()=>{const pages=await graph('me/accounts',{fields:'instagram_business_account{id,username}',limit:'100'},'GET',token,'facebook');notes.push(`Page=${(pages.data||[]).length}`);for(const page of pages.data||[])add(page.instagram_business_account?.id,page.instagram_business_account?.username);});
    await attempt('me/businesses',async()=>{const businesses=await graph('me/businesses',{fields:'id',limit:'10'},'GET',token,'facebook');for(const business of businesses.data||[]){const owned=await graph(`${business.id}/instagram_business_accounts`,{fields:'id,username',limit:'25'},'GET',token,'facebook');for(const ig of owned.data||[])add(ig.id,ig.username);}});
    await attempt('me/permissions',async()=>{const list=await graph('me/permissions',{},'GET',token,'facebook');notes.push('permissions='+(list.data||[]).filter(x=>x.status==='granted').map(x=>x.permission).join(','));});
    for(const id of candidates){if(found.some(x=>x.id===id))continue;try{const ig=await graph(id,{fields:'id,username'},'GET',token,'facebook');add(ig.id,ig.username);}catch{}}
    if(found.length===1)return found[0];
    if(found.length>1)throw fail(`This token can access ${found.length} Instagram accounts (${found.map(x=>'@'+x.username).join(', ')}). Create a token for the Vayora account only.`,'ACCOUNT_AMBIGUOUS');
    if(rejected&&!answered)throw fail('Meta rejected the token as invalid or expired. Generate a new token and paste it again.','TOKEN_REJECTED');
    const hint=(appToken?'':' Enter the App ID and App Secret under "Advanced method" (App settings → Basic in the Meta dashboard) so Studio can read the assets the token allows.')+' If the token does not list assets, also fill in the Instagram account ID field.';
    throw fail(`Instagram account not found for this token.${hint} Details:${[...notes,...reasons].join(' · ').slice(0,800)}`,'PROFILE_INVALID');
  }
  function start(userId, sessionHash) {
    const config=getConfig();if(!config.appId||!config.appSecret)throw fail('Enter the App ID and App Secret from Meta Developer first.','META_NOT_CONFIGURED');
    if(!publicHTTPS(config.publicBase))throw fail('Instagram connection requires a public HTTPS address. Local team login still works.','PUBLIC_URL_REQUIRED');
    const state=randomBytes(32).toString('hex');store.run('DELETE FROM oauth_states WHERE expires<?',Date.now());store.run('INSERT INTO oauth_states(hash,user_id,session_hash,expires) VALUES(?,?,?,?)',hash(state),userId,sessionHash,Date.now()+600000);
    const url=new URL('https://www.instagram.com/oauth/authorize');Object.entries({client_id:config.appId,redirect_uri:`${config.publicBase.replace(/\/$/,'')}/auth/instagram/callback`,response_type:'code',scope:'instagram_business_basic,instagram_business_content_publish',state,enable_fb_login:'0',force_authentication:'1'}).forEach(([k,v])=>url.searchParams.set(k,v));return url.href;
  }
  async function callback({state,code,error},userId,sessionHash) {
    if(typeof state!=='string'||!/^[a-f0-9]{64}$/.test(state))throw fail('Invalid connection request. Start again from Settings.','INVALID_STATE');
    const row=store.get('SELECT * FROM oauth_states WHERE hash=?',hash(state));
    if(!row||row.user_id!==userId||row.session_hash!==sessionHash||row.expires<Date.now())throw fail('The connection request expired or came from a different session.','INVALID_STATE');
    store.run('DELETE FROM oauth_states WHERE hash=?',hash(state));
    if(error)throw fail('Instagram connection cancelled.','OAUTH_CANCELLED');if(!code||code.length>2048)throw fail('Invalid Instagram connection code.','INVALID_CODE');
    const config=getConfig();const redirect=`${config.publicBase.replace(/\/$/,'')}/auth/instagram/callback`;
    const short=await request('https://api.instagram.com/oauth/access_token',{method:'POST',body:new URLSearchParams({client_id:config.appId,client_secret:config.appSecret,grant_type:'authorization_code',redirect_uri:redirect,code:code.replace(/#_$/,'')})});
    // Meta documents this response as {data:[{access_token,user_id,permissions}]}; some apps still receive it flat.
    const grant=Array.isArray(short.data)?short.data[0]||{}:short;
    if(typeof grant.access_token!=='string'||!grant.access_token)throw fail('Meta did not return an access permission.','INVALID_TOKEN');
    const exchange=new URL('https://graph.instagram.com/access_token');Object.entries({grant_type:'ig_exchange_token',client_secret:config.appSecret,access_token:grant.access_token}).forEach(([k,v])=>exchange.searchParams.set(k,v));const long=await request(exchange);
    if(typeof long.access_token!=='string'||!long.access_token||!Number.isFinite(Number(long.expires_in))||Number(long.expires_in)<=0)throw fail('Meta did not provide a valid long-lived token. Start the connection again.','INVALID_TOKEN');
    const profile=await graph('me',{fields:'user_id,username,account_type'},'GET',long.access_token);
    const id=String(profile.user_id||profile.id||grant.user_id||'');if(!/^\d+$/.test(id)||!profile.username)throw fail('Instagram professional account not found.','PROFILE_INVALID');
    store.setSecret('instagram.connection',{token:long.access_token,accountId:id,username:profile.username,method:'oauth',expiresKnown:true,expiresAt:Date.now()+Number(long.expires_in||5184000)*1000,refreshedAt:Date.now(),invalid:false});
    store.event(null,'Instagram connected',`Account @${profile.username} connected.`,'connection',userId);return status();
  }
  async function check() {const c=connection();if(!c)throw fail('Instagram is not connected.','NOT_CONNECTED');const profile=c.api==='facebook'?await graph(c.accountId,{fields:'id,username'}):await graph('me',{fields:'user_id,username'});if(profile.username&&profile.username!==c.username)store.setSecret('instagram.connection',{...c,username:profile.username});return status();}
  // Refresh needs no app secret. Pasted tokens have an unknown generation time, so they are refreshed once after
  // 24 hours to learn the real expiry; afterwards every connection refreshes in its last 7 days.
  let lastRefreshAttempt=0;
  async function refresh() {const c=connection();if(!c||c.invalid||c.noExpiry||c.api==='facebook'||Date.now()-c.refreshedAt<86400000)return;const unknownExpiry=c.expiresKnown===false;if(!unknownExpiry&&c.expiresAt-Date.now()>7*86400000)return;if(Date.now()-lastRefreshAttempt<3600000)return;lastRefreshAttempt=Date.now();const url=new URL('https://graph.instagram.com/refresh_access_token');url.searchParams.set('grant_type','ig_refresh_token');url.searchParams.set('access_token',c.token);const result=await request(url,{},{token:c.token});if(typeof result.access_token!=='string'||!result.access_token||!(Number(result.expires_in)>0))throw fail('Meta did not extend the token. Reconnect if it is close to expiring.','REFRESH_INVALID');if(connection()?.token===c.token)store.setSecret('instagram.connection',{...c,token:result.access_token,expiresAt:Date.now()+Number(result.expires_in)*1000,expiresKnown:true,refreshedAt:Date.now()});}
  async function ready(containerId) {
    for(let i=0;i<5;i++) {const result=await graph(containerId,{fields:'status_code'});if(result.status_code==='FINISHED')return;if(result.status_code==='PUBLISHED')throw fail('This container has already been published. Check the publishing result.','ALREADY_PUBLISHED');if(['ERROR','EXPIRED'].includes(result.status_code))throw fail('Meta could not process the media. Check the media or reschedule.','CONTAINER_FAILED');await wait(options.pollMs??60000);}
    throw fail('Media processing exceeded the check time. No publish request has been sent yet.','PROCESSING_TIMEOUT');
  }
  function ensureLive(manual=false) {if((!manual&&store.setting('paused',true))||!store.setting('publishingEnabled',false))throw fail('Publishing is paused or not enabled.','PAUSED');if(!status().connected)throw fail('Instagram is not connected or permission has expired.','NOT_CONNECTED');if(!status().publicUrlReady)throw fail('The public HTTPS address is not ready.','PUBLIC_URL_REQUIRED');}
  async function run(id, signMedia, {manual=false}={}) {
    ensureLive(manual);let item=store.post(id);if(!item||item.status!=='scheduled'||!item.approved||item.mediaId||item.job?.publishRequested)throw fail('This post does not meet the requirements for publishing.','NOT_ELIGIBLE');
    item.status='processing';item.error='';item.job=item.job||{};item=store.savePost(item);let publishSent=false;
    try {
      const c=connection();const limits=await graph(`${c.accountId}/content_publishing_limit`,{fields:'config,quota_usage'});const quota=limits.data?.[0];if(quota?.config?.quota_total&&quota.quota_usage>=quota.config.quota_total)throw fail('The account publishing limit has been reached. Reschedule.','RATE_LIMIT');
      const create=async params=>(await graph(`${c.accountId}/media`,params,'POST')).id;
      const saveJob=()=>{item=store.savePost(item);};
      if(!item.job.containerId){
        if(item.format==='Carousel') {const children=[];for(const mediaId of item.mediaIds){const child=await create({image_url:signMedia(mediaId),is_carousel_item:true,alt_text:item.alt||''});await ready(child);children.push(child);}item.job.containerId=await create({media_type:'CAROUSEL',children:children.join(','),caption:item.caption});}
        else if(item.format==='Reel') {const params={media_type:'REELS',video_url:signMedia(item.mediaIds[0]),caption:item.caption,share_to_feed:true};if(item.coverId)params.cover_url=signMedia(item.coverId);else if(item.coverTime!=null)params.thumb_offset=Math.round(item.coverTime*1000);item.job.containerId=await create(params);}
        else item.job.containerId=await create({image_url:signMedia(item.mediaIds[0]),caption:item.caption,alt_text:item.alt||''});
        item.job.createdAt=new Date().toISOString();saveJob();
      }
      await ready(item.job.containerId);ensureLive(manual);
      // Persist before the network call. An interrupted response must never cause an automatic second publish.
      item.job.publishRequested=new Date().toISOString();saveJob();publishSent=true;
      const published=await graph(`${c.accountId}/media_publish`,{creation_id:item.job.containerId},'POST');
      if(!published.id)throw fail('The publishing result cannot be confirmed yet.','MISSING_MEDIA_ID');
      item.mediaId=String(published.id);item.status='published';item.publishedAt=new Date().toISOString();item.error='';item=store.savePost(item);
      try {const link=await graph(item.mediaId,{fields:'permalink'});if(link.permalink?.startsWith('https://www.instagram.com/')){item.permalink=link.permalink;item=store.savePost(item);}}catch{}
      store.event(id,'Published successfully',item.title,'published');return item;
    } catch(error) {
      item=store.post(id);item.status=publishSent||item.job?.publishRequested?'uncertain':error.code==='PAUSED'?'scheduled':'failed';item.error=error.message;item.errorCode=error.code||'PUBLISH_FAILED';item=store.savePost(item);store.event(id,item.status==='uncertain'?'Result needs checking':'Publikasi tertahan',error.message,'failed');return item;
    }
  }
  async function reconcile(id) {let item=store.post(id);if(!item)throw fail('Post not found.');if(item.status==='published')return item;if(!item.job?.containerId)throw fail('There is no publishing container to check yet.','NO_CONTAINER');const result=await graph(item.job.containerId,{fields:'status_code'});if(result.status_code==='PUBLISHED'){item.status='published';item.publishedAt=item.publishedAt||new Date().toISOString();item.error='';item=store.savePost(item);store.event(id,'Publication confirmed','Meta confirmed the container has been published. Retrying is blocked.','published');}else if(item.job.publishRequested){item.status='uncertain';item.error=`Meta status: ${result.status_code}. A publish request was sent before; do not retry until the result is confirmed.`;item=store.savePost(item);}else{item.status='failed';item.error='The media has not been published. Check the post and set a new schedule.';item=store.savePost(item);}return item;}
  return {status,start,callback,connectToken,check,refresh,run,reconcile,graph};
}
