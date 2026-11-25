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
      // Every model is busy here, so the message says so and names what was tried; Google's own reason goes to the log.
      assert.equal(e.status, 502); assert.match(e.message, /^All Gemini models tried are busy right now \(HTTP 503, also tried /); assert.match(e.message, /Try again in a few minutes\.$/);
      assert.ok(!/AIza|https?:/.test(e.message), 'no key or URL in the message'); return true;
    });
    assert.ok(warnings.some(w => /\[assistant\] gemini HTTP 503 The model is overloaded\. See \[url\]/.test(w)), "the log keeps Google's reason, without the URL");
    assert.ok(!warnings.some(w => /AIza/.test(w)), 'the key never reaches the log');

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
    await assert.rejects(() => ai.draft({ platform: 'instagram', mediaIds: [f.media.id] }), /All Gemini models tried are busy right now \(HTTP 503, also tried gemini-flash-lite-latest\)\. This is Google's capacity, not your quota\./);
    assert.deepEqual(seen.slice(3), ['gemini-flash-lite-latest'], 'without a model list the Flash-Lite alias is the fallback');
    assert.equal(seen.length, 4, 'three tries on the chosen model, one on the fallback');
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

test('when every flash model is full (as seen in production), Flash-Lite writes the draft', async () => {
  const f = await fixture();
  try {
    const seen = [];
    const fetch = async url => {
      const u = new URL(url);
      if (u.pathname === '/v1beta/models') return Response.json({ models: ['gemini-flash-latest', 'gemini-3.8-flash', 'gemini-3.7-flash', 'gemini-3.5-flash-lite', 'gemini-flash-lite-latest', 'gemini-3.1-pro-preview'].map(id => ({ name: 'models/' + id, supportedGenerationMethods: ['generateContent'] })) });
      const model = decodeURIComponent(u.pathname.split('/models/')[1].split(':')[0]); seen.push(model);
      return /lite/.test(model) ? ok() : failure(503, 'This model is currently experiencing high demand.');
    };
    const ai = createAssistant(f.store, { retryMs: 0, fetch });
    ai.configure({ geminiKey: KEY, geminiModel: 'gemini-3.7-flash' });
    f.store.set('assistant.lastRequest', 0);
    assert.equal((await ai.draft({ platform: 'instagram', mediaIds: [f.media.id] })).title, 'Judul');
    assert.deepEqual(seen, ['gemini-3.7-flash', 'gemini-3.7-flash', 'gemini-3.7-flash', 'gemini-flash-latest', 'gemini-flash-lite-latest'], 'one other flash model, then Flash-Lite; never a preview');
  } finally { await f.cleanup(); }
});

// Google's real 429 body: which quota ran out, and how long to wait.
const quotaError = ({ quotaId, retryDelay = '', value = '20' }) => Response.json({ error: { code: 429, status: 'RESOURCE_EXHAUSTED', message: 'You exceeded your current quota, please check your plan and billing details.', details: [
  { '@type': 'type.googleapis.com/google.rpc.QuotaFailure', violations: [{ quotaMetric: 'generativelanguage.googleapis.com/generate_content_free_tier_requests', quotaId, quotaValue: value }] },
  ...(retryDelay ? [{ '@type': 'type.googleapis.com/google.rpc.RetryInfo', retryDelay }] : []),
] } }, { status: 429 });

test('a per-minute quota is waited out once, then other models are tried; the message says it is per minute', async () => {
  const f = await fixture();
  try {
    const seen = [];
    const ai = createAssistant(f.store, { retryMs: 0, fetch: async url => {
      const u = new URL(url); if (u.pathname === '/v1beta/models') return failure(500, 'no list', 'INTERNAL');
      seen.push(decodeURIComponent(u.pathname.split('/models/')[1].split(':')[0]));
      return seen.length === 2 ? ok() : quotaError({ quotaId: 'GenerateRequestsPerMinutePerProjectPerModel-FreeTier', retryDelay: '12s' });
    } });
    ai.configure({ geminiKey: KEY });
    f.store.set('assistant.lastRequest', 0);
    assert.equal((await ai.draft({ platform: 'instagram', mediaIds: [f.media.id] })).title, 'Judul');
    assert.deepEqual(seen, ['gemini-flash-latest', 'gemini-flash-latest'], 'the short per-minute wait was enough');

    seen.length = 0; f.store.set('assistant.lastRequest', 0);
    const stuck = createAssistant(f.store, { retryMs: 0, fetch: async url => { const u = new URL(url); if (u.pathname === '/v1beta/models') return failure(500, 'no list', 'INTERNAL'); seen.push(decodeURIComponent(u.pathname.split('/models/')[1].split(':')[0])); return quotaError({ quotaId: 'GenerateRequestsPerMinutePerProjectPerModel-FreeTier', retryDelay: '30s' }); } });
    await assert.rejects(() => stuck.draft({ platform: 'instagram', mediaIds: [f.media.id] }), /Gemini's per-minute quota is reached \(also tried gemini-flash-lite-latest\)\. Wait a minute/);
    assert.deepEqual(seen, ['gemini-flash-latest', 'gemini-flash-lite-latest'], 'a 30 s delay is not waited out; the other model is tried instead');
  } finally { await f.cleanup(); }
});

test('a per-day quota is never waited out, falls back to other models, and says when it resets', async () => {
  const f = await fixture();
  try {
    const seen = [];
    const ai = createAssistant(f.store, { retryMs: 0, fetch: async url => {
      const u = new URL(url); if (u.pathname === '/v1beta/models') return failure(500, 'no list', 'INTERNAL');
      const model = decodeURIComponent(u.pathname.split('/models/')[1].split(':')[0]); seen.push(model);
      return model === 'gemini-flash-lite-latest' ? ok() : quotaError({ quotaId: 'GenerateRequestsPerDayPerProjectPerModel-FreeTier', retryDelay: '5s' });
    } });
    ai.configure({ geminiKey: KEY });
    f.store.set('assistant.lastRequest', 0);
    assert.equal((await ai.draft({ platform: 'instagram', mediaIds: [f.media.id] })).title, 'Judul', 'Flash-Lite has its own daily quota');
    assert.deepEqual(seen, ['gemini-flash-latest', 'gemini-flash-lite-latest']);

    const dead = createAssistant(f.store, { retryMs: 0, fetch: async url => { const u = new URL(url); if (u.pathname === '/v1beta/models') return failure(500, 'no list', 'INTERNAL'); return quotaError({ quotaId: 'GenerateRequestsPerDayPerProjectPerModel-FreeTier', value: '0' }); } });
    f.store.set('assistant.lastRequest', 0);
    await assert.rejects(() => dead.draft({ platform: 'instagram', mediaIds: [f.media.id] }), /Gemini's daily quota is used up \(this model has no free allowance on this key\); also tried gemini-flash-lite-latest\. Daily limits reset at midnight Pacific time \(about 15:00 WIB\)\. Choose another model in Settings, turn on billing/);
  } finally { await f.cleanup(); }
});

test('the quota messages have Indonesian translations', async () => {
  const { simplePatterns } = await import('../src/client/simple-i18n.js');
  const translate = text => { for (const [re, fn] of simplePatterns) { const m = re.exec(text); if (m) return fn(...m); } return null; };
  assert.match(translate("Gemini's daily quota is used up; also tried gemini-flash-lite-latest. Daily limits reset at midnight Pacific time (about 15:00 WIB). Choose another model in Settings, turn on billing in Google AI Studio, or try again after the reset."), /^Kuota harian Gemini habis; juga dicoba gemini-flash-lite-latest\. Batas harian direset tengah malam waktu Pasifik/);
  assert.match(translate("Gemini's per-minute quota is reached. Wait a minute and try again; Create post asks for one text per platform, so choosing fewer platforms uses less of it."), /^Kuota per menit Gemini tercapai\. Tunggu semenit/);
});
