// End-to-end: Settings → AI connection offers the Gemini models this key can use as dropdowns, and the choice is saved.
// A fake Google model list stands in for the real one. Run: node tests/gemini-models.browser.mjs
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
const directory = await mkdtemp(path.join(results, 'gemini-models-'));
const models = [
  ['gemini-flash-latest', 'Gemini Flash Latest'], ['gemini-2.5-flash', 'Gemini 2.5 Flash'], ['gemini-2.5-flash-lite', 'Gemini 2.5 Flash-Lite'],
  ['gemini-2.5-pro', 'Gemini 2.5 Pro'], ['gemini-2.5-flash-image', 'Nano Banana'], ['gemini-2.5-flash-preview-tts', 'TTS'],
].map(([id, displayName]) => ({ name: 'models/' + id, displayName, supportedGenerationMethods: ['generateContent'] }));
const fakeGoogle = async url => { if (new URL(url).pathname === '/v1beta/models') return Response.json({ models }); throw Error('unexpected request ' + url); };
const runtime = createApp({ dataDir: directory, port: 3221, origin: 'http://localhost:3221', scheduler: false, assistant: { fetch: fakeGoogle } });
runtime.store.setSecret('assistant.config', { geminiKey: 'AIzaSyTest-private-gemini-key-0123456789' });
const server = await nextTestServer(runtime, 3221);
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const page = await (await browser.newContext({ viewport: { width: 1280, height: 900 } })).newPage(), errors = [];
page.on('pageerror', error => errors.push(error.message));
try {
  await page.goto('http://localhost:3221/#calendar');
  const password = 'Models-' + randomBytes(16).toString('hex');
  await page.locator('#auth-name').fill('Model Test'); await page.locator('#auth-email').fill('models@example.test');
  await page.locator('#auth-password').fill(password); await page.locator('#auth-confirm').fill(password);
  await page.locator('#auth-submit').click(); await page.locator('#vs-title').waitFor();

  await page.goto('http://localhost:3221/ai-settings');
  const text = page.locator('select#smart-gemini-model'); await text.waitFor();
  assert.deepEqual(await text.locator('option').evaluateAll(o => o.map(x => x.value)), ['gemini-flash-latest', 'gemini-2.5-flash', 'gemini-2.5-flash-lite', 'gemini-2.5-pro'], 'only writing models, no TTS or image');
  assert.equal(await text.inputValue(), 'gemini-flash-latest', 'the saved (default) model is selected');
  assert.match(await text.locator('option[value="gemini-2.5-flash-lite"]').innerText(), /Gemini 2\.5 Flash-Lite · Fastest and cheapest/);
  await page.locator('#smart-config-form summary', { hasText: 'Image models' }).click();
  const image = page.locator('select#smart-gemini-image-model');
  assert.deepEqual(await image.locator('option').evaluateAll(o => o.map(x => x.value)), ['gemini-2.5-flash-image']);
  await page.screenshot({ path: path.join(results, 'gemini-models.png'), fullPage: true });

  await text.selectOption('gemini-2.5-flash');
  await page.locator('#smart-config-form button[type=submit]').click();
  await page.locator('#vs-toast', { hasText: 'AI connection saved' }).waitFor();
  assert.equal(runtime.store.secret('assistant.config').geminiModel, 'gemini-2.5-flash', 'the choice is saved');
  await page.locator('select#smart-gemini-model').waitFor();
  assert.equal(await page.locator('select#smart-gemini-model').inputValue(), 'gemini-2.5-flash');
  if (errors.length) throw Error(errors.join('\n'));
  console.log('PASS gemini models: dropdowns list the key\'s writing and image models with hints; the chosen model is saved');
} catch (error) { console.error('FAIL', error); process.exitCode = 1; } finally { await browser.close(); await server.close?.(); runtime.close?.(); process.exit(process.exitCode || 0); }
