// Blog page (articles published to Sanity.io) and the Sanity connection panel for Settings.
import { tabbed, resetTab } from './tabs.js';
import { planSchedule } from './package-parse.js';
import { markdownToPortableText, portableTextToHtml, slugify, readingMinutes } from './portable-text.js';

const DAY = 86400000;
const WEEKDAYS = [[1, 'Mon'], [2, 'Tue'], [3, 'Wed'], [4, 'Thu'], [5, 'Fri'], [6, 'Sat'], [0, 'Sun']];
const STATUS = { draft: ['Draft', ''], review: ['Needs review', 'review'], scheduled: ['Scheduled', 'scheduled'], publishing: ['Processing', ''], published: ['Published', 'published'], failed: ['Failed', 'failed'] };
const wibDate = ms => new Date(ms + 7 * 3600000).toISOString().slice(0, 10);
const FIELD_LABELS = { title: 'Title', slug: 'Slug', excerpt: 'Summary', body: 'Article body', mainImage: 'Main image', publishedAt: 'Publish date', seoTitle: 'SEO title', seoDescription: 'SEO description', categories: 'Category', author: 'Author' };

export function createBlogViews(ctx) {
  const { api, esc, button, toast } = ctx;
  const workspace = () => ctx.getWorkspace(), user = () => ctx.getUser(), owner = () => ['owner','admin'].includes(user().role);
  const icon = name => (ctx.icon ? ctx.icon(name) : '');
  let st, autoSynced = false;
  const fresh = () => ({ mode: 'list', a: null, slugTouched: false, when: 'review', date: '', time: '07:00', approved: false, busy: false, error: '', ai: { topic: '', keyword: '', notes: '', busy: false, error: '', warnings: [] }, uploading: false, generating: false, checking: false, check: null });
  st = fresh();
  const sanity = () => workspace().sanity || { configured: false, fields: {}, check: null };
  const articles = () => workspace().blog || [];
  const siteUrl = () => (sanity().siteUrl || 'https://vayora.id') + (sanity().blogPath || '/blog/');
  const blank = () => ({ id: '', revision: 0, status: 'draft', title: '', slug: '', excerpt: '', seoTitle: '', seoDescription: '', category: '', body: '', heroMediaId: null, hero: null, heroAlt: '', error: '', url: '' });

  // ---------- alerts used by the home page ----------
  function problemAlerts() {
    const list = [], a = articles(), failed = a.filter(x => x.status === 'failed').length, scheduled = a.filter(x => x.status === 'scheduled').length;
    if (failed) list.push({ level: 'danger', text: `${failed} blog articles failed to publish. Open Blog to see why.`, action: ['Open Blog', 'nav:blog'] });
    if (scheduled && !sanity().configured) list.push({ level: 'danger', text: 'A blog article is scheduled, but Sanity is not connected.', action: owner() ? ['Open connections', 'nav:settings'] : null });
    return list;
  }

  // ---------- list ----------
  // List state survives opening and closing the editor: filter, search, the selection and the schedule planner.
  const view = { filter: 'all', query: '', selected: new Set(), plan: null };
  const FILTERS = [['all', 'All'], ['draft', 'Draft'], ['review', 'In review'], ['scheduled', 'Scheduled'], ['published', 'Published'], ['failed', 'Failed']];
  const SCHEDULABLE = ['draft', 'review', 'failed', 'scheduled'];
  const canDelete = x => x.status !== 'published' || owner();
  const byId = (a, b) => a.localeCompare(b, undefined, { numeric: true });
  const shownArticles = () => {
    const q = view.query.trim().toLowerCase();
    return articles().filter(x => (view.filter === 'all' || x.status === view.filter) && (!q || `${x.title} ${x.slug} ${x.id}`.toLowerCase().includes(q))).slice().reverse();
  };

  // Free slots for `ids` on the chosen weekdays and times (WIB), skipping times other scheduled articles already use.
  function planSlots() {
    const p = view.plan, ids = [...view.selected].filter(id => SCHEDULABLE.includes(articles().find(x => x.id === id)?.status)).sort(byId);
    const taken = articles().filter(x => x.status === 'scheduled' && x.scheduleAt && !ids.includes(x.id)).map(x => x.scheduleAt);
    const fixed = ids.map(id => p.override[id] || null);
    const slots = planSchedule(ids.length, { start: p.start, days: p.days, times: p.times.split(/[,\s]+/), taken, fixed });
    return ids.map((id, i) => ({ id, slot: slots[i], title: articles().find(x => x.id === id)?.title || id }));
  }

  function plannerPanel() {
    const p = view.plan, rows = planSlots(), skipped = view.selected.size - rows.length;
    const days = WEEKDAYS.map(([d, label]) => `<label class="vs-check vs-day"><input type="checkbox" data-blog-day="${d}" ${p.days.includes(d) ? 'checked' : ''}><span>${label}</span></label>`).join('');
    const table = rows.map(({ id, slot, title }) => `<tr><td>${esc(id)}</td><td data-user-content>${esc(title)}</td><td class="vs-pkg-when">${slot ? `<input class="vs-input" type="date" data-blog-plan-date="${id}" value="${slot.date}" ${p.busy ? 'disabled' : ''}><input class="vs-input" type="time" data-blog-plan-time="${id}" value="${slot.time}" ${p.busy ? 'disabled' : ''}>` : '—'}</td><td>${p.results?.[id] ? (p.results[id] === 'ok' ? '<span class="vs-status scheduled">Scheduled</span>' : `<small class="vs-inline-error">${esc(p.results[id])}</small>`) : ''}</td></tr>`).join('');
    return `<section class="vs-panel vs-pad vs-stack" id="blog-planner"><div class="vs-row"><h2>Schedule ${rows.length} article${rows.length === 1 ? '' : 's'}</h2>${button('Close', 'blog-plan-close', 'vs-text-button')}</div>
<div class="vs-two"><label class="vs-label">Start date<input class="vs-input" type="date" id="blog-plan-start" value="${esc(p.start)}"></label><label class="vs-label">Publish time (WIB)<input class="vs-input" id="blog-plan-times" value="${esc(p.times)}" placeholder="07:00, 12:00"><small>Separate with commas for more than one time per day.</small></label></div>
<div><span class="vs-label">Publish days</span><div class="vs-day-row">${days}</div></div>
${skipped > 0 ? `<p class="vs-mini">${skipped} selected article${skipped === 1 ? ' is' : 's are'} already published and cannot be scheduled.</p>` : ''}
${rows.length ? `<div class="vs-table-wrap"><table class="vs-pkg-table"><thead><tr><th>ID</th><th>Title</th><th>Publish (WIB)</th><th></th></tr></thead><tbody>${table}</tbody></table></div>
<label class="vs-check"><input type="checkbox" id="blog-plan-approved" ${p.approved ? 'checked' : ''}><span>I have checked these articles (text, image and alt text), and they may go live on schedule.</span></label>
<div class="vs-actions">${button(p.busy ? 'Scheduling…' : `Schedule ${rows.length}`, 'blog-plan-apply', 'vs-primary', 'calendar-clock', !p.approved || p.busy ? 'disabled' : '')}</div>
<p class="vs-mini">Each article needs a summary, a main image with alt text and a body. Articles that are not complete are reported here and stay as they are.</p>` : ''}</section>`;
  }

  function listPage() {
    const a = articles(), s = sanity(), shown = shownArticles();
    view.selected = new Set([...view.selected].filter(id => a.some(x => x.id === id)));
    const count = k => k === 'all' ? a.length : a.filter(x => x.status === k).length;
    const chips = `<div class="vs-quick-filters" role="group" aria-label="Filter articles">${FILTERS.map(([id, label]) => `<button type="button" data-action="blog-filter:${id}" aria-pressed="${view.filter === id}">${label}<span>${count(id)}</span></button>`).join('')}</div>`;
    const allShown = shown.length > 0 && shown.every(x => view.selected.has(x.id));
    const toolbar = `<div class="vs-blog-toolbar"><label class="vs-search-field">${icon('search')}<input class="vs-input" id="blog-search" type="search" maxlength="200" placeholder="Search title, slug or ID" value="${esc(view.query)}" aria-label="Search articles"></label><label class="vs-check vs-blog-all"><input type="checkbox" id="blog-select-all" ${allShown ? 'checked' : ''} ${shown.length ? '' : 'disabled'}><span>Select all</span></label></div>`;
    const bulk = view.selected.size ? `<div class="vs-blog-bulk" role="region" aria-label="Selected articles"><strong>${view.selected.size} selected</strong><div class="vs-actions">${button('Schedule…', 'blog-plan-open', 'vs-primary', 'calendar-clock')}${button('Clear', 'blog-clear', 'vs-text-button')}<span class="vs-blog-danger-zone">${button('', 'blog-remove-selected', 'vs-icon-button vs-danger', 'trash-2', 'aria-label="Delete selected articles" title="Delete selected articles"')}</span></div></div>` : '';
    const row = x => `<div class="vs-record vs-blog-row"><label class="vs-blog-pick"><input type="checkbox" data-blog-pick="${esc(x.id)}" ${view.selected.has(x.id) ? 'checked' : ''} ${canDelete(x) || SCHEDULABLE.includes(x.status) ? '' : 'disabled'} aria-label="Select ${esc(x.title)}"></label><div class="vs-record-copy"><h3 data-user-content>${esc(x.title)}</h3><span class="vs-mini">${esc(x.id)} · /${esc(x.slug)} · ${x.minutes} min read${x.source === 'sanity' ? ' · from Sanity' : ''}${x.scheduleAt ? ' · ' + esc(ctx.stamp(x.scheduleAt)) : x.publishedAt ? ' · ' + esc(ctx.stamp(x.publishedAt)) : ''}</span>${x.status === 'failed' && x.error ? `<small class="vs-inline-error">${esc(x.error)}</small>` : ''}${x.status === 'published' && x.categoryMissing ? '<small class="vs-mini">The category was not found in Sanity, so it was not attached.</small>' : ''}</div><span class="vs-status ${STATUS[x.status]?.[1] || ''}">${STATUS[x.status]?.[0] || x.status}</span><div class="vs-blog-actions">${x.status === 'published' && x.url && !x.sanityDraft ? `<a class="vs-button" href="${esc(x.url)}" target="_blank" rel="noopener noreferrer">View article</a>` : ''}${SCHEDULABLE.includes(x.status) ? button('', 'blog-plan-one:' + x.id, 'vs-icon-button', 'calendar-clock', 'aria-label="Schedule" title="Schedule"') : ''}${button('Open', 'blog-open:' + x.id)}${canDelete(x) ? `<span class="vs-blog-danger-zone">${button('', 'blog-remove:' + x.id, 'vs-icon-button vs-danger', 'trash-2', 'aria-label="Delete article" title="Delete article"')}</span>` : ''}</div></div>`;
    const connect = s.configured ? '' : `<div class="vs-alert warning"><span>${owner() ? 'Sanity is not connected. Articles can still be written and saved, but they only go live once Sanity is connected.' : 'Sanity is not connected. Ask the workspace owner to connect it so articles can go live.'}</span>${owner() ? button('Connect Sanity', 'nav:settings') : ''}</div>`;
    return `<section class="vs-panel vs-pad vs-stack"><div class="vs-row"><div><span class="vs-eyebrow">BLOG</span><h2>Write and schedule articles for vayora.id/blog.</h2></div>${button('New article', 'blog-new', 'vs-primary', 'circle-plus')}</div>${connect}${chips}</section>
${view.plan ? plannerPanel() : ''}
<section class="vs-panel"><div class="vs-panel-head"><h2>Articles</h2>${button(st.syncing ? 'Syncing…' : 'Sync from Sanity', 'blog-sync', 'vs-text-button', 'refresh-cw', st.syncing ? 'disabled' : '')}${owner() ? button('Import from files', 'nav:import', 'vs-text-button', 'upload') : ''}</div>${toolbar}${bulk}<div class="vs-list">${shown.map(row).join('') || `<div class="vs-empty"><h3>${a.length ? 'No articles match this filter.' : 'No articles yet.'}</h3><p>${a.length ? 'Try another filter or clear the search.' : 'Click New article, or import Markdown articles from Import content.'}</p></div>`}</div></section>`;
  }

  // Articles waiting in the publishing queue, for the Queue page.
  function queuePanel() {
    const items = articles().filter(x => ['scheduled', 'publishing', 'failed'].includes(x.status)).sort((a, b) => String(a.scheduleAt || '').localeCompare(String(b.scheduleAt || '')));
    if (!items.length) return '';
    return `<section class="vs-panel"><div class="vs-panel-head"><h2>Blog articles</h2></div><div class="vs-list">${items.map(x => `<div class="vs-record"><div class="vs-record-copy"><h3 data-user-content>${esc(x.title)}</h3><span class="vs-mini">Blog · ${esc(x.id)}${x.scheduleAt ? ' · ' + esc(ctx.stamp(x.scheduleAt)) : ''}</span>${x.status === 'failed' && x.error ? `<small class="vs-inline-error">${esc(x.error)}</small>` : ''}</div><span class="vs-status ${STATUS[x.status]?.[1] || ''}">${STATUS[x.status]?.[0] || x.status}</span><div class="vs-actions">${button('Open', 'blog-edit-from-queue:' + x.id)}</div></div>`).join('')}</div></section>`;
  }

  // ---------- editor ----------
  function previewHTML() {
    const a = st.a, { blocks } = markdownToPortableText(a.body || '', { keyPrefix: 'p' });
    const minutes = readingMinutes(a.body || '');
    return `<div class="vs-preview-label">Article preview</div><article class="vs-blog-preview">${a.hero ? `<img class="vs-blog-hero" src="${esc(a.hero.url)}" alt="${esc(a.heroAlt)}">` : '<div class="vs-blog-hero vs-blog-hero-empty">Main image</div>'}<h1 data-user-content>${esc(a.title) || '<span class="vs-mini">The article title appears here.</span>'}</h1><p class="vs-mini">${a.category ? esc(a.category) + ' · ' : ''}${minutes} min read</p>${a.excerpt ? `<p class="vs-blog-lead">${esc(a.excerpt)}</p>` : ''}<div class="vs-blog-body" data-user-content>${portableTextToHtml(blocks) || '<p class="vs-mini">The article body appears here.</p>'}</div></article>`;
  }
  function editPage() {
    const a = st.a, s = sanity(), published = a.status === 'published', live = workspace().settings?.publishingEnabled;
    const busy = st.busy || st.ai.busy || st.uploading || st.generating, tableNote = /^\s*\|.*\|\s*$/m.test(a.body) ? '<p class="vs-mini">Tables are sent to Sanity as bullet points because the blog only supports text, headings, lists, quotes, and links.</p>' : '';
    const ai = !a.body.trim() ? `<details class="vs-blog-ai" ${st.ai.busy || st.ai.error ? 'open' : ''}><summary>${icon('sparkles')} Write a draft with AI</summary><div class="vs-stack"><label class="vs-label">Article topic<input class="vs-input" id="blog-ai-topic" maxlength="300" value="${esc(st.ai.topic)}" placeholder="Example: how to calculate villa occupancy over the Christmas holidays"></label><div class="vs-two"><label class="vs-label">Main keyword<input class="vs-input" id="blog-ai-keyword" maxlength="120" value="${esc(st.ai.keyword)}"></label><label class="vs-label">Notes <small>optional</small><input class="vs-input" id="blog-ai-notes" maxlength="1200" value="${esc(st.ai.notes)}"></label></div>${st.ai.error ? `<p class="vs-inline-error" role="alert">${esc(st.ai.error)}</p>` : ''}${st.ai.busy ? '<p class="vs-ai-note" role="status">AI is writing the article… usually 20–60 seconds.</p>' : button('Write draft', 'blog-ai', 'vs-primary', 'sparkles', busy ? 'disabled' : '')}</div></details>` : (st.ai.warnings.length ? `<div class="vs-alert warning"><span>Notes from the AI:${esc(st.ai.warnings.join(' · '))}</span></div>` : '');
    const when = published ? `<p class="vs-sub">The article is already published. New changes are sent to Sanity when you press <b>Update in Sanity</b>.</p>` : `<div class="vs-stack"><label class="vs-check"><input type="radio" name="blog-when" value="review" ${st.when === 'review' ? 'checked' : ''}><span><b>Submit for review</b> · the owner checks it first</span></label><label class="vs-check"><input type="radio" name="blog-when" value="scheduled" ${st.when === 'scheduled' ? 'checked' : ''}><span><b>Schedule</b> · published to Sanity automatically at the chosen time</span></label><label class="vs-check"><input type="radio" name="blog-when" value="draft" ${st.when === 'draft' ? 'checked' : ''}><span><b>Save as draft</b></span></label>${st.when === 'scheduled' ? `<div class="vs-two"><label class="vs-label">Date<input class="vs-input" type="date" id="blog-date" value="${esc(st.date)}"></label><label class="vs-label">Time (WIB)<input class="vs-input" type="time" id="blog-time" value="${esc(st.time)}"></label></div><div class="vs-actions">${button('Suggest the next free time', 'blog-suggest-time', 'vs-text-button', 'wand-sparkles')}</div><p class="vs-mini">Suggestions use Monday, Wednesday and Friday at 07:00 WIB and skip times other articles already use.</p>` : ''}</div>`;
    const approve = (st.when === 'scheduled' || published || a.status !== 'published') && (st.when === 'scheduled' || published) ? `<label class="vs-check"><input type="checkbox" id="blog-approved" ${st.approved ? 'checked' : ''}><span>I have checked the title, body, and image, and this article may be published.</span></label>` : '';
    const label = published ? 'Save changes' : st.when === 'scheduled' ? 'Save & schedule' : st.when === 'draft' ? 'Save draft' : 'Save & submit';
    const canPublish = s.configured && live && st.approved;
    return `<section class="vs-panel vs-pad vs-stack" id="blog-editor"><div class="vs-row"><div><span class="vs-eyebrow">${a.id ? esc(a.id) : 'NEW ARTICLE'}</span><h2>${a.id ? 'Edit article' : 'Write a new article'}</h2></div><span class="vs-status ${STATUS[a.status]?.[1] || ''}">${STATUS[a.status]?.[0] || ''}</span></div>${a.status === 'failed' && a.error ? `<div class="vs-alert danger" role="alert"><span>${esc(a.error)}</span></div>` : ''}
<div class="smart-layout vs-create-layout"><div class="vs-stack vs-create-form">${tabbed('blog-editor', `${ai}
<!--tab:details--><fieldset class="vs-create-group"><legend><span class="vs-step-number">1</span>Title and address</legend><label class="vs-label">Title<input class="vs-input" id="blog-title" maxlength="200" value="${esc(a.title)}"></label><label class="vs-label">Slug <small>article address${a.source === 'sanity' ? ' · cannot be changed because it is already live' : ''}</small><input class="vs-input" id="blog-slug" maxlength="96" value="${esc(a.slug)}" ${a.source === 'sanity' ? 'disabled' : ''}><small id="blog-url">${esc(siteUrl())}${esc(a.slug || '…')}</small></label><label class="vs-label">Summary <small><span id="blog-excerpt-count">${a.excerpt.length}</span> characters · ideal 130–160</small><textarea class="vs-input" id="blog-excerpt" maxlength="400" style="min-height:80px">${esc(a.excerpt)}</textarea></label><div class="vs-two"><label class="vs-label">Category<input class="vs-input" id="blog-category" maxlength="80" value="${esc(a.category)}"><small>Attached when a category with the same title exists in Sanity.</small></label><label class="vs-label">SEO title <small>optional</small><input class="vs-input" id="blog-seo-title" maxlength="140" value="${esc(a.seoTitle)}"></label></div></fieldset>
<fieldset class="vs-create-group"><legend><span class="vs-step-number">2</span>Main image</legend><label class="vs-dropzone" id="blog-drop">${icon('upload')}<b>${a.hero ? 'Replace image: drag & drop here' : 'Drag & drop an image here'}</b><span>or click to choose · JPG, PNG, or WebP, ideally 16:9</span><input class="sr-only" type="file" id="blog-hero" accept="image/jpeg,image/png,image/webp" aria-label="Choose the main image"></label>${st.uploading ? '<p class="vs-mini" role="status">Uploading…</p>' : ''}${a.hero ? `<p class="vs-mini">${esc(a.hero.name)}${a.hero.width ? ` · ${a.hero.width}×${a.hero.height}` : ''}</p>` : ''}<label class="vs-label">Image alt text<input class="vs-input" id="blog-alt" maxlength="400" value="${esc(a.heroAlt)}"></label><label class="vs-label">Image prompt <small>optional · describes the picture for AI generation</small><textarea class="vs-input" id="blog-hero-prompt" maxlength="1500" style="min-height:70px">${esc(a.heroPrompt || '')}</textarea></label><div class="vs-actions">${button(st.generating ? 'Generating…' : 'Generate with AI', 'blog-hero-ai', '', 'sparkles', busy ? 'disabled' : '')}</div>${st.generating ? '<p class="vs-ai-note" role="status">AI is creating the image… usually 10–30 seconds.</p>' : ''}</fieldset>
<!--tab:body--><fieldset class="vs-create-group"><legend><span class="vs-step-number">3</span>Article body</legend><label class="vs-label">Markdown <small><span id="blog-words">${(a.body.match(/\S+/g) || []).length}</span> words · <span id="blog-minutes">${readingMinutes(a.body)}</span> min read</small><textarea class="vs-input vs-blog-textarea" id="blog-body" ${st.ai.busy ? 'disabled' : ''} spellcheck="true">${esc(a.body)}</textarea></label><p class="vs-mini">Use ### for section headings, **bold**, *italic*, [links](https://…), lists, and &gt; quotes.</p>${tableNote}<details><summary>SEO description</summary><label class="vs-label">Meta description <small>empty = uses the summary</small><textarea class="vs-input" id="blog-seo-desc" maxlength="300" style="min-height:70px">${esc(a.seoDescription)}</textarea></label></details></fieldset>
<!--tab:publish--><fieldset class="vs-create-group"><legend><span class="vs-step-number">4</span>When should it be published?</legend>${when}${approve}</fieldset><!--/tabs-->
${st.error ? `<p class="vs-inline-error" role="alert">${esc(st.error)}</p>` : ''}<div class="vs-actions">${button(st.busy ? 'Saving…' : label, 'blog-save', 'vs-primary', 'save', !a.title.trim() || busy || (st.when === 'scheduled' && !published && !st.approved) ? 'disabled' : '')}${(published || a.id) && (s.configured && live) ? button(published ? 'Update in Sanity' : 'Publish now', 'blog-publish', '', 'send', !canPublish || busy ? 'disabled' : '') : ''}${button('Back to list', 'blog-back', 'vs-text-button')}${a.id ? button('Delete', 'blog-delete', 'vs-text-button vs-danger') : ''}</div>${a.id && !(s.configured && live) ? `<p class="vs-mini">${s.configured ? 'Turn on real publishing in Connections & publishing so articles can be sent to Sanity.' : 'Connect Sanity so articles can be sent.'}</p>` : ''}${published && a.url ? `<p class="vs-mini">${a.sanityDraft ? 'Sent to Sanity as a draft (not live yet). ' : ''}Address: <a href="${esc(a.url)}" target="_blank" rel="noopener noreferrer">${esc(a.url)}</a></p>` : ''}`, [{ id: 'details', label: 'Details & image' }, { id: 'body', label: 'Article body' }, { id: 'publish', label: 'Schedule & publish' }])}</div>
<div id="blog-preview" class="smart-design-result vs-create-preview vs-blog-preview-box" aria-label="Preview">${previewHTML()}</div></div></section>`;
  }

  const onCreatePage = () => ctx.getView?.() === 'create';
  // The blog editor as the body of Create post: a new, unsaved article unless one is already being written.
  function embeddedEditor() {
    if (!(st.mode === 'edit' && st.a && !st.a.id)) { resetTab('blog-editor'); st = { ...fresh(), mode: 'edit', a: blank() }; }
    return editPage();
  }
  function page() { return st.mode === 'edit' ? editPage() : listPage(); }

  // ---------- Pengaturan: Sanity connection ----------
  function settingsPanel() {
    const s = sanity();
    if (!owner()) return '';
    const c = s.check, f = s.fields || {};
    const checkHTML = !c ? '' : c.ok ? `<div class="vs-stack"><p class="vs-mini"><b>Connected.</b> ${c.count} "${esc(s.docType)}" documents in dataset ${esc(s.dataset)} · checked ${esc(ctx.stamp(c.checkedAt))}</p>${c.fields.length ? `<div><span class="vs-mini">Fields on existing articles:</span><div class="smart-chips">${c.fields.map(x => `<span>${esc(x.name)} · ${esc(x.type)}</span>`).join('')}</div></div>` : '<p class="vs-mini">There are no articles in this dataset yet to use as a sample.</p>'}${c.missing?.length ? `<p class="vs-inline-error">These fields are mapped but missing from the sample article: ${esc(c.missing.join(', '))}. Clear their mapping if they are not used.</p>` : ''}</div>` : `<p class="vs-inline-error" role="alert">${esc(c.error || 'Connection failed.')}</p>`;
    const authors = c?.ok && c.authors?.length ? `<label class="vs-label">Author<select class="vs-input" id="sanity-author"><option value="">No author</option>${c.authors.map(x => `<option value="${esc(x.id)}" ${s.authorId === x.id ? 'selected' : ''}>${esc(x.name || x.id)}</option>`).join('')}</select><small>New articles get this author.</small></label>` : `<label class="vs-label">Author ID <small>optional</small><input class="vs-input" id="sanity-author" value="${esc(s.authorId || '')}" maxlength="80"><small>Run Check connection to choose from the list.</small></label>`;
    return `<section class="vs-panel vs-pad vs-stack" id="sanity-panel"><div class="vs-setting"><div><h2>Blog · Sanity.io</h2><p class="vs-sub">${s.configured ? `Project ${esc(s.projectId)} · dataset ${esc(s.dataset)}` : 'Connect Sanity so articles can be published to vayora.id/blog.'}</p></div><span class="vs-status ${s.configured ? (c?.ok === false ? 'failed' : 'scheduled') : 'review'}">${s.configured ? (c?.ok === false ? 'Needs review' : 'Connected') : 'Not connected'}</span></div>
${checkHTML}<form class="vs-stack" id="sanity-form"><div class="vs-two"><label class="vs-label">Project ID<input class="vs-input" id="sanity-project" value="${esc(s.projectId || '5ugtuy3w')}" autocomplete="off" spellcheck="false" maxlength="30"></label><label class="vs-label">Dataset<input class="vs-input" id="sanity-dataset" value="${esc(s.dataset || 'production')}" autocomplete="off" maxlength="64"></label></div><label class="vs-label">API token<input class="vs-input" id="sanity-token" type="password" autocomplete="new-password" placeholder="${s.tokenSet ? 'Leave blank to keep the saved token' : 'sk…'}" maxlength="300"><small>Create one at sanity.io/manage → project → API → Tokens with the <b>Editor</b> role. It is stored encrypted and never shown again. Do not send it over chat.</small></label><div class="vs-two"><label class="vs-label">Publish mode<select class="vs-input" id="sanity-mode"><option value="published" ${s.publishMode !== 'draft' ? 'selected' : ''}>Publish immediately</option><option value="draft" ${s.publishMode === 'draft' ? 'selected' : ''}>Send as a Sanity draft (review in Studio first)</option></select></label>${authors}</div>
<details><summary>Field mapping & advanced</summary><div class="vs-stack"><div class="vs-two"><label class="vs-label">Document type<input class="vs-input" id="sanity-doctype" value="${esc(s.docType)}" maxlength="64"></label><label class="vs-label">Category type<input class="vs-input" id="sanity-cattype" value="${esc(s.categoryType)}" maxlength="64"><small>Leave empty if articles do not use categories.</small></label></div><div class="vs-two"><label class="vs-label">Site address<input class="vs-input" id="sanity-site" value="${esc(s.siteUrl)}" maxlength="200"></label><label class="vs-label">Blog path<input class="vs-input" id="sanity-path" value="${esc(s.blogPath)}" maxlength="80"></label></div><p class="vs-mini">Field names in Sanity for each part of the article. Leave empty to not send that part.</p><div class="vs-pkg-map">${Object.keys(FIELD_LABELS).map(k => `<label class="vs-label">${FIELD_LABELS[k]}<input class="vs-input" data-sanity-field="${k}" value="${esc(f[k] ?? '')}" maxlength="64"></label>`).join('')}</div><label class="vs-label">Extra fields <small>JSON, optional</small><textarea class="vs-input" id="sanity-extra" style="min-height:70px" spellcheck="false">${esc(Object.keys(s.extraFields || {}).length ? JSON.stringify(s.extraFields, null, 2) : '')}</textarea><small>Sent as-is with every article, e.g. {"featured": false}.</small></label></div></details>
<div class="vs-actions"><button class="vs-button vs-primary" type="submit">Save Sanity connection</button>${s.configured ? button(st.checking ? 'Checking…' : 'Check connection', 'blog-check', '', 'refresh-cw', st.checking ? 'disabled' : '') : ''}${s.tokenSet && !s.environmentToken ? button('Remove token', 'blog-remove-token', 'vs-danger') : ''}</div></form></section>`;
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
    if (st.mode === 'list' && !autoSynced && $('[data-action="blog-new"]')) { autoSynced = true; void autoSync(); }
    if (st.mode === 'list') bindList(root);
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
    on('#blog-hero-prompt', 'input', el => { a.heroPrompt = el.value; });
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
      editor.addEventListener('drop', e => { if (!has(e)) return; e.preventDefault(); depth = 0; zone.classList.remove('is-dragging'); const f = [...e.dataTransfer.files].find(x => /^image\/(jpeg|png|webp)$/.test(x.type)); if (f) void upload(f); else toast('Use a JPG, PNG, or WebP image.', true); });
    }
  }

  // Quietly brings in articles published elsewhere (once per page load; the server also rate-limits it).
  async function autoSync() {
    try { const r = await api('/api/blog/sync', 'POST', {}); if (r.added || r.updated) { await ctx.reload(); ctx.render(); } } catch { /* Sanity unreachable: the list simply stays as it is */ }
  }
  const tomorrow = () => wibDate(Date.now() + DAY);
  const openPlanner = () => { view.plan = { start: tomorrow(), days: [1, 3, 5], times: '07:00', approved: false, busy: false, override: {}, results: null }; ctx.render(); setTimeout(() => ctx.root().querySelector('#blog-planner')?.scrollIntoView({ block: 'nearest' }), 0); };
  function bindList(root) {
    const on = (sel, ev, fn) => root.querySelectorAll(sel).forEach(el => el.addEventListener(ev, e => fn(el, e)));
    on('#blog-search', 'input', el => { view.query = el.value; ctx.render(); const box = ctx.root().querySelector('#blog-search'); if (box) { box.focus(); box.setSelectionRange(box.value.length, box.value.length); } });
    on('[data-blog-pick]', 'change', el => { el.checked ? view.selected.add(el.dataset.blogPick) : view.selected.delete(el.dataset.blogPick); ctx.render(); });
    on('#blog-select-all', 'change', el => { for (const x of shownArticles()) el.checked ? view.selected.add(x.id) : view.selected.delete(x.id); ctx.render(); });
    if (!view.plan) return;
    on('#blog-plan-start', 'change', el => { view.plan.start = el.value; view.plan.override = {}; ctx.render(); });
    on('#blog-plan-times', 'change', el => { view.plan.times = el.value; view.plan.override = {}; ctx.render(); });
    on('[data-blog-day]', 'change', el => { const d = Number(el.dataset.blogDay); view.plan.days = el.checked ? [...view.plan.days, d] : view.plan.days.filter(x => x !== d); view.plan.override = {}; ctx.render(); });
    on('[data-blog-plan-date],[data-blog-plan-time]', 'change', el => { const id = el.dataset.blogPlanDate ?? el.dataset.blogPlanTime, date = root.querySelector(`[data-blog-plan-date="${id}"]`).value, time = root.querySelector(`[data-blog-plan-time="${id}"]`).value; if (date && time) view.plan.override[id] = { date, time }; ctx.render(); });
    on('#blog-plan-approved', 'change', el => { view.plan.approved = el.checked; const b = root.querySelector('[data-action="blog-plan-apply"]'); if (b) b.disabled = !el.checked; });
  }
  // Applies the planned slots one article at a time; incomplete articles are reported and left unchanged.
  async function applyPlan() {
    const p = view.plan, rows = planSlots().filter(r => r.slot); p.busy = true; p.results = {}; ctx.render();
    let done = 0;
    for (const { id, slot } of rows) {
      try {
        const art = await api('/api/blog/' + encodeURIComponent(id));
        await api('/api/blog/' + encodeURIComponent(id), 'PUT', { ...payload(art), revision: art.revision, intent: 'scheduled', approved: true, date: slot.date, time: slot.time });
        p.results[id] = 'ok'; done++; view.selected.delete(id);
      } catch (error) { p.results[id] = error.message; }
      ctx.render();
    }
    p.busy = false; p.approved = false; await ctx.reload(); ctx.render();
    toast(`${done} of ${rows.length} article${rows.length === 1 ? '' : 's'} scheduled.`, done < rows.length);
  }
  // Removing only affects Studio. Two confirmations, because it cannot be undone from here.
  function confirmRemove(items, after) {
    const n = items.length, label = n === 1 ? `"${items[0].title}"` : `${n} articles`, kept = items.some(x => x.sanityId) ? ' Documents already in Sanity and the live pages are kept.' : '';
    ctx.ask(`Remove ${label} from Studio?${kept}`, () => ctx.ask(`Are you sure? ${n === 1 ? 'This article' : `These ${n} articles`} will be removed from the Blog list in Studio and cannot be restored here.`, async () => {
      let removed = 0, failed = 0;
      for (const x of items) { try { await api('/api/blog/' + encodeURIComponent(x.id), 'DELETE'); removed++; view.selected.delete(x.id); } catch { failed++; } }
      await ctx.reload(); after?.(); ctx.render();
      toast(failed ? `Removed ${removed}, ${failed} could not be removed.` : `${removed} article${removed === 1 ? '' : 's'} removed from Studio.`, !!failed);
    }, 'Yes, remove'), 'Continue');
  }
  async function saveSanity() {
    const root = ctx.root(), v = s => root.querySelector(s)?.value ?? '';
    const fields = Object.fromEntries([...root.querySelectorAll('[data-sanity-field]')].map(el => [el.dataset.sanityField, el.value.trim()]));
    const body = { projectId: v('#sanity-project'), dataset: v('#sanity-dataset'), publishMode: v('#sanity-mode'), docType: v('#sanity-doctype'), categoryType: v('#sanity-cattype'), siteUrl: v('#sanity-site'), blogPath: v('#sanity-path'), authorId: v('#sanity-author'), fields, extraFields: v('#sanity-extra') };
    if (v('#sanity-token').trim()) body.token = v('#sanity-token').trim();
    await api('/api/sanity/config', 'POST', body); await ctx.reload(); ctx.render();
    toast('Sanity connection saved. Press Check connection to confirm.');
  }

  async function open(id) {
    resetTab('blog-editor');
    const a = await api('/api/blog/' + encodeURIComponent(id));
    st = { ...fresh(), mode: 'edit', a: { ...blank(), ...a }, slugTouched: true, when: a.status === 'scheduled' ? 'scheduled' : a.status === 'draft' || a.status === 'failed' ? 'draft' : 'review', date: a.date || '', time: a.time || '07:00' };
    ctx.render();
  }
  const payload = a => ({ title: a.title.trim(), slug: a.slug.trim(), excerpt: a.excerpt, seoTitle: a.seoTitle, seoDescription: a.seoDescription, category: a.category, body: a.body, heroMediaId: a.heroMediaId, heroAlt: a.heroAlt, heroPrompt: a.heroPrompt || '' });

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
    if (name === 'blog-new') { resetTab('blog-editor'); st = { ...fresh(), mode: 'edit', a: blank() }; ctx.render(); return true; }
    if (name === 'blog-open') { await open(id); return true; }
    if (name === 'blog-back') { st = fresh(); await ctx.reload(); if (onCreatePage()) ctx.navigate('blog'); else ctx.render(); return true; }
    if (name === 'blog-save') {
      st.busy = true; st.error = ''; ctx.render();
      try { const intent = st.a.status === 'published' ? 'published' : st.when; const item = await save(intent); await ctx.reload(); toast(intent === 'scheduled' ? `Article scheduled: ${ctx.stamp(item.scheduleAt)}.` : 'Article saved.'); st.busy = false; if (onCreatePage() || st.when !== 'draft' || st.a.status === 'published') { st = fresh(); } if (onCreatePage()) ctx.navigate('blog'); else ctx.render(); }
      catch (error) { st.busy = false; st.error = error.message; ctx.render(); }
      return true;
    }
    if (name === 'blog-publish') {
      st.busy = true; st.error = ''; ctx.render();
      try { await save(st.a.status === 'published' ? 'published' : 'draft'); const done = await api('/api/blog/' + encodeURIComponent(st.a.id) + '/publish', 'POST', { approved: st.approved }); st.a = { ...blank(), ...done }; await ctx.reload(); toast(done.sanityDraft ? 'Article sent to Sanity as a draft.' : 'Article published to Sanity.'); st.busy = false; st.approved = false; ctx.render(); }
      catch (error) { st.busy = false; st.error = error.message; try { const cur = await api('/api/blog/' + encodeURIComponent(st.a.id)); st.a = { ...blank(), ...cur }; await ctx.reload(); } catch { /* keep the editor as is */ } ctx.render(); }
      return true;
    }
    if (name === 'blog-suggest-time') {
      const taken = articles().filter(x => x.status === 'scheduled' && x.scheduleAt && x.id !== st.a.id).map(x => x.scheduleAt);
      const [slot] = planSchedule(1, { start: tomorrow(), days: [1, 3, 5], times: ['07:00'], taken });
      if (slot) { st.date = slot.date; st.time = slot.time; ctx.render(); }
      return true;
    }
    if (name === 'blog-filter') { view.filter = id; ctx.render(); return true; }
    if (name === 'blog-clear') { view.selected.clear(); view.plan = null; ctx.render(); return true; }
    if (name === 'blog-plan-open') { openPlanner(); return true; }
    if (name === 'blog-plan-one') { view.selected = new Set([id]); openPlanner(); return true; }
    if (name === 'blog-plan-close') { view.plan = null; ctx.render(); return true; }
    if (name === 'blog-plan-apply') { await applyPlan(); return true; }
    if (name === 'blog-edit-from-queue') { ctx.navigate('blog'); await open(id); return true; }
    if (name === 'blog-remove-selected') { const items = articles().filter(x => view.selected.has(x.id) && canDelete(x)); if (items.length) confirmRemove(items); return true; }
    if (name === 'blog-delete' || name === 'blog-remove') {
      const x = name === 'blog-remove' ? articles().find(a => a.id === id) : st.a; if (!x?.id) return true;
      confirmRemove([x], () => { if (name === 'blog-delete') st = fresh(); });
      return true;
    }
    if (name === 'blog-hero-ai') {
      const a = st.a; if ((a.heroPrompt || '').trim().length < 12) { toast('Write an image prompt first, at least 12 characters.', true); return true; }
      st.generating = true; ctx.render();
      try { const { media } = await api('/api/blog/image', 'POST', { prompt: a.heroPrompt }); a.heroMediaId = media.id; a.hero = { id: media.id, name: media.name, url: media.url, width: media.width, height: media.height }; toast('Image generated. Check it and fill in the alt text.'); }
      catch (error) { toast(error.message, true); }
      st.generating = false; ctx.render(); return true;
    }
    if (name === 'blog-ai') {
      const a = st.a; if (st.ai.topic.trim().length < 8) { st.ai.error = 'Write the article topic, at least 8 characters.'; ctx.render(); return true; }
      st.ai.busy = true; st.ai.error = ''; ctx.render();
      try {
        const d = await api('/api/blog/draft', 'POST', { topic: st.ai.topic, keyword: st.ai.keyword, notes: st.ai.notes });
        Object.assign(a, { title: a.title || d.title, slug: a.slug || d.slug, excerpt: a.excerpt || d.excerpt, seoTitle: a.seoTitle || d.seoTitle, category: a.category || d.category, heroAlt: a.heroAlt || d.heroAlt, body: d.body });
        st.ai.warnings = d.warnings || []; st.slugTouched = !!a.slug;
      } catch (error) { st.ai.error = error.message; }
      st.ai.busy = false; ctx.render(); return true;
    }
    if (name === 'blog-sync') {
      st.syncing = true; ctx.render();
      try { const r = await api('/api/blog/sync', 'POST', { force: true }); await ctx.reload(); toast(r.added || r.updated ? `${r.added} new articles and ${r.updated} updated from Sanity.` : 'All articles from Sanity are already here.'); }
      catch (error) { toast(error.message, true); }
      st.syncing = false; ctx.render(); return true;
    }
    if (name === 'blog-check') { st.checking = true; ctx.render(); try { await api('/api/sanity/check', 'POST', {}); toast('Sanity connected.'); } catch (error) { toast(error.message, true); } st.checking = false; await ctx.reload(); ctx.render(); return true; }
    if (name === 'blog-remove-token') { await api('/api/sanity/config', 'POST', { removeToken: true }); await ctx.reload(); ctx.render(); toast('Sanity token removed.'); return true; }
    return false;
  }
  return { page, bind, action, embeddedEditor, settingsPanel, problemAlerts, queuePanel, reset: () => { st = fresh(); } };
}
