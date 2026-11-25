import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { randomBytes } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { createApp } from '../src/server.mjs';
import { openStore } from '../src/store.mjs';

test('admins use every feature and manage editors only; the owner alone grants admin access; role changes apply at once', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'vayora-admin-'));
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
  const join = async (owner, email, role) => {
    const invite = await send(owner, '/api/team/invites', 'POST', { email, ...(role ? { role } : {}) });
    const token = new URL(invite.data.url).searchParams.get('invite');
    return sessionOf(await send(null, '/api/auth/accept-invite', 'POST', { token, name: email.split('@')[0], password: password() }));
  };
  const users = async owner => (await send(owner, '/api/team')).data.users;
  try {
    const owner = sessionOf(await send(null, '/api/auth/setup', 'POST', { name: 'Owner', email: 'owner@example.test', password: password() }));
    assert.equal((await send(owner, '/api/team/invites', 'POST', { email: 'x@example.test', role: 'owner' })).status, 400, 'owner cannot be granted by invitation');
    const pending = await send(owner, '/api/team/invites', 'POST', { email: 'pending@example.test', role: 'admin' });
    assert.equal(pending.data.role, 'admin'); assert.deepEqual((await send(owner, '/api/team')).data.invites.map(i => i.role), ['admin']);
    const admin = await join(owner, 'admin2@example.test', 'admin'), editor = await join(owner, 'editor@example.test');
    const byEmail = async e => (await users(owner)).find(u => u.email === e);
    assert.deepEqual([(await byEmail('admin2@example.test')).role, (await byEmail('editor@example.test')).role], ['admin', 'editor']);

    // Features that were owner-only now work for an admin and still not for an editor.
    for (const [method, url, body] of [['POST', '/api/sanity/config', { dataset: 'production' }], ['POST', '/api/assistant/brand', { audience: 'Test audience' }], ['GET', '/api/team']]) {
      assert.equal((await send(admin, url, method, body)).status, 200, `admin may ${method} ${url}`);
      assert.equal((await send(editor, url, method, body)).status, 403, `editor may not ${method} ${url}`);
    }
    // Admin limits: editors only, and no admin invitations.
    assert.equal((await send(admin, '/api/team/invites', 'POST', { email: 'new@example.test', role: 'admin' })).status, 403);
    assert.equal((await send(admin, '/api/team/invites', 'POST', { email: 'new@example.test' })).status, 201);
    const adminInvite = (await send(owner, '/api/team')).data.invites.find(i => i.role === 'admin');
    assert.equal((await send(admin, '/api/team/invites/' + adminInvite.id, 'DELETE')).status, 403, 'an admin cannot cancel an admin invitation');
    const ownerId = (await byEmail('owner@example.test')).id, editorId = (await byEmail('editor@example.test')).id;
    assert.equal((await send(admin, '/api/team/' + ownerId, 'DELETE')).status, 403, 'an admin cannot remove the owner');
    assert.equal((await send(admin, '/api/team/' + editorId, 'PATCH', { role: 'admin' })).status, 403, 'only the owner changes roles');

    // Owner: promote and demote; the rules that protect the owner and avoid lock-outs.
    assert.equal((await send(editor, '/api/team')).status, 403);
    assert.equal((await send(owner, '/api/team/' + editorId, 'PATCH', { role: 'admin' })).status, 200);
    assert.equal((await send(editor, '/api/team')).status, 200, 'the promotion applies to the existing session at once');
    assert.equal((await send(owner, '/api/team/' + editorId, 'PATCH', { role: 'editor' })).status, 200);
    assert.equal((await send(editor, '/api/team')).status, 403, 'and so does the demotion');
    assert.equal((await send(owner, '/api/team/' + ownerId, 'PATCH', { role: 'editor' })).status, 409);
    assert.equal((await send(owner, '/api/team/' + editorId, 'PATCH', { role: 'superuser' })).status, 400);
    // An admin can remove an editor but not another admin; the owner can remove either.
    const third = await join(owner, 'admin3@example.test', 'admin'); assert.equal((await send(third, '/api/team')).status, 200);
    const thirdId = (await byEmail('admin3@example.test')).id, adminId = (await byEmail('admin2@example.test')).id;
    assert.equal((await send(admin, '/api/team/' + thirdId, 'DELETE')).status, 403, 'an admin cannot remove another admin');
    assert.equal((await send(admin, '/api/team/' + editorId, 'DELETE')).status, 200, 'but can remove an editor');
    assert.equal((await send(owner, '/api/team/' + adminId, 'DELETE')).status, 200, 'the owner can remove an admin');
    assert.equal((await send(admin, '/api/workspace')).status, 401, 'a removed admin session ends');
    assert.ok(runtime.store.get("SELECT id FROM events WHERE title='Team role changed'"), 'role changes are recorded');
  } finally { await new Promise(r => server.close(r)); runtime.close(); await rm(directory, { recursive: true, force: true }); }
});

test('a database created before roles existed gets the invitation role column without losing invitations', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'vayora-migrate-'));
  try {
    const old = new DatabaseSync(path.join(directory, 'studio.sqlite'));
    old.exec("CREATE TABLE invites(hash TEXT PRIMARY KEY,email TEXT NOT NULL,expires INTEGER NOT NULL,created_by TEXT NOT NULL,used INTEGER NOT NULL DEFAULT 0); INSERT INTO invites VALUES('h1','old@example.test',9999999999999,'u',0);"); old.close();
    const store = openStore(directory);
    assert.equal(store.get("SELECT role FROM invites WHERE hash='h1'").role, 'editor', 'existing invitations stay editor invitations');
    store.close(); openStore(directory).close(); // opening twice is fine
  } finally { await rm(directory, { recursive: true, force: true }); }
});
