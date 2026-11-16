# Pustaka, publikasi manual, dan bahasa

## Pustaka konten

Setiap card memiliki tombol **Post sekarang** dan **Detail**. Jadwal tampil langsung pada card sebagai tanggal, jam, dan WIB; card terbit menampilkan waktu publikasinya. Konten tanpa jadwal diberi label belum dijadwalkan. Tombol publikasi terkunci untuk konten yang sedang diproses, telah terbit, atau memiliki hasil yang belum pasti.

Menekan card membuka popup ringkasan di atas daftar: media proporsional, judul, caption yang bisa diperluas, status, dan jadwal. Pilih **Edit konten** untuk membuka form di popup yang sama. Pencarian judul/ID/caption/kategori, chip status cepat, pengurutan, filter serta posisi daftar dipertahankan. Editor, preview media/video, urutan carousel, persetujuan, asisten caption, dan pengaturan jadwal tersedia di dalam popup. Tombol Simpan draft dan Simpan jadwal berada pada footer yang tetap terlihat saat isi digulir. Menyimpan dari popup menutup detail dan mengembalikan pengguna ke halaman asal. Perubahan belum disimpan memerlukan konfirmasi untuk ditinggalkan atau kembali ke editor sebelum menutup; Escape dan tombol tutup tidak membuang draft tanpa pemberitahuan. Fokus keyboard kembali ke pemicu setelah popup ditutup.

## Post sekarang

1. Tekan **Post sekarang** pada card.
2. Periksa media, caption, akun tujuan, dan jadwal yang akan digantikan.
3. Centang bahwa materi telah diperiksa.
4. Tekan **Publikasikan sekarang** untuk mengirim satu permintaan publikasi manual.

Publikasi memakai versi konten yang sudah disimpan. Instagram harus terhubung, HTTPS publik tersedia, dan publikasi nyata diaktifkan oleh pemilik. Jika belum siap, popup menjelaskan langkahnya dan tombol publikasi tetap nonaktif. Tidak ada simulasi akun tersambung dalam workspace pengguna.

Publikasi manual boleh berjalan ketika antrean dijeda, tetapi tidak melanjutkan antrean lain. Jadwal lama pada konten itu digantikan waktu saat ini. Permintaan memakai pemeriksaan revisi untuk menolak data yang sudah berubah; konten dipindah ke processing sebelum proses jaringan berlangsung. Browser memantau status hasil tanpa meminta publikasi kedua. Hasil tidak pasti dikunci dan harus direkonsiliasi; tidak ada retry otomatis. Aktivitas dicatat pada riwayat. Hasil sukses simulasi hanya terdapat pada pengujian terpisah, bukan sebagai data hasil publikasi asli.

## Mobile

Pada lebar sampai 800 px, sidebar diganti navigasi bawah satu baris dengan lima tujuan: **Pustaka, Kalender, Antrean, Asisten, Menu**. Menu menampilkan launcher ikon lima kolom. Desain konten, Pengetahuan brand, Strategi konten, Pengaturan AI, serta halaman lainnya dapat dibuka langsung dari sini. Impor dan keluar termasuk dalam grid; bahasa tersedia pada baris bawah. Navigasi utama tetap satu baris pada lebar 320–800 px, dengan safe-area bawah dan ruang isi agar konten terakhir tidak tertutup.

Card menjadi satu kolom pada ponsel kecil dan dua kolom pada perangkat lebih lebar. Tombol utama memiliki area sentuh sekitar 44 px. Media memakai ukuran proporsional, bukan stretch. Popup detail berupa panel mengambang dengan margin di sekeliling, sudut 24 px, tinggi maksimal 76% viewport pada mobile (88% desktop), dengan margin samping 24 px, dan backdrop blur 10 px; panel memiliki header/tombol tutup yang tetap terlihat, dan menaruh preview sebelum form. Editor asisten dibuka sesuai kebutuhan agar form tidak terlalu panjang. Buka/tutup memakai transisi opacity dan gerak pendek; preferensi reduced motion menonaktifkan transisi. Menu muncul dari bawah dan berhenti 10 px di atas bar navigasi utama, dengan 15 ikon dalam lima kolom/tiga baris. Tinggi mengikuti isi dan tidak menyisakan bidang kosong panjang; pada layar pendek isi dapat digulir dengan batas tinggi 80% viewport. Dialog native menangani fokus dan mencegah interaksi dengan halaman di belakangnya.

## Bahasa

Pemilih **ID / EN** tersedia pada header, halaman login, popup detail, dan menu mobile. Pilihan disimpan pada browser yang digunakan. Antarmuka, navigasi, label, bantuan utama, status, serta format tanggal mengikuti pilihan bahasa. Pergantian bahasa tidak menghapus field yang sedang diedit.

Bahasa antarmuka tidak menerjemahkan atau menimpa caption, judul konten, teks pada gambar/video, maupun dokumen sumber bank pengetahuan. Nilai kategori/status yang dikirim ke server tetap konsisten walaupun labelnya ditampilkan dalam bahasa Inggris. Zona waktu publikasi tetap WIB pada kedua bahasa.

## Verifikasi

Pengujian mencakup publikasi manual dengan persetujuan dan konfigurasi valid, penolakan konten terkunci/revisi usang, pencegahan unggahan ganda, penggantian satu jadwal tanpa melanjutkan antrean lain, jadwal pada card, popup tanpa pindah halaman, draft saat ganti bahasa, Escape/fokus keyboard, penyimpanan bahasa, serta menu satu baris dan overflow pada 320, 375, 390, 736, dan 800 px. Seluruh permintaan Meta/OpenAI dalam pengujian memakai transport simulasi dan database terpisah.

## Riwayat caption dan kesiapan posting

Bandingkan hasil asisten dengan caption saat ini sebelum **Gunakan usulan ini**. **Batalkan perubahan AI** mengembalikan caption sebelum penerapan selama sesi edit; persetujuan perlu diberikan kembali. Sesudah disimpan, perubahan materi dicatat pada riwayat versi. Pilih Bandingkan lalu Pulihkan versi ini untuk mengembalikan judul, caption, alt, media/cover, kategori, serta tujuan versi tersebut sebagai draft; jadwal dan persetujuan dibatalkan. Riwayat dimulai sejak fitur diaktifkan dan tidak merekonstruksi perubahan lama yang belum dicatat. Popup menampilkan 50 versi terbaru. Konten terbit/proses/hasil tidak pasti tidak boleh dipulihkan langsung.

Kesiapan posting memisahkan media, caption, alt opsional, persetujuan, koneksi Instagram, HTTPS publik, serta publikasi aktif. Checklist memvalidasi kelengkapan dan file tersimpan; pemeriksaan manusia tetap diperlukan untuk isi penawaran, hak media, serta hasil visual. Pengaturan koneksi yang belum siap tidak menghalangi penyimpanan draft/perencanaan jadwal.

## Menu fitur yang terpisah

- **Asisten caption**: pilih konten lalu buka asisten di editor. Caption/hashtag diperiksa dan diterapkan secara eksplisit.
- **Desain konten**: pembuat image post, pilihan warna/visual, pratinjau, dan latar AI bila tersedia. Isian desain sementara dipertahankan saat berpindah menu dalam sesi halaman yang sama; refresh tidak menyimpan isian yang belum menjadi draft.
- **Pengetahuan brand**: 57 catatan acuan AI, sumber, filter topik/status, serta pedoman klaim. Tiap catatan dapat dibuka untuk membaca isi lengkap dan sumber. Enam catatan per halaman dengan rentang hasil, Sebelumnya/Berikutnya, dan Reset filter. Filter dan halaman dipertahankan saat berpindah menu dalam sesi halaman yang sama.
- **Pengaturan AI**: koneksi, batas pemakaian, audiens, dan nada bicara. Akses konfigurasi tetap sesuai peran tim.
- **Strategi konten**: panduan pencarian sosial, pesan, dan eksperimen campaign. Pelaksanaan serta hasil campaign tetap berada pada Marketing.

Sidebar desktop mengelompokkan semua halaman dan dapat digulir bila tinggi layar terbatas. Menu aktif ditandai. Masing-masing halaman mempunyai alamat hash tersendiri, dapat dimuat ulang langsung, dan mendukung tombol kembali/maju browser. Perubahan caption yang belum disimpan tetap memerlukan konfirmasi ketika meninggalkan editor. Navigasi bawah ponsel tetap lima tombol satu baris.
