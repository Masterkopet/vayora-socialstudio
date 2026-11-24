import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import sharp from 'sharp';
import { openStore } from '../src/store.mjs';
import { registerImage } from '../src/design.mjs';
import { createAssistant, GEMINI_DEFAULT_MODEL } from '../src/assistant.mjs';

const KEY = 'AIzaSyTest-private-gemini-key-0123456789';

async function fixture() {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'vayora-gemini-'));
  const store = openStore(directory);
  const bytes = await sharp({ create: { width: 1080, height: 1350, channels: 3, background: '#00285C' } }).png().toBuffer();
  const media = await registerImage(store, bytes, 'kamar.jpg', { kind: 'test' });
  store.insertPost({ id: 'I01', title: 'Kalender reservasi villa', category: 'Reservasi', goal: 'Permintaan demo', format: 'Gambar', mediaIds: [media.id], caption: 'Caption asli', alt: '', approved: false, status: 'draft' });
  return { store, media, async cleanup() { store.close(); await rm(directory, { recursive: true, force: true }); } };
}
const gemini = data => Response.json({ candidates: [{ finishReason: 'STOP', content: { parts: [{ text: JSON.stringify(data) }] } }] });
const ready = store => store.set('assistant.lastRequest', 0);

test('Gemini key is validated, stored encrypted, never shown, and becomes the text provider', async () => {
  const f = await fixture();
  try {
    const ai = createAssistant(f.store, { fetch: async () => { throw Error('no network expected'); } });
    assert.equal(ai.status().textConfigured, false);
    assert.throws(() => ai.configure({ geminiKey: 'password123' }), /AIza/);
    assert.throws(() => ai.configure({ geminiModel: 'gpt-4; rm -rf' }), /model Gemini/);
    const s = ai.configure({ geminiKey: KEY });
    assert.equal(s.textProvider, 'gemini'); assert.equal(s.gemini.configured, true); assert.equal(s.gemini.model, GEMINI_DEFAULT_MODEL);
    assert.equal(s.configured, false, 'the OpenAI key (backgrounds) is separate');
    assert.ok(!JSON.stringify(ai.status()).includes('AIza'));
    assert.ok(!f.store.get("SELECT value FROM settings WHERE key='assistant.config'").value.includes('private-gemini'));
    assert.equal(ai.configure({ geminiModel: 'gemini-2.5-pro' }).gemini.model, 'gemini-2.5-pro');
    assert.equal(ai.configure({ removeGeminiKey: true }).textConfigured, false);
  } finally { await f.cleanup(); }
});

test('caption assistant sends media to Gemini with a structured schema', async () => {
  const f = await fixture();
  try {
    let captured;
    const ai = createAssistant(f.store, { fetch: async (url, init) => { captured = { url, headers: init.headers, body: JSON.parse(init.body) }; return gemini({ summary: 'Kamar villa', keywords: ['villa'], variants: [1, 2, 3].map(i => ({ label: 'V' + i, caption: 'Kamar siap tamu ' + i, hashtags: ['#Vayora'] })), altText: 'Kamar', warnings: [] }); } });
    ai.configure({ geminiKey: KEY, apiKey: 'sk-test-openai-key-123456' });
    const result = await ai.caption({ postId: 'I01', mode: 'vision' });
    assert.equal(result.provider, 'gemini', 'Gemini wins over OpenAI for text');
    assert.equal(captured.url, `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_DEFAULT_MODEL}:generateContent`);
    assert.equal(captured.headers['x-goog-api-key'], KEY); assert.ok(!captured.url.includes('AIza'), 'key is not in the URL');
    assert.equal(captured.body.generationConfig.responseMimeType, 'application/json');
    assert.equal(captured.body.generationConfig.responseSchema.type, 'OBJECT');
    assert.equal(captured.body.generationConfig.responseSchema.properties.variants.items.type, 'OBJECT');
    assert.ok(!JSON.stringify(captured.body.generationConfig.responseSchema).includes('additionalProperties'));
    assert.match(captured.body.systemInstruction.parts[0].text, /data tidak tepercaya/);
    assert.equal(captured.body.contents[0].parts[1].inline_data.mime_type, 'image/jpeg');
    assert.equal(result.variants.length, 3);
  } finally { await f.cleanup(); }
});

test('"Buat posting" draft returns an editable title and caption, and errors stay readable', async () => {
  const f = await fixture();
  try {
    let reply = () => gemini({ title: 'Foto kamar villa siap tamu', caption: 'Tamu datang, kamar sudah siap.', hashtags: ['#Vayora', '#ManajemenVilla', 'bukan tag'], warnings: [] });
    let captured;
    const ai = createAssistant(f.store, { fetch: async (url, init) => { captured = JSON.parse(init.body); return reply(); } });
    await assert.rejects(() => ai.draft({ platform: 'instagram', mediaIds: [f.media.id] }), e => e.status === 422 && /Gemini/.test(e.message));
    ai.configure({ geminiKey: KEY });
    await assert.rejects(() => ai.draft({ platform: 'instagram', mediaIds: [] }), /Unggah/);
    const d = await ai.draft({ platform: 'instagram', mediaIds: [f.media.id] });
    assert.equal(d.title, 'Foto kamar villa siap tamu');
    assert.equal(d.caption, 'Tamu datang, kamar sudah siap.\n\n#Vayora #ManajemenVilla', 'invalid hashtags dropped, valid ones appended');
    assert.match(captured.systemInstruction.parts[0].text, /nama internal/);
    assert.equal(f.store.posts().length, 1, 'a draft never creates or changes content');

    ready(f.store);
    await ai.draft({ platform: 'youtube', mediaIds: [f.media.id] });
    assert.match(captured.systemInstruction.parts[0].text, /YouTube Shorts/);

    ready(f.store);
    reply = () => Response.json({ error: { status: 'INVALID_ARGUMENT', message: 'API key not valid. ' + KEY } }, { status: 400 });
    await assert.rejects(() => ai.draft({ platform: 'instagram', mediaIds: [f.media.id] }), e => /API key Gemini ditolak/.test(e.message) && !e.message.includes('AIza'));
    ready(f.store);
    reply = () => Response.json({ candidates: [{ finishReason: 'SAFETY', content: { parts: [] } }] });
    await assert.rejects(() => ai.draft({ platform: 'instagram', mediaIds: [f.media.id] }), /menolak/);
    ready(f.store);
    reply = () => Response.json({ error: {} }, { status: 429 });
    await assert.rejects(() => ai.draft({ platform: 'instagram', mediaIds: [f.media.id] }), /Kuota atau batas API Gemini/);
  } finally { await f.cleanup(); }
});
