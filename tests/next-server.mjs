import next from 'next';
import http from 'node:http';
import path from 'node:path';

export async function nextTestServer(runtime,port){
 globalThis[Symbol.for('vayora.social-studio.runtime')]=runtime;
 const app=next({dev:false,dir:path.resolve(import.meta.dirname,'..'),hostname:'127.0.0.1',port,conf:{output:undefined}});
 await app.prepare();
 const handler=app.getRequestHandler(),server=http.createServer((req,res)=>handler(req,res));
 server.once('close',()=>{void app.close();delete globalThis[Symbol.for('vayora.social-studio.runtime')];});
 server.listen(port,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));
 return server;
}
