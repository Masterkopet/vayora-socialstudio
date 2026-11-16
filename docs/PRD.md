# Vayora Social Studio

Versi 1.0 — 16 November 2026

## Tujuan

Webapp internal Vayora untuk menyiapkan, memeriksa, menjadwalkan, dan memublikasikan konten Instagram dari satu workspace. Pengujian pertama berjalan di komputer pengguna. Aplikasi Meta belum tersedia, sehingga login tim harus dapat diuji secara mandiri dan koneksi Instagram harus menjelaskan kebutuhan konfigurasi secara jujur.

## Pengguna dan akses

- Pemilik membuat akun pertama melalui halaman pengaturan awal lokal.
- Login menggunakan email dan password, session di server, logout, ganti password, dan undangan anggota tim melalui tautan sekali pakai.
- Pemilik dapat mengatur koneksi Instagram, publikasi, dan anggota tim. Editor mengelola konten dan jadwal.
- Tidak ada akun demo dengan password bawaan. Form Instagram tidak meminta password Instagram.

## Halaman

1. Pengaturan awal dan login tim
2. Kalender mingguan, bulanan, dan agenda dengan WIB
3. Pustaka konten dengan filter format, tujuan, dan status
4. Pemeriksaan sebelum tayang
5. Editor caption, alt text, cover Reel, dan urutan carousel
6. Impor media dan caption melalui ID konten
7. Antrean, jeda global, pembatalan, dan penjadwalan ulang
8. Riwayat perubahan serta hasil publikasi
9. Pengaturan Instagram dan petunjuk Meta
10. Profil, ganti password, dan undangan tim

## Alur konten

Draft → Perlu diperiksa → Siap tayang → Terjadwal → Memproses → Terbit.

Hasil gagal dan hasil yang belum dapat dipastikan ditangani terpisah. Jadwal yang terlewat lebih dari lima menit tidak diterbitkan sekaligus ketika aplikasi dinyalakan kembali. Setiap publikasi memerlukan persetujuan media dan caption. Perubahan materi mereset persetujuan dan jadwal aktif; jadwal yang sedang diproses terkunci. Konten yang sudah terbit hanya dapat disalin sebagai draft baru.

## Pustaka awal

Impor 24 konsep asli dari produksi sebelumnya: 10 video, 8 image post, 6 carousel dengan total 30 slide. Gunakan media resolusi asli dan caption manifest. Semua konten awal berstatus draft tanpa tanggal publikasi aktif. Gambar disiapkan sebagai JPEG untuk publikasi API; file sumber tetap dipertahankan di folder aslinya.

## Koneksi Instagram

- Jalur Instagram API with Instagram Login; akun Instagram Business atau Creator.
- OAuth state sekali pakai, kedaluwarsa, dan terikat ke session pemilik.
- Authorization Code ditukar di server; access token dienkripsi dan tidak dikirim ke browser.
- App ID dan App Secret diisi melalui environment server. UI menampilkan kesiapan tanpa menampilkan secret.
- Callback dan media membutuhkan alamat HTTPS yang dapat dijangkau internet saat integrasi diaktifkan.
- Sediakan pemeriksaan koneksi, sambungkan ulang, dan putuskan koneksi.
- App belum dikonfigurasi bukan berarti login berhasil. Tampilkan langkah penyiapan yang diperlukan.

## Publikasi dan ketahanan

- Publikasi nyata nonaktif secara bawaan. Pemilik mengaktifkannya setelah koneksi dan URL publik siap.
- Penjadwal berjalan di server selama proses aplikasi aktif.
- Simpan container ID sebelum publishing, tandai permintaan publikasi sebelum panggilan jaringan, dan simpan media ID hasil.
- Pada timeout atau crash setelah publish dikirim, periksa status container; jangan mengirim publish kedua secara buta.
- Hasil tidak pasti memerlukan pemeriksaan. Konten yang tercatat terbit tidak dapat diterbitkan ulang.
- Jeda global mempertahankan jadwal. Tidak ada konten dipublikasikan selama koneksi atau izin tidak valid.
- Uji integrasi otomatis memakai transport Meta palsu yang terisolasi di test, bukan koneksi palsu di aplikasi pengguna.

## Penyimpanan dan keamanan

SQLite untuk akun, session, konten, media, koneksi, OAuth state, undangan, dan audit. Media tersimpan di direktori data lokal; data bertahan saat refresh atau restart. Password memakai scrypt dan salt unik. Cookie session HttpOnly, SameSite, kedaluwarsa, CSRF token, pembatasan percobaan login, pemeriksaan Origin, dan otorisasi per endpoint. Media memerlukan session; URL media untuk Meta ditandatangani dengan masa berlaku terbatas. Tolak tipe file dan ID konten yang tidak valid. Jangan menyimpan password atau token di log.

## Kriteria penerimaan

- Pengguna dapat membuat akun sendiri, logout, login ulang, mengganti password, dan mempertahankan data setelah restart.
- Akses dashboard/API/media tanpa session ditolak.
- Seluruh 24 konsep muncul dengan media asli; video dapat diputar dan carousel berurutan benar.
- Simpan caption, reorder, persetujuan, penjadwalan lintas bulan, jeda, pembatalan, impor, dan audit bertahan di database.
- Undangan sekali pakai dapat diterima dan tidak memberikan hak pemilik kepada editor.
- Belum ada Meta app: tombol koneksi memberikan panduan, tidak menampilkan status terhubung palsu.
- OAuth invalid state ditolak. Token tidak muncul dalam respons browser.
- Pengujian membuktikan penerbitan ganda dicegah pada retry dan hasil tidak pasti.
- Tata letak dapat digunakan pada desktop dan ponsel.

## Batas pengujian pertama

Tidak ada publikasi Instagram nyata sebelum pengguna menyiapkan aplikasi Meta, akun profesional, dan HTTPS publik. Tidak ada email otomatis tanpa penyedia email; undangan berupa tautan yang dapat disalin. Publikasi lokal berhenti ketika komputer atau proses server mati. Panduan deploy mandiri disertakan untuk penggunaan 24 jam.

## Referensi implementasi

### Penambahan asisten konten — 16 November 2026

Implementasi: [ASISTEN-KONTEN.md](ASISTEN-KONTEN.md).

- Caption: tiga pilihan hook, caption, hashtag, kata kunci, CTA; mode lokal diberi label sebagai bantuan konteks, mode vision membaca media nyata melalui API setelah konfigurasi pemilik. Reel hanya cover/poster; carousel semua slide, alt text gambar pertama.
- Pemeriksaan editorial berbasis aturan untuk klaim, fitur segera hadir, duplikasi, CTA, panjang caption, dan deskripsi aksesibilitas. Tidak menampilkan skor SEO atau prediksi jangkauan.
- Waktu posting: tiga slot uji WIB dalam 14 hari, masa depan dan tidak berdekatan dengan konten terjadwal/terbit yang tercatat. Belum personalisasi Insights, tidak mengatur delivery iklan berbayar.
- Image post: komposisi lokal 1080 × 1350 memakai logo dan palet asli, copy editable, preview, download, dan pembuatan draft eksplisit. Latar AI opsional; logo dan copy tidak digambar ulang oleh AI.
- Arah brand: target audiens dan tone dapat diubah pemilik; fakta produk dan batas klaim mengikuti sumber Vayora yang ditinjau.
- Pengetahuan brand: 57 catatan terkurasi dari 14 sumber serta 24 referensi kreatif; pencarian/filter status, ekspor JSON, status ketidakpastian, dan enam perbedaan sumber tercatat. AI mendapat katalog lengkap serta prioritas catatan relevan; hasil caption memperlihatkan konteks yang diberikan. Sumber mentah tidak dijadikan instruksi model. Detail: [PENGETAHUAN-BRAND-VAYORA.md](PENGETAHUAN-BRAND-VAYORA.md). Pembaruan fakta memerlukan peninjauan, bukan crawling otomatis.
- Koneksi AI: API key terenkripsi, batas permintaan harian, satu proses AI bersamaan, error provider disanitasi, tidak retry otomatis. Hanya pemilik mengubah key/batas dan membuat latar AI berbayar. Editor dapat memakai caption dan desain lokal.
- Hasil tidak mengubah konten sampai diterapkan; penerapan membatalkan approval lama. Tidak ada publikasi otomatis dari generator.
- Fondasi evaluasi marketing: sebaran topik dan pembuat tautan UTM. Pengukuran performa akun, analytics website, conversion event, rekomendasi berbasis data, dan analisis per campaign merupakan pengembangan berikutnya; tidak ada angka performa fiktif.

### Pustaka dan mobile bilingual — 16 November 2026

- Detail pustaka memakai dialog native di atas daftar, tanpa pindah rute. Jadwal tampil pada card; filter/posisi daftar dan fokus kembali dipertahankan. Draft tidak dibuang tanpa konfirmasi.
- Post sekarang memerlukan pemeriksaan, persetujuan eksplisit, koneksi Instagram, HTTPS, serta live publishing. Endpoint memeriksa revisi dan status, mengklaim record sebelum proses jaringan, mengembalikan 202, dan UI memantau hasil. Konten terbit/processing/uncertain tidak dapat diposting ulang. Posting manual tidak melanjutkan antrean lain yang dijeda.
- Navigasi bawah satu baris pada ≤800 px: Pustaka, Kalender, Antrean, Asisten, Menu. Menu sekunder berisi pemeriksaan, riwayat, pengaturan, akun, impor, serta bahasa. Dialog mengambang pada ponsel, sudut 24 px, tinggi maksimal 76dvh pada mobile dengan margin samping 24 px (88dvh desktop), backdrop blur 10 px, dan transisi singkat dengan dukungan reduced motion; safe area, target sentuh, media proporsional, dan overflow diuji.
- UI Indonesia/English dengan pilihan tersimpan pada browser. Mengganti bahasa tidak menimpa caption/judul/media/dokumen sumber dan tidak merusak nilai kategori/status di server.
- Rincian dan verifikasi: [PUSTAKA-DAN-MOBILE.md](PUSTAKA-DAN-MOBILE.md).

### Referensi Instagram

- https://developers.facebook.com/documentation/instagram-platform/instagram-api-with-instagram-login
- https://developers.facebook.com/documentation/instagram-platform/content-publishing
- https://developers.facebook.com/documentation/instagram-platform/instagram-graph-api/reference/ig-user/media
