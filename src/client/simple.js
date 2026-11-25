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
    return [...list, ...(ctx.extraAlerts?.() || [])];
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

  // ---------- "Buat posting": form on the left (platform → upload → words → when), live preview on the right ----------
  let flow = null, ai = null; // ai: AI status from /api/assistant (null = not loaded yet)
  const reset = () => { ai = null; flow = { platform: 'instagram', media: [], title: '', caption: '', when: 'review', date: '', time: '09:00', approved: false, busy: false, error: '', writing: false, written: false, aiError: '', aiWarnings: [], tags: [], slide: 0, more: false }; };
  // Scheduling publishes automatically, so it needs the same explicit approval as the editor.
  const canSubmit = f => !!formatFor(f.platform, f.media) && !!f.title.trim() && !!f.caption.trim() && (f.when !== 'scheduled' || (f.date && f.time && f.approved)) && !f.busy && !f.writing;
  reset();
  function formatFor(platform, media) {
    if (!media.length) return '';
    const videos = media.filter(m => m.mime === 'video/mp4'), images = media.filter(m => m.mime === 'image/jpeg');
    if (platform === 'youtube') return media.length === 1 && videos.length === 1 ? 'Short' : '';
    if (media.length === 1) return videos.length ? 'Reel' : 'Gambar';
    return images.length === media.length && media.length <= 20 ? 'Carousel' : '';
  }
  const formatLabel = { Gambar: 'Foto (1 gambar)', Carousel: 'Carousel (beberapa gambar)', Reel: 'Reel (video)', Short: 'YouTube Short (video vertikal)' };
  const icon = name => (ctx.icon ? ctx.icon(name) : '');

  function createPage() {
    const f = flow, format = formatFor(f.platform, f.media), yt = f.platform === 'youtube', ready = canSubmit(f);
    const group = (n, title, body, disabled = false, hint = '') => `<fieldset class="vs-create-group" ${disabled ? 'disabled' : ''}><legend><span class="vs-step-number">${n}</span>${title}</legend>${disabled && hint ? `<p class="vs-mini">${hint}</p>` : body}</fieldset>`;
    const choice = (id, title, hint) => `<button type="button" class="vs-choice" data-create-platform="${id}" aria-pressed="${f.platform === id}"><b>${title}</b><span>${hint}</span></button>`;
    const mediaHint = yt ? 'Pilih 1 video MP4 vertikal, maksimal 3 menit.' : 'Pilih 1 foto, 2–20 foto untuk carousel, atau 1 video untuk Reel.';
    const files = f.media.length ? `<ul class="vs-create-files">${f.media.map(m => `<li>${esc(m.name)}${m.duration ? ' · ' + Math.round(m.duration) + ' dtk' : ''}</li>`).join('')}</ul>` : '';
    const g1 = group(1, 'Mau posting ke mana?', `<div class="vs-choice-grid">${choice('instagram', 'Instagram', 'Foto, carousel, atau Reel')}${choice('youtube', 'YouTube Shorts', 'Video vertikal maksimal 3 menit')}</div>`);
    const g2 = group(2, 'Pilih foto atau video', `<label class="vs-dropzone" id="create-drop">${icon('upload')}<b>${f.media.length ? 'Ganti file: tarik & lepas di sini' : 'Tarik & lepas file di sini'}</b><span>atau klik untuk memilih dari komputer</span><span class="vs-mini">${mediaHint}</span><input class="sr-only" type="file" id="create-files" aria-label="Pilih foto atau video" ${yt ? 'accept="video/mp4"' : 'multiple accept="image/jpeg,image/png,image/webp,video/mp4"'}></label>${f.busy && !f.media.length ? '<p class="vs-mini" role="status">Mengunggah…</p>' : ''}${files}${f.media.length ? `<p class="vs-mini">${format ? 'Jenis konten: <b>' + formatLabel[format] + '</b>' : 'Kombinasi file ini tidak didukung. ' + mediaHint}</p>` : ''}`);
    const g3 = group(3, 'Tulis judul dan caption', `${aiLine(f)}<label class="vs-label">Judul${yt ? ' <small>tampil sebagai judul video YouTube, maksimal 100 karakter</small>' : ' <small>hanya untuk tim, tidak tampil di Instagram</small>'}<input class="vs-input" id="create-title" ${f.writing ? 'disabled' : ''} maxlength="${yt ? 100 : 180}" value="${esc(f.title)}"></label><label class="vs-label">${yt ? 'Deskripsi' : 'Caption'} <small><span id="create-caption-count">${f.caption.length}</span>/2.200</small><textarea class="vs-input" id="create-caption" ${f.writing ? 'disabled' : ''} maxlength="2200" style="min-height:160px">${esc(f.caption)}</textarea></label>${ai?.textConfigured ? '' : '<p class="vs-mini">Butuh ide? Setelah disimpan, buka konten lalu gunakan Asisten caption.</p>'}${yt && f.tags.length ? `<p class="vs-mini">Tags YouTube: ${esc(f.tags.join(', '))}</p>` : ''}`, !format, 'Aktif setelah foto atau video diunggah.');
    const g4 = group(4, 'Kapan diposting?', `<div class="vs-stack"><label class="vs-check"><input type="radio" name="create-when" value="review" ${f.when === 'review' ? 'checked' : ''}><span><b>Ajukan untuk ditinjau</b> · pemilik memeriksa dulu sebelum dijadwalkan</span></label><label class="vs-check"><input type="radio" name="create-when" value="scheduled" ${f.when === 'scheduled' ? 'checked' : ''}><span><b>Jadwalkan sekarang</b> · terbit otomatis pada waktu yang dipilih</span></label><label class="vs-check"><input type="radio" name="create-when" value="draft" ${f.when === 'draft' ? 'checked' : ''}><span><b>Simpan sebagai draft</b> · lanjutkan nanti</span></label>${f.when === 'scheduled' ? `<div class="vs-two"><label class="vs-label">Tanggal<input class="vs-input" type="date" id="create-date" value="${esc(f.date)}"></label><label class="vs-label">Jam (WIB)<input class="vs-input" type="time" id="create-time" value="${esc(f.time)}"></label></div><label class="vs-check"><input type="checkbox" id="create-approved" ${f.approved ? 'checked' : ''}><span>Saya sudah memeriksa foto/video dan caption, dan konten ini boleh terbit.</span></label>` : ''}</div>`, !format, 'Aktif setelah foto atau video diunggah.');
    const actions = `${f.error ? `<p class="vs-inline-error" role="alert">${esc(f.error)}</p>` : ''}<div class="vs-actions">${button(f.when === 'scheduled' ? 'Simpan & jadwalkan' : f.when === 'draft' ? 'Simpan draft' : 'Simpan & ajukan', 'create-submit', 'vs-primary', 'send', ready ? '' : 'disabled')}${button('Mulai ulang', 'create-reset', 'vs-text-button')}</div>`;
    const spec = format ? formatLabel[format] : yt ? 'YouTube Shorts · 9:16' : 'Instagram · 4:5 sampai 1,91:1';
    return `<section class="vs-panel vs-pad vs-stack" id="create-post"><div class="vs-row"><div><span class="vs-eyebrow">BUAT POSTING</span><h2>Unggah, tulis, lalu pilih kapan terbit.</h2></div><span class="vs-status">${esc(spec)}</span></div><p class="vs-sub">Pratinjau ikut berubah saat kamu mengetik. Konten baru tersimpan setelah kamu menekan Simpan.</p><div class="smart-layout vs-create-layout"><div class="vs-stack vs-create-form">${g1}${g2}${g3}${g4}${actions}</div><div id="create-preview" class="smart-design-result vs-create-preview" aria-label="Pratinjau">${preview(f)}</div></div></section>`;
  }

  // ---------- live preview ----------
  const CUT = 125; // Instagram shows about this many characters before "… lainnya"
  function captionPreview(f) {
    const text = f.caption.trim();
    if (!text) return '<span class="vs-mini">Caption tampil di sini.</span>';
    if (f.more || text.length <= CUT) return esc(text);
    return `${esc(text.slice(0, CUT).trimEnd())}… <button type="button" class="vs-text-button vs-preview-more" data-action="create-more">lainnya</button>`;
  }
  function mediaPreview(f, frameClass) {
    const list = f.media, i = Math.min(f.slide, Math.max(0, list.length - 1)), m = list[i];
    if (!m) return `<div class="${frameClass} vs-preview-blank">${f.busy ? 'Mengunggah…' : ''}</div>`;
    const ratio = m.width && m.height ? `${m.width} / ${m.height}` : '4 / 5';
    const body = m.mime === 'video/mp4' ? `<video src="${esc(m.url)}" poster="${esc(m.posterUrl || '')}" controls muted playsinline preload="metadata"></video>` : `<img src="${esc(m.url)}" alt="">`;
    const nav = list.length > 1 ? `<div class="vs-preview-nav"><button type="button" data-action="create-slide-prev" aria-label="Slide sebelumnya" ${i === 0 ? 'disabled' : ''}>${icon('chevron-left')}</button><span>${i + 1} / ${list.length}</span><button type="button" data-action="create-slide-next" aria-label="Slide berikutnya" ${i === list.length - 1 ? 'disabled' : ''}>${icon('chevron-right')}</button></div>` : '';
    return `<div class="${frameClass}" style="aspect-ratio:${frameClass.includes('short') ? '9 / 16' : ratio}">${body}${nav}</div>`;
  }
  function preview(f) {
    if (!f.media.length && !f.busy) return `<img class="smart-design-placeholder" src="/brand/icon.svg" alt=""><h3>Pratinjau postinganmu di sini.</h3><p class="vs-mini">Unggah foto atau video untuk melihat tampilannya di ${f.platform === 'youtube' ? 'YouTube Shorts' : 'Instagram'}.</p>`;
    const w = workspace();
    if (f.platform === 'youtube') {
      const channel = w.youtube?.channelTitle || 'Channel YouTube';
      const long = f.title.length > 100 ? '<p class="vs-inline-error">Judul YouTube maksimal 100 karakter.</p>' : '';
      return `<div class="vs-preview-label">Pratinjau YouTube Shorts</div><div class="vs-short-card">${mediaPreview(f, 'vs-preview-media vs-preview-short')}<div class="vs-short-meta"><b id="create-pv-title">${esc(f.title) || '<span class="vs-mini">Judul video tampil di sini.</span>'}</b><span class="vs-mini">${esc(channel)}</span><p id="create-pv-caption" class="vs-preview-caption">${captionPreview(f)}</p></div></div>${long}`;
    }
    const user = w.instagram?.username || 'vayora.id';
    return `<div class="vs-preview-label">Pratinjau Instagram</div><article class="vs-ig-card"><header><img src="/brand/icon.svg" alt=""><b>${esc(user)}</b></header>${mediaPreview(f, 'vs-preview-media')}<div class="vs-ig-icons">${icon('heart')}${icon('message-circle')}${icon('send')}<span></span>${icon('bookmark')}</div><p id="create-pv-caption" class="vs-preview-caption"><b>${esc(user)}</b> ${captionPreview(f)}</p></article>`;
  }
  // Typing only refreshes the preview text, so focus and video playback are not disturbed.
  function refreshPreviewText() {
    const root = ctx.root(), title = root.querySelector('#create-pv-title'), caption = root.querySelector('#create-pv-caption');
    if (title) title.innerHTML = esc(flow.title) || '<span class="vs-mini">Judul video tampil di sini.</span>';
    if (caption) caption.innerHTML = flow.platform === 'youtube' ? captionPreview(flow) : `<b>${esc(workspace().instagram?.username || 'vayora.id')}</b> ${captionPreview(flow)}`;
  }

  async function upload(files) {
    const form = new FormData();
    for (const file of files) form.append('files', file);
    flow.busy = true; flow.error = ''; ctx.render();
    try { const data = await api('/api/media', 'POST', form); flow.media = data.media || []; flow.slide = 0; }
    catch (error) { flow.media = []; toast(error.message, true); }
    finally { flow.busy = false; ctx.render(); }
    if (ai?.textConfigured && formatFor(flow.platform, flow.media)) await write(false);
  }
  // Asks the AI for a first title and caption. Fields the user already typed are kept unless they ask to rewrite.
  async function write(force) {
    const f = flow; if (f.writing || !f.media.length) return;
    f.writing = true; f.aiError = ''; f.aiWarnings = []; ctx.render();
    try {
      const d = await api('/api/assistant/draft', 'POST', { platform: f.platform, mediaIds: f.media.map(m => m.id) });
      if (flow !== f) return; // the user started over meanwhile
      if (force || !f.title.trim()) f.title = d.title;
      if (force || !f.caption.trim()) f.caption = d.caption;
      f.written = true; f.aiWarnings = d.warnings || []; if (force || !f.tags.length) f.tags = d.tags || [];
    } catch (error) { if (flow === f) f.aiError = error.message; }
    finally { if (flow === f) { f.writing = false; ctx.render(); } }
  }
  function aiLine(f) {
    if (ai && !ai.textConfigured) return user().role === 'owner' ? `<div class="vs-alert warning"><span>Hubungkan Gemini agar judul dan caption terisi otomatis setelah foto diunggah.</span>${button('Atur Gemini', 'nav:ai-settings')}</div>` : '';
    if (!ai) return '';
    if (f.writing) return '<p class="vs-ai-note" role="status">AI sedang melihat media dan menulis judul serta caption…</p>';
    const again = button(f.written ? 'Tulis ulang dengan AI' : 'Tulis dengan AI', 'create-ai', 'vs-text-button', 'sparkles');
    if (f.aiError) return `<div class="vs-alert warning" role="alert"><span>${esc(f.aiError)}</span>${again}</div>`;
    if (f.written) return `<div class="vs-ai-note"><span>Ditulis otomatis oleh AI. Periksa dan ubah sesuai kebutuhan sebelum menyimpan.</span>${again}</div>${f.aiWarnings.length ? `<ul class="vs-help-list">${f.aiWarnings.map(w => `<li>${esc(w)}</li>`).join('')}</ul>` : ''}`;
    return `<div class="vs-ai-note"><span>AI bisa menuliskan judul dan caption dari media ini.</span>${again}</div>`;
  }
  async function submit() {
    const f = flow, format = formatFor(f.platform, f.media);
    if (!format || f.busy) return;
    f.busy = true; f.error = ''; ctx.render();
    try {
      let item = await api('/api/posts', 'POST', { format, title: f.title.trim(), caption: f.caption, mediaIds: f.media.map(m => m.id), ...(f.platform === 'youtube' && f.tags.length ? { tags: f.tags } : {}) });
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
    if (ai === null && root.querySelector('#create-post')) { ai = false; api('/api/assistant').then(d => { ai = d.status || { textConfigured: false }; ctx.render(); }).catch(() => { ai = { textConfigured: false }; }); }
    root.querySelectorAll('[data-create-platform]').forEach(el => el.addEventListener('click', () => { if (flow.platform !== el.dataset.createPlatform) { flow.platform = el.dataset.createPlatform; flow.media = []; flow.slide = 0; } ctx.render(); }));
    root.querySelector('#create-files')?.addEventListener('change', e => { if (e.target.files.length) void upload([...e.target.files]); });
    // Dropping anywhere on the page section uploads (and keeps the browser from opening the file instead).
    const section = root.querySelector('#create-post'), zone = root.querySelector('#create-drop');
    if (section && zone) {
      let depth = 0;
      const files = e => [...(e.dataTransfer?.items || [])].some(i => i.kind === 'file');
      section.addEventListener('dragenter', e => { if (!files(e)) return; e.preventDefault(); depth++; zone.classList.add('is-dragging'); });
      section.addEventListener('dragover', e => { if (!files(e)) return; e.preventDefault(); e.dataTransfer.dropEffect = flow.busy ? 'none' : 'copy'; });
      section.addEventListener('dragleave', () => { if (--depth <= 0) { depth = 0; zone.classList.remove('is-dragging'); } });
      section.addEventListener('drop', e => { if (!e.dataTransfer?.files?.length) return; e.preventDefault(); depth = 0; zone.classList.remove('is-dragging'); if (!flow.busy) dropped([...e.dataTransfer.files]); });
    }
    root.querySelector('#create-title')?.addEventListener('input', e => { flow.title = e.target.value; refreshSubmit(); refreshPreviewText(); });
    root.querySelector('#create-caption')?.addEventListener('input', e => { flow.caption = e.target.value; const c = root.querySelector('#create-caption-count'); if (c) c.textContent = String(e.target.value.length); refreshSubmit(); refreshPreviewText(); });
    root.querySelectorAll('[name="create-when"]').forEach(el => el.addEventListener('change', () => { flow.when = el.value; if (flow.when === 'scheduled' && !flow.date) flow.date = wibDate(new Date(Date.now() + DAY).toISOString()); ctx.render(); }));
    root.querySelector('#create-date')?.addEventListener('input', e => { flow.date = e.target.value; refreshSubmit(); });
    root.querySelector('#create-time')?.addEventListener('input', e => { flow.time = e.target.value; refreshSubmit(); });
    root.querySelector('#create-approved')?.addEventListener('change', e => { flow.approved = e.target.checked; refreshSubmit(); });
  }
  // Keeps only files the chosen platform accepts; YouTube takes a single MP4.
  function dropped(list) {
    const yt = flow.platform === 'youtube';
    const ok = list.filter(f => yt ? /\.mp4$/i.test(f.name) || f.type === 'video/mp4' : /\.(jpe?g|png|webp|mp4)$/i.test(f.name) || /^(image\/(jpeg|png|webp)|video\/mp4)$/.test(f.type));
    if (!ok.length) { toast(yt ? 'YouTube Shorts memerlukan video MP4.' : 'Gunakan JPG, PNG, WebP, atau MP4.', true); return; }
    if (ok.length < list.length) toast(`${list.length - ok.length} file dilewati karena formatnya tidak didukung.`);
    void upload(yt ? ok.slice(0, 1) : ok);
  }
  // Typing must not re-render (focus would jump); only the submit button state follows the inputs.
  function refreshSubmit() {
    const b = ctx.root().querySelector('[data-action="create-submit"]'); if (b) b.disabled = !canSubmit(flow);
  }
  async function action(name) {
    if (name === 'create-submit') { await submit(); return true; }
    if (name === 'create-reset') { reset(); ctx.render(); return true; }
    if (name === 'create-ai') { await write(true); return true; }
    if (name === 'create-more') { flow.more = !flow.more; refreshPreviewText(); return true; }
    if (name === 'create-slide-prev' || name === 'create-slide-next') { flow.slide = Math.max(0, Math.min(flow.media.length - 1, flow.slide + (name.endsWith('next') ? 1 : -1))); ctx.render(); return true; }
    return false;
  }
  return { homePage, createPage, problemAlerts, bind, action, resetCreate: reset };
}
