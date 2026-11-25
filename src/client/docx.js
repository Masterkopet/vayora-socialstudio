// Word (.docx) → Markdown, so articles written in Word can be imported like .md files. Handles what article text needs:
// headings, paragraphs, bold/italic, hyperlinks, bullet and numbered lists, block quotes and tables. Images, comments
// and footnotes are ignored. A .docx is a zip, read with the zip reader; the XML is parsed with a tiny built-in parser so
// the same code runs in the browser and in tests.
import { listZip } from './zip.js';

const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };
const decode = s => s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e) => e[0] === '#' ? String.fromCodePoint(e[1].toLowerCase() === 'x' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10)) : (ENTITIES[e] ?? m));

// Minimal XML → tree: { name, attrs, children } with text nodes as plain strings.
export function parseXml(xml) {
  const root = { name: '#root', attrs: {}, children: [] }, stack = [root];
  const re = /<!--[\s\S]*?-->|<\?[\s\S]*?\?>|<!\[CDATA\[([\s\S]*?)\]\]>|<\/([^\s>]+)\s*>|<([^\s/>]+)((?:\s+[^\s=/>]+\s*=\s*(?:"[^"]*"|'[^']*'))*)\s*(\/?)>|([^<]+)/g;
  let m;
  while ((m = re.exec(xml))) {
    const top = stack[stack.length - 1];
    if (m[1] !== undefined) top.children.push(m[1]);
    else if (m[2] !== undefined) { if (stack.length > 1) stack.pop(); }
    else if (m[3] !== undefined) {
      const attrs = {}; for (const a of m[4].matchAll(/([^\s=]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g)) attrs[a[1]] = decode(a[2] ?? a[3]);
      const node = { name: m[3], attrs, children: [] }; top.children.push(node); if (!m[5]) stack.push(node);
    } else if (m[6] !== undefined) top.children.push(decode(m[6]));
  }
  return root;
}
const elements = node => node.children.filter(c => typeof c !== 'string');
const child = (node, name) => elements(node).find(c => c.name === name);
const on = (node, name) => { const el = child(node, name); return !!el && !['0', 'false', 'none'].includes(String(el.attrs['w:val'] ?? '1').toLowerCase()); };

// numId + level → "bullet" | "number", from word/numbering.xml.
function listKinds(xml) {
  const kinds = new Map(); if (!xml) return kinds;
  const root = parseXml(xml), numbering = elements(root)[0]; if (!numbering) return kinds;
  const abstract = new Map();
  for (const a of elements(numbering).filter(e => e.name === 'w:abstractNum')) for (const lvl of elements(a).filter(e => e.name === 'w:lvl')) abstract.set(`${a.attrs['w:abstractNumId']}:${lvl.attrs['w:ilvl']}`, child(lvl, 'w:numFmt')?.attrs['w:val'] || 'decimal');
  // An undefined level follows level 0.
  for (const n of elements(numbering).filter(e => e.name === 'w:num')) { const id = child(n, 'w:abstractNumId')?.attrs['w:val']; for (let l = 0; l < 9; l++) kinds.set(`${n.attrs['w:numId']}:${l}`, (abstract.get(`${id}:${l}`) ?? abstract.get(`${id}:0`)) === 'bullet' ? 'bullet' : 'number'); }
  return kinds;
}
function relationships(xml) {
  const map = new Map(); if (!xml) return map;
  for (const r of elements(elements(parseXml(xml))[0] || { children: [] })) if (r.attrs.Id && r.attrs.TargetMode === 'External') map.set(r.attrs.Id, r.attrs.Target);
  return map;
}

const runText = run => elements(run).map(c => c.name === 'w:t' ? c.children.filter(x => typeof x === 'string').join('') : c.name === 'w:tab' ? ' ' : c.name === 'w:br' ? '\n' : c.name === 'w:noBreakHyphen' ? '-' : '').join('');

// Paragraph → inline Markdown. Adjacent runs with the same formatting are merged so no stray markers appear.
function inline(p, links) {
  const segments = [];
  const add = (run, href) => {
    const props = child(run, 'w:rPr') || { children: [] }, text = runText(run); if (!text) return;
    const seg = { text, b: on(props, 'w:b'), i: on(props, 'w:i'), href: href || '' }, last = segments[segments.length - 1];
    if (last && last.b === seg.b && last.i === seg.i && last.href === seg.href) last.text += text; else segments.push(seg);
  };
  for (const c of elements(p)) {
    if (c.name === 'w:r') add(c, '');
    else if (c.name === 'w:hyperlink') { const href = links.get(c.attrs['r:id']) || ''; for (const r of elements(c).filter(e => e.name === 'w:r')) add(r, href); }
  }
  return segments.map(s => {
    const [, lead, body, trail] = /^(\s*)([\s\S]*?)(\s*)$/.exec(s.text);
    if (!body) return s.text;
    let out = body; if (s.i) out = `*${out}*`; if (s.b) out = `**${out}**`; if (s.href) out = `[${out}](${s.href})`;
    return lead + out + trail;
  }).join('').replace(/[ \t]+/g, ' ').trim();
}

// Returns Markdown for the whole document.
export function documentToMarkdown(documentXml, { numberingXml = '', relsXml = '' } = {}) {
  const body = child(elements(parseXml(documentXml))[0] || { children: [] }, 'w:body'); if (!body) return '';
  const kinds = listKinds(numberingXml), links = relationships(relsXml), blocks = []; let previousList = false, previousQuote = false, counters = [];
  const push = (text, list = false, quote = false) => { if (!text) return; blocks.push({ text, list, joined: (list && previousList) || (quote && previousQuote) }); previousList = list; previousQuote = quote; };
  for (const el of elements(body)) {
    if (el.name === 'w:p') {
      const ppr = child(el, 'w:pPr') || { children: [] }, style = child(ppr, 'w:pStyle')?.attrs['w:val'] || '', lines = inline(el, links), text = lines.replace(/\s*\n\s*/g, ' ');
      const num = child(ppr, 'w:numPr'), level = Number(child(num || { children: [] }, 'w:ilvl')?.attrs['w:val'] || 0), numId = child(num || { children: [] }, 'w:numId')?.attrs['w:val'];
      const heading = /^Heading([1-6])$/.exec(style) || (style === 'Title' ? [0, '1'] : null);
      if (!text) { previousList = false; continue; }
      if (num && numId && numId !== '0' && !heading) {
        if (!previousList) counters = [];
        const bullet = kinds.get(`${numId}:${level}`) === 'bullet'; counters.length = level + 1; counters[level] = bullet ? 0 : (counters[level] || 0) + 1;
        push('  '.repeat(Math.min(level, 3)) + (bullet ? '- ' : `${counters[level]}. `) + text, true);
      }
      else if (heading) push('#'.repeat(Number(heading[1])) + ' ' + text);
      else if (/^(BlockText|Quote|IntenseQuote)$/.test(style)) push(lines.split(/\s*\n\s*/).filter(Boolean).map(l => '> ' + l).join('\n'), false, false); // each quote paragraph stays its own block, as in the source files
      else push(text);
    } else if (el.name === 'w:tbl') {
      const rows = elements(el).filter(r => r.name === 'w:tr').map(r => elements(r).filter(c => c.name === 'w:tc').map(c => elements(c).filter(p => p.name === 'w:p').map(p => inline(p, links).replace(/\s*\n\s*/g, ' ')).filter(Boolean).join(' ').replace(/\|/g, '\\|')));
      // Word styles header cells in bold; in Markdown the header row is already a header.
      if (rows.length) rows[0] = rows[0].map(c => c.replace(/^\*\*([\s\S]*)\*\*$/, '$1'));
      if (rows.length) { const width = Math.max(...rows.map(r => r.length)), line = r => '| ' + Array.from({ length: width }, (_, i) => r[i] || '').join(' | ') + ' |'; push([line(rows[0]), '| ' + Array(width).fill('---').join(' | ') + ' |', ...rows.slice(1).map(line)].join('\n')); }
    }
  }
  return blocks.map((b, i) => (i === 0 ? '' : b.joined ? '\n' : '\n\n') + b.text).join('').trim() + '\n';
}

// .docx File → Markdown text.
export async function docxToMarkdown(file) {
  const entries = await listZip(file), find = name => entries.find(e => e.path === name), decoder = new TextDecoder('utf-8');
  const documentEntry = find('word/document.xml'); if (!documentEntry) throw Object.assign(new Error(`"${file.name}" is not a valid Word document.`), { code: 'DOCX' });
  const text = async name => { const e = find(name); return e ? decoder.decode(await e.read()) : ''; };
  return documentToMarkdown(decoder.decode(await documentEntry.read()), { numberingXml: await text('word/numbering.xml'), relsXml: await text('word/_rels/document.xml.rels') });
}
