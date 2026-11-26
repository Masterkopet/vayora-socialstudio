// Public legal pages of Vayora Social Studio (privacy policy and terms of service), Indonesian first and English second.
// Plain data, so the pages stay simple and the text can be reviewed in one place. Keep it in step with what the app really does.
export const LEGAL_UPDATED = '2026-11-26';
export const CONTACT_URL = 'https://vayora.id';

export const privacy = {
  id: {
    title: 'Kebijakan Privasi',
    intro: 'Vayora Social Studio adalah ruang kerja internal tim Vayora (vayora.id) untuk merencanakan, meninjau, dan menerbitkan konten Vayora sendiri ke Instagram, YouTube, Facebook, TikTok, dan blog Vayora. Ini bukan layanan publik: akun hanya dibuat lewat undangan oleh pemilik ruang kerja. Kebijakan ini menjelaskan data apa yang diproses dan bagaimana data itu dilindungi.',
    sections: [
      { h: 'Data yang kami proses', ul: [
        'Akun anggota tim: nama, alamat email, dan kata sandi yang disimpan dalam bentuk hash (bukan teks asli).',
        'Konten yang dibuat tim: video, foto, judul, caption, jadwal, serta riwayat perubahan dan penerbitan.',
        'Koneksi ke platform: token akses dan token penyegaran untuk akun Vayora di Instagram, YouTube, Facebook, TikTok, Google Drive, dan Sanity. Token disimpan terenkripsi di server dan tidak pernah ditampilkan kembali.',
        'Pengukuran situs vayora.id (hanya jika pengunjung menyetujui analitik): jenis peristiwa (kunjungan, klik tombol), halaman, dan pengenal sesi yang di-hash. Alamat IP dan cookie tidak disimpan untuk keperluan ini.',
      ] },
      { h: 'Penggunaan data TikTok', p: [
        'Studio memakai TikTok Login Kit untuk menghubungkan akun TikTok milik Vayora, dan Content Posting API untuk mengunggah atau menerbitkan konten Vayora sendiri ke akun tersebut.',
        'Dari TikTok kami membaca informasi profil dasar akun yang terhubung (ID pengguna, nama tampilan, nama pengguna) dan pengaturan pembuat konten (pilihan privasi dan durasi video maksimal) untuk memeriksa apakah sebuah posting boleh dikirim. Kami tidak membaca data pengguna TikTok lain, tidak mengumpulkan data dari akun yang tidak terhubung, dan tidak menjual atau membagikan data TikTok kepada pihak ketiga.',
        'Token TikTok disimpan terenkripsi dan hanya dipakai untuk menerbitkan konten yang disetujui tim. Pemilik ruang kerja dapat memutus koneksi kapan saja di Pengaturan → TikTok; token lalu dihapus. Izin juga dapat dicabut dari pengaturan keamanan akun TikTok.',
      ] },
      { h: 'Layanan pihak ketiga', p: [
        'Untuk menjalankan fungsinya, Studio mengirim data ke layanan yang dipilih tim: Meta (Instagram dan Facebook), Google (YouTube, Google Drive, dan Gemini untuk penulisan caption), TikTok, Sanity (blog), dan OpenAI (gambar, bila diaktifkan). Data dikirim hanya ketika anggota tim menjalankan tindakan terkait, misalnya menerbitkan sebuah posting atau meminta AI menulis caption dari sebuah video atau foto. Setiap layanan memiliki kebijakan privasinya sendiri.',
      ] },
      { h: 'Penyimpanan dan keamanan', ul: [
        'Seluruh akses memakai HTTPS. Kata sandi di-hash; rahasia koneksi dienkripsi sebelum disimpan.',
        'Data disimpan di server Vayora. Cadangan harian dienkripsi sebelum dikirim ke penyimpanan terpisah.',
        'Akses ke Studio dibatasi untuk anggota tim yang diundang, dengan peran Pemilik, Admin, atau Editor.',
      ] },
      { h: 'Retensi dan penghapusan', p: [
        'Data akun dan konten disimpan selama ruang kerja dipakai. Konten yang dihapus tidak lagi tampil di Studio. Anggota tim yang dihapus kehilangan akses seketika. Permintaan penghapusan data dapat diajukan lewat kontak di bawah.',
      ] },
      { h: 'Hak Anda', p: [
        'Anggota tim dapat meminta akses, koreksi, atau penghapusan data akunnya. Pemilik ruang kerja dapat memutus koneksi platform kapan saja.',
      ] },
      { h: 'Perubahan dan kontak', p: [
        'Kebijakan ini dapat diperbarui; tanggal pembaruan tertera di atas. Pertanyaan atau permintaan terkait data dapat disampaikan lewat kontak di situs Vayora.',
      ] },
    ],
  },
  en: {
    title: 'Privacy Policy',
    intro: 'Vayora Social Studio is the internal workspace of the Vayora team (vayora.id) for planning, reviewing and publishing Vayora\'s own content to Instagram, YouTube, Facebook, TikTok and the Vayora blog. It is not a public service: accounts are created only by invitation from the workspace owner. This policy explains what data is processed and how it is protected.',
    sections: [
      { h: 'Data we process', ul: [
        'Team member accounts: name, email address and a password stored only as a hash (never in plain text).',
        'Content created by the team: videos, photos, titles, captions, schedules, and the history of changes and publishing.',
        'Platform connections: access and refresh tokens for Vayora\'s accounts on Instagram, YouTube, Facebook, TikTok, Google Drive and Sanity. Tokens are stored encrypted on the server and are never shown again.',
        'Measurement on vayora.id (only when a visitor consents to analytics): event type (visit, button click), page, and a hashed session identifier. IP addresses and cookies are not stored for this purpose.',
      ] },
      { h: 'How TikTok data is used', p: [
        'Studio uses TikTok Login Kit to connect Vayora\'s own TikTok account, and the Content Posting API to upload or publish Vayora\'s own content to that account.',
        'From TikTok we read the basic profile of the connected account (user ID, display name, username) and the creator settings (privacy options and maximum video length) to check whether a post may be sent. We do not read other TikTok users\' data, do not collect data from accounts that are not connected, and do not sell or share TikTok data with third parties.',
        'TikTok tokens are stored encrypted and used only to publish content approved by the team. The workspace owner can disconnect at any time in Settings → TikTok, which deletes the tokens. Access can also be revoked in the TikTok account security settings.',
      ] },
      { h: 'Third-party services', p: [
        'To do its job, Studio sends data to the services the team chooses: Meta (Instagram and Facebook), Google (YouTube, Google Drive, and Gemini for writing captions), TikTok, Sanity (blog) and OpenAI (images, when enabled). Data is sent only when a team member performs the related action, for example publishing a post or asking the AI to write a caption from a video or photo. Each service has its own privacy policy.',
      ] },
      { h: 'Storage and security', ul: [
        'All access uses HTTPS. Passwords are hashed; connection secrets are encrypted before they are stored.',
        'Data is kept on Vayora\'s server. Daily backups are encrypted before they are sent to separate storage.',
        'Access to Studio is limited to invited team members with the Owner, Admin or Editor role.',
      ] },
      { h: 'Retention and deletion', p: [
        'Account and content data is kept while the workspace is in use. Deleted content no longer appears in Studio. A removed team member loses access immediately. Data deletion requests can be made through the contact below.',
      ] },
      { h: 'Your rights', p: [
        'Team members can ask for access to, correction of, or deletion of their account data. The workspace owner can disconnect any platform at any time.',
      ] },
      { h: 'Changes and contact', p: [
        'This policy may be updated; the update date is shown above. Questions or data requests can be sent through the contact on the Vayora website.',
      ] },
    ],
  },
};

export const terms = {
  id: {
    title: 'Syarat dan Ketentuan',
    intro: 'Syarat ini berlaku untuk penggunaan Vayora Social Studio, ruang kerja internal tim Vayora (vayora.id). Dengan masuk ke Studio, Anda menyetujui syarat berikut.',
    sections: [
      { h: 'Siapa yang boleh memakai', p: [
        'Studio hanya untuk anggota tim yang diundang oleh pemilik ruang kerja. Anda bertanggung jawab menjaga kerahasiaan kata sandi dan tidak membagikan akun.',
      ] },
      { h: 'Konten dan penerbitan', ul: [
        'Anda hanya boleh menerbitkan konten yang Anda berhak gunakan (hak cipta, musik, suara, gambar, dan klaim yang disampaikan).',
        'Konten yang diterbitkan ke Instagram, YouTube, Facebook, TikTok, atau blog tunduk pada syarat dan pedoman platform tersebut. Anda bertanggung jawab memastikan konten mematuhinya, termasuk label konten buatan AI bila diperlukan.',
        'Penerbitan otomatis hanya berjalan pada konten yang sudah disetujui dan dijadwalkan oleh tim.',
      ] },
      { h: 'Layanan pihak ketiga', p: [
        'Fitur Studio bergantung pada layanan pihak ketiga (Meta, Google, TikTok, Sanity, OpenAI). Ketersediaan, batas pemakaian, dan perubahan di layanan tersebut berada di luar kendali kami, dan dapat menyebabkan sebuah posting tertunda atau gagal.',
      ] },
      { h: 'Konten buatan AI', p: [
        'Judul dan caption yang ditulis AI adalah usulan. Tim wajib memeriksanya sebelum disetujui; AI dapat keliru.',
      ] },
      { h: 'Ketersediaan dan tanggung jawab', p: [
        'Studio disediakan apa adanya. Kami berupaya menjaganya tetap berjalan, tetapi tidak menjamin layanan bebas gangguan atau galat. Sejauh diizinkan hukum, kami tidak bertanggung jawab atas kerugian tidak langsung akibat penggunaan Studio.',
      ] },
      { h: 'Penghentian akses', p: [
        'Pemilik ruang kerja dapat mencabut akses anggota kapan saja. Akses dapat dihentikan bila terjadi penyalahgunaan atau pelanggaran syarat ini.',
      ] },
      { h: 'Perubahan, hukum, dan kontak', p: [
        'Syarat ini dapat diperbarui; tanggal pembaruan tertera di atas. Syarat ini tunduk pada hukum Republik Indonesia. Pertanyaan dapat disampaikan lewat kontak di situs Vayora.',
      ] },
    ],
  },
  en: {
    title: 'Terms of Service',
    intro: 'These terms apply to the use of Vayora Social Studio, the internal workspace of the Vayora team (vayora.id). By signing in to Studio you agree to them.',
    sections: [
      { h: 'Who may use it', p: [
        'Studio is only for team members invited by the workspace owner. You are responsible for keeping your password confidential and for not sharing your account.',
      ] },
      { h: 'Content and publishing', ul: [
        'You may only publish content you have the right to use (copyright, music, voice, images, and the claims made).',
        'Content published to Instagram, YouTube, Facebook, TikTok or the blog is subject to those platforms\' terms and guidelines. You are responsible for making sure it complies, including labels for AI-generated content where required.',
        'Automatic publishing only runs for content the team has approved and scheduled.',
      ] },
      { h: 'Third-party services', p: [
        'Studio features depend on third-party services (Meta, Google, TikTok, Sanity, OpenAI). Their availability, usage limits and changes are outside our control and can cause a post to be delayed or to fail.',
      ] },
      { h: 'AI-written content', p: [
        'Titles and captions written by AI are suggestions. The team must review them before approval; AI can be wrong.',
      ] },
      { h: 'Availability and liability', p: [
        'Studio is provided as is. We work to keep it running but do not guarantee that it is free of interruptions or errors. To the extent the law allows, we are not liable for indirect loss arising from the use of Studio.',
      ] },
      { h: 'Ending access', p: [
        'The workspace owner can withdraw a member\'s access at any time. Access may be ended in case of misuse or breach of these terms.',
      ] },
      { h: 'Changes, law and contact', p: [
        'These terms may be updated; the update date is shown above. They are governed by the laws of the Republic of Indonesia. Questions can be sent through the contact on the Vayora website.',
      ] },
    ],
  },
};
