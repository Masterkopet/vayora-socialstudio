# Deploy Social Studio internal

Paket ini disiapkan untuk satu server Docker Linux yang hidup terus. Target hosting, alamat publik, dan akses server tetap perlu dipilih sebelum aplikasi dapat dinyatakan online. Konfigurasi belum membeli hosting, mengubah DNS, membuka akun pihak ketiga, atau memublikasikan data pengguna.

## Susunan layanan

- Next.js 16 + React 19 menggunakan build standalone di Node 24, SQLite, Sharp, font, FFmpeg, dan FFprobe dalam Dockerfile.
- Database, key, dan media disimpan pada folder data di luar image/container.
- Satu instance aplikasi: jangan menyalakan beberapa replika scheduler dengan data yang sama.
- Port aplikasi hanya dibuka ke localhost server; reverse proxy menangani HTTPS publik.
- Login pemilik dan undangan editor tetap berlaku. Tidak ada pendaftaran client atau halaman jualan Social Studio.
- Produksi menolak berjalan bila domain HTTPS atau akun pemilik belum tersedia. Data harus dimigrasikan sebelum port publik dilayani, agar halaman pembuatan pemilik tidak bisa diambil orang lain.

## Produksi saat ini: Coolify (studio.vayora.id)

`https://studio.vayora.id` dikelola Coolify di `https://coolify.vayora.id`, project **Vayora → production**, aplikasi **vayora-socialstudio**.

- **Sumber:** `git@github.com:Masterkopet/vayora-socialstudio.git` branch `main` melalui deploy key read-only. Build pack Dockerfile (`/Dockerfile`), port 3210, satu instance.
- **Auto-deploy:** webhook GitHub (event push) ke `https://coolify.vayora.id/webhooks/source/github/events/manual`. Setiap push ke `main` membangun image baru lalu melakukan rolling update; container baru menerima trafik setelah HEALTHCHECK Dockerfile lolos. Push tidak mengubah folder data.
- **Data:** persistent storage bind mount `/opt/vayora-social-studio/data` → `/app/data` (database, media, `.encryption-key`). Jangan ganti ke volume baru tanpa memindahkan isi folder ini.
- **Env runtime:** `APP_ORIGIN` dan `PUBLIC_BASE_URL` = `https://studio.vayora.id`, `INSTAGRAM_API_VERSION`, `HOSTNAME=0.0.0.0`. `NODE_ENV`, `PORT`, `DATA_DIR`, dan `REQUIRE_EXISTING_OWNER` berasal dari Dockerfile; jangan menambahkan `NODE_ENV` di Coolify karena env ikut tersedia saat build.
- **Opsi Docker:** `--init --cap-drop=ALL`. Parser opsi Coolify memotong `--security-opt=no-new-privileges` menjadi `no` sehingga container gagal start, jadi opsi itu tidak dipakai.
- **Healthcheck Coolify** dinonaktifkan karena image tidak memuat curl/wget; Coolify memakai HEALTHCHECK Dockerfile.

**Rollback:** pilih image sebelumnya di tab Rollback aplikasi Coolify. Jalur darurat tanpa Coolify: hentikan aplikasi di Coolify, lalu jalankan `docker compose --env-file deploy/production.env -f compose.production.yml -f deploy/compose.traefik.yml up -d app` di `/opt/vayora-social-studio` (folder data yang sama). Jangan menjalankan keduanya bersamaan.

Langkah 1–5 di bawah menjelaskan pemasangan manual dengan Docker Compose untuk server lain atau keadaan darurat.

## 1. Tentukan tempat dan domain

Gunakan VPS/Docker dengan penyimpanan permanen atau hosting container yang menyediakan volume persisten. Contoh alamat subdomain adalah `studio.vayora.id`; pilihan akhirnya mengikuti pemilik domain. Hosting statis saja tidak menjalankan database, pemrosesan video, dan scheduler aplikasi ini.

Apabila memakai VPS yang sudah menjalankan website lain, periksa port 80/443 dan reverse proxy yang ada terlebih dahulu. Jangan mengganti OS, menghapus layanan, mengganti DNS website utama, atau menjalankan Caddy kedua pada port yang sudah digunakan.

## 2. Siapkan source tanpa data privat

Dari PowerShell proyek lokal:

```powershell
& .\scripts\package-deployment.ps1
```

Arsip source berada di `deployment-packages/`. Source tidak mencakup `.env`, database, key, akun, atau file media privat. Transfer source ke server melalui SCP/SFTP atau repository privat yang sudah disetujui. Jangan menaruh arsip data di folder public atau repository.

## 3. Snapshot data untuk migrasi

Pastikan publikasi nyata nonaktif dan antrean dijeda sebelum migrasi agar komputer lokal dan server baru tidak memublikasikan bersamaan.

```powershell
node scripts/migrate-data.mjs data deployment-private/data-migration-YYYYMMDD-HHMM
```

Tujuan harus folder baru. Script membuat snapshot SQLite konsisten, menyalin media yang terdaftar dan key yang sama, lalu menghapus sesi/undangan/OAuth sementara pada **salinan**. Password pengguna dan konfigurasi terenkripsi dipertahankan. Salinan tetap dijeda dan publikasinya nonaktif. Source tidak diubah. Jika ekspor gagal, jangan gunakan folder hasil yang belum lengkap; gunakan path tujuan baru untuk percobaan berikutnya.

Folder ekspor memuat informasi privat dan kunci pembukanya. Transfer hanya melalui jalur privat seperti SSH/SFTP ke folder `data` server, lengkap dengan `.encryption-key`; jangan unggah melalui URL publik. Sesudah transfer, aplikasi container perlu dapat membaca/menulis sebagai UID 1000. Contoh setelah memastikan lokasi absolutnya benar:

```sh
cd /opt/vayora-social-studio
sudo chown -R 1000:1000 ./data
sudo chmod 700 ./data ./data/media
sudo chmod 600 ./data/studio.sqlite ./data/.encryption-key
```

Pengguna perlu login ulang sesudah migrasi. Key tidak boleh diganti dengan key baru karena koneksi AI/Meta lama tidak akan dapat dibuka.

## 4. Konfigurasi server

Salin `deploy/production.env.example` menjadi `deploy/production.env`. Isi `APP_DOMAIN` dengan subdomain tanpa skema/path, `APP_PORT` dengan port localhost yang kosong, dan `DATA_PATH` dengan folder hasil migrasi. File ini bukan file `.env` lokal komputer; Compose menetapkan origin HTTPS server sendiri.

Validasi tanpa menampilkan nilai konfigurasi:

```sh
docker compose --env-file deploy/production.env -f compose.production.yml config --quiet
docker compose --env-file deploy/production.env -f compose.production.yml build
```

Masukkan App Secret/API key melalui Pengaturan AI/Instagram setelah login atau pindahkan konfigurasi terenkripsi bersama key. Jangan menyisipkan key ke Dockerfile/image/source.

## 5. Pilih reverse proxy

**Server baru dengan port 80/443 kosong:** arahkan A/AAAA subdomain ke server yang benar, lalu:

```sh
docker compose --env-file deploy/production.env -f compose.production.yml --profile edge up -d
```

Profile edge menyalakan Caddy untuk sertifikat HTTPS otomatis. DNS dan akses 80/443 harus benar. Volume Caddy menyimpan sertifikat agar tidak dibuat ulang setiap restart.

**Server sudah memiliki proxy:** jalankan aplikasi saja:

```sh
docker compose --env-file deploy/production.env -f compose.production.yml up -d app
```

Hubungkan subdomain HTTPS pada proxy yang sudah ada ke `http://127.0.0.1:<APP_PORT>`, pertahankan Host header domain publik, dan sesuaikan batas upload/timeouts untuk video. Jangan menyalakan profile edge jika portnya sudah dipakai. Pada platform container terkelola, gunakan Dockerfile yang sama, mount volume pada `/app/data`, set APP_ORIGIN/PUBLIC_BASE_URL ke URL HTTPS yang diberikan, HOSTNAME=0.0.0.0, dan jalankan hanya satu replika.

## 6. Verifikasi sebelum dipakai tim

1. HTTPS dan `/health` berhasil, tanpa peringatan sertifikat.
2. Halaman meminta login yang sudah ada; endpoint setup menolak membuat pemilik kedua.
3. Login pemilik lama berhasil dan konten/media lama muncul.
4. Uji desain lokal serta upload gambar/video pada draft uji.
5. Restart container; akun, media, dan draft tetap ada.
6. Buat undangan editor hanya untuk anggota tim yang dipilih pemilik.
7. Instagram tetap nonaktif sampai callback di Meta Developer, domain publik, serta izin sudah sesuai. Update callback domain server sebelum menghubungkan akun. Pengukuran website juga perlu domain Studio yang baru dan pemasangan tracker.

Perpindahan online tidak otomatis mengaktifkan publikasi, memanggil layanan AI berbayar, atau mengirim pesan ke calon pelanggan. Pengujian lokal menggunakan data uji terpisah, bukan akun Instagram pengguna.

## Backup otomatis harian (produksi)

Server menjalankan `deploy/backup.sh` setiap hari pukul **02:30 WIB** lewat timer systemd `vayora-studio-backup.timer` (berkas unit ada di `deploy/systemd/`). Setiap backup tersimpan di `/opt/vayora-social-studio/backups/daily/<waktu UTC>/` berisi:

- `studio.sqlite`: salinan database yang konsisten, diambil dengan SQLite backup API di dalam container (aplikasi tidak dimatikan).
- `.encryption-key`: kunci pembuka token/secret di database. Backup tanpa kunci ini tidak dapat memulihkan koneksi Instagram/YouTube.
- `media/`: file unggahan. File yang tidak berubah berupa hard link ke backup sebelumnya, sehingga backup harian hanya memakan ruang untuk file baru.
- `manifest.txt`: hasil pemeriksaan (`integrity`, jumlah konten, baris media, file yang hilang, ukuran kunci).

Backup hanya disimpan bila database lolos `PRAGMA integrity_check`, setiap baris media punya file, dan kunci berukuran 32 byte. Hanya 14 backup terbaru yang disimpan (`KEEP_DAYS`).

Perintah di server:

```sh
systemctl list-timers vayora-studio-backup.timer      # jadwal berikutnya
systemctl start vayora-studio-backup.service           # backup sekarang
journalctl -u vayora-studio-backup.service -n 20       # hasil terakhir
cat /opt/vayora-social-studio/backups/daily/*/manifest.txt
```

Backup ini masih berada di disk server yang sama: melindungi dari kesalahan data/aplikasi, tetapi tidak dari kerusakan server. Simpan juga salinan di luar server (terenkripsi, karena berisi kunci).

**Memulihkan:** hentikan aplikasi di Coolify; salin `studio.sqlite`, `.encryption-key`, dan isi `media/` dari folder backup ke `/opt/vayora-social-studio/data/`; hapus `studio.sqlite-wal` dan `studio.sqlite-shm`; jalankan `chown -R 1000:1000 /opt/vayora-social-studio/data`; lalu jalankan aplikasi lagi dan periksa login, pustaka, dan status koneksi. Pengguna perlu login ulang bila sesi di backup sudah kedaluwarsa.

## Update dan backup

Backup seluruh folder data beserta key melalui penyimpanan privat. Untuk backup file biasa, hentikan aplikasi sebentar supaya database/WAL konsisten, salin folder lengkap, lalu hidupkan kembali. Snapshot migrasi menonaktifkan publikasi/menghapus sesi pada salinan sehingga berbeda dari backup pemulihan mentah.

Di produksi Coolify, update cukup dengan push ke `main`; backup folder data terlebih dahulu bila perubahan menyentuh skema database atau migrasi. Pada pemasangan Compose manual, backup dahulu, perbarui source, lalu build dan recreate layanan app dengan Compose yang sama. Pertahankan folder data dan nama proyek/volume. Jangan menjalankan `down -v` pada produksi. Uji login/media dan status koneksi sesudah update. Pastikan backup dapat dipulihkan sebelum mengandalkannya.

Referensi resmi: [Hostinger Docker Manager](https://www.hostinger.com/support/12040789-hostinger-docker-manager-for-vps-simplify-your-container-deployments/), [Docker Compose variables](https://docs.docker.com/compose/how-tos/environment-variables/variable-interpolation/), [Caddy HTTPS](https://caddyserver.com/docs/automatic-https), [Railway volumes](https://docs.railway.com/volumes/reference).
