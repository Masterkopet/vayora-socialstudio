import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { randomBytes } from 'node:crypto';
import { createApp } from '../src/server.mjs';
import { navigationHTML, menuGridHTML, pageIds, hiddenPageIds } from '../src/client/navigation.js';
import { createSimpleViews } from '../src/client/simple.js';

const icon = name => `<i data-icon="${name}"></i>`;

test('menu is short for editors, keeps owner settings for the owner, and hidden pages keep their URLs', () => {
  const owner = navigationHTML({ view: 'home', icon, role: 'owner' }), editor = navigationHTML({ view: 'home', icon, role: 'editor' });
  for (const id of ['home', 'create', 'library', 'youtube-library', 'facebook-library', 'tiktok-library', 'blog', 'calendar', 'queue', 'assistant', 'profile', 'history']) {
    assert.ok(editor.includes(`nav:${id}"`), `editor sees ${id}`);
  }
  for (const id of ['settings', 'import']) {
    assert.ok(owner.includes(`nav:${id}"`), `owner sees ${id}`);
    assert.ok(!editor.includes(`nav:${id}"`), `editor does not see ${id}`);
  }
  for (const id of hiddenPageIds) {
    assert.ok(!owner.includes(`nav:${id}"`), `${id} is not in the menu`);
    assert.ok(pageIds.includes(id), `${id} keeps its URL`);
  }
  assert.match(navigationHTML({ view: 'home', icon, alertCount: 2 }), /nav:home"[^>]*>.*vs-nav-count[^>]*>2</);
  const tiles = role => (menuGridHTML({ view: 'home', icon, role }).match(/vs-menu-tile/g) || []).length;
  assert.equal(tiles('owner'), 16); assert.equal(tiles('editor'), 14);
});

function views({ posts = [], instagram = {}, youtube = {}, settings = {}, role = 'owner' } = {}) {
  const workspace = { posts, instagram, youtube, settings: { notifyFailure: true, notifyReconnect: true, ...settings } };
  return createSimpleViews({ api: async () => ({}), esc: s => String(s), button: (t, a) => `<button data-action="${a}">${t}</button>`, toast() {}, stamp: s => s, previewImage: () => '', names: {}, getWorkspace: () => workspace, getUser: () => ({ name: 'Uji', role }), render() {}, reload: async () => {}, navigate() {}, root: () => null });
}

test('problem alerts name what is wrong and who can fix it', () => {
  const ok = views({ instagram: { connected: true, username: 'v' }, youtube: { connected: true }, settings: { publishingEnabled: true, paused: false } });
  assert.deepEqual(ok.problemAlerts(), [], 'nothing to report when all is well');

  const soon = new Date(Date.now() + 3 * 86400000).toISOString();
  const broken = views({
    posts: [{ id: 'I01', format: 'Gambar', status: 'failed' }, { id: 'S01', format: 'Short', status: 'scheduled', scheduleAt: soon }, { id: 'V01', format: 'Reel', status: 'uncertain' }],
    instagram: { connected: true, expiresAt: soon }, youtube: { connected: false, error: 'Izin YouTube perlu disambungkan kembali.' }, settings: { publishingEnabled: false },
  });
  const text = broken.problemAlerts().map(a => a.level + ': ' + a.text).join('\n');
  assert.match(text, /danger: 1 posts failed to publish/);
  assert.match(text, /danger: 1 posts may or may not have been published/);
  assert.match(text, /warning: Instagram access expires within 7 days/);
  assert.match(text, /danger: YouTube is disconnected/);
  assert.match(text, /danger: A Short is scheduled, but the YouTube channel is not connected/);
  assert.match(text, /warning: 1 scheduled posts will not be published because real publishing is not enabled/);

  const editor = views({ youtube: { error: 'x' }, role: 'editor' }).problemAlerts();
  assert.match(editor[0].text, /Ask the workspace owner/); assert.equal(editor[0].action, null, 'editors get no settings button');

  const quiet = views({ posts: [{ id: 'I01', format: 'Gambar', status: 'failed' }], youtube: { error: 'x' }, settings: { notifyFailure: false, notifyReconnect: false } });
  assert.deepEqual(quiet.problemAlerts(), [], 'the notification switches in settings are respected');
});

test('"Buat posting" creates content without an ID code and can schedule it with approval', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'vayora-simple-'));
  const runtime = createApp({ dataDir: dir, scheduler: false, origin: 'http://localhost:3210' });
  const server = runtime.app.listen(0, '127.0.0.1'); await new Promise(r => server.once('listening', r));
  const base = `http://127.0.0.1:${server.address().port}`;
  let session = null;
  const request = (url, method = 'GET', body) => new Promise((resolve, reject) => {
    const headers = { Host: 'localhost:3210', Origin: 'http://localhost:3210' };
    if (body) headers['Content-Type'] = 'application/json';
    if (session) { headers.Cookie = session.cookie; headers['x-csrf-token'] = session.csrf; }
    const req = http.request(base + url, { method, headers }, res => { const chunks = []; res.on('data', c => chunks.push(c)); res.on('end', () => { const raw = Buffer.concat(chunks).toString(); resolve({ status: res.statusCode, data: raw ? JSON.parse(raw) : null, headers: res.headers }); }); });
    req.on('error', reject); req.end(body ? JSON.stringify(body) : undefined);
  });
  try {
    const setup = await request('/api/auth/setup', 'POST', { name: 'Pemilik', email: 'owner@example.test', password: 'Test-' + randomBytes(12).toString('hex') });
    session = { cookie: setup.headers['set-cookie'][0].split(';')[0], csrf: setup.data.csrf };
    const add = (id, mime, w = 1080, h = 1350, duration = null) => runtime.store.run('INSERT INTO media(id,path,mime,name,size,width,height,duration,created_at) VALUES(?,?,?,?,?,?,?,?,?)', id, id, mime, id, 10, w, h, duration, new Date().toISOString());
    add('a'.repeat(64), 'image/jpeg'); add('b'.repeat(64), 'video/mp4', 1080, 1920, 20);
    const first = await request('/api/posts', 'POST', { format: 'Gambar', title: 'Foto kamar', caption: 'C', mediaIds: ['a'.repeat(64)] });
    assert.equal(first.status, 201); assert.equal(first.data.id, 'I01');
    const second = await request('/api/posts', 'POST', { format: 'Gambar', title: 'Foto kedua', caption: 'C', mediaIds: ['a'.repeat(64)] });
    assert.equal(second.data.id, 'I02', 'next free code');
    const short = await request('/api/posts', 'POST', { format: 'Short', title: 'Tur', caption: 'D', mediaIds: ['b'.repeat(64)] });
    assert.equal(short.status, 201, JSON.stringify(short.data)); assert.equal(short.data.id, 'S01');
    assert.equal((await request('/api/posts', 'POST', { format: 'Story', title: 'x', mediaIds: ['a'.repeat(64)] })).status, 400, 'format is still validated');
    const date = new Date(Date.now() + 3 * 86400000 + 7 * 3600000).toISOString().slice(0, 10);
    const body = { revision: first.data.revision, intent: 'scheduled', title: 'Foto kamar', caption: 'C', alt: '', mediaIds: ['a'.repeat(64)], category: first.data.category, goal: first.data.goal, coverId: null, coverTime: null, date, time: '09:00' };
    assert.equal((await request('/api/posts/I01', 'PUT', { ...body, approved: false })).status, 400, 'scheduling without approval is refused');
    const scheduled = await request('/api/posts/I01', 'PUT', { ...body, approved: true });
    assert.equal(scheduled.status, 200); assert.equal(scheduled.data.status, 'scheduled'); assert.equal(scheduled.data.approved, true);
  } finally { await new Promise(r => server.close(r)); runtime.close(); await rm(dir, { recursive: true, force: true }); }
});

test('breadcrumb trails: Home › group › page, details hang under their page, Home has none', async () => {
  const { crumbs, parentOf } = await import('../src/client/navigation.js');
  assert.deepEqual(crumbs('home'), []);
  assert.deepEqual(crumbs('library'), [{ label: 'Home', view: 'home' }, { label: 'Content' }, { label: 'Instagram library', current: true }]);
  assert.deepEqual(crumbs('profile').map(c => c.label), ['Home', 'Settings', 'Team account']);
  assert.deepEqual(crumbs('blog', 'Edit article'), [{ label: 'Home', view: 'home' }, { label: 'Content' }, { label: 'Blog', view: 'blog' }, { label: 'Edit article', current: true }], 'something open inside a page makes the page a link');
  assert.deepEqual(crumbs('delivery'), [{ label: 'Home', view: 'home' }, { label: 'Content' }, { label: 'Queue', view: 'queue' }, { label: 'Publishing details', current: true }]);
  assert.deepEqual(crumbs('knowledge').map(c => c.label), ['Home', 'Settings', 'Brand knowledge']);
  assert.deepEqual(crumbs('settings', 'Facebook').map(c => c.label), ['Home', 'Settings', 'Facebook'], 'the Settings group is not repeated before the Settings page');
  assert.deepEqual([parentOf('delivery'), parentOf('knowledge'), parentOf('calendar')], ['queue', 'settings', 'home']);
});
