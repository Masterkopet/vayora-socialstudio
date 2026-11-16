# Asisten konten Vayora

Tersedia melalui **Asisten caption**, **Desain konten**, **Pengetahuan brand**, **Pengaturan AI**, serta editor pada **Pustaka**. Data akun, media, dan jadwal lama tetap dipakai.

## Pengetahuan brand yang digunakan

Bank pengetahuan versi `2026-11-16.1` memuat 57 catatan terkurasi, 14 sumber, dan 24 referensi kampanye. Sumber mencakup beranda/Tentang/blog Vayora, dua artikel, proposal template dan versi desain brand, catatan produk/desain landing page, brief dan manifest kampanye, aset SVG aktif, serta arahan kreatif pemilik.

Catatan dapat dicari dan difilter di **Pengetahuan brand**, dengan status tersedia, layanan tambahan, segera hadir, identitas brand, pedoman, atau perlu konfirmasi. Ekspor JSON tersedia setelah login. Ringkasan yang dapat dibaca ada di [PENGETAHUAN-BRAND-VAYORA.md](PENGETAHUAN-BRAND-VAYORA.md).

Saat caption diminta, aplikasi memilih catatan berdasarkan judul, kategori, tujuan, konteks visual, dan kata kunci. AI mendapat identitas brand, aturan klaim, sumber, status, catatan relevan yang diprioritaskan, serta katalog lengkap 57 catatan untuk mencocokkan fitur yang tampak pada gambar meskipun judul belum spesifik. Hasil menampilkan **Pengetahuan yang diberikan kepada asisten** agar konteks dapat diperiksa. Daftar ini menunjukkan konteks yang diberikan, bukan sertifikasi semua klaim keluaran atau bukti AI benar-benar mematuhi setiap catatan.

Bantuan lokal memakai pemetaan topik untuk laundry, housekeeping, invoice, sarapan, ruang meeting, promo/deposit, sewa utuh/per kamar, website booking, laporan owner, dan status roadmap. Mode lokal tetap tidak membaca piksel media. Generator latar AI juga menerima konteks visual dan batas brand; logo dan tulisan tetap disusun dari aset asli.

Perbedaan sumber disimpan secara eksplisit: harga proposal masih simulasi; placeholder tim/pendiri tidak menjadi fakta; pembayaran/OTA/POS tidak dipromosikan sebagai sudah aktif; video housekeeping dari catatan lama tidak dipakai; data demo/pilot bukan testimoni; varian Key Fob Board tidak menimpa palet kampanye yang disetujui. Data tamu, token, password, dan dokumen rahasia tidak diimpor.

Sumber mentah ada di `knowledge/sources`, terpisah dari konteks model. JSON terkurasi ada di `knowledge/vayora-brand.json`. Tidak ada crawling otomatis atau pelatihan ulang model. Pembaruan fakta perlu peninjauan, pembaruan kurasi pada `scripts/build-brand-knowledge.mjs`, lalu `npm run knowledge:build`, pengujian, dan restart server. Website yang berubah tidak otomatis dianggap sebagai fakta baru.

## Yang dapat langsung dipakai

- Tiga variasi hook/caption, hashtag relevan, dan CTA berdasarkan kategori, judul, serta tujuan konten. Label **Mode lokal** berarti gambar belum dibaca. Hasil bukan analisis piksel atau prediksi jangkauan.
- Pemeriksaan editorial: konteks brand, CTA, panjang caption, hashtag, deskripsi aksesibilitas, caption duplikat, serta kata yang perlu diverifikasi. Pemeriksaan berbasis aturan ini tidak menjamin semua kesalahan ditemukan.
- Tiga pilihan waktu uji dalam WIB. Default 08.30, 12.15, dan 19.30 pada hari kerja merupakan hipotesis untuk diuji, bukan hasil Instagram Insights. Slot minimal satu jam mendatang, berjarak minimal dua jam dari jadwal/hasil terbit yang tercatat, dan memakai tanggal pilihan sebagai awal pencarian. Saran tidak mengendalikan delivery iklan berbayar.
- Pembuat image post 1080 × 1350: logo SVG asli, palet navy/krem/amber, judul/penjelasan/CTA, pilihan potongan maskot atau media pendamping. File JPG dapat diunduh atau dimasukkan sebagai draft baru.
- Tautan UTM untuk bio atau landing page, serta ringkasan sebaran topik. Analytics website tetap diperlukan untuk menghitung kunjungan dan permintaan demo.

## Mengaktifkan pembacaan gambar dan latar AI

1. Pemilik membuka **Pengaturan AI**.
2. Buat API key pada [dashboard OpenAI](https://platform.openai.com/api-keys), pastikan project memiliki akses model dan kredit API.
3. Masukkan key langsung di aplikasi. Jangan mengirim key atau password melalui chat.
4. Tetapkan batas permintaan harian. Default: 20 caption dan 3 latar per hari, direset berdasarkan tanggal WIB. Batas menghitung percobaan, termasuk kegagalan; bukan batas biaya uang. Atur batas pengeluaran di dashboard penyedia juga.
5. Di editor, pilih **AI · baca gambar / poster**, lengkapi konteks jika perlu, lalu **Buat pilihan caption**. Pilih hasil sebelum menerapkannya.
6. Untuk gambar, buka **Pembuat image post → Buat latar dengan AI**, isi brief dan tekan **Generate satu latar AI**. Periksa latar, lalu **Buat desain brand** untuk menyusun logo dan teks asli di atasnya. Hasil belum menjadi post sampai **Masukkan sebagai draft** dipilih.

API key tersimpan terenkripsi pada server memakai kunci lokal yang sama dengan koneksi Meta. Key tidak dikirim kembali ke browser. Pemilik dapat menghapus key melalui aplikasi; key yang ditetapkan lewat `OPENAI_API_KEY` harus dihapus dari konfigurasi server. Editor dapat meminta caption jika key telah tersedia; hanya pemilik dapat mengubah konfigurasi AI, arah brand, dan membuat latar AI berbayar. Pembuat desain lokal bisa dipakai editor.

Provider dipanggil dari server ke endpoint OpenAI resmi. Model caption: `gpt-5.4-mini` melalui Responses API dengan structured output; model latar: `gpt-image-2.5-flare` melalui Images API, satu gambar kualitas medium per permintaan. Tidak ada permintaan AI otomatis saat login, membuka editor, menyimpan, atau menjadwalkan.

## Batas analisis dan review

- Mode AI mengirim teks draft serta gambar terpilih ke OpenAI. Carousel mengirim semua slide sesuai urutan; alt text yang disarankan hanya untuk gambar pertama sesuai satu kolom deskripsi yang tersedia saat ini. Hindari data tamu pribadi pada materi yang dikirim.
- Reel dianalisis dari cover terpilih atau poster, bukan gerakan, keseluruhan video, atau audionya.
- Respons caption diminta dengan `store:false`. Ini tidak menjanjikan tidak ada retensi lain oleh provider; ikuti pengaturan dan kebijakan project API.
- Teks dalam gambar dan caption lama diperlakukan sebagai data tidak tepercaya, bukan instruksi kepada asisten.
- Hasil tetap memerlukan pemeriksaan manusia. Menekan **Bandingkan caption** menampilkan perbandingan; **Gunakan usulan ini** baru mengganti teks draft dan menghapus persetujuan lama. Tidak ada penyimpanan atau publikasi otomatis.
- Latar generatif adalah ilustrasi, bukan foto villa/pelanggan atau bukti hasil Vayora. Logo dan copy dibuat terpisah agar identitas brand tidak digambar ulang AI.
- Kegagalan provider tidak diulang otomatis agar tidak menambah permintaan berbayar tanpa tindakan pengguna. Tidak ada klaim keberhasilan ketika key atau saldo belum tersedia.

## Dasar brand dan strategi penemuan

Fakta produk diperiksa dari [website Vayora](https://vayora.id/) pada 16 November 2026. Booking engine diperlakukan sebagai layanan tambahan. Integrasi OTA dan semua cara bayar tidak dipromosikan sebagai fitur yang sudah aktif. Nama villa, angka dan transaksi demo bukan bukti hasil pelanggan. Pemilik dapat menyesuaikan audiens dan nada bicara; perubahan fakta produk perlu pembaruan daftar fakta pada aplikasi.

Fokus sosial: topik yang dicari operator villa, hook yang spesifik, manfaat yang sesuai visual, keyword natural, dan satu ajakan bertindak. Alt text untuk aksesibilitas. Tidak ada jaminan ranking Instagram, TikTok, atau Google dari caption/hashtag.

Prioritas pengembangan berikutnya:

1. Pencatatan hasil per campaign: jangkauan, simpan, bagikan, kunjungan profil, klik website, dan permintaan demo. Pisahkan organik dengan iklan berbayar.
2. Sinkronisasi Insights resmi setelah akun dan izin yang diperlukan tersedia; simpan tanggal pengambilan serta batas cakupan data. Jangan mengisi dashboard dengan angka contoh.
3. Bandingkan hook dan waktu dengan format/topik serupa, serta jendela pengukuran yang sama. Gunakan hasil untuk rekomendasi berikutnya, bukan satu post yang kebetulan tinggi.
4. Hubungkan campaign ke landing page yang sesuai masalah, pasang analytics/conversion event, dan perbaiki SEO website secara terpisah: isi halaman, judul/meta, tautan internal, indexing, dan kecepatan halaman.

Referensi implementasi: [vision](https://developers.openai.com/api/docs/guides/images-vision), [structured outputs](https://developers.openai.com/api/docs/guides/structured-outputs), [Images API](https://developers.openai.com/api/reference/resources/images/methods/generate).

## Verifikasi

`npm test` mencakup mode lokal tanpa jaringan, media asli yang dikirim pada mode vision, penyimpanan key terenkripsi, batas harian, sanitasi error, larangan retry otomatis, waktu uji, pemeriksaan klaim, dan hasil desain nyata. Browser test memakai database terpisah dan provider simulasi, tanpa kredit API atau perubahan akun pengguna. Pemanggilan OpenAI dengan key nyata perlu uji pengguna setelah konfigurasi.

## Pembaruan alur dan marketing

Caption dapat dibandingkan, diterapkan, dibatalkan sebelum disimpan, dan dipulihkan melalui versi tersimpan. Checklist kesiapan tersedia pada detail/editor. Marketing sekarang menyediakan campaign UTM per konten/pembuka, tracking kunjungan/CTA dengan consent, demo terkonfirmasi manual/backend, laporan produksi/uji terpisah, serta pengamatan performa manual/CSV. Daftar prioritas di atas tetap merupakan arah pengembangan untuk sinkronisasi platform dan SEO website; pemasangan serta batas aktual fitur sekarang dijelaskan pada [MARKETING.md](MARKETING.md).

## Navigasi fitur

Halaman Asisten lama telah dipisah: `#assistant` (caption), `#designer` (desain), `#knowledge` (bank pengetahuan dengan halaman dan detail sumber), `#ai-settings` (koneksi dan arah brand), serta `#strategy` (panduan strategi). Buka lewat sidebar desktop atau kelompok Menu di ponsel. Label dan bantuan antarmuka tersedia dalam ID/EN; isi catatan sumber tidak diterjemahkan otomatis.
