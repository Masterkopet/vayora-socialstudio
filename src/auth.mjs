import { randomBytes, scrypt as scryptCallback, timingSafeEqual, randomUUID } from 'node:crypto';
import { promisify } from 'node:util';
import { hash } from './store.mjs';
const scrypt = promisify(scryptCallback);
export async function hashPassword(password) { const salt = randomBytes(16).toString('hex'); const key = await scrypt(password, salt, 64); return `${salt}:${key.toString('hex')}`; }
export async function verifyPassword(password, stored) { const [salt, expected] = stored.split(':'); const key = await scrypt(password, salt, 64); const actual = Buffer.from(expected, 'hex'); return actual.length === key.length && timingSafeEqual(actual, key); }
export function validateAccount({ name, email, password }) {
  if (typeof name !== 'string' || name.trim().length < 2 || name.length > 100) throw Object.assign(new Error('Isi nama dengan 2–100 karakter.'), { status: 400 });
  if (typeof email !== 'string' || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) throw Object.assign(new Error('Alamat email tidak valid.'), { status: 400 });
  if (typeof password !== 'string' || password.length < 12 || password.length > 128) throw Object.assign(new Error('Password harus 12–128 karakter.'), { status: 400 });
}
export function createAuth(store, secure = false) {
  const attempts = new Map();
  const publicUser = user => ({ id: user.id, name: user.name, email: user.email, role: user.role });
  const cookieOptions = { httpOnly: true, sameSite: 'lax', secure, path: '/' };
  function session(req) { const cookies = Object.fromEntries((req.headers.cookie || '').split(';').map(x => { const i = x.indexOf('='); return i < 0 ? ['', ''] : [x.slice(0, i).trim(), x.slice(i + 1)]; })); const token = cookies['vayora.sid']; if (!token || !/^[a-f0-9]{64}$/.test(token)) return null; const row = store.get('SELECT s.*,u.email,u.name,u.role FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.hash=? AND s.expires>?', hash(token), Date.now()); return row || null; }
  function requireUser(req, res, next) { const s = session(req); if (!s) return res.status(401).json({ error: 'Silakan login terlebih dahulu.' }); req.session = s; req.user = { id: s.user_id, email: s.email, name: s.name, role: s.role }; next(); }
  function owner(req, res, next) { if (req.user?.role !== 'owner') return res.status(403).json({ error: 'Pengaturan ini hanya dapat diubah pemilik workspace.' }); next(); }
  function csrf(req, res, next) { const token = req.get('x-csrf-token') || ''; const expected = req.session?.csrf || ''; if (!/^[a-f0-9]{48}$/.test(token) || token.length !== expected.length || !timingSafeEqual(Buffer.from(token), Buffer.from(expected))) return res.status(403).json({ error: 'Sesi keamanan berubah. Muat ulang halaman lalu coba lagi.' }); next(); }
  function begin(req, res, user, remember = false) { const token = randomBytes(32).toString('hex'); const csrf = randomBytes(24).toString('hex'); const duration = (remember ? 7 * 24 : 8) * 3600000; store.run('DELETE FROM sessions WHERE expires<?', Date.now()); store.run('INSERT INTO sessions(hash,user_id,csrf,expires) VALUES(?,?,?,?)', hash(token), user.id, csrf, Date.now() + duration); res.cookie('vayora.sid', token, { ...cookieOptions, maxAge: duration }); return { user: publicUser(user), csrf }; }
  function throttle(req, res, next) { const key = `${req.socket.remoteAddress}:${String(req.body?.email || 'setup').toLowerCase().slice(0,254)}`; const now = Date.now(); const record = attempts.get(key); if (record && record.until > now && record.count >= 12) return res.status(429).json({ error: 'Terlalu banyak percobaan. Coba kembali dalam 15 menit.' }); attempts.set(key, record && record.until > now ? { ...record, count: record.count + 1 } : { count: 1, until: now + 900000 }); if (attempts.size > 1000) for (const [k,v] of attempts) if (v.until < now) attempts.delete(k); next(); }
  async function addUser(data, role) { validateAccount(data); const user = { id: randomUUID(), email: data.email.trim().toLowerCase(), name: data.name.trim(), password_hash: await hashPassword(data.password), role }; store.run('INSERT INTO users(id,email,name,password_hash,role,created_at) VALUES(?,?,?,?,?,?)', user.id, user.email, user.name, user.password_hash, role, new Date().toISOString()); return user; }
  return { session, requireUser, owner, csrf, begin, throttle, addUser, publicUser, cookieOptions };
}
