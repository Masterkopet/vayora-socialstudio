import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, mkdir, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import sharp from 'sharp';
import { openStore } from '../src/store.mjs';
import { createSanity } from '../src/sanity.mjs';
import { createBlog } from '../src/blog.mjs';
import { markdownToPortableText, portableTextToHtml, slugify } from '../src/client/portable-text.js';

const TOKEN = 'skAbCdEf0123456789AbCdEf0123456789ZZ';

async function fixture(fetchImpl) {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'vayora-sanity-'));
  const store = openStore(directory);
  const dir = path.join(directory, 'media'); await mkdir(dir, { recursive: true });
  const jpg = await sharp({ create: { width: 1672, height: 941, channels: 3, background: '#00285C' } }).jpeg().toBuffer();
  await writeFile(path.join(dir, 'hero.jpg'), jpg);
  store.run('INSERT INTO media(id,path,mime,name,size,width,height,duration,created_at) VALUES(?,?,?,?,?,?,?,?,?)', 'hero', 'hero.jpg', 'image/jpeg', 'sop.jpg', jpg.length, 1672, 941, null, new Date().toISOString());
  const calls = [];
  const sanity = createSanity(store, { fetch: async (url, init = {}) => { calls.push({ url: String(url), init }); return fetchImpl(String(url), init, calls); } });
  const blog = createBlog(store, sanity);
  return { store, sanity, blog, calls, async cleanup() { store.close(); await rm(directory, { recursive: true, force: true }); } };
}
const ok = (data) => Response.json(data);
const mutateOk = id => Response.json({ transactionId: 't', results: [{ id, operation: 'create' }] });
const connect = f => f.sanity.configure({ projectId: '5ugtuy3w', dataset: 'production', token: TOKEN });
const article = (over = {}) => ({ title: 'SOP Check-in dan Check-out Villa', excerpt: 'SOP check-in langkah demi langkah.', body: '### Langkah\n\nTulis **tebal** dan [tautan](https://vayora.id).\n\n- satu\n- dua', category: 'Operasional', heroMediaId: 'hero', heroAlt: 'Penjaga menyambut tamu', ...over });

test('markdown becomes blocks-only Portable Text like the vayora.id blog (h2/h3, lists, quotes, links, flattened tables)', () => {
  const { blocks, notes } = markdownToPortableText('# Judul\n\nPembuka **tebal**, *miring*, `kode` dan [tautan](https://vayora.id/x).\n\n### Bagian\n\n#### Sub\n\n1. Satu\n2. Dua\n   - bersarang\n\n> Kutipan\n\n| Aturan | Contoh |\n| --- | --- |\n| Jam check-in | 14.00 |\n\n![gambar](x.png)');
  assert.deepEqual(blocks.filter(b => b.style !== 'normal').map(b => b.style), ['h2', 'h3', 'h3', 'blockquote'], 'shallowest heading becomes h2, deeper ones h3');
  assert.deepEqual(markdownToPortableText('### A\n\ntext\n\n#### B').blocks.filter(x => x.style !== 'normal').map(x => x.style), ['h2', 'h3'], 'article sections written as ### become h2');
  const first = blocks.find(b => b.style === 'normal'), kinds = first.children.map(c => c.marks.join()).join('|');
  assert.match(kinds, /strong/); assert.match(kinds, /em/); assert.match(kinds, /code/);
  const linkSpan = first.children.find(c => c.marks.some(m => first.markDefs.some(d => d._key === m)));
  assert.equal(first.markDefs[0].href, 'https://vayora.id/x'); assert.equal(linkSpan.text, 'tautan');
  assert.deepEqual(blocks.filter(b => b.listItem).map(b => b.listItem + b.level), ['number1', 'number1', 'bullet2', 'bullet1']);
  assert.match(blocks.at(-1).children.map(c => c.text).join(''), /Jam check-in: 14\.00/); assert.equal(notes.tablesFlattened, 1); assert.equal(notes.imagesSkipped, 1);
  assert.ok(blocks.every(b => b._type === 'block'), 'only blocks, as the site schema expects');
  const keys = blocks.flatMap(b => [b._key, ...b.children.map(c => c._key), ...b.markDefs.map(d => d._key)]); assert.equal(new Set(keys).size, keys.length, 'keys are unique');
  assert.deepEqual(markdownToPortableText('a\n\nb', { keyPrefix: 'x' }).blocks, markdownToPortableText('a\n\nb', { keyPrefix: 'x' }).blocks, 'deterministic');
  assert.ok(!portableTextToHtml(markdownToPortableText('<script>alert(1)</script> [x](javascript:alert(1))').blocks).includes('<script>'), 'preview HTML is escaped');
  assert.ok(!portableTextToHtml(markdownToPortableText('[x](javascript:alert(1))').blocks).includes('href='), 'only http(s) links in the preview');
  assert.equal(slugify('SOP Check-in & Check-out Villa'), 'sop-check-in-dan-check-out-villa');
});

test('Sanity config validates input, keeps the token encrypted, and never exposes it', async () => {
  const f = await fixture(async () => { throw Error('no network'); });
  try {
    assert.equal(f.sanity.status().configured, false);
    assert.throws(() => f.sanity.configure({ projectId: 'BAD ID!' }), /Project ID/);
    assert.throws(() => f.sanity.configure({ token: 'password123' }), /Sanity token/);
    assert.throws(() => f.sanity.configure({ publishMode: 'live' }), /published or draft/);
    assert.throws(() => f.sanity.configure({ extraFields: '{bad' }), /JSON/);
    assert.throws(() => f.sanity.configure({ extraFields: { _id: 'x' } }), /_id/);
    assert.throws(() => f.sanity.configure({ siteUrl: 'http://vayora.id' }), /https/);
    const s = connect(f);
    assert.equal(s.configured, true); assert.equal(s.tokenSet, true);
    assert.ok(!JSON.stringify(s).includes(TOKEN), 'status never contains the token');
    assert.ok(!f.store.get("SELECT value FROM settings WHERE key='sanity.config'").value.includes('AbCdEf'), 'token is stored encrypted');
    assert.equal(f.sanity.configure({ removeToken: true }).configured, false);
  } finally { await f.cleanup(); }
});

test('check() reads the real article shape, authors and categories', async () => {
  const f = await fixture(async (url) => {
    const q = decodeURIComponent(url);
    if (q.includes('count(')) return ok({ result: 7 });
    if (q.includes('order(_createdAt')) return ok({ result: { _id: 'x', title: 'T', slug: { _type: 'slug', current: 's' }, excerpt: 'e', mainImage: { _type: 'image' }, publishedAt: '2026-11-24', body: null } });
    if (q.includes('"author"')) return ok({ result: [{ _id: 'K4ir9p', name: 'Tim Vayora' }] });
    return ok({ result: [{ _id: 'cat1', title: 'Operasional' }] });
  });
  try {
    connect(f);
    const r = await f.sanity.check();
    assert.equal(r.count, 7); assert.deepEqual(r.authors, [{ id: 'K4ir9p', name: 'Tim Vayora' }]); assert.equal(r.categories[0].title, 'Operasional');
    assert.ok(r.fields.some(x => x.name === 'mainImage' && x.type === 'image') && r.fields.some(x => x.name === 'slug' && x.type === 'slug'));
    assert.deepEqual(r.missing.sort(), ['author', 'categories', 'seoDescription', 'seoTitle'].sort(), 'configured fields the sample lacks are reported');
    assert.ok(f.calls.every(c => c.init.headers.Authorization === 'Bearer ' + TOKEN) && f.calls.every(c => c.url.startsWith('https://5ugtuy3w.api.sanity.io/v2025-02-19/')));
  } finally { await f.cleanup(); }
});

test('publishing uploads the image once, writes the exact schema, and a retry replaces instead of duplicating', async () => {
  const f = await fixture(async (url, init) => {
    if (url.includes('/assets/images/')) { assert.equal(init.headers['Content-Type'], 'image/jpeg'); return ok({ document: { _id: 'image-abc-1672x941-jpg' } }); }
    if (url.includes('/data/query/')) return ok({ result: decodeURIComponent(url).includes('lower(title)') ? 'cat1' : null });
    const doc = JSON.parse(init.body).mutations[0].createOrReplace;
    return mutateOk(doc._id);
  });
  try {
    connect(f); f.sanity.configure({ authorId: 'K4ir9p' });
    const a = f.blog.create(article());
    assert.equal(a.id, 'B01'); assert.equal(a.slug, 'sop-check-in-dan-check-out-villa');
    const done = await f.blog.run('B01');
    assert.equal(done.status, 'published'); assert.equal(done.url, 'https://vayora.id/blog/sop-check-in-dan-check-out-villa'); assert.equal(done.sanityId, 'vayora-b01');
    const mutate = f.calls.find(c => c.url.includes('/data/mutate/'));
    const doc = JSON.parse(mutate.init.body).mutations[0].createOrReplace;
    assert.equal(doc._type, 'post'); assert.equal(doc._id, 'vayora-b01', 'stable id, not a drafts. id');
    assert.deepEqual(doc.slug, { _type: 'slug', current: 'sop-check-in-dan-check-out-villa' });
    assert.deepEqual(doc.mainImage, { _type: 'image', alt: 'Penjaga menyambut tamu', asset: { _type: 'reference', _ref: 'image-abc-1672x941-jpg' } });
    assert.deepEqual(doc.author, { _type: 'reference', _ref: 'K4ir9p' }); assert.equal(doc.categories[0]._ref, 'cat1');
    assert.equal(doc.excerpt, 'SOP check-in langkah demi langkah.'); assert.equal(doc.seoDescription, doc.excerpt, 'meta description defaults to the excerpt');
    assert.ok(doc.body.every(b => b._type === 'block') && doc.body[0].style === 'h2'); assert.ok(Date.parse(doc.publishedAt));
    // Edit and send again: same document id, hero image not uploaded twice.
    const again = f.blog.update('B01', { ...article({ title: 'SOP Check-in Villa (Revisi)' }), slug: done.slug, intent: 'published', revision: done.revision });
    assert.equal(again.status, 'published');
    await f.blog.run('B01');
    assert.equal(f.calls.filter(c => c.url.includes('/assets/images/')).length, 1, 'image uploaded only once');
    const ids = f.calls.filter(c => c.url.includes('/data/mutate/')).map(c => JSON.parse(c.init.body).mutations[0].createOrReplace._id); assert.deepEqual(ids, ['vayora-b01', 'vayora-b01']);
  } finally { await f.cleanup(); }
});

test('draft mode writes a drafts. document; missing pieces and Sanity errors are readable and retryable', async () => {
  let reply = () => Response.json({ error: { description: 'Insufficient permissions' } }, { status: 403 });
  const f = await fixture(async (url, init) => {
    if (url.includes('/assets/images/')) return ok({ document: { _id: 'image-1' } });
    if (url.includes('/data/query/')) return ok({ result: null });
    return reply(url, init);
  });
  try {
    connect(f); f.sanity.configure({ publishMode: 'draft' });
    f.blog.create(article({ heroMediaId: null }));
    await assert.rejects(() => f.blog.run('B01'), /No featured image chosen/);
    f.blog.update('B01', { ...article(), slug: 'sop', intent: 'draft', revision: 1 });
    await assert.rejects(() => f.blog.run('B01'), e => /permission/.test(e.message) && !e.message.includes(TOKEN));
    assert.equal(f.blog.get('B01').status, 'failed'); assert.match(f.blog.get('B01').error, /permission/);
    reply = (url, init) => mutateOk(JSON.parse(init.body).mutations[0].createOrReplace._id);
    const done = await f.blog.run('B01');
    assert.equal(done.status, 'published'); assert.equal(done.sanityId, 'drafts.vayora-b01'); assert.equal(done.sanityDraft, true);
    assert.equal(done.categoryMissing, true, 'category title not found in Sanity is flagged, not guessed');
    assert.throws(() => f.blog.create(article({ slug: 'sop' })), /already used/);
    assert.throws(() => f.blog.create({ title: 'x', slug: 'Slug Salah!' }), /Slug may only contain/);
  } finally { await f.cleanup(); }
});

test('scheduling needs approval and a complete article; the scheduler publishes due articles and fails overdue ones', async () => {
  const f = await fixture(async (url, init) => url.includes('/assets/images/') ? ok({ document: { _id: 'image-1' } }) : url.includes('/data/query/') ? ok({ result: null }) : mutateOk(JSON.parse(init.body).mutations[0].createOrReplace._id));
  try {
    connect(f);
    const a = f.blog.create(article()), b = f.blog.create(article({ title: 'Artikel kedua' }));
    const day = new Date(Date.now() + 2 * 86400000).toISOString().slice(0, 10);
    const base = { ...article(), slug: a.slug, intent: 'scheduled', date: day, time: '07:00', revision: 1 };
    assert.throws(() => f.blog.update('B01', { ...base, approved: false }), /approve it/);
    assert.throws(() => f.blog.update('B01', { ...base, approved: true, date: '2020-01-01' }), /30 seconds/);
    assert.throws(() => f.blog.update('B01', { ...base, approved: true, excerpt: '' }), /summary/);
    const s = f.blog.update('B01', { ...base, approved: true });
    assert.equal(s.status, 'scheduled'); assert.equal(s.scheduleAt, new Date(`${day}T07:00:00+07:00`).toISOString());
    assert.throws(() => f.blog.update('B01', { ...base, approved: true, revision: 1 }), /another session/, 'stale revision is refused');
    await f.blog.tickDue(Date.now()); assert.equal(f.blog.get('B01').status, 'scheduled', 'not due yet');
    await f.blog.tickDue(Date.parse(s.scheduleAt) + 1000);
    assert.equal(f.blog.get('B01').status, 'published'); assert.equal(f.blog.get('B01').publishedAt, s.scheduleAt, 'publishedAt is the scheduled time');
    const c = f.blog.update('B02', { ...article({ title: 'Artikel kedua' }), slug: b.slug, intent: 'scheduled', approved: true, date: day, time: '08:00', revision: 1 });
    await f.blog.tickDue(Date.parse(c.scheduleAt) + 10 * 60000);
    assert.equal(f.blog.get('B02').status, 'failed'); assert.equal(f.blog.get('B02').errorCode, 'OVERDUE');
    f.blog.remove('B02'); assert.equal(f.blog.list().length, 1);
  } finally { await f.cleanup(); }
});

import http from 'node:http';
import { randomBytes } from 'node:crypto';
import { createApp } from '../src/server.mjs';

test('routes: the token stays owner-only and out of every response; publishing needs Sanity, live mode and approval', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'vayora-sanity-http-'));
  const calls = [];
  const runtime = createApp({ dataDir: directory, scheduler: false, origin: 'http://localhost:3210', sanity: { fetch: async (url, init = {}) => { calls.push(String(url)); return String(url).includes('/data/query/') ? ok({ result: 3 }) : mutateOk('vayora-b01'); } } });
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
    const cfg = await request('/api/sanity/config', 'POST', { projectId: '5ugtuy3w', dataset: 'production', token: TOKEN });
    assert.equal(cfg.status, 200); assert.ok(!JSON.stringify(cfg.data).includes(TOKEN));
    const ws = await request('/api/workspace'); assert.equal(ws.data.sanity.configured, true); assert.ok(!JSON.stringify(ws.data).includes(TOKEN), 'the workspace never carries the token');
    const created = await request('/api/blog', 'POST', { title: 'Artikel uji', excerpt: 'Ringkasan.', body: 'Isi.', heroAlt: 'alt' });
    assert.equal(created.status, 201); assert.equal(created.data.id, 'B01');
    assert.equal((await request('/api/blog')).data.articles.length, 1); assert.equal((await request('/api/workspace')).data.blog.length, 1);
    assert.equal((await request('/api/blog/B01/publish', 'POST', { approved: true })).status, 409, 'real publishing must be on');
    runtime.store.set('publishingEnabled', true);
    assert.equal((await request('/api/blog/B01/publish', 'POST', { approved: false })).status, 400, 'approval is required');
    const noImage = await request('/api/blog/B01/publish', 'POST', { approved: true });
    assert.equal(noImage.status, 400); assert.match(noImage.data.error, /featured image/i);
    assert.ok(!calls.some(u => u.includes('/data/mutate/')), 'nothing was sent to Sanity');
    assert.equal((await request('/api/sanity/check', 'POST', {})).status, 200);
    assert.equal((await request('/api/blog/NOPE')).status, 404);
    assert.equal((await request('/api/blog/B01', 'DELETE')).status, 200); assert.equal((await request('/api/blog')).data.articles.length, 0);
  } finally { await new Promise(r => server.close(r)); runtime.close(); await rm(directory, { recursive: true, force: true }); }
});

import { portableTextToMarkdown } from '../src/client/portable-text.js';

const live = (id, slug, extra = {}) => ({ _id: id, title: 'Artikel ' + slug, slug, excerpt: 'Ringkasan ' + slug, publishedAt: '2026-11-20T01:00:00Z', seoTitle: 'SEO ' + slug, seoDescription: 'Desc', imageRef: 'image-abc123-1672x941-png', imageAlt: 'Alt', categoryTitles: ['Operasional'], body: [{ _key: 'a', _type: 'block', style: 'normal', markDefs: [], children: [{ _key: 'b', _type: 'span', marks: [], text: 'Pembuka.' }] }, { _key: 'c', _type: 'block', style: 'h2', markDefs: [], children: [{ _key: 'd', _type: 'span', marks: [], text: 'Bagian' }] }], ...extra });

test('Portable Text converts back to Markdown (and survives a round trip) without losing structure', () => {
  const md = '### Bagian\n\nTeks **tebal**, *miring* dan [tautan](https://vayora.id/x).\n\n1. Satu\n2. Dua\n\n- a\n  - b\n\n> Kutipan\n\n#### Sub';
  const { markdown, notes } = portableTextToMarkdown(markdownToPortableText(md).blocks);
  assert.equal(markdown, md); assert.equal(notes.skipped, 0);
  assert.equal(portableTextToMarkdown([{ _type: 'image' }, ...markdownToPortableText('Halo').blocks]).notes.skipped, 1, 'unsupported blocks are counted, not crashed on');
  assert.equal(portableTextToMarkdown([{ _type: 'block', style: 'h2', markDefs: [], children: [{ _type: 'span', marks: [], text: 'Judul' }] }]).markdown, '### Judul');
});

test('articles already published in Sanity are read into the studio, edited there and sent back in place', async () => {
  let posts = [live('doc-1', 'artikel-satu'), live('doc-2', 'artikel-dua')];
  const mutations = []; let withToken = false;
  const f = await fixture(async (url, init = {}) => {
    if (url.includes('/data/query/')) { if (!withToken) assert.ok(!init.headers.Authorization, 'reads work without a token'); return ok({ result: decodeURIComponent(url).includes('lower(title)') ? null : posts }); }
    mutations.push(JSON.parse(init.body).mutations[0]); return mutateOk('doc-1');
  });
  try {
    const first = await f.blog.sync({ force: true });
    assert.deepEqual([first.added, first.total], [2, 2]);
    const a = f.blog.get('B01');
    assert.equal(a.status, 'published'); assert.equal(a.source, 'sanity'); assert.equal(a.sanityId, 'doc-1'); assert.equal(a.url, 'https://vayora.id/blog/artikel-satu');
    assert.equal(a.body, 'Pembuka.\n\n### Bagian'); assert.equal(a.category, 'Operasional'); assert.equal(a.hero.url, 'https://cdn.sanity.io/images/5ugtuy3w/production/abc123-1672x941.png');
    assert.equal((await f.blog.sync({ force: true })).added, 0, 'a second sync adds nothing');
    assert.equal((await f.blog.sync()).throttled, true, 'rapid syncs are throttled');

    // A change made in Sanity flows in until the article is edited here.
    posts = [live('doc-1', 'artikel-satu', { title: 'Judul baru dari Sanity' }), posts[1]];
    assert.equal((await f.blog.sync({ force: true })).updated, 1); assert.equal(f.blog.get('B01').title, 'Judul baru dari Sanity');
    const edited = f.blog.update('B01', { title: 'Judul saya', slug: 'diubah-paksa', excerpt: 'R', body: 'Isi baru.', heroAlt: 'Alt', intent: 'published', revision: f.blog.get('B01').revision });
    assert.equal(edited.slug, 'artikel-satu', 'the address of a live article cannot change');
    posts = [live('doc-1', 'artikel-satu', { title: 'Sanity lagi' }), posts[1]];
    await f.blog.sync({ force: true }); assert.equal(f.blog.get('B01').title, 'Judul saya', 'local edits are not overwritten');

    connect(f); withToken = true;
    // Sending it back patches the same document: author and other fields Sanity holds are untouched, the image is reused.
    const done = await f.blog.run('B01');
    assert.equal(done.status, 'published'); assert.equal(mutations.length, 1);
    const m = mutations[0]; assert.ok(m.patch && !m.createOrReplace, 'patch in place, not a replace');
    assert.equal(m.patch.id, 'doc-1'); assert.ok(!('author' in m.patch.set) && !('_id' in m.patch.set) && !('_type' in m.patch.set));
    assert.equal(m.patch.set.title, 'Judul saya'); assert.deepEqual(m.patch.set.mainImage.asset, { _type: 'reference', _ref: 'image-abc123-1672x941-png' });
    assert.equal(f.calls.filter(c => c.url.includes('/assets/images/')).length, 0, 'no re-upload of the existing image');

    // Removing it here does not bring it back on the next sync.
    f.blog.remove('B02'); await f.blog.sync({ force: true });
    assert.deepEqual(f.blog.list().map(x => x.sanityId), ['doc-1']);
  } finally { await f.cleanup(); }
});
