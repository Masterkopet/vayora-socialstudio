import { slugify, readingMinutes, portableTextToMarkdown } from './client/portable-text.js';

// Blog articles for Sanity. Kept apart from Instagram/YouTube content (own page, own editor) but published by the
// same scheduler tick. Stored as settings rows "blog.article.<ID>"; Sanity documents use a stable id derived from
// the article ID, so publishing the same article again replaces it instead of duplicating it.
const fail = (message, status = 400, code = '') => Object.assign(new Error(message), { status, code });
const str = (v, max) => typeof v === 'string' ? v.trim().slice(0, max) : '';
const PREFIX = 'blog.article.';
const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const BUSY = ['publishing'];

export function createBlog(store, sanity) {
  let running = false;
  const read = id => store.setting(PREFIX + id, null);
  const write = article => { store.set(PREFIX + article.id, article); return article; };
  const all = () => store.all("SELECT value FROM settings WHERE key LIKE 'blog.article.%'").map(r => JSON.parse(r.value)).sort((a, b) => a.id.localeCompare(b.id, undefined, { numeric: true }));
  const light = a => { const { body, ...rest } = a; return { ...rest, bodyLength: body.length, minutes: readingMinutes(body) }; };
  const list = () => all().map(light);
  const get = id => { const a = read(id); if (!a) throw fail('Artikel tidak ditemukan.', 404); return a; };
  const media = id => id ? store.get('SELECT * FROM media WHERE id=?', id) : null;
  const view = a => ({ ...a, hero: a.heroMediaId ? (() => { const m = media(a.heroMediaId); return m ? { id: m.id, name: m.name, url: `/media/${m.id}`, width: m.width, height: m.height } : null; })() : a.heroUrl ? { id: '', name: 'Gambar dari Sanity', url: a.heroUrl } : null, minutes: readingMinutes(a.body) });

  function nextId() { let n = 1; const taken = new Set(all().map(a => a.id)); while (taken.has('B' + String(n).padStart(2, '0'))) n++; return 'B' + String(n).padStart(2, '0'); }
  function uniqueSlug(slug, exceptId) { const other = all().find(a => a.slug === slug && a.id !== exceptId); if (other) throw fail(`Slug "${slug}" sudah dipakai artikel ${other.id}. Ubah slug agar alamatnya unik.`, 409); }

  // Fields shared by create and update; returns the cleaned values or throws a readable error.
  function clean(b, current = {}) {
    const title = str(b.title ?? current.title, 200);
    if (!title) throw fail('Judul artikel perlu diisi.');
    const slug = current.source === 'sanity' ? current.slug : str(b.slug ?? current.slug, 96).toLowerCase() || slugify(title);
    if (!SLUG.test(slug)) throw fail('Slug hanya boleh huruf kecil, angka, dan tanda hubung, contoh: cara-menghitung-okupansi-villa.');
    const body = String(b.body ?? current.body ?? '').replace(/\r\n?/g, '\n');
    if (body.length > 120000) throw fail('Isi artikel maksimal 120.000 karakter.');
    const heroMediaId = b.heroMediaId !== undefined ? (b.heroMediaId || null) : current.heroMediaId || null;
    if (heroMediaId) { const m = media(heroMediaId); if (!m || m.mime !== 'image/jpeg') throw fail('Gambar utama tidak ditemukan. Unggah ulang gambarnya.'); }
    const excerpt = str(b.excerpt ?? current.excerpt, 400);
    return {
      title, slug, body, heroMediaId, excerpt,
      seoTitle: str(b.seoTitle ?? current.seoTitle, 140), seoDescription: str(b.seoDescription ?? current.seoDescription, 300),
      category: str(b.category ?? current.category, 80), heroAlt: str(b.heroAlt ?? current.heroAlt, 400),
    };
  }
  let lastSync = 0;
  // Brings the articles already published in Sanity into the studio (once each, matched by Sanity id or slug). They
  // arrive as published articles with their body converted to Markdown, and are updated in place when sent again.
  async function sync({ force = false } = {}) {
    if (!force && Date.now() - lastSync < 60000) return { added: 0, updated: 0, total: all().length, skipped: 0, throttled: true };
    const posts = await sanity.listPosts(), have = all(), c = sanity.config(); let added = 0, updated = 0, skipped = 0;
    const ignored = new Set(store.setting('blog.ignoredSanity', []) || []);
    for (const p of posts) {
      if (ignored.has(p.id)) { skipped++; continue; }
      const existing = have.find(a => a.sanityId === p.id) || have.find(a => a.slug === p.slug && !a.sanityId && a.status !== 'published');
      const { markdown, notes } = portableTextToMarkdown(p.body);
      if (existing && existing.source !== 'sanity') { skipped++; continue; }
      if (existing) {
        // A synced article that was not edited here follows Sanity; one edited here is left alone.
        if (existing.updatedAt === existing.syncedAt && (existing.body !== markdown || existing.title !== p.title)) { write({ ...existing, title: p.title, excerpt: p.excerpt, body: markdown, seoTitle: p.seoTitle, seoDescription: p.seoDescription, category: p.category, heroAlt: p.imageAlt, imageAsset: p.imageRef ? { id: p.imageRef, mediaId: null } : null, heroUrl: sanity.imageUrl(p.imageRef), publishedAt: p.publishedAt, syncedAt: existing.updatedAt }); updated++; } else skipped++;
        continue;
      }
      const now = new Date().toISOString(), id = nextId();
      write({ id, title: p.title, slug: p.slug, excerpt: p.excerpt, body: markdown, seoTitle: p.seoTitle, seoDescription: p.seoDescription, category: p.category, heroMediaId: null, heroAlt: p.imageAlt, heroUrl: sanity.imageUrl(p.imageRef), imageAsset: p.imageRef ? { id: p.imageRef, mediaId: null } : null, status: 'published', approved: true, scheduleAt: null, date: '', time: '07:00', error: '', errorCode: '', sanityId: p.id, url: c.siteUrl + c.blogPath + p.slug, publishedAt: p.publishedAt, source: 'sanity', unsupportedBlocks: notes.skipped, revision: 1, createdAt: now, updatedAt: now, syncedAt: now, createdBy: null });
      added++;
    }
    lastSync = Date.now();
    if (added || updated) store.event(null, 'Artikel blog disinkronkan dari Sanity', `${added} baru, ${updated} diperbarui`, 'change');
    return { added, updated, skipped, total: all().length };
  }

  // Everything a published article needs; used before scheduling or publishing.
  function problems(a) {
    const list = [], c = sanity.config();
    if (!a.excerpt) list.push('Ringkasan (excerpt) belum diisi.');
    if (!a.body.trim()) list.push('Isi artikel masih kosong.');
    const hasImage = !!(a.heroMediaId || a.imageAsset?.id);
    if (c.fields.mainImage && !hasImage) list.push('Gambar utama belum dipilih.');
    if (c.fields.mainImage && hasImage && !a.heroAlt) list.push('Teks alternatif gambar utama belum diisi.');
    return list;
  }

  function create(b, user = null) {
    const c = clean(b), now = new Date().toISOString();
    uniqueSlug(c.slug, null);
    const article = write({ id: nextId(), ...c, status: 'draft', approved: false, scheduleAt: null, date: '', time: '07:00', error: '', errorCode: '', sanityId: '', url: '', publishedAt: null, revision: 1, createdAt: now, updatedAt: now, createdBy: user });
    store.event(null, 'Artikel blog dibuat', `${article.id} · ${article.title}`, 'change', user);
    return view(article);
  }

  function update(id, b, user = null) {
    const current = get(id);
    if (BUSY.includes(current.status)) throw fail('Artikel sedang diterbitkan. Tunggu sampai selesai.', 409);
    if (b.revision !== current.revision) throw fail('Artikel berubah di sesi lain. Muat ulang sebelum menyimpan.', 409);
    const intent = b.intent || (current.status === 'published' ? 'published' : 'draft');
    if (!['draft', 'review', 'scheduled', 'published'].includes(intent)) throw fail('Status penyimpanan tidak valid.');
    const c = clean(b, current); uniqueSlug(c.slug, id);
    const next = { ...current, ...c, updatedAt: new Date().toISOString(), revision: current.revision + 1, error: '', errorCode: '' };
    if (intent === 'scheduled') {
      const issues = problems(next); if (issues.length) throw fail(issues[0] + ' Lengkapi dulu sebelum menjadwalkan.');
      if (b.approved !== true) throw fail('Periksa artikel lalu berikan persetujuan sebelum menjadwalkan.');
      const at = new Date(`${str(b.date, 10)}T${str(b.time, 5)}:00+07:00`);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(str(b.date, 10)) || !/^\d{2}:\d{2}$/.test(str(b.time, 5)) || Number.isNaN(at.getTime())) throw fail('Tanggal atau jam terbit tidak valid.');
      if (at.getTime() < Date.now() + 30000) throw fail('Jadwal harus minimal 30 detik di masa mendatang.');
      Object.assign(next, { status: 'scheduled', approved: true, approvedBy: user, scheduleAt: at.toISOString(), date: str(b.date, 10), time: str(b.time, 5) });
    } else if (intent === 'published') {
      if (current.status !== 'published') throw fail('Status penyimpanan tidak valid.');
      next.status = 'published'; // edits to a published article are sent with "Update in Sanity"
    } else { Object.assign(next, { status: intent, approved: false, scheduleAt: null }); }
    write(next);
    store.event(null, intent === 'scheduled' ? 'Artikel blog dijadwalkan' : 'Artikel blog diperbarui', `${next.id} · ${next.title}`, 'change', user);
    return view(next);
  }

  function remove(id, user = null) {
    const a = get(id);
    if (BUSY.includes(a.status)) throw fail('Artikel sedang diterbitkan. Tunggu sampai selesai.', 409);
    store.run('DELETE FROM settings WHERE key=?', PREFIX + id);
    if (a.source === 'sanity' && a.sanityId) store.set('blog.ignoredSanity', [...new Set([...(store.setting('blog.ignoredSanity', []) || []), a.sanityId])].slice(-500));
    store.event(null, 'Artikel blog dihapus dari Studio', `${a.id} · ${a.title}${a.sanityId ? ' (dokumen di Sanity tetap ada)' : ''}`, 'change', user);
  }

  // Publishes now: uploads the hero image once per image, then writes the document. Safe to retry.
  async function run(id, { user = null } = {}) {
    if (running) throw fail('Ada artikel yang sedang diterbitkan. Tunggu sampai selesai.', 409);
    const a = get(id);
    if (!['scheduled', 'failed', 'draft', 'review', 'published'].includes(a.status)) throw fail('Artikel ini tidak dapat diterbitkan sekarang.', 409);
    const issues = problems(a); if (issues.length) throw fail(issues[0]);
    if (!sanity.status().configured) throw fail('Hubungkan Sanity di Pengaturan terlebih dahulu.', 422, 'NOT_CONNECTED');
    running = true;
    const before = a.status;
    write({ ...a, status: 'publishing', error: '', errorCode: '' });
    try {
      let imageAssetId = a.imageAsset?.mediaId === a.heroMediaId ? a.imageAsset.id : null, imageAsset = a.imageAsset || null;
      if (a.heroMediaId && !imageAssetId) { const row = media(a.heroMediaId); imageAssetId = await sanity.uploadImage(row); imageAsset = { id: imageAssetId, mediaId: a.heroMediaId }; }
      const publishedAt = a.scheduleAt && before === 'scheduled' ? a.scheduleAt : (a.publishedAt || new Date().toISOString());
      const result = await sanity.publish(a, { imageAssetId, publishedAt });
      const done = write({ ...read(id), status: 'published', approved: true, error: '', errorCode: '', sanityId: result.sanityId, url: result.url, publishedAt, imageAsset, sanityDraft: result.draft, categoryMissing: result.categoryMissing, revision: a.revision + 1, scheduleAt: null });
      store.event(null, result.draft ? 'Artikel dikirim ke Sanity sebagai draf' : 'Artikel terbit di Sanity', `${done.id} · ${done.title}`, 'publish', user);
      return view(done);
    } catch (error) {
      const failed = write({ ...read(id), status: 'failed', error: error.message, errorCode: error.code || 'ERROR', imageAsset: read(id).imageAsset || null, revision: a.revision + 1 });
      store.event(null, 'Artikel blog gagal terbit', `${failed.id} · ${error.message}`, 'failed', user);
      throw error;
    } finally { running = false; }
  }

  // Scheduler step: overdue schedules (more than five minutes late) fail; one due article is published.
  async function tickDue(now = Date.now()) {
    for (const a of all().filter(x => x.status === 'scheduled' && x.scheduleAt && Date.parse(x.scheduleAt) < now - 300000)) {
      write({ ...a, status: 'failed', error: 'Jadwal terlewat lebih dari lima menit. Tentukan jadwal baru.', errorCode: 'OVERDUE', revision: a.revision + 1 });
      store.event(null, 'Jadwal artikel terlewat', `${a.id} · ${a.title}`, 'failed');
    }
    const due = all().find(x => x.status === 'scheduled' && Date.parse(x.scheduleAt) <= now);
    if (due) { try { await run(due.id); } catch (e) { if (!['NOT_CONNECTED'].includes(e.code)) console.error('[blog]', e.code || 'error'); } }
  }

  // Articles stuck in "publishing" after a crash are failed so they can be retried safely (same Sanity id).
  for (const a of all().filter(x => x.status === 'publishing')) write({ ...a, status: 'failed', error: 'Penerbitan terputus. Coba lagi; artikel tidak akan terduplikasi.', errorCode: 'INTERRUPTED' });

  // Recently published articles, trimmed, used as house-style examples for AI drafts.
  const examples = () => all().filter(a => a.status === 'published').slice(-2).map(a => ({ title: a.title, excerpt: a.excerpt, body: a.body.slice(0, 1800) }));

  return { list, sync, examples, get: id => view(get(id)), create, update, remove, run, tickDue, problems: id => problems(get(id)) };
}
