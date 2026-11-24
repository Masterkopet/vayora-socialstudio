import { nextTestServer } from './next-server.mjs';
import { createRequire } from 'node:module';
import { mkdir, mkdtemp } from 'node:fs/promises';
import path from 'node:path';
import { randomBytes } from 'node:crypto';
import assert from 'node:assert/strict';
import { createApp } from '../src/server.mjs';

const require=createRequire(import.meta.url);
const {chromium}=require('C:/Program Files/WindowsApps/OpenAI.CodexPrimaryRuntime.v26-1111-570-0_26.1111.570.0_x64__3k8sg7r9htsxt/dependencies/node/node_modules/playwright');
const root=path.resolve(import.meta.dirname,'..'),results=path.join(root,'test-results');
await mkdir(results,{recursive:true});
const directory=await mkdtemp(path.join(results,'menu-browser-'));
const runtime=createApp({dataDir:directory,port:3212,origin:'http://localhost:3212',scheduler:false});
const server=await nextTestServer(runtime,3212);
const browser=await chromium.launch({channel:'chrome',headless:true});
const context=await browser.newContext({viewport:{width:536,height:1403},isMobile:true,hasTouch:true});
const page=await context.newPage(),errors=[];
page.on('pageerror',error=>errors.push(error.message));
try{
 await page.goto('http://localhost:3212/#calendar');
 const password='Menu-'+randomBytes(16).toString('hex');
 await page.locator('#auth-name').fill('Menu Test');
 await page.locator('#auth-email').fill('menu-test@example.test');
 await page.locator('#auth-password').fill(password);
 await page.locator('#auth-confirm').fill(password);
 await page.locator('#auth-submit').click();
 await page.locator('#vs-title').waitFor();
 const reports=[];
 for(const [width,height]of [[536,1403],[390,844],[320,844],[800,1000],[536,500]]){
  await page.setViewportSize({width,height});
  for(const language of ['id','en']){
   await page.locator('[data-action="more-menu"]:visible').click();
   await page.waitForFunction(()=>document.querySelector('#vs-detail')?.dataset.phase==='open'&&Number(getComputedStyle(document.querySelector('#vs-detail')).opacity)>.999&&Math.abs(new DOMMatrixReadOnly(getComputedStyle(document.querySelector('#vs-detail')).transform).m42)<.5);
   await page.locator('#vs-detail [data-language]').selectOption(language);
   assert.equal(await page.locator('.vs-menu-grid .vs-menu-tile').count(),16);
   const report=await page.locator('#vs-detail').evaluate(dialog=>{
    const grid=dialog.querySelector('.vs-menu-grid'),body=dialog.querySelector('.vs-detail-body'),header=dialog.querySelector('.vs-detail-header'),r=dialog.getBoundingClientRect(),tiles=[...grid.children].map(el=>{const b=el.getBoundingClientRect(),label=el.querySelector('.vs-menu-label');return{x:b.x,y:b.y,width:b.width,height:b.height,overflow:label.scrollWidth>label.clientWidth+1};});
    const bar=document.querySelector('.vs-bottom-nav').getBoundingClientRect();return{bar:{top:bar.top,height:bar.height},bounds:{x:r.x,y:r.y,width:r.width,height:r.height,bottom:r.bottom},columns:getComputedStyle(grid).gridTemplateColumns.split(' ').length,rows:new Set(tiles.map(t=>Math.round(t.y))).size,tiles,blankHeight:body.clientHeight-body.scrollHeight,contentHeight:header.getBoundingClientRect().height+body.getBoundingClientRect().height+2,bodyScroll:body.scrollHeight-body.clientHeight};
   });
   assert.equal(report.columns,5);assert.equal(report.rows,4);
   assert.ok(report.bounds.x>=15&&report.bounds.y>=15,'Popup has visible surrounding space');assert.ok(Math.abs(report.bar.top-report.bounds.bottom-10)<1,'Menu anchors ten pixels above the main navigation');
   assert.ok(report.bounds.height<=height*.8+1,'Small-height view remains bounded');
   assert.ok(Math.abs(report.bounds.height-report.contentHeight)<3,'Height follows header and content');
   assert.ok(report.bounds.height<470,'Menu does not stretch to unused screen height');
   assert.ok(report.tiles.every(t=>t.width>=44&&t.height>=44&&!t.overflow),'All labels fit and tap areas remain usable');
   if(height>=844)assert.ok(report.bodyScroll<2,'Three menu rows and language fit without scrolling');
   assert.ok(await page.locator('.vs-menu-grid [data-action="nav:calendar"]').getAttribute('aria-current'));
   if((width===536&&height===1403)||(width===390&&language==='id')||(width===320&&language==='en'))await page.screenshot({path:path.join(results,`menu-grid-${width}-${language}.png`)});
   reports.push({width,height,language,popupHeight:Math.round(report.bounds.height),columns:report.columns,rows:report.rows});
   await page.keyboard.press('Escape');
   await page.locator('#vs-detail').waitFor({state:'detached'});
   assert.equal(await page.locator('[data-action="more-menu"]:visible').evaluate(el=>el===document.activeElement),true);
  }
 }
 await page.setViewportSize({width:390,height:844});
 await page.emulateMedia({reducedMotion:'reduce'});await page.locator('[data-action="more-menu"]:visible').click();assert.equal(await page.locator('#vs-detail').evaluate(el=>getComputedStyle(el).transitionDuration),'0s');await page.keyboard.press('Escape');await page.locator('#vs-detail').waitFor({state:'detached'});await page.emulateMedia({reducedMotion:'no-preference'});
 await page.locator('[data-action="more-menu"]:visible').click();
 await page.locator('.vs-menu-grid [data-action="nav:knowledge"]').click();
 await page.locator('#smart-knowledge-form').waitFor();
 assert.equal(new URL(page.url()).pathname,'/knowledge');
 await page.locator('[data-action="more-menu"]:visible').click();
 await page.locator('#vs-detail [data-language]').selectOption('id');
 assert.equal(await page.locator('.vs-menu-grid [data-action="nav:knowledge"]').getAttribute('aria-current'),'page');
 await page.locator('.vs-menu-grid [data-action="nav:import"]').click();
 await page.locator('#import-files').waitFor();
 assert.equal(new URL(page.url()).pathname,'/import');
 assert.deepEqual(errors,[]);
 console.log('PASS menu: sixteen actions in five columns/four rows; content-sized popup anchored above main navigation; reduced-motion support; ID/EN label fit and 44px touch areas; short-screen scrolling; active route, keyboard close/focus, language switch, knowledge and import navigation.');
 console.log(JSON.stringify(reports));
}finally{
 await browser.close();
 await new Promise(resolve=>server.close(resolve));
 runtime.close();
}
