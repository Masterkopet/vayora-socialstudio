// End-to-end: an existing blog article (draft or in review) can be approved and published from its editor.
// Run: node tests/blog-publish.browser.mjs
import { nextTestServer } from './next-server.mjs';
import { createRequire } from 'node:module';
import { mkdir, mkdtemp } from 'node:fs/promises';
import { randomBytes } from 'node:crypto';
import path from 'node:path';
import assert from 'node:assert/strict';
import { createApp } from '../src/server.mjs';

const require = createRequire(import.meta.url);
const { chromium } = (() => { for (const p of [process.env.PLAYWRIGHT_PATH, 'playwright', path.join(process.env.LOCALAPPDATA || '', 'hermes/hermes-agent/node_modules/playwright')].filter(Boolean)) { try { return require(p); } catch { /* try the next location */ } } throw Error('Playwright not found: set PLAYWRIGHT_PATH'); })();
const root = path.resolve(import.meta.dirname, '..'), results = path.join(root, 'test-results');
await mkdir(results, { recursive: true });
const directory = await mkdtemp(path.join(results, 'blog-publish-'));
const runtime = createApp({ dataDir: directory, port: 3223, origin: 'http://localhost:3223', scheduler: false });
runtime.sanity.configure({ projectId: '5ugtuy3w', dataset: 'production', token: 'skAbCdEf0123456789AbCdEf0123456789ZZ' });
runtime.store.set('publishingEnabled', true);
const article = runtime.blog.create({ title: 'Draft that is ready', excerpt: 'Short summary.', body: 'Hello **world**.', category: 'Operasional' });
const server = await nextTestServer(runtime, 3223);
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const page = await (await browser.newContext({ viewport: { width: 1280, height: 1000 } })).newPage(), errors = [];
page.on('pageerror', error => errors.push(error.message));
try {
  await page.goto('http://localhost:3223/#calendar');
  const password = 'Blog-' + randomBytes(16).toString('hex');
  await page.locator('#auth-name').fill('Blog Test'); await page.locator('#auth-email').fill('blog@example.test');
  await page.locator('#auth-password').fill(password); await page.locator('#auth-confirm').fill(password);
  await page.locator('#auth-submit').click(); await page.locator('#vs-title').waitFor();
  await page.goto('http://localhost:3223/blog');
  await page.locator(`[data-action="blog-open:${article.id}"]`).first().click();
  await page.locator('#blog-editor').waitFor();
  const publish = page.locator('[data-action="blog-publish"]');
  assert.equal(await publish.isDisabled(), true, 'Publish now waits for the approval');
  // The approval box sits right above the buttons it unlocks, without opening any tab.
  await page.locator('#blog-approved').check();
  assert.equal(await publish.isDisabled(), false, 'approved articles can be published now');
  if (errors.length) throw Error(errors.join('\n'));
  console.log('PASS blog: an existing draft shows the approval box and its Publish now button becomes available');
} catch (error) { console.error('FAIL', error); process.exitCode = 1; } finally { await browser.close(); await server.close?.(); runtime.close?.(); process.exit(process.exitCode || 0); }
