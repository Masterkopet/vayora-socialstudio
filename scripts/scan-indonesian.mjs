// Lists lines that still look Indonesian outside the places where Indonesian is intentional.
// Usage: node scripts/scan-indonesian.mjs [--summary] [path ...]
import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const args = process.argv.slice(2);
const summaryOnly = args.includes('--summary');
const targets = args.filter(a => !a.startsWith('--'));

// Intentional Indonesian: translation dictionaries, brand knowledge, seeded brand copy, import parsers.
const EXCLUDED = [
  /^src\/client\/(i18n|workflow-i18n|features-i18n|simple-i18n)\.js$/,
  /^src\/knowledge\.mjs$/,
  /^docs\/PENGETAHUAN-BRAND-VAYORA\.md$/,
  /^knowledge\//,
  /^scripts\/(build-brand-knowledge|import-vayora)\.mjs$/,
  /^scripts\/scan-indonesian\.mjs$/,
];
const SCAN_DIRS = ['src', 'tests', 'scripts', 'docs', 'deploy'];
const SCAN_FILES = ['README.md', 'Dockerfile', 'compose.production.yml', 'next.config.mjs', 'package.json'];
const EXT = /\.(mjs|js|jsx|md|json|yml|sh|ps1|cmd|css|html)$/;

const WORDS = new Set(`yang dan untuk tidak dengan dari atau belum sudah dapat akan pada karena dalam kamu anda jika bila saat setelah sebelum
harus perlu agar supaya lebih semua setiap hanya masih juga oleh adalah ada lalu kemudian sebagai antara tetap bukan baru sampai hingga maka serta
bagi kami kita mereka ini itu bisa tapi namun bahwa sebuah seluruh terlalu sangat paling sekali sedang telah pernah ingin mau jangan silakan
konten pilih simpan gagal berhasil ditemukan dibuat diubah dihapus dikirim dibatalkan diperbarui terhubung terjadwal jadwal tayang terbit
unggah tulis buat ubah hapus batal tambah kembali lanjut periksa ulangi coba silahkan belum sedang tersedia diperlukan wajib maksimal minimal
pengguna akun sandi kata kunci tautan berkas gambar video pesan kesalahan masalah hasil proses langkah halaman bagian tim anggota undangan
sesuai valid tidak boleh melebihi terlalu singkat panjang karakter kosong nama judul deskripsi catatan`.split(/\s+/));
// Words that are also valid English/code and should not count on their own.
const AMBIGUOUS = new Set(['ada', 'dari', 'ini', 'itu', 'bisa', 'mau', 'pada', 'dalam', 'baru', 'video', 'pilih', 'tayang', 'maka', 'oleh', 'atau', 'sedang', 'saat', 'tim', 'valid', 'hasil', 'proses', 'nama', 'kami', 'kita', 'tapi', 'bagi', 'ingin', 'buat', 'akun', 'ulangi', 'periksa']);

function walk(dir, out) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (['node_modules', '.next', 'data', 'test-results', '.git', 'vendor'].includes(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out); else if (EXT.test(entry.name)) out.push(full);
  }
}

const files = [];
if (targets.length) {
  for (const t of targets) { const full = path.resolve(root, t); if (statSync(full).isDirectory()) walk(full, files); else files.push(full); }
} else {
  for (const d of SCAN_DIRS) { try { walk(path.join(root, d), files); } catch { /* optional directory */ } }
  for (const f of SCAN_FILES) files.push(path.join(root, f));
}

const rows = [];
for (const file of files) {
  const rel = path.relative(root, file).replaceAll('\\', '/');
  if (EXCLUDED.some(rx => rx.test(rel))) continue;
  let text; try { text = readFileSync(file, 'utf8'); } catch { continue; }
  const lines = text.split(/\r?\n/);
  let hits = 0;
  lines.forEach((line, i) => {
    const words = line.toLowerCase().match(/[a-z]+/g) || [];
    let strong = 0, weak = 0;
    for (const w of words) if (WORDS.has(w)) (AMBIGUOUS.has(w) ? weak++ : strong++);
    if (strong >= 1 && strong + weak >= 2 || strong >= 2) { hits++; if (!summaryOnly) rows.push(`${rel}:${i + 1}: ${line.trim().slice(0, 160)}`); }
  });
  if (summaryOnly && hits) rows.push(`${String(hits).padStart(5)}  ${rel}`);
}
console.log(rows.join('\n'));
if (!summaryOnly) console.log(`\n${rows.length} suspicious line(s).`);
