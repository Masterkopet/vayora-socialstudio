// Menu for everyday work: start → content → AI help → settings. A 4th item value of true marks owner-only pages, so
// editors see a short menu. Hidden pages are no longer in the menu but keep their URLs (old links and bookmarks work).
// Page ids stay stable so existing URLs (/settings, OAuth return to #settings) keep working.
export const navigationGroups=[
 {label:'Start',items:[['home','house','Home'],['create','circle-plus','Create post']]},
 {label:'Content',items:[['library','layout-grid','Instagram library'],['youtube-library','square-play','YouTube library'],['facebook-library','thumbs-up','Facebook library'],['tiktok-library','music-2','TikTok library'],['blog','newspaper','Blog'],['calendar','calendar-days','Calendar'],['queue','list-ordered','Queue'],['import','upload','Import content',true]]},
 {label:'AI help',items:[['assistant','sparkles','Caption assistant'],['designer','palette','Content design']]},
 {label:'Settings',items:[['settings','settings','Settings',true],['profile','user-round','Team account'],['history','history','History']]},
];
// Hidden from the menu: review (now the "Needs review" filter in the libraries), knowledge (inside Pengaturan),
// strategy and marketing (unused), package (merged into the one Import content page). Their data stays.
export const hiddenPageIds=['review','knowledge','strategy','marketing','package','ai-settings'];
export const pageIds=[...new Set([...navigationGroups.flatMap(group=>group.items.map(([id])=>id)),...hiddenPageIds])];
// Pages that are not in the menu hang under a menu page; their titles are for the breadcrumb.
const PARENTS = { delivery: 'queue', knowledge: 'settings', 'ai-settings': 'settings', editor: 'library', review: 'queue' };
const HIDDEN_TITLES = { delivery: 'Publishing details', knowledge: 'Brand knowledge', review: 'Content review', strategy: 'Content strategy', marketing: 'Marketing', package: 'Import content', editor: 'Content' };
export const parentOf = view => PARENTS[view] || 'home';
const menuItem = id => { for (const group of navigationGroups) { const item = group.items.find(([x]) => x === id); if (item) return { group: group.label, title: item[2] }; } return null; };
// The trail for a page: Home › group › page (› detail). `extra` is the label of something open inside the page (an article being
// edited). Links go to pages; the group is only a label. Home itself has no trail.
export function crumbs(view, extra = null) {
  if (view === 'home') return [];
  const out = [{ label: 'Home', view: 'home' }], own = menuItem(view), parent = PARENTS[view] ? menuItem(PARENTS[view]) : null;
  const place = own || parent;
  if (place && place.group !== place.title) out.push({ label: place.group }); // not twice: the Settings group holds the Settings page
  if (own) out.push(extra ? { label: own.title, view } : { label: own.title, current: true });
  else if (parent) out.push({ label: parent.title, view: PARENTS[view] });
  if (!own) out.push({ label: HIDDEN_TITLES[view] || view, current: true });
  if (own && extra) out.push({ label: extra, current: true });
  return out;
}
const visibleGroups=role=>navigationGroups.map(group=>({...group,items:group.items.filter(item=>!item[3]||['owner','admin'].includes(role))})).filter(group=>group.items.length);
const current=(view,id)=>view===id||view==='editor'&&id==='library';
// `health` maps a page id to 'bad' (not connected, and content is waiting there) or 'idle' (not connected yet, nothing there).
const HEALTH_TEXT={bad:'Not connected',idle:'Not set up'};
const healthLabel=(title,state)=>state?`${title}, ${HEALTH_TEXT[state].toLowerCase()}`:title;
export function menuGridHTML({view,alertCount=0,icon,role='owner',health={}}){
 const shortLabels={home:'Home',create:'Create',library:'Instagram','youtube-library':'YouTube','facebook-library':'Facebook','tiktok-library':'TikTok',blog:'Blog',import:'Import',calendar:'Calendar',queue:'Queue',assistant:'Caption',designer:'Design',settings:'Settings',history:'History',profile:'Account'};
 const items=visibleGroups(role).flatMap(group=>group.items.map(([id,name,title])=>({action:'nav:'+id,id,name,title,label:shortLabels[id]})));
 items.push({action:'logout',id:'logout',name:'log-out',title:'Sign out',label:'Sign out'});
 return`<nav class="vs-menu-grid" aria-label="Feature menu">${items.map(item=>`<button type="button" class="vs-menu-tile ${item.id==='logout'?'vs-menu-logout':''}" data-action="${item.action}" aria-label="${healthLabel(item.title,health[item.id])}" title="${healthLabel(item.title,health[item.id])}" ${current(view,item.id)?'aria-current="page"':''}><span class="vs-menu-icon">${icon(item.name)}${item.id==='home'&&alertCount?`<b class="vs-menu-count">${alertCount}</b>`:''}${health[item.id]?`<i class="vs-health-dot ${health[item.id]}" aria-hidden="true"></i>`:''}</span><span class="vs-menu-label">${item.label}</span></button>`).join('')}</nav>`;
}
export function navigationHTML({view,alertCount=0,icon,mobile=false,role='owner',health={}}){
 return visibleGroups(role).map(group=>`<section class="vs-navigation-group"><h2>${group.label}</h2><div class="${mobile?'vs-menu-items':'vs-navigation-items'}">${group.items.map(([id,name,title])=>`<button type="button" ${mobile?'class="vs-button"':''} data-action="nav:${id}" ${current(view,id)?'aria-current="page"':''} ${health[id]?`title="${healthLabel(title,health[id])}"`:''}>${icon(name)}<span>${title}</span>${id==='home'&&alertCount?`<b class="vs-nav-count" aria-label="${alertCount} need attention">${alertCount}</b>`:''}${health[id]?`<i class="vs-health-dot ${health[id]}" role="img" aria-label="${HEALTH_TEXT[health[id]]}"></i>`:''}</button>`).join('')}</div></section>`).join('');
}
