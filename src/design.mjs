import sharp from 'sharp';
import path from 'node:path';
import { readFile, writeFile, mkdir, unlink } from 'node:fs/promises';
import { randomBytes } from 'node:crypto';
import { addMedia, mediaPath } from './media.mjs';

const publicDir=path.resolve(process.env.PROJECT_ROOT||process.cwd(),'public');
const escape=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c]));
const bad=message=>Object.assign(new Error(message),{status:400});
function lines(text,max) {
  const result=[];let line='';
  for(const word of text.split(/\s+/).filter(Boolean)) {
    if(word.length>max)throw bad('Ada kata terlalu panjang. Gunakan kata yang lebih singkat.');
    if((line+' '+word).trim().length>max){result.push(line);line=word;}else line=(line+' '+word).trim();
  }
  if(line)result.push(line);return result;
}
export async function registerImage(store,bytes,name,provenance) {
  const dir=path.join(store.directory,'tmp');await mkdir(dir,{recursive:true});const file=path.join(dir,randomBytes(12).toString('hex')+'.png');
  try{await writeFile(file,bytes);const media=await addMedia(store,file,name,'image/png');store.set('assistant.media.'+media.id,{...provenance,createdAt:new Date().toISOString()});return media;}finally{await unlink(file).catch(()=>{});}
}
export async function composeDesign(store,body) {
  const headline=String(body.headline||'').trim(),subline=String(body.subline||'').trim(),cta=String(body.cta||'Lihat cara kerja').trim();
  if(!headline||headline.length>85||subline.length>180||!cta||cta.length>30)throw bad('Judul maksimal 85, penjelasan 180, dan CTA 30 karakter.');
  const heading=lines(headline,20),paragraph=lines(subline,44);if(heading.length>3||paragraph.length>3)throw bad('Teks terlalu panjang untuk desain. Ringkas judul menjadi maksimal tiga baris dan penjelasan menjadi tiga baris.');
  const light=body.theme==='cream',bg=light?'#FFF9E1':'#00285C',fg=light?'#00285C':'#FFF9E1',accent=light?'#00285C':'#FFB600';
  const logo=await readFile(path.join(publicDir,'brand/logo.svg'));
  const overlays=[{input:await sharp(logo).resize(320,86).png().toBuffer(),left:80,top:80}];
  let lower;
  if(body.mediaId) {
    const row=store.get('SELECT * FROM media WHERE id=?',String(body.mediaId));if(!row)throw bad('Pilih gambar yang tersedia di pustaka.');
    const image=await sharp(mediaPath(store,row,row.mime==='video/mp4')).resize(920,470,{fit:'cover'}).png().toBuffer();
    const mask=Buffer.from('<svg width="920" height="470"><rect width="920" height="470" rx="36" fill="white"/></svg>');
    const rounded=await sharp(image).composite([{input:mask,blend:'dest-in'}]).png().toBuffer();
    const source=store.setting('assistant.media.'+row.id,{});
    overlays.push({input:rounded,left:80,top:640});lower=`<text x="84" y="1155" font-size="21">${source.kind==='ai-background'?'Ilustrasi AI · bukan foto pelanggan':'Visual pendamping · materi Vayora'}</text>`;
  }else {
    const mascot=await sharp(await readFile(path.join(publicDir,'brand/icon.svg'))).resize(670,594).png().toBuffer();
    overlays.push({input:mascot,left:410,top:575});lower='<text x="80" y="930" font-size="30" font-weight="700">Semua villa.</text><text x="80" y="974" font-size="30" font-weight="700">Satu dasbor.</text>';
  }
  const copy=Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1350"><g font-family="Arial, sans-serif" fill="${fg}"><text x="80" y="230" font-size="21" letter-spacing="3">VAYORA / MANAJEMEN VILLA</text><text font-size="72" font-weight="700" letter-spacing="-2">${heading.map((s,i)=>`<tspan x="80" y="${320+i*80}">${escape(s)}</tspan>`).join('')}</text><text font-size="29">${paragraph.map((s,i)=>`<tspan x="80" y="${340+heading.length*80+i*38}">${escape(s)}</tspan>`).join('')}</text>${lower}<path d="M80 1196 H1000" stroke="${fg}" opacity=".2"/><rect x="80" y="1230" width="600" height="66" rx="20" fill="${accent}"/><text x="112" y="1273" font-size="27" font-weight="700" fill="${light?'#FFF9E1':'#00285C'}">${escape(cta)} →</text><text x="1000" y="1273" text-anchor="end" font-size="25" font-weight="700">vayora.id</text></g></svg>`);
  // The approved vector wordmark is always placed on its own cream backing.
  overlays.unshift({input:await sharp({create:{width:356,height:114,channels:4,background:'#FFF9E1'}}).png().toBuffer(),left:62,top:64});
  overlays.push({input:copy,left:0,top:0});
  const bytes=await sharp({create:{width:1080,height:1350,channels:4,background:bg}}).composite(overlays).png().toBuffer();
  return registerImage(store,bytes,'Vayora-desain-'+Date.now()+'.png',{kind:'brand-design',headline,subline,sourceMediaId:body.mediaId||null});
}
