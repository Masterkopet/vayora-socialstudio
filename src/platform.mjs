// Where a post goes. Older posts carry no `platform`: a Short is YouTube, everything else Instagram.
// Formats describe the media: Reel = one video, Gambar = one photo, Carousel = 2–20 photos, Short = one YouTube video.
export const PLATFORMS = ['instagram', 'youtube', 'facebook', 'tiktok'];
export const FORMATS = { instagram: ['Reel', 'Gambar', 'Carousel'], youtube: ['Short'], facebook: ['Reel', 'Gambar', 'Carousel'], tiktok: ['Reel', 'Gambar', 'Carousel'] };
export const platformOf = item => PLATFORMS.includes(item?.platform) ? item.platform : item?.format === 'Short' ? 'youtube' : 'instagram';
// Content codes: I/C/V for Instagram, S for YouTube, F for Facebook, T for TikTok.
export const prefixOf = item => ({ facebook: 'F', tiktok: 'T', youtube: 'S' }[platformOf(item)] || { Gambar: 'I', Carousel: 'C', Reel: 'V' }[item.format] || 'I');
export const PLATFORM_NAMES = { instagram: 'Instagram', youtube: 'YouTube', facebook: 'Facebook', tiktok: 'TikTok' };
