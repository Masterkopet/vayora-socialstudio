import { randomBytes } from 'node:crypto';
import { createWriteStream } from 'node:fs';
import { mkdir, unlink } from 'node:fs/promises';
import path from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { hash } from './store.mjs';
import { addMedia } from './media.mjs';

// Google Drive as a source for Import content. The same Google OAuth client as YouTube is used (read-only Drive access,
// its own connection and refresh token). Files are never kept in Drive by Studio: videos and photos are downloaded by the
// server when the import runs and then handled like any upload; small text files (articles, metadata) are streamed to the
// browser so the Import page reads them the same way as files from the computer.
const SCOPE = 'https://www.googleapis.com/auth/drive.readonly';
const FOLDER = 'application/vnd.google-apps.folder', GDOC = 'application/vnd.google-apps.document';
const DOCX = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
const MAX_MEDIA_BYTES = 700 * 1024 * 1024, MAX_TEXT_BYTES = 100 * 1024 * 1024, WALK_LIMIT = 400, WALK_DEPTH = 4;
const SKIP_FOLDER = /^(node_modules|\.git|\.next|dist|build|out|cache|tmp)$/i;
const MEDIA_EXT = { mp4: 'video/mp4', mov: 'video/quicktime', jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp' };
const TEXT_EXT = /\.(json|csv|txt|md|docx|zip)$/i;
const ID = /^[A-Za-z0-9_-]{8,128}$/;

const fail = (message, code = 'DRIVE_ERROR', status = 422) => Object.assign(new Error(message), { status, code });
const extOf = name => String(name).toLowerCase().match(/\.([a-z0-9]+)$/)?.[1] || '';

// What the Import page can use from a Drive entry: a folder, a video/photo, a text-like file, or nothing.
export function kindOf(file) {
  if (file.mimeType === FOLDER) return 'folder';
  if (file.mimeType === GDOC) return 'text';
  const ext = extOf(file.name);
  if (MEDIA_EXT[ext] && (!file.mimeType || /^(video|image)\//.test(file.mimeType) || file.mimeType === 'application/octet-stream')) return 'media';
  if (TEXT_EXT.test(file.name)) return 'text';
  return null;
}
const nameOf = file => file.mimeType === GDOC && !/\.docx$/i.test(file.name) ? file.name + '.docx' : file.name;
const mediaMime = file => MEDIA_EXT[extOf(file.name)] || file.mimeType;

export function createDrive(store, getPublicBase, options = {}) {
  const transport = options.fetch || fetch;
  const connection = () => store.secret('drive.connection');
  const credentials = () => { const saved = store.secret('youtube.config', {}); return { clientId: process.env.YOUTUBE_CLIENT_ID || saved.clientId || '', clientSecret: process.env.YOUTUBE_CLIENT_SECRET || saved.clientSecret || '' }; };
  // Same address as the YouTube connection, so nothing new has to be registered in Google Cloud.
  const redirectUri = () => `${String(getPublicBase() || '').replace(/\/$/, '')}/auth/youtube/callback`;
  const stateHash = state => hash('dr:' + state);

  function status() {
    const c = credentials(), link = connection();
    return { configured: !!(c.clientId && c.clientSecret), connected: !!link?.refreshToken && !link.invalid, account: link?.email || null, error: link?.invalid ? 'Google Drive permission needs to be reconnected.' : null };
  }

  async function request(url, init = {}, { json = true } = {}) {
    let response;
    try { response = await transport(url, { ...init, signal: init.signal || AbortSignal.timeout(init.timeout || 30000) }); }
    catch { throw fail('The connection to Google Drive did not complete. Try again.', 'DRIVE_NETWORK'); }
    if (!response.ok) {
      let body = {}; try { body = await response.json(); } catch { /* no body */ }
      const raw = typeof body.error === 'object' ? body.error : { message: body.error_description || body.error, code: response.status };
      const reason = raw.errors?.[0]?.reason || (typeof body.error === 'string' ? body.error : '');
      if (reason === 'invalid_grant' || response.status === 401) {
        const link = connection(); if (link) store.setSecret('drive.connection', { ...link, invalid: true, accessToken: null });
        throw fail('Google Drive permission expired or was revoked. Reconnect Google Drive.', 'DRIVE_AUTH');
      }
      if (/accessNotConfigured|SERVICE_DISABLED/i.test(reason + JSON.stringify(body).slice(0, 400))) throw fail('Turn on the Google Drive API for the Google Cloud project, then try again.', 'DRIVE_API_DISABLED');
      if (response.status === 404) throw fail('That Drive file was not found, or this account cannot open it.', 'DRIVE_NOT_FOUND', 404);
      throw fail('Google Drive refused the request' + (raw.code ? ' (code ' + raw.code + ')' : '') + '.', 'DRIVE_REJECTED');
    }
    return json ? response.json() : response;
  }

  function start(userId, sessionHash) {
    const c = credentials();
    if (!c.clientId || !c.clientSecret) throw fail('Set up the Google client under Settings → YouTube first; Google Drive uses the same one.', 'DRIVE_NOT_CONFIGURED');
    if (!/^https:\/\//.test(String(getPublicBase() || ''))) throw fail('Connecting Google Drive needs a public HTTPS address.', 'PUBLIC_URL_REQUIRED');
    const state = randomBytes(32).toString('hex');
    store.run('DELETE FROM oauth_states WHERE expires<?', Date.now());
    store.run('INSERT INTO oauth_states(hash,user_id,session_hash,expires) VALUES(?,?,?,?)', stateHash(state), userId, sessionHash, Date.now() + 600000);
    const url = new URL('https://accounts.google.com/o/oauth2/v2/auth');
    Object.entries({ client_id: c.clientId, redirect_uri: redirectUri(), response_type: 'code', scope: SCOPE, access_type: 'offline', prompt: 'consent', state }).forEach(([k, v]) => url.searchParams.set(k, v));
    return url.href;
  }
  // The shared callback route asks first whether the state belongs to a Drive connection.
  const ownsState = state => typeof state === 'string' && /^[a-f0-9]{64}$/.test(state) && !!store.get('SELECT hash FROM oauth_states WHERE hash=?', stateHash(state));

  async function callback({ state, code, error }, userId, sessionHash) {
    if (!ownsState(state)) throw fail('Invalid connection request. Start again from the Import page.', 'INVALID_STATE');
    const row = store.get('SELECT * FROM oauth_states WHERE hash=?', stateHash(state));
    if (row.user_id !== userId || row.session_hash !== sessionHash || row.expires < Date.now()) throw fail('The connection request expired or came from a different session.', 'INVALID_STATE');
    store.run('DELETE FROM oauth_states WHERE hash=?', stateHash(state));
    if (error) throw fail(error === 'access_denied' ? 'Google Drive connection cancelled.' : 'Google refused the Drive connection.', 'OAUTH_CANCELLED');
    if (!code || String(code).length > 2048) throw fail('Invalid Google Drive connection code.', 'INVALID_CODE');
    const c = credentials();
    const grant = await request('https://oauth2.googleapis.com/token', { method: 'POST', body: new URLSearchParams({ code: String(code), client_id: c.clientId, client_secret: c.clientSecret, redirect_uri: redirectUri(), grant_type: 'authorization_code' }) });
    if (typeof grant.access_token !== 'string' || !grant.access_token) throw fail('Google did not grant access permission.', 'INVALID_TOKEN');
    const refreshToken = grant.refresh_token || connection()?.refreshToken;
    if (!refreshToken) throw fail('Google did not provide a refresh token. Revoke the app access in your Google account, then reconnect.', 'NO_REFRESH_TOKEN');
    const about = await request('https://www.googleapis.com/drive/v3/about?fields=user(emailAddress,displayName)', { headers: { Authorization: `Bearer ${grant.access_token}` } });
    store.setSecret('drive.connection', { refreshToken, accessToken: grant.access_token, expiresAt: Date.now() + Number(grant.expires_in || 3600) * 1000, email: about.user?.emailAddress || about.user?.displayName || 'Google account', invalid: false, connectedAt: Date.now() });
    store.event(null, 'Google Drive connected', (about.user?.emailAddress || 'Google account') + ' can be used as an import source.', 'connection', userId);
    return status();
  }

  async function accessToken() {
    const link = connection();
    if (!link?.refreshToken || link.invalid) throw fail('Google Drive is not connected.', 'NOT_CONNECTED', 409);
    if (link.accessToken && link.expiresAt - Date.now() > 120000) return link.accessToken;
    const c = credentials();
    const grant = await request('https://oauth2.googleapis.com/token', { method: 'POST', body: new URLSearchParams({ client_id: c.clientId, client_secret: c.clientSecret, refresh_token: link.refreshToken, grant_type: 'refresh_token' }) });
    if (typeof grant.access_token !== 'string' || !grant.access_token) throw fail('Google did not renew the access permission.', 'INVALID_TOKEN');
    store.setSecret('drive.connection', { ...connection(), accessToken: grant.access_token, expiresAt: Date.now() + Number(grant.expires_in || 3600) * 1000 });
    return grant.access_token;
  }
  const authed = async () => ({ Authorization: `Bearer ${await accessToken()}` });
  const disconnect = () => store.run("DELETE FROM settings WHERE key='drive.connection'");

  const folderId = value => { const id = String(value || 'root'); if (id !== 'root' && id !== 'shared' && !ID.test(id)) throw fail('Invalid folder.', 'DRIVE_BAD_ID', 400); return id; };
  const fileId = value => { const id = String(value || ''); if (!ID.test(id)) throw fail('Invalid file.', 'DRIVE_BAD_ID', 400); return id; };
  const FIELDS = 'nextPageToken,files(id,name,mimeType,size,modifiedTime)';
  async function page(parent, pageToken) {
    const q = parent === 'shared' ? 'sharedWithMe=true and trashed=false' : `'${parent}' in parents and trashed=false`;
    const url = new URL('https://www.googleapis.com/drive/v3/files');
    Object.entries({ q, fields: FIELDS, orderBy: 'folder,name', pageSize: '100', supportsAllDrives: 'true', includeItemsFromAllDrives: 'true', ...(pageToken ? { pageToken: String(pageToken).slice(0, 2000) } : {}) }).forEach(([k, v]) => url.searchParams.set(k, v));
    return request(url.href, { headers: await authed() });
  }
  const entry = f => ({ id: f.id, name: nameOf(f), kind: kindOf(f), size: Number(f.size) || 0, modifiedTime: f.modifiedTime || null });

  // One folder, one page: what the picker shows.
  async function list(parent, pageToken) {
    const id = folderId(parent), data = await page(id, pageToken);
    return { folder: id, files: (data.files || []).map(entry).filter(f => f.kind), nextPageToken: data.nextPageToken || null };
  }
  // A whole folder tree as a flat list with relative paths, like a folder chosen on the computer ("01 - Title/Video/x.mp4").
  async function walk(root) {
    const id = folderId(root), out = [], queue = [{ id, prefix: '', depth: 0 }];
    while (queue.length) {
      const { id: current, prefix, depth } = queue.shift();
      let token = null;
      do {
        const data = await page(current, token); token = data.nextPageToken || null;
        for (const f of data.files || []) {
          const item = entry(f);
          if (item.kind === 'folder') { if (depth < WALK_DEPTH && !SKIP_FOLDER.test(f.name) && !f.name.startsWith('.')) queue.push({ id: f.id, prefix: prefix + f.name + '/', depth: depth + 1 }); }
          else if (item.kind) { out.push({ ...item, path: prefix + item.name }); if (out.length > WALK_LIMIT) throw fail(`That folder has more than ${WALK_LIMIT} usable files. Choose a smaller folder.`, 'DRIVE_TOO_MANY', 413); }
        }
      } while (token);
    }
    return { files: out };
  }

  async function meta(id) { return request(`https://www.googleapis.com/drive/v3/files/${fileId(id)}?fields=id,name,mimeType,size&supportsAllDrives=true`, { headers: await authed() }); }
  // The bytes of one file, as a web Response (Google Docs are exported as .docx).
  async function open(id) {
    const f = await meta(id), kind = kindOf(f);
    if (!kind || kind === 'folder') throw fail('This file type cannot be imported.', 'DRIVE_UNSUPPORTED', 415);
    const limit = kind === 'media' ? MAX_MEDIA_BYTES : MAX_TEXT_BYTES;
    if (Number(f.size) > limit) throw fail(`That file is larger than ${Math.round(limit / 1048576)} MB.`, 'DRIVE_TOO_LARGE', 413);
    const url = f.mimeType === GDOC ? `https://www.googleapis.com/drive/v3/files/${f.id}/export?mimeType=${encodeURIComponent(DOCX)}` : `https://www.googleapis.com/drive/v3/files/${f.id}?alt=media&supportsAllDrives=true`;
    const response = await request(url, { headers: await authed(), timeout: 600000 }, { json: false });
    return { response, name: nameOf(f), mime: f.mimeType === GDOC ? DOCX : mediaMime(f), kind };
  }

  // Server-side import of a video or photo: Drive → temporary file → the usual media pipeline (checks, conversion, poster).
  async function importMedia(id, role = 'content') {
    const file = await open(id);
    if (file.kind !== 'media') throw fail('Only videos and photos are imported this way.', 'DRIVE_UNSUPPORTED', 415);
    const directory = path.join(store.directory, 'tmp'); await mkdir(directory, { recursive: true });
    const temp = path.join(directory, 'drive-' + randomBytes(8).toString('hex') + '.' + (extOf(file.name) || 'bin'));
    try {
      let bytes = 0;
      const counter = async function* (source) { for await (const chunk of source) { bytes += chunk.length; if (bytes > MAX_MEDIA_BYTES) throw fail('That file is too large.', 'DRIVE_TOO_LARGE', 413); yield chunk; } };
      await pipeline(Readable.fromWeb(file.response.body), counter, createWriteStream(temp));
      return await addMedia(store, temp, file.name, file.mime, role === 'cover' ? 'cover' : 'content');
    } finally { await unlink(temp).catch(() => {}); }
  }

  return { status, start, ownsState, callback, disconnect, list, walk, open, importMedia };
}
