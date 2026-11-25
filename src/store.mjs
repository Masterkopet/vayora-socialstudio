import { DatabaseSync } from 'node:sqlite';
import { mkdirSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { randomBytes, createHash, createCipheriv, createDecipheriv } from 'node:crypto';

export const hash = value => createHash('sha256').update(value).digest('hex');
export function openStore(directory) {
  mkdirSync(directory, { recursive: true });
  const db = new DatabaseSync(path.join(directory, 'studio.sqlite'));
  db.exec(`PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;
    CREATE TABLE IF NOT EXISTS users(id TEXT PRIMARY KEY,email TEXT UNIQUE NOT NULL,name TEXT NOT NULL,password_hash TEXT NOT NULL,role TEXT NOT NULL,created_at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS sessions(hash TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES users(id),csrf TEXT NOT NULL,expires INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS invites(hash TEXT PRIMARY KEY,email TEXT NOT NULL,expires INTEGER NOT NULL,created_by TEXT NOT NULL,used INTEGER NOT NULL DEFAULT 0);
    CREATE TABLE IF NOT EXISTS settings(key TEXT PRIMARY KEY,value TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS media(id TEXT PRIMARY KEY,path TEXT NOT NULL,mime TEXT NOT NULL,name TEXT NOT NULL,size INTEGER NOT NULL,width INTEGER,height INTEGER,duration REAL,poster TEXT,created_at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS posts(id TEXT PRIMARY KEY,data TEXT NOT NULL,status TEXT NOT NULL,revision INTEGER NOT NULL DEFAULT 1,schedule_at TEXT,updated_at TEXT NOT NULL);
    CREATE INDEX IF NOT EXISTS posts_schedule ON posts(status,schedule_at);
    CREATE TABLE IF NOT EXISTS events(id INTEGER PRIMARY KEY AUTOINCREMENT,post_id TEXT,title TEXT NOT NULL,detail TEXT NOT NULL,type TEXT NOT NULL,actor TEXT,created_at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS oauth_states(hash TEXT PRIMARY KEY,user_id TEXT NOT NULL,session_hash TEXT NOT NULL,expires INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS post_versions(id TEXT PRIMARY KEY,post_id TEXT NOT NULL,revision INTEGER NOT NULL,body TEXT NOT NULL,reason TEXT NOT NULL,actor TEXT,created_at TEXT NOT NULL,UNIQUE(post_id,revision));
  `);
  const keyPath = path.join(directory, '.encryption-key');
  if (!existsSync(keyPath)) writeFileSync(keyPath, randomBytes(32), { mode: 0o600, flag: 'wx' });
  const key = readFileSync(keyPath);
  if (key.length !== 32) throw new Error('Kunci enkripsi lokal tidak valid.');
  const get = (sql, ...params) => db.prepare(sql).get(...params);
  const all = (sql, ...params) => db.prepare(sql).all(...params);
  const run = (sql, ...params) => db.prepare(sql).run(...params);
  function setting(key, fallback = null) { const row = get('SELECT value FROM settings WHERE key=?', key); return row ? JSON.parse(row.value) : fallback; }
  function set(key, value) { run('INSERT INTO settings(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value', key, JSON.stringify(value)); }
  function encrypt(value) { const iv = randomBytes(12); const cipher = createCipheriv('aes-256-gcm', key, iv); const body = Buffer.concat([cipher.update(JSON.stringify(value), 'utf8'), cipher.final()]); return [iv, cipher.getAuthTag(), body].map(x => x.toString('base64')).join('.'); }
  function decrypt(value) { const [iv, tag, body] = value.split('.').map(x => Buffer.from(x, 'base64')); const decipher = createDecipheriv('aes-256-gcm', key, iv); decipher.setAuthTag(tag); return JSON.parse(Buffer.concat([decipher.update(body), decipher.final()]).toString('utf8')); }
  function secret(key, fallback = null) { const value = setting(key); return value ? decrypt(value) : fallback; }
  function setSecret(key, value) { set(key, encrypt(value)); }
  function event(postId, title, detail = '', type = 'change', actor = null) { run('INSERT INTO events(post_id,title,detail,type,actor,created_at) VALUES(?,?,?,?,?,?)', postId, title, detail, type, actor, new Date().toISOString()); }
  function post(id) { const row = get('SELECT * FROM posts WHERE id=?', id); return row ? { ...JSON.parse(row.data), id: row.id, status: row.status, revision: row.revision, scheduleAt: row.schedule_at, updatedAt: row.updated_at } : null; }
  // Deleted content keeps its row (status 'deleted') so its id is never reused by a new copy and its history stays intact,
  // but it leaves every list, the queue and the scheduler.
  function posts() { return all("SELECT id FROM posts WHERE status<>'deleted' ORDER BY id").map(x => post(x.id)); }
  function content(item){return Object.fromEntries(['title','caption','alt','category','goal','mediaIds','coverId','coverTime'].map(k=>[k,item[k]??null]));}
  function snapshot(item,{reason='edit',actor=null}={}){run('INSERT OR IGNORE INTO post_versions(id,post_id,revision,body,reason,actor,created_at) VALUES(?,?,?,?,?,?,?)',randomBytes(12).toString('hex'),item.id,item.revision,JSON.stringify(content(item)),reason,actor,new Date().toISOString());}
  function insertPost(item) { const now = new Date().toISOString();db.exec('BEGIN IMMEDIATE');try{run('INSERT INTO posts(id,data,status,schedule_at,updated_at) VALUES(?,?,?,?,?)', item.id, JSON.stringify(item), item.status || 'draft', item.scheduleAt || null, now);const saved=post(item.id);snapshot(saved,{reason:'initial'});db.exec('COMMIT');return saved;}catch(e){db.exec('ROLLBACK');throw e;} }
  function savePost(item, expected = item.revision, metadata={}) { const now = new Date().toISOString();db.exec('BEGIN IMMEDIATE');try{const before=post(item.id);const result = run('UPDATE posts SET data=?,status=?,schedule_at=?,updated_at=?,revision=revision+1 WHERE id=? AND revision=?', JSON.stringify(item), item.status, item.scheduleAt || null, now, item.id, expected); if (result.changes !== 1) { const error = new Error('The post changed in another session. Reload it before saving.'); error.status = 409; throw error; }const saved=post(item.id);if(JSON.stringify(content(before))!==JSON.stringify(content(saved)))snapshot(saved,metadata);db.exec('COMMIT');return saved;}catch(e){db.exec('ROLLBACK');throw e;} }
  function recover() { for (const item of posts().filter(x => x.status === 'processing')) { item.status = item.job?.publishRequested ? 'uncertain' : 'failed'; item.error = item.job?.publishRequested ? 'Server berhenti setelah permintaan publikasi. Periksa status hasil sebelum mencoba lagi.' : 'Persiapan terhenti saat server dimulai ulang. Jadwalkan kembali.'; item.errorCode = 'SERVER_RESTARTED'; savePost(item); event(item.id, 'Pemulihan proses publikasi', item.error, 'failed'); } }
  for(const item of posts())if(!get('SELECT id FROM post_versions WHERE post_id=? LIMIT 1',item.id))snapshot(item,{reason:'baseline'});
  return { db, key, directory, get, all, run, setting, set, secret, setSecret, event, post, posts, insertPost, savePost, recover, close: () => db.close() };
}
