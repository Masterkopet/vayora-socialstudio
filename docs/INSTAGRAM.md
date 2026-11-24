# Menyiapkan koneksi Instagram

Login tim Social Studio dapat digunakan tanpa akun Meta Developer. Langkah berikut diperlukan hanya untuk menghubungkan dan memublikasikan ke Instagram sungguhan.

## Persiapan akun

Ubah akun Vayora menjadi akun profesional jenis Business atau Creator. Untuk versi ini, integrasi menggunakan Instagram API with Instagram Login. Business Portfolio tidak diwajibkan oleh alur login tersebut dan Facebook Page tidak harus ditautkan. Pengaturan serta kelayakan aplikasi Meta tetap perlu dipenuhi.

## Cara cepat: tempel token (disarankan)

Tidak perlu App ID, App Secret, maupun redirect URI. Studio cukup menerima access token dari dashboard Meta.

1. Login di https://developers.facebook.com/ (daftar sebagai developer bila diminta; Meta meminta nomor HP yang ditambahkan lewat Accounts Center). Buka **My Apps → Create App**: use case **Other**, tipe **Business**, isi nama dan email, lalu **hubungkan Business portfolio** Vayora (wajib untuk API setup Instagram) dan tambahkan produk **Instagram**. Halaman `https://developers.facebook.com/apps/` hanya menampilkan "Page Not Found"/beranda bila akun belum terdaftar sebagai developer.
2. Buka **Instagram → API setup**. Aplikasi baru memakai **API setup with Unified login** (jalur *Instagram login* tidak lagi tersedia untuk aplikasi baru); aplikasi lama masih memakai **API setup with Instagram login**. Keduanya didukung.
3. Beri akun Vayora peran **Instagram Tester** di tab **Roles** (App roles → Roles → Add People), lalu terima undangannya di Instagram: Pengaturan → Aplikasi dan situs web → Undangan tester.
4. Di bagian **Generate access tokens** tekan **Add account**, login dengan akun Instagram Vayora (Business/Creator dan publik), lalu tekan **Generate token** dan salin tokennya. Awalan `EAA…` berarti token Unified login (Facebook); `IGAA…` berarti token Instagram login.
5. Di Social Studio buka **Pengaturan → Koneksi & publikasi**, tempel token pada **Hubungkan dengan token**, lalu tekan tombolnya. Studio memeriksa token ke Meta dan menampilkan username yang terhubung.

Catatan:

- Token Unified login (`EAA…`) dipakai lewat `graph.facebook.com`. Studio mencari akun Instagram yang dapat diakses token itu: dari aset yang diizinkan token (\`debug_token\`), atau lewat Facebook Page/Business portfolio yang tertaut. Meta hanya membuka daftar aset itu untuk *app access token*, jadi bila akun Instagram tidak tertaut ke Page, isi **App ID** dan **App Secret** di bagian "Cara lanjutan" (App ID dan App secret ada di **App settings → Basic** pada dashboard Meta; ini App ID/secret aplikasi, bukan "Instagram app secret"), simpan, lalu tempel ulang token. Studio memakainya hanya untuk membaca aset token dan tidak menyimpannya bersama koneksi. Meta tidak memberi tanggal kedaluwarsa tanpa App Secret, jadi token dipercaya sampai Meta menolaknya; saat itu Studio meminta sambung ulang. Bila token dapat mengakses lebih dari satu akun, Studio menolak dan menyebut akunnya: buat token khusus akun Vayora. Bila akun tidak ditemukan, pesan error memuat alasan dari Meta.
- Token Instagram login (`IGAA…`) dari dashboard berlaku 60 hari. Studio menyimpannya terenkripsi dan memperpanjangnya otomatis tanpa App Secret: pertama kali setelah 24 jam (untuk mengetahui masa berlaku pastinya), lalu dalam 7 hari terakhir sebelum habis. Perpanjangan tetap berjalan walau antrean dijeda.
- Token yang salah atau kedaluwarsa ditolak dengan pesan dari Meta dan tidak memutus koneksi yang sudah berjalan.
- Mengganti token dengan akun Instagram lain menonaktifkan publikasi nyata dan menjeda antrean sampai pemilik memeriksa ulang. Memperbarui token akun yang sama tidak mengubah status publikasi.
- Scope yang dipakai: `instagram_business_basic` dan `instagram_business_content_publish`. Standard Access cukup untuk akun milik/kelolaan sendiri yang sudah ditambahkan ke aplikasi; Advanced Access dan App Review diperlukan untuk melayani akun pihak lain.
- API (khusus pemilik, memakai session dan header `x-csrf-token`): `POST /api/instagram/token` dengan body `{"token":"IGAA..."}` → status koneksi (`connected`, `username`, `method: "token"`, `expiresAt`, `expiresKnown`).

## Cara lanjutan: login Meta dengan App ID dan App Secret

Pakai cara ini bila ingin menghubungkan lewat halaman login Instagram (OAuth). Di Studio, buka bagian **Cara lanjutan** pada halaman Koneksi & publikasi.

1. Buat aplikasi seperti langkah 1 di atas.
2. Buka **Instagram → API setup with Instagram login → 3. Set up Instagram business login → Business login settings**. Salin **Instagram App ID** dan **Instagram app secret** (berbeda dari App ID Facebook di App settings).
3. Di **Business login settings**, tambahkan `https://domain-kamu/auth/instagram/callback` pada **OAuth redirect URIs** persis sama, tanpa garis miring di akhir, lalu simpan. Bila **Deauthorize callback URL** dan **Data deletion request URL** wajib diisi, gunakan alamat HTTPS Studio; Studio belum memproses permintaan tersebut secara otomatis.
4. Di bagian **1. Generate access tokens**, tekan **Add account** untuk akun yang akan dipublikasikan.
5. Isi App ID dan App Secret di formulir Cara lanjutan, simpan, lalu tekan **Hubungkan lewat login Meta** dan setujui izin pada halaman resmi Instagram/Meta. Meta mengembalikan browser ke callback; server menukar kode menjadi access token dan menyimpannya terenkripsi.

Alternatif konfigurasi server: isi `INSTAGRAM_APP_ID`, `INSTAGRAM_APP_SECRET`, `PUBLIC_BASE_URL`, dan `INSTAGRAM_API_VERSION` di environment; nilai environment mengambil prioritas atas konfigurasi UI. Isi juga `APP_ORIGIN` dengan origin HTTPS saat menjalankan melalui domain publik.

Token tidak disimpan dalam browser. Password Instagram tidak masuk ke server Social Studio. Permintaan OAuth terikat ke session pemilik, kedaluwarsa setelah 10 menit, dan hanya dapat digunakan sekali.

Nama menu dashboard Meta dapat berubah dan dapat tampil dalam bahasa akun Facebook kamu. Cocokkan dengan dokumentasi resmi: https://developers.facebook.com/docs/instagram-platform/instagram-api-with-instagram-login/get-started dan https://developers.facebook.com/docs/instagram-platform/instagram-api-with-instagram-login/business-login.

## Sebelum publikasi nyata

Media harus dapat diambil Meta melalui HTTPS publik. Aplikasi menghasilkan URL media bertanda tangan dengan masa berlaku tiga jam. Coba satu gambar, satu Reel, dan satu carousel untuk memverifikasi izin, format, dan tampilan hasil. Periksa khusus rasio/cropping carousel karena hasil Instagram dapat mengikuti aturan pemotongan platform.

Pemilik mengaktifkan Publikasi nyata di **Koneksi & publikasi** setelah koneksi siap. Antrean tetap dapat dijeda sebelum konten uji dijadwalkan. Melanjutkan antrean dan memasang jadwal merupakan tindakan publikasi nyata; jangan memakai materi uji yang belum disetujui.

## Ketika terjadi kendala

- Izin kedaluwarsa/dicabut: sambungkan kembali akun.
- Media gagal diproses sebelum publish dikirim: periksa media dan tentukan jadwal baru.
- Respons publish terputus: hasil berstatus Periksa hasil. Gunakan Periksa hasil di Meta. Aplikasi tidak mengirim publish kedua secara otomatis.
- Container dikonfirmasi PUBLISHED: tandai terbit dan blokir retry; tautan mungkin belum tersedia bila respons asli terputus.
- Jadwal lewat lebih dari lima menit: tentukan jadwal baru; tidak ada catch-up massal.

App Review dan Advanced Access diperlukan ketika aplikasi melayani akun eksternal sesuai ketentuan Meta; jangan menganggap mode tester cukup untuk semua pelanggan.

## Referensi resmi

- https://developers.facebook.com/documentation/instagram-platform/instagram-api-with-instagram-login
- https://developers.facebook.com/documentation/instagram-platform/overview
- https://developers.facebook.com/documentation/instagram-platform/content-publishing
- https://developers.facebook.com/documentation/instagram-platform/instagram-graph-api/reference/ig-user/media
