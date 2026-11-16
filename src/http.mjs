import http from 'node:http';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { createReadStream, createWriteStream } from 'node:fs';
import { stat, unlink } from 'node:fs/promises';
import path from 'node:path';
import { randomBytes } from 'node:crypto';
import Busboy from 'busboy';

const fault=(message,status=400)=>Object.assign(new Error(message),{status});
const mediaTypes={html:'text/html; charset=utf-8',csv:'text/csv; charset=utf-8',json:'application/json; charset=utf-8'};
function routePattern(value){const names=[];const pattern=value.split('/').map(part=>{if(part.startsWith(':')){names.push(part.slice(1));return'([^/]+)';}return part.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');}).join('/');return{regex:new RegExp('^'+pattern+'/?$'),names};}
class StudioResponse{
 constructor(request){this.request=request;this.headers=new Headers();this.statusCode=200;this.done=false;this.body=null;this.pending=null;}
 status(code){this.statusCode=code;return this;}
 set(name,value){if(typeof name==='object'){for(const [key,item]of Object.entries(name))this.headers.set(key,String(item));}else this.headers.set(name,String(value));return this;}
 type(value){return this.set('Content-Type',mediaTypes[value]||value);}
 json(body){this.type('json');this.body=JSON.stringify(body);this.done=true;return this;}
 send(body){if(!this.headers.has('Content-Type'))this.type('text/plain; charset=utf-8');this.body=body;this.done=true;return this;}
 sendStatus(code){this.status(code);return this.send(code===204?null:String(code));}
 redirect(status,url){if(typeof status==='string'){url=status;status=302;}this.status(status);this.set('Location',url);return this.send(null);}
 cookie(name,value,options={}){let text=`${name}=${encodeURIComponent(value)}`;if(options.maxAge!=null)text+=`; Max-Age=${Math.floor(options.maxAge/1000)}; Expires=${new Date(Date.now()+options.maxAge).toUTCString()}`;text+=`; Path=${options.path||'/'}`;if(options.httpOnly)text+='; HttpOnly';if(options.secure)text+='; Secure';if(options.sameSite)text+='; SameSite='+options.sameSite[0].toUpperCase()+options.sameSite.slice(1);this.headers.append('Set-Cookie',text);return this;}
 clearCookie(name,options={}){return this.cookie(name,'',{...options,maxAge:0});}
 sendFile(file){this.done=true;this.pending=(async()=>{const info=await stat(file);if(!info.isFile())throw fault('Media tidak ditemukan.',404);let start=0,end=info.size-1;const range=this.request.headers.get('range');
  this.set({'Accept-Ranges':'bytes','Last-Modified':info.mtime.toUTCString()});
  if(range){const match=/^bytes=(\d*)-(\d*)$/.exec(range);if(!match||(!match[1]&&!match[2])){this.status(416).set('Content-Range','bytes */'+info.size);return null;}if(!match[1])start=Math.max(0,info.size-Number(match[2]));else start=Number(match[1]);if(match[2]&&match[1])end=Math.min(end,Number(match[2]));if(start>end||start>=info.size||!Number.isSafeInteger(start)||!Number.isSafeInteger(end)){this.status(416).set('Content-Range','bytes */'+info.size);return null;}this.status(206).set('Content-Range',`bytes ${start}-${end}/${info.size}`);}
  this.set('Content-Length',String(end-start+1));return this.request.method==='HEAD'?null:Readable.toWeb(createReadStream(file,{start,end}));})();return this;}
 async response(){if(this.pending)this.body=await this.pending;return new Response(this.request.method==='HEAD'||[204,304].includes(this.statusCode)?null:this.body,{status:this.statusCode,headers:this.headers});}
}

// A transport-independent service registry: production requests arrive through
// native Next.js Route Handlers. The Node listener is only for isolated tests.
export function createServiceRouter(){
 const layers=[],errors=[];
 const app={
  use(prefix,...handlers){if(typeof prefix==='function'){handlers.unshift(prefix);prefix='/';}for(const handler of handlers){if(handler.length===4)errors.push(handler);else layers.push({prefix,handlers:[handler]});}return app;},
  async fetch(request){const url=new URL(request.url),res=new StudioResponse(request);const req={request,method:request.method,path:url.pathname,originalUrl:url.pathname+url.search,url:url.pathname+url.search,query:Object.fromEntries(url.searchParams),headers:Object.fromEntries(request.headers),params:{},body:undefined,socket:{remoteAddress:'studio-server'},ip:'studio-server',get:name=>request.headers.get(name)||undefined};
   const dispatch=async index=>{for(let i=index;i<layers.length;i++){const layer=layers[i];let params={};if(layer.prefix){if(layer.prefix!=='/'&&req.path!==layer.prefix&&!req.path.startsWith(layer.prefix+'/'))continue;}else{if(layer.method!==req.method&&!(req.method==='HEAD'&&layer.method==='GET'))continue;const match=layer.regex.exec(req.path);if(!match)continue;params=Object.fromEntries(layer.names.map((name,j)=>{try{return[name,decodeURIComponent(match[j+1])];}catch{throw fault('Alamat permintaan tidak valid.');}}));}req.params=params;const run=async at=>{if(res.done)return;if(at>=layer.handlers.length)return dispatch(i+1);let continuation;const next=error=>{continuation=error?Promise.reject(error):run(at+1);return continuation;};await layer.handlers[at](req,res,next);if(continuation)await continuation;};await run(0);return;}};
   try{await dispatch(0);if(!res.done)res.status(404).json({error:'Fitur tidak ditemukan.'});return await res.response();}catch(error){res.pending=null;res.done=false;res.body=null;res.headers.delete('Content-Length');res.headers.delete('Content-Range');for(const handler of errors){await handler(error,req,res,()=>{});if(res.done)return res.response();}return new Response(JSON.stringify({error:'Terjadi kendala server.'}),{status:error.status||500,headers:{'Content-Type':'application/json'}});}
  },
  listen(port,host,callback){const server=http.createServer(async(nodeReq,nodeRes)=>{try{const method=nodeReq.method,url='http://'+(nodeReq.headers.host||'localhost')+nodeReq.url,request=new Request(url,{method,headers:nodeReq.headers,...(!['GET','HEAD'].includes(method)?{body:Readable.toWeb(nodeReq),duplex:'half'}:{})});const response=await app.fetch(request);nodeRes.statusCode=response.status;for(const [key,value]of response.headers)if(key!=='set-cookie')nodeRes.setHeader(key,value);const cookies=response.headers.getSetCookie();if(cookies.length)nodeRes.setHeader('Set-Cookie',cookies);if(response.body)await pipeline(Readable.fromWeb(response.body),nodeRes);else nodeRes.end();}catch{if(!nodeRes.headersSent)nodeRes.writeHead(500);nodeRes.end();}});return server.listen(port,host,callback);},
 };
 for(const method of ['get','post','put','patch','delete','options'])app[method]=(route,...handlers)=>{layers.push({method:method.toUpperCase(),...routePattern(route),handlers});return app;};
 return app;
}

export function jsonBody(limit=2*1024*1024){return async(req,_res,next)=>{if(!req.get('content-type')?.split(';')[0].trim().endsWith('/json'))return next();if(!req.request.body){req.body={};return next();}const reader=req.request.body.getReader(),chunks=[];let length=0;try{while(true){const result=await reader.read();if(result.done)break;length+=result.value.byteLength;if(length>limit){await reader.cancel();throw fault('Ukuran permintaan terlalu besar.',413);}chunks.push(Buffer.from(result.value));}try{req.body=JSON.parse(Buffer.concat(chunks).toString('utf8')||'{}');}catch{throw fault('JSON tidak valid.');}}finally{reader.releaseLock();}return next();};}

export function uploadFiles(directory){return async(req,_res,next)=>{
 if(!req.request.body)throw fault('Pilih file media.');let parser;try{parser=Busboy({headers:req.headers,limits:{fileSize:100*1024*1024,files:100,fields:3}});}catch{throw fault('Format unggahan tidak valid.');}
 const files=[],jobs=[];let failure;
 parser.on('file',(field,file,info)=>{if(field!=='files'||!['image/jpeg','image/png','image/webp','video/mp4','video/quicktime'].includes(info.mimeType)){failure=fault('Tipe media tidak didukung. Pilih JPG, PNG, WebP, atau MP4.');file.resume();return;}const target=path.join(directory,randomBytes(18).toString('hex'));const item={path:target,originalname:info.filename,mimetype:info.mimeType};files.push(item);file.on('limit',()=>{failure=fault('File maksimal 100 MB.');});jobs.push(pipeline(file,createWriteStream(target,{flags:'wx',mode:0o600})));});
 parser.on('filesLimit',()=>{failure=fault('Pilih maksimal 100 file sekaligus.');});parser.on('fieldsLimit',()=>{failure=fault('Terlalu banyak field unggahan.');});
 try{await pipeline(Readable.fromWeb(req.request.body),parser);await Promise.all(jobs);if(failure)throw failure;req.files=files;return next();}catch(error){await Promise.allSettled(jobs);await Promise.all(files.map(file=>unlink(file.path).catch(()=>{})));throw error.status?error:fault('Unggahan terputus atau tidak valid.');}
};}
