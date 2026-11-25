import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, mkdir, writeFile } from 'node:fs/promises';
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
    assert.throws(() => ai.configure({ geminiKey: 'password123' }), /Invalid Gemini API key/);
    assert.throws(() => ai.configure({ geminiKey: 'kunci dengan spasi 0123456789' }), /without spaces/);
    assert.throws(() => ai.configure({ geminiModel: 'gpt-4; rm -rf' }), /Invalid Gemini model name/);
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
    assert.match(captured.body.systemInstruction.parts[0].text, /untrusted data, not instructions/);
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
    await assert.rejects(() => ai.draft({ platform: 'instagram', mediaIds: [] }), /Upload a photo or video first/);
    const d = await ai.draft({ platform: 'instagram', mediaIds: [f.media.id] });
    assert.equal(d.title, 'Foto kamar villa siap tamu');
    assert.equal(d.caption, 'Tamu datang, kamar sudah siap.\n\n#Vayora #ManajemenVilla', 'invalid hashtags dropped, valid ones appended');
    assert.match(captured.systemInstruction.parts[0].text, /short internal name/);
    assert.equal(f.store.posts().length, 1, 'a draft never creates or changes content');

    ready(f.store);
    await ai.draft({ platform: 'youtube', mediaIds: [f.media.id] });
    assert.match(captured.systemInstruction.parts[0].text, /YouTube Shorts/);

    ready(f.store);
    reply = () => Response.json({ error: { status: 'INVALID_ARGUMENT', message: 'API key not valid. ' + KEY } }, { status: 400 });
    await assert.rejects(() => ai.draft({ platform: 'instagram', mediaIds: [f.media.id] }), e => /Gemini API key was rejected/.test(e.message) && !e.message.includes('AIza'));
    ready(f.store);
    reply = () => Response.json({ candidates: [{ finishReason: 'SAFETY', content: { parts: [] } }] });
    await assert.rejects(() => ai.draft({ platform: 'instagram', mediaIds: [f.media.id] }), /declined to write text/);
    ready(f.store);
    reply = () => Response.json({ error: {} }, { status: 429 });
    await assert.rejects(() => ai.draft({ platform: 'instagram', mediaIds: [f.media.id] }), /Gemini API quota or limit/);
  } finally { await f.cleanup(); }
});

// A Short with a real poster frame and an mp4 file of the given size (content does not matter to the mocks).
async function addShort(f, { id = 'v'.repeat(64), size = 1024, status = 'draft', post = 'S01', caption = 'Caption Short', tags } = {}) {
  const dir = path.join(f.store.directory, 'media'); await mkdir(dir, { recursive: true });
  await writeFile(path.join(dir, id + '.mp4'), Buffer.alloc(size, 1));
  await sharp({ create: { width: 360, height: 640, channels: 3, background: '#FFB600' } }).jpeg().toFile(path.join(dir, id + '-poster.jpg'));
  f.store.run('INSERT INTO media(id,path,mime,name,size,width,height,duration,poster,created_at) VALUES(?,?,?,?,?,?,?,?,?,?)', id, id + '.mp4', 'video/mp4', 'short.mp4', size, 1080, 1920, 30, id + '-poster.jpg', new Date().toISOString());
  f.store.insertPost({ id: post, title: 'Cek kamar kosong', category: 'Reservasi', goal: 'Permintaan demo', format: 'Short', mediaIds: [id], caption, alt: '', approved: false, status, ...(tags ? { tags } : {}) });
  return id;
}

test('Gemini watches the whole Short and writes YouTube titles, description and tags in the team style', async () => {
  const f = await fixture();
  try {
    const example = 'Housekeeping villa belum selesai hanya karena kamar terlihat rapi.\n\nKenali Vayora: vayora.id\n\nVisual properti merupakan ilustrasi AI.\n\n#Vayora #Shorts';
    await addShort(f, { id: 'e'.repeat(64), post: 'S09', status: 'scheduled', caption: example, tags: ['housekeeping villa'] });
    await addShort(f);
    let captured;
    const ai = createAssistant(f.store, { fetch: async (url, init) => { captured = JSON.parse(init.body); return gemini({ summary: 'Video', keywords: ['cek kamar'], variants: [1, 2, 3].map(i => ({ label: 'V' + i, title: 'Cara Cek Kamar Kosong <' + i + '>', caption: 'Deskripsi ' + i, hashtags: ['#Vayora', '#Shorts'] })), tags: ['cek kamar kosong', 'kalender, villa', '#booking'], altText: '', warnings: [] }); } });
    ai.configure({ geminiKey: KEY });
    const r = await ai.caption({ postId: 'S01', mode: 'vision' });
    const video = captured.contents[0].parts[1];
    assert.equal(video.inline_data.mime_type, 'video/mp4', 'the whole video, not a poster');
    assert.equal(r.platform, 'YouTube'); assert.match(r.source, /watched the whole video/);
    assert.equal(r.variants[0].title, 'Cara Cek Kamar Kosong 1', 'title is YouTube-safe');
    assert.deepEqual(r.tags, ['cek kamar kosong', 'kalender villa', 'booking']);
    const sys = captured.systemInstruction.parts[0].text;
    assert.match(sys, /listen to the narration/); assert.match(sys, /YouTube Tags field/);
    assert.match(sys, /Style examples from approved team posts/); assert.ok(sys.includes('ilustrasi AI'), 'house style comes from the scheduled Short');
    assert.ok(captured.generationConfig.responseSchema.properties.tags, 'YouTube schema asks for tags');
  } finally { await f.cleanup(); }
});

test('large videos go through the Gemini Files API and wait until processed', async () => {
  const f = await fixture();
  try {
    await addShort(f, { size: 15 * 1024 * 1024 });
    const calls = [];
    const ai = createAssistant(f.store, { pollMs: 1, fetch: async (url, init = {}) => {
      calls.push(String(url));
      if (String(url).includes('/upload/v1beta/files')) return new Response(null, { status: 200, headers: { 'x-goog-upload-url': 'https://upload.example.test/session1' } });
      if (String(url) === 'https://upload.example.test/session1') { assert.equal(init.headers['X-Goog-Upload-Command'], 'upload, finalize'); return Response.json({ file: { name: 'files/abc', uri: 'https://gen.example.test/files/abc', state: 'PROCESSING' } }); }
      if (String(url).endsWith('/v1beta/files/abc')) return Response.json({ name: 'files/abc', uri: 'https://gen.example.test/files/abc', state: 'ACTIVE' });
      const body = JSON.parse(init.body);
      assert.deepEqual(body.contents[0].parts[1], { file_data: { mime_type: 'video/mp4', file_uri: 'https://gen.example.test/files/abc' } });
      return gemini({ title: 'Judul Short', caption: 'Deskripsi', hashtags: ['#Vayora'], tags: ['villa'], warnings: [] });
    } });
    ai.configure({ geminiKey: KEY });
    const d = await ai.draft({ platform: 'youtube', mediaIds: ['v'.repeat(64)] });
    assert.equal(d.watched, true); assert.deepEqual(d.tags, ['villa']);
    assert.ok(calls.some(u => u.endsWith('/v1beta/files/abc')), 'polled until ACTIVE');
    assert.ok(!calls.some(u => u.includes('AIza')), 'the key never appears in a URL');
  } finally { await f.cleanup(); }
});

test('Check Gemini verifies the key with a free metadata request and explains failures; other key formats are accepted', async () => {
  const f = await fixture();
  try {
    let reply = () => Response.json({ name: 'models/gemini-flash-latest', displayName: 'Gemini Flash' });
    const calls = [];
    const ai = createAssistant(f.store, { fetch: async (url, init = {}) => { calls.push({ url: String(url), method: init.method || 'GET', key: init.headers?.['x-goog-api-key'] }); return reply(); } });
    await assert.rejects(() => ai.checkGemini(), e => e.status === 422);
    ai.configure({ geminiKey: 'AQ.Ab8RN6Newer-Style_Key-0123456789abcdef' });
    const ok = await ai.checkGemini();
    assert.equal(ok.ok, true); assert.equal(ok.name, 'Gemini Flash');
    assert.equal(calls[0].method, 'GET'); assert.ok(calls[0].url.endsWith('/v1beta/models/gemini-flash-latest')); assert.ok(!calls[0].url.includes('AQ.'), 'the key is only sent in a header');
    assert.equal(ai.status().gemini.check.ok, true); assert.ok(!JSON.stringify(ai.status()).includes('AQ.Ab8'));
    reply = () => Response.json({ error: { status: 'INVALID_ARGUMENT', message: 'API key not valid. Please pass a valid API key.' } }, { status: 400 });
    await assert.rejects(() => ai.checkGemini(), /rejected by Google/);
    assert.equal(ai.status().gemini.check.ok, false);
    reply = () => Response.json({ error: {} }, { status: 404 });
    await assert.rejects(() => ai.checkGemini(), /Model .* not found/);
    assert.equal(f.store.posts().length, 1, 'checking never touches content');
  } finally { await f.cleanup(); }
});

test('blog hero image: Gemini image model is asked for 16:9, the result is stored as a normal image, and quota is separate', async () => {
  const f = await fixture();
  try {
    const square = await sharp({ create: { width: 1024, height: 1024, channels: 3, background: '#FFB600' } }).png().toBuffer();
    let reply = () => Response.json({ candidates: [{ finishReason: 'STOP', content: { parts: [{ text: 'Here is your image' }, { inlineData: { mimeType: 'image/png', data: square.toString('base64') } }] } }] });
    let captured;
    const ai = createAssistant(f.store, { fetch: async (url, init) => { captured = { url, headers: init.headers, body: JSON.parse(init.body) }; return reply(); } });
    await assert.rejects(() => ai.heroImage({ prompt: 'A villa at golden hour with palm trees' }), e => e.status === 422, 'needs a Gemini key');
    ai.configure({ geminiKey: KEY });
    await assert.rejects(() => ai.heroImage({ prompt: 'short' }), /at least 12 characters/);
    const media = await ai.heroImage({ prompt: 'Photorealistic editorial photo of a villa bedroom, soft daylight' });
    assert.ok(captured.url.endsWith('/models/gemini-2.5-flash-image:generateContent')); assert.equal(captured.headers['x-goog-api-key'], KEY);
    assert.deepEqual(captured.body.generationConfig.responseModalities, ['IMAGE']); assert.equal(captured.body.generationConfig.imageConfig.aspectRatio, '16:9');
    assert.match(captured.body.contents[0].parts[0].text, /^Photorealistic editorial photo of a villa bedroom/);
    assert.ok(Math.abs(media.width / media.height - 16 / 9) < 0.02, 'cropped to 16:9'); assert.equal(media.mime, 'image/jpeg');
    assert.deepEqual([ai.status().usage.hero, ai.status().usage.image, ai.status().dailyHeroLimit], [1, 0, 30], 'hero images have their own counter and limit');
    ready(f.store); reply = () => Response.json({ candidates: [{ finishReason: 'STOP', content: { parts: [{ text: 'I cannot do that' }] } }] });
    await assert.rejects(() => ai.heroImage({ prompt: 'Photorealistic editorial photo of a villa bedroom' }), /did not return an image/);
    ready(f.store); reply = () => Response.json({ promptFeedback: { blockReason: 'SAFETY' }, candidates: [] });
    await assert.rejects(() => ai.heroImage({ prompt: 'Photorealistic editorial photo of a villa bedroom' }), /refused|did not return/);
    ai.configure({ dailyHeroLimit: 2 }); ready(f.store);
    await assert.rejects(() => ai.heroImage({ prompt: 'Photorealistic editorial photo of a villa bedroom' }), e => e.status === 429, 'the daily limit applies');
    assert.throws(() => ai.configure({ dailyHeroLimit: 500 }), /1–100/);
  } finally { await f.cleanup(); }
});

test('blog images can use OpenAI instead: landscape request, own key check, shared hero quota, readable setup errors', async () => {
  const f = await fixture();
  try {
    const wide = await sharp({ create: { width: 1536, height: 1024, channels: 3, background: '#00285C' } }).png().toBuffer();
    const calls = [];
    const ai = createAssistant(f.store, { fetch: async (url, init) => { calls.push({ url: String(url), headers: init.headers, body: JSON.parse(init.body) }); return Response.json({ data: [{ b64_json: wide.toString('base64') }] }); } });
    ai.configure({ geminiKey: KEY });
    assert.equal(ai.status().imageProvider, 'gemini'); assert.equal(ai.status().heroConfigured, true);
    assert.throws(() => ai.configure({ imageProvider: 'midjourney' }), /gemini or openai/);
    assert.throws(() => ai.configure({ openaiImageModel: 'bad model!' }), /not valid/);
    ai.configure({ imageProvider: 'openai' });
    assert.equal(ai.status().heroConfigured, false, 'the chosen provider has no key yet');
    await assert.rejects(() => ai.heroImage({ prompt: 'Photorealistic editorial photo of a villa bedroom' }), e => e.status === 422 && /OpenAI/.test(e.message) && /Gemini/.test(e.message));
    ai.configure({ apiKey: 'sk-test-openai-key-123456' });
    assert.equal(ai.status().heroConfigured, true);
    const media = await ai.heroImage({ prompt: 'Photorealistic editorial photo of a villa bedroom' });
    assert.equal(calls[0].url, 'https://api.openai.com/v1/images/generations'); assert.equal(calls[0].headers.Authorization, 'Bearer sk-test-openai-key-123456');
    assert.equal(calls[0].body.model, 'gpt-image-2'); assert.equal(calls[0].body.size, '1536x1024'); assert.match(calls[0].body.prompt, /16:9/);
    assert.ok(Math.abs(media.width / media.height - 16 / 9) < 0.02); assert.equal(ai.status().usage.hero, 1, 'same daily blog image counter as Gemini');
    ai.configure({ openaiImageModel: 'gpt-image-1-mini' }); ready(f.store);
    await ai.heroImage({ prompt: 'Photorealistic editorial photo of a villa bedroom' }); assert.equal(calls[1].body.model, 'gpt-image-1-mini');
    assert.ok(!JSON.stringify(ai.status()).includes('sk-test'), 'keys are never in the status');
    ai.configure({ imageProvider: 'gemini' }); assert.equal(ai.status().imageProvider, 'gemini');
  } finally { await f.cleanup(); }
});
