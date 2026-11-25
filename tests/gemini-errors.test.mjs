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
