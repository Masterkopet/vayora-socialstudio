// "Impor konten": one page for every bulk import. Choose a folder or files; videos, photos and text (JSON/CSV
// packages, per-episode .txt, Markdown caption lists) are read together, paired, previewed with an automatic
// schedule, then uploaded and saved/scheduled row by row.
import { readSources, matchFiles, mediaOnlyRows, checkRow, planSchedule, mediaInfo, titleFromFile, MEDIA_FILE, TEXT_FILE } from './package-parse.js';

const WEEKDAYS = [[1, 'Sen'], [2, 'Sel'], [3, 'Rab'], [4, 'Kam'], [5, 'Jum'], [6, 'Sab'], [0, 'Min']];
const tomorrow = () => new Date(Date.now() + 7 * 3600000 + 86400000).toISOString().slice(0, 10);
const AI_NOTE = /ilustrasi AI|dibuat (dengan )?AI|buatan AI|AI[- ]generated/i;
const PREFIX = { Short: 'S', Reel: 'V', Gambar: 'I', Carousel: 'C' };
const pathOf = f => f.webkitRelativePath || f.name;

export function createPackageImport(ctx) {
  const { api, esc, button, toast } = ctx;
  let st;
  const reset = () => { st = { texts: [], media: [], sources: [], rows: [], edits: {}, platform: 'youtube', mode: 'scheduled', start: tomorrow(), days: [1, 3, 5], times: '19:00', useFileDates: true, synthetic: false, approved: false, running: false, done: false, reading: false }; };
  reset();

  // ---------- derived state ----------
  const platformOf = r => r.row.platform || st.platform;
  const edit = r => st.edits[r.key] || (st.edits[r.key] = { include: true });
  function rebuild() {
    const { rows, sources } = readSources(st.texts);
    st.sources = sources;
    const pf = row => row.platform || st.platform;
    const matched = matchFiles(rows, st.media, pf), used = new Set(matched.flatMap(m => [...m.files, ...m.choices, m.cover].filter(Boolean)));
    const extra = mediaOnlyRows(rows, st.media.filter(f => !used.has(f)));
    const all = [...matched, ...matchFiles(extra, st.media.filter(f => !used.has(f)), pf)];
    st.rows = all.map(m => {
      const key = m.row.id || (m.row.number != null ? 'n' + m.row.number : m.row.key), e = st.edits[key] || {};
      const row = { ...m.row, title: e.title ?? (m.row.title || titleFromFile(m.files[0]?.name || '')) };
      return { key, row, files: e.picked ? [e.picked] : m.files, cover: m.cover, choices: m.choices, result: st.rows.find(r => r.key === key)?.result || null };
    });
    st.synthetic = st.synthetic || st.rows.some(r => AI_NOTE.test(r.row.caption));
  }
  const existingIds = () => (ctx.getWorkspace().posts || []).map(p => p.id);
  const checked = r => checkRow({ row: r.row, files: r.files, platform: platformOf(r), mode: st.mode, existingIds: existingIds() });
  const active = r => edit(r).include && !r.result?.ok && !checked(r).errors.length;
  const ready = () => st.rows.filter(active);
  function plan() {
    if (st.mode === 'draft') return () => null;
    const taken = (ctx.getWorkspace().posts || []).filter(p => p.status === 'scheduled' && p.scheduleAt).map(p => p.scheduleAt);
    const list = ready(), fixed = list.map(r => edit(r).override || (st.useFileDates && r.row.date && r.row.time ? { date: r.row.date, time: r.row.time } : null));
    const slots = planSchedule(list.length, { start: st.start, days: st.days, times: st.times.split(/[,\s]+/), taken, fixed });
    const map = new Map(list.map((r, i) => [r, slots[i]]));
    return r => map.get(r) || null;
  }

  // ---------- page ----------
  function page() {
    const slotOf = plan(), rows = st.rows, count = ready().length;
    const step = (n, title, body) => `<section class="vs-panel vs-pad vs-stack vs-step"><div class="vs-step-head"><span class="vs-step-number">${n}</span><h2>${title}</h2></div>${body}</section>`;
    const usedSources = st.sources.filter(s => s.added), otherSources = st.sources.filter(s => s.rows && !s.added).length;
    const summary = st.media.length || st.texts.length ? `<p class="vs-mini">${st.media.length} video/foto · ${usedSources.length ? 'teks dari ' + usedSources.map(s => `<b>${esc(s.name)}</b>`).join(', ') : 'belum ada file teks judul/deskripsi'}${otherSources ? ` · ${otherSources} file teks lain hanya melengkapi yang kosong` : ''} · ${rows.length} konten terbaca.</p>` : '';
    const s1 = step(1, 'Pilih folder atau file', `<p class="vs-sub">Pilih satu folder (subfolder ikut dibaca) atau beberapa file sekaligus. Yang dikenali:</p>
<ul class="vs-help-list"><li><b>Video & foto</b>: MP4, JPG, PNG, WebP. Dicocokkan lewat nama file di paket, kode konten (V01-…, C01-slide-1…), nomor di nama file, atau folder episode (01 - Judul/Video/…).</li><li><b>Teks</b>: paket JSON/CSV (judul, deskripsi, tags, file, tanggal, jam), file .txt per episode (JUDUL, DESKRIPSI LENGKAP, TAGS), atau daftar caption Markdown (## V01 … Caption:).</li><li>Folder proyek seperti node_modules diabaikan.</li></ul>
<div class="vs-two"><label class="vs-label">Folder<input class="vs-input" type="file" id="pkg-folder" webkitdirectory multiple></label><label class="vs-label">Atau file<input class="vs-input" type="file" id="pkg-files" multiple accept=".json,.csv,.txt,.md,video/mp4,video/quicktime,image/jpeg,image/png,image/webp"></label></div>
<label class="vs-label">Platform bawaan<select class="vs-input" id="pkg-platform"><option value="youtube" ${st.platform === 'youtube' ? 'selected' : ''}>YouTube Shorts</option><option value="instagram" ${st.platform === 'instagram' ? 'selected' : ''}>Instagram</option></select><small>Dipakai bila teks tidak menyebut platform. Kode S01 selalu YouTube; V01, I01, C01 selalu Instagram.</small></label>
${st.reading ? '<p class="vs-mini" role="status">Membaca file…</p>' : summary}`);
    if (!rows.length) return `<div class="vs-stack">${s1}${st.media.length || st.texts.length ? '<p class="vs-empty">Belum ada konten yang bisa dibuat dari file ini. Tambahkan video/foto dan teks judul-deskripsinya.</p>' : ''}</div>`;
    const dayBoxes = WEEKDAYS.map(([d, label]) => `<label class="vs-check vs-day"><input type="checkbox" data-pkg-day="${d}" ${st.days.includes(d) ? 'checked' : ''}><span>${label}</span></label>`).join('');
    const s2 = step(2, 'Atur jadwal', `<div class="vs-stack"><label class="vs-check"><input type="radio" name="pkg-mode" value="scheduled" ${st.mode === 'scheduled' ? 'checked' : ''}><span><b>Jadwalkan otomatis</b> · terbit sesuai tanggal di tabel</span></label><label class="vs-check"><input type="radio" name="pkg-mode" value="review" ${st.mode === 'review' ? 'checked' : ''}><span><b>Ajukan untuk ditinjau</b> · tanggal disimpan, dijadwalkan setelah diperiksa</span></label><label class="vs-check"><input type="radio" name="pkg-mode" value="draft" ${st.mode === 'draft' ? 'checked' : ''}><span><b>Simpan sebagai draft</b> · caption boleh kosong, dilengkapi nanti</span></label></div>
${st.mode === 'draft' ? '' : `<div class="vs-two"><label class="vs-label">Mulai tanggal<input class="vs-input" type="date" id="pkg-start" value="${esc(st.start)}"></label><label class="vs-label">Jam terbit (WIB)<input class="vs-input" id="pkg-times" value="${esc(st.times)}" placeholder="19:00, 09:00"><small>Pisahkan dengan koma untuk lebih dari satu jam per hari.</small></label></div>
<div><span class="vs-label">Hari terbit</span><div class="vs-day-row">${dayBoxes}</div></div>
${rows.some(r => r.row.date) ? `<label class="vs-check"><input type="checkbox" id="pkg-file-dates" ${st.useFileDates ? 'checked' : ''}><span>Pakai tanggal dan jam dari file bila ada</span></label>` : ''}`}
${rows.some(r => platformOf(r) === 'youtube') ? `<label class="vs-check"><input type="checkbox" id="pkg-synthetic" ${st.synthetic ? 'checked' : ''}><span>Video berisi visual realistis buatan AI. Ungkapkan ke YouTube (setelan "konten sintetis").</span></label>` : ''}`);
    const table = rows.map((r, i) => {
      const c = checked(r), slot = slotOf(r), p = platformOf(r), res = r.result, e = edit(r), locked = res?.ok || st.running;
      const media = r.files.length ? esc(r.files.map(f => f.name).join(', ')) + (r.cover ? `<small class="vs-mini">Cover: ${esc(r.cover.name)}</small>` : '') : r.choices.length ? `<select class="vs-input" data-pkg-choice="${i}"><option value="">Pilih versi…</option>${r.choices.map((f, j) => `<option value="${j}">${esc(pathOf(f).split('/').slice(-2).join('/'))}</option>`).join('')}</select>` : '<span class="vs-mini">Belum ada</span>';
      const state = res ? (res.ok ? `<span class="vs-status scheduled">${esc(res.text)}</span>` : res.busy ? `<span class="vs-status">${esc(res.text)}</span>` : `<span class="vs-status failed">Gagal</span><small class="vs-inline-error">${esc(res.text)}</small>`)
        : c.errors.length ? `<small class="vs-inline-error">${esc(c.errors.join(' '))}</small>` : `<span class="vs-status scheduled">Siap · ${c.format}</span>${c.warnings.map(w => `<small class="vs-mini">${esc(w)}</small>`).join('')}`;
      const when = slot ? `<input class="vs-input" type="date" data-pkg-date="${i}" value="${slot.date}" ${locked ? 'disabled' : ''}><input class="vs-input" type="time" data-pkg-time="${i}" value="${slot.time}" ${locked ? 'disabled' : ''}>` : '<span class="vs-mini">—</span>';
      const label = r.row.id || r.row.key || '—';
      return `<tr class="${e.include ? '' : 'vs-muted'}"><td><input type="checkbox" data-pkg-include="${i}" ${e.include ? 'checked' : ''} ${locked ? 'disabled' : ''} aria-label="Ikutkan ${esc(label)}"></td><td>${esc(label)}<br><small class="vs-mini">${p === 'youtube' ? 'YouTube' : 'Instagram'}</small></td><td><input class="vs-input" data-pkg-title="${i}" value="${esc(r.row.title)}" maxlength="${p === 'youtube' ? 100 : 180}" ${res?.ok ? 'disabled' : ''}>${r.row.caption ? `<details><summary>Deskripsi${r.row.tags.length ? ' & tags' : ''}</summary><p class="vs-pkg-caption">${esc(r.row.caption)}</p>${r.row.tags.length ? `<p class="vs-mini">Tags: ${esc(r.row.tags.join(', '))}</p>` : ''}</details>` : '<small class="vs-mini">Tanpa caption</small>'}</td><td class="vs-pkg-media">${media}</td><td class="vs-pkg-when">${when}</td><td>${state}</td></tr>`;
    }).join('');
    const label = st.mode === 'scheduled' ? `Jadwalkan ${count} konten` : st.mode === 'review' ? `Ajukan ${count} konten` : `Simpan ${count} draft`;
    const s3 = step(3, 'Periksa lalu jalankan', `<div class="vs-table-wrap"><table class="vs-pkg-table"><thead><tr><th></th><th>No</th><th>Judul</th><th>Media</th><th>${st.mode === 'draft' ? 'Jadwal' : 'Jadwal (WIB)'}</th><th>Status</th></tr></thead><tbody>${table}</tbody></table></div>
${st.mode === 'scheduled' ? `<label class="vs-check"><input type="checkbox" id="pkg-approved" ${st.approved ? 'checked' : ''} ${st.running ? 'disabled' : ''}><span>Saya sudah memeriksa video, judul, dan deskripsi di atas, dan semuanya boleh terbit sesuai jadwal.</span></label>` : ''}
<div class="vs-actions">${st.done ? button('Lihat pustaka', 'pkg-open', 'vs-primary', 'layout-grid') : button(st.running ? 'Sedang memproses…' : label, 'pkg-run', 'vs-primary', 'send', !count || st.running || (st.mode === 'scheduled' && !st.approved) ? 'disabled' : '')}${button('Mulai ulang', 'pkg-reset', 'vs-text-button', '', st.running ? 'disabled' : '')}</div>
<p class="vs-mini">File diunggah satu per satu dari komputer ini; biarkan halaman tetap terbuka sampai selesai. YouTube mengunggah video pada waktu jadwalnya, jadi jadwal yang tersebar juga menjaga kuota harian.</p>`);
    return `<div class="vs-stack">${s1}${s2}${s3}</div>`;
  }

  // ---------- run ----------
  async function run() {
    const slotOf = plan(), list = ready();
    if (!list.length || st.running) return;
    st.running = true; ctx.render();
    let ok = 0;
    for (const r of list) {
      const slot = slotOf(r), p = platformOf(r), { format } = checked(r), taken = existingIds();
      const set = (text, extra = {}) => { r.result = { text, ...extra }; ctx.render(); };
      try {
        set('Mengunggah…', { busy: true });
        const form = new FormData(); for (const f of r.files) form.append('files', f);
        const media = (await api('/api/media', 'POST', form)).media || [];
        let coverId = null;
        if (r.cover && format === 'Reel') { const cf = new FormData(); cf.append('files', r.cover); coverId = (await api('/api/media?role=cover', 'POST', cf)).media?.[0]?.id || null; }
        set('Menyimpan…', { busy: true });
        const id = r.row.id && r.row.id[0] === PREFIX[format] && !taken.includes(r.row.id) ? r.row.id : undefined;
        const body = { format, title: r.row.title, caption: r.row.caption, mediaIds: media.map(m => m.id), ...(p === 'youtube' ? { tags: r.row.tags, syntheticMedia: st.synthetic } : {}) };
        // Keep the code from the file (V01, C02…) when it is free; otherwise the server picks the next one.
        let item = id ? await api('/api/posts', 'POST', { ...body, id }).catch(e => { if (/ID konten/.test(e.message)) return api('/api/posts', 'POST', body); throw e; }) : await api('/api/posts', 'POST', body);
        if (st.mode !== 'draft' || coverId) item = await api('/api/posts/' + encodeURIComponent(item.id), 'PUT', { revision: item.revision, intent: st.mode, approved: st.mode === 'scheduled', title: item.title, caption: item.caption, alt: item.alt || '', mediaIds: item.mediaIds, category: item.category, goal: item.goal, coverId, coverTime: null, date: slot?.date || item.date, time: slot?.time || item.time });
        ok++; set(st.mode === 'scheduled' ? `${item.id} · terjadwal` : st.mode === 'review' ? `${item.id} · ditinjau` : `${item.id} · draft`, { ok: true });
      } catch (error) { set(error.message || 'Gagal diproses.'); }
    }
    st.running = false; st.approved = false; st.done = st.rows.every(r => !edit(r).include || r.result?.ok);
    await ctx.reload();
    toast(`${ok} dari ${list.length} konten diproses.`, ok < list.length);
  }

  // ---------- events ----------
  async function addFiles(list) {
    const usable = list.filter(f => !mediaInfo(f).ignored);
    const seen = new Set([...st.texts.map(t => t.path), ...st.media.map(pathOf)]);
    st.reading = true; ctx.render();
    for (const f of usable) {
      const path = pathOf(f); if (seen.has(path)) continue; seen.add(path);
      if (MEDIA_FILE.test(f.name)) st.media.push(f);
      else if (TEXT_FILE.test(f.name) && f.size < 2 * 1024 * 1024) { try { st.texts.push({ name: f.name, path, text: await f.text() }); } catch { /* unreadable file: skip */ } }
    }
    st.reading = false; st.done = false; rebuild(); ctx.render();
  }
  function bind() {
    const root = ctx.root(), on = (sel, ev, fn) => root.querySelectorAll(sel).forEach(el => el.addEventListener(ev, e => fn(el, e)));
    on('#pkg-folder,#pkg-files', 'change', el => { if (el.files.length) void addFiles([...el.files]); });
    on('#pkg-platform', 'change', el => { st.platform = el.value; rebuild(); ctx.render(); });
    on('[name="pkg-mode"]', 'change', el => { st.mode = el.value; ctx.render(); });
    on('#pkg-start', 'change', el => { st.start = el.value; clearOverrides(); ctx.render(); });
    on('#pkg-times', 'change', el => { st.times = el.value; clearOverrides(); ctx.render(); });
    on('[data-pkg-day]', 'change', el => { const d = Number(el.dataset.pkgDay); st.days = el.checked ? [...st.days, d] : st.days.filter(x => x !== d); clearOverrides(); ctx.render(); });
    on('#pkg-file-dates', 'change', el => { st.useFileDates = el.checked; ctx.render(); });
    on('#pkg-synthetic', 'change', el => { st.synthetic = el.checked; });
    on('#pkg-approved', 'change', el => { st.approved = el.checked; const b = root.querySelector('[data-action="pkg-run"]'); if (b) b.disabled = !el.checked || !ready().length; });
    on('[data-pkg-include]', 'change', el => { edit(st.rows[el.dataset.pkgInclude]).include = el.checked; ctx.render(); });
    on('[data-pkg-title]', 'input', el => { const r = st.rows[el.dataset.pkgTitle]; r.row.title = el.value; edit(r).title = el.value; });
    on('[data-pkg-title]', 'change', () => ctx.render());
    on('[data-pkg-choice]', 'change', el => { const r = st.rows[el.dataset.pkgChoice]; if (el.value !== '') { edit(r).picked = r.choices[Number(el.value)]; rebuild(); ctx.render(); } });
    on('[data-pkg-date],[data-pkg-time]', 'change', el => { const i = el.dataset.pkgDate ?? el.dataset.pkgTime, date = root.querySelector(`[data-pkg-date="${i}"]`).value, time = root.querySelector(`[data-pkg-time="${i}"]`).value; if (date && time) edit(st.rows[i]).override = { date, time }; ctx.render(); });
  }
  const clearOverrides = () => Object.values(st.edits).forEach(e => { e.override = null; });
  async function action(name) {
    if (name === 'pkg-run') { await run(); return true; }
    if (name === 'pkg-reset') { reset(); ctx.render(); return true; }
    if (name === 'pkg-open') { const yt = st.rows.some(r => platformOf(r) === 'youtube'); reset(); ctx.navigate(yt ? 'youtube-library' : 'library'); return true; }
    return false;
  }
  return { page, bind, action };
}
