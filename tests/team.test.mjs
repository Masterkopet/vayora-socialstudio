import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { randomBytes } from 'node:crypto';
import { createApp } from '../src/server.mjs';

test('owner sees members and pending invites, can cancel invites and remove members (never themselves or the last owner)', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'vayora-team-'));
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
  try {
    const owner = sessionOf(await send(null, '/api/auth/setup', 'POST', { name: 'Pemilik', email: 'owner@example.test', password: 'Test-' + randomBytes(12).toString('hex') }));
    const invite = await send(owner, '/api/team/invites', 'POST', { email: 'editor@example.test' });
    const token = new URL(invite.data.url).searchParams.get('invite');
    let team = (await send(owner, '/api/team')).data;
    assert.equal(team.users.length, 1); assert.deepEqual(team.invites.map(i => i.email), ['editor@example.test']);
    assert.ok(!JSON.stringify(team).includes(token), 'the invite token never leaves the server');
    assert.match(team.invites[0].id, /^[a-f0-9]{16}$/);

    // A cancelled invite no longer works.
    team = (await send(owner, '/api/team/invites/' + team.invites[0].id, 'DELETE')).data; assert.equal(team.invites.length, 0);
    assert.equal((await send(null, '/api/auth/accept-invite', 'POST', { token, name: 'Editor', password: 'Edit-' + randomBytes(12).toString('hex') })).status, 400);
    assert.equal((await send(owner, '/api/team/invites/' + 'a'.repeat(16), 'DELETE')).status, 404);

    // Invite again, accept, and check the editor cannot manage the team.
    const second = new URL((await send(owner, '/api/team/invites', 'POST', { email: 'editor@example.test' })).data.url).searchParams.get('invite');
    const editorRes = await send(null, '/api/auth/accept-invite', 'POST', { token: second, name: 'Editor', password: 'Edit-' + randomBytes(12).toString('hex') });
    assert.equal(editorRes.status, 201); const editor = sessionOf(editorRes);
    assert.equal((await send(editor, '/api/team')).status, 403); assert.equal((await send(editor, '/api/team/xyz', 'DELETE')).status, 403);
    team = (await send(owner, '/api/team')).data; assert.equal(team.users.length, 2); assert.equal(team.invites.length, 0, 'accepted invites are not pending');
    const ownerUser = team.users.find(u => u.role === 'owner'), editorUser = team.users.find(u => u.role === 'editor');

    assert.equal((await send(owner, '/api/team/' + ownerUser.id, 'DELETE')).status, 409, 'cannot remove yourself');
    assert.equal((await send(owner, '/api/team/nope', 'DELETE')).status, 404);
    assert.equal((await send(editor, '/api/workspace')).status, 200, 'the editor is signed in');
    const after = await send(owner, '/api/team/' + editorUser.id, 'DELETE');
    assert.equal(after.status, 200); assert.deepEqual(after.data.users.map(u => u.role), ['owner']);
    assert.equal((await send(editor, '/api/workspace')).status, 401, "the removed member's session ends at once");
    assert.ok(runtime.store.get("SELECT id FROM events WHERE title='Anggota tim dihapus' AND detail LIKE '%editor@example.test%'"), 'removal is recorded in the history');
    // The same email can be invited again afterwards.
    assert.equal((await send(owner, '/api/team/invites', 'POST', { email: 'editor@example.test' })).status, 201);
  } finally { await new Promise(r => server.close(r)); runtime.close(); await rm(directory, { recursive: true, force: true }); }
});
