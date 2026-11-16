# Campaign, pengukuran, dan pembelajaran Vayora

## Mulai di komputer ini

Buka http://localhost:3210/#marketing setelah login. Pada ponsel, Marketing berada di Menu agar navigasi bawah tetap satu baris.

1. Buat campaign dengan nama, konten, kanal, distribusi, pembuka, dan path tujuan di vayora.id. Tujuan tidak dapat diarahkan ke domain lain.
2. Gunakan **Uji tracking** untuk menguji kunjungan, tombol CTA, dan pencatatan demo. Halaman uji tidak mengirim pesan atau formulir pelanggan. Demo uji memerlukan sesi login Studio.
3. Aktifkan **Data uji** pada laporan. Hasil uji tidak masuk angka produksi dan tidak mengubah status koneksi website produksi.
4. Untuk campaign publik sebelum tracker terpasang, salin tautan website + UTM. Tautan localhost hanya dapat diakses dari komputer ini dan tidak cocok dipasang pada bio publik.

Nama campaign dan konten/pembuka masuk `utm_campaign` dan `utm_content`; kanal dan distribusi masuk `utm_source` serta `utm_medium`. ID `vsc` menghubungkan kunjungan website dengan campaign Studio. Pada Instagram, gunakan tautan melalui bio/fitur tautan yang tersedia; teks URL dalam caption bukan jalur klik utama.

## Arti angka

- **Klik tautan**: permintaan redirect `/go/<id>` ketika pengukuran diaktifkan. Bot/pratinjau yang dikenali diabaikan, tetapi filter ini tidak sempurna dan kunjungan berulang dapat menambah hitungan.
- **Kunjungan campaign**: sesi browser yang berbeda per campaign pada periode laporan. Sesi berasal dari sessionStorage, bukan identitas orang. Angka total menjumlahkan campaign sehingga seseorang yang mengunjungi beberapa campaign dapat terhitung beberapa kali.
- **Klik CTA**: event klik tombol yang ditandai atau tautan WhatsApp, termasuk klik berulang. Bukan percakapan atau demo yang sudah diterima.
- **Permintaan demo**: konfirmasi manual setelah permintaan nyata diterima, atau konfirmasi backend sesudah formulir berhasil divalidasi dan disimpan. Bukan submit/click browser.

Laporan bukan funnel satu kohort pengunjung yang sama. Persetujuan analytics, Do Not Track, pemblokir browser, atribusi dalam satu tab selama maksimal 24 jam, perangkat berbeda, dan parameter yang hilang dapat membuat pengukuran tidak lengkap. Ini bukan sistem pencatatan keuangan atau identitas pelanggan.

Pencatatan manual membutuhkan ID internal dan konfirmasi. Nama, email, serta nomor telepon tidak perlu dimasukkan. ID referensi yang sama pada campaign dan mode data yang sama tidak dihitung dua kali. Gunakan ID yang sama jika mengirim ulang permintaan yang sama; jangan catat lagi secara manual bila sudah masuk melalui backend. Sumber manual tersedia terpisah dalam data laporan/API. Unduhan CSV memuat campaign, konten, kanal, distribusi, pembuka, metrik, dan mode data.

## Menyambungkan website produksi

Fitur lokal sudah dapat diuji. Penerimaan event dari vayora.id membutuhkan server Studio dengan HTTPS publik yang berjalan terus, lalu pemasangan tracker pada website. Mengisi URL di panel tidak menerbitkan server secara otomatis.

1. Pasang Studio di server Node 24+ dengan penyimpanan `data/` persisten, HTTPS, pengelola proses, dan backup. Atur `APP_ORIGIN` sesuai domain HTTPS lalu restart sebelum login melalui domain tersebut, agar cookie sesi memakai pengaturan HTTPS.
2. Pemilik mengisi **Alamat HTTPS publik Social Studio** di Marketing dan mengaktifkan penerimaan event.
3. Pada website, muat tracker **setelah persetujuan analytics** diberikan. Salin kode dari panel karena sudah berisi domain serta `data-site` workspace. ID site memang publik dan bukan kunci rahasia.

```html
<!-- Jalankan melalui mekanisme persetujuan analytics website. -->
<script>window.vayoraAnalyticsConsent = true;</script>
<script async src="https://studio.domainkamu.id/tracker.js"
  data-site="SALIN_ID_SITE_DARI_PANEL"></script>
```

Kode di atas contoh pemasangan; jangan otomatis menetapkan persetujuan untuk semua pengunjung. Tracker tidak berjalan bila consent belum true atau Do Not Track bernilai 1. Jika consent dicabut, ubah variabel menjadi false. Tracker tidak mengirim isi formulir, nama, email, nomor telepon, atau query URL selain ID campaign; path selain halaman publik yang diizinkan dinormalisasi menjadi `/`. Server menyimpan hash sesi, bukan raw IP/sesi browser. Browser yang tidak mengizinkan sessionStorage tidak diukur.

Izinkan domain Studio pada `script-src` dan `connect-src` CSP website jika diperlukan. Endpoint browser hanya menerima origin vayora.id/www.vayora.id dan origin aplikasi. Tidak perlu password Instagram atau API secret pada kode website.

Tambahkan `data-vayora-cta="demo_button"` pada tombol demo. Tautan ke wa.me/api.whatsapp.com dikenali sebagai klik WhatsApp. Halaman yang telah memuat tracker dapat membaca `window.VayoraAnalytics?.campaignId` untuk mengisi referensi campaign pada formulir, tanpa menganggapnya sebagai bukti konversi. Setelah pemasangan, uji dengan URL campaign nyata dan pastikan **Event website diterima** muncul pada laporan produksi.

## Demo dari backend formulir

Pemilik membuat kunci backend dari panel. Kunci ditampilkan sekali, tersimpan terenkripsi di Studio, dan hanya boleh dipasang di server website. Rotasi membatalkan kunci lama.

Setelah formulir benar-benar berhasil divalidasi dan disimpan, backend website mengirim:

```http
POST https://studio.domainkamu.id/tracking/webhook
Content-Type: application/json
x-vayora-event-key: KUNCI_BACKEND_TERSIMPAN_DI_SERVER
```

```json
{
  "eventId": "demo_request_REF_20261116_001",
  "campaignId": "ID_CAMPAIGN_DARI_VSC",
  "type": "demo_request",
  "path": "/"
}
```

`eventId` harus 12–80 karakter huruf/angka/underscore/tanda hubung. Gunakan ID yang sama untuk retry permintaan yang sama agar idempotent. Jangan memasukkan kontak pelanggan. Gunakan `"test": true` saat uji integrasi backend agar tidak mencampur laporan. Konversi browser ditolak; halaman tidak boleh menyimpan kunci backend. Validasi bahwa campaign tersebut memang terkait permintaan calon pelanggan.

Jika website sudah memakai GA4, event `generate_lead` sebaiknya juga dipicu setelah permintaan yang valid benar-benar berhasil. Integrasi GA4 tidak dipasang otomatis oleh proyek ini. Acuan: [recommended event generate_lead](https://developers.google.com/analytics/devguides/collection/ga4/reference/events#generate_lead).

## Input performa dan CSV

Angka Instagram/TikTok saat ini **diinput manual atau diimpor CSV**, bukan otomatis dari Insights. Isi waktu pengamatan sebenarnya, bukan waktu impor. Jendela yang tersedia 24, 48, 72, atau 168 jam setelah terbit; pengamatan diterima dalam enam jam setelah jendela tersebut selesai supaya perbandingan tidak mencampur data umur berbeda.

- Instagram harus berstatus terbit di Studio dan memiliki waktu terbit tersimpan. Waktu terbit di form dinonaktifkan untuk Instagram.
- TikTok dapat memakai aset pustaka yang diunggah secara terpisah di platform. Waktu terbit aktual dari TikTok wajib diisi; ini tidak mengubah status publikasi Instagram.
- Jangkauan, simpan, dan bagikan wajib angka bulat nol atau lebih. Kosong berbeda dari nol. Kunjungan profil opsional.
- Waktu input form adalah WIB. CSV harus menggunakan ISO dengan zona waktu, misalnya `2026-11-16T19:30:00+07:00`.
- Pengamatan yang sama berdasarkan konten/kanal/distribusi/jendela diperbarui, bukan ditambahkan sebagai sampel baru.

Header CSV:

```csv
postId,channel,distribution,windowHours,publishedAt,observedAt,reach,saves,shares,profileVisits
```

Nilai channel `instagram` atau `tiktok`; distribution `organic` atau `paid`. `publishedAt` diperlukan untuk TikTok dan diabaikan pada Instagram karena menggunakan waktu terbit Studio. Maksimal 100 baris/150 KB. Impor dibatalkan seluruhnya jika ada baris salah; pesan menampilkan baris yang perlu diperbaiki. Sumber `manual_from_platform`/`csv_import` terlihat pada pengamatan tersimpan.

## Kapan aplikasi mulai belajar

Perbandingan menunggu minimal tiga konten organik dengan kanal, format, dan jendela yang sama; peringkat memakai `(simpan + bagikan) / jangkauan`. Data berbayar disimpan terpisah dan tidak dicampur dengan organik. Ini pengamatan berdasarkan input pengguna, bukan eksperimen terkontrol; topik dan ukuran audiens tetap dapat memengaruhi hasil. Belum ada metrik retention/watch time atau sinkronisasi Insights otomatis.

Saran waktu dari data nyata memerlukan minimal dua kelompok waktu, masing-masing minimal tiga konten Instagram organik dengan format yang sama, jendela 48 jam, dan total jangkauan 100. Jika belum cukup, aplikasi memberikan hipotesis waktu uji. Saran tetap tidak menjamin hasil atau membuktikan sebab-akibat. Pembelajaran waktu berfokus Instagram; tidak memprediksi jam TikTok dari data Instagram.

## Keadaan yang perlu dibedakan

Login Studio lokal sudah dapat dipakai. Publikasi Instagram tetap memerlukan akun profesional, aplikasi Meta, izin, HTTPS publik, dan pengaktifan oleh pemilik. Caption vision/latar generatif memerlukan koneksi OpenAI dan kredit; mode lokal/desain brand tetap tersedia. Tidak ada akun Meta, angka Insights, lead, atau konversi produksi yang dibuat sebagai data contoh di workspace pengguna.
