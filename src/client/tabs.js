// Tabs for long pages. A page is rendered as one HTML string with markers between its parts:
//   <!--tab:id-->  starts the panel "id";  <!--/tabs-->  ends the tabs (what follows stays below them, always visible).
// Everything before the first marker also stays above the tabs. All panels are rendered (inactive ones are hidden), so
// form fields keep working and switching tabs never re-renders the page. The chosen tab is remembered per page.
//
// A page with many sections (Settings) can use the side layout instead of a tab bar: `opts = { side: true, groups }` shows a
// grouped list of sections on the left on a wide screen. On a phone the list is the page: tapping a section opens it full
// screen and Back (the app's Back button or the breadcrumb) returns to the list, so nothing is ever cut off or scrolled sideways.

const selected = new Map(), labels = new Map(), mobileOpen = new Set();
const store = {
  get(key) { try { return sessionStorage.getItem('vayora.tab.' + key); } catch { return null; } },
  set(key, id) { try { sessionStorage.setItem('vayora.tab.' + key, id); } catch { /* storage unavailable */ } },
};
const escapeHtml = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const phone = () => { try { return matchMedia('(max-width:800px)').matches; } catch { return false; } };

// defs: [{ id, label, status?, hint? }] where status is 'ok' | 'warn' to show a small dot (hint is the one-line summary shown
// in the side layout). Panels with no content are dropped, and a page with fewer than two panels is returned without tabs.
export function tabbed(key, html, defs, opts = {}) {
  const [rest, suffix = ''] = String(html).split('<!--/tabs-->');
  const parts = rest.split(/<!--tab:([a-z0-9-]+)-->/), prefix = parts[0], panels = [];
  for (let i = 1; i < parts.length; i += 2) {
    const def = defs.find(d => d.id === parts[i]);
    if (def && parts[i + 1].trim()) panels.push({ ...def, content: parts[i + 1] });
  }
  if (panels.length < 2) return prefix + panels.map(p => p.content).join('') + suffix;
  const remembered = selected.get(key) || store.get(key), active = panels.some(p => p.id === remembered) ? remembered : panels[0].id;
  labels.set(key, Object.fromEntries(panels.map(p => [p.id, p.label])));
  selected.set(key, active);
  const panel = p => `<div role="tabpanel" class="vs-tabpanel vs-stack" id="panel-${key}-${p.id}" aria-labelledby="tab-${key}-${p.id}" ${p.id === active ? '' : 'hidden'}>${p.content}</div>`;
  if (opts.side) {
    const item = p => `<button type="button" role="tab" class="vs-sidetab" id="tab-${key}-${p.id}" data-tab="${p.id}" aria-selected="${p.id === active}" aria-controls="panel-${key}-${p.id}" tabindex="${p.id === active ? 0 : -1}"><span class="vs-tab-dot ${escapeHtml(p.status || '')}" aria-hidden="true"></span><span class="vs-sidetab-text"><b>${escapeHtml(p.label)}</b>${p.hint ? `<small>${escapeHtml(p.hint)}</small>` : ''}</span><span class="vs-sidetab-chevron" aria-hidden="true">›</span></button>`;
    const groups = (opts.groups || [{ label: '', ids: panels.map(p => p.id) }]).map(g => ({ label: g.label, items: g.ids.map(id => panels.find(p => p.id === id)).filter(Boolean) })).filter(g => g.items.length);
    const placed = new Set(groups.flatMap(g => g.items.map(p => p.id))), loose = panels.filter(p => !placed.has(p.id));
    if (loose.length) groups.push({ label: '', items: loose });
    const nav = groups.map(g => `<div class="vs-sidegroup" role="presentation">${g.label ? `<h3 class="vs-sidegroup-title">${escapeHtml(g.label)}</h3>` : ''}${g.items.map(item).join('')}</div>`).join('');
    return `${prefix}<div class="vs-sidetabs" data-tabs="${key}" data-side="1" data-view="${mobileOpen.has(key) ? 'detail' : 'list'}"><div class="vs-sidenav" role="tablist" aria-orientation="vertical">${nav}</div><div class="vs-sidepanels">${panels.map(panel).join('')}</div></div>${suffix}`;
  }
  const tab = p => `<button type="button" role="tab" class="vs-tab" id="tab-${key}-${p.id}" data-tab="${p.id}" aria-selected="${p.id === active}" aria-controls="panel-${key}-${p.id}" tabindex="${p.id === active ? 0 : -1}">${escapeHtml(p.label)}${p.status ? `<span class="vs-tab-dot ${escapeHtml(p.status)}" aria-hidden="true"></span>` : ''}</button>`;
  return `${prefix}<div class="vs-tabs" data-tabs="${key}"><div class="vs-tablist" role="tablist">${panels.map(tab).join('')}</div>${panels.map(panel).join('')}</div>${suffix}`;
}

// Wires every tab bar under `root`: click and arrow keys switch panels without re-rendering.
export function bindTabs(root) {
  root.querySelectorAll('[data-tabs]').forEach(group => {
    const key = group.dataset.tabs, side = group.dataset.side === '1';
    const tabs = [...group.querySelectorAll(side ? '.vs-sidenav [role="tab"]' : ':scope > .vs-tablist > [role="tab"]')];
    const panels = () => group.querySelectorAll(side ? '.vs-sidepanels > [role="tabpanel"]' : ':scope > [role="tabpanel"]');
    const show = id => {
      selected.set(key, id); store.set(key, id);
      for (const t of tabs) { const on = t.dataset.tab === id; t.setAttribute('aria-selected', String(on)); t.tabIndex = on ? 0 : -1; }
      panels().forEach(p => { p.hidden = p.id !== `panel-${key}-${id}`; });
    };
    tabs.forEach((t, i) => {
      t.addEventListener('click', () => { show(t.dataset.tab); if (side) { mobileOpen.add(key); group.dataset.view = 'detail'; if (phone()) window.scrollTo({ top: 0, behavior: 'instant' }); group.dispatchEvent(new CustomEvent('vayora-section', { bubbles: true })); } });
      t.addEventListener('keydown', e => {
        const keys = side ? { ArrowDown: (i + 1) % tabs.length, ArrowUp: (i + tabs.length - 1) % tabs.length } : { ArrowRight: (i + 1) % tabs.length, ArrowLeft: (i + tabs.length - 1) % tabs.length };
        const next = { ...keys, Home: 0, End: tabs.length - 1 }[e.key];
        if (next === undefined) return;
        e.preventDefault(); tabs[next].focus(); show(tabs[next].dataset.tab);
      });
    });
  });
}

// Remember a tab for one page, so it opens on that tab next time (used by links that point at one tab). On a phone the
// side layout opens that section instead of the list.
export function selectTab(key, id) { selected.set(key, id); store.set(key, id); mobileOpen.add(key); }

// Phone only: is a section of a side-layout page open, what is it called, and go back to the list. closeSection returns true
// when it did something, so the caller knows Back was used up.
export const inDetail = key => phone() && mobileOpen.has(key);
export const activeLabel = key => labels.get(key)?.[selected.get(key)] || null;
export function closeSection(key) {
  if (!inDetail(key)) return false;
  mobileOpen.delete(key);
  const group = document.querySelector(`[data-tabs="${key}"][data-side="1"]`); if (group) group.dataset.view = 'list';
  window.scrollTo({ top: 0, behavior: 'instant' });
  return true;
}

// Forget the remembered tab of one page, so it opens on its first tab next time.
export function resetTab(key) { selected.delete(key); mobileOpen.delete(key); try { sessionStorage.removeItem('vayora.tab.' + key); } catch { /* storage unavailable */ } }
