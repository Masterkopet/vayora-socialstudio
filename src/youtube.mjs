import { randomBytes } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { hash } from './store.mjs';
import { mediaPath } from './media.mjs';
import { metaReason as sanitizeReason } from './instagram.mjs';

// YouTube Shorts publishing through the YouTube Data API v3.
// Connection: Google OAuth (web client) with offline access; the refresh token is stored encrypted and access tokens are
// renewed on demand. Upload: resumable upload of the post's MP4. A Short is a vertical or square video of at most 3 minutes.
// Videos from API projects that have not passed Google's API audit are locked to private by YouTube; Studio records that.

const SCOPES = ['https://www.googleapis.com/auth/youtube.upload', 'https://www.googleapis.com/auth/youtube.readonly'];
const PRIVACY = ['public', 'unlisted', 'private'];
export const SHORT_MAX_SECONDS = 180;
export const YOUTUBE_TITLE_MAX = 100;

const fail = (message, code = 'YOUTUBE_ERROR', status = 422) => Object.assign(new Error(message), { status, code });

// YouTube rejects titles with angle brackets; titles are limited to 100 characters.
export function youtubeTitle(value) { return String(value || '').replace(/[<>]/g, '').trim().slice(0, YOUTUBE_TITLE_MAX); }

export function shortMediaReady(media) {
  return !!media && media.mime === 'video/mp4' && Number(media.duration) > 0 && Number(media.duration) <= SHORT_MAX_SECONDS
    && Number(media.width) > 0 && Number(media.height) >= Number(media.width);
}

export function createYouTube(store, getPublicBase, options = {}) {
  const transport = options.fetch || fetch;
  const connection = () => store.secret('youtube.connection');
  function config() {
    const saved = store.secret('youtube.config', {});
    return {
      clientId: process.env.YOUTUBE_CLIENT_ID || saved.clientId || '',
      clientSecret: process.env.YOUTUBE_CLIENT_SECRET || saved.clientSecret || '',
      privacy: PRIVACY.includes(saved.privacy) ? saved.privacy : 'public',
    };
  }
  const redirectUri = () => `${String(getPublicBase() || '').replace(/\/$/, '')}/auth/youtube/callback`;

  function status() {
    const c = config(), link = connection();
    return {
      configured: !!(c.clientId && c.clientSecret), clientId: c.clientId, privacy: c.privacy,
      callbackUrl: getPublicBase() ? redirectUri() : null,
      connected: !!link?.refreshToken && !link.invalid, channelId: link?.channelId || null, channelTitle: link?.channelTitle || null,
      error: link?.invalid ? 'Izin YouTube perlu disambungkan kembali.' : null,
    };
  }

  // Google errors are {error:{code,message,errors:[{reason}]}}; the token endpoint uses {error,error_description}.
  async function request(url, init = {}, { json = true } = {}) {
    let response;
    try { response = await transport(url, { ...init, signal: init.signal || AbortSignal.timeout(init.timeout || 30000) }); }
    catch { throw fail('Koneksi ke YouTube tidak selesai. Periksa status sebelum mencoba lagi.', 'YOUTUBE_NETWORK'); }
    if (!response.ok) {
      let body = {}; try { body = await response.json(); } catch {}
      const raw = typeof body.error === 'object' ? body.error : { message: body.error_description || body.error, code: response.status };
      const reason = raw.errors?.[0]?.reason || (typeof body.error === 'string' ? body.error : '');
      if (reason === 'invalid_grant' || response.status === 401) {
        const link = connection(); if (link) store.setSecret('youtube.connection', { ...link, invalid: true, accessToken: null });
        throw fail('Izin YouTube kedaluwarsa atau dicabut. Sambungkan kembali channel.', 'YOUTUBE_AUTH');
      }
      if (reason === 'quotaExceeded' || reason === 'uploadLimitExceeded') throw fail('Batas unggah atau kuota YouTube hari ini tercapai. Jadwalkan kembali besok.', 'YOUTUBE_QUOTA');
      const detail = sanitizeReason(raw.message);
      throw fail(`YouTube menolak permintaan${raw.code ? ' (kode ' + raw.code + ')' : ''}${reason ? ' [' + sanitizeReason(reason) + ']' : ''}${detail ? ': ' + detail : ''}.`, 'YOUTUBE_REJECTED');
    }
    return json ? response.json() : response;
  }

  function saveConfig({ clientId, clientSecret, privacy }) {
    const previous = store.secret('youtube.config', {});
    const id = String(clientId || '').trim(), secret = String(clientSecret || previous.clientSecret || '').trim();
    if (id && !/^[0-9]+-[a-z0-9]+\.apps\.googleusercontent\.com$/.test(id)) throw fail('Client ID tidak valid. Salin dari Google Cloud → Credentials (berakhiran .apps.googleusercontent.com).', 'YOUTUBE_CONFIG', 400);
    if (secret && (secret.length > 200 || /\s/.test(secret))) throw fail('Client Secret tidak valid.', 'YOUTUBE_CONFIG', 400);
    const level = PRIVACY.includes(privacy) ? privacy : previous.privacy || 'public';
    store.setSecret('youtube.config', { clientId: id, clientSecret: secret, privacy: level });
    return status();
  }

  function start(userId, sessionHash) {
    const c = config();
    if (!c.clientId || !c.clientSecret) throw fail('Isi Client ID dan Client Secret dari Google Cloud terlebih dahulu.', 'YOUTUBE_NOT_CONFIGURED');
    if (!/^https:\/\//.test(String(getPublicBase() || ''))) throw fail('Koneksi YouTube memerlukan alamat HTTPS publik.', 'PUBLIC_URL_REQUIRED');
    const state = randomBytes(32).toString('hex');
    store.run('DELETE FROM oauth_states WHERE expires<?', Date.now());
    store.run('INSERT INTO oauth_states(hash,user_id,session_hash,expires) VALUES(?,?,?,?)', hash('yt:' + state), userId, sessionHash, Date.now() + 600000);
    const url = new URL('https://accounts.google.com/o/oauth2/v2/auth');
    Object.entries({ client_id: c.clientId, redirect_uri: redirectUri(), response_type: 'code', scope: SCOPES.join(' '), access_type: 'offline', prompt: 'consent', include_granted_scopes: 'true', state })
      .forEach(([k, v]) => url.searchParams.set(k, v));
    return url.href;
  }

  async function callback({ state, code, error }, userId, sessionHash) {
    if (typeof state !== 'string' || !/^[a-f0-9]{64}$/.test(state)) throw fail('Permintaan koneksi tidak valid. Mulai kembali dari halaman koneksi.', 'INVALID_STATE');
    const row = store.get('SELECT * FROM oauth_states WHERE hash=?', hash('yt:' + state));
    if (!row || row.user_id !== userId || row.session_hash !== sessionHash || row.expires < Date.now()) throw fail('Permintaan koneksi sudah kedaluwarsa atau berasal dari sesi berbeda.', 'INVALID_STATE');
    store.run('DELETE FROM oauth_states WHERE hash=?', hash('yt:' + state));
    if (error) throw fail(error === 'access_denied' ? 'Koneksi YouTube dibatalkan.' : `Google menolak koneksi: ${sanitizeReason(error)}.`, 'OAUTH_CANCELLED');
    if (!code || String(code).length > 2048) throw fail('Kode koneksi YouTube tidak valid.', 'INVALID_CODE');
    const c = config();
    const grant = await request('https://oauth2.googleapis.com/token', { method: 'POST', body: new URLSearchParams({ code: String(code), client_id: c.clientId, client_secret: c.clientSecret, redirect_uri: redirectUri(), grant_type: 'authorization_code' }) });
    if (typeof grant.access_token !== 'string' || !grant.access_token) throw fail('Google tidak memberikan izin akses.', 'INVALID_TOKEN');
    const refreshToken = grant.refresh_token || connection()?.refreshToken;
    if (!refreshToken) throw fail('Google tidak memberikan refresh token. Cabut akses aplikasi di akun Google lalu sambungkan ulang.', 'NO_REFRESH_TOKEN');
    const channels = await request('https://www.googleapis.com/youtube/v3/channels?part=snippet&mine=true', { headers: { Authorization: `Bearer ${grant.access_token}` } });
    const channel = channels.items?.[0];
    if (!channel?.id) throw fail('Akun Google ini belum punya channel YouTube. Buat channel dulu lalu sambungkan ulang.', 'NO_CHANNEL');
    store.setSecret('youtube.connection', { refreshToken, accessToken: grant.access_token, expiresAt: Date.now() + Number(grant.expires_in || 3600) * 1000, channelId: channel.id, channelTitle: channel.snippet?.title || channel.id, invalid: false, connectedAt: Date.now() });
    store.event(null, 'YouTube connected', `Channel ${channel.snippet?.title || channel.id} dihubungkan.`, 'connection', userId);
    return status();
  }

  async function accessToken() {
    const link = connection();
    if (!link?.refreshToken || link.invalid) throw fail('YouTube belum terhubung.', 'NOT_CONNECTED');
    if (link.accessToken && link.expiresAt - Date.now() > 120000) return link.accessToken;
    const c = config();
    const grant = await request('https://oauth2.googleapis.com/token', { method: 'POST', body: new URLSearchParams({ client_id: c.clientId, client_secret: c.clientSecret, refresh_token: link.refreshToken, grant_type: 'refresh_token' }) });
    if (typeof grant.access_token !== 'string' || !grant.access_token) throw fail('Google tidak memperbarui izin akses.', 'INVALID_TOKEN');
    store.setSecret('youtube.connection', { ...connection(), accessToken: grant.access_token, expiresAt: Date.now() + Number(grant.expires_in || 3600) * 1000 });
    return grant.access_token;
  }

  async function check() {
    const token = await accessToken();
    const channels = await request('https://www.googleapis.com/youtube/v3/channels?part=snippet&mine=true', { headers: { Authorization: `Bearer ${token}` } });
    const channel = channels.items?.[0];
    if (channel?.id) store.setSecret('youtube.connection', { ...connection(), channelId: channel.id, channelTitle: channel.snippet?.title || channel.id });
    return status();
  }

  function disconnect() { store.run("DELETE FROM settings WHERE key='youtube.connection'"); }

  function ensureLive(manual) {
    if ((!manual && store.setting('paused', true)) || !store.setting('publishingEnabled', false)) throw fail('Publikasi sedang dijeda atau belum diaktifkan.', 'PAUSED');
    if (!status().connected) throw fail('YouTube belum terhubung atau izinnya kedaluwarsa.', 'NOT_CONNECTED');
  }

  async function run(id, { manual = false } = {}) {
    ensureLive(manual);
    let item = store.post(id);
    if (!item || item.format !== 'Short' || item.status !== 'scheduled' || !item.approved || item.mediaId || item.job?.publishRequested) throw fail('Konten ini tidak memenuhi syarat untuk diunggah.', 'NOT_ELIGIBLE');
    item.status = 'processing'; item.error = ''; item.job = item.job || {}; item = store.savePost(item);
    let uploadSent = false;
    try {
      const media = store.get('SELECT * FROM media WHERE id=?', item.mediaIds?.[0]);
      if (!shortMediaReady(media)) throw fail('Video Short harus MP4 vertikal atau persegi dengan durasi maksimal 3 menit.', 'MEDIA_INVALID');
      const title = youtubeTitle(item.title);
      if (!title) throw fail('Judul YouTube tidak boleh kosong.', 'TITLE_REQUIRED');
      const privacy = config().privacy;
      // Studio caps uploads at 100 MB, so the whole file is read once and sent with an exact Content-Length (no chunked encoding).
      const bytes = await readFile(mediaPath(store, media));
      const token = await accessToken();
      const metadata = { snippet: { title, description: String(item.caption || '').slice(0, 5000), categoryId: '22', ...(Array.isArray(item.tags) && item.tags.length ? { tags: item.tags } : {}) }, status: { privacyStatus: privacy, selfDeclaredMadeForKids: false, ...(item.syntheticMedia ? { containsSyntheticMedia: true } : {}) } };
      const session = await request('https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status', {
        method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json; charset=UTF-8', 'X-Upload-Content-Length': String(bytes.length), 'X-Upload-Content-Type': 'video/mp4' }, body: JSON.stringify(metadata),
      }, { json: false });
      const location = session.headers.get('location');
      if (!location || !/^https:\/\/www\.googleapis\.com\/upload\/youtube\/v3\/videos\?/.test(location)) throw fail('YouTube tidak memberikan alamat unggah.', 'UPLOAD_SESSION');
      // Persist before sending the bytes: an interrupted response must never cause an automatic second upload.
      item.job.publishRequested = new Date().toISOString(); item.job.youtubeTitle = title; item.job.youtubePrivacy = privacy; item = store.savePost(item); uploadSent = true;
      const video = await request(location, { method: 'PUT', headers: { 'Content-Type': 'video/mp4', 'Content-Length': String(bytes.length) }, body: bytes, timeout: 15 * 60000 });
      if (!video?.id) throw fail('Hasil unggah belum dapat dipastikan.', 'MISSING_VIDEO_ID');
      const locked = privacy !== 'private' && video.status?.privacyStatus === 'private';
      item = store.post(id);
      Object.assign(item, { mediaId: String(video.id), status: 'published', publishedAt: new Date().toISOString(), error: '', permalink: `https://www.youtube.com/shorts/${video.id}`, youtubePrivacy: video.status?.privacyStatus || privacy, youtubeLocked: locked });
      item = store.savePost(item);
      store.event(id, 'Short uploaded', locked ? `${item.title} · terkunci privat oleh YouTube sampai audit API project disetujui` : item.title, 'published');
      return item;
    } catch (error) {
      item = store.post(id);
      item.status = uploadSent || item.job?.publishRequested ? 'uncertain' : error.code === 'PAUSED' ? 'scheduled' : 'failed';
      item.error = error.message; item.errorCode = error.code || 'UPLOAD_FAILED'; item = store.savePost(item);
      store.event(id, item.status === 'uncertain' ? 'Upload result needs checking' : 'YouTube upload on hold', error.message, 'failed');
      return item;
    }
  }

  // After an interrupted upload, look for the video among the channel's latest uploads instead of uploading again.
  async function reconcile(id) {
    let item = store.post(id);
    if (!item) throw fail('Konten tidak ditemukan.', 'NOT_FOUND', 404);
    if (item.status === 'published') return item;
    if (!item.job?.publishRequested) throw fail('Belum ada unggahan yang perlu diperiksa.', 'NO_UPLOAD');
    const token = await accessToken();
    const channels = await request('https://www.googleapis.com/youtube/v3/channels?part=contentDetails&mine=true', { headers: { Authorization: `Bearer ${token}` } });
    const uploads = channels.items?.[0]?.contentDetails?.relatedPlaylists?.uploads;
    if (!uploads) throw fail('Daftar unggahan channel tidak dapat dibaca.', 'NO_UPLOADS');
    const list = await request(`https://www.googleapis.com/youtube/v3/playlistItems?part=snippet&maxResults=25&playlistId=${encodeURIComponent(uploads)}`, { headers: { Authorization: `Bearer ${token}` } });
    const since = Date.parse(item.job.publishRequested) - 10 * 60000, title = item.job.youtubeTitle || youtubeTitle(item.title);
    const match = (list.items || []).find(x => x.snippet?.title === title && Date.parse(x.snippet?.publishedAt) >= since);
    if (match?.snippet?.resourceId?.videoId) {
      const videoId = String(match.snippet.resourceId.videoId);
      Object.assign(item, { mediaId: videoId, status: 'published', publishedAt: item.publishedAt || match.snippet.publishedAt, error: '', permalink: `https://www.youtube.com/shorts/${videoId}` });
      item = store.savePost(item);
      store.event(id, 'Upload confirmed', 'Video ditemukan di channel. Unggah ulang diblokir.', 'published');
    } else {
      item.status = 'uncertain'; item.error = 'Video belum ditemukan di 25 unggahan terbaru channel. Periksa YouTube Studio sebelum mencoba ulang.'; item = store.savePost(item);
    }
    return item;
  }

  return { status, config, saveConfig, start, callback, check, disconnect, run, reconcile, accessToken };
}
