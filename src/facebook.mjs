import { publicHTTPS, metaReason } from './instagram.mjs';

// Facebook Page publishing through the Graph API (graph.facebook.com). The API can only post to a Page, never to a personal
// profile. Connection: the owner pastes a Page access token, or a user/system-user token that can manage the Page (Studio then
// keeps the Page's own token). Needed permissions: pages_manage_posts, pages_read_engagement (and pages_show_list for a user
// token). Photos are fetched by Meta from Studio's signed public media links; videos are published as Reels.
export const FACEBOOK_REEL_MIN = 3, FACEBOOK_REEL_MAX = 90;
const fail = (message, code = 'FACEBOOK_ERROR', status = 422) => Object.assign(new Error(message), { status, code });

export function createFacebook(store, getConfig, options = {}) {
  const transport = options.fetch || fetch;
  const version = () => getConfig().version || 'v27.0';
  const connection = () => store.secret('facebook.connection');

  function status() {
    const c = connection();
    return { connected: !!c?.token && !c.invalid, pageId: c?.pageId || null, pageName: c?.pageName || null, publicUrlReady: publicHTTPS(getConfig().publicBase), error: c?.invalid ? 'Facebook Page permission needs to be reconnected.' : null };
  }

  async function request(url, init = {}, { token } = {}) {
    let response; try { response = await transport(url, { ...init, signal: AbortSignal.timeout(init.timeout || 30000) }); } catch { throw fail('The connection to Facebook did not complete. Check the result before trying again.', 'FACEBOOK_NETWORK'); }
    let body; try { body = await response.json(); } catch { throw fail('The Facebook response could not be read.', 'FACEBOOK_RESPONSE'); }
    if (!response.ok || body.error) {
      const raw = typeof body.error === 'object' ? body.error : { message: String(body.error || ''), code: response.status };
      if (Number(raw.code) === 190) { const c = connection(); if (c && token && c.token === token) store.setSecret('facebook.connection', { ...c, invalid: true }); }
      const reason = metaReason(raw.error_user_msg || raw.message);
      throw fail(Number(raw.code) === 190 ? 'Facebook Page permission expired. Reconnect the Page.' : `Facebook rejected the request${raw.code ? ' (code ' + raw.code + ')' : ''}${reason ? ': ' + reason : ''}.`, Number(raw.code) === 190 ? 'FACEBOOK_AUTH' : 'FACEBOOK_REJECTED');
    }
    return body;
  }
  async function graph(path, params = {}, method = 'GET', token = connection()?.token) {
    if (!token) throw fail('Facebook is not connected.', 'NOT_CONNECTED');
    const url = new URL(`https://graph.facebook.com/${version()}/${path}`);
    const init = { method, headers: { Authorization: `Bearer ${token}` } };
    if (method === 'GET') Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, String(v)));
    else { init.headers['Content-Type'] = 'application/x-www-form-urlencoded'; init.body = new URLSearchParams(Object.entries(params).map(([k, v]) => [k, String(v)])); }
    return request(url, init, { token });
  }

  // A Page token answers `me` as the Page; a user token lists its Pages (each with its own Page token) under me/accounts.
  async function connectToken(rawToken, userId, rawPageId) {
    const token = typeof rawToken === 'string' ? rawToken.trim() : '';
    if (!token) throw fail('Paste the access token from Meta first.', 'TOKEN_REQUIRED', 400);
    if (token.length < 20 || token.length > 2048 || !/^[A-Za-z0-9_.|-]+$/.test(token)) throw fail('Token format not recognized. Copy the whole token again.', 'TOKEN_FORMAT', 400);
    const pageId = rawPageId == null ? '' : String(rawPageId).trim();
    if (pageId && !/^\d{5,25}$/.test(pageId)) throw fail('The Page ID must be a number (5–25 digits).', 'PAGE_ID_FORMAT', 400);
    let pages = null;
    try { pages = (await graph('me/accounts', { fields: 'id,name,access_token,tasks', limit: '100' }, 'GET', token)).data || []; }
    catch (error) { if (error.code === 'FACEBOOK_AUTH') throw fail('Meta rejected the token as invalid or expired. Generate a new token and paste it again.', 'TOKEN_REJECTED', 400); }
    let page;
    if (pages && pages.length) {
      const candidates = pageId ? pages.filter(p => String(p.id) === pageId) : pages;
      if (!candidates.length) throw fail(`Page ${pageId} is not among the Pages this token can manage.`, 'PAGE_NOT_ACCESSIBLE', 400);
      if (candidates.length > 1) throw fail(`This token can manage ${candidates.length} Pages (${candidates.map(p => p.name).join(', ')}). Enter the Page ID of the Vayora Page.`, 'PAGE_AMBIGUOUS', 400);
      const p = candidates[0];
      if (Array.isArray(p.tasks) && !p.tasks.some(t => ['CREATE_CONTENT', 'MANAGE'].includes(t))) throw fail(`The account cannot create content on ${p.name}. Ask a Page admin for content access.`, 'PAGE_NO_TASK', 400);
      page = { id: String(p.id), name: p.name, token: p.access_token || token };
    } else {
      // No Pages listed: the token is a Page token itself.
      let me; try { me = await graph('me', { fields: 'id,name' }, 'GET', token); } catch (error) { if (error.code === 'FACEBOOK_AUTH') throw fail('Meta rejected the token as invalid or expired. Generate a new token and paste it again.', 'TOKEN_REJECTED', 400); throw error; }
      if (!/^\d+$/.test(String(me.id || ''))) throw fail('No Facebook Page was found for this token.', 'PAGE_NOT_FOUND', 400);
      if (pageId && String(me.id) !== pageId) throw fail(`This token belongs to ${me.name || me.id}, not Page ${pageId}.`, 'PAGE_NOT_ACCESSIBLE', 400);
      page = { id: String(me.id), name: me.name || String(me.id), token };
    }
    // Make sure the token is really a Page token for that Page (a user token without the Page's token cannot post).
    const check = await graph(page.id, { fields: 'id,name' }, 'GET', page.token);
    if (String(check.id) !== page.id) throw fail('The Page could not be read with this token.', 'PAGE_NOT_ACCESSIBLE', 400);
    store.setSecret('facebook.connection', { token: page.token, pageId: page.id, pageName: check.name || page.name, invalid: false, connectedAt: Date.now() });
    store.event(null, 'Facebook connected', `Page ${check.name || page.name} connected.`, 'connection', userId);
    return status();
  }
  async function check() { const c = connection(); if (!c) throw fail('Facebook is not connected.', 'NOT_CONNECTED'); const page = await graph(c.pageId, { fields: 'id,name' }); if (page.name && page.name !== c.pageName) store.setSecret('facebook.connection', { ...c, pageName: page.name }); return status(); }
  function disconnect() { store.run("DELETE FROM settings WHERE key='facebook.connection'"); }

  function ensureLive(manual = false) {
    if ((!manual && store.setting('paused', true)) || !store.setting('publishingEnabled', false)) throw fail('Publishing is paused or not enabled.', 'PAUSED');
    if (!status().connected) throw fail('Facebook is not connected or permission has expired.', 'NOT_CONNECTED');
    if (!status().publicUrlReady) throw fail('The public HTTPS address is not ready.', 'PUBLIC_URL_REQUIRED');
  }

  // Reels: start an upload session, let Meta fetch the video from the signed link, then publish with the description.
  async function publishReel(item, signMedia, save) {
    const c = connection();
    if (!item.job.videoId) { const start = await graph(`${c.pageId}/video_reels`, { upload_phase: 'start' }, 'POST'); if (!start.video_id) throw fail('Facebook did not open an upload session.', 'FACEBOOK_UPLOAD'); item.job.videoId = String(start.video_id); save(); }
    if (!item.job.uploaded) {
      const url = `https://rupload.facebook.com/video-upload/${version()}/${item.job.videoId}`;
      const body = await request(url, { method: 'POST', headers: { Authorization: `OAuth ${c.token}`, file_url: signMedia(item.mediaIds[0]) }, timeout: 120000 }, { token: c.token });
      if (body.success === false) throw fail('Facebook could not receive the video.', 'FACEBOOK_UPLOAD');
      item.job.uploaded = new Date().toISOString(); save();
    }
    item.job.publishRequested = new Date().toISOString(); save();
    const params = { video_id: item.job.videoId, upload_phase: 'finish', video_state: 'PUBLISHED', description: item.caption };
    if (item.title) params.title = item.title;
    const done = await graph(`${c.pageId}/video_reels`, params, 'POST');
    if (done.success === false) throw fail('Facebook did not accept the Reel.', 'FACEBOOK_REJECTED');
    return { id: String(done.post_id || item.job.videoId), permalink: `https://www.facebook.com/reel/${item.job.videoId}` };
  }

  async function run(id, signMedia, { manual = false } = {}) {
    ensureLive(manual); let item = store.post(id);
    if (!item || item.status !== 'scheduled' || !item.approved || item.mediaId || item.job?.publishRequested) throw fail('This post does not meet the requirements for publishing.', 'NOT_ELIGIBLE');
    item.status = 'processing'; item.error = ''; item.job = item.job || {}; item = store.savePost(item);
    // Saves in place, so helpers holding this object keep seeing the current revision and job.
    const save = () => { Object.assign(item, store.savePost(item)); };
    try {
      const c = connection(); let result;
      if (item.format === 'Reel') result = await publishReel(item, signMedia, save);
      else if (item.format === 'Carousel') {
        // Upload each photo unpublished, then one feed post with all of them attached.
        item.job.photoIds = item.job.photoIds || [];
        for (const mediaId of item.mediaIds.slice(item.job.photoIds.length)) { const photo = await graph(`${c.pageId}/photos`, { url: signMedia(mediaId), published: 'false' }, 'POST'); if (!photo.id) throw fail('Facebook did not accept a photo.', 'FACEBOOK_UPLOAD'); item.job.photoIds.push(String(photo.id)); save(); }
        ensureLive(manual);
        item.job.publishRequested = new Date().toISOString(); save();
        const params = { message: item.caption }; item.job.photoIds.forEach((fbid, i) => { params[`attached_media[${i}]`] = JSON.stringify({ media_fbid: fbid }); });
        const post = await graph(`${c.pageId}/feed`, params, 'POST'); if (!post.id) throw fail('The publishing result cannot be confirmed yet.', 'MISSING_MEDIA_ID');
        result = { id: String(post.id) };
      } else {
        ensureLive(manual);
        item.job.publishRequested = new Date().toISOString(); save();
        const photo = await graph(`${c.pageId}/photos`, { url: signMedia(item.mediaIds[0]), caption: item.caption, published: 'true' }, 'POST');
        if (!photo.id && !photo.post_id) throw fail('The publishing result cannot be confirmed yet.', 'MISSING_MEDIA_ID');
        result = { id: String(photo.post_id || photo.id) };
      }
      item.mediaId = result.id; item.status = 'published'; item.publishedAt = new Date().toISOString(); item.error = ''; item.permalink = result.permalink || null; save();
      if (!item.permalink) { try { const link = await graph(item.mediaId, { fields: 'permalink_url' }); if (String(link.permalink_url || '').startsWith('https://www.facebook.com/')) { item.permalink = link.permalink_url; save(); } } catch { /* the link is optional */ } }
      store.event(id, 'Published successfully', item.title + ' · Facebook', 'published'); return item;
    } catch (error) {
      item = store.post(id); item.status = item.job?.publishRequested ? 'uncertain' : error.code === 'PAUSED' ? 'scheduled' : 'failed'; item.error = error.message; item.errorCode = error.code || 'PUBLISH_FAILED'; item = store.savePost(item);
      store.event(id, item.status === 'uncertain' ? 'Result needs checking' : 'Publishing held', error.message, 'failed'); return item;
    }
  }

  // After an interrupted publish: a Reel is checked by its video id; a photo post by matching the caption among the Page's
  // latest posts made after the publish request.
  async function reconcile(id) {
    let item = store.post(id); if (!item) throw fail('Post not found.', 'NOT_FOUND', 404);
    if (item.status === 'published') return item;
    if (!item.job?.publishRequested) { item.status = 'failed'; item.error = 'The post was not published. Check it and set a new schedule.'; return store.savePost(item); }
    const c = connection(); let found = null;
    if (item.job.videoId) { const v = await graph(item.job.videoId, { fields: 'status' }); const s = v.status || {}; if (s.video_status === 'ready' || s.publishing_phase?.status === 'complete') found = { id: item.job.videoId, permalink: `https://www.facebook.com/reel/${item.job.videoId}` }; else if (s.video_status === 'error' || s.processing_phase?.status === 'error') { item.status = 'failed'; item.error = 'Facebook could not process the video. Check it and set a new schedule.'; return store.savePost(item); } }
    else { const since = Date.parse(item.job.publishRequested) - 60000; const posts = (await graph(`${c.pageId}/published_posts`, { fields: 'id,message,created_time,permalink_url', limit: '10' })).data || []; const match = posts.find(p => String(p.message || '').trim() === String(item.caption || '').trim() && Date.parse(p.created_time) >= since); if (match) found = { id: String(match.id), permalink: match.permalink_url || null }; }
    if (found) { item.status = 'published'; item.mediaId = found.id; item.permalink = found.permalink || item.permalink || null; item.publishedAt = item.publishedAt || new Date().toISOString(); item.error = ''; item = store.savePost(item); store.event(id, 'Publication confirmed', 'Facebook shows the post on the Page. Retrying is blocked.', 'published'); return item; }
    item.status = 'uncertain'; item.error = 'Facebook does not show this post yet. Check the Page before trying again.'; return store.savePost(item);
  }

  return { status, connectToken, check, disconnect, run, reconcile, graph };
}
