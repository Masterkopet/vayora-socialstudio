// Tabs for long pages. A page is rendered as one HTML string with markers between its parts:
//   <!--tab:id-->  starts the panel "id";  <!--/tabs-->  ends the tabs (what follows stays below them, always visible).
// Everything before the first marker also stays above the tabs. All panels are rendered (inactive ones are hidden), so
// form fields keep working and switching tabs never re-renders the page. The chosen tab is remembered per page.

const selected = new Map();
const store = {
  get(key) { try { return sessionStorage.getItem('vayora.tab.' + key); } catch { return null; } },
  set(key, id) { try { sessionStorage.setItem('vayora.tab.' + key, id); } catch { /* storage unavailable */ } },
};
const escapeHtml = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// defs: [{ id, label, status? }] where status is 'ok' | 'warn' to show a small dot. Panels with no content are dropped,
// and a page with fewer than two panels is returned without tabs.
export function tabbed(key, html, defs) {
  const [rest, suffix = ''] = String(html).split('<!--/tabs-->');
  const parts = rest.split(/<!--tab:([a-z0-9-]+)-->/), prefix = parts[0], panels = [];
  for (let i = 1; i < parts.length; i += 2) {
    const def = defs.find(d => d.id === parts[i]);
    if (def && parts[i + 1].trim()) panels.push({ ...def, content: parts[i + 1] });
  }
  if (panels.length < 2) return prefix + panels.map(p => p.content).join('') + suffix;
  const remembered = selected.get(key) || store.get(key), active = panels.some(p => p.id === remembered) ? remembered : panels[0].id;
  const tab = p => `<button type="button" role="tab" class="vs-tab" id="tab-${key}-${p.id}" data-tab="${p.id}" aria-selected="${p.id === active}" aria-controls="panel-${key}-${p.id}" tabindex="${p.id === active ? 0 : -1}">${escapeHtml(p.label)}${p.status ? `<span class="vs-tab-dot ${escapeHtml(p.status)}" aria-hidden="true"></span>` : ''}</button>`;
  const panel = p => `<div role="tabpanel" class="vs-tabpanel vs-stack" id="panel-${key}-${p.id}" aria-labelledby="tab-${key}-${p.id}" ${p.id === active ? '' : 'hidden'}>${p.content}</div>`;
  return `${prefix}<div class="vs-tabs" data-tabs="${key}"><div class="vs-tablist" role="tablist">${panels.map(tab).join('')}</div>${panels.map(panel).join('')}</div>${suffix}`;
}

// Wires every tab bar under `root`: click and arrow keys switch panels without re-rendering.
export function bindTabs(root) {
  root.querySelectorAll('[data-tabs]').forEach(group => {
    const key = group.dataset.tabs, tabs = [...group.querySelectorAll(':scope > .vs-tablist > [role="tab"]')];
    const show = id => {
      selected.set(key, id); store.set(key, id);
      for (const t of tabs) { const on = t.dataset.tab === id; t.setAttribute('aria-selected', String(on)); t.tabIndex = on ? 0 : -1; }
      group.querySelectorAll(':scope > [role="tabpanel"]').forEach(p => { p.hidden = p.id !== `panel-${key}-${id}`; });
    };
    tabs.forEach((t, i) => {
      t.addEventListener('click', () => show(t.dataset.tab));
      t.addEventListener('keydown', e => {
        const next = { ArrowRight: (i + 1) % tabs.length, ArrowLeft: (i + tabs.length - 1) % tabs.length, Home: 0, End: tabs.length - 1 }[e.key];
        if (next === undefined) return;
        e.preventDefault(); tabs[next].focus(); show(tabs[next].dataset.tab);
      });
    });
  });
}

// Forget the remembered tab of one page, so it opens on its first tab next time.
export function resetTab(key) { selected.delete(key); try { sessionStorage.removeItem('vayora.tab.' + key); } catch { /* storage unavailable */ } }
