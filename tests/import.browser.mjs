// End-to-end: Import content detects the type by itself. A Word article becomes a Blog draft that is really saved;
// a video offers Instagram and/or YouTube Shorts. Run: node tests/import.browser.mjs [path-to-docx]
import { nextTestServer } from './next-server.mjs';
import { createRequire } from 'node:module';
import { mkdir, mkdtemp } from 'node:fs/promises';
import path from 'node:path';
import { randomBytes } from 'node:crypto';
import assert from 'node:assert/strict';
import { createApp } from '../src/server.mjs';

const require = createRequire(import.meta.url);
const { chromium } = (() => { for (const p of [process.env.PLAYWRIGHT_PATH, 'playwright', path.join(process.env.LOCALAPPDATA || '', 'hermes/hermes-agent/node_modules/playwright')].filter(Boolean)) { try { return require(p); } catch { /* try the next location */ } } throw Error('Playwright not found: set PLAYWRIGHT_PATH'); })();
const root = path.resolve(import.meta.dirname, '..'), results = path.join(root, 'test-results');
const docx = process.argv[2] || 'E:/Work/VAYORA/VAYORA-BLOG/docx/01-harga-villa.docx';
await mkdir(results, { recursive: true });
const directory = await mkdtemp(path.join(results, 'import-browser-'));
const runtime = createApp({ dataDir: directory, port: 3214, origin: 'http://localhost:3214', scheduler: false });
const server = await nextTestServer(runtime, 3214);
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const page = await (await browser.newContext({ viewport: { width: 1280, height: 1000 } })).newPage(), errors = [];
page.on('pageerror', error => errors.push(error.message));
try {
  await page.goto('http://localhost:3214/#calendar');
  const password = 'Import-' + randomBytes(16).toString('hex');
  await page.locator('#auth-name').fill('Import Test'); await page.locator('#auth-email').fill('import-test@example.test');
  await page.locator('#auth-password').fill(password); await page.locator('#auth-confirm').fill(password);
  await page.locator('#auth-submit').click(); await page.locator('#vs-title').waitFor();
  await page.goto('http://localhost:3214/import'); await page.locator('#pkg-page').waitFor();
  assert.equal(await page.locator('[data-pkg-type]').count(), 0, 'no type chooser any more');

  // 1. A Word article is recognised as a Blog article.
  await page.locator('#pkg-files').setInputFiles(docx);
  await page.locator('.vs-pkg-table tbody tr').first().waitFor();
  const row = page.locator('.vs-pkg-table tbody tr').first();
  assert.match(await row.innerText(), /Blog/, 'the article is detected as Blog');
  assert.equal(await row.locator('[data-pkg-target]').count(), 0, 'articles have no Instagram/YouTube choice');
  const title = await row.locator('[data-pkg-title]').inputValue();
  assert.ok(title.length > 5, 'title filled from the document: ' + title);
  // Without a main image an article cannot be scheduled (the page says so); as a draft it is ready.
  assert.match(await row.locator('td').nth(5).innerText(), /no main image/i, 'scheduling needs a main image');
  await page.locator('[name="pkg-mode"][value="draft"]').check();
  assert.match(await page.locator('.vs-pkg-table tbody tr').first().locator('td').nth(5).innerText(), /Ready/, 'ready as a draft');
  await page.screenshot({ path: path.join(results, 'import-docx-preview.png'), fullPage: true });

  // 2. Run as a draft and check what was really saved.
  await page.locator('[data-action="pkg-run"]').click();
  await page.locator('.vs-pkg-table .vs-status.scheduled', { hasText: /draft/ }).waitFor({ timeout: 30000 });
  const articles = await page.evaluate(async () => (await fetch('/api/blog')).json());
  const list = articles.articles || articles;
  assert.equal(list.length, 1, 'one article saved');
  const saved = await page.evaluate(async id => (await fetch('/api/blog/' + id)).json(), list[0].id);
  assert.equal(saved.title, title); assert.ok(saved.slug && saved.excerpt, 'slug and excerpt filled'); assert.ok(JSON.stringify(saved.body).length > 500, 'article body saved');
  assert.equal(saved.status, 'draft');
  assert.match(await page.locator('.vs-pkg-table tbody tr').first().innerText(), /B01 · draft/, 'status names the saved article');
  await page.screenshot({ path: path.join(results, 'import-docx-done.png'), fullPage: true });

  // 3. A video offers Instagram and YouTube Shorts; the user can keep one or both.
  await page.locator('[data-action="pkg-reset"]').click();
  await page.locator('#pkg-files').setInputFiles({ name: 'villa-tour.mp4', mimeType: 'video/mp4', buffer: Buffer.from('not a real video') });
  await page.locator('.vs-pkg-table tbody tr').first().waitFor();
  assert.equal(await page.locator('.vs-pkg-table tbody tr').count(), 2, 'a video becomes an Instagram and a YouTube item');
  await page.locator('[data-pkg-target="youtube"]').first().uncheck();
  assert.equal(await page.locator('.vs-pkg-table tbody tr').count(), 1, 'only Instagram left');
  assert.match(await page.locator('.vs-pkg-table tbody tr').first().innerText(), /Instagram/);
  await page.locator('[data-pkg-target="instagram"]').first().uncheck();
  assert.match(await page.locator('.vs-pkg-table tbody tr').first().innerText(), /Choose Instagram or YouTube Short/, 'none chosen is flagged');
  await page.locator('[data-pkg-target="youtube"]').first().check();
  assert.match(await page.locator('.vs-pkg-table tbody tr').first().innerText(), /YouTube/);

  // 4. A photo goes to Instagram at first and can also go to Facebook or TikTok (never YouTube).
  await page.locator('[data-action="pkg-reset"]').click();
  await page.locator('#pkg-files').setInputFiles({ name: 'villa-front.jpg', mimeType: 'image/jpeg', buffer: Buffer.from('jpg') });
  await page.locator('.vs-pkg-table tbody tr').first().waitFor();
  assert.deepEqual(await page.locator('[data-pkg-target]').evaluateAll(els => els.map(e => e.dataset.pkgTarget)), ['instagram', 'facebook', 'tiktok'], 'photos offer Instagram, Facebook and TikTok');
  assert.equal(await page.locator('.vs-pkg-table tbody tr').count(), 1, 'only Instagram is ticked at first');
  assert.match(await page.locator('.vs-pkg-table tbody tr').first().innerText(), /Instagram/);
  if (errors.length) throw Error(errors.join('\n'));
  console.log('PASS import: docx → Blog draft saved with title, slug, excerpt and body; video → Instagram/YouTube choice (one, both, none flagged); photo → Instagram, with Facebook/TikTok available');
} catch (error) { console.error("FAIL", error); process.exitCode = 1; } finally { await browser.close(); await server.close?.(); runtime.close?.(); process.exit(process.exitCode || 0); }
