// "Import content": one page for every bulk import. Choose a folder or files; videos, photos and text (JSON/CSV
// packages, per-episode .txt, Markdown caption lists) are read together, paired, previewed with an automatic
// schedule, then uploaded and saved/scheduled row by row.
import { expandZip } from './zip.js';
import { docxToMarkdown } from './docx.js';
import { createDrivePicker } from './drive.js';
import { readSources, matchFiles, mediaOnlyRows, checkRow, planSchedule, mediaInfo, titleFromFile, MEDIA_FILE, TEXT_FILE } from './package-parse.js';

const WEEKDAYS = [[1, 'Mon'], [2, 'Tue'], [3, 'Wed'], [4, 'Thu'], [5, 'Fri'], [6, 'Sat'], [0, 'Sun']];
const tomorrow = () => new Date(Date.now() + 7 * 3600000 + 86400000).toISOString().slice(0, 10);
// Detects a caption that says the image is AI-made (Indonesian and English wording).
const AI_NOTE = /ilustrasi AI|dibuat (dengan )?AI|buatan AI|AI[- ]generated|AI[- ]made|(made|created) (with|by) AI|AI illustration/i;
const PREFIX = { Short: 'S', Reel: 'V', Gambar: 'I', Carousel: 'C' };
const pathOf = f => f.webkitRelativePath || f.name;

export function createPackageImport(ctx) {
  const { api, esc, button, toast } = ctx;
  let st, ai = null; // ai: AI status from /api/assistant (null = not loaded yet)
  const drive = createDrivePicker({ api, esc, button, toast, render: () => ctx.render(), addFiles: files => addFiles(files) });
  const imported = new Map(); // Drive file → media already fetched during this run (one file used for Instagram and YouTube is fetched once)
  const reset = () => { st = { texts: [], media: [], sources: [], rows: [], edits: {}, mode: 'scheduled', start: tomorrow(), days: [1, 3, 5], times: '19:00', useFileDates: true, synthetic: false, approved: false, running: false, done: false, reading: false, aiFill: true, genHero: true }; };
  reset();

  // ---------- derived state ----------
  // The type of every item is detected from the files: articles (.docx/Markdown with article fields) are Blog, codes say
  // Instagram (V/I/C) or YouTube (S). A video with no such hint can go to Instagram, YouTube Shorts or both (the row's
  // destinations); photos can only go to Instagram.
  const platformOf = r => r.target;
  const isVid = f => /^video\//.test(f.type || '') || /\.(mp4|mov|m4v|webm)$/i.test(f.name);
  const edit = r => st.edits[r.key] || (st.edits[r.key] = { include: true });
  const shared = r => st.edits['@' + r.base] || (st.edits['@' + r.base] = {});
  // Where a video or photo without a platform hint can go, and what is ticked at first.
  const NAMES = { instagram: 'Instagram', youtube: 'YouTube Short', facebook: 'Facebook', tiktok: 'TikTok', blog: 'Blog' };
  const VIDEO_TARGETS = ['instagram', 'youtube', 'facebook', 'tiktok'], PHOTO_TARGETS = ['instagram', 'facebook', 'tiktok'];
  const defaultsFor = video => video ? ['instagram', 'youtube'] : ['instagram'];
  const loose = f => ({ key: 'file:' + pathOf(f), number: null, id: '', platform: '', title: titleFromFile(f.name), caption: '', tags: [], files: [f.name], date: '', time: '', loose: true });
  function rebuild() {
    const { rows, sources } = readSources(st.texts);
    st.sources = sources;
    const pf = row => row.platform || 'instagram';
    const matched = matchFiles(rows, st.media, pf), used = new Set(matched.flatMap(m => [...m.files, ...m.choices, m.cover].filter(Boolean)));
    const extra = mediaOnlyRows(rows, st.media.filter(f => !used.has(f)));
    const all = [...matched, ...matchFiles(extra, st.media.filter(f => !used.has(f)), pf)];
    // Videos and photos that no text and no content code claims still become items of their own (title from the file name).
    const claimed = new Set(all.flatMap(m => [...m.files, ...m.choices, m.cover].filter(Boolean)));
    for (const f of st.media) if (!claimed.has(f) && !/^cover/i.test(f.name.split('/').pop())) { const [m] = matchFiles([{ ...loose(f) }], [f], pf); all.push(m); }
    st.rows = all.flatMap(m => {
      const base = m.row.id || (m.row.number != null ? 'n' + m.row.number : m.row.key), sh = st.edits['@' + base] || {};
      const video = m.files.some(isVid) || m.choices.length > 0, choosable = !m.row.platform && (video || m.files.length > 0);
      const options = video ? VIDEO_TARGETS : PHOTO_TARGETS, targets = choosable ? (sh.targets || defaultsFor(video)) : [pf(m.row)];
      const row = { ...m.row, title: sh.title ?? (m.row.title || titleFromFile(m.files[0]?.name || '')), fromFile: !m.row.title && sh.title == null };
      const make = (target, idle) => { const key = base + ':' + (idle ? 'none' : target); return { key, base, target, idle, choosable, options, chosen: targets, row: { ...row, tags: [...row.tags] }, files: sh.picked ? [sh.picked] : m.files, cover: m.cover, choices: m.choices, result: st.rows.find(r => r.key === key)?.result || null }; };
      return targets.length ? targets.map(t => make(t, false)) : [make('instagram', true)];
    });
    st.synthetic = st.synthetic || st.rows.some(r => AI_NOTE.test(r.row.caption));
  }
  const existingIds = () => (ctx.getWorkspace().posts || []).map(p => p.id);
  // A blog article without an image but with an image prompt can get its main image generated (Gemini).
  const willGen = r => platformOf(r) === 'blog' && !r.files.length && !!r.row.blog?.heroPrompt && st.genHero && !!ai?.heroConfigured;
  const aiFill = () => st.aiFill && !!ai?.textConfigured && st.mode !== 'draft';
  const needsAI = r => !r.row.caption && aiFill();
  const checked = r => { const c = checkRow({ row: r.row, files: r.files, platform: platformOf(r), mode: needsAI(r) ? 'draft' : st.mode, existingIds: existingIds(), willGenerate: willGen(r) }); if (r.idle) { c.errors.unshift('Choose Instagram or YouTube Short for this video.'); c.format = ''; } if (needsAI(r)) c.warnings.unshift('Title & caption are written by AI, then submitted for review.'); return c; };
  const active = r => edit(r).include && !r.result?.ok && !checked(r).errors.length;
  const ready = () => st.rows.filter(active);
  function plan() {
    if (st.mode === 'draft') return () => null;
    const taken = (ctx.getWorkspace().posts || []).filter(p => p.status === 'scheduled' && p.scheduleAt).map(p => p.scheduleAt);
    const future = s => s && Date.parse(`${s.date}T${s.time}:00+07:00`) > Date.now() + 120000 ? s : null;
    const list = ready(), fixed = list.map(r => future(edit(r).override) || (st.useFileDates && r.row.date && r.row.time ? future({ date: r.row.date, time: r.row.time }) : null));
    const slots = planSchedule(list.length, { start: st.start, days: st.days, times: st.times.split(/[,\s]+/), taken, fixed });
    const map = new Map(list.map((r, i) => [r, slots[i]]));
    return r => map.get(r) || null;
  }

  // ---------- page ----------
  function page() {
    const slotOf = plan(), rows = st.rows, count = ready().length;
    const step = (n, title, body) => `<section class="vs-panel vs-pad vs-stack vs-step"><div class="vs-step-head"><span class="vs-step-number">${n}</span><h2>${title}</h2></div>${body}</section>`;
    const usedSources = st.sources.filter(s => s.added), otherSources = st.sources.filter(s => s.rows && !s.added).length;
    const summary = st.media.length || st.texts.length ? `<p class="vs-mini">${st.media.length} videos/photos ·${usedSources.length ? 'text from ' + usedSources.map(s => `<b>${esc(s.name)}</b>`).join(', ') : 'no title/description text file yet'}${otherSources ? ` · ${otherSources} other text files only fill in what is empty` : ''} · ${rows.length} posts found.</p>` : '';
    const s1 = step(1, 'Choose a folder or files', `<p class="vs-sub">Choose one folder (subfolders included) or several files at once. Recognized:</p>
<ul class="vs-help-list"><li><b>Videos & photos</b>: MP4, JPG, PNG, WebP. Matched by the file name in the package, content code (V01-…, C01-slide-1…), the number in the file name, or the episode folder (01 - Title/Video/…).</li><li><b>Text</b>: JSON/CSV packages (title, description, tags, file, date, time), one .txt per episode (TITLE, FULL DESCRIPTION, TAGS; the Indonesian headings JUDUL and DESKRIPSI LENGKAP also work), or a Markdown caption list (## V01 … Caption:).</li><li>Project folders such as node_modules are ignored.</li></ul>
<div class="vs-dropzone" id="pkg-drop">${ctx.icon ? ctx.icon('upload') : ''}<b>${st.media.length || st.texts.length ? 'Add more: drag & drop a folder or files here' : 'Drag & drop a folder or files here'}</b><span>or choose from your computer:</span><div class="vs-actions"><label class="vs-button">Choose folder<input class="sr-only" type="file" id="pkg-folder" webkitdirectory multiple></label><label class="vs-button">Choose files<input class="sr-only" type="file" id="pkg-files" multiple accept=".zip,.json,.csv,.txt,.md,.docx,video/mp4,video/quicktime,image/jpeg,image/png,image/webp"></label>${button('Google Drive', 'pkg-drive-open', '', 'cloud')}</div></div>${drive.panel()}
<p class="vs-mini">The type of each item is detected from the files: articles go to the Blog, codes S01 / F01 / T01 / V01 / I01 / C01 say YouTube, Facebook, TikTok or Instagram. Every video can go to Instagram, YouTube Shorts, Facebook and TikTok, and photos to Instagram, Facebook and TikTok: tick the destinations in each row.</p>
${st.reading ? '<p class="vs-mini" role="status">Reading files…</p>' : summary}`);
    if (!rows.length) return `<div class="vs-stack" id="pkg-page">${s1}${st.media.length || st.texts.length ? '<p class="vs-empty">No content can be made from these files yet. Add videos/photos and their title/description text.</p>' : ''}</div>`;
    const dayBoxes = WEEKDAYS.map(([d, label]) => `<label class="vs-check vs-day"><input type="checkbox" data-pkg-day="${d}" ${st.days.includes(d) ? 'checked' : ''}><span>${label}</span></label>`).join('');
    const s2 = step(2, 'Set the schedule', `<div class="vs-stack"><label class="vs-check"><input type="radio" name="pkg-mode" value="scheduled" ${st.mode === 'scheduled' ? 'checked' : ''}><span><b>Schedule automatically</b> · goes live on the dates in the table</span></label><label class="vs-check"><input type="radio" name="pkg-mode" value="review" ${st.mode === 'review' ? 'checked' : ''}><span><b>Submit for review</b> · dates are saved, scheduled after review</span></label><label class="vs-check"><input type="radio" name="pkg-mode" value="draft" ${st.mode === 'draft' ? 'checked' : ''}><span><b>Save as draft</b> · caption may be empty, fill it in later</span></label></div>
${st.mode === 'draft' ? '' : `<div class="vs-two"><label class="vs-label">Start date<input class="vs-input" type="date" id="pkg-start" value="${esc(st.start)}"></label><label class="vs-label">Publish time (WIB)<input class="vs-input" id="pkg-times" value="${esc(st.times)}" placeholder="19:00, 09:00"><small>Separate with commas for more than one time per day.</small></label></div>
<div><span class="vs-label">Publish days</span><div class="vs-day-row">${dayBoxes}</div></div>
${rows.some(r => r.row.date) ? `<label class="vs-check"><input type="checkbox" id="pkg-file-dates" ${st.useFileDates ? 'checked' : ''}><span>Use the date and time from the file when present</span></label>` : ''}`}
${rows.some(r => !r.row.caption) && st.mode !== 'draft' ? (ai?.textConfigured ? `<label class="vs-check"><input type="checkbox" id="pkg-ai-fill" ${st.aiFill ? 'checked' : ''}><span><b>Write empty captions with AI</b> · Gemini watches the video or looks at the photo. These items are submitted for review (not scheduled right away) so someone reads them first.</span></label>` : `<p class="vs-mini">${rows.filter(r => !r.row.caption).length} posts have no caption yet. Connect Gemini in AI settings so empty captions can be written automatically.</p>`) : ''}
${rows.some(r => platformOf(r) === 'blog' && !r.files.length && r.row.blog?.heroPrompt) ? (ai?.heroConfigured ? `<label class="vs-check"><input type="checkbox" id="pkg-gen-hero" ${st.genHero ? 'checked' : ''}><span><b>Generate missing main images with AI</b> · one request per article to the image provider chosen in AI settings, from the image prompt in the file. Articles with a generated image are submitted for review instead of being scheduled.</span></label>` : '<p class="vs-mini">Some articles have an image prompt but no image. Connect an image provider in AI settings to generate them, or drop the image files next to the articles.</p>') : ''}
${rows.some(r => ['youtube', 'tiktok'].includes(platformOf(r))) ? `<label class="vs-check"><input type="checkbox" id="pkg-synthetic" ${st.synthetic ? 'checked' : ''}><span>Videos contain realistic AI-generated visuals. Disclose this to YouTube ("altered or synthetic content") and TikTok ("AI-generated").</span></label>` : ''}`);
    const table = rows.map((r, i) => {
      const c = checked(r), slot = slotOf(r), p = platformOf(r), res = r.result, e = edit(r), locked = res?.ok || st.running;
      const media = r.files.length ? esc(r.files.map(f => f.name).join(', ')) + (r.cover ? `<small class="vs-mini">Cover: ${esc(r.cover.name)}</small>` : '') : r.choices.length ? `<select class="vs-input" data-pkg-choice="${i}"><option value="">Choose a version…</option>${r.choices.map((f, j) => `<option value="${j}">${esc(pathOf(f).split('/').slice(-2).join('/'))}</option>`).join('')}</select>` : p === 'blog' ? '<span class="vs-mini">No main image</span>' : '<span class="vs-mini">None yet</span>';
      const state = res ? (res.ok ? `<span class="vs-status scheduled">${esc(res.text)}</span>` : res.busy ? `<span class="vs-status">${esc(res.text)}</span>` : `<span class="vs-status failed">Failed</span><small class="vs-inline-error">${esc(res.text)}</small>`)
        : c.errors.length ? `<small class="vs-inline-error">${esc(c.errors.join(' '))}</small>` : `<span class="vs-status scheduled">Ready · ${c.format}</span>${c.warnings.map(w => `<small class="vs-mini">${esc(w)}</small>`).join('')}`;
      const when = slot ? `<input class="vs-input" type="date" data-pkg-date="${i}" value="${slot.date}" ${locked ? 'disabled' : ''}><input class="vs-input" type="time" data-pkg-time="${i}" value="${slot.time}" ${locked ? 'disabled' : ''}>` : '<span class="vs-mini">—</span>';
      const label = r.row.loose ? '—' : r.row.id || r.row.key || '—', firstOfFile = rows.findIndex(x => x.base === r.base) === i;
      return `<tr class="${e.include ? '' : 'vs-muted'}"><td><input type="checkbox" data-pkg-include="${i}" ${e.include ? 'checked' : ''} ${locked ? 'disabled' : ''} aria-label="Include ${esc(label)}"></td><td>${esc(label)}<br><small class="vs-mini">${NAMES[p] || 'Instagram'}</small>${r.choosable && firstOfFile ? `<div class="vs-stack">${r.options.map(id => `<label class="vs-check"><input type="checkbox" data-pkg-target="${id}" data-pkg-base="${esc(r.base)}" ${r.chosen.includes(id) ? 'checked' : ''} ${locked ? 'disabled' : ''}><span>${NAMES[id]}</span></label>`).join('')}</div>` : ''}</td><td><input class="vs-input" data-pkg-title="${i}" value="${esc(r.row.title)}" maxlength="${p === 'youtube' ? 100 : 180}" ${res?.ok ? 'disabled' : ''}>${r.row.caption ? `<details><summary>Description${r.row.tags.length ? ' & tags' : ''}</summary><p class="vs-pkg-caption">${esc(r.row.caption)}</p>${r.row.tags.length ? `<p class="vs-mini">Tags: ${esc(r.row.tags.join(', '))}</p>` : ''}</details>` : '<small class="vs-mini">No caption</small>'}</td><td class="vs-pkg-media">${media}</td><td class="vs-pkg-when">${when}</td><td>${state}</td></tr>`;
    }).join('');
    const label = st.mode === 'scheduled' ? `Schedule ${count} posts` : st.mode === 'review' ? `Submit ${count} posts for review` : `Save ${count} drafts`;
    const s3 = step(3, 'Review and run', `<div class="vs-table-wrap"><table class="vs-pkg-table"><thead><tr><th></th><th>No</th><th>Title</th><th>Media</th><th>${st.mode === 'draft' ? 'Schedule' : 'Schedule (WIB)'}</th><th>Status</th></tr></thead><tbody>${table}</tbody></table></div>
${st.mode === 'scheduled' ? `<label class="vs-check"><input type="checkbox" id="pkg-approved" ${st.approved ? 'checked' : ''} ${st.running ? 'disabled' : ''}><span>I have checked the videos, titles, and descriptions above, and all of them may go live on schedule.</span></label>` : ''}
<div class="vs-actions">${st.done ? button('Open library', 'pkg-open', 'vs-primary', 'layout-grid') : button(st.running ? 'Processing…' : label, 'pkg-run', 'vs-primary', 'send', !count || st.running || (st.mode === 'scheduled' && !st.approved) ? 'disabled' : '')}${button('Start over', 'pkg-reset', 'vs-text-button', '', st.running ? 'disabled' : '')}</div>
<p class="vs-mini">Files upload one by one from this computer; keep the page open until it finishes. YouTube uploads each video at its scheduled time, so a spread-out schedule also protects the daily quota.</p>`);
    return `<div class="vs-stack" id="pkg-page">${s1}${s2}${s3}</div>`;
  }

  // ---------- run ----------
  // Files from the computer are uploaded; files that still sit in Google Drive are fetched by the server.
  async function uploadFiles(files, role = 'content') {
    const url = '/api/media' + (role === 'cover' ? '?role=cover' : '');
    if (!files.some(f => f.driveId)) { const form = new FormData(); for (const f of files) form.append('files', f); return (await api(url, 'POST', form)).media || []; }
    const out = [];
    for (const f of files) {
      if (f.driveId) { const key = f.driveId + ':' + role; if (!imported.has(key)) imported.set(key, (await api('/api/drive/import', 'POST', { fileId: f.driveId, role })).media || []); out.push(...imported.get(key)); }
      else { const form = new FormData(); form.append('files', f); out.push(...((await api(url, 'POST', form)).media || [])); }
    }
    return out;
  }
  async function run() {
    const slotOf = plan(), list = ready();
    if (!list.length || st.running) return;
    st.running = true; imported.clear(); ctx.render();
    let ok = 0;
    for (const r of list) {
      const slot = slotOf(r), p = platformOf(r), { format } = checked(r), taken = existingIds();
      const set = (text, extra = {}) => { r.result = { text, ...extra }; ctx.render(); };
      try {
        set('Uploading…', { busy: true });
        const media = r.files.length ? await uploadFiles(r.files) : [];
        if (p === 'blog') {
          set('Saving article…', { busy: true });
          const b = r.row.blog; let intent = st.mode === 'draft' ? 'draft' : st.mode, heroId = media[0]?.id || null;
          if (!heroId && willGen(r)) {
            set('Generating image…', { busy: true });
            heroId = (await withRetry(() => api('/api/blog/image', 'POST', { prompt: b.heroPrompt }))).media.id;
            if (intent === 'scheduled') intent = 'review'; // a generated image should be seen by a person before it goes live
          }
          let art = await api('/api/blog', 'POST', { title: r.row.title, slug: b.slug, excerpt: b.excerpt, seoTitle: b.seoTitle, seoDescription: b.excerpt, category: b.category, body: b.body, heroMediaId: heroId, heroAlt: b.heroAlt, heroPrompt: b.heroPrompt });
          if (intent !== 'draft') art = await api('/api/blog/' + encodeURIComponent(art.id), 'PUT', { title: art.title, slug: art.slug, excerpt: art.excerpt, seoTitle: art.seoTitle, seoDescription: art.seoDescription, category: art.category, body: art.body, heroMediaId: art.heroMediaId, heroAlt: art.heroAlt, revision: art.revision, intent, approved: intent === 'scheduled', date: slot?.date, time: slot?.time });
          ok++; set(intent === 'scheduled' ? `${art.id} · scheduled` : intent === 'review' ? `${art.id} · in review` : `${art.id} · draft`, { ok: true }); continue;
        }
        let coverId = null;
        if (r.cover && format === 'Reel') { coverId = (await uploadFiles([r.cover], 'cover'))[0]?.id || null; }
        let intent = st.mode;
        if (needsAI(r)) {
          set('AI is writing the caption…', { busy: true });
          const d = await withRetry(() => api('/api/assistant/draft', 'POST', { platform: p, mediaIds: media.map(m => m.id), hint: r.row.fromFile ? '' : r.row.title }));
          r.row.caption = d.caption; if (r.row.fromFile || !r.row.title) r.row.title = d.title; if (p === 'youtube' && !r.row.tags.length) r.row.tags = d.tags || [];
          intent = 'review';
        }
        set('Saving…', { busy: true });
        const id = r.row.id && r.row.id[0] === PREFIX[format] && !taken.includes(r.row.id) ? r.row.id : undefined;
        const body = { format, title: r.row.title, caption: r.row.caption, mediaIds: media.map(m => m.id), platform: p, ...(p === 'youtube' ? { tags: r.row.tags, syntheticMedia: st.synthetic } : p === 'tiktok' ? { syntheticMedia: st.synthetic } : {}) };
        // Keep the code from the file (V01, C02…) when it is free; otherwise the server picks the next one.
        let item = id ? await api('/api/posts', 'POST', { ...body, id }).catch(e => { if (/ID konten|content ID|post ID/i.test(e.message)) return api('/api/posts', 'POST', body); throw e; }) : await api('/api/posts', 'POST', body);
        if (intent !== 'draft' || coverId) item = await api('/api/posts/' + encodeURIComponent(item.id), 'PUT', { revision: item.revision, intent, approved: intent === 'scheduled', title: item.title, caption: item.caption, alt: item.alt || '', mediaIds: item.mediaIds, category: item.category, goal: item.goal, coverId, coverTime: null, date: slot?.date || item.date, time: slot?.time || item.time });
        ok++; set(intent === 'scheduled' ? `${item.id} · scheduled` : intent === 'review' ? `${item.id} · in review` : `${item.id} · draft`, { ok: true });
      } catch (error) { set(error.message || 'Processing failed.'); }
    }
    st.running = false; st.approved = false; st.done = st.rows.every(r => !edit(r).include || r.result?.ok);
    await ctx.reload(); ctx.render();
    toast(`${ok} of ${list.length} posts processed.`, ok < list.length);
  }

  // ---------- events ----------
  async function addFiles(list) {
    st.reading = true; ctx.render();
    const expanded = [];
    for (const f of list) { if (/\.zip$/i.test(f.name)) { try { expanded.push(...await expandZip(f)); } catch (error) { toast(error.message, true); } } else expanded.push(f); }
    // A Word file next to a Markdown file of the same name is the same article: keep one.
    const stem = f => String(f.name).replace(/\.[^.]+$/, '').toLowerCase(), markdown = new Set([...expanded, ...st.texts.map(t => ({ name: t.name }))].filter(f => /\.md$/i.test(f.name)).map(stem));
    const usable = expanded.filter(f => !mediaInfo(f).ignored && !(/\.docx$/i.test(f.name) && markdown.has(stem(f))));
    const seen = new Set([...st.texts.map(t => t.path), ...st.media.map(pathOf)]);
    for (const f of usable) {
      const path = pathOf(f); if (seen.has(path)) continue; seen.add(path);
      if (MEDIA_FILE.test(f.name)) st.media.push(f);
      else if (/\.docx$/i.test(f.name) && f.size < 20 * 1024 * 1024) { try { st.texts.push({ name: f.name.replace(/\.docx$/i, '.md'), path: path.replace(/\.docx$/i, '.md'), text: await docxToMarkdown(f) }); } catch (error) { toast(error.message, true); } }
      else if (TEXT_FILE.test(f.name) && f.size < 2 * 1024 * 1024) { try { st.texts.push({ name: f.name, path, text: await f.text() }); } catch { /* unreadable file: skip */ } }
    }
    st.reading = false; st.done = false; rebuild(); ctx.render();
  }
  function bind() {
    const root = ctx.root(), on = (sel, ev, fn) => root.querySelectorAll(sel).forEach(el => el.addEventListener(ev, e => fn(el, e)));
    drive.bind(root);
    on('#pkg-folder,#pkg-files', 'change', el => { if (el.files.length) void addFiles([...el.files]); });
    // Drag & drop of files or whole folders anywhere on the page.
    const page = root.querySelector('#pkg-page'), zone = root.querySelector('#pkg-drop');
    if (page && zone) {
      let depth = 0;
      const hasFiles = e => [...(e.dataTransfer?.items || [])].some(i => i.kind === 'file');
      page.addEventListener('dragenter', e => { if (!hasFiles(e)) return; e.preventDefault(); depth++; zone.classList.add('is-dragging'); });
      page.addEventListener('dragover', e => { if (!hasFiles(e)) return; e.preventDefault(); e.dataTransfer.dropEffect = st.running ? 'none' : 'copy'; });
      page.addEventListener('dragleave', () => { if (--depth <= 0) { depth = 0; zone.classList.remove('is-dragging'); } });
      page.addEventListener('drop', e => { if (!hasFiles(e)) return; e.preventDefault(); depth = 0; zone.classList.remove('is-dragging'); if (st.running) return; const pending = droppedFiles(e.dataTransfer); st.reading = true; ctx.render(); void pending.then(addFiles).catch(() => { st.reading = false; ctx.render(); toast('Some files could not be read. Try choosing them with the buttons.', true); }); });
    }
    on('[data-pkg-target]', 'change', el => { const sh = st.edits['@' + el.dataset.pkgBase] || (st.edits['@' + el.dataset.pkgBase] = {}), cur = sh.targets || st.rows.find(r => r.base === el.dataset.pkgBase)?.chosen || []; sh.targets = el.checked ? [...new Set([...cur, el.dataset.pkgTarget])] : cur.filter(x => x !== el.dataset.pkgTarget); rebuild(); ctx.render(); });
    on('[name="pkg-mode"]', 'change', el => { st.mode = el.value; ctx.render(); });
    on('#pkg-start', 'change', el => { st.start = el.value; clearOverrides(); ctx.render(); });
    on('#pkg-times', 'change', el => { st.times = el.value; clearOverrides(); ctx.render(); });
    on('[data-pkg-day]', 'change', el => { const d = Number(el.dataset.pkgDay); st.days = el.checked ? [...st.days, d] : st.days.filter(x => x !== d); clearOverrides(); ctx.render(); });
    on('#pkg-file-dates', 'change', el => { st.useFileDates = el.checked; ctx.render(); });
    on('#pkg-gen-hero', 'change', el => { st.genHero = el.checked; ctx.render(); });
    on('#pkg-synthetic', 'change', el => { st.synthetic = el.checked; });
    on('#pkg-ai-fill', 'change', el => { st.aiFill = el.checked; ctx.render(); });
    if (ai === null) { ai = false; api('/api/assistant').then(d => { ai = d.status || { textConfigured: false }; ctx.render(); }).catch(() => { ai = { textConfigured: false }; }); }
    on('#pkg-approved', 'change', el => { st.approved = el.checked; const b = root.querySelector('[data-action="pkg-run"]'); if (b) b.disabled = !el.checked || !ready().length; });
    on('[data-pkg-include]', 'change', el => { edit(st.rows[el.dataset.pkgInclude]).include = el.checked; ctx.render(); });
    on('[data-pkg-title]', 'input', el => { const r = st.rows[el.dataset.pkgTitle]; r.row.title = el.value; shared(r).title = el.value; });
    on('[data-pkg-title]', 'change', () => ctx.render());
    on('[data-pkg-choice]', 'change', el => { const r = st.rows[el.dataset.pkgChoice]; if (el.value !== '') { shared(r).picked = r.choices[Number(el.value)]; rebuild(); ctx.render(); } });
    on('[data-pkg-date],[data-pkg-time]', 'change', el => { const i = el.dataset.pkgDate ?? el.dataset.pkgTime, date = root.querySelector(`[data-pkg-date="${i}"]`).value, time = root.querySelector(`[data-pkg-time="${i}"]`).value; if (date && time) edit(st.rows[i]).override = { date, time }; ctx.render(); });
  }
  // The AI endpoint allows one request every few seconds; wait and retry instead of failing the row.
  async function withRetry(call) {
    for (let attempt = 0; ; attempt++) {
      try { return await call(); }
      catch (e) { if (attempt < 4 && /Tunggu beberapa detik|sedang berjalan|a few seconds|in progress|already running/i.test(e.message || '')) { await new Promise(r => setTimeout(r, 6000)); continue; } throw e; }
    }
  }
  // Turns a drop into File objects with folder paths like the folder picker gives ("Short YT/01 - …/Video/x.mp4").
  // Entries must be taken synchronously during the drop event; folders such as node_modules are never opened.
  function droppedFiles(dataTransfer) {
    const entries = [...dataTransfer.items].filter(i => i.kind === 'file').map(i => i.webkitGetAsEntry?.()).filter(Boolean);
    if (!entries.length) return Promise.resolve([...dataTransfer.files]);
    const out = [], SKIP = /^(node_modules|\.git|\.next|dist|build|out|cache|tmp)$/i;
    async function walk(entry, prefix) {
      if (entry.isFile) { const file = await new Promise((resolve, reject) => entry.file(resolve, reject)); if (prefix) Object.defineProperty(file, 'webkitRelativePath', { value: prefix + file.name }); out.push(file); return; }
      if (!entry.isDirectory || SKIP.test(entry.name) || entry.name.startsWith('.')) return;
      const reader = entry.createReader();
      for (;;) { const batch = await new Promise((resolve, reject) => reader.readEntries(resolve, reject)); if (!batch.length) break; for (const child of batch) await walk(child, prefix + entry.name + '/'); }
    }
    return entries.reduce((p, entry) => p.then(() => walk(entry, '')), Promise.resolve()).then(() => out);
  }
  const clearOverrides = () => Object.values(st.edits).forEach(e => { e.override = null; });
  async function action(name) {
    if (name.startsWith('pkg-drive-')) return drive.action(name);
    if (name === 'pkg-run') { await run(); return true; }
    if (name === 'pkg-reset') { reset(); ctx.render(); return true; }
    if (name === 'pkg-open') { const kinds = new Set(st.rows.filter(r => r.result?.ok).map(platformOf)); reset(); const only = kinds.size === 1 ? [...kinds][0] : ''; ctx.navigate({ blog: 'blog', youtube: 'youtube-library', facebook: 'facebook-library', tiktok: 'tiktok-library' }[only] || 'library'); return true; }
    return false;
  }
  return { page, bind, action };
}
