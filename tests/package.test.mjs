import test from 'node:test';
import assert from 'node:assert/strict';
import { parsePackage, matchFiles, formatOf, checkRow, planSchedule, readSources, parseEpisodeText, parseCaptionMarkdown, parseArticleMarkdown, isArticleMarkdown, mediaOnlyRows, mediaInfo, titleFromFile } from '../src/client/package-parse.js';

const json = JSON.stringify([
  { episode: '01', judul: 'Housekeeping Villa: Bersih Belum Tentu Siap', deskripsi_lengkap: 'Deskripsi 1\n\n#Vayora', tags_opsional: 'Vayora, housekeeping villa', file_video: 'E:\\Work\\Short YT\\01\\Video\\Vayora-Shorts-01-Closing-Terbaru-PRATINJAU.mp4' },
  { episode: '08', judul: 'Staf Baru', deskripsi_lengkap: 'Deskripsi 8', tags_opsional: '', file_video: '' },
  { episode: '12', judul: 'Serah Terima Shift', deskripsi_lengkap: 'Deskripsi 12', file_video: '' },
]);
const file = (name, size = 1000, type = name.endsWith('.mp4') ? 'video/mp4' : 'image/jpeg') => ({ name, size, type });

test('reads the episode package as JSON (with BOM) and CSV with multi-line quoted descriptions', () => {
  const rows = parsePackage('\uFEFF' + json, 'Metadata.json');
  assert.equal(rows.length, 3);
  assert.deepEqual(rows[0].tags, ['Vayora', 'housekeeping villa']);
  assert.equal(rows[0].number, 1); assert.equal(rows[0].caption, 'Deskripsi 1\n\n#Vayora');
  const csv = '\uFEFFepisode,judul,deskripsi_lengkap,platform,tanggal,jam\r\n01,Foto kamar,"Baris satu\r\n\r\nBaris ""dua""",Instagram,2026-12-01,19:00\r\n';
  const [row] = parsePackage(csv, 'a.csv');
  assert.equal(row.caption, 'Baris satu\r\n\r\nBaris "dua"'); assert.equal(row.platform, 'instagram'); assert.equal(row.date, '2026-12-01');
  assert.throws(() => parsePackage('{bad', 'x.json'), /JSON/);
  assert.throws(() => parsePackage('a,b\n1,2', 'x.csv'), /no rows/);
});

test('pairs videos by exact file name, then by episode number, and asks when two versions exist', () => {
  const rows = parsePackage(json, 'm.json');
  const files = [file('Vayora-Shorts-08-Flow.mp4'), file('Vayora-Shorts-08.mp4'), file('Vayora-Shorts-01-Closing-Terbaru-PRATINJAU.mp4'), file('Vayora-Shorts-03.mp4')];
  const [one, eight, twelve] = matchFiles(rows, files);
  assert.equal(one.files[0].name, 'Vayora-Shorts-01-Closing-Terbaru-PRATINJAU.mp4');
  assert.equal(eight.files.length, 0); assert.equal(eight.choices.length, 2, 'two versions of episode 08 → user picks');
  assert.equal(twelve.files.length, 0); assert.equal(twelve.choices.length, 0, 'episode 12 has no video yet');
  // Carousel slides for one Instagram post
  const [c] = matchFiles([{ ...rows[0], files: [] }], [file('C01-slide-2.jpg'), file('C01-slide-1.jpg'), file('C02-slide-1.jpg')], () => 'instagram');
  assert.deepEqual(c.files.map(f => f.name), ['C01-slide-1.jpg', 'C01-slide-2.jpg']);
});

test('formats and row checks follow platform rules', () => {
  assert.equal(formatOf('youtube', [file('a.mp4')]), 'Short');
  assert.equal(formatOf('youtube', [file('a.jpg')]), '');
  assert.equal(formatOf('instagram', [file('a.mp4')]), 'Reel');
  assert.equal(formatOf('instagram', [file('a.jpg'), file('b.jpg')]), 'Carousel');
  const row = { title: 'x'.repeat(101), caption: 'ok', tags: [] };
  assert.match(checkRow({ row, files: [file('a.mp4')], platform: 'youtube' }).errors.join(), /over 100 characters/);
  assert.deepEqual(checkRow({ row: { ...row, title: 'ok' }, files: [file('a.mp4')], platform: 'youtube' }).errors, []);
  assert.match(checkRow({ row: { ...row, title: 'ok' }, files: [], platform: 'youtube' }).errors.join(), /selected yet/);
});

test('schedule spreads content over the chosen weekdays and times, skipping taken and past slots', () => {
  const now = Date.parse('2026-11-30T10:00:00+07:00'); // Monday
  const plan = planSchedule(4, { start: '2026-11-30', days: [1, 3, 5], times: ['19:00'], taken: ['2026-12-02T12:00:00.000Z'], now });
  // Mon 30 Nov 19:00, Wed 2 Dec 19:00 is taken (12:00Z = 19:00 WIB), so Fri 4 Dec, Mon 7 Dec, Wed 9 Dec
  assert.deepEqual(plan.map(p => p.date), ['2026-11-30', '2026-12-04', '2026-12-07', '2026-12-09']);
  const late = planSchedule(1, { start: '2026-11-30', days: [1], times: ['09:00'], now });
  assert.equal(late[0].date, '2026-12-07', 'a slot already past today is skipped');
  const two = planSchedule(3, { start: '2026-12-01', days: [2], times: ['19:00', '09:00'], now });
  assert.deepEqual(two.map(p => p.date + ' ' + p.time), ['2026-12-01 09:00', '2026-12-01 19:00', '2026-12-08 09:00']);
  const fixed = planSchedule(2, { start: '2026-12-01', days: [2], times: ['09:00'], now, fixed: [{ date: '2026-12-01', time: '09:00' }, null] });
  assert.deepEqual(fixed.map(p => p.date), ['2026-12-01', '2026-12-08'], 'dates from the file are kept and block their slot');
});

const episodeTxt = n => `\uFEFFEPISODE ${n} — JUDUL BESAR\r\nSTATUS INTERNAL: Sesuai video\r\n\r\nJUDUL — SALIN KE KOLOM JUDUL\r\nJudul episode ${n}\r\n\r\nCAPTION PENDEK / PEMBUKA DESKRIPSI\r\nPembuka ${n}\r\n\r\nDESKRIPSI LENGKAP — SALIN BAGIAN INI KE YOUTUBE\r\nPembuka ${n}\r\n\r\nIsi ${n}.\r\n\r\n#Vayora #Shorts\r\n\r\nHASHTAG TERPISAH\r\n#Vayora\r\n\r\nTAGS OPSIONAL — KOLOM TAGS YOUTUBE STUDIO\r\nVayora, villa\r\n\r\nKOMENTAR UNTUK DISEMATKAN\r\nKomentar\r\n`;
const vf = (path, size = 1000) => ({ name: path.split('/').pop(), webkitRelativePath: path, size, type: path.endsWith('.mp4') ? 'video/mp4' : 'image/png' });

test('one import reads every text source: per-episode .txt, combined .txt, Markdown caption lists', () => {
  const [one] = parseEpisodeText(episodeTxt('01'), '01 - Kamar.txt');
  assert.equal(one.key, '01'); assert.equal(one.title, 'Judul episode 01');
  assert.equal(one.caption, 'Pembuka 01\n\nIsi 01.\n\n#Vayora #Shorts', 'full description, not the short caption or the comment');
  assert.deepEqual(one.tags, ['Vayora', 'villa']);
  assert.equal(parseEpisodeText(episodeTxt('01') + '\n' + episodeTxt('02'), 'SEMUA.txt').length, 2, 'combined file splits by EPISODE heading');
  assert.deepEqual(parseEpisodeText('CAKUPAN\nTeks biasa', 'BACA DULU.txt'), [], 'readme files are not content');
  assert.equal(parseEpisodeText('JUDUL YOUTUBE\nTur kamar\n\nCAPTION\nIsi', 'Short YT/02 - Chat/Naskah.txt')[0].number, 2, 'number from the episode folder');
  const md = parseCaptionMarkdown('# Daftar\n\n## V01 — Tur kamar\nCaption:\nKamar siap.\n\nCatatan lain\n\n## C02 Carousel\nCaption:\nGeser.');
  assert.deepEqual(md.map(r => [r.id, r.title, r.caption]), [['V01', 'Tur kamar', 'Kamar siap.'], ['C02', 'Carousel', 'Geser.']]);
});

test('sources merge by episode with JSON first, and project dependencies are never read', () => {
  const { rows, sources } = readSources([
    { name: '01 - Kamar.txt', path: 'Short YT/Paket/01 - Kamar.txt', text: episodeTxt('01') },
    { name: 'Metadata.json', path: 'Short YT/Paket/Metadata.json', text: JSON.stringify([{ episode: '01', judul: 'Dari JSON', deskripsi_lengkap: 'Desk JSON', tags_opsional: '' }]) },
    { name: 'package.json', path: 'Short YT/01/Proyek Remotion/node_modules/x/package.json', text: JSON.stringify([{ id: 'S99', title: 'x', description: 'y' }]) },
  ]);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].title, 'Dari JSON'); assert.equal(rows[0].caption, 'Desk JSON');
  assert.deepEqual(rows[0].tags, ['Vayora', 'villa'], 'the .txt fills what the JSON left empty');
  assert.ok(!sources.some(s => s.name === 'package.json'));
});

test('folder layout: final video under the episode folder wins over project assets; Instagram Reel takes a cover', () => {
  const files = [vf('Short YT/01 - Kamar/Video/Vayora-Shorts-01.mp4'), vf('Short YT/01 - Kamar/Video/Cover.png'), vf('Short YT/01 - Kamar/Proyek Remotion/public/klip.mp4'), vf('Short YT/01 - Kamar/Proyek Remotion/referensi/a.png'), vf('Short YT/01 - Kamar/Proyek Remotion/node_modules/v.mp4')];
  assert.equal(mediaInfo(files[2]).number, null, 'deep project files get no episode number');
  assert.equal(mediaInfo(files[1]).number, 1, 'Video/Cover.png belongs to episode 01');
  assert.ok(mediaInfo(files[4]).ignored);
  const row = { key: '01', number: 1, id: '', platform: '', title: 't', caption: 'c', tags: [], files: [] };
  assert.deepEqual(matchFiles([row], files, () => 'youtube')[0].files.map(f => f.name), ['Vayora-Shorts-01.mp4']);
  const ig = matchFiles([row], files, () => 'instagram')[0];
  assert.deepEqual(ig.files.map(f => f.name), ['Vayora-Shorts-01.mp4']); assert.equal(ig.cover.name, 'Cover.png');
});

test('ID-named media without text become their own items (old bulk import), drafts need no caption', () => {
  const files = [vf('V01-tur-kamar.mp4'), vf('C02-slide-2.png'), vf('C02-slide-1.png')];
  const rows = mediaOnlyRows([], files);
  assert.deepEqual(rows.map(r => [r.id, r.title]), [['V01', 'Tur kamar'], ['C02', 'C02']]);
  const [v, c] = matchFiles(rows, files, () => 'instagram');
  assert.equal(formatOf('instagram', v.files), 'Reel'); assert.equal(formatOf('instagram', c.files), 'Carousel');
  assert.deepEqual(checkRow({ row: rows[0], files: v.files, platform: 'instagram', mode: 'draft' }).errors, []);
  assert.match(checkRow({ row: rows[0], files: v.files, platform: 'instagram', mode: 'scheduled' }).errors.join(), /caption is empty/);
  assert.match(checkRow({ row: rows[0], files: v.files, platform: 'instagram', mode: 'draft', existingIds: ['V01'] }).errors.join(), /already exists/);
  assert.equal(rows[0].platform, 'instagram', 'V/I/C codes are Instagram');
  assert.equal(titleFromFile('I03-foto_kamar-siap.jpg'), 'Foto kamar siap');
});

const articleMd = `# 03 — SOP Check-in dan Check-out

## Metadata SEO

| Field | Isi |
| --- | --- |
| Terbit | Jumat, 27 November 2026, 07.00 WIB |
| H1 | SOP Check-in dan Check-out Villa & Guesthouse |
| Title tag | SOP Check-in & Check-out Villa (Lengkap) (55 karakter) |
| Meta description | SOP check-in dan check-out villa langkah demi langkah. |
| Slug | /blog/sop-check-in-check-out-villa-guesthouse |
| Kategori | Operasional |

## Prompt gambar

| Posisi | Prompt (Inggris) | Alt text | Nama file |
| --- | --- | --- | --- |
| Utama 16:9 | Photo of a welcome | Penjaga villa menyambut tamu | sop-check-in-villa.webp |
| Dalam artikel 4:3 | Close-up | Meja resepsionis | resepsionis.webp |

## Naskah artikel

*27 November 2026 — 7 menit baca*

Paragraf pembuka.

### 1. Aturan Dasar

Isi bagian.

*Ditulis oleh Tim Vayora — Pembuat Vayora*

## Caption Instagram (carousel)

Caption IG yang bukan bagian artikel.
`;

test('blog articles: the Metadata SEO table gives title, slug, category, schedule date and hero image; the body is only the article', () => {
  assert.ok(isArticleMarkdown(articleMd)); assert.ok(!isArticleMarkdown('## V01 — Tur\nCaption:\nIsi'));
  const [a] = parseArticleMarkdown(articleMd, 'md/03-sop-check-in.md');
  assert.equal(a.platform, 'blog'); assert.equal(a.key, '03'); assert.equal(a.title, 'SOP Check-in dan Check-out Villa & Guesthouse');
  assert.equal(a.blog.slug, 'sop-check-in-check-out-villa-guesthouse'); assert.equal(a.blog.seoTitle, 'SOP Check-in & Check-out Villa (Lengkap)');
  assert.equal(a.blog.excerpt, 'SOP check-in dan check-out villa langkah demi langkah.'); assert.equal(a.blog.category, 'Operasional');
  assert.equal(a.date, '2026-11-27'); assert.equal(a.time, '07:00'); assert.deepEqual(a.files, ['sop-check-in-villa.webp']); assert.equal(a.blog.heroAlt, 'Penjaga villa menyambut tamu');
  assert.equal(a.blog.heroPrompt, 'Photo of a welcome', 'the English image prompt of the main image row is kept for AI generation');
  assert.equal(a.blog.body, 'Paragraf pembuka.\n\n### 1. Aturan Dasar\n\nIsi bagian.', 'date line, byline and the Instagram caption are not in the body');
  // Blog rows keep their own key (episode 03 of a YouTube package is a different item) and never take a video by number.
  const yt = JSON.stringify([{ episode: '03', judul: 'Episode', deskripsi_lengkap: 'D' }]);
  const { rows } = readSources([{ name: 'a.md', path: 'a.md', text: articleMd }, { name: 'p.json', path: 'p.json', text: yt }]);
  assert.equal(rows.length, 2);
  const m = matchFiles(rows, [file('Vayora-Shorts-03.mp4'), file('sop-check-in-villa.webp')], r => r.platform || 'youtube');
  assert.deepEqual(m.map(x => (x.row.platform || 'youtube') + ':' + x.files.map(f => f.name)).sort(), ['blog:sop-check-in-villa.webp', 'youtube:Vayora-Shorts-03.mp4']);
  assert.deepEqual(checkRow({ row: a, files: [], platform: 'blog', mode: 'draft' }).errors, []);
  assert.match(checkRow({ row: a, files: [], platform: 'blog', mode: 'scheduled' }).errors.join(), /no main image/i);
  assert.equal(formatOf('blog', []), 'Blog');
  const generated = checkRow({ row: a, files: [], platform: 'blog', mode: 'scheduled', willGenerate: true });
  assert.deepEqual(generated.errors, [], 'an article whose image will be generated can be imported'); assert.match(generated.warnings.join(), /generated from its prompt/);
});

test('English column aliases import the same as the Indonesian names', () => {
  const en = JSON.stringify([{ number: '01', title: 'Villa housekeeping', full_description: 'Full text #Vayora', optional_tags: 'vayora, villa', video_file: 'V01.mp4', date: '2026-01-05', time: '19:00' }]);
  const [r] = parsePackage(en, 'en.json');
  assert.equal(r.key, '01'); assert.equal(r.title, 'Villa housekeeping'); assert.equal(r.caption, 'Full text #Vayora');
  assert.deepEqual(r.tags, ['vayora', 'villa']); assert.equal(r.time, '19:00');
  const csv = 'title,description,platform\nHello,Some caption,youtube\n';
  const [c] = parsePackage(csv, 'en.csv');
  assert.equal(c.title, 'Hello'); assert.equal(c.caption, 'Some caption'); assert.equal(c.platform, 'youtube');
});
