import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { randomBytes } from 'node:crypto';
import { createApp } from '../src/server.mjs';

test('sessions do not time out, renew while in use, and an admin can end a member\'s sessions', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'vayora-sessions-'));
  const runtime = createApp({ dataDir: directory, scheduler: false, origin: 'http://localhost:3210' });
  const server = runtime.app.listen(0, '127.0.0.1'); await new Promise(r => server.once('listening', r));
  const base = `http://127.0.0.1:${server.address().port}`;
  const send = (session, url, method = 'GET', body) => new Promise((resolve, reject) => {
    const headers = { Host: 'localhost:3210', Origin: 'http://localhost:3210' };
    if (body) headers['Content-Type'] = 'application/json';
    if (session) { headers.Cookie = session.cookie; headers['x-csrf-token'] = session.csrf; }
    const req = http.request(base + url, { method, headers }, res => { const chunks = []; res.on('data', c => chunks.push(c)); res.on('end', () => { const raw = Buffer.concat(chunks).toString(); resolve({ status: res.statusCode, data: raw ? JSON.parse(raw) : null, headers: res.headers }); }); });
    req.on('error', reject); req.end(body ? JSON.stringify(body) : undefined);
  });
  const sessionOf = r => ({ cookie: r.headers['set-cookie'][0].split(';')[0], csrf: r.data.csrf });
  const password = () => 'Test-' + randomBytes(12).toString('hex');
  try {
    const ownerPassword = password();
    const setup = await send(null, '/api/auth/setup', 'POST', { name: 'Owner', email: 'owner@example.test', password: ownerPassword });
    const owner = sessionOf(setup);
    const cookie = setup.headers['set-cookie'][0];
    assert.match(cookie, /Max-Age=34560000/, 'a 400-day cookie, whatever the login form sent'); assert.ok(!/Expires=.*1970/.test(cookie));
    const row = runtime.store.get('SELECT expires FROM sessions');
    assert.ok(row.expires - Date.now() > 399 * 86400000, 'the session itself lasts about 400 days, not 8 hours');

    // A login that asked for the old short session (remember false) still gets the long one.
    const login = await send(null, '/api/auth/login', 'POST', { email: 'owner@example.test', password: ownerPassword, remember: false });
    assert.equal(login.status, 200); assert.match(login.headers['set-cookie'][0], /Max-Age=34560000/);

    // Use renews it: an old session close to its end is extended and the cookie refreshed.
    runtime.store.run('UPDATE sessions SET expires=?', Date.now() + 10 * 86400000);
    const used = await send(owner, '/api/workspace');
    assert.equal(used.status, 200); assert.match(String(used.headers['set-cookie']), /vayora\.sid=.*Max-Age=34560000/, 'the cookie is renewed while the member keeps using the app');
    assert.ok(runtime.store.get('SELECT MAX(expires) AS e FROM sessions').e - Date.now() > 399 * 86400000);
    assert.equal((await send(owner, '/api/workspace')).headers['set-cookie'], undefined, 'no renewal on every request');

    // Admin ends another member's sessions.
    const inviteUrl = (await send(owner, '/api/team/invites', 'POST', { email: 'editor@example.test' })).data.url;
    const editor = sessionOf(await send(null, '/api/auth/accept-invite', 'POST', { token: new URL(inviteUrl).searchParams.get('invite'), name: 'Editor', password: password() }));
    const team = (await send(owner, '/api/team')).data.users, editorId = team.find(u => u.role === 'editor').id, ownerId = team.find(u => u.role === 'owner').id;
    assert.equal((await send(editor, '/api/team/' + editorId + '/sign-out', 'POST', {})).status, 403, 'editors cannot sign anyone out');
    assert.equal((await send(owner, '/api/team/' + ownerId + '/sign-out', 'POST', {})).status, 409, 'use Sign out for yourself');
    assert.equal((await send(owner, '/api/team/nope/sign-out', 'POST', {})).status, 404);
    assert.equal((await send(editor, '/api/workspace')).status, 200);
    const ended = await send(owner, '/api/team/' + editorId + '/sign-out', 'POST', {});
    assert.deepEqual([ended.status, ended.data.ended], [200, 1]);
    assert.equal((await send(editor, '/api/workspace')).status, 401, 'the member must sign in again');
    assert.equal((await send(owner, '/api/workspace')).status, 200, 'the owner session is untouched');
    assert.ok(runtime.store.get("SELECT id FROM events WHERE title='Member signed out'"));
  } finally { await new Promise(r => server.close(r)); runtime.close(); await rm(directory, { recursive: true, force: true }); }
});
