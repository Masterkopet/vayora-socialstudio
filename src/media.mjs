import path from 'node:path';
import { mkdir, readFile, copyFile, unlink, stat } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import sharp from 'sharp';
import { hash } from './store.mjs';
const exec = promisify(execFile);
export const mediaDirectory = store => path.join(store.directory, 'media');
export function mediaPath(store, media, poster = false) { return path.join(mediaDirectory(store), poster && media.poster ? media.poster : media.path); }
export function publicMedia(media) { return { id: media.id, name: media.name, mime: media.mime, width: media.width, height: media.height, duration: media.duration, size: media.size, url: `/media/${media.id}`, posterUrl: media.mime.startsWith('video/') ? `/media/${media.id}?variant=poster` : `/media/${media.id}` }; }
export async function addMedia(store, source, name, mime, role = 'content') {
  const directory = mediaDirectory(store); await mkdir(directory, { recursive: true });
  const raw = await readFile(source); const id = hash(Buffer.concat([Buffer.from(role + ':'), raw])); const existing = store.get('SELECT * FROM media WHERE id=?', id); if (existing) return publicMedia(existing);
  let file, width, height, duration = null, poster = null;
  if (mime.startsWith('image/')) {
    const image = sharp(source, { limitInputPixels: 40000000 }).rotate(); const meta = await image.metadata();
    if (!['jpeg','png','webp'].includes(meta.format)) throw Object.assign(new Error('Image must be JPG, PNG, or WebP.'), { status: 400 });
    const rotated = meta.orientation >= 5 && meta.orientation <= 8; const w = rotated ? meta.height : meta.width, h = rotated ? meta.width : meta.height;
    if (role !== 'cover' && (w / h < .8 - .001 || w / h > 1.91 + .001)) throw Object.assign(new Error('Post images must have an aspect ratio between 4:5 and 1.91:1. Adjust the image before importing.'), { status: 400 });
    file = `${id}.jpg`; const info = await image.resize({ width: Math.min(1440, Math.max(320,w)), withoutEnlargement: false }).flatten({ background: '#FFF9E1' }).toColourspace('srgb').jpeg({ quality: 94 }).toFile(path.join(directory, file));
    width = info.width; height = info.height; mime = 'image/jpeg';
  } else if (mime === 'video/mp4' || mime === 'video/quicktime') {
    let info; try { const result = await exec(process.env.FFPROBE_PATH || 'ffprobe', ['-v','error','-show_streams','-show_format','-of','json',source], { maxBuffer: 1024 * 1024 }); info = JSON.parse(result.stdout); } catch { throw Object.assign(new Error('The video could not be read. Make sure the MP4 is valid and ffprobe is available on the server.'), { status: 400 }); }
    const video = info.streams.find(x => x.codec_type === 'video'); duration = Number(info.format.duration); width = video?.width; height = video?.height;
    if (!video || !['h264','hevc'].includes(video.codec_name) || duration < 3 || duration > 900 || width > 1920) throw Object.assign(new Error('Use an MP4 video (H.264/HEVC) of 3–900 seconds, at most 1920 px wide.'), { status: 400 });
    const [a,b] = String(video.avg_frame_rate).split('/').map(Number); const fps = a / (b || 1); if (fps < 23 || fps > 60) throw Object.assign(new Error('The video needs a frame rate of 23–60 fps for Reels.'), { status: 400 });
    file = `${id}.mp4`; mime = 'video/mp4';
    await exec(process.env.FFMPEG_PATH || 'ffmpeg', ['-y','-v','error','-i',source,'-map','0:v:0','-map','0:a?','-c:v','copy','-c:a','aac','-b:a','128k','-ar','48000','-movflags','+faststart',path.join(directory,file)], { maxBuffer: 1024 * 1024, timeout: 120000 });
    poster = `${id}-poster.jpg`; await exec(process.env.FFMPEG_PATH || 'ffmpeg',['-y','-v','error','-ss',String(Math.min(3,duration / 3)),'-i',source,'-frames:v','1','-vf','scale=400:-2','-q:v','3',path.join(directory,poster)], { timeout: 30000 });
  } else throw Object.assign(new Error('Unsupported media type. Use JPG, PNG, WebP, or MP4.'), { status: 400 });
  const size = (await stat(path.join(directory,file))).size;
  if (mime === 'image/jpeg' && size > 8 * 1024 * 1024) { await unlink(path.join(directory,file)); throw Object.assign(new Error('The converted image exceeds 8 MB.'), { status: 400 }); }
  store.run('INSERT INTO media(id,path,mime,name,size,width,height,duration,poster,created_at) VALUES(?,?,?,?,?,?,?,?,?,?)',id,file,mime,name,size,width,height,duration,poster,new Date().toISOString());
  return publicMedia(store.get('SELECT * FROM media WHERE id=?',id));
}
