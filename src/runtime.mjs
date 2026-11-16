import { createApp } from './server.mjs';

const key=Symbol.for('vayora.social-studio.runtime');
export function getRuntime(){
 if(!globalThis[key]){const runtime=createApp();globalThis[key]=runtime;process.once('exit',()=>{try{runtime.close();}catch{}});}
 return globalThis[key];
}
export function handleStudioRequest(request){return getRuntime().app.fetch(request);}
