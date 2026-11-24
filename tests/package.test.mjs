import test from 'node:test';
import assert from 'node:assert/strict';
import { parsePackage, matchFiles, formatOf, checkRow, planSchedule } from '../src/client/package-parse.js';

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
  assert.throws(() => parsePackage('a,b\n1,2', 'x.csv'), /Tidak ada baris/);
});

test('pairs videos by exact file name, then by episode number, and asks when two versions exist', () => {
  const rows = parsePackage(json, 'm.json');
  const files = [file('Vayora-Shorts-08-Flow.mp4'), file('Vayora-Shorts-08.mp4'), file('Vayora-Shorts-01-Closing-Terbaru-PRATINJAU.mp4'), file('Vayora-Shorts-03.mp4')];
  const [one, eight, twelve] = matchFiles(rows, files);
  assert.equal(one.files[0].name, 'Vayora-Shorts-01-Closing-Terbaru-PRATINJAU.mp4');
  assert.equal(eight.files.length, 0); assert.equal(eight.choices.length, 2, 'two versions of episode 08 → user picks');
  assert.equal(twelve.files.length, 0); assert.equal(twelve.choices.length, 0, 'episode 12 has no video yet');
  // Carousel slides for one Instagram post
  const [c] = matchFiles([{ ...rows[0], files: [] }], [file('C01-slide-2.jpg'), file('C01-slide-1.jpg'), file('C02-slide-1.jpg')]);
  assert.deepEqual(c.files.map(f => f.name), ['C01-slide-1.jpg', 'C01-slide-2.jpg']);
});

test('formats and row checks follow platform rules', () => {
  assert.equal(formatOf('youtube', [file('a.mp4')]), 'Short');
  assert.equal(formatOf('youtube', [file('a.jpg')]), '');
  assert.equal(formatOf('instagram', [file('a.mp4')]), 'Reel');
  assert.equal(formatOf('instagram', [file('a.jpg'), file('b.jpg')]), 'Carousel');
  const row = { title: 'x'.repeat(101), caption: 'ok', tags: [] };
  assert.match(checkRow({ row, files: [file('a.mp4')], platform: 'youtube' }).errors.join(), /100 karakter/);
  assert.deepEqual(checkRow({ row: { ...row, title: 'ok' }, files: [file('a.mp4')], platform: 'youtube' }).errors, []);
  assert.match(checkRow({ row: { ...row, title: 'ok' }, files: [], platform: 'youtube' }).errors.join(), /belum dipilih/);
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
