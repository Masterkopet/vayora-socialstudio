// End-to-end: Import content → Google Drive. A fake Google serves a Drive folder with a Word article and a photo; the picker
// lists it, the article is read in the browser, the photo is fetched by the server when the import runs.
// Run: node tests/drive.browser.mjs [path-to-docx]
import { nextTestServer } from './next-server.mjs';
import { createRequire } from 'node:module';
import { mkdir, mkdtemp, readFile } from 'node:fs/promises';
import path from 'node:path';
import { randomBytes } from 'node:crypto';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import { createApp } from '../src/server.mjs';

const require = createRequire(import.meta.url);
const { chromium } = (() => { for (const p of [process.env.PLAYWRIGHT_PATH, 'playwright', path.join(process.env.LOCALAPPDATA || '', 'hermes/hermes-agent/node_modules/playwright')].filter(Boolean)) { try { return require(p); } catch { /* try the next location */ } } throw Error('Playwright not found: set PLAYWRIGHT_PATH'); })();
const root = path.resolve(import.meta.dirname, '..'), results = path.join(root, 'test-results');
const docxPath = process.argv[2] || 'E:/Work/VAYORA/VAYORA-BLOG/docx/01-harga-villa.docx';
const docx = await readFile(docxPath), png = await sharp({ create: { width: 900, height: 900, channels: 3, background: '#FFF9E1' } }).png().toBuffer();
const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
const tree = {
  root: [{ id: 'folderBatch01', name: 'Batch Blog', mimeType: 'application/vnd.google-apps.folder' }],
  folderBatch01: [{ id: 'docxArtikel01', name: '01-harga-villa.docx', mimeType: DOCX_MIME, size: String(docx.length) }, { id: 'photoVilla001', name: 'villa-front.png', mimeType: 'image/png', size: String(png.length) }],
};
const fakeGoogle = async (url, init = {}) => {
  const u = new URL(url);
  if (u.href === 'https://oauth2.googleapis.com/token') return Response.json({ access_token: 'ya29.fixture', refresh_token: '1//fixture', expires_in: 3599 });
  if (u.pathname === '/drive/v3/files' && u.searchParams.get('q')) return Response.json({ files: tree[u.searchParams.get('q').match(/^'([^']+)' in parents/)?.[1]] || [] });
  const id = u.pathname.split('/')[4], f = Object.values(tree).flat().find(x => x.id === id);
  if (u.searchParams.get('alt') === 'media') return new Response(id === 'docxArtikel01' ? docx : png);
  return f ? Response.json(f) : new Response('{}', { status: 404 });
};
await mkdir(results, { recursive: true });
const directory = await mkdtemp(path.join(results, 'drive-browser-'));
const runtime = createApp({ dataDir: directory, port: 3215, origin: 'http://localhost:3215', scheduler: false, drive: { fetch: fakeGoogle } });
runtime.store.setSecret('youtube.config', { clientId: '123456789-abcdef.apps.googleusercontent.com', clientSecret: 'client-secret-fixture' });
const server = await nextTestServer(runtime, 3215);
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const page = await (await browser.newContext({ viewport: { width: 1280, height: 1000 } })).newPage(), errors = [];
page.on('pageerror', error => errors.push(error.message));
try {
  await page.goto('http://localhost:3215/#calendar');
  const password = 'Drive-' + randomBytes(16).toString('hex');
  await page.locator('#auth-name').fill('Drive Test'); await page.locator('#auth-email').fill('drive-test@example.test');
  await page.locator('#auth-password').fill(password); await page.locator('#auth-confirm').fill(password);
  await page.locator('#auth-submit').click(); await page.locator('#vs-title').waitFor();
  runtime.store.setSecret('drive.connection', { refreshToken: '1//fixture', accessToken: 'ya29.fixture', expiresAt: Date.now() + 3600000, email: 'studio@example.test', invalid: false });
  await page.goto('http://localhost:3215/import'); await page.locator('#pkg-page').waitFor();

  await page.locator('[data-action="pkg-drive-open"]').click();
  await page.locator('#pkg-drive').waitFor();
  assert.match(await page.locator('#pkg-drive').innerText(), /studio@example\.test/, 'shows the connected account');
  await page.locator('[data-pkg-drive-pick="folderBatch01"]').check();
  await page.screenshot({ path: path.join(results, 'drive-picker.png'), fullPage: true });
  await page.locator('[data-action="pkg-drive-use"]').click();

  // The article is read in the browser (Blog row); the photo is a placeholder that Drive still holds.
  await page.locator('.vs-pkg-table tbody tr').nth(1).waitFor({ timeout: 30000 });
  const rows = await page.locator('.vs-pkg-table tbody tr').allInnerTexts();
  assert.equal(rows.length, 2, 'article + photo: ' + JSON.stringify(rows));
  assert.ok(rows.some(r => /Blog/.test(r)), 'the Word article from Drive is a Blog item');
  assert.ok(rows.some(r => /Instagram/.test(r) && /villa-front\.png/.test(r)), 'the photo is an Instagram item');
  await page.locator('[name="pkg-mode"][value="draft"]').check();
  await page.locator('[data-action="pkg-run"]').click();
  await page.locator('.vs-pkg-table .vs-status.scheduled', { hasText: /B01/ }).waitFor({ timeout: 60000 });
  await page.locator('.vs-pkg-table .vs-status.scheduled', { hasText: /I01/ }).waitFor({ timeout: 60000 });
  const workspace = await page.evaluate(async () => (await fetch('/api/workspace')).json());
  const post = workspace.posts.find(p => p.format === 'Gambar');
  assert.ok(post && post.mediaIds.length === 1 && post.status === 'draft', 'the photo was fetched from Drive by the server and saved on a draft post');
  const articles = await page.evaluate(async () => (await fetch('/api/blog')).json());
  assert.equal((articles.articles || articles).length, 1, 'the article from Drive became a Blog draft');
  if (errors.length) throw Error(errors.join('\n'));
  console.log('PASS drive import: folder picked in the Drive panel → Word article read in the browser (Blog draft) and photo fetched by the server (Instagram draft)');
} catch (error) { console.error('FAIL', error); process.exitCode = 1; } finally { await browser.close(); await server.close?.(); runtime.close?.(); process.exit(process.exitCode || 0); }
