import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile, mkdir } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { openStore } from '../src/store.mjs';
import { mediaPath } from '../src/media.mjs';
import { createFacebook } from '../src/facebook.mjs';
import { createTikTok, chunkPlan } from '../src/tiktok.mjs';
import { postReadiness } from '../src/readiness.mjs';
import { createInstagram } from '../src/instagram.mjs';
import { createApp } from '../src/server.mjs';
import { platformOf, prefixOf } from '../src/platform.mjs';

const BASE = 'https://studio.example.test';
const getConfig = () => ({ publicBase: BASE, version: 'v27.0' });
const sign = id => `${BASE}/public/media/${id}?sig=1`;
async function workspace() {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'vayora-fbtt-')); const store = openStore(dir);
  store.set('publishingEnabled', true); store.set('paused', false);
  return { dir, store, async cleanup() { store.close(); await rm(dir, { recursive: true, force: true }); } };
}
async function addMedia(store, { id, mime = 'image/jpeg', size = 7, duration = null, width = 1080, height = 1080, bytes = Buffer.from('fakebytes') }) {
  const ext = mime === 'video/mp4' ? '.mp4' : '.jpg';
  store.run('INSERT INTO media(id,path,mime,name,size,width,height,duration,created_at) VALUES(?,?,?,?,?,?,?,?,?)', id, id + ext, mime, id + ext, size, width, height, duration, new Date().toISOString());
  const media = store.get('SELECT * FROM media WHERE id=?', id);
  await mkdir(path.dirname(mediaPath(store, media)), { recursive: true }); await writeFile(mediaPath(store, media), bytes);
  return media;
}
const scheduled = (store, item) => store.insertPost({ caption: 'Caption Vayora', title: 'Judul', alt: '', category: 'x', goal: 'y', coverId: null, coverTime: null, status: 'scheduled', approved: true, scheduleAt: new Date(Date.now() - 1000).toISOString(), ...item });

// ---------- Facebook ----------
function meta({ pages = [{ id: '111222', name: 'Vayora', access_token: 'EAApagetoken1234567890', tasks: ['CREATE_CONTENT'] }], failFinish = false, recent = [] } = {}) {
  const calls = [];
  const fetch = async (url, init = {}) => {
    const u = new URL(url), body = init.body ? Object.fromEntries(new URLSearchParams(init.body)) : {}; calls.push({ u, init, body });
    const p = u.pathname.replace(/^\/v27\.0\//, '');
    if (u.hostname === 'rupload.facebook.com') { assert.equal(init.headers.file_url, sign('vid')); assert.equal(init.headers.Authorization, 'OAuth EAApagetoken1234567890'); return Response.json({ success: true }); }
    if (p === 'me/accounts') return init.headers.Authorization === 'Bearer EAApagetoken1234567890' ? Response.json({ error: { message: 'pages only', code: 100 } }, { status: 400 }) : Response.json({ data: pages });
    if (p === 'me') return Response.json({ id: '111222', name: 'Vayora' });
    if (p === '111222' || p === '333444') return Response.json({ id: p, name: p === '111222' ? 'Vayora' : 'Other' });
    if (p === '111222/photos') { assert.equal(init.headers.Authorization, 'Bearer EAApagetoken1234567890'); return Response.json(body.published === 'false' ? { id: 'ph' + calls.filter(c => c.u.pathname.endsWith('/photos')).length } : { id: 'photo1', post_id: '111222_9' }); }
    if (p === '111222/feed') return Response.json({ id: '111222_10' });
    if (p === '111222/video_reels') { if (body.upload_phase === 'start') return Response.json({ video_id: 'v77', upload_url: 'https://rupload.facebook.com/x' }); if (failFinish) throw new Error('reset'); return Response.json({ success: true, post_id: '111222_11' }); }
    if (p === '111222/published_posts') return Response.json({ data: recent });
    if (/^111222_\d+$/.test(p)) return Response.json({ permalink_url: 'https://www.facebook.com/vayora/posts/' + p });
    if (p === 'v77') return Response.json({ status: { video_status: 'ready' } });
    throw new Error('Unexpected Meta request ' + u.href);
  };
  return { fetch, calls };
}

test('Facebook: a user token keeps the Page token; two Pages need a Page ID; a Page token works on its own', async () => {
  const w = await workspace();
  try {
    let m = meta(); let fb = createFacebook(w.store, getConfig, { fetch: m.fetch });
    await assert.rejects(fb.connectToken('short', 'u'), /format not recognized/);
    const s = await fb.connectToken('EAAusertoken1234567890', 'u');
    assert.deepEqual([s.connected, s.pageId, s.pageName], [true, '111222', 'Vayora']);
    assert.equal(w.store.secret('facebook.connection').token, 'EAApagetoken1234567890', 'the Page token is stored, not the user token');
    m = meta({ pages: [{ id: '111222', name: 'Vayora', access_token: 'EAApagetoken1234567890' }, { id: '333444', name: 'Other', access_token: 'EAAother' }] }); fb = createFacebook(w.store, getConfig, { fetch: m.fetch });
    await assert.rejects(fb.connectToken('EAAusertoken1234567890', 'u'), /2 Pages/);
    assert.equal((await fb.connectToken('EAAusertoken1234567890', 'u', '111222')).pageId, '111222');
    m = meta(); fb = createFacebook(w.store, getConfig, { fetch: m.fetch });
    assert.equal((await fb.connectToken('EAApagetoken1234567890', 'u')).pageName, 'Vayora', 'a Page token answers me as the Page');
  } finally { await w.cleanup(); }
});

test('Facebook publishes a photo, an album and a Reel; an interrupted publish is uncertain and confirmed from the Page', async () => {
  const w = await workspace();
  try {
    const m = meta(); const fb = createFacebook(w.store, getConfig, { fetch: m.fetch });
    w.store.setSecret('facebook.connection', { token: 'EAApagetoken1234567890', pageId: '111222', pageName: 'Vayora', invalid: false });
    await addMedia(w.store, { id: 'p1' }); await addMedia(w.store, { id: 'p2' }); await addMedia(w.store, { id: 'vid', mime: 'video/mp4', duration: 30, width: 1080, height: 1920 });
    scheduled(w.store, { id: 'F01', platform: 'facebook', format: 'Gambar', mediaIds: ['p1'] });
    const photo = await fb.run('F01', sign);
    assert.deepEqual([photo.status, photo.mediaId], ['published', '111222_9']); assert.match(photo.permalink, /facebook\.com/);
    const photoCall = m.calls.find(c => c.u.pathname.endsWith('/photos') && c.body.published === 'true');
    assert.deepEqual([photoCall.body.url, photoCall.body.caption], [sign('p1'), 'Caption Vayora']);

    scheduled(w.store, { id: 'F02', platform: 'facebook', format: 'Carousel', mediaIds: ['p1', 'p2'], scheduleAt: new Date(Date.now() - 2000).toISOString() });
    const album = await fb.run('F02', sign);
    assert.equal(album.status, 'published');
    const feed = m.calls.find(c => c.u.pathname.endsWith('/feed'));
    assert.equal(feed.body.message, 'Caption Vayora'); assert.ok(feed.body['attached_media[0]'] && feed.body['attached_media[1]'], 'both photos attached');

    scheduled(w.store, { id: 'F03', platform: 'facebook', format: 'Reel', mediaIds: ['vid'], scheduleAt: new Date(Date.now() - 3000).toISOString() });
    const reel = await fb.run('F03', sign);
    assert.deepEqual([reel.status, reel.permalink], ['published', 'https://www.facebook.com/reel/v77']);
    const finish = m.calls.find(c => c.body.upload_phase === 'finish');
    assert.deepEqual([finish.body.video_state, finish.body.description], ['PUBLISHED', 'Caption Vayora']);

    // The finish answer is lost: uncertain, never retried, then confirmed by the video status.
    const broken = meta({ failFinish: true }); const fb2 = createFacebook(w.store, getConfig, { fetch: broken.fetch });
    scheduled(w.store, { id: 'F04', platform: 'facebook', format: 'Reel', mediaIds: ['vid'], scheduleAt: new Date(Date.now() - 4000).toISOString() });
    const lost = await fb2.run('F04', sign);
    assert.equal(lost.status, 'uncertain'); await assert.rejects(fb2.run('F04', sign), /does not meet the requirements/);
    assert.equal((await fb2.reconcile('F04')).status, 'published');

    // A lost photo answer is confirmed by finding the caption among the Page's newest posts.
    const lostPhoto = meta({ recent: [{ id: '111222_99', message: 'Caption Vayora', created_time: new Date().toISOString(), permalink_url: 'https://www.facebook.com/p/99' }] });
    const fb3 = createFacebook(w.store, getConfig, { fetch: async (url, init) => { if (String(url).includes('/photos')) throw new Error('reset'); return lostPhoto.fetch(url, init); } });
    scheduled(w.store, { id: 'F05', platform: 'facebook', format: 'Gambar', mediaIds: ['p2'], scheduleAt: new Date(Date.now() - 5000).toISOString() });
    assert.equal((await fb3.run('F05', sign)).status, 'uncertain');
    const confirmed = await fb3.reconcile('F05'); assert.deepEqual([confirmed.status, confirmed.mediaId], ['published', '111222_99']);
  } finally { await w.cleanup(); }
});

// ---------- TikTok ----------
function tiktokApi({ privacy = ['SELF_ONLY', 'PUBLIC_TO_EVERYONE'], statuses = ['PUBLISH_COMPLETE'], initError = null } = {}) {
  const calls = []; let polls = 0;
  const fetch = async (url, init = {}) => {
    const u = new URL(url); calls.push({ u, init });
    if (u.pathname === '/v2/oauth/token/') {
      const b = Object.fromEntries(new URLSearchParams(init.body));
      if (b.grant_type === 'authorization_code') { assert.equal(b.redirect_uri, BASE + '/auth/tiktok/callback'); return Response.json({ access_token: 'act.1', expires_in: 86400, refresh_token: 'rft.1', refresh_expires_in: 31536000, open_id: 'open1', scope: 'user.info.basic,video.publish,video.upload' }); }
      return Response.json({ access_token: 'act.2', expires_in: 86400, refresh_token: 'rft.2', refresh_expires_in: 31536000 });
    }
    const ok = data => Response.json({ data, error: { code: 'ok', message: '' } });
    if (u.pathname === '/v2/post/publish/creator_info/query/') return ok({ creator_username: 'vayora.id', creator_nickname: 'Vayora', privacy_level_options: privacy, max_video_post_duration_sec: 600, comment_disabled: false, duet_disabled: false, stitch_disabled: false });
    if (u.pathname === '/v2/post/publish/video/init/') { calls.init = JSON.parse(init.body); if (initError) return Response.json({ data: {}, error: { code: initError, message: 'x' } }, { status: 403 }); return ok({ publish_id: 'pub1', upload_url: 'https://open-upload.tiktokapis.com/upload?id=1' }); }
    if (u.pathname === '/v2/post/publish/content/init/') { calls.photo = JSON.parse(init.body); return ok({ publish_id: 'pub2' }); }
    if (u.hostname === 'open-upload.tiktokapis.com') { (calls.puts ||= []).push(init.headers['Content-Range']); return new Response(null, { status: 201 }); }
    if (u.pathname === '/v2/post/publish/status/fetch/') { const status = statuses[Math.min(polls++, statuses.length - 1)]; return ok({ status, publicaly_available_post_id: status === 'PUBLISH_COMPLETE' ? ['7300000000000000001'] : [] }); }
    throw new Error('Unexpected TikTok request ' + u.href);
  };
  return { fetch, calls };
}
function connectTikTok(store, privacy = 'SELF_ONLY') {
  store.setSecret('tiktok.config', { clientKey: 'awclientkey123', clientSecret: 'secret-fixture', privacy, brandOrganic: true });
  store.setSecret('tiktok.connection', { accessToken: 'act.1', expiresAt: Date.now() + 3600000, refreshToken: 'rft.1', refreshExpiresAt: Date.now() + 86400000 * 300, username: 'vayora.id', privacyOptions: ['SELF_ONLY'], invalid: false });
}

test('TikTok OAuth: Client Key config, session-bound state, posting scope required, creator info stored', async () => {
  const w = await workspace();
  try {
    const t = tiktokApi(); const tt = createTikTok(w.store, () => BASE, { fetch: t.fetch });
    assert.throws(() => tt.saveConfig({ clientKey: 'bad key!', clientSecret: 'x' }), /Invalid Client Key/);
    assert.throws(() => tt.start('u', 's'), /Client Key and Client Secret/);
    tt.saveConfig({ clientKey: 'awclientkey123', clientSecret: 'secret-fixture' });
    const url = new URL(tt.start('u', 's'));
    assert.equal(url.origin + url.pathname, 'https://www.tiktok.com/v2/auth/authorize/');
    assert.equal(url.searchParams.get('scope'), 'user.info.basic,video.publish,video.upload');
    assert.equal(url.searchParams.get('redirect_uri'), BASE + '/auth/tiktok/callback');
    const state = url.searchParams.get('state');
    await assert.rejects(tt.callback({ state, code: 'c' }, 'u', 'other'), /different session/);
    const s = await tt.callback({ state, code: 'c' }, 'u', 's');
    assert.deepEqual([s.connected, s.username, s.privacyOptions], [true, 'vayora.id', ['SELF_ONLY', 'PUBLIC_TO_EVERYONE']]);
    assert.equal(s.privacy, '', 'no visibility is chosen for the person');
    assert.throws(() => tt.saveConfig({ privacy: 'EVERYONE' }), /Invalid TikTok visibility/);
    assert.equal(tt.saveConfig({ privacy: 'SELF_ONLY' }).privacy, 'SELF_ONLY');
    assert.equal(tt.saveConfig({ clientKey: 'anotherkey999' }).connected, false, 'a different app drops the old connection');
  } finally { await w.cleanup(); }
});

test('TikTok posts a video in chunks with the chosen visibility and disclosures, a photo post from signed links, and follows processing', async () => {
  const w = await workspace();
  try {
    assert.deepEqual(chunkPlan(5), { chunkSize: 5, count: 1 }); assert.deepEqual(chunkPlan(100 * 1024 * 1024), { chunkSize: 10485760, count: 10 });
    connectTikTok(w.store);
    await addMedia(w.store, { id: 'vid', mime: 'video/mp4', duration: 35, size: 9, width: 1080, height: 1920, bytes: Buffer.from('ninebytes') });
    await addMedia(w.store, { id: 'p1' }); await addMedia(w.store, { id: 'p2' });
    let t = tiktokApi({ statuses: ['PROCESSING_UPLOAD', 'PUBLISH_COMPLETE'] }); let tt = createTikTok(w.store, () => BASE, { fetch: t.fetch, pollMs: 0 });
    scheduled(w.store, { id: 'T01', platform: 'tiktok', format: 'Reel', mediaIds: ['vid'], syntheticMedia: true, coverTime: 2 });
    const video = await tt.run('T01', sign);
    assert.deepEqual([video.status, video.permalink], ['published', 'https://www.tiktok.com/@vayora.id/video/7300000000000000001']);
    assert.deepEqual(t.calls.init.source_info, { source: 'FILE_UPLOAD', video_size: 9, chunk_size: 9, total_chunk_count: 1 });
    assert.equal(t.calls.init.post_info.privacy_level, 'SELF_ONLY'); assert.equal(t.calls.init.post_info.is_aigc, true); assert.equal(t.calls.init.post_info.brand_organic_toggle, true);
    assert.equal(t.calls.init.post_info.video_cover_timestamp_ms, 2000); assert.deepEqual(t.calls.puts, ['bytes 0-8/9']);

    t = tiktokApi(); tt = createTikTok(w.store, () => BASE, { fetch: t.fetch, pollMs: 0 });
    scheduled(w.store, { id: 'T02', platform: 'tiktok', format: 'Carousel', mediaIds: ['p1', 'p2'], scheduleAt: new Date(Date.now() - 2000).toISOString() });
    assert.equal((await tt.run('T02', sign)).status, 'published');
    assert.deepEqual(t.calls.photo.source_info.photo_images, [sign('p1'), sign('p2')]); assert.equal(t.calls.photo.post_mode, 'DIRECT_POST'); assert.equal(t.calls.photo.media_type, 'PHOTO');

    // Still processing after the checks: uncertain; the scheduler follow-up later finds it finished.
    t = tiktokApi({ statuses: [...Array(8).fill('PROCESSING_DOWNLOAD'), 'PUBLISH_COMPLETE'] }); tt = createTikTok(w.store, () => BASE, { fetch: t.fetch, pollMs: 0 });
    scheduled(w.store, { id: 'T03', platform: 'tiktok', format: 'Reel', mediaIds: ['vid'], scheduleAt: new Date(Date.now() - 3000).toISOString() });
    const slow = await tt.run('T03', sign);
    assert.deepEqual([slow.status, slow.errorCode], ['uncertain', 'TIKTOK_PROCESSING']);
    await assert.rejects(tt.run('T03', sign), /does not meet the requirements/, 'never posted twice');
    await tt.followUp(); assert.equal(w.store.post('T03').status, 'uncertain', 'checked again only after a few minutes');
    const later = w.store.post('T03'); later.job.checkedAt = new Date(Date.now() - 600000).toISOString(); w.store.savePost(later);
    await tt.followUp(); assert.equal(w.store.post('T03').status, 'published');
  } finally { await w.cleanup(); }
});

test('TikTok refuses before posting when no visibility is chosen; an unaudited app error leaves nothing posted', async () => {
  const w = await workspace();
  try {
    connectTikTok(w.store, '');
    await addMedia(w.store, { id: 'vid', mime: 'video/mp4', duration: 35, size: 9, width: 1080, height: 1920 });
    let t = tiktokApi(); let tt = createTikTok(w.store, () => BASE, { fetch: t.fetch, pollMs: 0 });
    scheduled(w.store, { id: 'T01', platform: 'tiktok', format: 'Reel', mediaIds: ['vid'] });
    const held = await tt.run('T01', sign);
    assert.equal(held.status, 'failed'); assert.match(held.error, /Choose who can see TikTok posts/); assert.ok(!t.calls.init, 'nothing was sent to TikTok');
    connectTikTok(w.store, 'PUBLIC_TO_EVERYONE');
    t = tiktokApi({ initError: 'unaudited_client_can_only_post_to_private_accounts', privacy: ['SELF_ONLY', 'PUBLIC_TO_EVERYONE'] }); tt = createTikTok(w.store, () => BASE, { fetch: t.fetch, pollMs: 0 });
    scheduled(w.store, { id: 'T02', platform: 'tiktok', format: 'Reel', mediaIds: ['vid'], scheduleAt: new Date(Date.now() - 2000).toISOString() });
    const rejected = await tt.run('T02', sign);
    assert.equal(rejected.status, 'failed', 'TikTok refused the init: nothing went live, so it may be retried'); assert.match(rejected.error, /audited/); assert.ok(!rejected.job?.publishRequested);
  } finally { await w.cleanup(); }
});

test('platforms: codes, readiness and Post now routing for Facebook and TikTok posts', async () => {
  assert.deepEqual([platformOf({ format: 'Short' }), platformOf({ format: 'Reel' }), platformOf({ format: 'Reel', platform: 'tiktok' })], ['youtube', 'instagram', 'tiktok']);
  assert.deepEqual([prefixOf({ format: 'Carousel' }), prefixOf({ platform: 'facebook', format: 'Reel' }), prefixOf({ platform: 'tiktok', format: 'Gambar' })], ['C', 'F', 'T']);
  const w = await workspace();
  try {
    connectTikTok(w.store);
    await addMedia(w.store, { id: 'vid', mime: 'video/mp4', duration: 120, size: 9, width: 1080, height: 1920 });
    w.store.insertPost({ id: 'F01', platform: 'facebook', format: 'Reel', mediaIds: ['vid'], caption: 'x', title: 'y', status: 'draft', approved: true });
    const ig = createInstagram(w.store, getConfig, {});
    const fbReady = postReadiness(w.store, w.store.post('F01'), ig, null, { facebook: createFacebook(w.store, getConfig, {}), tiktok: null });
    assert.equal(fbReady.channel, 'facebook'); assert.equal(fbReady.checks.find(c => c.id === 'media').ok, false, 'a 120 s video is too long for a Facebook Reel');
    assert.equal(fbReady.checks.find(c => c.id === 'facebook').ok, false);
    w.store.insertPost({ id: 'T01', platform: 'tiktok', format: 'Reel', mediaIds: ['vid'], caption: 'x', title: 'y', status: 'draft', approved: true });
    const ttReady = postReadiness(w.store, w.store.post('T01'), ig, null, { tiktok: createTikTok(w.store, () => BASE, {}) });
    assert.equal(ttReady.checks.find(c => c.id === 'media').ok, true); assert.equal(ttReady.checks.find(c => c.id === 'tiktok').ok, true); assert.equal(ttReady.checks.find(c => c.id === 'privacy').ok, true);
    assert.ok(!ttReady.checks.some(c => c.id === 'https'), 'TikTok videos are uploaded, so no public link is needed');
  } finally { await w.cleanup(); }
  // Through the API: codes and the format/platform rule.
  const dir = await mkdtemp(path.join(os.tmpdir(), 'vayora-fbtt-app-'));
  const calls = [];
  const runtime = createApp({ dataDir: dir, scheduler: false, origin: 'http://localhost:3210', facebook: { fetch: async (url, init) => { calls.push(String(url)); return meta().fetch(url, init); } } });
  try {
    runtime.store.setSecret('instagram.config', { publicBase: BASE });
    runtime.store.setSecret('facebook.connection', { token: 'EAApagetoken1234567890', pageId: '111222', pageName: 'Vayora', invalid: false });
    runtime.store.set('publishingEnabled', true); runtime.store.set('paused', false);
    await addMedia(runtime.store, { id: 'p1' });
    scheduled(runtime.store, { id: 'F01', platform: 'facebook', format: 'Gambar', mediaIds: ['p1'] });
    await runtime.tick();
    assert.equal(runtime.store.post('F01').status, 'published', 'the scheduler sends a Facebook post to Facebook');
    assert.ok(calls.some(c => c.includes('/111222/photos')) && !calls.some(c => c.includes('graph.instagram.com')));
  } finally { runtime.close(); await rm(dir, { recursive: true, force: true }); }
});
