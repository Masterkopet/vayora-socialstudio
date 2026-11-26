// End-to-end: /privacy and /terms are public (no sign-in), bilingual, readable on a phone, and say what TikTok needs to see.
// Run: node tests/legal.browser.mjs
import { nextTestServer } from './next-server.mjs';
import { createRequire } from 'node:module';
import { mkdir, mkdtemp } from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import { createApp } from '../src/server.mjs';

const require = createRequire(import.meta.url);
const { chromium } = (() => { for (const p of [process.env.PLAYWRIGHT_PATH, 'playwright', path.join(process.env.LOCALAPPDATA || '', 'hermes/hermes-agent/node_modules/playwright')].filter(Boolean)) { try { return require(p); } catch { /* try the next location */ } } throw Error('Playwright not found: set PLAYWRIGHT_PATH'); })();
const root = path.resolve(import.meta.dirname, '..'), results = path.join(root, 'test-results');
await mkdir(results, { recursive: true });
const directory = await mkdtemp(path.join(results, 'legal-'));
const runtime = createApp({ dataDir: directory, port: 3222, origin: 'http://localhost:3222', scheduler: false });
const server = await nextTestServer(runtime, 3222);
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const page = await (await browser.newContext({ viewport: { width: 1280, height: 900 } })).newPage(), errors = [];
page.on('pageerror', error => errors.push(error.message));
try {
  // Public: no account exists and nobody is signed in, yet both pages open.
  for (const [url, idTitle, enTitle] of [['privacy', 'Kebijakan Privasi', 'Privacy Policy'], ['terms', 'Syarat dan Ketentuan', 'Terms of Service']]) {
    const response = await page.goto(`http://localhost:3222/${url}`);
    assert.equal(response.status(), 200, `/${url} is public`);
    assert.equal(new URL(page.url()).pathname, `/${url}`, 'no redirect to a sign-in page');
    assert.equal(await page.locator('#id h2').innerText(), idTitle); assert.equal(await page.locator('#en h2').innerText(), enTitle);
    assert.equal(await page.locator('#id').getAttribute('lang'), 'id'); assert.equal(await page.locator('#en').getAttribute('lang'), 'en');
    assert.equal(await page.locator('#vayora-studio-complete').count(), 0, 'no workspace code on a legal page');
    assert.match(await page.locator('.legal-meta').first().innerText(), /2026-11-26/);
  }
  await page.goto('http://localhost:3222/privacy');
  const text = await page.locator('main').innerText();
  for (const needle of ['TikTok Login Kit', 'Content Posting API', 'do not sell or share TikTok data', 'Settings → TikTok', 'TikTok Login Kit']) assert.ok(text.includes(needle), 'privacy policy mentions: ' + needle);
  assert.ok(text.includes('Login Kit') && text.includes('Penggunaan data TikTok'), 'the Indonesian TikTok section exists too');
  assert.equal(await page.locator('a[href="#en"]').first().isVisible(), true);

  // A phone: readable, no sideways scroll.
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('http://localhost:3222/terms');
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1), true, 'no sideways scroll on a phone');
  assert.ok(await page.evaluate(() => parseFloat(getComputedStyle(document.querySelector('.legal-doc section p')).fontSize) >= 15), 'text is not tiny');
  await page.screenshot({ path: path.join(results, 'legal-phone.png') });
  await page.goto('http://localhost:3222/privacy'); await page.setViewportSize({ width: 1280, height: 900 });
  await page.screenshot({ path: path.join(results, 'legal-desktop.png'), fullPage: false });

  // The workspace itself still works next to the public pages.
  await page.goto('http://localhost:3222/home'); await page.locator('#auth-name, #auth-email').first().waitFor();
  if (errors.length) throw Error(errors.join('\n'));
  console.log('PASS legal pages: /privacy and /terms are public and bilingual, mention TikTok use, and fit a phone; the workspace is unaffected');
} catch (error) { console.error('FAIL', error); process.exitCode = 1; } finally { await browser.close(); await server.close?.(); runtime.close?.(); process.exit(process.exitCode || 0); }
