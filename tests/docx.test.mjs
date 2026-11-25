import test from 'node:test';
import assert from 'node:assert/strict';
import { deflateRawSync } from 'node:zlib';
import { docxToMarkdown, documentToMarkdown, parseXml } from '../src/client/docx.js';
import { parseArticleMarkdown } from '../src/client/package-parse.js';

const W = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"';
const run = (text, { b = false, i = false } = {}) => `<w:r>${b || i ? `<w:rPr>${b ? '<w:b/>' : ''}${i ? '<w:i/>' : ''}</w:rPr>` : ''}<w:t xml:space="preserve">${text}</w:t></w:r>`;
const para = (inner, style = '', num = null) => `<w:p><w:pPr>${style ? `<w:pStyle w:val="${style}"/>` : ''}${num ? `<w:numPr><w:ilvl w:val="${num.level || 0}"/><w:numId w:val="${num.id}"/></w:numPr>` : ''}</w:pPr>${inner}</w:p>`;
const cell = inner => `<w:tc><w:tcPr/>${para(inner, 'Compact')}</w:tc>`;
const numbering = `<w:numbering ${W}><w:abstractNum w:abstractNumId="1"><w:lvl w:ilvl="0"><w:numFmt w:val="bullet"/></w:lvl></w:abstractNum><w:abstractNum w:abstractNumId="2"><w:lvl w:ilvl="0"><w:numFmt w:val="decimal"/></w:lvl></w:abstractNum><w:num w:numId="10"><w:abstractNumId w:val="1"/></w:num><w:num w:numId="11"><w:abstractNumId w:val="2"/></w:num></w:numbering>`;
const rels = `<Relationships><Relationship Id="rId9" Type="x" Target="https://vayora.id/blog/apa-itu-villa-pms" TargetMode="External"/><Relationship Id="rId1" Type="x" Target="styles.xml"/></Relationships>`;

const body = [
  para(run('Artikel &amp; Uji'), 'Heading1'),
  para(run('Pembuka ') + run('tebal', { b: true }) + run(' dan ') + run('miring', { i: true }) + run('. Baca ') + `<w:hyperlink r:id="rId9">${run('Apa itu PMS', { b: true })}</w:hyperlink>` + run('.')),
  para(run('Bagian'), 'Heading2'),
  para(run('Satu'), 'Compact', { id: 11 }), para(run('Dua'), 'Compact', { id: 11 }), para(run('Turunan', {}), 'Compact', { id: 10, level: 1 }),
  para(run('Poin A'), 'Compact', { id: 10 }),
  para(run('Kutipan penting'), 'BlockText'),
  '<w:p></w:p>',
  `<w:tbl><w:tr>${cell(run('Aturan', { b: true }))}${cell(run('Contoh', { b: true }))}</w:tr><w:tr>${cell(run('Jam'))}${cell(run('14.00 | siang'))}</w:tr></w:tbl>`,
  para(run('Penutup')),
].join('');
const documentXml = `<?xml version="1.0"?><w:document ${W}><w:body>${body}<w:sectPr/></w:body></w:document>`;

// Same helper as the zip tests: an in-memory zip (deflate).
function buildZip(entries) {
  const parts = [], central = []; let offset = 0;
  for (const { name, data } of entries) {
    const nameBytes = Buffer.from(name), raw = Buffer.from(data), packed = deflateRawSync(raw);
    const local = Buffer.alloc(30); local.writeUInt32LE(0x04034b50, 0); local.writeUInt16LE(8, 8); local.writeUInt32LE(packed.length, 18); local.writeUInt32LE(raw.length, 22); local.writeUInt16LE(nameBytes.length, 26);
    const head = Buffer.alloc(46); head.writeUInt32LE(0x02014b50, 0); head.writeUInt16LE(8, 10); head.writeUInt32LE(packed.length, 20); head.writeUInt32LE(raw.length, 24); head.writeUInt16LE(nameBytes.length, 28); head.writeUInt32LE(offset, 42);
    parts.push(local, nameBytes, packed); central.push(head, nameBytes); offset += 30 + nameBytes.length + packed.length;
  }
  const dir = Buffer.concat(central), end = Buffer.alloc(22); end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(entries.length, 8); end.writeUInt16LE(entries.length, 10); end.writeUInt32LE(dir.length, 12); end.writeUInt32LE(offset, 16);
  return Buffer.concat([...parts, dir, end]);
}

test('Word documents become Markdown: headings, merged runs, links, lists (bullet vs numbered), quotes, tables, entities', () => {
  const md = documentToMarkdown(documentXml, { numberingXml: numbering, relsXml: rels });
  assert.equal(md, [
    '# Artikel & Uji', '',
    'Pembuka **tebal** dan *miring*. Baca [**Apa itu PMS**](https://vayora.id/blog/apa-itu-villa-pms).', '',
    '## Bagian', '',
    '1. Satu', '2. Dua', '  - Turunan', '- Poin A', '',
    '> Kutipan penting', '',
    '| Aturan | Contoh |', '| --- | --- |', '| Jam | 14.00 \\| siang |', '',
    'Penutup', '',
  ].join('\n'));
  assert.deepEqual(parseXml('<a x="1&amp;2"><b/>t&lt;</a>').children[0], { name: 'a', attrs: { x: '1&2' }, children: [{ name: 'b', attrs: {}, children: [] }, 't<'] });
});

test('a .docx file is read through its zip parts, and a Word article parses like its Markdown twin', async () => {
  const meta = [
    para(run('03 — SOP Check-in'), 'Heading1'), para(run('Metadata SEO'), 'Heading2'),
    `<w:tbl><w:tr>${cell(run('Field', { b: true }))}${cell(run('Isi', { b: true }))}</w:tr>` + [['Terbit', 'Jumat, 27 November 2026, 07.00 WIB'], ['H1', 'SOP Check-in dan Check-out'], ['Meta description', 'Ringkasan SOP.'], ['Slug', '/blog/sop-check-in'], ['Kategori', 'Operasional']].map(([k, v]) => `<w:tr>${cell(run(k))}${cell(run(v))}</w:tr>`).join('') + '</w:tbl>',
    para(run('Prompt gambar'), 'Heading2'),
    `<w:tbl><w:tr>${cell(run('Posisi'))}${cell(run('Prompt (Inggris)'))}${cell(run('Alt text'))}${cell(run('Nama file'))}</w:tr><w:tr>${cell(run('Utama 16:9'))}${cell(run('Photo of a welcome'))}${cell(run('Penjaga menyambut tamu'))}${cell(run('sop.webp'))}</w:tr></w:tbl>`,
    para(run('Naskah artikel'), 'Heading2'), para(run('27 November 2026 — 7 menit baca', { i: true })),
    para(run('Paragraf pembuka.')), para(run('1. Aturan Dasar'), 'Heading3'), para(run('Isi bagian.')),
    para(run('Ditulis oleh Tim Vayora', { i: true })),
    para(run('Caption Instagram (carousel)'), 'Heading2'), para(run('Bukan bagian artikel.')),
  ].join('');
  const xml = `<w:document ${W}><w:body>${meta}</w:body></w:document>`;
  const file = new File([buildZip([{ name: 'word/document.xml', data: xml }, { name: 'word/numbering.xml', data: numbering }])], '03-sop.docx');
  const [article] = parseArticleMarkdown(await docxToMarkdown(file), '03-sop.md');
  assert.equal(article.blog.slug, 'sop-check-in'); assert.equal(article.title, 'SOP Check-in dan Check-out'); assert.equal(article.date, '2026-11-27');
  assert.equal(article.blog.category, 'Operasional'); assert.deepEqual(article.files, ['sop.webp']); assert.equal(article.blog.heroPrompt, 'Photo of a welcome');
  assert.equal(article.blog.body, 'Paragraf pembuka.\n\n### 1. Aturan Dasar\n\nIsi bagian.', 'date line, byline and the Instagram caption stay out of the body');
  await assert.rejects(() => docxToMarkdown(new File([buildZip([{ name: 'other.txt', data: 'x' }])], 'x.docx')), /not a valid Word document/);
});
