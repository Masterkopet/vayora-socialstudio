import { readFileSync } from 'node:fs';
import path from 'node:path';

const knowledge=JSON.parse(readFileSync(path.resolve(process.env.PROJECT_ROOT||process.cwd(),'knowledge/vayora-brand.json'),'utf8'));
const sourceById=new Map(knowledge.sources.map(s=>[s.id,s]));
const factById=new Map(knowledge.facts.map(f=>[f.id,f]));
if(factById.size!==knowledge.facts.length||knowledge.facts.some(f=>f.sourceIds.some(id=>!sourceById.has(id))))throw Error('Referensi pengetahuan brand tidak valid.');
const statuses={available:'Tersedia',addon:'Layanan tambahan',coming_soon:'Segera hadir',brand:'Identitas brand',guidance:'Pedoman',needs_confirmation:'Perlu konfirmasi'};
const tokens=text=>String(text||'').normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}#]+/gu,' ').split(/\s+/).filter(x=>x.length>2&&!new Set(['yang','dan','untuk','dari','dengan','pada','dalam','atau','ini','itu','apa','ada','saya','kami','kamu','vayora','villa','brand','konten','bisa','akan','lebih','satu','buat','tentang']).has(x));
const aliases=[[/invoice|tagihan|folio/i,'invoice tagihan pajak biaya'],[/laundry|linen|sprei|handuk/i,'linen laundry handuk biaya'],[/kalender|reservasi|booking/i,'reservasi kalender booking ketersediaan'],[/housekeeping|bersih|kamar siap/i,'housekeeping bukti foto persetujuan admin siap'],[/profit|keuntungan|laba|beban/i,'owner beban laba keuntungan laporan biaya'],[/qris|midtrans|payment|bayar|pembayaran/i,'pembayaran qris midtrans payment'],[/harga paket|tarif|berlangganan|subscription|harga pms/i,'tarif paket biaya berlangganan proposal'],[/founder|pendiri|badan hukum|tim vayora/i,'pendiri founder tim badan hukum'],[/maskot|logo|warna|palet|visual/i,'visual maskot logo palet warna']];
const publicSource=s=>({id:s.id,title:s.title,type:s.type,scope:s.scope,checkedAt:s.checkedAt,url:s.url||null,sha256:s.sha256||null,note:s.note||''});
const decorate=f=>({...f,statusLabel:statuses[f.status],sources:f.sourceIds.map(id=>publicSource(sourceById.get(id)))});
const stat=()=>({version:knowledge.version,checkedAt:knowledge.checkedAt,facts:knowledge.facts.length,sources:knowledge.sources.length,campaigns:knowledge.campaigns.length,topics:[...new Set(knowledge.facts.map(f=>f.topic))]});

export const BRAND_DEFAULT={name:knowledge.name,website:knowledge.website,checkedAt:knowledge.checkedAt,audience:knowledge.identity.audience,tone:knowledge.identity.tone,keywords:knowledge.identity.keywords,facts:['pms-dashboard','reservation-calendar','reservation-hybrid','housekeeping-flow','linen-flow','billing-folio','owner-report','booking-addon','demo-flow'].map(id=>factById.get(id).text),restrictions:knowledge.restrictions,knowledgeVersion:knowledge.version};
export function knowledgeOverview(){return {...stat(),identity:knowledge.identity,visual:knowledge.visual,contacts:knowledge.contacts,sourcePolicy:knowledge.sourcePolicy,restrictions:knowledge.restrictions,sources:knowledge.sources.map(publicSource),conflicts:knowledge.conflicts,openQuestions:knowledge.openQuestions};}
export function searchKnowledge({query='',topic='',status=''}={}) {
  const wanted=tokens(query);return knowledge.facts.filter(f=>(!topic||f.topic===topic)&&(!status||f.status===status)).map(f=>{const title=tokens(f.title+' '+f.keywords.join(' ')),body=tokens(f.text);return{f,score:wanted.reduce((s,t)=>s+(title.includes(t)?5:body.includes(t)?1:0),0)};}).filter(x=>!wanted.length||x.score>0).sort((a,b)=>b.score-a.score||a.f.id.localeCompare(b.f.id)).map(x=>decorate(x.f));
}
export function relevantKnowledge(item={},limit=10) {
  const text=[item.title,item.visualContext,item.category,item.goal].filter(Boolean).join(' ');
  const expanded=text+' '+aliases.filter(([re])=>re.test(text)).map(([,extra])=>extra).join(' ');
  const primary=tokens(expanded),secondary=tokens(item.caption||'');
  const categoryTopics={'Operasional':['Operasional','Housekeeping','Linen','Tagihan'],'Reservasi':['Reservasi'],'Laporan owner':['Laporan owner'],'Website booking':['Website booking'],'Demo produk':['Brand','Penjualan','Onboarding']};
  const ranked=knowledge.facts.map(f=>{const tags=tokens(f.title+' '+f.keywords.join(' ')+' '+f.topic),body=tokens(f.text);const score=primary.reduce((n,t)=>n+(tags.includes(t)?5:body.includes(t)?1:0),0)+secondary.reduce((n,t)=>n+(tags.includes(t)?.3:0),0)+(categoryTopics[item.category]?.includes(f.topic)?3:0);return{f,score};}).sort((a,b)=>b.score-a.score||a.f.id.localeCompare(b.f.id));
  const selected=ranked.filter(x=>x.score>0).slice(0,Math.max(1,Math.min(limit,16))).map(x=>decorate(x.f));
  if(!selected.length)for(const id of ['pms-dashboard','brand-positioning','demo-flow'])selected.push(decorate(factById.get(id)));
  return {version:knowledge.version,checkedAt:knowledge.checkedAt,method:'Pemilihan catatan terkurasi berdasarkan topik dan kata kunci; bukan penelusuran web langsung.',facts:selected};
}
export function knowledgeContext(item={},profile={}) {
  const used=relevantKnowledge(item);
  return {identity:{...knowledge.identity,audience:profile.audience||knowledge.identity.audience,tone:profile.tone||knowledge.identity.tone},visual:knowledge.visual,contacts:knowledge.contacts,sourcePolicy:knowledge.sourcePolicy,restrictions:knowledge.restrictions,version:knowledge.version,checkedAt:knowledge.checkedAt,facts:used.facts.map(({id,title,text,status,approvedForCopy,sources})=>({id,title,text,status,approvedForCopy,sources:sources.map(({id,title,url})=>({id,title,url}))})),catalog:knowledge.facts.map(({id,title,text,status,approvedForCopy,sourceIds})=>({id,title,text,status,approvedForCopy,sourceIds})),openQuestions:knowledge.openQuestions};
}
export function knowledgeWarnings(item) {
  const text=[item.title,item.caption,item.visualContext].join(' '),warnings=[];
  if(/harga paket|tarif|berlangganan|harga pms|diskon|trial|gratis/i.test(text))warnings.push('Harga dan promo resmi belum terkonfirmasi. Nominal dalam proposal masih simulasi; arahkan pembaca untuk konfirmasi penawaran.');
  if(/profit|laba bersih|beban operasional|beban operational|keuntungan/i.test(text))warnings.push('Cakupan seluruh beban dan laba bersih per owner belum terverifikasi. Gunakan fitur biaya/laporan yang disebut sumber dan minta konfirmasi untuk rincian lainnya.');
  if(/founder|pendiri|badan hukum|nama tim|alamat kantor/i.test(text))warnings.push('Identitas pendiri, tim, dan badan hukum belum final pada sumber. Jangan mengisi placeholder dengan asumsi.');
  return warnings;
}
export function campaignReferences(query='') {
  const terms=tokens(query);return knowledge.campaigns.map(c=>({c,score:terms.reduce((s,t)=>s+(tokens(c.title+' '+c.caption).includes(t)?1:0),0)})).filter(x=>!terms.length||x.score>0).sort((a,b)=>b.score-a.score).slice(0,24).map(x=>x.c);
}
export function knowledgeCreative(item={}) {
  const text=[item.title,item.visualContext].filter(Boolean).join(' ');
  const choices=[
    [/OTA|Airbnb|Agoda|Booking\.com|channel manager/i,'ota-status','integrasi OTA villa',['Integrasi OTA Vayora masih segera hadir.','Perlu sinkronisasi OTA? Kenali status fiturnya dulu.','Kalender terpusat dan koneksi OTA punya cakupan berbeda.'],['#PMSVilla','#ReservasiVilla']],
    [/QRIS|Midtrans|e-wallet|metode bayar|cara bayar/i,'payments-status','pembayaran villa',['Pilihan pembayaran Vayora: cek statusnya dulu.','Semua cara bayar masih segera hadir.','Kebutuhan pembayaran tiap villa perlu dibicarakan.'],['#PMSVilla','#OperasionalVilla']],
    [/\bPOS\b|kasir/i,'pos-status','Vayora POS',['Vayora POS masih segera hadir.','Kenali fitur Vayora yang tersedia sekarang.','Kebutuhan kasir dan operasional villa perlu alur yang jelas.'],['#VayoraPOS','#PMSVilla']],
    [/harga paket|tarif|berlangganan|subscription|harga pms/i,'commercial-prices','biaya PMS villa',['Berapa biaya Vayora untuk villa Anda?','Mulai dari kebutuhan, lalu lihat penawarannya.','Cari PMS yang sesuai alur villa Anda.'],['#PMSVilla','#ManajemenVilla']],
    [/linen|laundry|sprei|handuk/i,'linen-flow','linen dan laundry villa',['Linen keluar-masuk, sudah tercatat?','Pantau perputaran linen tiap villa.','Operasional rapi juga dimulai dari linen.'],['#ManajemenLinen','#OperasionalVilla']],
    [/sarapan|breakfast|paket kamar/i,'billing-breakfast','paket kamar dan sarapan',['Biaya sarapan, sudah tercatat terpisah?','Paket kamar dan sarapan perlu rincian yang jelas.','Pantau pendapatan sarapan bersama operasional villa.'],['#OperasionalVilla','#ManajemenVilla']],
    [/meeting|ruang rapat/i,'meeting-room','pemesanan ruang meeting',['Ruang meeting juga perlu jadwal yang rapi.','Sesi ruang meeting sudah terpantau?','Kelola pemesanan ruang meeting bersama operasional properti.'],['#RuangMeeting','#ManajemenProperti']],
    [/tagihan|invoice|folio/i,'billing-folio','tagihan tamu villa',['Tagihan tamu perlu jelas sampai rinciannya.','Biaya kamar dan tambahan, tercatat di mana?','Check-out lebih tertata dengan rincian tagihan.'],['#InvoiceVilla','#OperasionalVilla']],
    [/kode promo|deposit|pembatalan|harga khusus/i,'reservation-pricing','harga dan promo villa',['Harga khusus dan promo, atur sesuai kebutuhan villa.','Satu reservasi, ketentuan yang jelas.','Deposit dan pembatalan perlu tercatat rapi.'],['#ReservasiVilla','#PMSVilla']],
    [/utuh|per kamar/i,'reservation-hybrid','sewa villa utuh atau per kamar',['Villa utuh atau per kamar? Kelola keduanya.','Dua cara sewa, satu ketersediaan yang terpantau.','Sewa utuh dan per kamar perlu kalender yang saling terhubung.'],['#ReservasiVilla','#PMSVilla']],
    [/website|booking engine|direct booking/i,'booking-addon','website booking villa',['Website villa juga bisa menerima reservasi.','Bantu pengunjung website menjadi pemesan.','Tamu ingin memesan. Apakah tanggalnya tersedia?'],['#WebsiteBooking','#ReservasiVilla']],
    [/laba bersih|beban operasional|beban operational|profit|keuntungan/i,'owner-cost-claims','laporan owner villa',['Kenali angka yang tersedia di laporan Vayora.','Pendapatan dan biaya perlu dilihat dengan konteks.','Apa yang ingin Anda pantau dari bisnis villa?'],['#LaporanOwner','#BisnisVilla']],
    [/bukti|housekeeping|bersih|kamar siap|tamu tiba/i,'housekeeping-flow','housekeeping villa',['Tamu sudah datang. Kamarnya sudah siap?','Status kamar perlu jelas sebelum tamu tiba.','Kamar siap perlu bukti dan persetujuan.'],['#HousekeepingVilla','#ManajemenVilla']],
    [/okupansi|pendapatan|laporan|owner|target/i,'owner-report','laporan owner villa',['Owner butuh laporan yang jelas, bukan tebakan.','Sudah tahu kondisi tiap villa hari ini?','Pantau bisnis villa tanpa harus selalu datang.'],['#LaporanOwner','#BisnisVilla']],
  ];
  const found=choices.find(([re])=>re.test(text));if(!found)return null;
  const [,id,keyword,hooks,tags]=found;let benefit=factById.get(id).text;
  if(id==='commercial-prices')benefit='Ceritakan jumlah villa, kamar, dan alur operasional Anda. Tarif serta cakupan layanan dikonfirmasi melalui penawaran Vayora yang disepakati.';
  if(id==='booking-addon')benefit='Tampilkan harga dan ketersediaan dari kalender properti melalui website booking Vayora. Booking engine tersedia sebagai layanan tambahan.';
  if(id==='ota-status')benefit='Integrasi OTA seperti Booking.com, Airbnb, dan Agoda masih segera hadir. Saat ini, kenali kalender reservasi dan ketersediaan yang tercatat di Vayora.';
  if(id==='payments-status')benefit='Semua cara bayar masih ditandai segera hadir. Konfirmasikan metode pembayaran yang diperlukan saat melihat alur Vayora.';
  if(id==='billing-folio')benefit='Susun biaya kamar, pajak, dan biaya tambahan dalam satu rincian tagihan tamu melalui Vayora.';
  if(id==='linen-flow')benefit='Pantau perputaran sprei dan handuk dari kamar ke laundry dan kembali, beserta biaya terkait, melalui Vayora.';
  if(id==='meeting-room')benefit='Kelola pemesanan ruang meeting per sesi atau per jam, termasuk kebutuhan paket snack dan makan, bersama operasional properti di Vayora.';
  if(id==='reservation-pricing')benefit='Atur harga sesuai periode, harga khusus, kode promo, deposit, dan ketentuan pembatalan melalui Vayora.';
  if(id==='pos-status')benefit='Vayora POS masih ditandai segera hadir. Sambil menyiapkan kebutuhan kasir, kenali fitur PMS Vayora yang tersedia untuk operasional properti.';
  if(id==='reservation-hybrid')benefit='Sewa villa utuh atau per kamar dengan ketersediaan yang saling menutup di Vayora, untuk membantu mengurangi risiko jadwal bentrok.';
  if(id==='owner-cost-claims')benefit='Pantau okupansi, pendapatan, dan pencapaian target melalui Vayora. Konfirmasikan cakupan pencatatan biaya dan perhitungan laba sesuai kebutuhan properti saat demo.';
  if(id==='housekeeping-flow')benefit='Petugas mengunggah foto kebersihan lewat HP. Admin memeriksa dan menyetujui sebelum kamar dinyatakan siap dijual melalui Vayora.';
  return {factId:id,keyword,hooks,tags,benefit};
}
export function exportKnowledge(){return structuredClone(knowledge);}
