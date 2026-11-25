// End-to-end: Facebook and TikTok in the UI. Settings tabs and forms, Create post to TikTok (saved as a T-code draft in the
// TikTok library), and the destinations offered on the Import page. Run: node tests/channels.browser.mjs
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
const directory = await mkdtemp(path.join(results, 'channels-browser-'));
const runtime = createApp({ dataDir: directory, port: 3216, origin: 'http://localhost:3216', scheduler: false });
runtime.store.setSecret('instagram.config', { publicBase: 'https://studio.example.test' });
const server = await nextTestServer(runtime, 3216);
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const page = await (await browser.newContext({ viewport: { width: 1280, height: 1000 } })).newPage(), errors = [];
page.on('pageerror', error => errors.push(error.message));
const png = await sharp({ create: { width: 900, height: 900, channels: 3, background: '#FFF9E1' } }).png().toBuffer();
try {
  await page.goto('http://localhost:3216/#calendar');
  const password = 'Channels-' + randomBytes(16).toString('hex');
  await page.locator('#auth-name').fill('Channel Test'); await page.locator('#auth-email').fill('channels@example.test');
  await page.locator('#auth-password').fill(password); await page.locator('#auth-confirm').fill(password);
  await page.locator('#auth-submit').click(); await page.locator('#vs-title').waitFor();

  // Settings: Facebook and TikTok tabs.
  await page.goto('http://localhost:3216/settings'); await page.locator('#tab-settings-facebook').waitFor();
  await page.locator('#tab-settings-facebook').click();
  assert.ok(await page.locator('#fb-token-form').isVisible(), 'Facebook token form');
  await page.locator('#tab-settings-tiktok').click();
  assert.ok(await page.locator('#tt-config-form').isVisible(), 'TikTok app form');
  assert.equal(await page.locator('#tt-privacy').inputValue(), '', 'no TikTok visibility is preselected');
  await page.locator('#tt-client-key').fill('awclientkey123'); await page.locator('#tt-client-secret').fill('secret-fixture');
  await page.locator('#tt-config-form button[type=submit]').click();
  await page.locator('#vs-toast').filter({ hasText: 'TikTok app saved' }).waitFor();
  await page.locator('#tab-settings-tiktok').click();
  assert.ok(await page.locator('[data-action="tt-connect"]').isVisible(), 'Connect TikTok appears once the app is saved');
  assert.match(await page.locator('#panel-settings-tiktok').textContent(), /https:\/\/studio\.example\.test\/auth\/tiktok\/callback/);
  await page.locator('#tt-privacy').selectOption('SELF_ONLY'); await page.locator('#tt-post-form button[type=submit]').click();
  await page.locator('#vs-toast').filter({ hasText: 'TikTok posting settings saved' }).waitFor();
  await page.screenshot({ path: path.join(results, 'channels-settings-tiktok.png'), fullPage: true });

  // Create post → TikTok photo post saved as a draft with a T code.
  await page.goto('http://localhost:3216/create'); await page.locator('[data-create-platform="tiktok"]').click();
  await page.locator('#create-files').setInputFiles({ name: 'villa.png', mimeType: 'image/png', buffer: png });
  await page.locator('#create-title').waitFor();
  assert.match(await page.locator('#create-post').innerText(), /TikTok photo post/);
  await page.locator('#create-title').fill('Villa siap tamu'); await page.locator('#create-caption').fill('Caption TikTok #vayora');
  await page.locator('[name="create-when"][value="draft"]').check();
  await page.screenshot({ path: path.join(results, 'channels-create-tiktok.png'), fullPage: true });
  await page.locator('[data-action="create-submit"]').click();
  await page.waitForURL(/tiktok-library/);
  const card = page.locator('.vs-content-card').first(); await card.waitFor();
  assert.match(await card.innerText(), /T01/); assert.match(await card.innerText(), /Photo/);
  assert.equal(runtime.store.post('T01').platform, 'tiktok');
  await page.goto('http://localhost:3216/library'); await page.locator('#library-search').waitFor();
  assert.equal(await page.locator('.vs-content-card').count(), 0, 'the TikTok post is not in the Instagram library');

  // Import: a photo offers Instagram, Facebook and TikTok; a video also YouTube.
  await page.goto('http://localhost:3216/import'); await page.locator('#pkg-page').waitFor();
  await page.locator('#pkg-files').setInputFiles([{ name: 'front.jpg', mimeType: 'image/jpeg', buffer: png }, { name: 'tour.mp4', mimeType: 'video/mp4', buffer: Buffer.from('x') }]);
  await page.locator('.vs-pkg-table tbody tr').first().waitFor();
  const photoRow = page.locator('.vs-pkg-table tbody tr', { hasText: 'front.jpg' }).first();
  assert.deepEqual(await photoRow.locator('[data-pkg-target]').evaluateAll(els => els.map(e => e.dataset.pkgTarget)), ['instagram', 'facebook', 'tiktok']);
  await photoRow.locator('[data-pkg-target="tiktok"]').check();
  assert.equal(await page.locator('.vs-pkg-table tbody tr', { hasText: 'front.jpg' }).count(), 2, 'Instagram + TikTok rows for the photo');
  const videoTargets = await page.locator('.vs-pkg-table tbody tr', { hasText: 'tour.mp4' }).first().locator('[data-pkg-target]').evaluateAll(els => els.map(e => e.dataset.pkgTarget));
  assert.deepEqual(videoTargets, ['instagram', 'youtube', 'facebook', 'tiktok']);
  await page.screenshot({ path: path.join(results, 'channels-import.png'), fullPage: true });
  if (errors.length) throw Error(errors.join('\n'));
  console.log('PASS channels: Facebook/TikTok settings, TikTok create → T01 in the TikTok library, import destinations per media type');
} catch (error) { console.error('FAIL', error); process.exitCode = 1; } finally { await browser.close(); await server.close?.(); runtime.close?.(); process.exit(process.exitCode || 0); }
