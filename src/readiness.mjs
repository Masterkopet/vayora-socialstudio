import { existsSync } from 'node:fs';
import { mediaPath } from './media.mjs';
import { shortMediaReady, youtubeTitle, YOUTUBE_TITLE_MAX } from './youtube.mjs';
import { platformOf } from './platform.mjs';
import { FACEBOOK_REEL_MIN, FACEBOOK_REEL_MAX } from './facebook.mjs';
import { TIKTOK_PHOTOS_MAX, TIKTOK_PHOTO_TITLE_MAX } from './tiktok.mjs';

export function postReadiness(store,item,instagram,youtube,{facebook=null,tiktok=null}={}) {
  const ids=Array.isArray(item.mediaIds)?item.mediaIds:[],media=ids.map(id=>store.get('SELECT * FROM media WHERE id=?',id));
  const filesReady=media.length>0&&media.every(m=>m&&existsSync(mediaPath(store,m)));
  const locked=['published','processing','uncertain'].includes(item.status)||!!item.mediaId||!!item.job?.publishRequested;
  const liveOn=store.setting('publishingEnabled',false);
  const live={id:'live',label:'Publishing enabled',ok:liveOn,required:true,action:'settings',detail:liveOn?'Live publishing is enabled.':'The owner needs to enable live publishing.'};
  const approval={id:'approval',label:'Content approval',ok:item.approved===true,required:true,action:'edit',detail:item.approved?'Media and caption are approved.':'Review and approve the content in the editor.'};
  const note=locked?'This post is processing, published, or awaiting outcome verification.':'This checks completeness. A person still needs to review offers and media usage rights.';
  if(item.format==='Short'){
    // YouTube Short: one vertical/square MP4 of at most 3 minutes, a YouTube-safe title, a description and a connected channel.
    const formatReady=filesReady&&media.length===1&&shortMediaReady(media[0]);
    const title=youtubeTitle(item.title),titleReady=!!title&&String(item.title||'').trim().length<=YOUTUBE_TITLE_MAX;
    const descriptionReady=typeof item.caption==='string'&&!!item.caption.trim()&&item.caption.length<=2200;
    const channel=youtube?youtube.status():{connected:false};
    const checks=[
      {id:'media',label:'Short video',ok:!!formatReady,required:true,action:'edit',detail:!filesReady?'Upload the media again.':!formatReady?'Use one vertical or square MP4 video, up to 3 minutes.':'The video fits the Shorts format.'},
      {id:'title',label:'YouTube title',ok:titleReady,required:true,action:'edit',detail:titleReady?'The title is ready for YouTube.':`Enter a title of up to ${YOUTUBE_TITLE_MAX} characters.`},
      {id:'caption',label:'Description',ok:descriptionReady,required:true,action:'edit',detail:descriptionReady?'Description filled in.':'Fill in the description (caption), up to 2,200 characters.'},
      approval,
      {id:'youtube',label:'YouTube connection',ok:!!channel.connected,required:true,action:'settings',detail:channel.connected?`Channel ${channel.channelTitle||''} connected.`.replace(/\s+\./,'.'):'Connect a YouTube channel in Settings.'},
      live,
    ];
    const contentReady=!!formatReady&&titleReady&&descriptionReady&&item.approved===true;
    return {postId:item.id,channel:'youtube',locked,contentReady,ready:!locked&&checks.filter(c=>c.required).every(c=>c.ok),checks,note};
  }
  const platform=platformOf(item);
  if(platform==='facebook'||platform==='tiktok'){
    const fb=platform==='facebook',photo=m=>m&&m.mime==='image/jpeg',video=media.length===1&&media[0]?.mime==='video/mp4';
    const tt=tiktok?tiktok.status():{connected:false,privacy:'',privacyOptions:[]},maxVideo=fb?FACEBOOK_REEL_MAX:(tt.maxDuration||600);
    const formatReady=filesReady&&(item.format==='Reel'?video&&media[0].duration>=(fb?FACEBOOK_REEL_MIN:3)&&media[0].duration<=maxVideo:item.format==='Carousel'?media.length>=2&&media.length<=(fb?20:TIKTOK_PHOTOS_MAX)&&media.every(photo):item.format==='Gambar'&&media.length===1&&photo(media[0]));
    const captionReady=typeof item.caption==='string'&&!!item.caption.trim()&&item.caption.length<=2200;
    const page=fb?(facebook?facebook.status():{connected:false}):null,ig=instagram.status(),pulls=fb||item.format!=='Reel';
    const checks=[
      {id:'media',label:fb?'Media and format':'TikTok media',ok:!!formatReady,required:true,action:'edit',detail:!filesReady?'Upload the media again.':!formatReady?(item.format==='Reel'?`Use one MP4 video of ${fb?FACEBOOK_REEL_MIN:3}–${maxVideo} seconds.`:fb?'Use JPG photos (2–20 for several).':`Use 1–${TIKTOK_PHOTOS_MAX} JPG photos.`):'Media is available and the format is valid.'},
      {id:'caption',label:'Caption',ok:captionReady,required:true,action:'edit',detail:captionReady?'Caption is present and within the character limit.':'Enter a caption of up to 2,200 characters.'},
      ...(!fb&&item.format!=='Reel'?[{id:'title',label:'TikTok photo title',ok:String(item.title||'').trim().length<=TIKTOK_PHOTO_TITLE_MAX,required:false,action:'edit',detail:`TikTok shows up to ${TIKTOK_PHOTO_TITLE_MAX} characters of a photo post title; a longer title is shortened.`}]:[]),
      approval,
      fb?{id:'facebook',label:'Facebook Page',ok:!!page.connected,required:true,action:'settings',detail:page.connected?`Page ${page.pageName||''} connected.`.replace(/s+./,'.'):'Connect the Facebook Page in Settings → Facebook.'}
        :{id:'tiktok',label:'TikTok connection',ok:!!tt.connected,required:true,action:'settings',detail:tt.connected?`TikTok ${tt.username?'@'+tt.username:tt.displayName||''} connected.`.replace(/s+./,'.'):'Connect TikTok in Settings → TikTok.'},
      ...(!fb?[{id:'privacy',label:'TikTok visibility',ok:!!tt.privacy&&(!tt.connected||!tt.privacyOptions.length||tt.privacyOptions.includes(tt.privacy)),required:true,action:'settings',detail:tt.privacy?'Visibility chosen.':'Choose who can see TikTok posts in Settings → TikTok.'}]:[]),
      ...(pulls?[{id:'https',label:'Public HTTPS',ok:ig.publicUrlReady,required:true,action:'settings',detail:ig.publicUrlReady?'The public media address is ready.':`Set up public HTTPS so ${fb?'Facebook':'TikTok'} can retrieve the media.`}]:[]),
      live,
    ];
    const contentReady=!!formatReady&&captionReady&&item.approved===true;
    return {postId:item.id,channel:platform,locked,contentReady,ready:!locked&&checks.filter(c=>c.required).every(c=>c.ok),checks,note};
  }
  const formatReady=filesReady&&(item.format==='Reel'?media.length===1&&media[0].mime==='video/mp4'&&media[0].duration>=3&&media[0].duration<=900:item.format==='Carousel'?media.length>=2&&media.length<=20&&media.every(m=>m.mime==='image/jpeg'&&m.width/m.height>=.799&&m.width/m.height<=1.911):item.format==='Gambar'&&media.length===1&&media[0].mime==='image/jpeg'&&media[0].width/media[0].height>=.799&&media[0].width/media[0].height<=1.911);
  const captionReady=typeof item.caption==='string'&&!!item.caption.trim()&&item.caption.length<=2200;
  const coverReady=item.format!=='Reel'||!item.coverId||(()=>{const cover=store.get('SELECT * FROM media WHERE id=?',item.coverId);return cover?.mime==='image/jpeg'&&existsSync(mediaPath(store,cover));})();
  const ig=instagram.status();
  const checks=[
    {id:'media',label:'Media and format',ok:!!formatReady&&!!coverReady,required:true,action:'edit',detail:!filesReady?'Upload the media again.':!formatReady?'Check media count, type, aspect ratio, or duration.':!coverReady?'Reel cover not found.':'Media is available and the format is valid.'},
    {id:'caption',label:'Caption',ok:captionReady,required:true,action:'edit',detail:captionReady?'Caption is present and within the character limit.':'Enter a caption of up to 2,200 characters.'},
    {id:'alt',label:'Accessibility description',ok:item.format==='Reel'||!!String(item.alt||'').trim(),required:false,action:'edit',detail:item.format==='Reel'?'Not applicable to Reels.':String(item.alt||'').trim()?'A description has been added.':'Add an image description for screen readers.'},
    approval,
    {id:'instagram',label:'Instagram connection',ok:ig.connected,required:true,action:'settings',detail:ig.connected?'Instagram connected.':'Connect a professional account in Settings.'},
    {id:'https',label:'Public HTTPS',ok:ig.publicUrlReady,required:true,action:'settings',detail:ig.publicUrlReady?'The public media address is ready.':'Set up public HTTPS so Meta can retrieve the media.'},
    live,
  ];
  const contentReady=!!formatReady&&!!coverReady&&captionReady&&item.approved===true;
  return {postId:item.id,channel:'instagram',locked,contentReady,ready:!locked&&checks.filter(c=>c.required).every(c=>c.ok),checks,note};
}
