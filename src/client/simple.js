// Everyday views for non-technical team members: the "Today" home page, the step-by-step "Create post" flow
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
    const w = workspace(), owner = ['owner','admin'].includes(user().role), s = w.settings || {}, list = [];
    const ig = w.instagram || {}, yt = w.youtube || {}, posts = w.posts || [];
    const scheduled = posts.filter(p => p.status === 'scheduled');
    if (s.notifyFailure !== false) {
      const failed = posts.filter(p => p.status === 'failed').length, uncertain = posts.filter(p => p.status === 'uncertain').length;
      if (failed) list.push({ level: 'danger', text: `${failed} posts failed to publish. Open the Queue to see why and reschedule.`, action: ['Open queue', 'nav:queue'] });
      if (uncertain) list.push({ level: 'danger', text: `${uncertain} posts may or may not have been published. Check the result before trying again so nothing is uploaded twice.`, action: ['Open queue', 'nav:queue'] });
    }
    if (s.notifyReconnect !== false) {
      const fix = owner ? ['Open connections', 'nav:settings'] : null;
      if (ig.error || (ig.expiresAt && !ig.connected && !ig.noExpiry)) list.push({ level: 'danger', text: owner ? 'Instagram is disconnected. Reconnect it so posts keep going out.' : 'Instagram is disconnected. Ask the workspace owner to reconnect it.', action: fix });
      else if (ig.connected && !ig.noExpiry && ig.expiresAt && Date.parse(ig.expiresAt) - Date.now() < 7 * DAY) list.push({ level: 'warning', text: 'Instagram access expires within 7 days. The studio tries to renew it automatically; if that fails, reconnect.', action: fix });
      if (yt.error) list.push({ level: 'danger', text: owner ? 'YouTube is disconnected. Reconnect the channel so Shorts keep uploading.' : 'YouTube is disconnected. Ask the workspace owner to reconnect it.', action: fix });
      if (scheduled.some(p => platformOf(p) === 'instagram') && !ig.connected) list.push({ level: 'danger', text: 'Instagram content is scheduled, but Instagram is not connected.', action: fix });
      if (scheduled.some(p => platformOf(p) === 'youtube') && !yt.connected) list.push({ level: 'danger', text: 'A Short is scheduled, but the YouTube channel is not connected.', action: fix });
    }
    if (scheduled.length && (!s.publishingEnabled || s.paused)) list.push({ level: 'warning', text: !s.publishingEnabled ? `${scheduled.length} scheduled posts will not be published because real publishing is not enabled.` : `${scheduled.length} scheduled posts are waiting because the queue is paused.`, action: owner ? (!s.publishingEnabled ? ['Enable publishing', 'nav:settings'] : ['Open queue', 'nav:queue']) : null });
    return [...list, ...(ctx.extraAlerts?.() || [])];
  }
  const alertsHTML = alerts => alerts.map(a => `<div class="vs-alert ${a.level}" role="${a.level === 'danger' ? 'alert' : 'status'}"><span>${esc(a.text)}</span>${a.action ? button(a.action[0], a.action[1]) : ''}</div>`).join('');

  // ---------- Home: "Today" ----------
  function record(item) {
    return `<div class="vs-record">${previewImage(item)}<div class="vs-record-copy"><h3>${esc(item.title)}</h3><span class="vs-mini">${PLATFORM[platformOf(item)]} · ${esc(names[item.status] || item.status)}${item.scheduleAt ? ' · ' + esc(stamp(item.scheduleAt)) : ''}</span></div><div class="vs-actions">${button('Open', 'edit:' + item.id)}</div></div>`;
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
    const connection = (label, ok, detail) => `<div class="vs-setting"><div><h3>${label}</h3><p class="vs-sub">${detail}</p></div><span class="vs-status ${ok ? 'scheduled' : 'review'}">${ok ? 'Connected' : 'Not connected'}</span></div>`;
    return `<section class="vs-panel vs-pad vs-stack"><div class="vs-row"><div><h2>Hello, ${esc(user().name)}</h2><p class="vs-sub">${alerts.length ? 'Something needs your attention.' : 'Everything is running fine. Nothing needs handling.'}</p></div>${button('Create post', 'nav:create', 'vs-primary', 'circle-plus')}</div>${alerts.length ? `<div class="vs-stack">${alertsHTML(alerts)}</div>` : ''}</section>
<div class="vs-stats"><span><strong>${todayCount}</strong> going live today</span><span><strong>${upcoming.length}</strong> scheduled in 7 days</span><span><strong>${review.length}</strong> need review</span><span><strong>${drafts}</strong> draft</span><span><strong>${published}</strong> published in 30 days</span></div>
<section class="vs-panel"><div class="vs-panel-head"><h2>Next 7 days</h2>${button('Calendar', 'nav:calendar', 'vs-text-button')}</div><div class="vs-list">${upcoming.map(record).join('') || '<div class="vs-empty"><h3>Nothing scheduled this week.</h3><p>Create a new post, then pick a date and time.</p></div>'}</div></section>
<section class="vs-panel"><div class="vs-panel-head"><h2>Needs review</h2></div><div class="vs-list">${review.map(record).join('') || '<div class="vs-empty"><h3>Nothing is waiting for review.</h3><p>Content submitted for review appears here.</p></div>'}</div></section>
<section class="vs-panel vs-pad">${connection('Instagram', ig.connected, ig.username ? '@' + esc(ig.username) : 'No account connected yet.')}${connection('YouTube Shorts', yt.connected, yt.channelTitle ? esc(yt.channelTitle) : 'No channel connected yet.')}<div class="vs-setting"><div><h3>Live publishing</h3><p class="vs-sub">${s.publishingEnabled ? (s.paused ? 'On, but the queue is paused.' : 'On. Scheduled content goes live automatically.') : 'Off. Content is only saved as a plan.'}</p></div>${['owner','admin'].includes(user().role) ? button('Set up', 'nav:settings', 'vs-text-button') : ''}</div></section>`;
  }

  // ---------- "Create post": form on the left (platform → upload → words → when), live preview on the right ----------
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
  const formatLabel = { Gambar: 'Photo (1 image)', Carousel: 'Carousel (several images)', Reel: 'Reel (video)', Short: 'YouTube Short (vertical video)' };
  const icon = name => (ctx.icon ? ctx.icon(name) : '');

  function createPage() {
    if (flow.platform === 'blog' && ctx.blogEditor) return blogCreate();
    const f = flow, format = formatFor(f.platform, f.media), yt = f.platform === 'youtube', ready = canSubmit(f);
    const group = (n, title, body, disabled = false, hint = '') => `<fieldset class="vs-create-group" ${disabled ? 'disabled' : ''}><legend><span class="vs-step-number">${n}</span>${title}</legend>${disabled && hint ? `<p class="vs-mini">${hint}</p>` : body}</fieldset>`;
    const choice = (id, title, hint) => `<button type="button" class="vs-choice" data-create-platform="${id}" aria-pressed="${f.platform === id}"><b>${title}</b><span>${hint}</span></button>`;
    const mediaHint = yt ? 'Choose 1 vertical MP4 video, up to 3 minutes.' : 'Choose 1 photo, 2–20 photos for a carousel, or 1 video for a Reel.';
    const files = f.media.length ? `<ul class="vs-create-files">${f.media.map(m => `<li>${esc(m.name)}${m.duration ? ' · ' + Math.round(m.duration) + ' sec' : ''}</li>`).join('')}</ul>` : '';
    const g1 = group(1, 'Where do you want to post?', `<div class="vs-choice-grid">${choice('instagram', 'Instagram', 'Photo, carousel, or Reel')}${choice('youtube', 'YouTube Shorts', 'Vertical video up to 3 minutes')}${choice('blog', 'Blog', 'Article on vayora.id/blog')}</div>`);
    const g2 = group(2, 'Choose a photo or video', `<label class="vs-dropzone" id="create-drop">${icon('upload')}<b>${f.media.length ? 'Replace files: drag & drop here' : 'Drag & drop files here'}</b><span>or click to choose from your computer</span><span class="vs-mini">${mediaHint}</span><input class="sr-only" type="file" id="create-files" aria-label="Choose a photo or video" ${yt ? 'accept="video/mp4"' : 'multiple accept="image/jpeg,image/png,image/webp,video/mp4"'}></label>${f.busy && !f.media.length ? '<p class="vs-mini" role="status">Uploading…</p>' : ''}${files}${f.media.length ? `<p class="vs-mini">${format ? 'Content type: <b>' + formatLabel[format] + '</b>' : 'This combination of files is not supported. ' + mediaHint}</p>` : ''}`);
    const g3 = group(3, 'Write a title and caption', `${aiLine(f)}<label class="vs-label">Title${yt ? ' <small>shown as the YouTube video title, up to 100 characters</small>' : ' <small>for the team only, not shown on Instagram</small>'}<input class="vs-input" id="create-title" ${f.writing ? 'disabled' : ''} maxlength="${yt ? 100 : 180}" value="${esc(f.title)}"></label><label class="vs-label">${yt ? 'Description' : 'Caption'} <small><span id="create-caption-count">${f.caption.length}</span>/2,200</small><textarea class="vs-input" id="create-caption" ${f.writing ? 'disabled' : ''} maxlength="2200" style="min-height:160px">${esc(f.caption)}</textarea></label>${ai?.textConfigured ? '' : '<p class="vs-mini">Need ideas? After saving, open the content and use the Caption assistant.</p>'}${yt && f.tags.length ? `<p class="vs-mini">YouTube tags: ${esc(f.tags.join(', '))}</p>` : ''}`, !format, 'Available after a photo or video is uploaded.');
    const g4 = group(4, 'When should it go live?', `<div class="vs-stack"><label class="vs-check"><input type="radio" name="create-when" value="review" ${f.when === 'review' ? 'checked' : ''}><span><b>Submit for review</b> · the owner checks it before it is scheduled</span></label><label class="vs-check"><input type="radio" name="create-when" value="scheduled" ${f.when === 'scheduled' ? 'checked' : ''}><span><b>Schedule now</b> · goes live automatically at the chosen time</span></label><label class="vs-check"><input type="radio" name="create-when" value="draft" ${f.when === 'draft' ? 'checked' : ''}><span><b>Save as draft</b> · continue later</span></label>${f.when === 'scheduled' ? `<div class="vs-two"><label class="vs-label">Date<input class="vs-input" type="date" id="create-date" value="${esc(f.date)}"></label><label class="vs-label">Time (WIB)<input class="vs-input" type="time" id="create-time" value="${esc(f.time)}"></label></div><label class="vs-check"><input type="checkbox" id="create-approved" ${f.approved ? 'checked' : ''}><span>I have checked the photo/video and caption, and this content may go live.</span></label>` : ''}</div>`, !format, 'Available after a photo or video is uploaded.');
    const actions = `${f.error ? `<p class="vs-inline-error" role="alert">${esc(f.error)}</p>` : ''}<div class="vs-actions">${button(f.when === 'scheduled' ? 'Save & schedule' : f.when === 'draft' ? 'Save draft' : 'Save & submit', 'create-submit', 'vs-primary', 'send', ready ? '' : 'disabled')}${button('Start over', 'create-reset', 'vs-text-button')}</div>`;
    const spec = format ? formatLabel[format] : yt ? 'YouTube Shorts · 9:16' : 'Instagram · 4:5 to 1.91:1';
    return `<section class="vs-panel vs-pad vs-stack" id="create-post"><div class="vs-row"><div><span class="vs-eyebrow">CREATE POST</span><h2>Upload, write, then choose when it goes live.</h2></div><span class="vs-status">${esc(spec)}</span></div><p class="vs-sub">The preview on the right updates as you type. Content is only saved when you press Save.</p><div class="smart-layout vs-create-layout"><div class="vs-stack vs-create-form">${g1}${g2}${g3}${g4}${actions}</div><div id="create-preview" class="smart-design-result vs-create-preview" aria-label="Preview">${preview(f)}</div></div></section>`;
  }

  // Blog: the platform choice stays on top, the article editor (with its own preview) takes over below.
  function blogCreate() {
    const choice = (id, title, hint) => `<button type="button" class="vs-choice" data-create-platform="${id}" aria-pressed="${flow.platform === id}"><b>${title}</b><span>${hint}</span></button>`;
    return `<section class="vs-panel vs-pad vs-stack" id="create-post"><div class="vs-row"><div><span class="vs-eyebrow">CREATE POST</span><h2>Where do you want to post?</h2></div></div><div class="vs-choice-grid">${choice('instagram', 'Instagram', 'Photo, carousel, or Reel')}${choice('youtube', 'YouTube Shorts', 'Vertical video up to 3 minutes')}${choice('blog', 'Blog', 'Article on vayora.id/blog')}</div></section>${ctx.blogEditor()}`;
  }

  // ---------- live preview ----------
  const CUT = 125; // Instagram shows about this many characters before "… more"
  function captionPreview(f) {
    const text = f.caption.trim();
    if (!text) return '<span class="vs-mini">The caption appears here.</span>';
    if (f.more || text.length <= CUT) return esc(text);
    return `${esc(text.slice(0, CUT).trimEnd())}… <button type="button" class="vs-text-button vs-preview-more" data-action="create-more">more</button>`;
  }
  function mediaPreview(f, frameClass) {
    const list = f.media, i = Math.min(f.slide, Math.max(0, list.length - 1)), m = list[i];
    if (!m) return `<div class="${frameClass} vs-preview-blank">${f.busy ? 'Uploading…' : ''}</div>`;
    const ratio = m.width && m.height ? `${m.width} / ${m.height}` : '4 / 5';
    const body = m.mime === 'video/mp4' ? `<video src="${esc(m.url)}" poster="${esc(m.posterUrl || '')}" controls muted playsinline preload="metadata"></video>` : `<img src="${esc(m.url)}" alt="">`;
    const nav = list.length > 1 ? `<div class="vs-preview-nav"><button type="button" data-action="create-slide-prev" aria-label="Previous slide" ${i === 0 ? 'disabled' : ''}>${icon('chevron-left')}</button><span>${i + 1} / ${list.length}</span><button type="button" data-action="create-slide-next" aria-label="Next slide" ${i === list.length - 1 ? 'disabled' : ''}>${icon('chevron-right')}</button></div>` : '';
    return `<div class="${frameClass}" style="aspect-ratio:${frameClass.includes('short') ? '9 / 16' : ratio}">${body}${nav}</div>`;
  }
  function preview(f) {
    if (!f.media.length && !f.busy) return `<img class="smart-design-placeholder" src="/brand/icon.svg" alt=""><h3>Your post preview appears here.</h3><p class="vs-mini">Upload a photo or video to see how it will look on ${f.platform === 'youtube' ? 'YouTube Shorts' : 'Instagram'}.</p>`;
    const w = workspace();
    if (f.platform === 'youtube') {
      const channel = w.youtube?.channelTitle || 'YouTube channel';
      const long = f.title.length > 100 ? '<p class="vs-inline-error">YouTube titles are limited to 100 characters.</p>' : '';
      return `<div class="vs-preview-label">YouTube Shorts preview</div><div class="vs-short-card">${mediaPreview(f, 'vs-preview-media vs-preview-short')}<div class="vs-short-meta"><b id="create-pv-title">${esc(f.title) || '<span class="vs-mini">The video title appears here.</span>'}</b><span class="vs-mini">${esc(channel)}</span><p id="create-pv-caption" class="vs-preview-caption">${captionPreview(f)}</p></div></div>${long}`;
    }
    const user = w.instagram?.username || 'vayora.id';
    return `<div class="vs-preview-label">Instagram preview</div><article class="vs-ig-card"><header><img src="/brand/icon.svg" alt=""><b>${esc(user)}</b></header>${mediaPreview(f, 'vs-preview-media')}<div class="vs-ig-icons">${icon('heart')}${icon('message-circle')}${icon('send')}<span></span>${icon('bookmark')}</div><p id="create-pv-caption" class="vs-preview-caption"><b>${esc(user)}</b> ${captionPreview(f)}</p></article>`;
  }
  // Typing only refreshes the preview text, so focus and video playback are not disturbed.
  function refreshPreviewText() {
    const root = ctx.root(), title = root.querySelector('#create-pv-title'), caption = root.querySelector('#create-pv-caption');
    if (title) title.innerHTML = esc(flow.title) || '<span class="vs-mini">The video title appears here.</span>';
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
    if (ai && !ai.textConfigured) return ['owner','admin'].includes(user().role) ? `<div class="vs-alert warning"><span>Connect Gemini so the title and caption fill in automatically after upload.</span>${button('Set up Gemini', 'nav:ai-settings')}</div>` : '';
    if (!ai) return '';
    if (f.writing) return '<p class="vs-ai-note" role="status">AI is looking at the media and writing a title and caption…</p>';
    const again = button(f.written ? 'Rewrite with AI' : 'Write with AI', 'create-ai', 'vs-text-button', 'sparkles');
    if (f.aiError) return `<div class="vs-alert warning" role="alert"><span>${esc(f.aiError)}</span>${again}</div>`;
    if (f.written) return `<div class="vs-ai-note"><span>Written automatically by AI. Check and edit it as needed before saving.</span>${again}</div>${f.aiWarnings.length ? `<ul class="vs-help-list">${f.aiWarnings.map(w => `<li>${esc(w)}</li>`).join('')}</ul>` : ''}`;
    return `<div class="vs-ai-note"><span>AI can write a title and caption from this media.</span>${again}</div>`;
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
      toast(f.when === 'scheduled' ? 'Post scheduled.' : f.when === 'draft' ? 'Draft saved.' : 'Post submitted for review.');
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
    if (!ok.length) { toast(yt ? 'YouTube Shorts need an MP4 video.' : 'Use JPG, PNG, WebP, or MP4.', true); return; }
    if (ok.length < list.length) toast(`${list.length - ok.length} files were skipped because their format is not supported.`);
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
