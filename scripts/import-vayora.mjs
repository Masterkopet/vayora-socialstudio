import path from 'node:path';
import { readFile } from 'node:fs/promises';
import { openStore } from '../src/store.mjs';
import { addMedia } from '../src/media.mjs';
const root=path.resolve(import.meta.dirname,'..');
const source=process.env.VAYORA_SOURCE||'E:/Work/VIDEO_EDITING/outputs/vayora-social-lengkap-2026-11-13';
const final=process.env.VAYORA_FINAL||'E:/Work/VIDEO_EDITING/Final';
const manifest=JSON.parse(await readFile(path.join(source,'manifest-produksi.json'),'utf8'));
const store=openStore(process.env.DATA_DIR||path.join(root,'data'));
let added=0;
try { for(const item of manifest.items){
 if(store.post(item.id))continue;
 const paths=item.format==='Video'?[path.join(final,'Video',item.composition+'.mp4')]:item.files.filter(x=>x.endsWith('.png')).map(x=>path.join(source,x));
 const media=[];for(const file of paths)media.push(await addMedia(store,file,path.basename(file),item.format==='Video'?'video/mp4':'image/png'));
 const category=item.product?.includes('Website')?'Website booking':['V03','V06','I03','I04','C03'].includes(item.id)?'Laporan owner':['V02','V05','I02','I06','C02','C05'].includes(item.id)?'Reservasi':['V10','C06'].includes(item.id)?'Demo produk':'Operasional';
 store.insertPost({id:item.id,title:item.headline,format:item.format==='Video'?'Reel':item.format==='Image'?'Gambar':'Carousel',caption:item.caption,alt:item.alt,category,goal:['V10','C06'].includes(item.id)?'Permintaan demo':item.format==='Carousel'?'Edukasi fitur':'Pengenalan brand',mediaIds:media.map(x=>x.id),coverId:null,coverTime:null,status:'draft',approved:false,date:'',time:'12:00',duration:item.duration||null});added++;
 }
 if(added)store.event(null,'Pustaka awal diimpor',`${added} konsep Vayora ditambahkan sebagai draft.`,'change');
 console.log(`${added} konsep ditambahkan. Total: ${store.posts().length}.`);
}finally{store.close();}
