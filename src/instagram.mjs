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
    return { configured: !!(config.appId && config.appSecret), publicUrlReady: publicHTTPS(config.publicBase), callbackUrl: config.publicBase ? `${config.publicBase.replace(/\/$/,'')}/auth/instagram/callback` : null, appId: config.appId || '', version: config.version, publicBase: config.publicBase || '', connected: !!c?.token && c.expiresAt > Date.now() && !c.invalid, username: c?.username || null, accountId: c?.accountId || null, expiresAt: c?.expiresAt || null, error: c?.invalid ? 'Izin Instagram perlu disambungkan kembali.' : null };
  }
  async function request(url, init = {}) {
    let response; try { response = await transport(url,{...init,signal:AbortSignal.timeout(25000)}); } catch { throw fail('Koneksi ke Meta tidak selesai. Status hasil perlu diperiksa sebelum mencoba lagi.','META_NETWORK'); }
    let body; try { body = await response.json(); } catch { throw fail('Respons Meta tidak dapat dibaca.','META_RESPONSE'); }
    if (!response.ok || body.error) {
      // Graph errors are {error:{message,code}}; the OAuth token endpoint uses {error_type,code,error_message}.
      const raw = typeof body.error === 'object' ? body.error : { message: body.error_message || 'Permintaan Meta ditolak.', code: body.code };
      if (Number(raw.code) === 190) { const c = connection(); if(c) store.setSecret('instagram.connection',{...c,invalid:true}); }
      // Never include request URLs, secrets, access tokens, or raw response bodies; only Meta's sanitized error text.
      const reason=metaReason(raw.error_user_msg||raw.message);
      throw fail(Number(raw.code)===190?'Izin Instagram kedaluwarsa. Sambungkan kembali akun.':`Meta menolak permintaan${raw.code?' (kode '+raw.code+')':''}${reason?': '+reason:''}. Periksa izin dan spesifikasi media.`,Number(raw.code)===190?'META_AUTH':'META_REJECTED');
    }
    return body;
  }
  async function graph(path, params = {}, method = 'GET', token = connection()?.token) {
    if(!token) throw fail('Instagram belum terhubung.','NOT_CONNECTED');
    const url = new URL(`https://graph.instagram.com/${version()}/${path}`);
    const init = { method, headers: { Authorization:`Bearer ${token}` } };
    if(method==='GET') Object.entries(params).forEach(([k,v])=>url.searchParams.set(k,String(v)));
    else {init.headers['Content-Type']='application/x-www-form-urlencoded';init.body=new URLSearchParams(Object.entries(params).map(([k,v])=>[k,String(v)]));}
    return request(url,init);
  }
  function start(userId, sessionHash) {
    const config=getConfig();if(!config.appId||!config.appSecret)throw fail('Isi App ID dan App Secret dari Meta Developer terlebih dahulu.','META_NOT_CONFIGURED');
    if(!publicHTTPS(config.publicBase))throw fail('Koneksi Instagram memerlukan alamat HTTPS publik. Login tim lokal tetap dapat digunakan.','PUBLIC_URL_REQUIRED');
    const state=randomBytes(32).toString('hex');store.run('DELETE FROM oauth_states WHERE expires<?',Date.now());store.run('INSERT INTO oauth_states(hash,user_id,session_hash,expires) VALUES(?,?,?,?)',hash(state),userId,sessionHash,Date.now()+600000);
    const url=new URL('https://www.instagram.com/oauth/authorize');Object.entries({client_id:config.appId,redirect_uri:`${config.publicBase.replace(/\/$/,'')}/auth/instagram/callback`,response_type:'code',scope:'instagram_business_basic,instagram_business_content_publish',state,enable_fb_login:'0',force_authentication:'1'}).forEach(([k,v])=>url.searchParams.set(k,v));return url.href;
  }
  async function callback({state,code,error},userId,sessionHash) {
    if(typeof state!=='string'||!/^[a-f0-9]{64}$/.test(state))throw fail('Permintaan koneksi tidak valid. Mulai kembali dari Pengaturan.','INVALID_STATE');
    const row=store.get('SELECT * FROM oauth_states WHERE hash=?',hash(state));
    if(!row||row.user_id!==userId||row.session_hash!==sessionHash||row.expires<Date.now())throw fail('Permintaan koneksi sudah kedaluwarsa atau berasal dari sesi berbeda.','INVALID_STATE');
    store.run('DELETE FROM oauth_states WHERE hash=?',hash(state));
    if(error)throw fail('Koneksi Instagram dibatalkan.','OAUTH_CANCELLED');if(!code||code.length>2048)throw fail('Kode koneksi Instagram tidak valid.','INVALID_CODE');
    const config=getConfig();const redirect=`${config.publicBase.replace(/\/$/,'')}/auth/instagram/callback`;
    const short=await request('https://api.instagram.com/oauth/access_token',{method:'POST',body:new URLSearchParams({client_id:config.appId,client_secret:config.appSecret,grant_type:'authorization_code',redirect_uri:redirect,code:code.replace(/#_$/,'')})});
    // Meta documents this response as {data:[{access_token,user_id,permissions}]}; some apps still receive it flat.
    const grant=Array.isArray(short.data)?short.data[0]||{}:short;
    if(typeof grant.access_token!=='string'||!grant.access_token)throw fail('Meta tidak mengembalikan izin akses.','INVALID_TOKEN');
    const exchange=new URL('https://graph.instagram.com/access_token');Object.entries({grant_type:'ig_exchange_token',client_secret:config.appSecret,access_token:grant.access_token}).forEach(([k,v])=>exchange.searchParams.set(k,v));const long=await request(exchange);
    if(typeof long.access_token!=='string'||!long.access_token||!Number.isFinite(Number(long.expires_in))||Number(long.expires_in)<=0)throw fail('Meta tidak memberikan token jangka panjang yang valid. Mulai koneksi kembali.','INVALID_TOKEN');
    const profile=await graph('me',{fields:'user_id,username,account_type'},'GET',long.access_token);
    const id=String(profile.user_id||profile.id||grant.user_id||'');if(!/^\d+$/.test(id)||!profile.username)throw fail('Akun profesional Instagram tidak ditemukan.','PROFILE_INVALID');
    store.setSecret('instagram.connection',{token:long.access_token,accountId:id,username:profile.username,expiresAt:Date.now()+Number(long.expires_in||5184000)*1000,refreshedAt:Date.now(),invalid:false});
    store.event(null,'Instagram terhubung',`Akun @${profile.username} dihubungkan.`,'connection',userId);return status();
  }
  async function check() {const c=connection();if(!c)throw fail('Instagram belum terhubung.','NOT_CONNECTED');const profile=await graph('me',{fields:'user_id,username'});if(profile.username!==c.username)store.setSecret('instagram.connection',{...c,username:profile.username});return status();}
  async function refresh() {const c=connection();if(!c||c.invalid||c.expiresAt-Date.now()>7*86400000||Date.now()-c.refreshedAt<86400000)return;const url=new URL('https://graph.instagram.com/refresh_access_token');url.searchParams.set('grant_type','ig_refresh_token');url.searchParams.set('access_token',c.token);const result=await request(url);if(connection()?.token===c.token)store.setSecret('instagram.connection',{...c,token:result.access_token,expiresAt:Date.now()+result.expires_in*1000,refreshedAt:Date.now()});}
  async function ready(containerId) {
    for(let i=0;i<5;i++) {const result=await graph(containerId,{fields:'status_code'});if(result.status_code==='FINISHED')return;if(result.status_code==='PUBLISHED')throw fail('Container ini sudah terbit. Periksa hasil publikasi.','ALREADY_PUBLISHED');if(['ERROR','EXPIRED'].includes(result.status_code))throw fail('Media tidak dapat diproses Meta. Periksa media atau jadwalkan ulang.','CONTAINER_FAILED');await wait(options.pollMs??60000);}
    throw fail('Pemrosesan media melebihi waktu pemeriksaan. Belum ada permintaan publikasi dikirim.','PROCESSING_TIMEOUT');
  }
  function ensureLive(manual=false) {if((!manual&&store.setting('paused',true))||!store.setting('publishingEnabled',false))throw fail('Publikasi sedang dijeda atau belum diaktifkan.','PAUSED');if(!status().connected)throw fail('Instagram belum terhubung atau izin kedaluwarsa.','NOT_CONNECTED');if(!status().publicUrlReady)throw fail('Alamat HTTPS publik belum siap.','PUBLIC_URL_REQUIRED');}
  async function run(id, signMedia, {manual=false}={}) {
    ensureLive(manual);let item=store.post(id);if(!item||item.status!=='scheduled'||!item.approved||item.mediaId||item.job?.publishRequested)throw fail('Konten ini tidak memenuhi syarat untuk dipublikasikan.','NOT_ELIGIBLE');
    item.status='processing';item.error='';item.job=item.job||{};item=store.savePost(item);let publishSent=false;
    try {
      const c=connection();const limits=await graph(`${c.accountId}/content_publishing_limit`,{fields:'config,quota_usage'});const quota=limits.data?.[0];if(quota?.config?.quota_total&&quota.quota_usage>=quota.config.quota_total)throw fail('Batas publikasi akun sedang tercapai. Jadwalkan kembali.','RATE_LIMIT');
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
      if(!published.id)throw fail('Hasil publikasi belum dapat dipastikan.','MISSING_MEDIA_ID');
      item.mediaId=String(published.id);item.status='published';item.publishedAt=new Date().toISOString();item.error='';item=store.savePost(item);
      try {const link=await graph(item.mediaId,{fields:'permalink'});if(link.permalink?.startsWith('https://www.instagram.com/')){item.permalink=link.permalink;item=store.savePost(item);}}catch{}
      store.event(id,'Publikasi berhasil',item.title,'published');return item;
    } catch(error) {
      item=store.post(id);item.status=publishSent||item.job?.publishRequested?'uncertain':error.code==='PAUSED'?'scheduled':'failed';item.error=error.message;item.errorCode=error.code||'PUBLISH_FAILED';item=store.savePost(item);store.event(id,item.status==='uncertain'?'Hasil perlu diperiksa':'Publikasi tertahan',error.message,'failed');return item;
    }
  }
  async function reconcile(id) {let item=store.post(id);if(!item)throw fail('Konten tidak ditemukan.');if(item.status==='published')return item;if(!item.job?.containerId)throw fail('Belum ada container publikasi yang perlu diperiksa.','NO_CONTAINER');const result=await graph(item.job.containerId,{fields:'status_code'});if(result.status_code==='PUBLISHED'){item.status='published';item.publishedAt=item.publishedAt||new Date().toISOString();item.error='';item=store.savePost(item);store.event(id,'Publikasi dikonfirmasi','Meta mengonfirmasi container telah terbit. Percobaan ulang diblokir.','published');}else if(item.job.publishRequested){item.status='uncertain';item.error=`Status Meta: ${result.status_code}. Permintaan publikasi pernah dikirim; jangan mencoba ulang sebelum hasil dipastikan.`;item=store.savePost(item);}else{item.status='failed';item.error='Media belum terbit. Periksa konten dan tentukan jadwal baru.';item=store.savePost(item);}return item;}
  return {status,start,callback,check,refresh,run,reconcile,graph};
}
