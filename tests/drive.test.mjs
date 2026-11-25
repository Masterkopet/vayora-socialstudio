import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { randomBytes } from 'node:crypto';
import sharp from 'sharp';
import { openStore } from '../src/store.mjs';
import { createDrive, kindOf } from '../src/drive.mjs';
import { createApp } from '../src/server.mjs';

const CLIENT_ID = '123456789-abcdef.apps.googleusercontent.com';

// A fake Google: token endpoint, Drive about/files/export and file downloads over a small folder tree.
function google(png) {
  const calls = [];
  const tree = {
    root: [{ id: 'folderEP01xxx', name: '01 - Harga Villa', mimeType: 'application/vnd.google-apps.folder' }, { id: 'docArtikel01', name: 'Artikel', mimeType: 'application/vnd.google-apps.document' }, { id: 'noteIgnored1', name: 'notes.pdf', mimeType: 'application/pdf' }],
    folderEP01xxx: [{ id: 'videoMp4File1', name: 'Vayora-Shorts-01.mp4', mimeType: 'video/mp4', size: '1234' }, { id: 'photoPng1234', name: 'cover.png', mimeType: 'image/png', size: String(png.length) }, { id: 'folderJunkxxx', name: 'node_modules', mimeType: 'application/vnd.google-apps.folder' }, { id: 'metaJson1234', name: 'meta.json', mimeType: 'application/json', size: '17' }],
    folderJunkxxx: [{ id: 'neverSeen123', name: 'x.mp4', mimeType: 'video/mp4' }],
  };
  const fetch = async (url, init = {}) => {
    const u = new URL(url); calls.push({ url: u, init });
    if (u.href === 'https://oauth2.googleapis.com/token') {
      const b = Object.fromEntries(init.body);
      if (b.grant_type === 'authorization_code') return Response.json({ access_token: 'ya29.drive', refresh_token: '1//drive-refresh', expires_in: 3599 });
      if (b.grant_type === 'refresh_token') return Response.json({ access_token: 'ya29.drive2', expires_in: 3599 });
    }
    if (u.pathname === '/drive/v3/about') return Response.json({ user: { emailAddress: 'studio@example.test' } });
    assert.match(String(init.headers?.Authorization), /^Bearer ya29\./, 'Drive calls carry the access token');
    if (u.pathname === '/drive/v3/files' && !u.pathname.endsWith('/export')) {
      const q = u.searchParams.get('q'), parent = q.match(/^'([^']+)' in parents/)?.[1];
      return Response.json({ files: tree[parent] || [] });
    }
    const id = u.pathname.split('/')[4];
    if (u.pathname.endsWith('/export')) { assert.equal(u.searchParams.get('mimeType'), 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'); return new Response('DOCX-BYTES'); }
    if (u.searchParams.get('alt') === 'media') return new Response(id === 'photoPng1234' ? png : id === 'metaJson1234' ? '{"title":"Judul"}' : 'x');
    const all = Object.values(tree).flat(), f = all.find(x => x.id === id);
    return f ? Response.json(f) : new Response('{}', { status: 404 });
  };
  return { fetch, calls };
}

test('connecting uses the YouTube client and callback address; the state is single-use and session-bound', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'vayora-drive-')); const store = openStore(dir), g = google(Buffer.from('x'));
  try {
    const drive = createDrive(store, () => 'https://studio.example.test', { fetch: g.fetch });
    assert.equal(drive.status().configured, false);
    assert.throws(() => drive.start('u1', 's1'), /Google client/);
    store.setSecret('youtube.config', { clientId: CLIENT_ID, clientSecret: 'client-secret-fixture' });
    const url = new URL(drive.start('u1', 's1'));
    assert.equal(url.searchParams.get('scope'), 'https://www.googleapis.com/auth/drive.readonly');
    assert.equal(url.searchParams.get('redirect_uri'), 'https://studio.example.test/auth/youtube/callback', 'no new redirect address needed');
    assert.equal(url.searchParams.get('access_type'), 'offline');
    const state = url.searchParams.get('state');
    assert.equal(drive.ownsState(state), true); assert.equal(drive.ownsState('0'.repeat(64)), false);
    await assert.rejects(drive.callback({ state, code: 'c' }, 'u1', 'other-session'), /expired or came from a different session/);
    assert.equal((await drive.callback({ state, code: 'c' }, 'u1', 's1')).connected, true, 'a rejected attempt from another session does not use up the state');
    await assert.rejects(drive.callback({ state, code: 'c' }, 'u1', 's1'), /Invalid connection request/, 'the state is single-use');
  } finally { store.close(); await rm(dir, { recursive: true, force: true }); }
});

test('list, walk, download and import work on a folder tree; junk folders and unusable files are skipped', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'vayora-drive-')); const store = openStore(dir);
  const png = await sharp({ create: { width: 800, height: 800, channels: 3, background: '#FFF9E1' } }).png().toBuffer(), g = google(png);
  try {
    store.setSecret('youtube.config', { clientId: CLIENT_ID, clientSecret: 'client-secret-fixture' });
    const drive = createDrive(store, () => 'https://studio.example.test', { fetch: g.fetch });
    const state = new URL(drive.start('u1', 's1')).searchParams.get('state');
    const connected = await drive.callback({ state, code: 'auth-code' }, 'u1', 's1');
    assert.deepEqual([connected.connected, connected.account], [true, 'studio@example.test']);
    assert.equal(drive.ownsState(state), false, 'the state is single-use');
    assert.deepEqual((await drive.list('root')).files.map(f => [f.name, f.kind]), [['01 - Harga Villa', 'folder'], ['Artikel.docx', 'text']], 'a Google Doc appears as .docx; a PDF is hidden');
    const walked = (await drive.walk('root')).files.map(f => f.path);
    assert.deepEqual(walked.sort(), ['01 - Harga Villa/Vayora-Shorts-01.mp4', '01 - Harga Villa/cover.png', '01 - Harga Villa/meta.json', 'Artikel.docx'].sort(), 'paths keep the folder names; node_modules is not opened');
    assert.ok(!g.calls.some(c => c.url.searchParams.get('q')?.includes('folderJunkxxx')));
    assert.equal(await (await drive.open('docArtikel01')).response.text(), 'DOCX-BYTES', 'Google Docs are exported as Word');
    const media = await drive.importMedia('photoPng1234');
    assert.equal(media.mime, 'image/jpeg'); assert.equal(store.all('SELECT id FROM media').length, 1, 'photo went through the normal media pipeline');
    await assert.rejects(drive.importMedia('metaJson1234'), /Only videos and photos/);
    await assert.rejects(drive.open('../../etc'), /Invalid file/);
    assert.equal(g.calls.filter(c => c.url.pathname === '/token' || c.url.href === 'https://oauth2.googleapis.com/token').length, 1, 'one token exchange, the access token is reused');
    assert.equal(kindOf({ name: 'x.MOV', mimeType: 'video/quicktime' }), 'media'); assert.equal(kindOf({ name: 'a.exe', mimeType: 'application/x-msdownload' }), null);
  } finally { store.close(); await rm(dir, { recursive: true, force: true }); }
});

test('Drive routes are for admins; the shared Google callback hands Drive states to Drive', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'vayora-drive-app-'));
  const png = await sharp({ create: { width: 800, height: 800, channels: 3, background: '#FFF9E1' } }).png().toBuffer(), g = google(png);
  const runtime = createApp({ dataDir: directory, scheduler: false, origin: 'http://localhost:3210', drive: { fetch: g.fetch } });
  const server = runtime.app.listen(0, '127.0.0.1'); await new Promise(r => server.once('listening', r));
  const base = `http://127.0.0.1:${server.address().port}`;
  const send = (session, url, method = 'GET', body) => new Promise((resolve, reject) => {
    const headers = { Host: 'localhost:3210', Origin: 'http://localhost:3210' }; if (body) headers['Content-Type'] = 'application/json';
    if (session) { headers.Cookie = session.cookie; headers['x-csrf-token'] = session.csrf; }
    const req = http.request(base + url, { method, headers }, res => { const chunks = []; res.on('data', c => chunks.push(c)); res.on('end', () => { const raw = Buffer.concat(chunks); let data = null; try { data = JSON.parse(raw.toString()); } catch { /* not json */ } resolve({ status: res.statusCode, data, raw, headers: res.headers }); }); });
    req.on('error', reject); req.end(body ? JSON.stringify(body) : undefined);
  });
  const sessionOf = r => ({ cookie: r.headers['set-cookie'][0].split(';')[0], csrf: r.data.csrf });
  const password = () => 'Test-' + randomBytes(12).toString('hex');
  try {
    runtime.store.setSecret('youtube.config', { clientId: CLIENT_ID, clientSecret: 'client-secret-fixture' });
    runtime.store.setSecret('instagram.config', { publicBase: 'https://studio.example.test' });
    const owner = sessionOf(await send(null, '/api/auth/setup', 'POST', { name: 'Owner', email: 'owner@example.test', password: password() }));
    const invite = (await send(owner, '/api/team/invites', 'POST', { email: 'editor@example.test' })).data.url;
    const editor = sessionOf(await send(null, '/api/auth/accept-invite', 'POST', { token: new URL(invite).searchParams.get('invite'), name: 'Editor', password: password() }));
    assert.equal((await send(editor, '/api/drive/status')).status, 403, 'editors cannot use Drive import');
    assert.equal((await send(null, '/api/drive/status')).status, 401);
    assert.equal((await send(owner, '/api/drive/list')).status, 409, 'not connected yet');
    const url = new URL((await send(owner, '/api/drive/connect', 'POST', {})).data.url), state = url.searchParams.get('state');
    // The shared callback: a Drive state is completed by Drive and returns to the Import page.
    const done = await send(owner, `/auth/youtube/callback?state=${state}&code=abc`);
    assert.equal(done.status, 302); assert.equal(done.headers.location, '/?drive=connected#import');
    assert.equal((await send(owner, '/api/drive/status')).data.account, 'studio@example.test');
    assert.deepEqual((await send(owner, '/api/drive/list?folder=root')).data.files.map(f => f.name), ['01 - Harga Villa', 'Artikel.docx']);
    assert.equal((await send(owner, '/api/drive/list?folder=..%2F..')).status, 400);
    const file = await send(owner, '/api/drive/file/docArtikel01'); assert.equal(file.raw.toString(), 'DOCX-BYTES');
    assert.equal((await send(owner, '/api/drive/file/photoPng1234')).status, 415, 'photos and videos are never streamed to the browser');
    const imported = await send(owner, '/api/drive/import', 'POST', { fileId: 'photoPng1234' });
    assert.equal(imported.status, 201); assert.equal(imported.data.media[0].mime, 'image/jpeg');
    assert.equal((await send(editor, '/api/drive/import', 'POST', { fileId: 'photoPng1234' })).status, 403);
    assert.equal((await send(owner, '/api/drive/disconnect', 'POST', {})).data.connected, false);
    // A YouTube callback state is not mistaken for a Drive one.
    assert.equal((await send(owner, '/auth/youtube/callback?state=' + '0'.repeat(64) + '&code=x')).headers.location, '/?youtube=failed#settings');
  } finally { await new Promise(r => server.close(r)); runtime.close(); await rm(directory, { recursive: true, force: true }); }
});
