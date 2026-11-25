// Markdown → Sanity Portable Text (blocks only, like the vayora.id blog schema), and Portable Text → safe HTML for previews.
// Shared by the server (publishing) and the browser (article preview). Keys are deterministic so republishing an
// unchanged article produces an identical document.

const escapeHtml = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function keyMaker(prefix = 'k') { let n = 0; return () => prefix + (++n).toString(36).padStart(4, '0'); }
const span = (text, marks, key) => ({ _key: key(), _type: 'span', marks, text });

// Inline Markdown: **bold**, __bold__, *em*, _em_, `code`, [text](url). Returns spans; link annotations go to defs.
function inline(text, key, defs, marks = []) {
  const out = [], re = /(\*\*(?=\S)(.+?)(?<=\S)\*\*|__(?=\S)(.+?)(?<=\S)__|`([^`]+)`|\[([^\]]+)\]\(\s*([^)\s]+)(?:\s+"[^"]*")?\s*\)|(?<![\w*])\*(?=[^\s*])(.+?)(?<=[^\s*])\*(?![\w*])|(?<![\w_])_(?=[^\s_])(.+?)(?<=[^\s_])_(?![\w_]))/gs;
  let last = 0, m;
  const plain = s => { if (s) out.push(span(s, marks, key)); };
  while ((m = re.exec(text))) {
    plain(text.slice(last, m.index));
    if (m[2] !== undefined || m[3] !== undefined) out.push(...inline(m[2] ?? m[3], key, defs, [...marks, 'strong']));
    else if (m[4] !== undefined) out.push(span(m[4], [...marks, 'code'], key));
    else if (m[5] !== undefined) {
      const href = m[6]; let id = defs.find(d => d.href === href)?._key;
      if (!id) { id = key(); defs.push({ _key: id, _type: 'link', href }); }
      out.push(...inline(m[5], key, defs, [...marks, id]));
    } else out.push(...inline(m[7] ?? m[8], key, defs, [...marks, 'em']));
    last = m.index + m[0].length;
  }
  plain(text.slice(last));
  return out;
}

function block(text, style, key, extra = {}) {
  const defs = [], children = inline(text, key, defs);
  return { _key: key(), _type: 'block', style, markDefs: defs, children: children.length ? children : [span('', [], key)], ...extra };
}

const isTableRow = l => /^\s*\|.*\|\s*$/.test(l);
const isSeparator = l => /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/.test(l) && l.includes('-');
const cells = l => l.trim().replace(/^\||\|$/g, '').split('|').map(c => c.trim());
const LIST = /^(\s*)([-*+]|\d+[.)])\s+(.*)$/;

// options.keyPrefix: prefix for generated keys. Headings are normalised so the shallowest becomes h2 and deeper
// ones h3, matching the blog's styles (normal, h2, h3, blockquote). Tables become bullet rows ("Label: value").
export function markdownToPortableText(markdown, { keyPrefix = 'k' } = {}) {
  const key = keyMaker(keyPrefix), lines = String(markdown).replace(/\r\n?/g, '\n').split('\n'), blocks = [], notes = { tablesFlattened: 0, imagesSkipped: 0 };
  const levels = lines.map(l => /^(#{1,6})\s+\S/.exec(l)?.[1].length).filter(Boolean), shallow = levels.length ? Math.min(...levels) : 2;
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim() || /^\s*([-*_])(\s*\1){2,}\s*$/.test(line)) { i++; continue; }
    const fence = /^\s*```/.exec(line);
    if (fence) { const body = []; i++; while (i < lines.length && !/^\s*```/.test(lines[i])) body.push(lines[i++]); i++; if (body.length) blocks.push({ _key: key(), _type: 'block', style: 'normal', markDefs: [], children: [span(body.join('\n'), ['code'], key)] }); continue; }
    const h = /^(#{1,6})\s+(.*?)\s*#*\s*$/.exec(line);
    if (h) { blocks.push(block(h[2], h[1].length - shallow <= 0 ? 'h2' : 'h3', key)); i++; continue; }
    if (/^\s*!\[[^\]]*\]\([^)]*\)\s*$/.test(line)) { notes.imagesSkipped++; i++; continue; }
    if (/^\s*>/.test(line)) { const q = []; while (i < lines.length && /^\s*>/.test(lines[i])) q.push(lines[i++].replace(/^\s*>\s?/, '')); blocks.push(block(q.join(' ').trim(), 'blockquote', key)); continue; }
    if (isTableRow(line) && i + 1 < lines.length && isSeparator(lines[i + 1])) {
      const head = cells(line); i += 2; notes.tablesFlattened++;
      while (i < lines.length && isTableRow(lines[i])) {
        const row = cells(lines[i++]), rest = row.slice(1).filter(Boolean).join(' — ');
        blocks.push(block(head.length > 1 && row[0] ? `**${row[0]}**${rest ? ': ' + rest : ''}` : row.filter(Boolean).join(' — '), 'normal', key, { listItem: 'bullet', level: 1 }));
      }
      continue;
    }
    const li = LIST.exec(line);
    if (li) {
      let text = li[3], level = Math.min(3, Math.floor(li[1].replace(/\t/g, '    ').length / 2) + 1), kind = /\d/.test(li[2]) ? 'number' : 'bullet'; i++;
      while (i < lines.length && lines[i].trim() && !LIST.test(lines[i]) && /^\s+\S/.test(lines[i]) && !isTableRow(lines[i])) text += ' ' + lines[i++].trim();
      blocks.push(block(text, 'normal', key, { listItem: kind, level }));
      continue;
    }
    const para = [line.trim()]; i++;
    while (i < lines.length && lines[i].trim() && !/^(#{1,6})\s/.test(lines[i]) && !LIST.test(lines[i]) && !/^\s*>/.test(lines[i]) && !/^\s*```/.test(lines[i]) && !isTableRow(lines[i]) && !/^\s*!\[/.test(lines[i])) para.push(lines[i++].trim());
    blocks.push(block(para.join(' '), 'normal', key));
  }
  return { blocks, notes };
}

export function portableTextToHtml(blocks) {
  const run = b => b.children.map(c => {
    let html = escapeHtml(c.text);
    for (const mark of c.marks || []) {
      const def = (b.markDefs || []).find(d => d._key === mark);
      if (def) { if (/^https?:\/\//i.test(def.href)) html = `<a href="${escapeHtml(def.href)}" target="_blank" rel="noopener noreferrer">${html}</a>`; }
      else if (mark === 'strong') html = `<strong>${html}</strong>`; else if (mark === 'em') html = `<em>${html}</em>`; else if (mark === 'code') html = `<code>${html}</code>`;
    }
    return html;
  }).join('');
  const out = []; let open = null;
  const close = () => { if (open) { out.push(`</${open}>`); open = null; } };
  for (const b of blocks) {
    if (b.listItem) { const tag = b.listItem === 'number' ? 'ol' : 'ul'; if (open !== tag) { close(); out.push(`<${tag}>`); open = tag; } out.push(`<li>${run(b)}</li>`); continue; }
    close();
    const tag = { h2: 'h2', h3: 'h3', blockquote: 'blockquote' }[b.style] || 'p';
    out.push(`<${tag}>${run(b)}</${tag}>`);
  }
  close();
  return out.join('');
}

// Portable Text → Markdown, the inverse of markdownToPortableText for blocks-only content. Block types other than
// "block" (images, embeds…) are skipped and counted in `skipped`.
export function portableTextToMarkdown(blocks) {
  const out = [], notes = { skipped: 0 };
  let number = 0, previousList = null;
  const run = b => b.children.map(c => {
    let text = c.text.replace(/([*_`\\])/g, '\\$1');
    const marks = c.marks || [], defs = b.markDefs || [];
    for (const mark of marks) { const def = defs.find(d => d._key === mark); if (def && def._type === 'link' && def.href) text = `[${text}](${def.href})`; }
    if (marks.includes('code')) text = '`' + c.text + '`';
    if (marks.includes('strong')) text = '**' + text + '**';
    if (marks.includes('em')) text = '*' + text + '*';
    return text;
  }).join('');
  for (const b of blocks || []) {
    if (b._type !== 'block') { notes.skipped++; continue; }
    const text = run(b).trim();
    if (b.listItem) {
      const level = Math.max(1, Math.min(3, b.level || 1));
      number = b.listItem === 'number' ? (previousList === 'number' ? number + 1 : 1) : 0;
      out.push((previousList === b.listItem ? '\n' : '\n\n') + '  '.repeat(level - 1) + (b.listItem === 'number' ? number + '. ' : '- ') + text);
      previousList = b.listItem; continue;
    }
    previousList = null; number = 0;
    const prefix = { h1: '### ', h2: '### ', h3: '#### ', h4: '#### ', h5: '#### ', h6: '#### ', blockquote: '> ' }[b.style] || '';
    if (text) out.push('\n\n' + prefix + text);
  }
  return { markdown: out.join('').trim(), notes };
}

export function plainText(blocks) { return blocks.map(b => b.children.map(c => c.text).join('')).join('\n'); }
export function readingMinutes(markdown) { return Math.max(1, Math.round((String(markdown).match(/\S+/g) || []).length / 200)); }
// "&" becomes the Indonesian "dan" on purpose: the published blog (vayora.id) uses Indonesian URLs.
export function slugify(text) {
  return String(text).toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/&/g, ' dan ').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 96).replace(/-+$/g, '');
}
