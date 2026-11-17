import { existsSync } from 'node:fs';
import { mediaPath } from './media.mjs';

export function postReadiness(store,item,instagram) {
  const ids=Array.isArray(item.mediaIds)?item.mediaIds:[],media=ids.map(id=>store.get('SELECT * FROM media WHERE id=?',id));
  const filesReady=media.length>0&&media.every(m=>m&&existsSync(mediaPath(store,m)));
  const formatReady=filesReady&&(item.format==='Reel'?media.length===1&&media[0].mime==='video/mp4'&&media[0].duration>=3&&media[0].duration<=900:item.format==='Carousel'?media.length>=2&&media.length<=20&&media.every(m=>m.mime==='image/jpeg'&&m.width/m.height>=.799&&m.width/m.height<=1.911):item.format==='Gambar'&&media.length===1&&media[0].mime==='image/jpeg'&&media[0].width/media[0].height>=.799&&media[0].width/media[0].height<=1.911);
  const captionReady=typeof item.caption==='string'&&!!item.caption.trim()&&item.caption.length<=2200;
  const coverReady=item.format!=='Reel'||!item.coverId||(()=>{const cover=store.get('SELECT * FROM media WHERE id=?',item.coverId);return cover?.mime==='image/jpeg'&&existsSync(mediaPath(store,cover));})();
  const locked=['published','processing','uncertain'].includes(item.status)||!!item.mediaId||!!item.job?.publishRequested;
  const live=instagram.status();
  const checks=[
    {id:'media',label:'Media dan format',ok:!!formatReady&&!!coverReady,required:true,action:'edit',detail:!filesReady?'Media perlu diunggah ulang.':!formatReady?'Periksa jumlah, tipe, rasio, atau durasi media.':!coverReady?'Cover Reel tidak ditemukan.':'Media tersedia dan format sesuai.'},
    {id:'caption',label:'Caption',ok:captionReady,required:true,action:'edit',detail:captionReady?'Caption terisi dan dalam batas karakter.':'Isi caption dengan maksimal 2.200 karakter.'},
    {id:'alt',label:'Deskripsi aksesibilitas',ok:item.format==='Reel'||!!String(item.alt||'').trim(),required:false,action:'edit',detail:item.format==='Reel'?'Tidak diterapkan untuk Reel.':String(item.alt||'').trim()?'Deskripsi sudah terisi.':'Tambahkan deskripsi gambar untuk pembaca layar.'},
    {id:'approval',label:'Persetujuan materi',ok:item.approved===true,required:true,action:'edit',detail:item.approved?'Media dan caption telah disetujui.':'Tinjau materi dan berikan persetujuan di editor.'},
    {id:'instagram',label:'Koneksi Instagram',ok:live.connected,required:true,action:'settings',detail:live.connected?'Instagram terhubung.':'Hubungkan akun profesional melalui Instagram & publikasi.'},
    {id:'https',label:'HTTPS publik',ok:live.publicUrlReady,required:true,action:'settings',detail:live.publicUrlReady?'Alamat media publik siap.':'Siapkan HTTPS publik agar Meta dapat mengambil media.'},
    {id:'live',label:'Publikasi aktif',ok:store.setting('publishingEnabled',false),required:true,action:'settings',detail:store.setting('publishingEnabled',false)?'Publikasi nyata diaktifkan.':'Pemilik perlu mengaktifkan publikasi nyata.'},
  ];
  const contentReady=!!formatReady&&!!coverReady&&captionReady&&item.approved===true;
  return {postId:item.id,locked,contentReady,ready:!locked&&checks.filter(c=>c.required).every(c=>c.ok),checks,note:locked?'Konten sedang diproses, telah terbit, atau hasilnya perlu dipastikan.':'Pemeriksaan ini memvalidasi kelengkapan. Persetujuan manusia tetap diperlukan untuk isi penawaran dan hak penggunaan media.'};
}
