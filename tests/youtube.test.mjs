import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile, mkdir } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { openStore } from '../src/store.mjs';
import { mediaPath } from '../src/media.mjs';
import { createYouTube, youtubeTitle } from '../src/youtube.mjs';
import { postReadiness } from '../src/readiness.mjs';
import { createApp } from '../src/server.mjs';

const CLIENT_ID = '123456789-abcdef.apps.googleusercontent.com';
const UPLOAD_URL = 'https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&upload_id=fixture';

// Fake Google: OAuth token endpoint, channels, resumable upload and the uploads playlist.
function google({ failPut = false, returnedPrivacy = 'private', playlist = [] } = {}) {
  const calls = [];
  const fetch = async (url, init = {}) => {
    const u = new URL(url); calls.push({ url: u, init });
    if (u.href === 'https://oauth2.googleapis.com/token') {
      const b = Object.fromEntries(init.body);
      if (b.grant_type === 'authorization_code') { assert.equal(b.client_secret, 'client-secret-fixture'); return Response.json({ access_token: 'ya29.first', refresh_token: '1//refresh-fixture', expires_in: 3599 }); }
      if (b.grant_type === 'refresh_token') { assert.equal(b.refresh_token, '1//refresh-fixture'); return Response.json({ access_token: 'ya29.refreshed', expires_in: 3599 }); }
    }
    if (u.pathname === '/youtube/v3/channels') {
      if (u.searchParams.get('part') === 'contentDetails') return Response.json({ items: [{ id: 'UC1', contentDetails: { relatedPlaylists: { uploads: 'UU1' } } }] });
      return Response.json({ items: [{ id: 'UC1', snippet: { title: 'Vayora Channel' } }] });
    }
    if (u.pathname === '/upload/youtube/v3/videos' && init.method === 'POST') {
      calls.meta = JSON.parse(init.body); calls.declaredLength = init.headers['X-Upload-Content-Length'];
      return new Response(null, { status: 200, headers: { location: UPLOAD_URL } });
    }
    if (u.href === UPLOAD_URL && init.method === 'PUT') {
      calls.putLength = init.headers['Content-Length']; calls.puts = (calls.puts || 0) + 1;
      if (failPut) throw new Error('connection reset');
      return Response.json({ id: 'vid123', status: { uploadStatus: 'uploaded', privacyStatus: returnedPrivacy } });
    }
    if (u.pathname === '/youtube/v3/playlistItems') return Response.json({ items: playlist });
    throw new Error('Unexpected Google request ' + u.href);
  };
  return { fetch, calls };
}
async function workspace() {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'vayora-yt-')); const store = openStore(dir);
  return { dir, store, async cleanup() { store.close(); await rm(dir, { recursive: true, force: true }); } };
}
async function addVideo(store, { id = 'm-short', width = 1080, height = 1920, duration = 30 } = {}) {
  const media = { id, path: id + '.mp4', mime: 'video/mp4', name: 'short.mp4', size: 7, width, height, duration, created_at: new Date().toISOString() };
  store.run('INSERT INTO media(id,path,mime,name,size,width,height,duration,created_at) VALUES(?,?,?,?,?,?,?,?,?)', media.id, media.path, media.mime, media.name, media.size, media.width, media.height, media.duration, media.created_at);
  await mkdir(path.dirname(mediaPath(store, media)), { recursive: true }); await writeFile(mediaPath(store, media), Buffer.from('fakevid'));
  return media;
}
function connect(store) {
  store.setSecret('youtube.config', { clientId: CLIENT_ID, clientSecret: 'client-secret-fixture', privacy: 'public' });
  store.setSecret('youtube.connection', { refreshToken: '1//refresh-fixture', accessToken: 'ya29.old', expiresAt: Date.now() - 1000, channelId: 'UC1', channelTitle: 'Vayora Channel', invalid: false });
}

test('YouTube OAuth is session-bound, asks for offline upload access and stores the refresh token encrypted', async () => {
  const w = await workspace();
  try {
    const g = google(); const yt = createYouTube(w.store, () => 'https://studio.example.test', { fetch: g.fetch });
    assert.throws(() => yt.saveConfig({ clientId: 'not-a-client', clientSecret: 'x' }), /Invalid Client ID/);
    assert.throws(() => yt.start('owner', 'session-1'), /Client ID and Client Secret/);
    yt.saveConfig({ clientId: CLIENT_ID, clientSecret: 'client-secret-fixture', privacy: 'unlisted' });
    const url = new URL(yt.start('owner', 'session-1'));
    assert.equal(url.origin + url.pathname, 'https://accounts.google.com/o/oauth2/v2/auth');
    assert.equal(url.searchParams.get('access_type'), 'offline'); assert.equal(url.searchParams.get('prompt'), 'consent');
    assert.match(url.searchParams.get('scope'), /youtube\.upload/);
    assert.equal(url.searchParams.get('redirect_uri'), 'https://studio.example.test/auth/youtube/callback');
    const state = url.searchParams.get('state');
    await assert.rejects(() => yt.callback({ state, code: 'c' }, 'owner', 'other-session'), /different session/);
    const result = await yt.callback({ state, code: 'c' }, 'owner', 'session-1');
    assert.equal(result.connected, true); assert.equal(result.channelTitle, 'Vayora Channel'); assert.equal(result.privacy, 'unlisted');
    await assert.rejects(() => yt.callback({ state, code: 'c' }, 'owner', 'session-1'), /expired/, 'state is single use');
    const raw = w.store.get("SELECT value FROM settings WHERE key='youtube.connection'").value;
    assert.ok(!raw.includes('refresh-fixture') && !raw.includes('ya29'), 'tokens are stored encrypted');
    assert.ok(!JSON.stringify(yt.status()).includes('client-secret-fixture'), 'status never exposes the secret');
  } finally { await w.cleanup(); }
});

test('a scheduled Short uploads once with refreshed access, an exact length and a YouTube-safe title, and records the private lock', async () => {
  const w = await workspace();
  try {
    connect(w.store); w.store.set('publishingEnabled', true); w.store.set('paused', false);
    const media = await addVideo(w.store);
    w.store.insertPost({ id: 'S01', format: 'Short', title: 'Villa <tenang> di Bali', caption: 'Deskripsi Short', tags: ['Vayora', 'housekeeping villa'], syntheticMedia: true, mediaIds: [media.id], status: 'scheduled', approved: true, scheduleAt: new Date().toISOString() });
    const g = google(); const yt = createYouTube(w.store, () => 'https://studio.example.test', { fetch: g.fetch });
    const item = await yt.run('S01');
    assert.equal(item.status, 'published'); assert.equal(item.mediaId, 'vid123'); assert.equal(item.permalink, 'https://www.youtube.com/shorts/vid123');
    assert.equal(item.youtubeLocked, true, 'requested public but YouTube kept it private');
    assert.equal(g.calls.meta.snippet.title, 'Villa tenang di Bali'); assert.equal(g.calls.meta.status.privacyStatus, 'public'); assert.equal(g.calls.meta.status.selfDeclaredMadeForKids, false);
    assert.deepEqual(g.calls.meta.snippet.tags, ['Vayora', 'housekeeping villa']); assert.equal(g.calls.meta.status.containsSyntheticMedia, true, 'AI visuals are disclosed');
    assert.equal(g.calls.declaredLength, '7'); assert.equal(g.calls.putLength, '7');
    assert.ok(g.calls.some(c => c.url.href === 'https://oauth2.googleapis.com/token'), 'expired access token was refreshed');
    assert.ok(w.store.get("SELECT id FROM events WHERE post_id='S01' AND detail LIKE '%locked to private%'"));
    await assert.rejects(() => yt.run('S01'), /does not meet the requirements/, 'a published Short is never uploaded again');
  } finally { await w.cleanup(); }
});

test('an interrupted upload becomes uncertain and is confirmed from the channel uploads instead of uploading again', async () => {
  const w = await workspace();
  try {
    connect(w.store); w.store.set('publishingEnabled', true); w.store.set('paused', false);
    const media = await addVideo(w.store);
    w.store.insertPost({ id: 'S02', format: 'Short', title: 'Short terputus', caption: 'D', mediaIds: [media.id], status: 'scheduled', approved: true, scheduleAt: new Date().toISOString() });
    const broken = google({ failPut: true });
    let item = await createYouTube(w.store, () => 'https://studio.example.test', { fetch: broken.fetch }).run('S02');
    assert.equal(item.status, 'uncertain'); assert.equal(broken.calls.puts, 1);
    const found = google({ playlist: [{ snippet: { title: 'Short terputus', publishedAt: new Date().toISOString(), resourceId: { videoId: 'vidFound' } } }] });
    item = await createYouTube(w.store, () => 'https://studio.example.test', { fetch: found.fetch }).reconcile('S02');
    assert.equal(item.status, 'published'); assert.equal(item.mediaId, 'vidFound'); assert.ok(!found.calls.puts, 'reconcile never uploads');
  } finally { await w.cleanup(); }
});

test('Short readiness uses YouTube rules and the scheduler routes Shorts to YouTube, never to Instagram', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'vayora-yt-app-'));
  const g = google({ returnedPrivacy: 'public' });
  const runtime = createApp({ dataDir: dir, scheduler: false, origin: 'http://localhost:3210', youtube: { fetch: g.fetch }, instagram: { fetch: async () => { throw new Error('Instagram must not be called for a Short'); } } });
  try {
    const store = runtime.store; connect(store);
    const wide = await addVideo(store, { id: 'm-wide', width: 1920, height: 1080 });
    store.insertPost({ id: 'S03', format: 'Short', title: 'x'.repeat(101), caption: '', mediaIds: [wide.id], status: 'draft' });
    const r = postReadiness(store, store.post('S03'), runtime.instagram, runtime.youtube);
    assert.equal(r.channel, 'youtube'); assert.ok(!r.checks.some(c => c.id === 'instagram' || c.id === 'https'), 'no Instagram checks for a Short');
    for (const id of ['media', 'title', 'caption']) assert.equal(r.checks.find(c => c.id === id).ok, false, id + ' must fail');
    assert.equal(r.checks.find(c => c.id === 'youtube').ok, true);
    const media = await addVideo(store);
    store.insertPost({ id: 'S04', format: 'Short', title: 'Short terjadwal', caption: 'D', mediaIds: [media.id], status: 'scheduled', approved: true, scheduleAt: new Date(Date.now() - 1000).toISOString() });
    store.set('publishingEnabled', true); store.set('paused', false);
    await runtime.tick();
    assert.equal(store.post('S04').status, 'published'); assert.equal(store.post('S04').youtubeLocked, false); assert.equal(g.calls.puts, 1);
    assert.equal(youtubeTitle(' <b>Judul</b> '), 'bJudul/b');
  } finally { runtime.close(); await rm(dir, { recursive: true, force: true }); }
});
