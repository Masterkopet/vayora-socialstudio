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

Untuk tim: buka **Beranda** untuk melihat jadwal 7 hari, konten yang perlu ditinjau, status koneksi, dan pemberitahuan masalah (konten gagal atau belum pasti terbit, koneksi Instagram/YouTube terputus atau segera habis, jadwal yang tidak akan terbit). Klik **Buat posting** (formulir di kiri, pratinjau Instagram/YouTube Shorts di kanan; file bisa ditarik & dilepas), lalu ikuti empat langkah: pilih Instagram atau YouTube Shorts → unggah foto/video (jenis konten dipilih otomatis: Foto, Carousel, Reel, atau Short) → tulis judul dan caption → ajukan untuk ditinjau, jadwalkan (wajib mencentang persetujuan), atau simpan draft. Kode konten (I01, S01, …) dibuat otomatis. Bila key Gemini sudah diisi di **Pengaturan AI**, judul dan caption langsung ditulis AI setelah media diunggah (`POST /api/assistant/draft` dengan `{platform, mediaIds}`); tim tinggal memeriksa dan mengubahnya, atau menekan **Tulis ulang dengan AI**.

Alur lengkap: Pustaka → buka ringkasan detail → pilih Edit konten → periksa media dan caption → berikan persetujuan → tandai siap tayang atau simpan jadwal. Perubahan materi perlu persetujuan baru. Semua tanggal publikasi menggunakan WIB.

Jadwal tampil langsung pada card pustaka. Tombol Post sekarang membuka pemeriksaan sebelum publikasi manual; akun Instagram dan publikasi nyata harus siap. Jadwal lama konten itu digantikan, sementara antrean lain tidak dilanjutkan. Antrean dapat dijeda dan jadwal dapat dibatalkan. Konten terbit hanya dapat disalin. Hasil yang belum pasti dikunci sampai status dari Meta diperiksa, untuk mencegah unggahan ganda.

**Hapus konten** ada di dialog Detail. Konten terjadwal ikut dibatalkan jadwalnya; konten yang sedang diproses atau hasilnya belum pasti tidak dapat dihapus; konten terbit hanya dapat dihapus pemilik dan postingan di Instagram tetap ada. Konten terhapus hilang dari pustaka, kalender, dan antrean, tetapi riwayatnya tetap tersimpan dan ID-nya tidak dipakai ulang. API: `DELETE /api/posts/:id?revision=N` (session + header `x-csrf-token`).

## Impor konten (satu pintu untuk unggah banyak)

Menu **Impor konten** (khusus pemilik) membaca satu folder atau beberapa file sekaligus, termasuk subfolder, misalnya seluruh folder `Short YT`. Tarik & lepas folder/file ke halaman, atau pakai tombol **Pilih folder** / **Pilih file**; saat folder dilepas, folder seperti `node_modules` tidak dibuka sama sekali sehingga lebih cepat.

- **Video & foto** (MP4, JPG, PNG, WebP) dicocokkan berurutan lewat: nama file yang disebut di teks → kode konten di nama file (`V01-…`, `I01-…`, `C01-slide-1…`, `S01-…`) → nomor di nama file (`Vayora-Shorts-03.mp4` → episode 03) → folder episode (`03 - Judul/Video/…`). File yang lebih dalam dari dua folder di bawah folder episode (aset proyek, referensi) dan folder seperti `node_modules` diabaikan. Bila ada dua versi video untuk satu episode, pilih versinya di tabel. Gambar bernama `Cover…` dipakai sebagai cover Reel Instagram.
- **Teks** yang dikenali: paket JSON/CSV (`episode`/`id`, `judul`, `deskripsi_lengkap`/`caption`, `tags_opsional`, `file_video`, `platform`, `tanggal`, `jam`), file .txt per episode atau gabungan (`EPISODE 01 — …`, bagian `JUDUL`, `DESKRIPSI LENGKAP`, `TAGS`), dan daftar caption Markdown (`## V01 … Caption:`). Bila beberapa file menjelaskan episode yang sama, JSON dipakai lebih dulu, lalu CSV, .txt, dan Markdown hanya mengisi bagian yang masih kosong.
- **Media tanpa teks** yang bernama kode konten menjadi konten sendiri dengan judul dari nama file; simpan sebagai draft bila caption belum ada. Kode dari file dipertahankan bila belum dipakai; kode yang sudah ada di pustaka tidak diimpor ulang.
- Kode S selalu YouTube Shorts; V, I, dan C selalu Instagram. Selain itu platform mengikuti kolom `platform` atau pilihan **Platform bawaan**.

Lalu atur jadwal (tanggal mulai, hari, dan jam WIB; slot yang sudah dipakai dilewati, tanggal dan judul bisa diubah per baris), centang persetujuan, dan jalankan. Setiap baris diunggah lalu dijadwalkan, diajukan, atau disimpan sebagai draft satu per satu; baris yang gagal ditampilkan alasannya tanpa menghentikan yang lain.

Tags dikirim ke kolom Tags YouTube. Bila deskripsi menyebut visual buatan AI, pilihan "konten sintetis" tercentang otomatis dan YouTube menerima `containsSyntheticMedia`. Komentar sematan tetap disematkan di YouTube Studio. Selama proyek Google belum lolos audit, video tetap privat. Gambar dikonversi menjadi JPEG sRGB; video disiapkan dengan faststart dan audio AAC 128 kbps; file produksi asli tidak diubah. Alamat lama `/import` dan `/package` membuka halaman yang sama.

## Akun tim

Pemilik membuka **Akun tim** untuk melihat semua anggota (nama, email, peran, tanggal bergabung) dan undangan yang belum dipakai. **Hapus** mengakhiri sesi anggota itu seketika dan mencabut aksesnya; konten yang pernah dibuatnya tetap ada dan tercatat di Riwayat. Pemilik tidak dapat menghapus akunnya sendiri atau pemilik terakhir. **Batalkan** mencabut tautan undangan sebelum dipakai. API (khusus pemilik): `GET /api/team`, `DELETE /api/team/:id`, `DELETE /api/team/invites/:id`.

## Blog ke Sanity.io

Menu **Blog** menulis, menjadwalkan, dan menerbitkan artikel ke dataset Sanity (skema `post`: title, slug, excerpt, body Portable Text, mainImage + alt, publishedAt, seoTitle, seoDescription, author, categories). Pemilik mengisi Project ID, dataset, dan token Editor di **Koneksi & publikasi → Blog · Sanity.io** (token terenkripsi, tidak ditampilkan lagi), lalu menekan **Cek koneksi** untuk membaca field artikel yang ada, penulis, dan kategori. Isi artikel ditulis dalam Markdown dan diubah ke Portable Text (judul h2/h3, daftar, kutipan, tebal, miring, tautan; tabel diratakan menjadi poin). Dokumen memakai _id tetap (`vayora-B01`), sehingga mengirim ulang menggantikan dokumen, bukan menggandakannya. Artikel yang dijadwalkan diterbitkan oleh penjadwal yang sama dengan Instagram/YouTube dan mengikuti saklar publikasi nyata dan jeda antrean. **Impor konten** membaca artikel `.md` dengan tabel Metadata SEO (judul, slug, meta description, kategori, tanggal terbit, nama file dan alt gambar utama). Draf artikel bisa ditulis Gemini dari topik dan kata kunci.

## Susunan menu

Sidebar dibuat ringkas: **Mulai** (Beranda, Buat posting) → **Konten** (Pustaka Instagram, Pustaka YouTube, Kalender, Antrean, Impor konten) → **Bantuan AI** (Asisten caption, Desain konten) → **Pengaturan** (Koneksi & publikasi, Pengaturan AI, Akun tim, Riwayat). Editor tidak melihat Impor konten, Koneksi & publikasi, dan Pengaturan AI. Pemeriksaan kini menjadi filter **Perlu ditinjau** di pustaka; Pengetahuan brand dibuka dari Pengaturan AI; Marketing dan Strategi konten disembunyikan dari menu. Data dan alamat lama (`/review`, `/knowledge`, `/marketing`, `/strategy`, `/settings`) tetap berfungsi.

## Mobile dan bahasa

Pada ponsel, gunakan navigasi bawah satu baris: Beranda, Pustaka, Buat, Kalender, dan Menu. Titik merah pada Beranda menandakan ada masalah. Detail memakai popup ringkas mengambang dengan sudut membulat, latar blur, dan tombol Edit terpisah. Tombol simpan/jadwal tetap terlihat di footer saat editor digulir. Pemilih ID/EN tersedia pada login, header, popup, dan menu. Bahasa disimpan pada browser; caption serta materi sumber tetap dalam bahasa aslinya. [Panduan pustaka dan mobile](docs/PUSTAKA-DAN-MOBILE.md).

## Asisten konten dan desain

**Asisten caption dengan Gemini:** mode AI aktif otomatis bila key Gemini tersimpan. Gemini **menonton video utuh** (gambar, teks di layar, dan narasi); video sampai ±14 MB dikirim langsung, yang lebih besar lewat Gemini Files API (disimpan Google maksimal 48 jam). Untuk Short, kanal **YouTube** terpilih otomatis dan menghasilkan tiga usulan judul + deskripsi + hashtag serta daftar **Tags YouTube** (tombol **Gunakan judul** dan **Gunakan tags**; tags tersimpan bersama konten dan dikirim saat unggah). AI meniru **gaya tim** dari maksimal tiga konten terbaru yang sudah dijadwalkan, disetujui, atau terbit pada platform yang sama (struktur, penutup, catatan ilustrasi AI), tanpa menyalin isinya. Hal yang sama berlaku untuk judul & caption otomatis di **Buat posting**. Di **Impor konten**, caption yang kosong dapat ditulis AI; konten itu diajukan untuk ditinjau, tidak langsung dijadwalkan.

Fitur tersedia melalui menu terpisah: **Asisten caption** untuk mulai dari konten, **Desain konten** untuk image post dengan logo asli, **Pengetahuan brand** untuk acuan AI, **Pengaturan AI** untuk koneksi/batas/arah penulisan, dan **Strategi konten** untuk panduan campaign. Dari editor tersedia tiga pilihan caption/hashtag, pemeriksaan editorial, dan tiga waktu uji posting dalam WIB. Bantuan lokal dan pembuat desain bisa langsung digunakan; mode yang benar-benar membaca gambar dan membuat latar AI memerlukan API key/kredit OpenAI.

Hasil bantuan dibandingkan sebelum diterapkan, dapat dibatalkan, dan tidak otomatis tersimpan atau diterbitkan. Riwayat versi tersimpan dapat dipulihkan sebagai draft. Saran waktu tetap hipotesis sampai pengamatan performa sebanding mencukupi. Panduan, batas analisis Reel/carousel, pengaturan key, dan prioritas marketing berikutnya ada di [docs/ASISTEN-KONTEN.md](docs/ASISTEN-KONTEN.md).

Bank pengetahuan brand berisi 57 catatan, 14 sumber, dan 24 referensi kampanye. Cari topik atau filter status melalui Pengetahuan brand; hasil caption menampilkan catatan konteks yang diberikan kepada asisten. Harga simulasi, placeholder, dan fitur segera hadir dipisahkan dari klaim yang boleh digunakan. Ringkasan lengkap: [docs/PENGETAHUAN-BRAND-VAYORA.md](docs/PENGETAHUAN-BRAND-VAYORA.md).

## Campaign dan marketing

Marketing tidak lagi tampil di menu; buka langsung di `/marketing`. Buat campaign per konten/pembuka dengan UTM, uji tracking lokal, catat demo terkonfirmasi, unduh laporan, dan simpan pengamatan performa manual/CSV. Data uji dipisahkan dari produksi. Perbandingan hanya muncul ketika sampel sebanding mencukupi; tidak ada angka hasil atau jam terbaik contoh.

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
