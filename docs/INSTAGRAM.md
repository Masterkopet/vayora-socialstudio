# Menyiapkan koneksi Instagram

Login tim Social Studio dapat digunakan tanpa akun Meta Developer. Langkah berikut diperlukan hanya untuk menghubungkan dan memublikasikan ke Instagram sungguhan.

## Persiapan akun

Ubah akun Vayora menjadi akun profesional jenis Business atau Creator. Untuk versi ini, integrasi menggunakan Instagram API with Instagram Login. Business Portfolio tidak diwajibkan oleh alur login tersebut dan Facebook Page tidak harus ditautkan. Pengaturan serta kelayakan aplikasi Meta tetap perlu dipenuhi.

## Buat aplikasi Meta

1. Login di https://developers.facebook.com/ (daftar sebagai developer bila diminta), lalu buka **My Apps → Create App**. Halaman `https://developers.facebook.com/apps/` menampilkan "Page Not Found" bila belum login.
2. Pilih use case **Other**, tipe aplikasi **Business**, isi nama aplikasi dan email kontak. Pada produk **Instagram**, tekan **Set up**; bagian **API setup with Instagram login** ditambahkan otomatis. Jangan memakai *API setup with Facebook login*.
3. Buka **Instagram → API setup with Instagram login → 3. Set up Instagram business login → Business login settings**. Salin **Instagram App ID** dan **Instagram app secret** (berbeda dari App ID Facebook di App settings).
4. Di **Business login settings**, tambahkan `https://domain-kamu/auth/instagram/callback` pada **OAuth redirect URIs** persis sama, tanpa garis miring di akhir, lalu simpan. Bila **Deauthorize callback URL** dan **Data deletion request URL** wajib diisi, gunakan alamat HTTPS Studio; Studio belum memproses permintaan tersebut secara otomatis.
5. Di bagian **1. Generate access tokens**, tekan **Add account** dan login dengan akun Instagram yang akan dipublikasikan (akun harus publik). Akun juga dapat dikelola lewat **App Roles → Roles**.
6. Scope yang diminta Studio: `instagram_business_basic` dan `instagram_business_content_publish`. Standard Access cukup untuk akun milik/kelolaan sendiri yang sudah ditambahkan ke aplikasi; Advanced Access dan App Review diperlukan untuk melayani akun pihak lain.

Nama menu dashboard Meta dapat berubah dan dapat tampil dalam bahasa akun Facebook kamu. Cocokkan dengan dokumentasi resmi: https://developers.facebook.com/docs/instagram-platform/create-an-instagram-app dan https://developers.facebook.com/docs/instagram-platform/instagram-api-with-instagram-login/business-login.

## Isi konfigurasi server

Pemilik dapat mengisi App ID, App Secret, URL HTTPS publik, dan versi API di Pengaturan. Secret disimpan terenkripsi di server dan tidak ditampilkan kembali. Alternatifnya isi variabel `INSTAGRAM_APP_ID`, `INSTAGRAM_APP_SECRET`, `PUBLIC_BASE_URL`, dan `INSTAGRAM_API_VERSION` di `.env`; environment mengambil prioritas atas konfigurasi UI. Isi juga `APP_ORIGIN` dengan origin HTTPS saat menjalankan melalui domain publik, kemudian restart server.

Untuk tahap lokal sekarang, App ID dan App Secret belum tersedia. Tombol Hubungkan Instagram akan menjelaskan konfigurasi yang kurang; aplikasi tidak menyimulasikan login berhasil.

## Hubungkan akun

1. Login ke Social Studio melalui domain HTTPS yang sudah dikonfigurasi.
2. Buka Pengaturan → Hubungkan Instagram.
3. Login dan setujui izin pada halaman resmi Instagram/Meta.
4. Meta mengembalikan browser ke callback. Server menukar kode menjadi access token dan menyimpannya terenkripsi.
5. Periksa username, masa berlaku izin, dan tombol Periksa koneksi.

Token tidak disimpan dalam browser. Password Instagram tidak masuk ke server Social Studio. Permintaan OAuth terikat ke session pemilik, kedaluwarsa setelah 10 menit, dan hanya dapat digunakan sekali.

## Sebelum publikasi nyata

Media harus dapat diambil Meta melalui HTTPS publik. Aplikasi menghasilkan URL media bertanda tangan dengan masa berlaku tiga jam. Coba satu gambar, satu Reel, dan satu carousel untuk memverifikasi izin, format, dan tampilan hasil. Periksa khusus rasio/cropping carousel karena hasil Instagram dapat mengikuti aturan pemotongan platform.

Pemilik mengaktifkan Publikasi nyata di Pengaturan setelah koneksi siap. Antrean tetap dapat dijeda sebelum konten uji dijadwalkan. Melanjutkan antrean dan memasang jadwal merupakan tindakan publikasi nyata; jangan memakai materi uji yang belum disetujui.

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
