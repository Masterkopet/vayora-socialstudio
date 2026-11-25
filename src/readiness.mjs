import { existsSync } from 'node:fs';
import { mediaPath } from './media.mjs';
import { shortMediaReady, youtubeTitle, YOUTUBE_TITLE_MAX } from './youtube.mjs';

export function postReadiness(store,item,instagram,youtube) {
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
      {id:'youtube',label:'YouTube connection',ok:!!channel.connected,required:true,action:'settings',detail:channel.connected?`Channel ${channel.channelTitle||''} connected.`.replace(/\s+\./,'.'):'Connect a YouTube channel in Connections & publishing.'},
      live,
    ];
    const contentReady=!!formatReady&&titleReady&&descriptionReady&&item.approved===true;
    return {postId:item.id,channel:'youtube',locked,contentReady,ready:!locked&&checks.filter(c=>c.required).every(c=>c.ok),checks,note};
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
    {id:'instagram',label:'Instagram connection',ok:ig.connected,required:true,action:'settings',detail:ig.connected?'Instagram connected.':'Connect a professional account in Connections & publishing.'},
    {id:'https',label:'Public HTTPS',ok:ig.publicUrlReady,required:true,action:'settings',detail:ig.publicUrlReady?'The public media address is ready.':'Set up public HTTPS so Meta can retrieve the media.'},
    live,
  ];
  const contentReady=!!formatReady&&!!coverReady&&captionReady&&item.approved===true;
  return {postId:item.id,channel:'instagram',locked,contentReady,ready:!locked&&checks.filter(c=>c.required).every(c=>c.ok),checks,note};
}
