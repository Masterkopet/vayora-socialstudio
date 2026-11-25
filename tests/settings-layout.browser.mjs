// End-to-end: Settings as a grouped side list. Wide screen: sections on the left with status hints, content on the right.
// Phone (390 px): the list is the page, a section opens full screen, Back and the breadcrumb return to the list, nothing is
// cut off or scrolled sideways. Ordinary tab bars (blog editor) wrap instead of being clipped.
// Run: node tests/settings-layout.browser.mjs
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
const directory = await mkdtemp(path.join(results, 'settings-layout-'));
const runtime = createApp({ dataDir: directory, port: 3219, origin: 'http://localhost:3219', scheduler: false });
const server = await nextTestServer(runtime, 3219);
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const page = await (await browser.newContext({ viewport: { width: 1280, height: 900 } })).newPage(), errors = [];
page.on('pageerror', error => errors.push(error.message));
const noSideScroll = () => page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1);
try {
  await page.goto('http://localhost:3219/#calendar');
  const password = 'Side-' + randomBytes(16).toString('hex');
  await page.locator('#auth-name').fill('Side Test'); await page.locator('#auth-email').fill('side@example.test');
  await page.locator('#auth-password').fill(password); await page.locator('#auth-confirm').fill(password);
  await page.locator('#auth-submit').click(); await page.locator('#vs-title').waitFor();

  // Wide screen: grouped list on the left, the selected section on the right.
  await page.goto('http://localhost:3219/settings'); await page.locator('.vs-sidenav').waitFor();
  assert.deepEqual((await page.locator('.vs-sidegroup-title').allInnerTexts()).map(t => t.toLowerCase()), ['connected accounts', 'publishing', 'writing & ai']);
  assert.deepEqual(await page.locator('.vs-sidetab b').allInnerTexts(), ['Instagram', 'YouTube', 'Facebook', 'TikTok', 'Blog', 'Publishing', 'Brand', 'AI connection']);
  assert.match(await page.locator('#tab-settings-facebook').innerText(), /Not connected/, 'each section shows its status');
  const left = await page.locator('.vs-sidenav').boundingBox(), right = await page.locator('.vs-sidepanels').boundingBox();
  assert.ok(left.x + left.width <= right.x, 'list on the left, content on the right');
  assert.equal(await page.locator('#panel-settings-instagram').isVisible(), true, 'the first section is open');
  await page.locator('#tab-settings-tiktok').click();
  assert.equal(await page.locator('#tt-config-form').isVisible(), true); assert.equal(await page.locator('#panel-settings-instagram').isVisible(), false);
  await page.keyboard.press('ArrowUp'); assert.equal(await page.locator('#panel-settings-facebook').isVisible(), true, 'arrow keys move between sections');
  assert.equal(await page.locator('.vs-back').isVisible(), false);
  assert.ok(await noSideScroll(), 'no sideways scroll on desktop');

  // Phone: the list is the page; a section opens full screen; Back returns to the list.
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('http://localhost:3219/settings'); await page.locator('.vs-sidenav').waitFor();
  assert.equal(await page.locator('.vs-sidetabs').getAttribute('data-view'), 'list');
  assert.equal(await page.locator('.vs-sidepanels').isVisible(), false, 'only the list shows');
  assert.equal(await page.locator('.vs-sidetab').count(), 8);
  for (const tab of await page.locator('.vs-sidetab').all()) { const box = await tab.boundingBox(); assert.ok(box.height >= 44 && box.x >= 0 && box.x + box.width <= 390, 'every row is tappable and fits the screen'); }
  assert.ok(await noSideScroll(), 'no sideways scroll on a phone');
  await page.screenshot({ path: path.join(results, 'settings-phone-list.png') });
  await page.locator('#tab-settings-facebook').click();
  assert.equal(await page.locator('.vs-sidetabs').getAttribute('data-view'), 'detail');
  assert.equal(await page.locator('#fb-token-form').isVisible(), true); assert.equal(await page.locator('.vs-sidenav').isVisible(), false);
  assert.deepEqual(await page.locator('.vs-crumbs li').allInnerTexts(), ['Home', 'Settings', 'Facebook'], 'the open section is the last crumb');
  assert.ok(await noSideScroll());
  await page.screenshot({ path: path.join(results, 'settings-phone-detail.png') });
  await page.locator('.vs-back').click();
  await page.locator('.vs-sidetabs[data-view="list"]').waitFor({ timeout: 5000 }); // Back closes the section first
  assert.equal(new URL(page.url()).pathname, '/settings');
  await page.locator('#tab-settings-blog').click();
  await page.locator('.vs-crumbs button', { hasText: 'Settings' }).last().click();
  await page.locator('.vs-sidetabs[data-view="list"]').waitFor({ timeout: 5000 }); // the Settings crumb returns to the list too
  await page.locator('.vs-back').click(); await page.waitForURL(/\/home/); // nothing left to close: the previous menu / Home

  // A link that points at one section (Set up Gemini) opens it directly, also on a phone.
  await page.goto('http://localhost:3219/ai-settings'); await page.locator('#smart-gemini-key').waitFor({ state: 'visible' });
  assert.equal(await page.locator('.vs-sidetabs').getAttribute('data-view'), 'detail');
  assert.deepEqual((await page.locator('.vs-crumbs li').allInnerTexts()).slice(-1), ['AI connection']);

  // Other tab bars wrap on a phone instead of being cut off: the blog editor has three long tabs.
  await page.goto('http://localhost:3219/blog'); await page.locator('[data-action="blog-new"]').click(); await page.locator('.vs-tablist').first().waitFor();
  const tabs = await page.locator('.vs-tablist .vs-tab').all();
  for (const tab of tabs) { if (!await tab.isVisible()) continue; const box = await tab.boundingBox(); assert.ok(box.x >= 0 && box.x + box.width <= 390, 'every editor tab is fully visible'); }
  assert.ok(await noSideScroll());
  await page.screenshot({ path: path.join(results, 'blog-tabs-phone.png') });
  if (errors.length) throw Error(errors.join('\n'));
  console.log('PASS settings layout: grouped side list on wide screens; on a phone list → full-screen section with Back/breadcrumb, deep link opens the section, other tab bars wrap');
} catch (error) { console.error('FAIL', error); process.exitCode = 1; } finally { await browser.close(); await server.close?.(); runtime.close?.(); process.exit(process.exitCode || 0); }
