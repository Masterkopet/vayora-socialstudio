import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { existsSync } from 'node:fs';
const root=path.resolve(import.meta.dirname,'..');
process.env.PORT||='3210';
process.env.DATA_DIR||=path.join(root,'data');
process.env.PROJECT_ROOT||=root;
process.env.HOSTNAME=process.env.HOST||'127.0.0.1';
if(process.argv.includes('--local')){
 process.env.HOSTNAME='127.0.0.1';process.env.APP_ORIGIN='http://localhost:'+process.env.PORT;process.env.ALLOW_LOCAL_PRODUCTION='true';process.env.REQUIRE_EXISTING_OWNER='true';
}
const entry=path.join(root,'.next/standalone/server.js');
if(!existsSync(entry))throw Error('Run npm run build before opening the app.');
await import(pathToFileURL(entry).href);
