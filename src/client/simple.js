// Everyday views for non-technical team members: the "Hari ini" home page, the step-by-step "Buat posting" flow
// and the list of problems that need attention. They reuse the studio's helpers through `ctx`.

const DAY = 86400000;
const PLATFORM = { instagram: 'Instagram', youtube: 'YouTube Shorts' };
const wibDate = value => new Date(Date.parse(value) + 7 * 3600000).toISOString().slice(0, 10);

export function createSimpleViews(ctx) {
  const { api, esc, button, toast, stamp, previewImage, names } = ctx;
  const workspace = () => ctx.getWorkspace(), user = () => ctx.getUser();
  const platformOf = item => item.format === 'Short' ? 'youtube' : 'instagram';

  // ---------- Problems that need attention ----------
  function problemAlerts() {
    const w = workspace(), owner = user().role === 'owner', s = w.settings || {}, list = [];
    const ig = w.instagram || {}, yt = w.youtube || {}, posts = w.posts || [];
    const scheduled = posts.filter(p => p.status === 'scheduled');
    if (s.notifyFailure !== false) {
      const failed = posts.filter(p => p.status === 'failed').length, uncertain = posts.filter(p => p.status === 'uncertain').length;
      if (failed) list.push({ level: 'danger', text: `${failed} konten gagal terbit. Buka Antrean untuk melihat alasannya dan menjadwalkan ulang.`, action: ['Buka Antrean', 'nav:queue'] });
      if (uncertain) list.push({ level: 'danger', text: `${uncertain} konten belum pasti terbit. Periksa hasilnya sebelum mencoba lagi agar tidak terunggah dua kali.`, action: ['Buka Antrean', 'nav:queue'] });
    }
    if (s.notifyReconnect !== false) {
      const fix = owner ? ['Buka Koneksi', 'nav:settings'] : null;
      if (ig.error || (ig.expiresAt && !ig.connected && !ig.noExpiry)) list.push({ level: 'danger', text: owner ? 'Koneksi Instagram terputus. Sambungkan ulang agar posting tetap jalan.' : 'Koneksi Instagram terputus. Minta pemilik workspace menyambungkan ulang.', action: fix });
      else if (ig.connected && !ig.noExpiry && ig.expiresAt && Date.parse(ig.expiresAt) - Date.now() < 7 * DAY) list.push({ level: 'warning', text: 'Izin Instagram akan habis dalam 7 hari. Studio mencoba memperpanjang otomatis; bila gagal, sambungkan ulang.', action: fix });
      if (yt.error) list.push({ level: 'danger', text: owner ? 'Koneksi YouTube terputus. Sambungkan ulang channel agar Short tetap terunggah.' : 'Koneksi YouTube terputus. Minta pemilik workspace menyambungkan ulang.', action: fix });
      if (scheduled.some(p => platformOf(p) === 'instagram') && !ig.connected) list.push({ level: 'danger', text: 'Ada konten Instagram terjadwal, tetapi Instagram belum terhubung.', action: fix });
      if (scheduled.some(p => platformOf(p) === 'youtube') && !yt.connected) list.push({ level: 'danger', text: 'Ada Short terjadwal, tetapi channel YouTube belum terhubung.', action: fix });
    }
    if (scheduled.length && (!s.publishingEnabled || s.paused)) list.push({ level: 'warning', text: !s.publishingEnabled ? `${scheduled.length} konten terjadwal tidak akan terbit karena publikasi nyata belum diaktifkan.` : `${scheduled.length} konten terjadwal menunggu karena antrean sedang dijeda.`, action: owner ? (!s.publishingEnabled ? ['Aktifkan publikasi', 'nav:settings'] : ['Buka Antrean', 'nav:queue']) : null });
    return list;
  }
  const alertsHTML = alerts => alerts.map(a => `<div class="vs-alert ${a.level}" role="${a.level === 'danger' ? 'alert' : 'status'}"><span>${esc(a.text)}</span>${a.action ? button(a.action[0], a.action[1]) : ''}</div>`).join('');

  // ---------- Home: "Hari ini" ----------
  function record(item) {
    return `<div class="vs-record">${previewImage(item)}<div class="vs-record-copy"><h3>${esc(item.title)}</h3><span class="vs-mini">${PLATFORM[platformOf(item)]} · ${esc(names[item.status] || item.status)}${item.scheduleAt ? ' · ' + esc(stamp(item.scheduleAt)) : ''}</span></div><div class="vs-actions">${button('Buka', 'edit:' + item.id)}</div></div>`;
  }
  function homePage() {
    const w = workspace(), posts = w.posts || [], now = Date.now(), today = wibDate(new Date().toISOString());
    const alerts = problemAlerts();
    const upcoming = posts.filter(p => p.status === 'scheduled' && p.scheduleAt && Date.parse(p.scheduleAt) <= now + 7 * DAY).sort((a, b) => a.scheduleAt.localeCompare(b.scheduleAt));
    const todayCount = upcoming.filter(p => wibDate(p.scheduleAt) === today).length;
    const review = posts.filter(p => p.status === 'review');
    const drafts = posts.filter(p => p.status === 'draft').length;
    const published = posts.filter(p => p.status === 'published' && p.publishedAt && now - Date.parse(p.publishedAt) < 30 * DAY).length;
    const ig = w.instagram || {}, yt = w.youtube || {}, s = w.settings || {};
    const connection = (label, ok, detail) => `<div class="vs-setting"><div><h3>${label}</h3><p class="vs-sub">${detail}</p></div><span class="vs-status ${ok ? 'scheduled' : 'review'}">${ok ? 'Terhubung' : 'Belum terhubung'}</span></div>`;
    return `<section class="vs-panel vs-pad vs-stack"><div class="vs-row"><div><h2>Halo, ${esc(user().name)}</h2><p class="vs-sub">${alerts.length ? 'Ada yang perlu kamu perhatikan.' : 'Semua berjalan baik. Tidak ada yang perlu ditangani.'}</p></div>${button('Buat posting', 'nav:create', 'vs-primary', 'circle-plus')}</div>${alerts.length ? `<div class="vs-stack">${alertsHTML(alerts)}</div>` : ''}</section>
<div class="vs-stats"><span><strong>${todayCount}</strong> terbit hari ini</span><span><strong>${upcoming.length}</strong> terjadwal 7 hari</span><span><strong>${review.length}</strong> perlu ditinjau</span><span><strong>${drafts}</strong> draft</span><span><strong>${published}</strong> terbit 30 hari</span></div>
<section class="vs-panel"><div class="vs-panel-head"><h2>Jadwal 7 hari ke depan</h2>${button('Kalender', 'nav:calendar', 'vs-text-button')}</div><div class="vs-list">${upcoming.map(record).join('') || '<div class="vs-empty"><h3>Belum ada jadwal minggu ini.</h3><p>Buat posting baru lalu pilih tanggal dan jam terbit.</p></div>'}</div></section>
<section class="vs-panel"><div class="vs-panel-head"><h2>Perlu ditinjau</h2></div><div class="vs-list">${review.map(record).join('') || '<div class="vs-empty"><h3>Tidak ada yang menunggu tinjauan.</h3><p>Konten yang diajukan untuk ditinjau muncul di sini.</p></div>'}</div></section>
<section class="vs-panel vs-pad">${connection('Instagram', ig.connected, ig.username ? '@' + esc(ig.username) : 'Belum ada akun yang terhubung.')}${connection('YouTube Shorts', yt.connected, yt.channelTitle ? esc(yt.channelTitle) : 'Belum ada channel yang terhubung.')}<div class="vs-setting"><div><h3>Publikasi nyata</h3><p class="vs-sub">${s.publishingEnabled ? (s.paused ? 'Aktif, tetapi antrean sedang dijeda.' : 'Aktif. Konten terjadwal terbit otomatis.') : 'Belum aktif. Konten hanya disimpan sebagai rencana.'}</p></div>${user().role === 'owner' ? button('Atur', 'nav:settings', 'vs-text-button') : ''}</div></section>`;
  }

  // ---------- "Buat posting": choose platform → upload → words → when ----------
  let flow = null;
  const reset = () => { flow = { platform: '', media: [], title: '', caption: '', when: 'review', date: '', time: '09:00', approved: false, busy: false, error: '' }; };
  // Scheduling publishes automatically, so it needs the same explicit approval as the editor.
  const canSubmit = f => !!formatFor(f.platform, f.media) && !!f.title.trim() && !!f.caption.trim() && (f.when !== 'scheduled' || (f.date && f.time && f.approved)) && !f.busy;
  reset();
  function formatFor(platform, media) {
    if (!media.length) return '';
    const videos = media.filter(m => m.mime === 'video/mp4'), images = media.filter(m => m.mime === 'image/jpeg');
    if (platform === 'youtube') return media.length === 1 && videos.length === 1 ? 'Short' : '';
    if (media.length === 1) return videos.length ? 'Reel' : 'Gambar';
    return images.length === media.length && media.length <= 20 ? 'Carousel' : '';
  }
  const formatLabel = { Gambar: 'Foto (1 gambar)', Carousel: 'Carousel (beberapa gambar)', Reel: 'Reel (video)', Short: 'YouTube Short (video vertikal)' };
  function createPage() {
    const f = flow, format = formatFor(f.platform, f.media);
    const step = (n, title, body, done) => `<section class="vs-panel vs-pad vs-stack vs-step ${done ? 'done' : ''}"><div class="vs-step-head"><span class="vs-step-number">${n}</span><h2>${title}</h2></div>${body}</section>`;
    const choice = (id, title, hint) => `<button type="button" class="vs-choice" data-create-platform="${id}" aria-pressed="${f.platform === id}"><b>${title}</b><span>${hint}</span></button>`;
    const thumbs = f.media.map(m => `<figure class="vs-create-thumb">${m.mime === 'video/mp4' ? `<video src="${esc(m.url)}" muted playsinline preload="metadata"></video>` : `<img src="${esc(m.url)}" alt="">`}<figcaption>${esc(m.name)}${m.duration ? ' · ' + Math.round(m.duration) + ' dtk' : ''}</figcaption></figure>`).join('');
    const mediaHint = f.platform === 'youtube' ? 'Pilih 1 video MP4 vertikal, maksimal 3 menit.' : 'Pilih 1 foto, 2–20 foto untuk carousel, atau 1 video untuk Reel.';
    const ready = canSubmit(f);
    return `${step(1, 'Mau posting ke mana?', `<div class="vs-choice-grid">${choice('instagram', 'Instagram', 'Foto, carousel, atau Reel')}${choice('youtube', 'YouTube Shorts', 'Video vertikal maksimal 3 menit')}</div>`, !!f.platform)}
${f.platform ? step(2, 'Pilih foto atau video', `<p class="vs-sub">${mediaHint}</p><label class="vs-label">File<input class="vs-input" type="file" id="create-files" ${f.platform === 'youtube' ? 'accept="video/mp4"' : 'multiple accept="image/jpeg,image/png,image/webp,video/mp4"'}></label>${f.busy ? '<p class="vs-mini" role="status">Mengunggah…</p>' : ''}${thumbs ? `<div class="vs-create-thumbs">${thumbs}</div>` : ''}${f.media.length ? `<p class="vs-mini">${format ? 'Jenis konten: <b>' + formatLabel[format] + '</b>' : 'Kombinasi file ini tidak didukung. ' + mediaHint}</p>` : ''}`, !!format) : ''}
${format ? step(3, 'Tulis judul dan caption', `<label class="vs-label">Judul${f.platform === 'youtube' ? ' <small>tampil sebagai judul video YouTube, maksimal 100 karakter</small>' : ' <small>hanya untuk tim, tidak tampil di Instagram</small>'}<input class="vs-input" id="create-title" maxlength="${f.platform === 'youtube' ? 100 : 180}" value="${esc(f.title)}"></label><label class="vs-label">${f.platform === 'youtube' ? 'Deskripsi' : 'Caption'} <small><span id="create-caption-count">${f.caption.length}</span>/2.200</small><textarea class="vs-input" id="create-caption" maxlength="2200" style="min-height:140px">${esc(f.caption)}</textarea></label><p class="vs-mini">Butuh ide? Setelah disimpan, buka konten lalu gunakan Asisten caption.</p>`, !!(f.title.trim() && f.caption.trim())) : ''}
${format ? step(4, 'Kapan diposting?', `<div class="vs-stack"><label class="vs-check"><input type="radio" name="create-when" value="review" ${f.when === 'review' ? 'checked' : ''}><span><b>Ajukan untuk ditinjau</b> · pemilik memeriksa dulu sebelum dijadwalkan</span></label><label class="vs-check"><input type="radio" name="create-when" value="scheduled" ${f.when === 'scheduled' ? 'checked' : ''}><span><b>Jadwalkan sekarang</b> · terbit otomatis pada waktu yang dipilih</span></label><label class="vs-check"><input type="radio" name="create-when" value="draft" ${f.when === 'draft' ? 'checked' : ''}><span><b>Simpan sebagai draft</b> · lanjutkan nanti</span></label>${f.when === 'scheduled' ? `<div class="vs-two"><label class="vs-label">Tanggal<input class="vs-input" type="date" id="create-date" value="${esc(f.date)}"></label><label class="vs-label">Jam (WIB)<input class="vs-input" type="time" id="create-time" value="${esc(f.time)}"></label></div><label class="vs-check"><input type="checkbox" id="create-approved" ${f.approved ? 'checked' : ''}><span>Saya sudah memeriksa foto/video dan caption, dan konten ini boleh terbit.</span></label>` : ''}</div>${f.error ? `<p class="vs-inline-error" role="alert">${esc(f.error)}</p>` : ''}<div class="vs-actions">${button(f.when === 'scheduled' ? 'Simpan & jadwalkan' : f.when === 'draft' ? 'Simpan draft' : 'Simpan & ajukan', 'create-submit', 'vs-primary', 'send', ready && !f.busy ? '' : 'disabled')}${button('Mulai ulang', 'create-reset', 'vs-text-button')}</div>`, false) : ''}`;
  }

  async function upload(files) {
    const form = new FormData();
    for (const file of files) form.append('files', file);
    flow.busy = true; flow.error = ''; ctx.render();
    try { const data = await api('/api/media', 'POST', form); flow.media = data.media || []; }
    catch (error) { flow.media = []; toast(error.message, true); }
    finally { flow.busy = false; ctx.render(); }
  }
  async function submit() {
    const f = flow, format = formatFor(f.platform, f.media);
    if (!format || f.busy) return;
    f.busy = true; f.error = ''; ctx.render();
    try {
      let item = await api('/api/posts', 'POST', { format, title: f.title.trim(), caption: f.caption, mediaIds: f.media.map(m => m.id) });
      if (f.when !== 'draft') {
        item = await api('/api/posts/' + encodeURIComponent(item.id), 'PUT', { revision: item.revision, intent: f.when, approved: f.when === 'scheduled' && f.approved, title: item.title, caption: item.caption, alt: item.alt || '', mediaIds: item.mediaIds, category: item.category, goal: item.goal, coverId: null, coverTime: null, date: f.when === 'scheduled' ? f.date : item.date, time: f.when === 'scheduled' ? f.time : item.time });
      }
      const target = f.platform === 'youtube' ? 'youtube-library' : 'library';
      reset(); await ctx.reload();
      toast(f.when === 'scheduled' ? 'Posting dijadwalkan.' : f.when === 'draft' ? 'Draft tersimpan.' : 'Posting diajukan untuk ditinjau.');
      ctx.navigate(target);
    } catch (error) { f.error = error.message; f.busy = false; ctx.render(); }
  }
  function bind() {
    const root = ctx.root();
    root.querySelectorAll('[data-create-platform]').forEach(el => el.addEventListener('click', () => { if (flow.platform !== el.dataset.createPlatform) { flow.platform = el.dataset.createPlatform; flow.media = []; } ctx.render(); }));
    root.querySelector('#create-files')?.addEventListener('change', e => { if (e.target.files.length) void upload([...e.target.files]); });
    root.querySelector('#create-title')?.addEventListener('input', e => { flow.title = e.target.value; refreshSubmit(); });
    root.querySelector('#create-caption')?.addEventListener('input', e => { flow.caption = e.target.value; const c = root.querySelector('#create-caption-count'); if (c) c.textContent = String(e.target.value.length); refreshSubmit(); });
    root.querySelectorAll('[name="create-when"]').forEach(el => el.addEventListener('change', () => { flow.when = el.value; if (flow.when === 'scheduled' && !flow.date) flow.date = wibDate(new Date(Date.now() + DAY).toISOString()); ctx.render(); }));
    root.querySelector('#create-date')?.addEventListener('input', e => { flow.date = e.target.value; refreshSubmit(); });
    root.querySelector('#create-time')?.addEventListener('input', e => { flow.time = e.target.value; refreshSubmit(); });
    root.querySelector('#create-approved')?.addEventListener('change', e => { flow.approved = e.target.checked; refreshSubmit(); });
  }
  // Typing must not re-render (focus would jump); only the submit button state follows the inputs.
  function refreshSubmit() {
    const b = ctx.root().querySelector('[data-action="create-submit"]'); if (b) b.disabled = !canSubmit(flow);
  }
  async function action(name) {
    if (name === 'create-submit') { await submit(); return true; }
    if (name === 'create-reset') { reset(); ctx.render(); return true; }
    return false;
  }
  return { homePage, createPage, problemAlerts, bind, action, resetCreate: reset };
}
