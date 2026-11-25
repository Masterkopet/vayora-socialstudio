// End-to-end: clickable breadcrumb and the Back button. Desktop: Home › Content › Instagram library, click Home. Phone: Back
// returns to the previous menu, Back inside the blog editor returns to the article list. Run: node tests/breadcrumb.browser.mjs
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
const directory = await mkdtemp(path.join(results, 'breadcrumb-browser-'));
const runtime = createApp({ dataDir: directory, port: 3218, origin: 'http://localhost:3218', scheduler: false });
const server = await nextTestServer(runtime, 3218);
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
const page = await context.newPage(), errors = [];
page.on('pageerror', error => errors.push(error.message));
const trail = () => page.locator('.vs-crumbs li').allInnerTexts();
const pathName = () => new URL(page.url()).pathname;
try {
  await page.goto('http://localhost:3218/#calendar');
  const password = 'Crumb-' + randomBytes(16).toString('hex');
  await page.locator('#auth-name').fill('Crumb Test'); await page.locator('#auth-email').fill('crumb@example.test');
  await page.locator('#auth-password').fill(password); await page.locator('#auth-confirm').fill(password);
  await page.locator('#auth-submit').click(); await page.locator('#vs-title').waitFor();

  // Desktop: a trail on every page except Home; its links work; Back is hidden.
  await page.goto('http://localhost:3218/home'); await page.locator('#vs-title').waitFor();
  assert.equal(await page.locator('.vs-trail').count() && (await page.locator('.vs-crumbs').count()), 0, 'Home has no trail');
  await page.goto('http://localhost:3218/library'); await page.locator('.vs-crumbs').waitFor();
  assert.deepEqual(await trail(), ['Home', 'Content', 'Instagram library']);
  assert.equal(await page.locator('.vs-back').isVisible(), false, 'no Back button on desktop');
  assert.equal(await page.locator('.vs-crumbs li[aria-current="page"]').innerText(), 'Instagram library');
  await page.locator('.vs-crumbs button', { hasText: 'Home' }).click();
  await page.waitForURL(/\/home/); assert.equal(await page.locator('.vs-crumbs').count(), 0);
  await page.goto('http://localhost:3218/blog'); await page.locator('[data-action="blog-new"]').click();
  await page.locator('.vs-crumbs').waitFor();
  assert.deepEqual(await trail(), ['Home', 'Content', 'Blog', 'New article'], 'an open article adds a level');
  await page.locator('.vs-crumbs button', { hasText: 'Blog' }).click();
  await page.locator('[data-action="blog-new"]').waitFor();
  assert.deepEqual(await trail(), ['Home', 'Content', 'Blog'], 'the Blog crumb leads back to the list');

  // Phone: Back returns to the previous menu; inside the blog editor it closes the editor.
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('http://localhost:3218/library'); await page.locator('.vs-back').waitFor();
  assert.equal(await page.locator('.vs-back').isVisible(), true, 'Back button on a phone');
  const box = await page.locator('.vs-back').boundingBox(); assert.ok(box.width >= 44 && box.height >= 44, 'touch-sized Back');
  await page.locator('[data-action="more-menu"]:visible').click();
  await page.locator('.vs-menu-grid [data-action="nav:calendar"]').click();
  await page.locator('#vs-title', { hasText: /calendar/i }).waitFor(); assert.equal(pathName(), '/calendar');
  await page.locator('.vs-back').click();
  await page.waitForURL(/\/library/); assert.match(await page.locator('#vs-title').innerText(), /Instagram library/, 'Back returns to the menu you came from');
  await page.locator('.vs-back').click(); // nothing earlier in the app: parent is Home
  await page.waitForURL(/\/home/);
  await page.goto('http://localhost:3218/blog'); await page.locator('[data-action="blog-new"]').click();
  await page.locator('.vs-crumbs li[aria-current="page"]', { hasText: 'New article' }).waitFor();
  await page.screenshot({ path: path.join(results, 'breadcrumb-mobile.png') });
  await page.locator('.vs-back').click();
  await page.locator('[data-action="blog-new"]').waitFor(); assert.equal(await page.locator('.vs-crumbs li[aria-current="page"]').innerText(), 'Blog', 'Back closes the editor');
  if (errors.length) throw Error(errors.join('\n'));
  console.log('PASS breadcrumb: clickable trail on desktop, Back on a phone returns to the previous menu and out of the blog editor');
} catch (error) { console.error('FAIL', error); process.exitCode = 1; } finally { await browser.close(); await server.close?.(); runtime.close?.(); process.exit(process.exitCode || 0); }
