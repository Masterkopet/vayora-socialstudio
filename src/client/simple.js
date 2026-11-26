// Everyday views for non-technical team members: the "Today" home page, the step-by-step "Create post" flow
// and the list of problems that need attention. They reuse the studio's helpers through `ctx`.

const DAY = 86400000;
const PLATFORM = { instagram: 'Instagram', youtube: 'YouTube Shorts', facebook: 'Facebook', tiktok: 'TikTok' };
const wibDate = value => new Date(Date.parse(value) + 7 * 3600000).toISOString().slice(0, 10);

export function createSimpleViews(ctx) {
  const { api, esc, button, toast, stamp, previewImage, names } = ctx;
  const workspace = () => ctx.getWorkspace(), user = () => ctx.getUser();
  const platformOf = item => PLATFORM[item.platform] && item.platform !== 'blog' ? item.platform : item.format === 'Short' ? 'youtube' : 'instagram';

  // ---------- Problems that need attention ----------
  function problemAlerts() {
    const w = workspace(), owner = ['owner','admin'].includes(user().role), s = w.settings || {}, list = [];
    const ig = w.instagram || {}, yt = w.youtube || {}, fb = w.facebook || {}, tt = w.tiktok || {}, posts = w.posts || [];
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
      if (fb.error || (scheduled.some(p => platformOf(p) === 'facebook') && !fb.connected)) list.push({ level: 'danger', text: owner ? 'Facebook posts are scheduled or waiting, but the Facebook Page is not connected.' : 'The Facebook Page is not connected. Ask the workspace owner to connect it.', action: fix });
      if (tt.error || (scheduled.some(p => platformOf(p) === 'tiktok') && !tt.connected)) list.push({ level: 'danger', text: owner ? 'TikTok posts are scheduled or waiting, but TikTok is not connected.' : 'TikTok is not connected. Ask the workspace owner to connect it.', action: fix });
      if (scheduled.some(p => platformOf(p) === 'tiktok') && tt.connected && tt.mode === 'direct' && !tt.privacy) list.push({ level: 'danger', text: 'TikTok posts are scheduled, but no TikTok visibility is chosen in Settings.', action: fix });
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
    const ig = w.instagram || {}, yt = w.youtube || {}, fb = w.facebook || {}, tt = w.tiktok || {}, s = w.settings || {};
    const connection = (label, ok, detail) => `<div class="vs-setting"><div><h3>${label}</h3><p class="vs-sub">${detail}</p></div><span class="vs-status ${ok ? 'scheduled' : 'review'}">${ok ? 'Connected' : 'Not connected'}</span></div>`;
    return `<section class="vs-panel vs-pad vs-stack"><div class="vs-row"><div><h2>Hello, ${esc(user().name)}</h2><p class="vs-sub">${alerts.length ? 'Something needs your attention.' : 'Everything is running fine. Nothing needs handling.'}</p></div>${button('Create post', 'nav:create', 'vs-primary', 'circle-plus')}</div>${alerts.length ? `<div class="vs-stack">${alertsHTML(alerts)}</div>` : ''}</section>
<div class="vs-stats"><span><strong>${todayCount}</strong> going live today</span><span><strong>${upcoming.length}</strong> scheduled in 7 days</span><span><strong>${review.length}</strong> need review</span><span><strong>${drafts}</strong> draft</span><span><strong>${published}</strong> published in 30 days</span></div>
<section class="vs-panel"><div class="vs-panel-head"><h2>Next 7 days</h2>${button('Calendar', 'nav:calendar', 'vs-text-button')}</div><div class="vs-list">${upcoming.map(record).join('') || '<div class="vs-empty"><h3>Nothing scheduled this week.</h3><p>Create a new post, then pick a date and time.</p></div>'}</div></section>
<section class="vs-panel"><div class="vs-panel-head"><h2>Needs review</h2></div><div class="vs-list">${review.map(record).join('') || '<div class="vs-empty"><h3>Nothing is waiting for review.</h3><p>Content submitted for review appears here.</p></div>'}</div></section>
<section class="vs-panel vs-pad">${connection('Instagram', ig.connected, ig.username ? '@' + esc(ig.username) : 'No account connected yet.')}${connection('YouTube Shorts', yt.connected, yt.channelTitle ? esc(yt.channelTitle) : 'No channel connected yet.')}${connection('Facebook', fb.connected, fb.pageName ? esc(fb.pageName) : 'No Page connected yet.')}${connection('TikTok', tt.connected, tt.username ? '@' + esc(tt.username) : tt.displayName ? esc(tt.displayName) : 'No account connected yet.')}<div class="vs-setting"><div><h3>Live publishing</h3><p class="vs-sub">${s.publishingEnabled ? (s.paused ? 'On, but the queue is paused.' : 'On. Scheduled content goes live automatically.') : 'Off. Content is only saved as a plan.'}</p></div>${['owner','admin'].includes(user().role) ? button('Set up', 'nav:settings', 'vs-text-button') : ''}</div></section>`;
  }

  // ---------- "Create post": form on the left (platform → upload → words → when), live preview on the right ----------
  let flow = null, ai = null; // ai: AI status from /api/assistant (null = not loaded yet)
  // A post can go to several places at once: `targets` are the ticked platforms, `platform` is the one whose text is open (or
  // 'blog'), `drafts` keeps the text of the others and `sched` the time of each. Every target becomes its own post.
  const ORDER = ['instagram', 'youtube', 'facebook', 'tiktok'];
  const reset = () => { ai = null; flow = { platform: 'instagram', targets: ['instagram'], drafts: {}, sched: {}, note: '', media: [], title: '', caption: '', when: 'review', busy: false, error: '', writing: false, written: false, aiError: '', aiWarnings: [], tags: [], slide: 0, more: false }; };
  const textOf = (f, p) => p === f.platform ? { title: f.title, caption: f.caption, tags: f.tags } : (f.drafts[p] || { title: '', caption: '', tags: [] });
  const complete = (f, p) => { const t = textOf(f, p); return !!String(t.title).trim() && !!String(t.caption).trim(); };
  const canSubmit = f => f.targets.length > 0 && f.targets.every(p => !!formatFor(p, f.media) && complete(f, p) && (f.when !== 'scheduled' || (f.sched[p]?.date && f.sched[p]?.time && f.sched[p]?.approved))) && !f.busy && !f.writing;
  const syncActive = f => { if (f.platform !== 'blog') f.drafts[f.platform] = { title: f.title, caption: f.caption, tags: f.tags, written: f.written }; };
  const loadDraft = (f, p) => { const d = f.drafts[p] || { title: '', caption: '', tags: [], written: false }; f.title = d.title; f.caption = d.caption; f.tags = d.tags || []; f.written = !!d.written; };
  const activate = (f, p) => { syncActive(f); f.platform = p; loadDraft(f, p); };
  // Staggered start: the first place at 09:00 tomorrow, each next one an hour later, so posts do not all go out at once.
  function defaultSchedule(f) { const day = wibDate(new Date(Date.now() + DAY).toISOString()); f.targets.forEach((p, i) => { if (!f.sched[p]) { const m = 9 * 60 + i * 60; f.sched[p] = { date: day, time: String(Math.floor(m / 60)).padStart(2, '0') + ':' + String(m % 60).padStart(2, '0'), approved: false }; } }); }
  const compatible = (p, media) => !media.length || !!formatFor(p, media);
  function toggleTarget(id) {
    const has = flow.targets.includes(id);
    if (has) { if (flow.targets.length === 1) return; flow.targets = flow.targets.filter(p => p !== id); if (flow.platform === id) activate(flow, flow.targets[0]); }
    else flow.targets = ORDER.filter(p => p === id || flow.targets.includes(p));
    if (flow.when === 'scheduled') defaultSchedule(flow);
    if (!has && ai?.textConfigured && flow.media.length) void write(false);
  }
  reset();
  function formatFor(platform, media) {
    if (!media.length) return '';
    const videos = media.filter(m => m.mime === 'video/mp4'), images = media.filter(m => m.mime === 'image/jpeg');
    if (platform === 'youtube') return media.length === 1 && videos.length === 1 ? 'Short' : '';
    if (media.length === 1) return videos.length ? 'Reel' : 'Gambar';
    return images.length === media.length && media.length <= 20 ? 'Carousel' : '';
  }
  const LABELS = { instagram: { Gambar: 'Photo (1 image)', Carousel: 'Carousel (several images)', Reel: 'Reel (video)' }, youtube: { Short: 'YouTube Short (vertical video)' }, facebook: { Gambar: 'Facebook photo', Carousel: 'Facebook album (several photos)', Reel: 'Facebook Reel (video)' }, tiktok: { Gambar: 'TikTok photo post', Carousel: 'TikTok photo post (several photos)', Reel: 'TikTok video' } };
  const formatLabel = (platform, format) => LABELS[platform]?.[format] || format;
  const HINTS = { instagram: 'Choose 1 photo, 2–20 photos for a carousel, or 1 video for a Reel.', youtube: 'Choose 1 vertical MP4 video, up to 3 minutes.', facebook: 'Choose 1 photo, 2–20 photos for an album, or 1 video (3–90 seconds) for a Reel.', tiktok: 'Choose 1 vertical video, or 1–20 photos for a photo post.' };
  const platformChoices = () => {
    const blog = flow.platform === 'blog';
    const choice = (id, title, hint) => { const on = id === 'blog' ? blog : !blog && flow.targets.includes(id), off = !blog && id !== 'blog' && flow.media.length && !compatible(id, flow.media) && !on; return `<button type="button" class="vs-choice" data-create-platform="${id}" aria-pressed="${on}" ${off ? 'disabled title="These files do not fit here"' : ''}><b>${title}</b><span>${hint}</span></button>`; };
    return `<div class="vs-choice-grid">${choice('instagram', 'Instagram', 'Photo, carousel, or Reel')}${choice('youtube', 'YouTube Shorts', 'Vertical video up to 3 minutes')}${choice('facebook', 'Facebook', 'Page post: photo, album, or Reel')}${choice('tiktok', 'TikTok', 'Video or photo post')}${choice('blog', 'Blog', 'Article on vayora.id/blog')}</div>${blog ? '' : '<p class="vs-mini">You can choose several places. Each one becomes its own post, with its own caption and time.</p>'}`;
  };
  const accountName = platform => { const w = workspace(); return platform === 'facebook' ? w.facebook?.pageName || 'Vayora' : platform === 'tiktok' ? (w.tiktok?.username ? '@' + w.tiktok.username : 'vayora.id') : w.instagram?.username || 'vayora.id'; };
  const icon = name => (ctx.icon ? ctx.icon(name) : '');

  function createPage() {
    if (flow.platform === 'blog' && ctx.blogEditor) return blogCreate();
    const f = flow, format = formatFor(f.platform, f.media), yt = f.platform === 'youtube', ready = canSubmit(f), many = f.targets.length > 1, onlyYt = f.targets.length === 1 && f.targets[0] === 'youtube';
    const group = (n, title, body, disabled = false, hint = '') => `<fieldset class="vs-create-group" ${disabled ? 'disabled' : ''}><legend><span class="vs-step-number">${n}</span>${title}</legend>${disabled && hint ? `<p class="vs-mini">${hint}</p>` : body}</fieldset>`;
    const mediaHint = many ? 'Choose the photos or video for all selected places. A video fits everywhere; photos cannot go to YouTube.' : HINTS[f.platform] || HINTS.instagram;
    const files = f.media.length ? `<ul class="vs-create-files">${f.media.map(m => `<li>${esc(m.name)}${m.duration ? ' · ' + Math.round(m.duration) + ' sec' : ''}</li>`).join('')}</ul>` : '';
    const g1 = group(1, 'Where do you want to post?', platformChoices());
    const g2 = group(2, 'Choose a photo or video', `<label class="vs-dropzone" id="create-drop">${icon('upload')}<b>${f.media.length ? 'Replace files: drag & drop here' : 'Drag & drop files here'}</b><span>or click to choose from your computer</span><span class="vs-mini">${mediaHint}</span><input class="sr-only" type="file" id="create-files" aria-label="Choose a photo or video" ${onlyYt ? 'accept="video/mp4"' : 'multiple accept="image/jpeg,image/png,image/webp,video/mp4"'}></label>${f.note ? `<p class="vs-mini" role="status">${esc(f.note)}</p>` : ''}${f.busy && !f.media.length ? '<p class="vs-mini" role="status">Uploading…</p>' : ''}${files}${f.media.length ? `<p class="vs-mini">${f.targets.some(p => formatFor(p, f.media)) ? f.targets.map(p => { const fm = formatFor(p, f.media); return `${PLATFORM[p]}: ${fm ? '<b>' + esc(formatLabel(p, fm)) + '</b>' : 'not possible with these files'}`; }).join(' · ') : 'This combination of files is not supported. ' + mediaHint}</p>` : ''}`);
    const tabs = many ? `<div class="vs-tabs"><div class="vs-tablist" role="tablist" aria-label="Text for each place">${f.targets.map(p => `<button type="button" role="tab" class="vs-tab" data-create-tab="${p}" aria-selected="${p === f.platform}">${PLATFORM[p]}<span class="vs-tab-dot ${complete(f, p) ? 'ok' : 'warn'}" aria-hidden="true"></span></button>`).join('')}</div></div>` : '';
    const g3 = group(3, many ? 'Write a title and caption for each place' : 'Write a title and caption', `${aiLine(f)}${tabs}<label class="vs-label">Title${yt ? ' <small>shown as the YouTube video title, up to 100 characters</small>' : f.platform === 'tiktok' ? ' <small>shown as the title of TikTok photo posts (up to 90 characters); videos use only the caption</small>' : ' <small>for the team only, not shown on the post</small>'}<input class="vs-input" id="create-title" ${f.writing ? 'disabled' : ''} maxlength="${yt ? 100 : 180}" value="${esc(f.title)}"></label><label class="vs-label">${yt ? 'Description' : 'Caption'} <small><span id="create-caption-count">${f.caption.length}</span>/2,200</small><textarea class="vs-input" id="create-caption" ${f.writing ? 'disabled' : ''} maxlength="2200" style="min-height:160px">${esc(f.caption)}</textarea></label>${ai?.textConfigured ? '' : '<p class="vs-mini">Need ideas? After saving, open the content and use the Caption assistant.</p>'}${yt && f.tags.length ? `<p class="vs-mini">YouTube tags: ${esc(f.tags.join(', '))}</p>` : ''}`, !f.media.length, 'Available after a photo or video is uploaded.');
    const g4 = group(4, 'When should it go live?', `<div class="vs-stack"><label class="vs-check"><input type="radio" name="create-when" value="review" ${f.when === 'review' ? 'checked' : ''}><span><b>Submit for review</b> · the owner checks it before it is scheduled</span></label><label class="vs-check"><input type="radio" name="create-when" value="scheduled" ${f.when === 'scheduled' ? 'checked' : ''}><span><b>Schedule now</b> · goes live automatically at the chosen time</span></label><label class="vs-check"><input type="radio" name="create-when" value="draft" ${f.when === 'draft' ? 'checked' : ''}><span><b>Save as draft</b> · continue later</span></label>${f.when === 'scheduled' ? f.targets.map(p => { const sc = f.sched[p] || { date: '', time: '09:00', approved: false }; return `<div class="vs-stack">${many ? `<b>${PLATFORM[p]}</b>` : ''}<div class="vs-two"><label class="vs-label">Date<input class="vs-input" type="date" data-create-date="${p}" value="${esc(sc.date)}"></label><label class="vs-label">Time (WIB)<input class="vs-input" type="time" data-create-time="${p}" value="${esc(sc.time)}"></label></div><label class="vs-check"><input type="checkbox" data-create-approved="${p}" ${sc.approved ? 'checked' : ''}><span>I have checked the photo/video and caption${many ? ' for ' + PLATFORM[p] : ''}, and this content may go live.</span></label></div>`; }).join('') + (many ? '<p class="vs-mini">The times are spaced one hour apart so the posts do not all go out at once. Change them as you like; each place needs its own approval.</p>' : '') : ''}</div>`, !f.media.length, 'Available after a photo or video is uploaded.');
    const actions = `${f.error ? `<p class="vs-inline-error" role="alert">${esc(f.error)}</p>` : ''}<div class="vs-actions">${button((f.when === 'scheduled' ? 'Save & schedule' : f.when === 'draft' ? 'Save draft' : 'Save & submit') + (many ? ` (${f.targets.length} posts)` : ''), 'create-submit', 'vs-primary', 'send', ready ? '' : 'disabled')}${button('Start over', 'create-reset', 'vs-text-button')}</div>`;
    const spec = many ? f.targets.map(p => PLATFORM[p]).join(' + ') : format ? formatLabel(f.platform, format) : { youtube: 'YouTube Shorts · 9:16', facebook: 'Facebook Page', tiktok: 'TikTok · 9:16' }[f.platform] || 'Instagram · 4:5 to 1.91:1';
    return `<section class="vs-panel vs-pad vs-stack" id="create-post"><div class="vs-row"><div><span class="vs-eyebrow">CREATE POST</span><h2>Upload, write, then choose when it goes live.</h2></div><span class="vs-status">${esc(spec)}</span></div><p class="vs-sub">The preview on the right updates as you type. Content is only saved when you press Save.</p><div class="smart-layout vs-create-layout"><div class="vs-stack vs-create-form">${g1}${g2}${g3}${g4}${actions}</div><div id="create-preview" class="smart-design-result vs-create-preview" aria-label="Preview">${preview(f)}</div></div></section>`;
  }

  // Blog: the platform choice stays on top, the article editor (with its own preview) takes over below.
  function blogCreate() {
    return `<section class="vs-panel vs-pad vs-stack" id="create-post"><div class="vs-row"><div><span class="vs-eyebrow">CREATE POST</span><h2>Where do you want to post?</h2></div></div>${platformChoices()}</section>${ctx.blogEditor()}`;
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
    if (!f.media.length && !f.busy) return `<img class="smart-design-placeholder" src="/brand/icon.svg" alt=""><h3>Your post preview appears here.</h3><p class="vs-mini">Upload a photo or video to see how it will look on ${PLATFORM[f.platform] || 'Instagram'}.</p>`;
    const w = workspace();
    if (f.platform === 'youtube') {
      const channel = w.youtube?.channelTitle || 'YouTube channel';
      const long = f.title.length > 100 ? '<p class="vs-inline-error">YouTube titles are limited to 100 characters.</p>' : '';
      return `<div class="vs-preview-label">YouTube Shorts preview</div><div class="vs-short-card">${mediaPreview(f, 'vs-preview-media vs-preview-short')}<div class="vs-short-meta"><b id="create-pv-title">${esc(f.title) || '<span class="vs-mini">The video title appears here.</span>'}</b><span class="vs-mini">${esc(channel)}</span><p id="create-pv-caption" class="vs-preview-caption">${captionPreview(f)}</p></div></div>${long}`;
    }
    const user = accountName(f.platform), vertical = f.platform === 'tiktok' && f.media[0]?.mime === 'video/mp4';
    return `<div class="vs-preview-label">${PLATFORM[f.platform] || 'Instagram'} preview</div><article class="vs-ig-card"><header><img src="/brand/icon.svg" alt=""><b>${esc(user)}</b></header>${mediaPreview(f, vertical ? 'vs-preview-media vs-preview-short' : 'vs-preview-media')}<div class="vs-ig-icons">${icon('heart')}${icon('message-circle')}${icon('send')}<span></span>${icon('bookmark')}</div><p id="create-pv-caption" class="vs-preview-caption"><b>${esc(user)}</b> ${captionPreview(f)}</p></article>`;
  }
  // Typing only refreshes the preview text, so focus and video playback are not disturbed.
  function refreshPreviewText() {
    const root = ctx.root(), title = root.querySelector('#create-pv-title'), caption = root.querySelector('#create-pv-caption');
    if (title) title.innerHTML = esc(flow.title) || '<span class="vs-mini">The video title appears here.</span>';
    if (caption) caption.innerHTML = flow.platform === 'youtube' ? captionPreview(flow) : `<b>${esc(accountName(flow.platform))}</b> ${captionPreview(flow)}`;
  }

  async function upload(files) {
    const form = new FormData();
    for (const file of files) form.append('files', file);
    flow.busy = true; flow.error = ''; ctx.render();
    flow.note = '';
    try {
      const data = await api('/api/media', 'POST', form); flow.media = data.media || []; flow.slide = 0;
      // Places that cannot take these files (a photo for YouTube) are dropped, with a note.
      const keep = flow.targets.filter(p => compatible(p, flow.media));
      if (keep.length && keep.length < flow.targets.length) { flow.note = flow.targets.filter(p => !keep.includes(p)).map(p => PLATFORM[p]).join(', ') + ' was removed because these files do not fit there.'; flow.targets = keep; if (!keep.includes(flow.platform)) activate(flow, keep[0]); }
    }
    catch (error) { flow.media = []; toast(error.message, true); }
    finally { flow.busy = false; ctx.render(); }
    if (ai?.textConfigured && flow.targets.some(p => formatFor(p, flow.media))) await write(false);
  }
  // The AI endpoint allows one request every few seconds; wait and retry instead of failing.
  async function withRetry(call) {
    for (let attempt = 0; ; attempt++) {
      try { return await call(); }
      catch (e) { if (attempt < 4 && /Tunggu beberapa detik|sedang berjalan|a few seconds|in progress|already running/i.test(e.message || '')) { await new Promise(r => setTimeout(r, 6000)); continue; } throw e; }
    }
  }
  // Asks the AI for a title and caption, one request per place (each platform has its own style). Text the user already typed
  // is kept unless they ask to rewrite; `only` rewrites just the open place.
  async function write(force, only = null) {
    const f = flow; if (f.writing || !f.media.length) return;
    f.writing = true; f.aiError = ''; f.aiWarnings = []; ctx.render();
    try {
      for (const p of only ? [only] : f.targets) {
        if (!formatFor(p, f.media)) continue;
        const cur = textOf(f, p);
        if (!force && String(cur.title).trim() && String(cur.caption).trim()) continue;
        const d = await withRetry(() => api('/api/assistant/draft', 'POST', { platform: p, mediaIds: f.media.map(m => m.id) }));
        if (flow !== f) return; // the user started over meanwhile
        const next = { title: force || !String(cur.title).trim() ? d.title : cur.title, caption: force || !String(cur.caption).trim() ? d.caption : cur.caption, tags: force || !(cur.tags || []).length ? (d.tags || []) : cur.tags, written: true };
        if (p === f.platform) { f.title = next.title; f.caption = next.caption; f.tags = next.tags; f.written = true; f.aiWarnings = d.warnings || []; } else f.drafts[p] = next;
      }
    } catch (error) { if (flow === f) f.aiError = error.message; }
    finally { if (flow === f) { f.writing = false; ctx.render(); } }
  }
  function aiLine(f) {
    if (ai && !ai.textConfigured) return ['owner','admin'].includes(user().role) ? `<div class="vs-alert warning"><span>Connect Gemini so the title and caption fill in automatically after upload.</span>${button('Set up Gemini', 'nav:ai-settings')}</div>` : '';
    if (!ai) return '';
    if (f.writing) return '<p class="vs-ai-note" role="status">AI is looking at the media and writing the titles and captions…</p>';
    const again = button(f.written ? 'Rewrite with AI' : 'Write with AI', 'create-ai', 'vs-text-button', 'sparkles');
    if (f.aiError) return `<div class="vs-alert warning" role="alert"><span>${esc(f.aiError)}</span>${again}</div>`;
    if (f.written) return `<div class="vs-ai-note"><span>Written automatically by AI. Check and edit it as needed before saving.</span>${again}</div>${f.aiWarnings.length ? `<ul class="vs-help-list">${f.aiWarnings.map(w => `<li>${esc(w)}</li>`).join('')}</ul>` : ''}`;
    return `<div class="vs-ai-note"><span>${f.targets.length > 1 ? 'AI can write a separate title and caption for each place from this media.' : 'AI can write a title and caption from this media.'}</span>${again}</div>`;
  }
  const LIBRARY = { instagram: 'library', youtube: 'youtube-library', facebook: 'facebook-library', tiktok: 'tiktok-library' };
  // Creates one post per ticked place (linked by a shared group id). Places that fail stay in the form so they can be retried
  // without creating the others twice.
  async function submit() {
    const f = flow; if (!canSubmit(f)) return;
    syncActive(f); f.busy = true; f.error = ''; ctx.render();
    const group = f.targets.length > 1 ? 'G' + Math.random().toString(16).slice(2, 10) : undefined, done = [], failed = [], warnings = [];
    for (const p of f.targets) {
      const t = textOf(f, p), sc = f.sched[p] || {};
      let item;
      try { item = await api('/api/posts', 'POST', { format: formatFor(p, f.media), platform: p, ...(group ? { group } : {}), title: t.title.trim(), caption: t.caption, mediaIds: f.media.map(m => m.id), ...(p === 'youtube' && (t.tags || []).length ? { tags: t.tags } : {}) }); }
      catch (error) { failed.push({ p, message: error.message }); continue; }
      done.push({ p, id: item.id });
      if (f.when !== 'draft') {
        try { item = await api('/api/posts/' + encodeURIComponent(item.id), 'PUT', { revision: item.revision, intent: f.when, approved: f.when === 'scheduled' && !!sc.approved, title: item.title, caption: item.caption, alt: item.alt || '', mediaIds: item.mediaIds, category: item.category, goal: item.goal, coverId: null, coverTime: null, date: f.when === 'scheduled' ? sc.date : item.date, time: f.when === 'scheduled' ? sc.time : item.time }); }
        catch (error) { warnings.push(`${PLATFORM[p]} (${item.id}) was saved as a draft but could not be ${f.when === 'scheduled' ? 'scheduled' : 'submitted'}: ${error.message}`); }
      }
    }
    const verb = f.when === 'scheduled' ? 'scheduled' : f.when === 'draft' ? 'saved as a draft' : 'submitted for review';
    if (done.length) await ctx.reload();
    if (!failed.length) {
      const first = done[0].p; reset();
      toast(done.length > 1 ? `${done.length} posts ${verb}: ${done.map(d => d.id).join(', ')}.` : `Post ${verb}.`, warnings.length > 0);
      if (warnings.length) toast(warnings.join(' '), true);
      ctx.navigate(LIBRARY[first] || 'library'); return;
    }
    f.targets = f.targets.filter(p => failed.some(x => x.p === p)); if (!f.targets.includes(f.platform)) activate(f, f.targets[0]);
    f.busy = false; f.error = failed.map(x => `${PLATFORM[x.p]}: ${x.message}`).join(' · ') + (done.length ? ` · Already ${verb}: ${done.map(d => d.id).join(', ')}.` : '');
    if (done.length) toast(`${done.map(d => d.id).join(', ')} ${verb}. The rest need another try.`);
    ctx.render();
  }
  function bind() {
    const root = ctx.root();
    if (ai === null && root.querySelector('#create-post')) { ai = false; api('/api/assistant').then(d => { ai = d.status || { textConfigured: false }; ctx.render(); }).catch(() => { ai = { textConfigured: false }; }); }
    root.querySelectorAll('[data-create-platform]').forEach(el => el.addEventListener('click', () => {
      const id = el.dataset.createPlatform;
      if (id === 'blog') { if (flow.platform !== 'blog') { syncActive(flow); flow.platform = 'blog'; flow.media = []; flow.slide = 0; flow.note = ''; } }
      else if (flow.platform === 'blog') { flow.targets = [id]; flow.platform = id; loadDraft(flow, id); flow.media = []; flow.slide = 0; flow.note = ''; }
      else toggleTarget(id);
      ctx.render();
    }));
    root.querySelectorAll('[data-create-tab]').forEach(el => el.addEventListener('click', () => { if (el.dataset.createTab !== flow.platform) { activate(flow, el.dataset.createTab); ctx.render(); } }));
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
    root.querySelectorAll('[name="create-when"]').forEach(el => el.addEventListener('change', () => { flow.when = el.value; if (flow.when === 'scheduled') defaultSchedule(flow); ctx.render(); }));
    const sched = p => flow.sched[p] || (flow.sched[p] = { date: '', time: '09:00', approved: false });
    root.querySelectorAll('[data-create-date]').forEach(el => el.addEventListener('input', e => { sched(el.dataset.createDate).date = e.target.value; refreshSubmit(); }));
    root.querySelectorAll('[data-create-time]').forEach(el => el.addEventListener('input', e => { sched(el.dataset.createTime).time = e.target.value; refreshSubmit(); }));
    root.querySelectorAll('[data-create-approved]').forEach(el => el.addEventListener('change', e => { sched(el.dataset.createApproved).approved = e.target.checked; refreshSubmit(); }));
  }
  // Keeps only files the chosen platform accepts; YouTube takes a single MP4.
  function dropped(list) {
    const yt = flow.targets.length === 1 && flow.targets[0] === 'youtube';
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
    if (name === 'create-ai') { await (flow.written ? write(true, flow.platform) : write(false)); return true; }
    if (name === 'create-more') { flow.more = !flow.more; refreshPreviewText(); return true; }
    if (name === 'create-slide-prev' || name === 'create-slide-next') { flow.slide = Math.max(0, Math.min(flow.media.length - 1, flow.slide + (name.endsWith('next') ? 1 : -1))); ctx.render(); return true; }
    return false;
  }
  return { homePage, createPage, problemAlerts, bind, action, resetCreate: reset };
}
