# Vayora Social Studio

Webapp internal tim Vayora menggunakan **Next.js 16 App Router + React 19**. Lokasi aktif: `E:\Work\VAYORA\Vayora-SocialStudio`. Login tim dan penyimpanan database berfungsi nyata. Pustaka awal berisi 24 konsep asli: 10 Reels, 8 image post, dan 6 carousel.

## Mulai dan uji login

1. Jalankan `Mulai-Vayora.cmd` di folder ini.
2. Buka http://localhost:3210.
3. Login dengan akun tim yang sudah dipindahkan dari proyek sebelumnya. Tidak perlu membuat akun baru.
4. Coba Keluar, lalu Masuk menggunakan akun tersebut.

Tidak ada username atau password bawaan. Email dipakai sebagai identitas login lokal; tidak ada email yang dikirim otomatis.

## Kebutuhan

- Node.js 24 atau lebih baru.
- FFmpeg dan ffprobe tersedia di PATH untuk membaca video dan menyiapkan Reels.
- Dependensi sudah terpasang di komputer ini. Untuk instalasi baru, jalankan `npm ci` lalu `npm run build`.

Perintah alternatif lokal: `npm run start:local` setelah `npm run build`. Untuk development gunakan `npm run dev`. Untuk mengimpor ulang konten awal yang belum ada: `npm run seed`. Impor tidak menimpa ID yang sudah tersimpan.

## Alur penggunaan

Pustaka → buka ringkasan detail → pilih Edit konten → periksa media dan caption → berikan persetujuan → tandai siap tayang atau simpan jadwal. Perubahan materi perlu persetujuan baru. Semua tanggal publikasi menggunakan WIB.

Jadwal tampil langsung pada card pustaka. Tombol Post sekarang membuka pemeriksaan sebelum publikasi manual; akun Instagram dan publikasi nyata harus siap. Jadwal lama konten itu digantikan, sementara antrean lain tidak dilanjutkan. Antrean dapat dijeda dan jadwal dapat dibatalkan. Konten terbit hanya dapat disalin. Hasil yang belum pasti dikunci sampai status dari Meta diperiksa, untuk mencegah unggahan ganda.

**Hapus konten** ada di dialog Detail. Konten terjadwal ikut dibatalkan jadwalnya; konten yang sedang diproses atau hasilnya belum pasti tidak dapat dihapus; konten terbit hanya dapat dihapus pemilik dan postingan di Instagram tetap ada. Konten terhapus hilang dari pustaka, kalender, dan antrean, tetapi riwayatnya tetap tersimpan dan ID-nya tidak dipakai ulang. API: `DELETE /api/posts/:id?revision=N` (session + header `x-csrf-token`).

Impor mendukung file media, pengelompokan nama C01-slide-1.png dan seterusnya, serta caption Markdown/JSON/CSV berdasarkan ID. Gambar dikonversi menjadi JPEG sRGB. Video disiapkan dengan faststart dan audio AAC 128 kbps; file produksi asli tidak diubah.

## Susunan menu

Sidebar mengikuti urutan kerja: **Konten** (Pustaka, Impor konten, Kalender) → **Buat** (Asisten caption, Desain konten) → **Terbitkan** (Pemeriksaan, Antrean) → **Strategi** (Strategi konten, Marketing, Pengetahuan brand) → **Pengaturan** (Koneksi & publikasi, Pengaturan AI, Akun tim, Riwayat). Alamat halaman tidak berubah, misalnya `/settings` untuk Koneksi & publikasi.

## Mobile dan bahasa

Pada ponsel, gunakan navigasi bawah satu baris: Pustaka, Kalender, Antrean, Asisten, dan Menu. Detail memakai popup ringkas mengambang dengan sudut membulat, latar blur, dan tombol Edit terpisah. Tombol simpan/jadwal tetap terlihat di footer saat editor digulir. Pemilih ID/EN tersedia pada login, header, popup, dan menu. Bahasa disimpan pada browser; caption serta materi sumber tetap dalam bahasa aslinya. [Panduan pustaka dan mobile](docs/PUSTAKA-DAN-MOBILE.md).

## Asisten konten dan desain

Fitur tersedia melalui menu terpisah: **Asisten caption** untuk mulai dari konten, **Desain konten** untuk image post dengan logo asli, **Pengetahuan brand** untuk acuan AI, **Pengaturan AI** untuk koneksi/batas/arah penulisan, dan **Strategi konten** untuk panduan campaign. Dari editor tersedia tiga pilihan caption/hashtag, pemeriksaan editorial, dan tiga waktu uji posting dalam WIB. Bantuan lokal dan pembuat desain bisa langsung digunakan; mode yang benar-benar membaca gambar dan membuat latar AI memerlukan API key/kredit OpenAI.

Hasil bantuan dibandingkan sebelum diterapkan, dapat dibatalkan, dan tidak otomatis tersimpan atau diterbitkan. Riwayat versi tersimpan dapat dipulihkan sebagai draft. Saran waktu tetap hipotesis sampai pengamatan performa sebanding mencukupi. Panduan, batas analisis Reel/carousel, pengaturan key, dan prioritas marketing berikutnya ada di [docs/ASISTEN-KONTEN.md](docs/ASISTEN-KONTEN.md).

Bank pengetahuan brand berisi 57 catatan, 14 sumber, dan 24 referensi kampanye. Cari topik atau filter status melalui Pengetahuan brand; hasil caption menampilkan catatan konteks yang diberikan kepada asisten. Harga simulasi, placeholder, dan fitur segera hadir dipisahkan dari klaim yang boleh digunakan. Ringkasan lengkap: [docs/PENGETAHUAN-BRAND-VAYORA.md](docs/PENGETAHUAN-BRAND-VAYORA.md).

## Campaign dan marketing

Buka **Marketing** dari sidebar atau Menu di ponsel. Buat campaign per konten/pembuka dengan UTM, uji tracking lokal, catat demo terkonfirmasi, unduh laporan, dan simpan pengamatan performa manual/CSV. Data uji dipisahkan dari produksi. Perbandingan hanya muncul ketika sampel sebanding mencukupi; tidak ada angka hasil atau jam terbaik contoh.

Pengukuran website produksi memerlukan HTTPS publik dan pemasangan tracker di vayora.id. Publikasi TikTok serta sinkronisasi Insights otomatis belum ditambahkan; performa TikTok dapat dicatat dari platform. [Panduan marketing dan pemasangan](docs/MARKETING.md).

## Koneksi Instagram

Publikasi nyata nonaktif secara bawaan dan antrean dijeda. Kamu tetap dapat memakai login, pustaka, pemeriksaan, dan kalender. Tidak ada akun Instagram demo yang ditampilkan sebagai akun tersambung.

Cara tercepat: buka **Pengaturan → Koneksi & publikasi**, lalu tempel access token dari tombol **Generate token** di dashboard Meta (Instagram → API setup; token Unified login `EAA…` maupun Instagram login `IGAA…` didukung). Cara ini tidak memerlukan App ID, App Secret, atau redirect URI; Studio menyimpan token terenkripsi dan memperpanjangnya otomatis. Login Meta dengan App ID dan App Secret tetap tersedia sebagai cara lanjutan. Langkah lengkap ada di [panduan Instagram](docs/INSTAGRAM.md). Jangan masukkan password Instagram pada form Social Studio.

## YouTube Shorts

Short adalah format konten tersendiri: satu video MP4 vertikal maksimal 3 menit, dengan judul konten sebagai judul YouTube dan caption sebagai deskripsi. Pilih *YouTube Short* sebagai tujuan video saat impor (file `S01-…` otomatis), hubungkan channel di **Pengaturan → Koneksi & publikasi → YouTube Shorts** dengan Client ID/Secret dari Google Cloud, lalu jadwalkan seperti konten lain. Sebelum project Google lolos audit API YouTube, video yang diunggah tetap dikunci privat oleh YouTube. Langkah lengkap dan API: [panduan YouTube](docs/YOUTUBE.md).

## Akun tim

Pemilik dapat membuat undangan editor dari Akun tim. Tautan berlaku 48 jam dan hanya sekali pakai; kirimkan tautannya sendiri. Editor tidak dapat mengubah secret Meta atau mengaktifkan publikasi nyata. Ganti password tersedia dari Akun tim dan mengeluarkan sesi lain.

## Data dan backup

Seluruh data berada di folder `data/`: database SQLite, media, dan `.encryption-key`. Simpan backup seluruh folder saat server berhenti. Kunci enkripsi harus ikut dibackup agar koneksi Meta dapat dipulihkan. Jangan mengunggah folder data atau `.env` ke Git atau membagikannya.

`Hentikan-Vayora.ps1` hanya menghentikan proses yang dimulai launcher ini dan cocok dengan lokasi proyek. Proses yang dibuka dari terminal dapat dihentikan dengan Ctrl+C pada terminal tersebut.

## Pengujian

`npm test` menjalankan pengujian akses, session, CSRF, undangan, persetujuan, konflik revisi, OAuth state, dan pencegahan publikasi ganda. Transport Meta palsu hanya berada di pengujian. Data pengujian terpisah dari akun dan pustaka pengguna.

PRD ada di [docs/PRD.md](docs/PRD.md).

## Saat dipasang online

Paket Docker Linux, konfigurasi HTTPS, dan script migrasi data tersedia. Ikuti [panduan deployment](docs/DEPLOYMENT.md). Paket source dibuat melalui `scripts/package-deployment.ps1`; data akun/media/key dipindahkan terpisah secara privat. Server produksi menolak berjalan tanpa akun pemilik yang sudah dimigrasikan.

Gunakan VPS/server Node 24+, HTTPS reverse proxy, volume data persisten, dan pengelola proses agar aplikasi hidup 24 jam. Isi `APP_ORIGIN=https://alamat-domain`, `PUBLIC_BASE_URL=https://alamat-domain`, dan host yang sesuai melalui `.env`. Restart server, lalu buka aplikasi melalui alamat HTTPS tersebut sebelum menghubungkan Instagram, agar session OAuth memakai domain yang sama. Lindungi backup dan batasi akses jaringan sesuai kebutuhan tim.

Versi lokal berhenti memublikasikan saat komputer tidur atau proses server mati. Jadwal yang lewat lebih dari lima menit tidak dipublikasikan sekaligus setelah aplikasi kembali hidup.

Dokumentasi struktur, batas migrasi UI, dan verifikasi Next.js: [MIGRASI-NEXTJS.md](docs/MIGRASI-NEXTJS.md).
