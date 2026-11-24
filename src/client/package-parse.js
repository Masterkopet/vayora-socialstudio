// "Impor paket": read a metadata package (JSON or CSV, e.g. the Short YT episode package), pair each row with the
// chosen video/photo files, and plan a schedule. Pure functions so they can be tested without a browser.

const pick = (row, names) => { for (const n of names) { const v = row[n]; if (v != null && String(v).trim() !== '') return String(v).trim(); } return ''; };
const lowerKeys = obj => Object.fromEntries(Object.entries(obj || {}).map(([k, v]) => [String(k).trim().toLowerCase().replace(/\s+/g, '_'), v]));

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

// Accepts an array, {items|episodes|posts|rows: [...]} or the first array found in an object.
function jsonRows(data) {
  if (Array.isArray(data)) return data;
  for (const key of ['items', 'episodes', 'episode', 'posts', 'rows', 'konten']) if (Array.isArray(data?.[key])) return data[key];
  return Object.values(data || {}).find(Array.isArray) || [];
}

// Normalised row: { key, number, platform, title, caption, tags[], files[], date, time, note }
export function parsePackage(text, fileName = '') {
  const clean = String(text).replace(/^﻿/, '');
  let raw;
  if (/\.json$/i.test(fileName) || /^\s*[[{]/.test(clean)) { try { raw = jsonRows(JSON.parse(clean)); } catch { throw Error('File JSON tidak dapat dibaca. Periksa formatnya.'); } }
  else raw = parseCSV(clean);
  const rows = raw.map(lowerKeys).map((r, i) => {
    const key = pick(r, ['episode', 'id', 'no', 'nomor', 'kode']) || String(i + 1);
    const platformRaw = pick(r, ['platform', 'tujuan', 'channel']).toLowerCase();
    const files = pick(r, ['file_video', 'file', 'files', 'video', 'media', 'file_media', 'gambar']).split(/[;|\n]/).map(s => s.trim()).filter(Boolean);
    const tags = pick(r, ['tags_opsional', 'tags', 'tag']).split(',').map(s => s.trim()).filter(Boolean);
    return {
      key, number: Number((key.match(/\d+/) || [])[0]) || null,
      platform: /insta|ig|reel/.test(platformRaw) ? 'instagram' : /you|yt|short/.test(platformRaw) ? 'youtube' : '',
      title: pick(r, ['judul', 'title', 'tema']),
      caption: pick(r, ['deskripsi_lengkap', 'deskripsi', 'description', 'caption', 'caption_pendek']),
      tags, files, date: pick(r, ['tanggal', 'date']), time: pick(r, ['jam', 'time', 'waktu']),
      note: pick(r, ['status', 'catatan']),
    };
  }).filter(r => r.title || r.caption);
  if (!rows.length) throw Error('Tidak ada baris dengan judul atau deskripsi di file ini.');
  return rows;
}

const base = p => String(p).split(/[\\/]/).pop().toLowerCase();
const numbers = name => (base(name).replace(/\.[a-z0-9]+$/, '').match(/\d+/g) || []).map(Number);
const isVideo = f => /\.(mp4|mov)$/i.test(f.name) || /^video\//.test(f.type || '');

// Pairs rows with files: exact file name from the package first, then the episode number in the file name
// (Vayora-Shorts-01-Final.mp4 → episode 01; C01-slide-2.jpg → 01). A file is used once. Ambiguous numbers are
// left for the user to pick from `choices`.
export function matchFiles(rows, files) {
  const used = new Set();
  const byName = new Map(files.map(f => [f.name.toLowerCase(), f]));
  const result = rows.map(row => {
    const exact = row.files.map(p => byName.get(base(p))).filter(Boolean);
    if (exact.length) { exact.forEach(f => used.add(f)); return { row, files: exact, choices: [] }; }
    return { row, files: [], choices: [] };
  });
  for (const m of result) {
    if (m.files.length || m.row.number == null) continue;
    const found = files.filter(f => !used.has(f) && numbers(f.name)[0] === m.row.number).sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
    const videos = found.filter(isVideo), images = found.filter(f => !isVideo(f));
    if (videos.length === 1 && !images.length) m.files = videos;
    else if (!videos.length && images.length) m.files = images;
    else if (found.length) m.choices = found; // e.g. two video versions of the same episode
    m.files.forEach(f => used.add(f));
  }
  return result;
}

export function formatOf(platform, files) {
  if (!files.length) return '';
  const videos = files.filter(isVideo);
  if (platform === 'youtube') return files.length === 1 && videos.length === 1 ? 'Short' : '';
  if (files.length === 1) return videos.length ? 'Reel' : 'Gambar';
  return !videos.length && files.length <= 20 ? 'Carousel' : '';
}

// Problems that block a row, and softer warnings.
export function checkRow({ row, files, platform }) {
  const format = formatOf(platform, files), errors = [], warnings = [];
  if (!files.length) errors.push('Video atau foto belum dipilih.');
  else if (!format) errors.push(platform === 'youtube' ? 'YouTube Shorts memerlukan tepat satu video MP4.' : 'Gabungan file ini tidak didukung Instagram.');
  if (!row.title) errors.push('Judul kosong.');
  if (!row.caption) errors.push('Deskripsi atau caption kosong.');
  if (row.caption.length > 2200) errors.push('Deskripsi lebih dari 2.200 karakter.');
  if (platform === 'youtube' && row.title.length > 100) errors.push('Judul YouTube lebih dari 100 karakter.');
  if (files.some(f => f.size > 100 * 1024 * 1024)) errors.push('File lebih dari 100 MB.');
  if (platform === 'instagram' && row.tags.length) warnings.push('Tags hanya dipakai YouTube.');
  return { format, errors, warnings };
}

const DAY = 86400000;
const slotAt = (date, time) => Date.parse(`${date}T${time}:00+07:00`);
const wibDay = ms => new Date(ms + 7 * 3600000).toISOString().slice(0, 10);

// Gives each row a date and time (WIB). Rows keep a date/time from the package when `useFileDates` is on.
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
