// End-to-end: one Create post, several places. Pick Instagram + Facebook + TikTok + YouTube, upload a photo (YouTube is
// dropped), write a caption per place, check the staggered times and per-place approval, then save: three linked posts.
// Run: node tests/multi.browser.mjs
import { nextTestServer } from './next-server.mjs';
import { createRequire } from 'node:module';
import { mkdir, mkdtemp } from 'node:fs/promises';
import path from 'node:path';
import { randomBytes } from 'node:crypto';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import { createApp } from '../src/server.mjs';

const require = createRequire(import.meta.url);
const { chromium } = (() => { for (const p of [process.env.PLAYWRIGHT_PATH, 'playwright', path.join(process.env.LOCALAPPDATA || '', 'hermes/hermes-agent/node_modules/playwright')].filter(Boolean)) { try { return require(p); } catch { /* try the next location */ } } throw Error('Playwright not found: set PLAYWRIGHT_PATH'); })();
const root = path.resolve(import.meta.dirname, '..'), results = path.join(root, 'test-results');
await mkdir(results, { recursive: true });
const directory = await mkdtemp(path.join(results, 'multi-browser-'));
const runtime = createApp({ dataDir: directory, port: 3217, origin: 'http://localhost:3217', scheduler: false });
const server = await nextTestServer(runtime, 3217);
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const page = await (await browser.newContext({ viewport: { width: 1280, height: 1000 } })).newPage(), errors = [];
page.on('pageerror', error => errors.push(error.message));
const png = await sharp({ create: { width: 900, height: 900, channels: 3, background: '#FFF9E1' } }).png().toBuffer();
const choice = id => page.locator(`[data-create-platform="${id}"]`);
try {
  await page.goto('http://localhost:3217/#calendar');
  const password = 'Multi-' + randomBytes(16).toString('hex');
  await page.locator('#auth-name').fill('Multi Test'); await page.locator('#auth-email').fill('multi@example.test');
  await page.locator('#auth-password').fill(password); await page.locator('#auth-confirm').fill(password);
  await page.locator('#auth-submit').click(); await page.locator('#vs-title').waitFor();
  await page.goto('http://localhost:3217/create'); await choice('instagram').waitFor();

  // Several places can be ticked; the last one cannot be unticked.
  for (const id of ['facebook', 'tiktok', 'youtube']) await choice(id).click();
  for (const id of ['instagram', 'facebook', 'tiktok', 'youtube']) assert.equal(await choice(id).getAttribute('aria-pressed'), 'true', id + ' ticked');
  await choice('youtube').click(); assert.equal(await choice('youtube').getAttribute('aria-pressed'), 'false');
  await choice('youtube').click(); // back on, so the upload has to remove it

  // A photo cannot go to YouTube: it is dropped with a note, and the others stay.
  await page.locator('#create-files').setInputFiles({ name: 'villa.png', mimeType: 'image/png', buffer: png });
  await page.locator('#create-title').waitFor();
  assert.match(await page.locator('#create-post').innerText(), /YouTube Shorts was removed because these files do not fit there/);
  assert.equal(await choice('youtube').isDisabled(), true, 'YouTube is disabled for photos');
  assert.equal(await page.locator('[data-create-tab]').count(), 3, 'one text tab per place');
  assert.match(await page.locator('#create-post').innerText(), /Instagram: Photo \(1 image\) · Facebook: Facebook photo · TikTok: TikTok photo post/);

  // Text per place: the open tab edits only its own place.
  const text = { instagram: ['Villa siap tamu', 'Caption IG #vayora'], facebook: ['Villa FB', 'Caption Facebook yang lebih naratif'], tiktok: ['Villa TT', 'Caption TikTok singkat #fyp'] };
  for (const [p, [title, caption]] of Object.entries(text)) {
    await page.locator(`[data-create-tab="${p}"]`).click();
    await page.locator('#create-title').fill(title); await page.locator('#create-caption').fill(caption);
  }
  await page.locator('[data-create-tab="instagram"]').click();
  assert.equal(await page.locator('#create-caption').inputValue(), 'Caption IG #vayora', 'switching tabs keeps each text');
  assert.match(await page.locator('[data-action="create-submit"]').innerText(), /\(3 posts\)/);

  // Scheduling: staggered hourly, each place needs its own approval.
  await page.locator('[name="create-when"][value="scheduled"]').check();
  const times = await page.locator('[data-create-time]').evaluateAll(els => els.map(e => [e.dataset.createTime, e.value]));
  assert.deepEqual(times, [['instagram', '09:00'], ['facebook', '10:00'], ['tiktok', '11:00']], 'times are one hour apart');
  assert.equal(await page.locator('[data-action="create-submit"]').isDisabled(), true, 'nothing is approved yet');
  await page.locator('[data-create-approved="instagram"]').check(); await page.locator('[data-create-approved="facebook"]').check();
  assert.equal(await page.locator('[data-action="create-submit"]').isDisabled(), true, 'TikTok is still not approved');
  await page.locator('[data-create-approved="tiktok"]').check();
  assert.equal(await page.locator('[data-action="create-submit"]').isDisabled(), false);
  await page.screenshot({ path: path.join(results, 'multi-create.png'), fullPage: true });

  // Save as drafts: three linked posts, one per place.
  await page.locator('[name="create-when"][value="draft"]').check();
  await page.locator('[data-action="create-submit"]').click();
  await page.waitForURL(/\/library/);
  const posts = runtime.store.posts();
  assert.deepEqual(posts.map(p => [p.id, p.platform, p.format, p.status]).sort(), [['F01', 'facebook', 'Gambar', 'draft'], ['I01', 'instagram', 'Gambar', 'draft'], ['T01', 'tiktok', 'Gambar', 'draft']]);
  assert.equal(new Set(posts.map(p => p.group)).size, 1); assert.match(posts[0].group, /^G[a-f0-9]{4,12}$/, 'one shared group id');
  assert.deepEqual(posts.map(p => [p.platform, p.title, p.caption]).sort(), Object.entries(text).map(([p, [t, c]]) => [p, t, c]).sort(), 'each place got its own text');
  const card = page.locator('.vs-content-card').first(); await card.waitFor();
  assert.match(await card.innerText(), /Also on: .*F01.*T01|Also on: .*T01.*F01/, 'the card names the linked posts');
  if (errors.length) throw Error(errors.join('\n'));
  console.log('PASS multi-platform create: 4 places ticked → photo drops YouTube → text per place → staggered times with per-place approval → 3 linked drafts');
} catch (error) { console.error('FAIL', error); process.exitCode = 1; } finally { await browser.close(); await server.close?.(); runtime.close?.(); process.exit(process.exitCode || 0); }
