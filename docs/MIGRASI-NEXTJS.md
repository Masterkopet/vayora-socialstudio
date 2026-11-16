# Migrasi Next.js dan lokasi proyek

Proyek aktif: `E:\Work\VAYORA\Vayora-SocialStudio`.

## Stack versi 2

- Next.js 16.4.6 App Router, React/React DOM 19.3.1, Node.js 24+.
- Native Next.js Route Handlers untuk API, sesi, OAuth, tracking, dan media privat.
- SQLite, scrypt, session cookie HttpOnly, CSRF, pemeriksaan origin/host, enkripsi credential, serta persetujuan publikasi dipertahankan.
- Busboy menangani multipart secara streaming ke file sementara. Media privat mendukung HEAD dan HTTP byte ranges agar video dapat diputar/di-seek tanpa membaca seluruh file ke memori.
- Sharp, FFmpeg/FFprobe, Lucide, serta Docker Compose/Caddy tetap digunakan.
- Express dan Multer telah dihapus dari dependensi.

## Struktur

`src/app/layout.jsx` menyediakan document, metadata, CSS, nonce CSP, dan aset ikon. Layout `(studio)` mempertahankan komponen React `StudioClient` selama perpindahan halaman. Halaman mempunyai alamat seperti `/library`, `/calendar`, `/designer`, `/knowledge`, `/marketing`, dan `/ai-settings`.

`src/client/` berisi controller editor yang sudah matang, asisten, marketing, navigasi, dan terjemahan. React mengelola host workspace yang persisten; controller mengelola subtree interaktifnya, native dialog, dan pemutar media. Ini mempertahankan perilaku editor tanpa menulis ulang seluruh interaksi saat migrasi. Controller dipasang/dilepas melalui lifecycle React, termasuk cleanup event listener, observer, request awal, dan timer. Kode client dibundel oleh Next.js dan tidak lagi dimuat sebagai aplikasi HTML statis terpisah.

`src/server.mjs` memuat aturan bisnis. `src/http.mjs` mengadaptasi service ke Web Request/Response yang dipakai Route Handlers; listener Node hanya digunakan pada unit test terpisah. Tidak ada server Express kedua atau proxy internal ke proses lama. `src/runtime.mjs` menjaga satu runtime/scheduler per proses, termasuk ketika modul Route Handlers berbagi state.

`src/styles/` memuat gaya brand dan popup menu lima kolom yang muncul di atas navigasi bawah. `public/` memuat logo, vendor ikon, serta tracker website. Native Route Handlers melayani semua data privat. Tautan hash lama seperti `/#designer` masih diterima dan diarahkan ke alamat halaman Next.js setelah workspace terbuka.

## Data dan folder lama

Database, key enkripsi, media, akun, caption, serta metadata dipindahkan melalui snapshot konsisten. Sesi login dipertahankan saat pindah komputer/folder lokal pada alamat localhost yang sama. Snapshot untuk deployment domain baru tetap menghapus sesi secara bawaan. Aplikasi lama dihentikan sebelum pengalihan port sehingga hanya satu scheduler aktif.

Folder sebelumnya dipertahankan sebagai salinan sebelum migrasi. Gunakan folder baru untuk perubahan dan menjalankan aplikasi. Dokumen/proyek video yang memang berada di `E:\Work\VIDEO_EDITING` tetap menjadi sumber referensi brand; alamat historis tersebut tidak diubah menjadi lokasi palsu di folder aplikasi.

## Menjalankan

```powershell
npm ci
npm run build
npm run start:local
```

Launcher `Mulai-Vayora.cmd` menggunakan build standalone yang sudah disiapkan dan membuka http://localhost:3210. `Hentikan-Vayora.cmd` hanya menghentikan proses yang sesuai dengan runner proyek baru. Untuk mengedit dengan hot reload, hentikan launcher lalu gunakan `npm run dev`.

Produksi Docker menggunakan `node server.js` dari output standalone, folder data persisten, origin HTTPS, dan akun internal yang telah dimigrasikan. `start:local` secara eksplisit mengizinkan localhost HTTP hanya untuk pengujian lokal; konfigurasi produksi tetap mewajibkan HTTPS. Folder data, file `.env`, artefak pengujian, dan paket privat dikecualikan dari tracing standalone serta Docker image.

## Verifikasi

- Unit test aturan bisnis, auth, revision, versi caption, publishing lock, dan snapshot migrasi.
- Browser test berjalan pada server Next.js yang sesungguhnya dengan database/provider simulasi terpisah: login, tim, media/video/cover, caption, desain, pengetahuan, jadwal, marketing, ID/EN, serta responsivitas.
- Pengujian menu mengukur grid lima kolom, posisi di atas navigasi, auto height, fokus keyboard, dan reduced motion.
- Container smoke test menguji Linux, login akun yang sudah ada, cookie Secure, font/desain, upload FFmpeg/poster, serta data yang bertahan setelah restart.

Referensi: [Next.js Route Handlers](https://nextjs.org/docs/app/api-reference/file-conventions/route), [CSP dan nonce](https://nextjs.org/docs/app/guides/content-security-policy), [self-hosting Next.js](https://nextjs.org/docs/app/guides/self-hosting).
