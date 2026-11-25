// Universal import: read every text source found in the chosen files/folder (JSON/CSV packages, per-episode .txt
// packages, Markdown caption lists keyed by content ID), pair each item with its media, and plan a schedule.
// Pure functions so they can be tested without a browser.

const pick = (row, names) => { for (const n of names) { const v = row[n]; if (v != null && String(v).trim() !== '') return String(v).trim(); } return ''; };
const lowerKeys = obj => Object.fromEntries(Object.entries(obj || {}).map(([k, v]) => [String(k).trim().toLowerCase().replace(/\s+/g, '_'), v]));
const CONTENT_ID = /^([VICS])(\d{1,4})$/i;
const firstNumber = s => { const m = String(s).match(/\d+/); return m ? Number(m[0]) : null; };
const clean = text => String(text).replace(/﻿/g, '');

export function parseCSV(text) {
  const rows = []; let row = [], v = '', quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === '"') { if (quoted && text[i + 1] === '"') { v += '"'; i++; } else quoted = !quoted; }
    else if (c === ',' && !quoted) { row.push(v); v = ''; }
    else if ((c === '\n' || c === '\r') && !quoted) { if (c === '\r' && text[i + 1] === '\n') i++; row.push(v); rows.push(row); row = []; v = ''; }
    else v += c;
  }
  if (v || row.length) { row.push(v); rows.push(row); }
  const [head = [], ...body] = rows.filter(r => r.some(x => x.trim()));
  return body.map(r => Object.fromEntries(head.map((h, i) => [h, r[i] ?? ''])));
}

// Normalised item: { key, number, id, platform, title, caption, tags[], files[], date, time }
function item(fields) {
  const key = String(fields.key || '').trim(), idMatch = key.match(CONTENT_ID) || String(fields.id || '').match(CONTENT_ID);
  const id = idMatch ? idMatch[1].toUpperCase() + idMatch[2].padStart(2, '0') : '';
  const platformRaw = String(fields.platform || '').toLowerCase();
  return {
    key: key || id, number: idMatch ? Number(idMatch[2]) : firstNumber(key), id,
    ...(fields.blog ? { blog: fields.blog } : {}),
    platform: fields.blog ? 'blog' : /insta|ig\b|reel/.test(platformRaw) ? 'instagram' : /you|yt|short/.test(platformRaw) ? 'youtube' : id ? (id.startsWith('S') ? 'youtube' : 'instagram') : '',
    title: String(fields.title || '').trim(), caption: String(fields.caption || '').trim(),
    tags: (Array.isArray(fields.tags) ? fields.tags : String(fields.tags || '').split(',')).map(s => String(s).trim()).filter(Boolean),
    files: (Array.isArray(fields.files) ? fields.files : String(fields.files || '').split(/[;|\n]/)).map(s => String(s).trim()).filter(Boolean),
    date: String(fields.date || '').trim(), time: String(fields.time || '').trim().slice(0, 5),
  };
}

function jsonRows(data) {
  if (Array.isArray(data)) return data;
  for (const key of ['items', 'episodes', 'episode', 'posts', 'rows', 'content', 'konten']) if (Array.isArray(data?.[key])) return data[key];
  return Object.values(data || {}).find(Array.isArray) || [];
}

// JSON or CSV package: one row per item.
export function parsePackage(text, fileName = '') {
  const body = clean(text);
  let raw;
  if (/\.json$/i.test(fileName) || /^\s*[[{]/.test(body)) { try { raw = jsonRows(JSON.parse(body)); } catch { throw Error('The JSON file could not be read. Check its format.'); } }
  else raw = parseCSV(body);
  const rows = raw.map(lowerKeys).map((r, i) => item({
    // Column names are bilingual: the Indonesian ones (judul, deskripsi_lengkap, ...) are kept for existing packages.
    key: pick(r, ['episode', 'id', 'no', 'number', 'nomor', 'code', 'kode']) || String(i + 1), id: pick(r, ['id', 'code', 'kode']),
    platform: pick(r, ['platform', 'tujuan', 'destination', 'channel']),
    title: pick(r, ['judul', 'title', 'tema', 'theme']),
    caption: pick(r, ['deskripsi_lengkap', 'full_description', 'deskripsi', 'description', 'caption', 'caption_pendek', 'short_caption']),
    tags: pick(r, ['tags_opsional', 'optional_tags', 'tags', 'tag']),
    files: pick(r, ['file_video', 'video_file', 'file', 'files', 'video', 'media', 'file_media', 'media_file', 'gambar', 'image']),
    date: pick(r, ['tanggal', 'date']), time: pick(r, ['jam', 'time', 'waktu']),
  })).filter(r => r.caption && (r.title || r.id));
  if (!rows.length) throw Error('There are no rows with a title or description in this file.');
  return rows;
}

// Plain-text package (one episode per file, or several "EPISODE 01 — …" blocks in one file). Sections start with
// an upper-case heading such as "TITLE — COPY TO THE TITLE COLUMN" or "FULL DESCRIPTION". The Indonesian headings
// (JUDUL, DESKRIPSI LENGKAP, TANGGAL/JADWAL, JAM) are still accepted for existing packages.
const SECTIONS = [[/^(JUDUL|TITLE)\b/, 'title'], [/^(DESKRIPSI( LENGKAP)?|(FULL )?DESCRIPTION)\b/, 'caption'], [/^(CAPTION|SHORT CAPTION)\b/, 'short'], [/^TAGS\b/, 'tags'], [/^(TANGGAL|JADWAL|DATE|SCHEDULE)\b/, 'date'], [/^(JAM|TIME)\b/, 'time'], [/^PLATFORM\b/, 'platform']];
export function parseEpisodeText(text, fileName = '') {
  const body = clean(text).replace(/\r\n/g, '\n');
  const blocks = body.split(/^(?=EPISODE\s+\d+\b)/m).filter(b => /^EPISODE\s+\d+/.test(b));
  const parts = blocks.length ? blocks : [body];
  return parts.map(block => {
    const lines = block.split('\n'), found = {};
    let current = null;
    for (const line of lines) {
      const t = line.trim();
      const heading = t.length > 2 && t === t.toUpperCase() && /[A-Z]/.test(t) && !t.startsWith('#') ? SECTIONS.find(([re]) => re.test(t)) : null;
      if (heading) { current = heading[1]; found[current] = []; continue; }
      if (t.length > 2 && t === t.toUpperCase() && /^[A-Z][A-Z /—–-]+$/.test(t)) { current = null; continue; } // other headings end a section
      if (current) found[current].push(line);
    }
    const get = k => (found[k] || []).join('\n').trim();
    // Episode number: "EPISODE 01" heading, else the file name, else a numbered folder just above ("02 - …/BACA DULU.txt", i.e. "READ ME FIRST").
    const number = blocks.length ? firstNumber(block.match(/^EPISODE\s+(\d+)/)[1]) : firstNumber(String(fileName).split(/[\\/]/).pop()) ?? folderNumber(fileName);
    return item({ key: number == null ? '' : String(number).padStart(2, '0'), title: get('title'), caption: get('caption') || get('short'), tags: get('tags'), date: get('date'), time: get('time'), platform: get('platform') });
  }).filter(r => r.title && r.caption && r.number != null);
}
function folderNumber(path) {
  const parts = String(path).replace(/\\/g, '/').split('/'); parts.pop();
  for (let up = 1; up <= 2 && parts.length - up >= 0; up++) { const dir = parts[parts.length - up]; if (dir && /^\d+\b/.test(dir)) return firstNumber(dir); }
  return null;
}

// Blog article (Markdown) with a "Metadata SEO" / "SEO metadata" table, e.g. the 12-article Vayora package: the table
// gives title, meta description, slug, category and publish date; "Prompt gambar" / "Image prompt" gives the hero
// image file name and alt text; "Naskah artikel" / "Article body" is the body. Anything after the next "## " heading
// (e.g. the Instagram caption) is not the article. Indonesian and English headings, field names and months both work.
const MONTHS = { januari: 1, februari: 2, maret: 3, april: 4, mei: 5, juni: 6, juli: 7, agustus: 8, september: 9, oktober: 10, november: 11, desember: 12, january: 1, february: 2, march: 3, may: 5, june: 6, july: 7, august: 8, october: 10, december: 12 };
function tableFields(section) {
  const out = {};
  for (const line of section.split('\n')) { if (!/^\s*\|/.test(line) || /^\s*\|?\s*:?-{2,}/.test(line)) continue; const [k, ...v] = line.trim().replace(/^\||\|$/g, '').split('|').map(c => c.trim()); if (k && v.length) out[k.toLowerCase()] = v.join(' | ').trim(); }
  return out;
}
export function isArticleMarkdown(text) { return /^##\s+(Metadata SEO|SEO metadata)\s*$/im.test(text) && /^##\s+(Naskah artikel|Article body)\s*$/im.test(text); }
export function parseArticleMarkdown(text, fileName = '') {
  const md = clean(text).replace(/\r\n?/g, '\n'), part = name => { const m = new RegExp('^##\\s+' + name + '[^\\n]*\\n([\\s\\S]*?)(?=^##\\s|(?![\\s\\S]))', 'im').exec(md); return m ? m[1] : ''; };
  const meta = tableFields(part('(?:Metadata SEO|SEO metadata)')), heading = (md.match(/^#\s+(.+)$/m) || [])[1] || '';
  const number = firstNumber(String(fileName).split(/[\\/]/).pop()) ?? firstNumber(heading);
  const title = meta['h1'] || heading.replace(/^\d+\s*\S\s*/, '').trim();
  const slug = (meta['slug'] || '').replace(/^.*\/blog\//, '').replace(/^\/+|\/+$/g, '').toLowerCase();
  const date = /(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})(?:[^\d]+(\d{1,2})[.:](\d{2}))?/.exec(meta['terbit'] || meta['published'] || meta['publish date'] || ''), month = date ? MONTHS[date[2].toLowerCase()] : 0;
  const hero = part('(?:Prompt gambar|Image prompt)').split('\n').find(l => /^\s*\|\s*(Utama|Main|Primary)/i.test(l)), heroCells = hero ? hero.trim().replace(/^\||\|$/g, '').split('|').map(c => c.trim()) : [];
  // The date/reading-time line and the "Ditulis oleh …" / "Written by …" byline are not part of the article body.
  const body = part('(?:Naskah artikel|Article body)').replace(/^\s*\*\d{1,2}\s+\p{L}+\s+\d{4}[^\n]*\*\s*\n/u, '').replace(/\n+\*(?:Ditulis oleh|Written by)[^\n]*\*\s*$/u, '').trim();
  const excerpt = (meta['meta description'] || '').trim();
  if (!title || !body) return [];
  return [item({
    key: number == null ? slug : String(number).padStart(2, '0'), title, caption: excerpt,
    tags: (meta['keyword pendukung'] || meta['supporting keywords'] || '').split(','), files: heroCells[3] || '',
    date: month ? `${date[3]}-${String(month).padStart(2, '0')}-${String(date[1]).padStart(2, '0')}` : '', time: date && date[4] ? `${String(date[4]).padStart(2, '0')}:${date[5]}` : '07:00',
    blog: { slug, excerpt, seoTitle: (meta['title tag'] || '').replace(/\s*\(\d+\s*(?:karakter|characters?)\)\s*$/i, '').trim(), category: meta['kategori'] || meta['category'] || '', heroAlt: heroCells[2] || '', heroPrompt: heroCells[1] || '', body },
  })];
}

// Markdown caption list keyed by content ID: "## V01 — Title" … "Caption:" followed by the caption paragraph.
export function parseCaptionMarkdown(text) {
  return clean(text).replace(/\r\n/g, '\n').split(/^##\s+/m).slice(1).map(block => {
    const head = block.split('\n')[0], id = head.match(/^([VICS]\d+)/i)?.[1] || '';
    const caption = block.match(/Caption:\s*\n([\s\S]*?)(?=\n\s*\n|$)/i)?.[1] || ''; // ends at the first blank line, as before
    return item({ key: id, id, title: head.replace(/^([VICS]\d+)\s*[—–:-]?\s*/i, '').trim(), caption });
  }).filter(r => r.id && (r.caption || r.title));
}

// Reads every text file and merges items describing the same episode/ID. JSON beats CSV beats .txt beats Markdown;
// a later source only fills fields the earlier one left empty. Files without usable rows are reported, not fatal.
export function readSources(textFiles) {
  const rank = f => /\.json$/i.test(f.name) ? 0 : /\.csv$/i.test(f.name) ? 1 : /\.txt$/i.test(f.name) ? 2 : 3;
  const sources = [], merged = new Map();
  const keyOf = r => r.blog ? 'blog:' + (r.blog.slug || r.key) : r.id || (r.number != null ? 'n' + r.number : 'k' + r.key.toLowerCase());
  for (const f of [...textFiles].filter(f => !IGNORED.test(String(f.path || f.name).replace(/\\/g, '/'))).sort((a, b) => rank(a) - rank(b) || a.name.localeCompare(b.name, undefined, { numeric: true }))) {
    let rows = [];
    try { rows = /\.(json|csv)$/i.test(f.name) ? parsePackage(f.text, f.name) : /\.md$/i.test(f.name) ? (isArticleMarkdown(f.text) ? parseArticleMarkdown(f.text, f.path || f.name) : parseCaptionMarkdown(f.text)) : parseEpisodeText(f.text, f.path || f.name); } catch { rows = []; }
    let added = 0;
    for (const r of rows) {
      const k = keyOf(r), have = merged.get(k);
      if (!have) { merged.set(k, r); added++; continue; }
      for (const field of ['title', 'caption', 'date', 'time', 'platform', 'id']) if (!have[field] && r[field]) have[field] = r[field];
      if (!have.tags.length) have.tags = r.tags; if (!have.files.length) have.files = r.files;
    }
    sources.push({ name: f.name, rows: rows.length, added });
  }
  const rows = [...merged.values()].sort((a, b) => (a.number ?? 1e9) - (b.number ?? 1e9) || a.key.localeCompare(b.key));
  return { rows, sources };
}

// ---------- media ----------
const IGNORED = /(^|\/)(node_modules|\.git|\.next|dist|build|out|cache|tmp)(\/|$)/i;
export const MEDIA_FILE = /\.(mp4|mov|jpe?g|png|webp)$/i;
export const TEXT_FILE = /\.(json|csv|txt|md)$/i;
const base = p => String(p).split(/[\\/]/).pop();
export const isVideo = f => /\.(mp4|mov)$/i.test(f.name) || /^video\//.test(f.type || '');
const isCover = f => /^(cover|thumb|thumbnail|sampul)\b/i.test(base(f.name));

// Where a media file belongs: its own content ID (V01-…), the first number in its name, or — for files at most two
// folders below an episode folder like "01 - Room …/Video/x.mp4" — that folder's number. Deeper files (project
// assets, references) get no number, so they are never picked by accident.
export function mediaInfo(file) {
  const path = String(file.webkitRelativePath || file.name).replace(/\\/g, '/'), parts = path.split('/'), name = parts.pop().replace(/\.[^.]+$/, '');
  const id = name.match(/^([VICS])(\d{1,4})(?=\D|$)/i);
  const own = firstNumber(name);
  const folder = folderNumber(path);
  return { path, id: id ? id[1].toUpperCase() + id[2].padStart(2, '0') : '', own: id ? Number(id[2]) : own, number: id ? Number(id[2]) : own ?? folder, ignored: IGNORED.test(path) || name.startsWith('.') };
}

// Pairs items with media: exact file name from the package, then the content ID, then the episode number.
// YouTube takes one video; Instagram takes one video (Reel, with a "cover…" image as cover) or the images.
// When several candidates fit, `choices` lets the user pick.
export function matchFiles(rows, files, platformOf = r => r.platform || 'youtube') {
  const pool = files.filter(f => !mediaInfo(f).ignored), used = new Set(), byName = new Map(pool.map(f => [base(f.name).toLowerCase(), f]));
  const result = rows.map(row => ({ row, files: [], cover: null, choices: [] }));
  for (const m of result) { const exact = m.row.files.map(p => byName.get(base(p).toLowerCase())).filter(Boolean); if (exact.length) { m.files = exact; exact.forEach(f => used.add(f)); } }
  for (const m of result) {
    if (m.files.length || m.row.blog) continue;
    const info = f => mediaInfo(f);
    let found = pool.filter(f => !used.has(f) && (m.row.id ? info(f).id === m.row.id : m.row.number != null && info(f).number === m.row.number));
    found.sort((a, b) => base(a.name).localeCompare(base(b.name), undefined, { numeric: true }));
    const covers = found.filter(isCover), videos = found.filter(f => isVideo(f) && !isCover(f)), images = found.filter(f => !isVideo(f) && !isCover(f));
    const narrow = list => { const named = list.filter(f => info(f).own === m.row.number); return named.length ? named : list; };
    const vids = videos.length > 1 ? narrow(videos) : videos;
    if (platformOf(m.row) === 'youtube') { if (vids.length === 1) m.files = vids; else if (vids.length > 1) m.choices = vids; }
    else if (vids.length === 1) { m.files = vids; m.cover = covers.find(f => !isVideo(f)) || null; }
    else if (vids.length > 1) m.choices = vids;
    else if (images.length) m.files = images.slice(0, 20);
    else if (covers.length) m.files = covers.filter(f => !isVideo(f)).slice(0, 1);
    m.files.forEach(f => used.add(f)); if (m.cover) used.add(m.cover);
  }
  return result;
}

// Media named with a content ID but described by no text (the old bulk-import style) become items of their own.
// Pass only the files no text item has taken.
export function mediaOnlyRows(rows, files) {
  const known = new Set(rows.map(r => r.id).filter(Boolean)), groups = new Map();
  for (const f of files) { const info = mediaInfo(f); if (info.ignored || !info.id || known.has(info.id)) continue; if (!groups.has(info.id)) groups.set(info.id, []); groups.get(info.id).push(f); }
  return [...groups].map(([id, list]) => {
    const first = list.sort((a, b) => base(a.name).localeCompare(base(b.name), undefined, { numeric: true }))[0];
    return item({ key: id, id, title: titleFromFile(first.name) || id });
  });
}

// "V01-room-ready_for-guests.mp4" → "Room ready for guests"; used when no text source gives a title.
export function titleFromFile(name) {
  const t = base(name).replace(/\.[^.]+$/, '').replace(/^[VICS]\d+[-_ ]*/i, '').replace(/[-_ ]*slide[-_ ]*\d+$/i, '').replace(/[-_]+/g, ' ').trim();
  return t ? t[0].toUpperCase() + t.slice(1) : '';
}

export function formatOf(platform, files) {
  if (platform === 'blog') return 'Blog';
  if (!files.length) return '';
  const videos = files.filter(isVideo);
  if (platform === 'youtube') return files.length === 1 && videos.length === 1 ? 'Short' : '';
  if (files.length === 1) return videos.length ? 'Reel' : 'Gambar';
  return !videos.length && files.length <= 20 ? 'Carousel' : '';
}

// Problems that block a row, and softer warnings. A caption is only required when the item goes beyond draft.
export function checkRow({ row, files, platform, mode = 'scheduled', existingIds = [], willGenerate = false }) {
  if (platform === 'blog') {
    const errors = [], warnings = [], b = row.blog || {};
    if (!row.title) errors.push('The title is empty.'); if (!b.slug || !/^[a-z0-9]+(-[a-z0-9]+)*$/.test(b.slug)) errors.push('The slug is not valid.'); if (!b.body) errors.push('The article body is empty.');
    if (!b.excerpt && mode !== 'draft') errors.push('The summary (meta description) is empty.');
    if (!files.length && willGenerate) warnings.push('The main image will be generated from its prompt; the article is then submitted for review.');
    else if (!files.length) { if (mode === 'scheduled') errors.push('There is no main image yet. Add the image or save as a draft.'); else warnings.push('There is no main image yet; it is required before the article can be published.'); }
    else if (!b.heroAlt) warnings.push('The image alt text is empty; fill it in the editor before publishing.');
    if (files.length > 1) errors.push('An article uses only one main image.');
    return { format: 'Blog', errors, warnings };
  }
  const format = formatOf(platform, files), errors = [], warnings = [];
  if (!files.length) errors.push('No video or photo selected yet.');
  else if (!format) errors.push(platform === 'youtube' ? 'YouTube Shorts needs exactly one MP4 video.' : 'Instagram does not support this combination of files.');
  if (row.id && existingIds.includes(row.id)) errors.push(`${row.id} already exists in the library and will not be imported again.`);
  if (row.id && format && { Short: 'S', Reel: 'V', Gambar: 'I', Carousel: 'C' }[format] !== row.id[0]) warnings.push(`Code ${row.id} does not match the ${format} type; a new code is generated automatically.`);
  if (!row.title) errors.push('The title is empty.');
  if (!row.caption && mode !== 'draft') errors.push('The description or caption is empty.');
  if (row.caption.length > 2200) errors.push('The description is over 2,200 characters.');
  if (platform === 'youtube' && row.title.length > 100) errors.push('The YouTube title is over 100 characters.');
  if (files.some(f => f.size > 100 * 1024 * 1024)) errors.push('A file is larger than 100 MB.');
  if (platform === 'instagram' && row.tags.length) warnings.push('Tags are only used by YouTube.');
  return { format, errors, warnings };
}

const DAY = 86400000;
const slotAt = (date, time) => Date.parse(`${date}T${time}:00+07:00`);
const wibDay = ms => new Date(ms + 7 * 3600000).toISOString().slice(0, 10);

// Gives each row a date and time (WIB). `fixed` entries (dates from the file or edited by hand) are kept.
// New slots follow the chosen weekdays (0 = Sunday) and times, start no earlier than `start`, skip times already
// taken by scheduled content, and stay at least 30 minutes in the future.
export function planSchedule(count, { start, days = [1, 3, 5], times = ['19:00'], taken = [], now = Date.now(), fixed = [] } = {}) {
  const busy = new Set(taken.map(t => Date.parse(t)).filter(Number.isFinite));
  fixed.forEach(f => { if (f) busy.add(slotAt(f.date, f.time)); });
  const sortedTimes = [...new Set(times.filter(t => /^\d{2}:\d{2}$/.test(t)))].sort();
  const plan = []; let day = Date.parse((start || wibDay(now)) + 'T00:00:00Z');
  if (!sortedTimes.length || !days.length) return Array.from({ length: count }, (_, i) => fixed[i] || null);
  let guard = 0;
  for (let i = 0; i < count; i++) {
    if (fixed[i]) { plan.push(fixed[i]); continue; }
    let slot = null;
    while (!slot && guard++ < 3660) {
      const date = new Date(day).toISOString().slice(0, 10);
      if (days.includes(new Date(day).getUTCDay())) for (const time of sortedTimes) { const at = slotAt(date, time); if (at > now + 30 * 60000 && !busy.has(at)) { slot = { date, time }; busy.add(at); break; } }
      if (!slot) day += DAY;
    }
    plan.push(slot);
  }
  return plan;
}
