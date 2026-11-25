import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import sharp from 'sharp';
import { openStore } from '../src/store.mjs';
import { registerImage } from '../src/design.mjs';
import { createAssistant } from '../src/assistant.mjs';

const KEY = 'AIzaSyTest-private-gemini-key-0123456789';
async function fixture() {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'vayora-gemini-err-'));
  const store = openStore(directory);
  const bytes = await sharp({ create: { width: 1080, height: 1350, channels: 3, background: '#00285C' } }).png().toBuffer();
  const media = await registerImage(store, bytes, 'kamar.jpg', { kind: 'test' });
  return { store, media, async cleanup() { store.close(); await rm(directory, { recursive: true, force: true }); } };
}
const ok = () => Response.json({ candidates: [{ finishReason: 'STOP', content: { parts: [{ text: JSON.stringify({ title: 'Judul', caption: 'Caption', hashtags: [], tags: [], warnings: [] }) }] } }] });
const failure = (status, message, code = 'UNAVAILABLE') => Response.json({ error: { code: status, message, status: code } }, { status });

test('a transient Gemini 503 is retried and the draft still succeeds', async () => {
  const f = await fixture();
  try {
    let calls = 0;
    const ai = createAssistant(f.store, { retryMs: 0, fetch: async () => (++calls <= 2 ? failure(503, 'The model is overloaded. Please try again later.') : ok()) });
    ai.configure({ geminiKey: KEY });
    f.store.set('assistant.lastRequest', 0);
    const draft = await ai.draft({ platform: 'instagram', mediaIds: [f.media.id] });
    assert.equal(draft.title, 'Judul'); assert.equal(calls, 3, 'two retries, then the answer');
    assert.equal(ai.status().usage.caption, 1, 'the retries do not use up the daily allowance');
  } finally { await f.cleanup(); }
});

test('when Gemini keeps failing the message names the HTTP status and Google\'s own reason, never URLs or keys', async () => {
  const f = await fixture();
  const warnings = []; const original = console.warn; console.warn = (...args) => warnings.push(args.join(' '));
  try {
    const ai = createAssistant(f.store, { retryMs: 0, fetch: async () => failure(503, `The model is overloaded. See https://ai.google.dev/gemini-api/docs/troubleshooting and key ${KEY}`) });
    ai.configure({ geminiKey: KEY });
    f.store.set('assistant.lastRequest', 0);
    await assert.rejects(() => ai.draft({ platform: 'instagram', mediaIds: [f.media.id] }), e => {
      assert.equal(e.status, 502); assert.match(e.message, /^Gemini could not complete the request yet \(HTTP 503: The model is overloaded\./); assert.match(e.message, /Try again later\.$/);
      assert.ok(!/AIza|https?:/.test(e.message), 'no key or URL in the message'); return true;
    });
    assert.ok(warnings.some(w => /\[assistant\] gemini HTTP 503/.test(w) && !/AIza/.test(w)), 'a log line names the status for the server logs');

    // A 400 is not transient: no retry, and the reason says what was wrong.
    let calls = 0;
    const picky = createAssistant(f.store, { retryMs: 0, fetch: async () => { calls++; return failure(400, 'Request payload size exceeds the limit.', 'INVALID_ARGUMENT'); } });
    f.store.set('assistant.lastRequest', 0);
    await assert.rejects(() => picky.draft({ platform: 'tiktok', mediaIds: [f.media.id] }), /HTTP 400: Request payload size exceeds the limit\./);
    assert.equal(calls, 1, 'a 400 is not retried');
  } finally { console.warn = original; await f.cleanup(); }
});

test('the Indonesian translation still matches the message with and without the HTTP detail', async () => {
  const { extraPatterns } = await import('../src/client/extra-i18n.js');
  const translate = text => { for (const [re, fn] of extraPatterns) { const m = re.exec(text); if (m) return fn(...m); } return null; };
  assert.equal(translate('Gemini could not complete the request yet. Try again later.'), 'Gemini belum dapat menyelesaikan permintaan. Coba lagi nanti.');
  assert.equal(translate('Gemini could not complete the request yet (HTTP 503: The model is overloaded.). Try again later.'), 'Gemini belum dapat menyelesaikan permintaan (HTTP 503: The model is overloaded.). Coba lagi nanti.');
  assert.equal(translate('Gemini could not complete the request yet (HTTP 500). Try again later.'), 'Gemini belum dapat menyelesaikan permintaan (HTTP 500). Coba lagi nanti.');
});

test('when the chosen model stays busy, another flash model from the key\'s own list writes the draft (counted once)', async () => {
  const f = await fixture();
  try {
    const seen = [];
    const fetch = async url => {
      const u = new URL(url);
      if (u.pathname === '/v1beta/models') return Response.json({ models: [
        { name: 'models/gemini-flash-latest', supportedGenerationMethods: ['generateContent'] },
        { name: 'models/gemini-2.5-flash', supportedGenerationMethods: ['generateContent'] },
        { name: 'models/gemini-3.0-flash', supportedGenerationMethods: ['generateContent'] },
        { name: 'models/gemini-2.5-flash-lite', supportedGenerationMethods: ['generateContent'] },
        { name: 'models/gemini-2.5-flash-image', supportedGenerationMethods: ['generateContent'] },
        { name: 'models/text-embedding-004', supportedGenerationMethods: ['embedContent'] },
      ] });
      const model = decodeURIComponent(u.pathname.split('/models/')[1].split(':')[0]); seen.push(model);
      return model === 'gemini-3.0-flash' ? ok() : failure(503, 'This model is currently experiencing high demand.');
    };
    const ai = createAssistant(f.store, { retryMs: 0, fetch });
    ai.configure({ geminiKey: KEY });
    f.store.set('assistant.lastRequest', 0);
    const draft = await ai.draft({ platform: 'instagram', mediaIds: [f.media.id] });
    assert.equal(draft.title, 'Judul');
    assert.deepEqual(seen, ['gemini-flash-latest', 'gemini-flash-latest', 'gemini-flash-latest', 'gemini-3.0-flash'], 'retries first, then the newest other flash model');
    assert.equal(ai.status().usage.caption, 1);
  } finally { await f.cleanup(); }
});

test('if every model is busy, at most two others are tried and the message stays clear; without a model list the stable ones are used', async () => {
  const f = await fixture();
  try {
    const seen = [];
    const ai = createAssistant(f.store, { retryMs: 0, fetch: async url => {
      const u = new URL(url);
      if (u.pathname === '/v1beta/models') return failure(500, 'list failed', 'INTERNAL');
      seen.push(decodeURIComponent(u.pathname.split('/models/')[1].split(':')[0]));
      return failure(503, 'This model is currently experiencing high demand.');
    } });
    ai.configure({ geminiKey: KEY });
    f.store.set('assistant.lastRequest', 0);
    await assert.rejects(() => ai.draft({ platform: 'instagram', mediaIds: [f.media.id] }), /HTTP 503: This model is currently experiencing high demand\./);
    assert.deepEqual(seen.slice(3), ['gemini-2.5-flash', 'gemini-2.5-flash-lite'], 'the stable flash models as the fallback');
    assert.equal(seen.length, 5, 'three tries on the chosen model, one on each fallback');
  } finally { await f.cleanup(); }
});

test('the model dropdowns list only usable writing and image models, sorted and explained', async () => {
  const { classifyGeminiModels } = await import('../src/assistant.mjs');
  const ids = ['gemini-2.5-flash', 'gemini-flash-latest', 'gemini-3.0-pro-preview', 'gemini-2.5-pro', 'gemini-2.5-flash-lite', 'gemini-2.5-flash-image', 'gemini-2.5-flash-preview-tts', 'gemini-2.0-flash-live-001', 'gemini-embedding-001', 'gemma-3-27b-it', 'gemini-3.0-flash', 'gemini-2.5-flash'];
  const { text, image } = classifyGeminiModels(ids.map(id => ({ id, label: id })));
  assert.deepEqual(text.map(m => m.id), ['gemini-flash-latest', 'gemini-3.0-flash', 'gemini-3.0-pro-preview', 'gemini-2.5-flash', 'gemini-2.5-flash-lite', 'gemini-2.5-pro'], 'aliases first, newest versions next; no audio, live, embedding or Gemma; no duplicates');
  assert.deepEqual(image.map(m => m.id), ['gemini-2.5-flash-image']);
  assert.equal(text.find(m => m.id === 'gemini-2.5-flash-lite').hint, 'Fastest and cheapest; simpler writing');
  assert.equal(text.find(m => m.id === 'gemini-3.0-pro-preview').hint, 'Best writing; slower and costs more · preview, may change');
  assert.match(text[0].hint, /^Always the newest version/);
});

test('the model list comes from the key, is cached, and needs a key', async () => {
  const f = await fixture();
  try {
    let lists = 0;
    const ai = createAssistant(f.store, { fetch: async url => { if (new URL(url).pathname === '/v1beta/models') { lists++; return Response.json({ models: [{ name: 'models/gemini-2.5-flash', displayName: 'Gemini 2.5 Flash', supportedGenerationMethods: ['generateContent'] }, { name: 'models/gemini-2.5-flash-image', displayName: 'Nano Banana', supportedGenerationMethods: ['generateContent'] }, { name: 'models/text-embedding-004', supportedGenerationMethods: ['embedContent'] }] }); } throw Error('unexpected'); } });
    await assert.rejects(() => ai.geminiModels(), e => e.status === 409);
    ai.configure({ geminiKey: KEY, geminiModel: 'gemini-2.5-flash' });
    const list = await ai.geminiModels();
    assert.deepEqual(list.text.map(m => [m.id, m.label]), [['gemini-2.5-flash', 'Gemini 2.5 Flash']]);
    assert.deepEqual(list.image.map(m => m.id), ['gemini-2.5-flash-image']);
    assert.deepEqual(list.current, { text: 'gemini-2.5-flash', image: 'gemini-2.5-flash-image' });
    await ai.geminiModels(); assert.equal(lists, 1, 'cached');
  } finally { await f.cleanup(); }
});
