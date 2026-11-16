export const navigationGroups=[
 {label:'Publikasi',items:[['library','layout-grid','Pustaka'],['calendar','calendar-days','Kalender'],['review','clipboard-check','Pemeriksaan'],['queue','list-ordered','Antrean']]},
 {label:'Kreasi & brand',items:[['assistant','sparkles','Asisten caption'],['designer','palette','Desain konten'],['knowledge','book-open','Pengetahuan brand']]},
 {label:'Pertumbuhan',items:[['marketing','chart-no-axes-combined','Marketing'],['strategy','compass','Strategi konten']]},
 {label:'Workspace',items:[['settings','settings-2','Pengaturan'],['ai-settings','sliders-horizontal','Pengaturan AI'],['history','history','Riwayat'],['profile','user-round','Akun tim']]},
];
export const pageIds=[...navigationGroups.flatMap(group=>group.items.map(([id])=>id)),'import'];
export function menuGridHTML({view,reviewCount=0,icon}){
 const shortLabels={library:'Pustaka',calendar:'Kalender',review:'Periksa',queue:'Antrean',assistant:'Caption',designer:'Desain',knowledge:'Brand',marketing:'Campaign',strategy:'Strategi',settings:'Setelan','ai-settings':'Atur AI',history:'Riwayat',profile:'Akun'};
 const items=navigationGroups.flatMap(group=>group.items.map(([id,name,title])=>({action:'nav:'+id,id,name,title,label:shortLabels[id]})));
 items.push({action:'nav:import',id:'import',name:'upload',title:'Impor konten',label:'Impor'},{action:'logout',id:'logout',name:'log-out',title:'Keluar',label:'Keluar'});
 return`<nav class="vs-menu-grid" aria-label="Menu fitur">${items.map(item=>`<button type="button" class="vs-menu-tile ${item.id==='logout'?'vs-menu-logout':''}" data-action="${item.action}" aria-label="${item.title}" title="${item.title}" ${view===item.id||view==='editor'&&item.id==='library'?'aria-current="page"':''}><span class="vs-menu-icon">${icon(item.name)}${item.id==='review'&&reviewCount?`<b class="vs-menu-count">${reviewCount}</b>`:''}</span><span class="vs-menu-label">${item.label}</span></button>`).join('')}</nav>`;
}
export function navigationHTML({view,reviewCount=0,icon,mobile=false}){
 return navigationGroups.map(group=>`<section class="vs-navigation-group"><h2>${group.label}</h2><div class="${mobile?'vs-menu-items':'vs-navigation-items'}">${group.items.map(([id,name,title])=>`<button type="button" ${mobile?'class="vs-button"':''} data-action="nav:${id}" ${view===id||view==='editor'&&id==='library'?'aria-current="page"':''}>${icon(name)}<span>${title}</span>${id==='review'&&reviewCount?`<b class="vs-nav-count">${reviewCount}</b>`:''}</button>`).join('')}</div></section>`).join('');
}
