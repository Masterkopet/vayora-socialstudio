// Blog page (articles published to Sanity.io) and the Sanity connection panel for Pengaturan.
import { markdownToPortableText, portableTextToHtml, slugify, readingMinutes } from './portable-text.js';

const DAY = 86400000;
const STATUS = { draft: ['Draft', ''], review: ['Perlu ditinjau', 'review'], scheduled: ['Terjadwal', 'scheduled'], publishing: ['Memproses', ''], published: ['Terbit', 'published'], failed: ['Gagal', 'failed'] };
const wibDate = ms => new Date(ms + 7 * 3600000).toISOString().slice(0, 10);
const FIELD_LABELS = { title: 'Judul', slug: 'Slug', excerpt: 'Ringkasan', body: 'Isi artikel', mainImage: 'Gambar utama', publishedAt: 'Tanggal terbit', seoTitle: 'Judul SEO', seoDescription: 'Deskripsi SEO', categories: 'Kategori', author: 'Penulis' };

export function createBlogViews(ctx) {
  const { api, esc, button, toast } = ctx;
  const workspace = () => ctx.getWorkspace(), user = () => ctx.getUser(), owner = () => user().role === 'owner';
  const icon = name => (ctx.icon ? ctx.icon(name) : '');
  let st;
  const fresh = () => ({ mode: 'list', a: null, slugTouched: false, when: 'review', date: '', time: '07:00', approved: false, busy: false, error: '', ai: { topic: '', keyword: '', notes: '', busy: false, error: '', warnings: [] }, uploading: false, checking: false, check: null });
  st = fresh();
  const sanity = () => workspace().sanity || { configured: false, fields: {}, check: null };
  const articles = () => workspace().blog || [];
  const siteUrl = () => (sanity().siteUrl || 'https://vayora.id') + (sanity().blogPath || '/blog/');
  const blank = () => ({ id: '', revision: 0, status: 'draft', title: '', slug: '', excerpt: '', seoTitle: '', seoDescription: '', category: '', body: '', heroMediaId: null, hero: null, heroAlt: '', error: '', url: '' });

  // ---------- alerts used by the home page ----------
  function problemAlerts() {
    const list = [], a = articles(), failed = a.filter(x => x.status === 'failed').length, scheduled = a.filter(x => x.status === 'scheduled').length;
    if (failed) list.push({ level: 'danger', text: `${failed} artikel blog gagal terbit. Buka Blog untuk melihat alasannya.`, action: ['Buka Blog', 'nav:blog'] });
    if (scheduled && !sanity().configured) list.push({ level: 'danger', text: 'Ada artikel blog terjadwal, tetapi Sanity belum terhubung.', action: owner() ? ['Buka Koneksi', 'nav:settings'] : null });
    return list;
  }

  // ---------- list ----------
  function listPage() {
    const a = articles(), count = s => a.filter(x => x.status === s).length, s = sanity();
    const row = x => `<div class="vs-record"><div class="vs-record-copy"><h3 data-user-content>${esc(x.title)}</h3><span class="vs-mini">${esc(x.id)} · /${esc(x.slug)} · ${x.minutes} menit baca${x.scheduleAt ? ' · ' + esc(ctx.stamp(x.scheduleAt)) : x.publishedAt ? ' · ' + esc(ctx.stamp(x.publishedAt)) : ''}</span>${x.status === 'failed' && x.error ? `<small class="vs-inline-error">${esc(x.error)}</small>` : ''}${x.status === 'published' && x.categoryMissing ? '<small class="vs-mini">Kategori tidak ditemukan di Sanity, jadi tidak dipasang.</small>' : ''}</div><span class="vs-status ${STATUS[x.status]?.[1] || ''}">${STATUS[x.status]?.[0] || x.status}</span><div class="vs-actions">${x.status === 'published' && x.url && !x.sanityDraft ? `<a class="vs-button" href="${esc(x.url)}" target="_blank" rel="noopener noreferrer">Lihat artikel</a>` : ''}${button('Buka', 'blog-open:' + x.id)}</div></div>`;
    const connect = s.configured ? '' : `<div class="vs-alert warning"><span>${owner() ? 'Sanity belum terhubung. Artikel tetap bisa ditulis dan disimpan, tetapi baru terbit setelah Sanity terhubung.' : 'Sanity belum terhubung. Minta pemilik workspace menghubungkannya agar artikel bisa terbit.'}</span>${owner() ? button('Hubungkan Sanity', 'nav:settings') : ''}</div>`;
    return `<section class="vs-panel vs-pad vs-stack"><div class="vs-row"><div><span class="vs-eyebrow">BLOG</span><h2>Tulis dan jadwalkan artikel ke vayora.id/blog.</h2></div>${button('Artikel baru', 'blog-new', 'vs-primary', 'circle-plus')}</div>${connect}<div class="vs-stats"><span><strong>${count('scheduled')}</strong> terjadwal</span><span><strong>${count('draft') + count('review')}</strong> draft / ditinjau</span><span><strong>${count('published')}</strong> terbit</span><span><strong>${count('failed')}</strong> gagal</span></div></section>
<section class="vs-panel"><div class="vs-panel-head"><h2>Artikel</h2>${owner() ? button('Impor dari file', 'nav:import', 'vs-text-button', 'upload') : ''}</div><div class="vs-list">${a.slice().reverse().map(row).join('') || '<div class="vs-empty"><h3>Belum ada artikel.</h3><p>Klik Artikel baru, atau impor artikel Markdown dari Impor konten.</p></div>'}</div></section>`;
  }

  // ---------- editor ----------
  function previewHTML() {
    const a = st.a, { blocks } = markdownToPortableText(a.body || '', { keyPrefix: 'p' });
    const minutes = readingMinutes(a.body || '');
    return `<div class="vs-preview-label">Pratinjau artikel</div><article class="vs-blog-preview">${a.hero ? `<img class="vs-blog-hero" src="${esc(a.hero.url)}" alt="${esc(a.heroAlt)}">` : '<div class="vs-blog-hero vs-blog-hero-empty">Gambar utama</div>'}<h1 data-user-content>${esc(a.title) || '<span class="vs-mini">Judul artikel tampil di sini.</span>'}</h1><p class="vs-mini">${a.category ? esc(a.category) + ' · ' : ''}${minutes} menit baca</p>${a.excerpt ? `<p class="vs-blog-lead">${esc(a.excerpt)}</p>` : ''}<div class="vs-blog-body" data-user-content>${portableTextToHtml(blocks) || '<p class="vs-mini">Isi artikel tampil di sini.</p>'}</div></article>`;
  }
  function editPage() {
    const a = st.a, s = sanity(), published = a.status === 'published', live = workspace().settings?.publishingEnabled;
    const busy = st.busy || st.ai.busy || st.uploading, tableNote = /^\s*\|.*\|\s*$/m.test(a.body) ? '<p class="vs-mini">Tabel dikirim ke Sanity sebagai daftar poin karena blog hanya mendukung teks, judul, daftar, kutipan, dan tautan.</p>' : '';
    const ai = !a.body.trim() ? `<details class="vs-blog-ai" ${st.ai.busy || st.ai.error ? 'open' : ''}><summary>${icon('sparkles')} Tulis draf dengan AI</summary><div class="vs-stack"><label class="vs-label">Topik artikel<input class="vs-input" id="blog-ai-topic" maxlength="300" value="${esc(st.ai.topic)}" placeholder="Contoh: cara menghitung okupansi villa saat libur Natal"></label><div class="vs-two"><label class="vs-label">Kata kunci utama<input class="vs-input" id="blog-ai-keyword" maxlength="120" value="${esc(st.ai.keyword)}"></label><label class="vs-label">Catatan <small>opsional</small><input class="vs-input" id="blog-ai-notes" maxlength="1200" value="${esc(st.ai.notes)}"></label></div>${st.ai.error ? `<p class="vs-inline-error" role="alert">${esc(st.ai.error)}</p>` : ''}${st.ai.busy ? '<p class="vs-ai-note" role="status">AI sedang menulis artikel… biasanya 20–60 detik.</p>' : button('Tulis draf', 'blog-ai', 'vs-primary', 'sparkles', busy ? 'disabled' : '')}</div></details>` : (st.ai.warnings.length ? `<div class="vs-alert warning"><span>Catatan dari AI: ${esc(st.ai.warnings.join(' · '))}</span></div>` : '');
    const when = published ? `<p class="vs-sub">Artikel sudah terbit. Perubahan baru dikirim ke Sanity saat kamu menekan <b>Perbarui di Sanity</b>.</p>` : `<div class="vs-stack"><label class="vs-check"><input type="radio" name="blog-when" value="review" ${st.when === 'review' ? 'checked' : ''}><span><b>Ajukan untuk ditinjau</b> · pemilik memeriksa dulu</span></label><label class="vs-check"><input type="radio" name="blog-when" value="scheduled" ${st.when === 'scheduled' ? 'checked' : ''}><span><b>Jadwalkan</b> · terbit otomatis ke Sanity pada waktu yang dipilih</span></label><label class="vs-check"><input type="radio" name="blog-when" value="draft" ${st.when === 'draft' ? 'checked' : ''}><span><b>Simpan sebagai draft</b></span></label>${st.when === 'scheduled' ? `<div class="vs-two"><label class="vs-label">Tanggal<input class="vs-input" type="date" id="blog-date" value="${esc(st.date)}"></label><label class="vs-label">Jam (WIB)<input class="vs-input" type="time" id="blog-time" value="${esc(st.time)}"></label></div>` : ''}</div>`;
    const approve = (st.when === 'scheduled' || published || a.status !== 'published') && (st.when === 'scheduled' || published) ? `<label class="vs-check"><input type="checkbox" id="blog-approved" ${st.approved ? 'checked' : ''}><span>Saya sudah memeriksa judul, isi, dan gambar, dan artikel ini boleh terbit.</span></label>` : '';
    const label = published ? 'Simpan perubahan' : st.when === 'scheduled' ? 'Simpan & jadwalkan' : st.when === 'draft' ? 'Simpan draft' : 'Simpan & ajukan';
    const canPublish = s.configured && live && st.approved;
    return `<section class="vs-panel vs-pad vs-stack" id="blog-editor"><div class="vs-row"><div><span class="vs-eyebrow">${a.id ? esc(a.id) : 'ARTIKEL BARU'}</span><h2>${a.id ? 'Edit artikel' : 'Tulis artikel baru'}</h2></div><span class="vs-status ${STATUS[a.status]?.[1] || ''}">${STATUS[a.status]?.[0] || ''}</span></div>${a.status === 'failed' && a.error ? `<div class="vs-alert danger" role="alert"><span>${esc(a.error)}</span></div>` : ''}
<div class="smart-layout vs-create-layout"><div class="vs-stack vs-create-form">${ai}
<fieldset class="vs-create-group"><legend><span class="vs-step-number">1</span>Judul dan alamat</legend><label class="vs-label">Judul<input class="vs-input" id="blog-title" maxlength="200" value="${esc(a.title)}"></label><label class="vs-label">Slug <small>alamat artikel</small><input class="vs-input" id="blog-slug" maxlength="96" value="${esc(a.slug)}"><small id="blog-url">${esc(siteUrl())}${esc(a.slug || '…')}</small></label><label class="vs-label">Ringkasan <small><span id="blog-excerpt-count">${a.excerpt.length}</span> karakter · ideal 130–160</small><textarea class="vs-input" id="blog-excerpt" maxlength="400" style="min-height:80px">${esc(a.excerpt)}</textarea></label><div class="vs-two"><label class="vs-label">Kategori<input class="vs-input" id="blog-category" maxlength="80" value="${esc(a.category)}"><small>Dipasang bila ada kategori dengan judul yang sama di Sanity.</small></label><label class="vs-label">Judul SEO <small>opsional</small><input class="vs-input" id="blog-seo-title" maxlength="140" value="${esc(a.seoTitle)}"></label></div></fieldset>
<fieldset class="vs-create-group"><legend><span class="vs-step-number">2</span>Gambar utama</legend><label class="vs-dropzone" id="blog-drop">${icon('upload')}<b>${a.hero ? 'Ganti gambar: tarik & lepas di sini' : 'Tarik & lepas gambar di sini'}</b><span>atau klik untuk memilih · JPG, PNG, atau WebP, ideal 16:9</span><input class="sr-only" type="file" id="blog-hero" accept="image/jpeg,image/png,image/webp" aria-label="Pilih gambar utama"></label>${st.uploading ? '<p class="vs-mini" role="status">Mengunggah…</p>' : ''}${a.hero ? `<p class="vs-mini">${esc(a.hero.name)}${a.hero.width ? ` · ${a.hero.width}×${a.hero.height}` : ''}</p>` : ''}<label class="vs-label">Teks alternatif gambar<input class="vs-input" id="blog-alt" maxlength="400" value="${esc(a.heroAlt)}"></label></fieldset>
<fieldset class="vs-create-group"><legend><span class="vs-step-number">3</span>Isi artikel</legend><label class="vs-label">Markdown <small><span id="blog-words">${(a.body.match(/\S+/g) || []).length}</span> kata · <span id="blog-minutes">${readingMinutes(a.body)}</span> menit baca</small><textarea class="vs-input vs-blog-textarea" id="blog-body" ${st.ai.busy ? 'disabled' : ''} spellcheck="true">${esc(a.body)}</textarea></label><p class="vs-mini">Gunakan ### untuk judul bagian, **tebal**, *miring*, [tautan](https://…), daftar, dan &gt; kutipan.</p>${tableNote}<details><summary>Deskripsi SEO</summary><label class="vs-label">Meta description <small>kosong = memakai ringkasan</small><textarea class="vs-input" id="blog-seo-desc" maxlength="300" style="min-height:70px">${esc(a.seoDescription)}</textarea></label></details></fieldset>
<fieldset class="vs-create-group"><legend><span class="vs-step-number">4</span>Kapan terbit?</legend>${when}${approve}</fieldset>
${st.error ? `<p class="vs-inline-error" role="alert">${esc(st.error)}</p>` : ''}<div class="vs-actions">${button(st.busy ? 'Menyimpan…' : label, 'blog-save', 'vs-primary', 'save', !a.title.trim() || busy || (st.when === 'scheduled' && !published && !st.approved) ? 'disabled' : '')}${(published || a.id) && (s.configured && live) ? button(published ? 'Perbarui di Sanity' : 'Terbitkan sekarang', 'blog-publish', '', 'send', !canPublish || busy ? 'disabled' : '') : ''}${button('Kembali ke daftar', 'blog-back', 'vs-text-button')}${a.id ? button('Hapus', 'blog-delete', 'vs-text-button vs-danger') : ''}</div>${a.id && !(s.configured && live) ? `<p class="vs-mini">${s.configured ? 'Aktifkan publikasi nyata di Koneksi & publikasi agar artikel bisa dikirim ke Sanity.' : 'Hubungkan Sanity agar artikel bisa dikirim.'}</p>` : ''}${published && a.url ? `<p class="vs-mini">${a.sanityDraft ? 'Terkirim ke Sanity sebagai draf (belum tayang). ' : ''}Alamat: <a href="${esc(a.url)}" target="_blank" rel="noopener noreferrer">${esc(a.url)}</a></p>` : ''}</div>
<div id="blog-preview" class="smart-design-result vs-create-preview vs-blog-preview-box" aria-label="Pratinjau">${previewHTML()}</div></div></section>`;
  }

  function page() { return st.mode === 'edit' ? editPage() : listPage(); }

  // ---------- Pengaturan: Sanity connection ----------
  function settingsPanel() {
    const s = sanity();
    if (!owner()) return '';
    const c = s.check, f = s.fields || {};
    const checkHTML = !c ? '' : c.ok ? `<div class="vs-stack"><p class="vs-mini"><b>Terhubung.</b> ${c.count} dokumen "${esc(s.docType)}" di dataset ${esc(s.dataset)} · dicek ${esc(ctx.stamp(c.checkedAt))}</p>${c.fields.length ? `<div><span class="vs-mini">Field pada artikel yang ada:</span><div class="smart-chips">${c.fields.map(x => `<span>${esc(x.name)} · ${esc(x.type)}</span>`).join('')}</div></div>` : '<p class="vs-mini">Belum ada artikel di dataset ini untuk dicontoh.</p>'}${c.missing?.length ? `<p class="vs-inline-error">Field berikut dipetakan tetapi tidak ada pada artikel contoh: ${esc(c.missing.join(', '))}. Kosongkan petanya bila tidak dipakai.</p>` : ''}</div>` : `<p class="vs-inline-error" role="alert">${esc(c.error || 'Koneksi gagal.')}</p>`;
    const authors = c?.ok && c.authors?.length ? `<label class="vs-label">Penulis<select class="vs-input" id="sanity-author"><option value="">Tanpa penulis</option>${c.authors.map(x => `<option value="${esc(x.id)}" ${s.authorId === x.id ? 'selected' : ''}>${esc(x.name || x.id)}</option>`).join('')}</select><small>Artikel baru dipasangi penulis ini.</small></label>` : `<label class="vs-label">ID penulis <small>opsional</small><input class="vs-input" id="sanity-author" value="${esc(s.authorId || '')}" maxlength="80"><small>Jalankan Cek koneksi untuk memilih dari daftar.</small></label>`;
    return `<section class="vs-panel vs-pad vs-stack" id="sanity-panel"><div class="vs-setting"><div><h2>Blog · Sanity.io</h2><p class="vs-sub">${s.configured ? `Project ${esc(s.projectId)} · dataset ${esc(s.dataset)}` : 'Hubungkan Sanity agar artikel bisa terbit ke vayora.id/blog.'}</p></div><span class="vs-status ${s.configured ? (c?.ok === false ? 'failed' : 'scheduled') : 'review'}">${s.configured ? (c?.ok === false ? 'Perlu diperiksa' : 'Terhubung') : 'Belum terhubung'}</span></div>
${checkHTML}<form class="vs-stack" id="sanity-form"><div class="vs-two"><label class="vs-label">Project ID<input class="vs-input" id="sanity-project" value="${esc(s.projectId || '5ugtuy3w')}" autocomplete="off" spellcheck="false" maxlength="30"></label><label class="vs-label">Dataset<input class="vs-input" id="sanity-dataset" value="${esc(s.dataset || 'production')}" autocomplete="off" maxlength="64"></label></div><label class="vs-label">Token API<input class="vs-input" id="sanity-token" type="password" autocomplete="new-password" placeholder="${s.tokenSet ? 'Kosongkan untuk mempertahankan token tersimpan' : 'sk…'}" maxlength="300"><small>Buat di sanity.io/manage → project → API → Tokens dengan peran <b>Editor</b>. Disimpan terenkripsi dan tidak ditampilkan lagi. Jangan kirim lewat chat.</small></label><div class="vs-two"><label class="vs-label">Mode terbit<select class="vs-input" id="sanity-mode"><option value="published" ${s.publishMode !== 'draft' ? 'selected' : ''}>Langsung tayang</option><option value="draft" ${s.publishMode === 'draft' ? 'selected' : ''}>Kirim sebagai draf Sanity (ditinjau dulu di Studio)</option></select></label>${authors}</div>
<details><summary>Pemetaan field & lanjutan</summary><div class="vs-stack"><div class="vs-two"><label class="vs-label">Tipe dokumen<input class="vs-input" id="sanity-doctype" value="${esc(s.docType)}" maxlength="64"></label><label class="vs-label">Tipe kategori<input class="vs-input" id="sanity-cattype" value="${esc(s.categoryType)}" maxlength="64"><small>Kosongkan bila artikel tidak memakai kategori.</small></label></div><div class="vs-two"><label class="vs-label">Alamat situs<input class="vs-input" id="sanity-site" value="${esc(s.siteUrl)}" maxlength="200"></label><label class="vs-label">Jalur blog<input class="vs-input" id="sanity-path" value="${esc(s.blogPath)}" maxlength="80"></label></div><p class="vs-mini">Nama field di Sanity untuk tiap bagian artikel. Kosongkan untuk tidak mengirim bagian itu.</p><div class="vs-pkg-map">${Object.keys(FIELD_LABELS).map(k => `<label class="vs-label">${FIELD_LABELS[k]}<input class="vs-input" data-sanity-field="${k}" value="${esc(f[k] ?? '')}" maxlength="64"></label>`).join('')}</div><label class="vs-label">Field tambahan <small>JSON, opsional</small><textarea class="vs-input" id="sanity-extra" style="min-height:70px" spellcheck="false">${esc(Object.keys(s.extraFields || {}).length ? JSON.stringify(s.extraFields, null, 2) : '')}</textarea><small>Dikirim apa adanya pada setiap artikel, mis. {"featured": false}.</small></label></div></details>
<div class="vs-actions"><button class="vs-button vs-primary" type="submit">Simpan koneksi Sanity</button>${s.configured ? button(st.checking ? 'Memeriksa…' : 'Cek koneksi', 'blog-check', '', 'refresh-cw', st.checking ? 'disabled' : '') : ''}${s.tokenSet && !s.environmentToken ? button('Hapus token', 'blog-remove-token', 'vs-danger') : ''}</div></form></section>`;
  }

  // ---------- behaviour ----------
  const preview = () => { const el = ctx.root().querySelector('#blog-preview'); if (el) el.innerHTML = previewHTML(); };
  function refreshSave() {
    const b = ctx.root().querySelector('[data-action="blog-save"]'); if (!b) return;
    b.disabled = !st.a.title.trim() || st.busy || st.uploading || (st.when === 'scheduled' && st.a.status !== 'published' && !st.approved);
    const p = ctx.root().querySelector('[data-action="blog-publish"]'); if (p) p.disabled = !(sanity().configured && workspace().settings?.publishingEnabled && st.approved) || st.busy;
  }
  async function upload(file) {
    if (!file || st.uploading) return;
    st.uploading = true; ctx.render();
    try { const form = new FormData(); form.append('files', file); const m = (await api('/api/media', 'POST', form)).media?.[0]; if (m) { st.a.heroMediaId = m.id; st.a.hero = { id: m.id, name: m.name, url: m.url, width: m.width, height: m.height }; } }
    catch (error) { toast(error.message, true); }
    finally { st.uploading = false; ctx.render(); }
  }
  function bind() {
    const root = ctx.root(), $ = s => root.querySelector(s), a = st.a;
    const form = $('#sanity-form');
    if (form) form.addEventListener('submit', e => { e.preventDefault(); void ctx.run(saveSanity); });
    if (st.mode !== 'edit' || !a || !$('#blog-editor')) return;
    const on = (sel, ev, fn) => root.querySelectorAll(sel).forEach(el => el.addEventListener(ev, e => fn(el, e)));
    on('#blog-title', 'input', el => { a.title = el.value; if (!st.slugTouched && !a.id) { a.slug = slugify(a.title); $('#blog-slug').value = a.slug; const u = $('#blog-url'); if (u) u.textContent = siteUrl() + (a.slug || '…'); } refreshSave(); preview(); });
    on('#blog-slug', 'input', el => { st.slugTouched = true; a.slug = el.value; const u = $('#blog-url'); if (u) u.textContent = siteUrl() + (a.slug || '…'); });
    on('#blog-excerpt', 'input', el => { a.excerpt = el.value; const c = $('#blog-excerpt-count'); if (c) c.textContent = String(el.value.length); preview(); });
    on('#blog-category', 'input', el => { a.category = el.value; preview(); });
    on('#blog-seo-title', 'input', el => { a.seoTitle = el.value; });
    on('#blog-seo-desc', 'input', el => { a.seoDescription = el.value; });
    on('#blog-alt', 'input', el => { a.heroAlt = el.value; });
    on('#blog-body', 'input', el => { a.body = el.value; const w = $('#blog-words'), m = $('#blog-minutes'); if (w) w.textContent = String((el.value.match(/\S+/g) || []).length); if (m) m.textContent = String(readingMinutes(el.value)); clearTimeout(st.timer); st.timer = setTimeout(preview, 250); });
    on('#blog-ai-topic', 'input', el => { st.ai.topic = el.value; }); on('#blog-ai-keyword', 'input', el => { st.ai.keyword = el.value; }); on('#blog-ai-notes', 'input', el => { st.ai.notes = el.value; });
    on('[name="blog-when"]', 'change', el => { st.when = el.value; if (st.when === 'scheduled' && !st.date) st.date = wibDate(Date.now() + DAY); st.approved = false; ctx.render(); });
    on('#blog-date', 'input', el => { st.date = el.value; }); on('#blog-time', 'input', el => { st.time = el.value; });
    on('#blog-approved', 'change', el => { st.approved = el.checked; refreshSave(); });
    on('#blog-hero', 'change', el => { if (el.files[0]) void upload(el.files[0]); });
    const zone = $('#blog-drop'), editor = $('#blog-editor');
    if (zone && editor) {
      let depth = 0; const has = e => [...(e.dataTransfer?.items || [])].some(i => i.kind === 'file');
      editor.addEventListener('dragenter', e => { if (!has(e)) return; e.preventDefault(); depth++; zone.classList.add('is-dragging'); });
      editor.addEventListener('dragover', e => { if (has(e)) e.preventDefault(); });
      editor.addEventListener('dragleave', () => { if (--depth <= 0) { depth = 0; zone.classList.remove('is-dragging'); } });
      editor.addEventListener('drop', e => { if (!has(e)) return; e.preventDefault(); depth = 0; zone.classList.remove('is-dragging'); const f = [...e.dataTransfer.files].find(x => /^image\/(jpeg|png|webp)$/.test(x.type)); if (f) void upload(f); else toast('Gunakan gambar JPG, PNG, atau WebP.', true); });
    }
  }

  async function saveSanity() {
    const root = ctx.root(), v = s => root.querySelector(s)?.value ?? '';
    const fields = Object.fromEntries([...root.querySelectorAll('[data-sanity-field]')].map(el => [el.dataset.sanityField, el.value.trim()]));
    const body = { projectId: v('#sanity-project'), dataset: v('#sanity-dataset'), publishMode: v('#sanity-mode'), docType: v('#sanity-doctype'), categoryType: v('#sanity-cattype'), siteUrl: v('#sanity-site'), blogPath: v('#sanity-path'), authorId: v('#sanity-author'), fields, extraFields: v('#sanity-extra') };
    if (v('#sanity-token').trim()) body.token = v('#sanity-token').trim();
    await api('/api/sanity/config', 'POST', body); await ctx.reload(); ctx.render();
    toast('Koneksi Sanity disimpan. Tekan Cek koneksi untuk memastikan.');
  }

  async function open(id) {
    const a = await api('/api/blog/' + encodeURIComponent(id));
    st = { ...fresh(), mode: 'edit', a: { ...blank(), ...a }, slugTouched: true, when: a.status === 'scheduled' ? 'scheduled' : a.status === 'draft' || a.status === 'failed' ? 'draft' : 'review', date: a.date || '', time: a.time || '07:00' };
    ctx.render();
  }
  const payload = a => ({ title: a.title.trim(), slug: a.slug.trim(), excerpt: a.excerpt, seoTitle: a.seoTitle, seoDescription: a.seoDescription, category: a.category, body: a.body, heroMediaId: a.heroMediaId, heroAlt: a.heroAlt });

  // Saves the article (creating it first when new). `intent` is draft | review | scheduled | published.
  async function save(intent) {
    const a = st.a; let item = a;
    // A new article is created first as a draft. Remember its ID right away so that a failed second step (for example
    // a missing alt text) retries on the same article instead of creating a duplicate.
    if (!a.id) { item = await api('/api/blog', 'POST', payload(a)); a.id = item.id; a.revision = item.revision; a.status = item.status; }
    item = await api('/api/blog/' + encodeURIComponent(item.id), 'PUT', { ...payload(a), revision: item.revision, intent, approved: intent === 'scheduled' ? st.approved : false, date: st.date, time: st.time });
    st.a = { ...blank(), ...item }; st.slugTouched = true;
    return item;
  }
  async function action(name, id) {
    if (name === 'blog-new') { st = { ...fresh(), mode: 'edit', a: blank() }; ctx.render(); return true; }
    if (name === 'blog-open') { await open(id); return true; }
    if (name === 'blog-back') { st = fresh(); await ctx.reload(); ctx.render(); return true; }
    if (name === 'blog-save') {
      st.busy = true; st.error = ''; ctx.render();
      try { const intent = st.a.status === 'published' ? 'published' : st.when; const item = await save(intent); await ctx.reload(); toast(intent === 'scheduled' ? `Artikel dijadwalkan: ${ctx.stamp(item.scheduleAt)}.` : 'Artikel tersimpan.'); st.busy = false; if (st.when !== 'draft' || st.a.status === 'published') { st = fresh(); } ctx.render(); }
      catch (error) { st.busy = false; st.error = error.message; ctx.render(); }
      return true;
    }
    if (name === 'blog-publish') {
      st.busy = true; st.error = ''; ctx.render();
      try { await save(st.a.status === 'published' ? 'published' : 'draft'); const done = await api('/api/blog/' + encodeURIComponent(st.a.id) + '/publish', 'POST', { approved: st.approved }); st.a = { ...blank(), ...done }; await ctx.reload(); toast(done.sanityDraft ? 'Artikel terkirim ke Sanity sebagai draf.' : 'Artikel terbit di Sanity.'); st.busy = false; st.approved = false; ctx.render(); }
      catch (error) { st.busy = false; st.error = error.message; try { const cur = await api('/api/blog/' + encodeURIComponent(st.a.id)); st.a = { ...blank(), ...cur }; await ctx.reload(); } catch { /* keep the editor as is */ } ctx.render(); }
      return true;
    }
    if (name === 'blog-delete') {
      if (!window.confirm(`Hapus artikel "${st.a.title}" dari Studio?${st.a.sanityId ? ' Dokumen di Sanity tetap ada.' : ''}`)) return true;
      await api('/api/blog/' + encodeURIComponent(st.a.id), 'DELETE'); st = fresh(); await ctx.reload(); ctx.render(); toast('Artikel dihapus dari Studio.'); return true;
    }
    if (name === 'blog-ai') {
      const a = st.a; if (st.ai.topic.trim().length < 8) { st.ai.error = 'Tulis topik artikel, minimal 8 karakter.'; ctx.render(); return true; }
      st.ai.busy = true; st.ai.error = ''; ctx.render();
      try {
        const d = await api('/api/blog/draft', 'POST', { topic: st.ai.topic, keyword: st.ai.keyword, notes: st.ai.notes });
        Object.assign(a, { title: a.title || d.title, slug: a.slug || d.slug, excerpt: a.excerpt || d.excerpt, seoTitle: a.seoTitle || d.seoTitle, category: a.category || d.category, heroAlt: a.heroAlt || d.heroAlt, body: d.body });
        st.ai.warnings = d.warnings || []; st.slugTouched = !!a.slug;
      } catch (error) { st.ai.error = error.message; }
      st.ai.busy = false; ctx.render(); return true;
    }
    if (name === 'blog-check') { st.checking = true; ctx.render(); try { await api('/api/sanity/check', 'POST', {}); toast('Sanity terhubung.'); } catch (error) { toast(error.message, true); } st.checking = false; await ctx.reload(); ctx.render(); return true; }
    if (name === 'blog-remove-token') { await api('/api/sanity/config', 'POST', { removeToken: true }); await ctx.reload(); ctx.render(); toast('Token Sanity dihapus.'); return true; }
    return false;
  }
  return { page, bind, action, settingsPanel, problemAlerts, reset: () => { st = fresh(); } };
}
