# Menyiapkan YouTube Shorts

Social Studio dapat mengunggah **YouTube Short** terjadwal ke satu channel melalui YouTube Data API v3. Short adalah konten tersendiri (format `Short`), terpisah dari Reel Instagram.

## Batasan dari Google

- **Audit API:** video yang diunggah lewat API dari project Google Cloud yang belum lolos *YouTube API Services audit* dikunci **privat** oleh YouTube, apa pun privasi yang dipilih. Studio tetap mengunggah dan mencatat "terkunci privat" di Riwayat. Ajukan audit melalui formulir *YouTube API Services – Audit and Quota Extension* agar Short dapat tampil publik.
- **Consent screen:** selama status aplikasi OAuth masih *Testing*, refresh token Google kedaluwarsa setelah 7 hari. Ubah status ke **In production** (aplikasi tidak terverifikasi tetap bisa dipakai pemiliknya, dengan layar peringatan Google) agar koneksi tidak putus setiap minggu.
- **Kuota:** setiap unggahan memakai kuota harian project (default 10.000 unit). Bila kuota habis, Studio menandai konten gagal dengan pesan kuota; jadwalkan ulang besok.

## Siapkan Google Cloud

1. Buka https://console.cloud.google.com/ dengan akun Google pemilik channel, buat project (misalnya "Vayora Social Studio").
2. **APIs & Services → Library**: aktifkan **YouTube Data API v3**.
3. **Google Auth Platform / OAuth consent screen**: tipe *External*, isi nama aplikasi dan email dukungan, tambahkan scope `youtube.upload` dan `youtube.readonly`, lalu publikasikan ke **In production** (lihat batasan di atas).
4. **Credentials → Create credentials → OAuth client ID**: tipe **Web application**. Tambahkan *Authorized redirect URI* persis: `https://studio.vayora.id/auth/youtube/callback` (alamat tampil juga di halaman Koneksi & publikasi).
5. Salin **Client ID** dan **Client Secret**.

## Hubungkan channel

1. Di Studio buka **Pengaturan → Koneksi & publikasi → YouTube Shorts → Pengaturan Google Cloud**.
2. Isi Client ID dan Client Secret, pilih privasi video (publik, tidak publik, atau privat), lalu **Simpan pengaturan YouTube**. Menyimpan kredensial baru menonaktifkan publikasi nyata dan menjeda antrean.
3. Tekan **Hubungkan channel YouTube**, pilih akun Google pemilik channel, dan setujui izin. Studio kembali ke halaman koneksi dan menampilkan nama channel.

Refresh token disimpan terenkripsi; access token diperbarui otomatis. Alternatif konfigurasi server: `YOUTUBE_CLIENT_ID` dan `YOUTUBE_CLIENT_SECRET` (mengalahkan nilai dari UI).

## Membuat dan menjadwalkan Short

- **Impor:** pilih video, lalu pada langkah pencocokan ubah **Tujuan video** menjadi *YouTube Short*. Nama file berawalan `S01-…` otomatis menjadi Short dengan ID `S01`.
- **Aturan Short:** satu video MP4 vertikal atau persegi, maksimal 3 menit. **Judul** konten menjadi judul YouTube (maksimal 100 karakter; tanda `<` dan `>` dihapus). **Caption** menjadi deskripsi.
- Pemeriksaan kesiapan Short memakai aturan YouTube (video, judul, deskripsi, persetujuan, koneksi YouTube, publikasi aktif).
- Jadwal dan **Post sekarang** bekerja seperti konten Instagram; scheduler mengirim Short ke YouTube.
- Bila koneksi terputus setelah video terkirim, status menjadi **perlu diperiksa**; tombol periksa hasil mencari video di 25 unggahan terbaru channel dan tidak pernah mengunggah ulang.
- Setelah terbit, tautan **Lihat di YouTube** membuka `https://www.youtube.com/shorts/<id>`.

## API

Semua endpoint memakai session dan header `x-csrf-token`; konfigurasi dan koneksi khusus pemilik.

- `GET /api/youtube/status` — status koneksi (tanpa secret).
- `POST /api/youtube/config` — `{"clientId","clientSecret","privacy":"public|unlisted|private"}`.
- `POST /api/youtube/connect` — mengembalikan `{url}` halaman izin Google.
- `GET /auth/youtube/callback` — tujuan kembali dari Google.
- `POST /api/youtube/check`, `POST /api/youtube/disconnect`.
- Konten Short dibuat lewat `POST /api/posts` dengan `"format":"Short"`.
