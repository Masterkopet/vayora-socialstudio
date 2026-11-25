import { randomBytes } from 'node:crypto';
import { open as openFile } from 'node:fs/promises';
import { hash } from './store.mjs';
import { mediaPath } from './media.mjs';
import { publicHTTPS } from './instagram.mjs';

// TikTok publishing through the Content Posting API (Direct Post). Connection: TikTok Login Kit OAuth with the app's Client
// Key/Secret (scopes user.info.basic, video.publish, video.upload); access tokens last 24 hours and are renewed with the
// refresh token (365 days). Before each post the creator info is read again, as TikTok requires, for the allowed visibility
// options and the maximum video length. Videos are uploaded from Studio in chunks; photo posts are pulled by TikTok from
// Studio's signed public links, which needs the domain verified in the TikTok developer portal.
// Until TikTok audits the app, every post must be private (SELF_ONLY): TikTok rejects anything else.
const SCOPES = ['user.info.basic', 'video.publish', 'video.upload'];
const API = 'https://open.tiktokapis.com';
export const TIKTOK_PRIVACY = ['PUBLIC_TO_EVERYONE', 'MUTUAL_FOLLOW_FRIENDS', 'FOLLOWER_OF_CREATOR', 'SELF_ONLY'];
export const TIKTOK_CAPTION_MAX = 2200, TIKTOK_PHOTO_TITLE_MAX = 90, TIKTOK_PHOTOS_MAX = 35;
const MB = 1024 * 1024, CHUNK = 10 * MB, SINGLE_MAX = 64 * MB;
const fail = (message, code = 'TIKTOK_ERROR', status = 422) => Object.assign(new Error(message), { status, code });
const reasonText = value => typeof value === 'string' ? value.replace(/https?:\/\/\S+/g, '[url]').replace(/[A-Za-z0-9_.\-]{32,}/g, '[…]').replace(/\s+/g, ' ').trim().slice(0, 160) : '';
const MESSAGES = {
  access_token_invalid: 'TikTok permission expired or was revoked. Reconnect TikTok.',
  scope_not_authorized: 'TikTok did not grant posting permission. Reconnect TikTok and allow posting.',
  rate_limit_exceeded: 'TikTok asked to slow down. Try again in a minute.',
  spam_risk_too_many_posts: 'The TikTok account reached its daily posting limit. Reschedule for tomorrow.',
  spam_risk_user_banned_from_posting: 'TikTok does not allow this account to post right now.',
  unaudited_client_can_only_post_to_private_accounts: 'TikTok has not audited this app yet, so it can only post privately. Set TikTok visibility to "Only me" in Settings (and keep the account private) until the audit is approved.',
  privacy_level_option_mismatch: 'The chosen TikTok visibility is not available for this account. Choose another one in Settings → TikTok.',
  url_ownership_unverified: 'TikTok photo posts need the Studio domain verified in the TikTok developer portal (URL properties).',
};

// Chunk plan TikTok accepts: up to 64 MB in one piece; larger files in 10 MB chunks, the remainder joins the last chunk.
export function chunkPlan(size) {
  if (size <= SINGLE_MAX) return { chunkSize: size, count: 1 };
  return { chunkSize: CHUNK, count: Math.floor(size / CHUNK) };
}

export function createTikTok(store, getPublicBase, options = {}) {
  const transport = options.fetch || fetch;
  const wait = options.wait || (ms => new Promise(resolve => setTimeout(resolve, ms)));
  const connection = () => store.secret('tiktok.connection');
  function config() {
    const saved = store.secret('tiktok.config', {});
    return { clientKey: process.env.TIKTOK_CLIENT_KEY || saved.clientKey || '', clientSecret: process.env.TIKTOK_CLIENT_SECRET || saved.clientSecret || '', privacy: TIKTOK_PRIVACY.includes(saved.privacy) ? saved.privacy : '', brandOrganic: saved.brandOrganic !== false };
  }
  const redirectUri = () => `${String(getPublicBase() || '').replace(/\/$/, '')}/auth/tiktok/callback`;

  function status() {
    const c = config(), link = connection();
    return {
      configured: !!(c.clientKey && c.clientSecret), clientKey: c.clientKey, callbackUrl: getPublicBase() ? redirectUri() : null, publicUrlReady: publicHTTPS(getPublicBase()),
      connected: !!link?.refreshToken && !link.invalid && (link.refreshExpiresAt || Infinity) > Date.now(),
      displayName: link?.displayName || null, username: link?.username || null, privacyOptions: link?.privacyOptions || [], maxDuration: link?.maxDuration || null,
      privacy: c.privacy, brandOrganic: c.brandOrganic, error: link?.invalid ? 'TikTok permission needs to be reconnected.' : null,
    };
  }

  // TikTok answers {data, error:{code,message,log_id}} (code "ok" on success); the token endpoint uses {error, error_description}.
  async function request(url, init = {}) {
    let response; try { response = await transport(url, { ...init, signal: AbortSignal.timeout(init.timeout || 30000) }); } catch { throw fail('The connection to TikTok did not complete. Check the result before trying again.', 'TIKTOK_NETWORK'); }
    let body; try { body = await response.json(); } catch { throw fail('The TikTok response could not be read.', 'TIKTOK_RESPONSE'); }
    const code = typeof body.error === 'object' ? body.error.code : body.error;
    if (!response.ok || (code && code !== 'ok')) {
      if (['access_token_invalid', 'invalid_grant'].includes(code)) { const link = connection(); if (link) store.setSecret('tiktok.connection', { ...link, invalid: true, accessToken: null }); }
      const detail = reasonText(typeof body.error === 'object' ? body.error.message : body.error_description);
      throw fail(MESSAGES[code] || `TikTok rejected the request${code ? ' [' + reasonText(code) + ']' : ''}${detail ? ': ' + detail : ''}.`, code === 'access_token_invalid' || code === 'invalid_grant' ? 'TIKTOK_AUTH' : 'TIKTOK_' + String(code || 'REJECTED').toUpperCase().replace(/[^A-Z_]/g, '').slice(0, 40));
    }
    return body;
  }
  const form = values => ({ method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams(values) });
  async function api(path, payload, token) {
    const init = payload === undefined ? { method: 'GET', headers: { Authorization: `Bearer ${token}` } } : { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json; charset=UTF-8' }, body: JSON.stringify(payload) };
    return (await request(API + path, init)).data || {};
  }

  function saveConfig({ clientKey, clientSecret, privacy, brandOrganic }) {
    const previous = store.secret('tiktok.config', {});
    const key = clientKey === undefined ? previous.clientKey || '' : String(clientKey || '').trim();
    const secret = String(clientSecret || previous.clientSecret || '').trim();
    if (key && !/^[A-Za-z0-9]{8,64}$/.test(key)) throw fail('Invalid Client Key. Copy it from the TikTok developer portal (App details).', 'TIKTOK_CONFIG', 400);
    if (secret && (secret.length > 200 || /\s/.test(secret))) throw fail('Invalid Client Secret.', 'TIKTOK_CONFIG', 400);
    if (privacy !== undefined && privacy !== '' && !TIKTOK_PRIVACY.includes(privacy)) throw fail('Invalid TikTok visibility.', 'TIKTOK_CONFIG', 400);
    const next = { clientKey: key, clientSecret: secret, privacy: privacy === undefined ? previous.privacy || '' : privacy, brandOrganic: brandOrganic === undefined ? previous.brandOrganic !== false : !!brandOrganic };
    // A different app makes the old connection useless.
    if (previous.clientKey && previous.clientKey !== key) store.run("DELETE FROM settings WHERE key='tiktok.connection'");
    store.setSecret('tiktok.config', next);
    return status();
  }

  function start(userId, sessionHash) {
    const c = config();
    if (!c.clientKey || !c.clientSecret) throw fail('Enter the TikTok Client Key and Client Secret first.', 'TIKTOK_NOT_CONFIGURED');
    if (!/^https:\/\//.test(String(getPublicBase() || ''))) throw fail('The TikTok connection needs a public HTTPS address.', 'PUBLIC_URL_REQUIRED');
    const state = randomBytes(32).toString('hex');
    store.run('DELETE FROM oauth_states WHERE expires<?', Date.now());
    store.run('INSERT INTO oauth_states(hash,user_id,session_hash,expires) VALUES(?,?,?,?)', hash('tt:' + state), userId, sessionHash, Date.now() + 600000);
    const url = new URL('https://www.tiktok.com/v2/auth/authorize/');
    Object.entries({ client_key: c.clientKey, scope: SCOPES.join(','), response_type: 'code', redirect_uri: redirectUri(), state }).forEach(([k, v]) => url.searchParams.set(k, v));
    return url.href;
  }

  async function readCreator(token) {
    const info = await api('/v2/post/publish/creator_info/query/', {}, token);
    return { username: info.creator_username || null, displayName: info.creator_nickname || null, privacyOptions: (info.privacy_level_options || []).filter(x => TIKTOK_PRIVACY.includes(x)), maxDuration: Number(info.max_video_post_duration_sec) || null, commentDisabled: !!info.comment_disabled, duetDisabled: !!info.duet_disabled, stitchDisabled: !!info.stitch_disabled };
  }

  async function callback({ state, code, error }, userId, sessionHash) {
    if (typeof state !== 'string' || !/^[a-f0-9]{64}$/.test(state)) throw fail('Invalid connection request. Start again from Settings.', 'INVALID_STATE');
    const row = store.get('SELECT * FROM oauth_states WHERE hash=?', hash('tt:' + state));
    if (!row || row.user_id !== userId || row.session_hash !== sessionHash || row.expires < Date.now()) throw fail('The connection request expired or came from a different session.', 'INVALID_STATE');
    store.run('DELETE FROM oauth_states WHERE hash=?', hash('tt:' + state));
    if (error) throw fail(error === 'access_denied' ? 'TikTok connection cancelled.' : 'TikTok refused the connection.', 'OAUTH_CANCELLED');
    if (!code || String(code).length > 2048) throw fail('Invalid TikTok connection code.', 'INVALID_CODE');
    const c = config();
    const grant = await request(API + '/v2/oauth/token/', form({ client_key: c.clientKey, client_secret: c.clientSecret, code: String(code), grant_type: 'authorization_code', redirect_uri: redirectUri() }));
    if (typeof grant.access_token !== 'string' || !grant.access_token || !grant.refresh_token) throw fail('TikTok did not grant access permission.', 'INVALID_TOKEN');
    const granted = String(grant.scope || '').split(',');
    if (!granted.includes('video.publish')) throw fail('TikTok did not grant posting permission. Connect again and allow posting.', 'SCOPE_MISSING');
    const creator = await readCreator(grant.access_token);
    let displayName = creator.displayName;
    if (!displayName) { try { displayName = (await api('/v2/user/info/?fields=open_id,display_name', undefined, grant.access_token)).user?.display_name || null; } catch { /* optional */ } }
    store.setSecret('tiktok.connection', { accessToken: grant.access_token, expiresAt: Date.now() + Number(grant.expires_in || 86400) * 1000, refreshToken: grant.refresh_token, refreshExpiresAt: Date.now() + Number(grant.refresh_expires_in || 31536000) * 1000, openId: grant.open_id || null, displayName: displayName || 'TikTok account', username: creator.username, privacyOptions: creator.privacyOptions, maxDuration: creator.maxDuration, invalid: false, connectedAt: Date.now() });
    store.event(null, 'TikTok connected', `Account ${creator.username ? '@' + creator.username : displayName || ''} connected.`.replace(/\s+\./, '.'), 'connection', userId);
    return status();
  }

  async function accessToken() {
    const link = connection();
    if (!link?.refreshToken || link.invalid) throw fail('TikTok is not connected.', 'NOT_CONNECTED');
    if (link.accessToken && link.expiresAt - Date.now() > 300000) return link.accessToken;
    const c = config();
    const grant = await request(API + '/v2/oauth/token/', form({ client_key: c.clientKey, client_secret: c.clientSecret, grant_type: 'refresh_token', refresh_token: link.refreshToken }));
    if (typeof grant.access_token !== 'string' || !grant.access_token) throw fail('TikTok did not renew the access permission.', 'INVALID_TOKEN');
    store.setSecret('tiktok.connection', { ...connection(), accessToken: grant.access_token, expiresAt: Date.now() + Number(grant.expires_in || 86400) * 1000, ...(grant.refresh_token ? { refreshToken: grant.refresh_token, refreshExpiresAt: Date.now() + Number(grant.refresh_expires_in || 31536000) * 1000 } : {}) });
    return grant.access_token;
  }

  async function check() {
    const creator = await readCreator(await accessToken());
    store.setSecret('tiktok.connection', { ...connection(), username: creator.username || connection().username, displayName: creator.displayName || connection().displayName, privacyOptions: creator.privacyOptions, maxDuration: creator.maxDuration });
    return status();
  }
  function disconnect() { store.run("DELETE FROM settings WHERE key='tiktok.connection'"); }

  function ensureLive(manual) {
    if ((!manual && store.setting('paused', true)) || !store.setting('publishingEnabled', false)) throw fail('Publishing is paused or not enabled.', 'PAUSED');
    if (!status().connected) throw fail('TikTok is not connected or permission has expired.', 'NOT_CONNECTED');
  }

  async function uploadVideo(uploadUrl, file, size, plan) {
    const handle = await openFile(file, 'r');
    try {
      for (let i = 0; i < plan.count; i++) {
        const start = i * plan.chunkSize, end = i === plan.count - 1 ? size - 1 : start + plan.chunkSize - 1, length = end - start + 1;
        const bytes = Buffer.alloc(length); await handle.read(bytes, 0, length, start);
        let response; try { response = await transport(uploadUrl, { method: 'PUT', headers: { 'Content-Type': 'video/mp4', 'Content-Length': String(length), 'Content-Range': `bytes ${start}-${end}/${size}` }, body: bytes, signal: AbortSignal.timeout(300000) }); }
        // A lost answer to the last chunk may still mean TikTok has the whole video and is posting it.
        catch { if (i === plan.count - 1) throw fail('The connection broke while the last part of the video was sent. TikTok may still post it; check the result before trying again.', 'TIKTOK_NETWORK'); throw fail('The video upload to TikTok was interrupted. Nothing was posted; try again.', 'TIKTOK_UPLOAD'); }
        if (![200, 201, 206].includes(response.status)) throw fail(`TikTok did not accept the video upload (HTTP ${response.status}). Nothing was posted.`, 'TIKTOK_UPLOAD');
      }
    } finally { await handle.close(); }
  }

  const finished = (item, data) => {
    const postId = (data.publicaly_available_post_id || data.publicly_available_post_id || [])[0];
    const link = connection();
    item.status = 'published'; item.publishedAt = item.publishedAt || new Date().toISOString(); item.error = ''; item.errorCode = '';
    item.mediaId = String(postId || item.job.publishId);
    item.permalink = postId && link?.username ? `https://www.tiktok.com/@${link.username}/video/${postId}` : null;
    return item;
  };

  // Reads the post status a few times. Finished → published; failed → failed (TikTok never posted it); still processing →
  // uncertain, checked again later by the scheduler or with "Check result".
  async function follow(id, attempts = 8) {
    let item = store.post(id);
    for (let i = 0; i < attempts; i++) {
      const data = await api('/v2/post/publish/status/fetch/', { publish_id: item.job.publishId }, await accessToken());
      if (data.status === 'PUBLISH_COMPLETE') { item = store.savePost(finished(item, data)); store.event(id, 'Published successfully', item.title + ' · TikTok', 'published'); return item; }
      if (data.status === 'SEND_TO_USER_INBOX') { item = store.savePost(finished(item, data)); store.event(id, 'Sent to TikTok', 'TikTok put the post in the account inbox to finish in the app.', 'published'); return item; }
      if (data.status === 'FAILED') { item.status = 'failed'; item.error = `TikTok could not publish the post${data.fail_reason ? ' (' + reasonText(data.fail_reason) + ')' : ''}. Nothing went live; set a new schedule.`; item.errorCode = 'TIKTOK_FAILED'; item.job = { ...item.job, publishRequested: null, failedPublishId: item.job.publishId, publishId: null }; item = store.savePost(item); store.event(id, 'Publishing held', item.error, 'failed'); return item; }
      if (i < attempts - 1) await wait(options.pollMs ?? 15000);
    }
    item.status = 'uncertain'; item.error = 'TikTok is still processing the post. It is checked again automatically; do not post it again.'; item.errorCode = 'TIKTOK_PROCESSING'; item.job.checkedAt = new Date().toISOString(); return store.savePost(item);
  }

  async function run(id, signMedia, { manual = false } = {}) {
    ensureLive(manual); let item = store.post(id);
    if (!item || item.status !== 'scheduled' || !item.approved || item.mediaId || item.job?.publishRequested) throw fail('This post does not meet the requirements for publishing.', 'NOT_ELIGIBLE');
    item.status = 'processing'; item.error = ''; item.job = item.job || {}; item = store.savePost(item);
    const save = () => { item = store.savePost(item); };
    try {
      const token = await accessToken(), creator = await readCreator(token), cfg = config();
      store.setSecret('tiktok.connection', { ...connection(), username: creator.username || connection().username, privacyOptions: creator.privacyOptions, maxDuration: creator.maxDuration });
      if (!cfg.privacy) throw fail('Choose who can see TikTok posts in Settings → TikTok first.', 'TIKTOK_PRIVACY');
      if (!creator.privacyOptions.includes(cfg.privacy)) throw fail(MESSAGES.privacy_level_option_mismatch, 'TIKTOK_PRIVACY');
      const disclose = { brand_content_toggle: false, brand_organic_toggle: cfg.brandOrganic };
      if (item.format === 'Reel') {
        const media = store.get('SELECT * FROM media WHERE id=?', item.mediaIds[0]);
        if (creator.maxDuration && Number(media.duration) > creator.maxDuration) throw fail(`This TikTok account accepts videos up to ${creator.maxDuration} seconds.`, 'TIKTOK_DURATION');
        const size = Number(media.size), plan = chunkPlan(size);
        const info = { title: item.caption, privacy_level: cfg.privacy, disable_comment: creator.commentDisabled, disable_duet: creator.duetDisabled, disable_stitch: creator.stitchDisabled, is_aigc: !!item.syntheticMedia, ...disclose };
        if (item.coverTime != null) info.video_cover_timestamp_ms = Math.round(item.coverTime * 1000);
        const init = await api('/v2/post/publish/video/init/', { post_info: info, source_info: { source: 'FILE_UPLOAD', video_size: size, chunk_size: plan.chunkSize, total_chunk_count: plan.count } }, token);
        if (!init.publish_id || !init.upload_url) throw fail('TikTok did not open an upload.', 'TIKTOK_UPLOAD');
        item.job.publishId = init.publish_id; save();
        // TikTok publishes once the last byte arrives; from here an interrupted response must never lead to a second post.
        ensureLive(manual); item.job.publishRequested = new Date().toISOString(); save();
        await uploadVideo(init.upload_url, mediaPath(store, media), size, plan);
      } else {
        if (!publicHTTPS(getPublicBase())) throw fail('The public HTTPS address is not ready.', 'PUBLIC_URL_REQUIRED');
        const images = item.mediaIds.slice(0, 35).map(mediaId => signMedia(mediaId));
        ensureLive(manual); item.job.publishRequested = new Date().toISOString(); save();
        const init = await api('/v2/post/publish/content/init/', { post_info: { title: String(item.title || '').slice(0, TIKTOK_PHOTO_TITLE_MAX), description: item.caption, privacy_level: cfg.privacy, disable_comment: creator.commentDisabled, auto_add_music: true, ...disclose }, source_info: { source: 'PULL_FROM_URL', photo_cover_index: 0, photo_images: images }, post_mode: 'DIRECT_POST', media_type: 'PHOTO' }, token);
        if (!init.publish_id) throw fail('The publishing result cannot be confirmed yet.', 'MISSING_PUBLISH_ID');
        item.job.publishId = init.publish_id; save();
      }
      return await follow(id);
    } catch (error) {
      item = store.post(id);
      // A rejected init (TikTok's own error answer) means nothing was posted, even after the publish flag was set.
      const rejected = /^TIKTOK_(?!NETWORK|RESPONSE|UPLOAD)/.test(error.code || '') && !item.job?.publishId;
      const posted = item.job?.publishRequested && !rejected && error.code !== 'TIKTOK_UPLOAD';
      item.status = posted ? 'uncertain' : error.code === 'PAUSED' ? 'scheduled' : 'failed';
      if (!posted && item.job) item.job = { ...item.job, publishRequested: null };
      item.error = error.message; item.errorCode = error.code || 'PUBLISH_FAILED'; item = store.savePost(item);
      store.event(id, item.status === 'uncertain' ? 'Result needs checking' : 'Publishing held', error.message, 'failed'); return item;
    }
  }

  async function reconcile(id) {
    let item = store.post(id); if (!item) throw fail('Post not found.', 'NOT_FOUND', 404);
    if (item.status === 'published') return item;
    if (!item.job?.publishId) { item.status = 'failed'; item.error = 'TikTok has no record of this post. Check it and set a new schedule.'; return store.savePost(item); }
    return follow(id, 1);
  }
  // Scheduler follow-up: posts TikTok was still processing are checked again every few minutes.
  async function followUp() {
    for (const item of store.posts().filter(p => p.platform === 'tiktok' && p.status === 'uncertain' && p.errorCode === 'TIKTOK_PROCESSING' && p.job?.publishId)) {
      if (Date.now() - Date.parse(item.job.checkedAt || 0) < 180000) continue;
      try { const result = await follow(item.id, 1); if (result.status === 'uncertain') { result.job.checkedAt = new Date().toISOString(); store.savePost(result); } } catch { /* try again on a later tick */ }
    }
  }

  return { status, saveConfig, start, callback, check, disconnect, run, reconcile, followUp, ownsState: state => typeof state === 'string' && /^[a-f0-9]{64}$/.test(state) && !!store.get('SELECT hash FROM oauth_states WHERE hash=?', hash('tt:' + state)) };
}
