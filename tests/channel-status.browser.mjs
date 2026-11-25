// End-to-end: a status dot beside each library whose platform is not connected. Red when posts are waiting there (or the
// connection broke), grey when it was never set up; none once connected; admins only. The library shows a banner whose
// Connect button opens the right Settings section. Run: node tests/channel-status.browser.mjs
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
await mkdir(results, { recursive: true });
const directory = await mkdtemp(path.join(results, 'channel-status-'));
const runtime = createApp({ dataDir: directory, port: 3220, origin: 'http://localhost:3220', scheduler: false });
const server = await nextTestServer(runtime, 3220);
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const page = await (await browser.newContext({ viewport: { width: 1280, height: 900 } })).newPage(), errors = [];
page.on('pageerror', error => errors.push(error.message));
const dots = () => page.evaluate(() => Object.fromEntries([...document.querySelectorAll('.vs-nav [data-action^="nav:"] .vs-health-dot')].map(d => [d.closest('button').dataset.action.slice(4), d.classList.contains('bad') ? 'bad' : 'idle'])));
try {
  await page.goto('http://localhost:3220/#calendar');
  const password = 'Dots-' + randomBytes(16).toString('hex');
  await page.locator('#auth-name').fill('Dots Test'); await page.locator('#auth-email').fill('dots@example.test');
  await page.locator('#auth-password').fill(password); await page.locator('#auth-confirm').fill(password);
  await page.locator('#auth-submit').click(); await page.locator('#vs-title').waitFor();

  // Nothing connected and no content yet: grey "not set up" dots on all four libraries.
  await page.goto('http://localhost:3220/home'); await page.locator('.vs-nav').waitFor();
  assert.deepEqual(await dots(), { library: 'idle', 'youtube-library': 'idle', 'facebook-library': 'idle', 'tiktok-library': 'idle' });
  assert.equal(await page.locator('.vs-nav [data-action="nav:facebook-library"]').getAttribute('title'), 'Facebook library, not set up');

  // A TikTok post is waiting while TikTok is not connected: that one turns red. Connected Instagram loses its dot.
  runtime.store.insertPost({ id: 'T01', platform: 'tiktok', format: 'Gambar', title: 'x', caption: 'y', mediaIds: [], status: 'draft', approved: false });
  runtime.store.setSecret('instagram.connection', { token: 'EAAfixture1234567890', accountId: '1784', username: 'vayora.test', method: 'token', api: 'facebook', noExpiry: true, expiresKnown: false, expiresAt: null, refreshedAt: Date.now(), invalid: false });
  await page.goto('http://localhost:3220/home'); await page.locator('.vs-nav').waitFor();
  assert.deepEqual(await dots(), { 'youtube-library': 'idle', 'facebook-library': 'idle', 'tiktok-library': 'bad' });
  await page.screenshot({ path: path.join(results, 'channel-status-desktop.png') });

  // The library explains it and Connect opens the right Settings section.
  await page.locator('.vs-nav [data-action="nav:tiktok-library"]').click();
  const banner = page.locator('.vs-alert.danger'); await banner.waitFor();
  assert.match(await banner.innerText(), /TikTok is not connected\. Posts here cannot be published until it is\./);
  await banner.locator('[data-action="open-section:tiktok"]').click();
  await page.locator('#tt-config-form').waitFor({ state: 'visible' });
  assert.equal(await page.locator('#tab-settings-tiktok').getAttribute('aria-selected'), 'true');
  await page.goto('http://localhost:3220/youtube-library'); await page.locator('.vs-alert.warning').waitFor();
  assert.match(await page.locator('.vs-alert.warning').innerText(), /YouTube is not connected yet\./);
  await page.goto('http://localhost:3220/library'); await page.locator('#library-search').waitFor();
  assert.equal(await page.locator('.vs-alert').count(), 0, 'a connected platform shows no banner');

  // Phone: the same dots in the Menu grid, and Connect opens the section full screen.
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('http://localhost:3220/home'); await page.locator('[data-action="more-menu"]:visible').click();
  const tile = page.locator('.vs-menu-grid [data-action="nav:tiktok-library"]');
  assert.equal(await tile.getAttribute('aria-label'), 'TikTok library, not connected');
  assert.equal(await tile.locator('.vs-health-dot.bad').count(), 1);
  assert.equal(await page.locator('.vs-menu-grid [data-action="nav:library"] .vs-health-dot').count(), 0);
  await page.screenshot({ path: path.join(results, 'channel-status-phone.png') });
  await tile.click(); await page.locator('[data-action="open-section:tiktok"]').click();
  await page.locator('.vs-sidetabs[data-view="detail"]').waitFor();
  assert.equal(await page.locator('#tt-config-form').isVisible(), true);

  // Connected: the dot is gone.
  runtime.store.setSecret('tiktok.config', { clientKey: 'awclientkey123', clientSecret: 's', privacy: 'SELF_ONLY', brandOrganic: true });
  runtime.store.setSecret('tiktok.connection', { accessToken: 'a', expiresAt: Date.now() + 3600000, refreshToken: 'r', refreshExpiresAt: Date.now() + 86400000 * 300, username: 'vayora', privacyOptions: ['SELF_ONLY'], invalid: false });
  await page.setViewportSize({ width: 1280, height: 900 }); await page.goto('http://localhost:3220/home'); await page.locator('.vs-nav').waitFor();
  assert.deepEqual(await dots(), { 'youtube-library': 'idle', 'facebook-library': 'idle' });
  if (errors.length) throw Error(errors.join('\n'));
  console.log('PASS channel status: grey/red dots in the sidebar and phone menu, banner with Connect that opens the section, gone once connected');
} catch (error) { console.error('FAIL', error); process.exitCode = 1; } finally { await browser.close(); await server.close?.(); runtime.close?.(); process.exit(process.exitCode || 0); }
