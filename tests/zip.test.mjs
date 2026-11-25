import test from 'node:test';
import assert from 'node:assert/strict';
import { deflateRawSync } from 'node:zlib';
import { listZip, expandZip, safePath } from '../src/client/zip.js';

// Builds a zip archive in memory: entries are { name, data, deflate? }.
function buildZip(entries) {
  const parts = [], central = []; let offset = 0;
  for (const { name, data, deflate = false } of entries) {
    const nameBytes = Buffer.from(name, 'utf8'), raw = Buffer.from(data), body = deflate ? deflateRawSync(raw) : raw;
    const local = Buffer.alloc(30); local.writeUInt32LE(0x04034b50, 0); local.writeUInt16LE(20, 4); local.writeUInt16LE(0x0800, 6); local.writeUInt16LE(deflate ? 8 : 0, 8); local.writeUInt32LE(body.length, 18); local.writeUInt32LE(raw.length, 22); local.writeUInt16LE(nameBytes.length, 26);
    const head = Buffer.alloc(46); head.writeUInt32LE(0x02014b50, 0); head.writeUInt16LE(20, 4); head.writeUInt16LE(20, 6); head.writeUInt16LE(0x0800, 8); head.writeUInt16LE(deflate ? 8 : 0, 10); head.writeUInt32LE(body.length, 20); head.writeUInt32LE(raw.length, 24); head.writeUInt16LE(nameBytes.length, 28); head.writeUInt32LE(offset, 42);
    parts.push(local, nameBytes, body); central.push(head, nameBytes); offset += 30 + nameBytes.length + body.length;
  }
  const dir = Buffer.concat(central), end = Buffer.alloc(22); end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(entries.length, 8); end.writeUInt16LE(entries.length, 10); end.writeUInt32LE(dir.length, 12); end.writeUInt32LE(offset, 16);
  return Buffer.concat([...parts, dir, end]);
}
const zipFile = (entries, name = 'Articles.zip') => new File([buildZip(entries)], name, { type: 'application/zip' });

test('reads stored and deflated entries, skips folders and unwanted files, and keeps paths like a dropped folder', async () => {
  const long = 'Isi artikel. '.repeat(300);
  const file = zipFile([
    { name: 'md/', data: '' },
    { name: 'md/03-sop.md', data: '# Judul — é\n' + long, deflate: true },
    { name: 'md/00-plan.md', data: 'stored text' },
    { name: 'docx/03-sop.docx', data: 'binary' },
    { name: 'img/hero.webp', data: 'webp-bytes' },
  ]);
  const listed = await listZip(file);
  assert.deepEqual(listed.map(e => e.path), ['md/03-sop.md', 'md/00-plan.md', 'docx/03-sop.docx', 'img/hero.webp']);
  const files = await expandZip(file);
  assert.deepEqual(files.map(f => f.webkitRelativePath), ['Articles/md/03-sop.md', 'Articles/md/00-plan.md', 'Articles/docx/03-sop.docx', 'Articles/img/hero.webp'], 'Word files are kept (the import page drops one when a Markdown twin exists)');
  assert.equal(await files[0].text(), '# Judul — é\n' + long, 'deflate and UTF-8 survive');
  assert.equal(await files[1].text(), 'stored text'); assert.equal(files[3].type, 'image/webp');
});

test('rejects broken, encrypted and non-zip files with readable errors; entry names cannot escape the archive', async () => {
  await assert.rejects(() => listZip(new File(['not a zip at all'], 'x.zip')), /not a valid zip/);
  const encrypted = buildZip([{ name: 'a.md', data: 'x' }]); encrypted.writeUInt16LE(0x0801, encrypted.indexOf(Buffer.from([0x50, 0x4b, 0x01, 0x02])) + 8);
  await assert.rejects(() => listZip(new File([encrypted], 'e.zip')), /Encrypted/);
  assert.equal(safePath('..\\..\\evil/../a.md'), 'evil/a.md'); assert.equal(safePath('C:/x/y.md'), 'x/y.md'); assert.equal(safePath('/abs/p.md'), 'abs/p.md');
  const hostile = await expandZip(zipFile([{ name: '../../escape.md', data: 'x' }], 'h.zip'));
  assert.deepEqual(hostile.map(f => f.webkitRelativePath), ['h/escape.md']);
});
