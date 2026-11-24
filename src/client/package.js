// "Impor paket" page: package file + media files → preview with an automatic schedule → upload and schedule each row.
import { parsePackage, matchFiles, checkRow, planSchedule } from './package-parse.js';

const WEEKDAYS = [[1, 'Sen'], [2, 'Sel'], [3, 'Rab'], [4, 'Kam'], [5, 'Jum'], [6, 'Sab'], [0, 'Min']];
const MEDIA = /\.(mp4|mov|jpe?g|png|webp)$/i;
const tomorrow = () => new Date(Date.now() + 7 * 3600000 + 86400000).toISOString().slice(0, 10);
const AI_NOTE = /ilustrasi AI|dibuat (dengan )?AI|buatan AI|AI[- ]generated/i;

export function createPackageImport(ctx) {
  const { api, esc, button, toast } = ctx;
  let st;
  const reset = () => { st = { pkgName: '', rows: [], files: [], platform: 'youtube', mode: 'scheduled', start: tomorrow(), days: [1, 3, 5], times: '19:00', useFileDates: true, synthetic: false, approved: false, running: false, done: false, error: '' }; };
  reset();

  // ---------- derived state ----------
  const platformOf = r => r.row.platform || st.platform;
  function rematch() {
    const matched = matchFiles(st.rows.map(r => r.row), st.files);
    st.rows = st.rows.map((r, i) => ({ ...r, files: r.picked ? r.files : matched[i].files, choices: matched[i].choices }));
  }
  function plan() {
    const taken = (ctx.getWorkspace().posts || []).filter(p => p.status === 'scheduled' && p.scheduleAt).map(p => p.scheduleAt);
    const active = st.rows.filter(r => r.include && !r.result?.ok && !checked(r).errors.length);
    const fixed = active.map(r => r.override || (st.useFileDates && r.row.date && r.row.time ? { date: r.row.date, time: r.row.time.slice(0, 5) } : null));
    const slots = planSchedule(active.length, { start: st.start, days: st.days, times: st.times.split(/[,\s]+/), taken, fixed });
    const map = new Map(active.map((r, i) => [r, slots[i]]));
    return r => map.get(r) || null;
  }
  const checked = r => checkRow({ row: r.row, files: r.files, platform: platformOf(r) });
  const ready = () => st.rows.filter(r => r.include && !r.result?.ok && !checked(r).errors.length);

  // ---------- page ----------
  function page() {
    const slotOf = plan(), rows = st.rows, count = ready().length, hasDates = rows.some(r => r.row.date);
    const step = (n, title, body) => `<section class="vs-panel vs-pad vs-stack vs-step"><div class="vs-step-head"><span class="vs-step-number">${n}</span><h2>${title}</h2></div>${body}</section>`;
    const s1 = step(1, 'Pilih file paket', `<p class="vs-sub">File JSON atau CSV berisi judul, deskripsi, dan (opsional) tags, nama file video, tanggal, dan jam per baris. Contoh: <b>Metadata YouTube - 12 Episode.json</b>.</p>
<div class="vs-two"><label class="vs-label">File paket<input class="vs-input" type="file" id="pkg-file" accept=".json,.csv"></label><label class="vs-label">Platform bawaan<select class="vs-input" id="pkg-platform"><option value="youtube" ${st.platform === 'youtube' ? 'selected' : ''}>YouTube Shorts</option><option value="instagram" ${st.platform === 'instagram' ? 'selected' : ''}>Instagram</option></select><small>Dipakai bila file tidak punya kolom platform.</small></label></div>
${st.pkgName ? `<p class="vs-mini">Terbaca: <b>${esc(st.pkgName)}</b> · ${rows.length} baris.</p>` : ''}${st.error ? `<p class="vs-inline-error" role="alert">${esc(st.error)}</p>` : ''}`);
    if (!rows.length) return `<div class="vs-stack">${s1}</div>`;
    const matched = rows.filter(r => r.files.length).length;
    const s2 = step(2, 'Pilih video dan foto', `<p class="vs-sub">Pilih semua file sekaligus, atau pilih foldernya (subfolder ikut dibaca). Video dicocokkan dengan nama file di paket, lalu dengan nomor episode di nama file (mis. Vayora-Shorts-<b>01</b>.mp4 → episode 01).</p>
<div class="vs-two"><label class="vs-label">File<input class="vs-input" type="file" id="pkg-media" multiple accept="video/mp4,video/quicktime,image/jpeg,image/png,image/webp"></label><label class="vs-label">Atau folder<input class="vs-input" type="file" id="pkg-folder" webkitdirectory multiple></label></div>
${st.files.length ? `<p class="vs-mini">${st.files.length} file dipilih · ${matched} dari ${rows.length} baris sudah punya media.</p>` : ''}`);
    const dayBoxes = WEEKDAYS.map(([d, label]) => `<label class="vs-check vs-day"><input type="checkbox" data-pkg-day="${d}" ${st.days.includes(d) ? 'checked' : ''}><span>${label}</span></label>`).join('');
    const s3 = step(3, 'Atur jadwal', `<div class="vs-stack"><label class="vs-check"><input type="radio" name="pkg-mode" value="scheduled" ${st.mode === 'scheduled' ? 'checked' : ''}><span><b>Jadwalkan otomatis</b> · terbit sesuai tanggal di tabel</span></label><label class="vs-check"><input type="radio" name="pkg-mode" value="review" ${st.mode === 'review' ? 'checked' : ''}><span><b>Ajukan untuk ditinjau</b> · tanggal disimpan, dijadwalkan setelah diperiksa</span></label><label class="vs-check"><input type="radio" name="pkg-mode" value="draft" ${st.mode === 'draft' ? 'checked' : ''}><span><b>Simpan sebagai draft</b></span></label></div>
<div class="vs-two"><label class="vs-label">Mulai tanggal<input class="vs-input" type="date" id="pkg-start" value="${esc(st.start)}"></label><label class="vs-label">Jam terbit (WIB)<input class="vs-input" id="pkg-times" value="${esc(st.times)}" placeholder="19:00, 09:00"><small>Pisahkan dengan koma untuk lebih dari satu jam per hari.</small></label></div>
<div><span class="vs-label">Hari terbit</span><div class="vs-day-row">${dayBoxes}</div></div>
${hasDates ? `<label class="vs-check"><input type="checkbox" id="pkg-file-dates" ${st.useFileDates ? 'checked' : ''}><span>Pakai tanggal dan jam dari file paket bila ada</span></label>` : ''}
${rows.some(r => platformOf(r) === 'youtube') ? `<label class="vs-check"><input type="checkbox" id="pkg-synthetic" ${st.synthetic ? 'checked' : ''}><span>Video berisi visual realistis buatan AI. Ungkapkan ke YouTube (setelan "konten sintetis").</span></label>` : ''}`);
    const table = rows.map((r, i) => {
      const c = checked(r), slot = slotOf(r), p = platformOf(r), res = r.result;
      const media = r.files.length ? esc(r.files.map(f => f.name).join(', ')) : r.choices.length ? `<select class="vs-input" data-pkg-choice="${i}"><option value="">Pilih versi…</option>${r.choices.map((f, j) => `<option value="${j}">${esc(f.name)}</option>`).join('')}</select>` : '<span class="vs-mini">Belum ada</span>';
      const state = res ? (res.ok ? `<span class="vs-status scheduled">${esc(res.text)}</span>` : res.busy ? `<span class="vs-status">${esc(res.text)}</span>` : `<span class="vs-status failed" title="${esc(res.text)}">Gagal</span><small class="vs-inline-error">${esc(res.text)}</small>`)
        : c.errors.length ? `<small class="vs-inline-error">${esc(c.errors.join(' '))}</small>` : `<span class="vs-status scheduled">Siap · ${c.format}</span>${c.warnings.map(w => `<small class="vs-mini">${esc(w)}</small>`).join('')}`;
      const when = st.mode === 'draft' ? '<span class="vs-mini">—</span>' : slot ? `<input class="vs-input" type="date" data-pkg-date="${i}" value="${slot.date}" ${!r.include || res?.ok ? 'disabled' : ''}><input class="vs-input" type="time" data-pkg-time="${i}" value="${slot.time}" ${!r.include || res?.ok ? 'disabled' : ''}>` : '<span class="vs-mini">—</span>';
      return `<tr class="${r.include ? '' : 'vs-muted'}"><td><input type="checkbox" data-pkg-include="${i}" ${r.include ? 'checked' : ''} ${res?.ok || st.running ? 'disabled' : ''} aria-label="Ikutkan ${esc(r.row.key)}"></td><td>${esc(r.row.key)}<br><small class="vs-mini">${p === 'youtube' ? 'YouTube' : 'Instagram'}</small></td><td><input class="vs-input" data-pkg-title="${i}" value="${esc(r.row.title)}" maxlength="${p === 'youtube' ? 100 : 180}" ${res?.ok ? 'disabled' : ''}><details><summary>Deskripsi${r.row.tags.length ? ' & tags' : ''}</summary><p class="vs-pkg-caption">${esc(r.row.caption)}</p>${r.row.tags.length ? `<p class="vs-mini">Tags: ${esc(r.row.tags.join(', '))}</p>` : ''}</details></td><td class="vs-pkg-media">${media}</td><td class="vs-pkg-when">${when}</td><td>${state}</td></tr>`;
    }).join('');
    const label = st.mode === 'scheduled' ? `Jadwalkan ${count} konten` : st.mode === 'review' ? `Ajukan ${count} konten` : `Simpan ${count} draft`;
    const s4 = step(4, 'Periksa lalu jalankan', `<div class="vs-table-wrap"><table class="vs-pkg-table"><thead><tr><th></th><th>No</th><th>Judul</th><th>Media</th><th>${st.mode === 'draft' ? 'Jadwal' : 'Jadwal (WIB)'}</th><th>Status</th></tr></thead><tbody>${table}</tbody></table></div>
${st.mode === 'scheduled' ? `<label class="vs-check"><input type="checkbox" id="pkg-approved" ${st.approved ? 'checked' : ''} ${st.running ? 'disabled' : ''}><span>Saya sudah memeriksa video, judul, dan deskripsi di atas, dan semuanya boleh terbit sesuai jadwal.</span></label>` : ''}
<div class="vs-actions">${st.done ? button('Lihat pustaka', 'pkg-open', 'vs-primary', 'layout-grid') : button(st.running ? 'Sedang memproses…' : label, 'pkg-run', 'vs-primary', 'send', !count || st.running || (st.mode === 'scheduled' && !st.approved) ? 'disabled' : '')}${button('Mulai ulang', 'pkg-reset', 'vs-text-button', '', st.running ? 'disabled' : '')}</div>
<p class="vs-mini">File diunggah satu per satu dari komputer ini; biarkan halaman tetap terbuka sampai selesai. YouTube mengunggah video pada waktu jadwalnya, jadi jadwal yang tersebar juga menjaga kuota harian.</p>`);
    return `<div class="vs-stack">${s1}${s2}${s3}${s4}</div>`;
  }

  // ---------- run ----------
  async function run() {
    const slotOf = plan(), list = ready();
    if (!list.length || st.running) return;
    st.running = true; ctx.render();
    let ok = 0;
    for (const r of list) {
      const slot = slotOf(r), p = platformOf(r), { format } = checked(r);
      const set = (text, extra = {}) => { r.result = { text, ...extra }; ctx.render(); };
      try {
        set('Mengunggah…', { busy: true });
        const form = new FormData(); for (const f of r.files) form.append('files', f);
        const media = (await api('/api/media', 'POST', form)).media || [];
        set('Menyimpan…', { busy: true });
        let item = await api('/api/posts', 'POST', { format, title: r.row.title, caption: r.row.caption, mediaIds: media.map(m => m.id), ...(p === 'youtube' ? { tags: r.row.tags, syntheticMedia: st.synthetic } : {}) });
        if (st.mode !== 'draft' && slot) item = await api('/api/posts/' + encodeURIComponent(item.id), 'PUT', { revision: item.revision, intent: st.mode, approved: st.mode === 'scheduled', title: item.title, caption: item.caption, alt: item.alt || '', mediaIds: item.mediaIds, category: item.category, goal: item.goal, coverId: null, coverTime: null, date: slot.date, time: slot.time });
        ok++; set(st.mode === 'scheduled' ? `${item.id} · terjadwal` : st.mode === 'review' ? `${item.id} · ditinjau` : `${item.id} · draft`, { ok: true });
      } catch (error) { set(error.message || 'Gagal diproses.'); }
    }
    st.running = false; st.done = st.rows.every(r => !r.include || r.result?.ok); st.approved = false;
    await ctx.reload();
    toast(`${ok} dari ${list.length} konten diproses.`, ok < list.length);
  }

  // ---------- events ----------
  async function readPackage(file) {
    st.error = '';
    try {
      const rows = parsePackage(await file.text(), file.name);
      st.pkgName = file.name; st.done = false;
      st.rows = rows.map(row => ({ row, files: [], choices: [], include: true, override: null, picked: false, result: null }));
      st.synthetic = rows.some(r => AI_NOTE.test(r.caption));
      if (st.files.length) rematch();
    } catch (e) { st.error = e.message; st.rows = []; }
    ctx.render();
  }
  function addFiles(list) {
    const names = new Set(st.files.map(f => f.name.toLowerCase()));
    for (const f of list) if (MEDIA.test(f.name) && !names.has(f.name.toLowerCase())) { st.files.push(f); names.add(f.name.toLowerCase()); }
    rematch(); ctx.render();
  }
  function bind() {
    const root = ctx.root(), on = (sel, ev, fn) => root.querySelectorAll(sel).forEach(el => el.addEventListener(ev, e => fn(el, e)));
    on('#pkg-file', 'change', el => { if (el.files[0]) void readPackage(el.files[0]); });
    on('#pkg-platform', 'change', el => { st.platform = el.value; ctx.render(); });
    on('#pkg-media,#pkg-folder', 'change', el => addFiles([...el.files]));
    on('[name="pkg-mode"]', 'change', el => { st.mode = el.value; ctx.render(); });
    on('#pkg-start', 'change', el => { st.start = el.value; clearOverrides(); ctx.render(); });
    on('#pkg-times', 'change', el => { st.times = el.value; clearOverrides(); ctx.render(); });
    on('[data-pkg-day]', 'change', el => { const d = Number(el.dataset.pkgDay); st.days = el.checked ? [...st.days, d] : st.days.filter(x => x !== d); clearOverrides(); ctx.render(); });
    on('#pkg-file-dates', 'change', el => { st.useFileDates = el.checked; ctx.render(); });
    on('#pkg-synthetic', 'change', el => { st.synthetic = el.checked; });
    on('#pkg-approved', 'change', el => { st.approved = el.checked; const b = root.querySelector('[data-action="pkg-run"]'); if (b) b.disabled = !el.checked || !ready().length; });
    on('[data-pkg-include]', 'change', el => { st.rows[el.dataset.pkgInclude].include = el.checked; ctx.render(); });
    on('[data-pkg-title]', 'input', el => { st.rows[el.dataset.pkgTitle].row.title = el.value; });
    on('[data-pkg-title]', 'change', () => ctx.render());
    on('[data-pkg-choice]', 'change', el => { const r = st.rows[el.dataset.pkgChoice]; if (el.value !== '') { r.files = [r.choices[Number(el.value)]]; r.picked = true; ctx.render(); } });
    on('[data-pkg-date],[data-pkg-time]', 'change', el => { const i = el.dataset.pkgDate ?? el.dataset.pkgTime, r = st.rows[i]; const date = root.querySelector(`[data-pkg-date="${i}"]`).value, time = root.querySelector(`[data-pkg-time="${i}"]`).value; if (date && time) r.override = { date, time }; ctx.render(); });
  }
  const clearOverrides = () => st.rows.forEach(r => { r.override = null; });
  async function action(name) {
    if (name === 'pkg-run') { await run(); return true; }
    if (name === 'pkg-reset') { reset(); ctx.render(); return true; }
    if (name === 'pkg-open') { const yt = st.rows.some(r => platformOf(r) === 'youtube'); reset(); ctx.navigate(yt ? 'youtube-library' : 'library'); return true; }
    return false;
  }
  return { page, bind, action };
}
