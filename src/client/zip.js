// Minimal ZIP reader for the import page: lists a .zip and turns its text/media entries into File objects, so a whole
// article package can be dropped without unpacking it first. Supports stored and deflate entries (what every common
// zip tool writes); ZIP64 and encrypted archives are rejected with a readable error.
const LIMITS = { entries: 5000, entryBytes: 100 * 1024 * 1024, totalBytes: 500 * 1024 * 1024 };
const WANTED = /\.(json|csv|txt|md|mp4|mov|jpe?g|png|webp)$/i;
const TYPES = { json: 'application/json', csv: 'text/csv', txt: 'text/plain', md: 'text/markdown', mp4: 'video/mp4', mov: 'video/quicktime', jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp' };

const fail = message => Object.assign(new Error(message), { code: 'ZIP' });

// Entry names never leave the archive: backslashes become slashes, "." and ".." segments and drive letters are dropped.
export function safePath(name) {
  return String(name).replace(/\\/g, '/').split('/').filter(part => part && part !== '.' && part !== '..' && !/^[A-Za-z]:$/.test(part)).join('/');
}

async function inflate(bytes) {
  if (typeof DecompressionStream === 'undefined') throw fail('This browser cannot open zip files. Unpack the zip and drop the folder instead.');
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

// Returns [{ path, size, read }] for every file entry; `read()` yields the uncompressed bytes.
export async function listZip(file) {
  const buffer = await file.arrayBuffer(), view = new DataView(buffer), bytes = new Uint8Array(buffer);
  let eocd = -1;
  for (let i = buffer.byteLength - 22; i >= Math.max(0, buffer.byteLength - 22 - 65535); i--) if (view.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
  if (eocd < 0) throw fail('This file is not a valid zip archive.');
  const count = view.getUint16(eocd + 10, true); let offset = view.getUint32(eocd + 16, true);
  if (count === 0xffff || offset === 0xffffffff) throw fail('ZIP64 archives are not supported. Unpack the zip and drop the folder instead.');
  if (count > LIMITS.entries) throw fail(`The zip has more than ${LIMITS.entries} files. Drop only the folder you need.`);
  const decoder = new TextDecoder('utf-8'), entries = [];
  for (let n = 0; n < count; n++) {
    if (view.getUint32(offset, true) !== 0x02014b50) throw fail('The zip archive is damaged.');
    const flags = view.getUint16(offset + 8, true), method = view.getUint16(offset + 10, true), compressed = view.getUint32(offset + 20, true), size = view.getUint32(offset + 24, true);
    const nameLength = view.getUint16(offset + 28, true), extraLength = view.getUint16(offset + 30, true), commentLength = view.getUint16(offset + 32, true), local = view.getUint32(offset + 42, true);
    const rawName = decoder.decode(bytes.subarray(offset + 46, offset + 46 + nameLength));
    offset += 46 + nameLength + extraLength + commentLength;
    if (rawName.endsWith('/')) continue; // folder entry
    if (flags & 1) throw fail('Encrypted zip files are not supported.');
    const path = safePath(rawName); if (!path) continue;
    entries.push({
      path, size,
      async read() {
        if (view.getUint32(local, true) !== 0x04034b50) throw fail('The zip archive is damaged.');
        const start = local + 30 + view.getUint16(local + 26, true) + view.getUint16(local + 28, true), data = bytes.subarray(start, start + compressed);
        if (method === 0) return data;
        if (method === 8) return inflate(data);
        throw fail('This zip uses an unsupported compression method.');
      },
    });
  }
  return entries;
}

// Zip → File objects with webkitRelativePath "<zip name>/<entry path>", like a dropped folder. Only text and media are
// kept; oversized entries and anything past the total limit are skipped.
export async function expandZip(file) {
  const base = String(file.name).replace(/\.zip$/i, ''), files = []; let total = 0;
  for (const entry of await listZip(file)) {
    if (!WANTED.test(entry.path) || entry.size > LIMITS.entryBytes || total + entry.size > LIMITS.totalBytes) continue;
    total += entry.size;
    const name = entry.path.split('/').pop(), ext = name.split('.').pop().toLowerCase();
    const out = new File([await entry.read()], name, { type: TYPES[ext] || '' });
    Object.defineProperty(out, 'webkitRelativePath', { value: `${base}/${entry.path}` });
    files.push(out);
  }
  return files;
}
