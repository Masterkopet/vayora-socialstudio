// Google Drive picker for Import content. Browse My Drive or "Shared with me", tick folders and files, and hand them to the
// Import page as File objects. Small text files (articles, metadata, zips) are downloaded into the browser through the
// server; videos and photos stay in Drive as placeholders (`driveId`) and the server fetches them when the import runs.
const MEDIA_TYPES = { mp4: 'video/mp4', mov: 'video/quicktime', jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp' };
const extOf = name => String(name).toLowerCase().match(/\.([a-z0-9]+)$/)?.[1] || '';
const sizeText = n => !n ? '' : n > 1048576 ? (n / 1048576).toFixed(1) + ' MB' : Math.max(1, Math.round(n / 1024)) + ' KB';
const RETURN_FLAG = 'vayora.drive.open';

export function createDrivePicker(ctx) {
  const { api, esc, button, toast } = ctx;
  let d = fresh();
  function fresh() { return { open: false, status: null, loading: false, busy: '', stack: [{ id: 'root', name: 'My Drive' }], files: [], next: null, selected: new Map(), error: '' }; }

  const here = () => d.stack[d.stack.length - 1];
  async function loadStatus() { try { d.status = await api('/api/drive/status'); } catch (e) { d.status = { configured: false, connected: false }; d.error = e.message; } }
  async function loadFolder(more = false) {
    d.loading = true; d.error = ''; ctx.render();
    try {
      const data = await api('/api/drive/list?folder=' + encodeURIComponent(here().id) + (more && d.next ? '&pageToken=' + encodeURIComponent(d.next) : ''));
      d.files = more ? [...d.files, ...data.files] : data.files; d.next = data.nextPageToken;
    } catch (e) { d.error = e.message; if (/reconnect|not connected/i.test(e.message)) await loadStatus(); }
    d.loading = false; ctx.render();
  }
  async function open() {
    d.open = true; d.loading = true; ctx.render();
    await loadStatus();
    if (d.status?.connected) await loadFolder(); else { d.loading = false; ctx.render(); }
  }

  function panel() {
    try { if (sessionStorage.getItem(RETURN_FLAG)) { sessionStorage.removeItem(RETURN_FLAG); if (!d.open) queueMicrotask(() => void open()); } } catch { /* storage unavailable */ }
    if (!d.open) return '';
    const head = `<div class="vs-row"><b>Google Drive</b>${d.status?.connected ? `<span class="vs-mini">${esc(d.status.account || '')} · ${button('Disconnect', 'pkg-drive-disconnect', 'vs-text-button')}</span>` : ''}</div>`;
    const close = button('Close', 'pkg-drive-close', 'vs-text-button');
    let body;
    if (!d.status) body = '<p class="vs-mini" role="status">Loading…</p>';
    else if (!d.status.configured) body = `<p class="vs-sub">Google Drive uses the same Google client as YouTube. Open Settings → YouTube and enter the Client ID and Client Secret first.</p>`;
    else if (!d.status.connected) body = `<p class="vs-sub">Connect the Google account that holds the files. Studio only reads from Drive (read-only access) and never changes or deletes anything there.</p>${d.status.error ? `<p class="vs-inline-error">${esc(d.status.error)}</p>` : ''}${button('Connect Google Drive', 'pkg-drive-connect', 'vs-primary', 'link')}`;
    else {
      const tabs = [['root', 'My Drive'], ['shared', 'Shared with me']].map(([id, name]) => `<button type="button" class="vs-choice" data-pkg-drive-tab="${id}" aria-pressed="${d.stack[0].id === id}"><b>${name}</b></button>`).join('');
      const crumbs = d.stack.map((s, i) => i === d.stack.length - 1 ? `<b>${esc(s.name)}</b>` : `<button type="button" class="vs-text-button" data-pkg-drive-crumb="${i}">${esc(s.name)}</button>`).join(' / ');
      const rows = d.files.map(f => `<label class="vs-check vs-drive-row"><input type="checkbox" data-pkg-drive-pick="${esc(f.id)}" ${d.selected.has(f.id) ? 'checked' : ''} ${d.busy ? 'disabled' : ''}><span>${f.kind === 'folder' ? `<button type="button" class="vs-text-button" data-pkg-drive-enter="${esc(f.id)}" data-name="${esc(f.name)}">📁 ${esc(f.name)}</button>` : `${f.kind === 'media' ? (MEDIA_TYPES[extOf(f.name)]?.startsWith('video') ? '🎞️' : '🖼️') : '📄'} ${esc(f.name)}`} <small class="vs-mini">${sizeText(f.size)}</small></span></label>`).join('');
      body = `<div class="vs-choice-grid">${tabs}</div><p class="vs-mini">${crumbs}</p>${d.error ? `<p class="vs-inline-error" role="alert">${esc(d.error)}</p>` : ''}<div class="vs-stack vs-drive-list">${d.loading && !d.files.length ? '<p class="vs-mini" role="status">Loading…</p>' : rows || '<p class="vs-mini">No folders, videos, photos or text files here.</p>'}</div>${d.next ? button('Load more', 'pkg-drive-more', 'vs-text-button', '', d.loading ? 'disabled' : '') : ''}<div class="vs-actions">${button(d.busy || `Use ${d.selected.size || ''} selected`.replace('  ', ' '), 'pkg-drive-use', 'vs-primary', 'download', d.busy || !d.selected.size ? 'disabled' : '')}</div><p class="vs-mini">Tick a folder to take everything inside it (subfolders included). Videos and photos are fetched by the server when you run the import.</p>`;
    }
    return `<section class="vs-panel vs-pad vs-stack" id="pkg-drive">${head}${body}<div>${close}</div></section>`;
  }

  // Turns the ticked folders and files into File objects for the Import page.
  async function collect() {
    const items = new Map();
    for (const [id, f] of d.selected) {
      if (f.kind === 'folder') {
        d.busy = `Reading folder ${f.name}…`; ctx.render();
        const walked = await api('/api/drive/walk?folder=' + encodeURIComponent(id));
        for (const w of walked.files) items.set(w.id, { ...w, path: f.name + '/' + w.path });
      } else items.set(id, { ...f, path: f.name });
    }
    const out = []; let n = 0;
    for (const f of items.values()) {
      d.busy = `Fetching ${++n} of ${items.size}…`; ctx.render();
      let file;
      if (f.kind === 'media') {
        file = new File([], f.name, { type: MEDIA_TYPES[extOf(f.name)] || '' });
        Object.defineProperty(file, 'size', { value: f.size }); file.driveId = f.id;
      } else {
        const response = await fetch('/api/drive/file/' + encodeURIComponent(f.id), { credentials: 'same-origin' });
        if (!response.ok) throw new Error((await response.json().catch(() => ({}))).error || 'The file could not be fetched from Google Drive.');
        file = new File([await response.blob()], f.name);
      }
      if (f.path !== f.name) Object.defineProperty(file, 'webkitRelativePath', { value: f.path });
      out.push(file);
    }
    return out;
  }

  async function action(name) {
    if (name === 'pkg-drive-open') { await open(); return true; }
    if (name === 'pkg-drive-close') { d.open = false; ctx.render(); return true; }
    if (name === 'pkg-drive-connect') {
      try { const { url } = await api('/api/drive/connect', 'POST', {}); const target = new URL(url); if (target.hostname !== 'accounts.google.com' || target.protocol !== 'https:') throw new Error('Invalid Google address.'); try { sessionStorage.setItem(RETURN_FLAG, '1'); } catch { /* storage unavailable */ } location.assign(target.href); }
      catch (e) { toast(e.message, true); }
      return true;
    }
    if (name === 'pkg-drive-disconnect') { d.status = await api('/api/drive/disconnect', 'POST', {}); d.files = []; d.selected.clear(); ctx.render(); return true; }
    if (name === 'pkg-drive-more') { await loadFolder(true); return true; }
    if (name === 'pkg-drive-use') {
      try { const files = await collect(); d.busy = ''; d.open = false; d.selected.clear(); await ctx.addFiles(files); toast(`${files.length} files added from Google Drive.`); }
      catch (e) { d.busy = ''; d.error = e.message; ctx.render(); }
      return true;
    }
    return false;
  }

  function bind(root) {
    root.querySelectorAll('[data-pkg-drive-pick]').forEach(el => el.addEventListener('change', () => {
      const f = d.files.find(x => x.id === el.dataset.pkgDrivePick); if (!f) return;
      if (el.checked) d.selected.set(f.id, f); else d.selected.delete(f.id);
      ctx.render();
    }));
    root.querySelectorAll('[data-pkg-drive-enter]').forEach(el => el.addEventListener('click', e => { e.preventDefault(); d.stack.push({ id: el.dataset.pkgDriveEnter, name: el.dataset.name }); d.files = []; void loadFolder(); }));
    root.querySelectorAll('[data-pkg-drive-crumb]').forEach(el => el.addEventListener('click', () => { d.stack = d.stack.slice(0, Number(el.dataset.pkgDriveCrumb) + 1); d.files = []; void loadFolder(); }));
    root.querySelectorAll('[data-pkg-drive-tab]').forEach(el => el.addEventListener('click', () => { const id = el.dataset.pkgDriveTab; d.stack = [{ id, name: id === 'root' ? 'My Drive' : 'Shared with me' }]; d.files = []; void loadFolder(); }));
  }
  return { panel, bind, action, open };
}
