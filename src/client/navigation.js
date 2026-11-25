// Menu for everyday work: start → content → AI help → settings. A 4th item value of true marks owner-only pages, so
// editors see a short menu. Hidden pages are no longer in the menu but keep their URLs (old links and bookmarks work).
// Page ids stay stable so existing URLs (/settings, OAuth return to #settings) keep working.
export const navigationGroups=[
 {label:'Mulai',items:[['home','house','Beranda'],['create','circle-plus','Buat posting']]},
 {label:'Konten',items:[['library','layout-grid','Pustaka Instagram'],['youtube-library','square-play','Pustaka YouTube'],['blog','newspaper','Blog'],['calendar','calendar-days','Kalender'],['queue','list-ordered','Antrean'],['import','upload','Impor konten',true]]},
 {label:'Bantuan AI',items:[['assistant','sparkles','Asisten caption'],['designer','palette','Desain konten']]},
 {label:'Pengaturan',items:[['settings','camera','Koneksi & publikasi',true],['ai-settings','sliders-horizontal','Pengaturan AI',true],['profile','user-round','Akun tim'],['history','history','Riwayat']]},
];
// Hidden from the menu: review (now the "Perlu ditinjau" filter in the libraries), knowledge (inside Pengaturan AI),
// strategy and marketing (unused), package (merged into the one Impor konten page). Their data stays.
export const hiddenPageIds=['review','knowledge','strategy','marketing','package'];
export const pageIds=[...new Set([...navigationGroups.flatMap(group=>group.items.map(([id])=>id)),...hiddenPageIds])];
const visibleGroups=role=>navigationGroups.map(group=>({...group,items:group.items.filter(item=>!item[3]||role==='owner')})).filter(group=>group.items.length);
const current=(view,id)=>view===id||view==='editor'&&id==='library';
export function menuGridHTML({view,alertCount=0,icon,role='owner'}){
 const shortLabels={home:'Beranda',create:'Buat',library:'Instagram','youtube-library':'YouTube',blog:'Blog',import:'Impor',calendar:'Kalender',queue:'Antrean',assistant:'Caption',designer:'Desain',settings:'Koneksi','ai-settings':'Atur AI',history:'Riwayat',profile:'Akun'};
 const items=visibleGroups(role).flatMap(group=>group.items.map(([id,name,title])=>({action:'nav:'+id,id,name,title,label:shortLabels[id]})));
 items.push({action:'logout',id:'logout',name:'log-out',title:'Keluar',label:'Keluar'});
 return`<nav class="vs-menu-grid" aria-label="Menu fitur">${items.map(item=>`<button type="button" class="vs-menu-tile ${item.id==='logout'?'vs-menu-logout':''}" data-action="${item.action}" aria-label="${item.title}" title="${item.title}" ${current(view,item.id)?'aria-current="page"':''}><span class="vs-menu-icon">${icon(item.name)}${item.id==='home'&&alertCount?`<b class="vs-menu-count">${alertCount}</b>`:''}</span><span class="vs-menu-label">${item.label}</span></button>`).join('')}</nav>`;
}
export function navigationHTML({view,alertCount=0,icon,mobile=false,role='owner'}){
 return visibleGroups(role).map(group=>`<section class="vs-navigation-group"><h2>${group.label}</h2><div class="${mobile?'vs-menu-items':'vs-navigation-items'}">${group.items.map(([id,name,title])=>`<button type="button" ${mobile?'class="vs-button"':''} data-action="nav:${id}" ${current(view,id)?'aria-current="page"':''}>${icon(name)}<span>${title}</span>${id==='home'&&alertCount?`<b class="vs-nav-count" aria-label="${alertCount} perlu perhatian">${alertCount}</b>`:''}</button>`).join('')}</div></section>`).join('');
}
