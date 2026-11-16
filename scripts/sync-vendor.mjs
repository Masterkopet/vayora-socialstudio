import { createRequire } from 'node:module';
import { mkdir, copyFile } from 'node:fs/promises';
import path from 'node:path';
const require=createRequire(import.meta.url),root=path.resolve(import.meta.dirname,'..'),source=path.resolve(path.dirname(require.resolve('lucide')),'../umd/lucide.min.js');
await mkdir(path.join(root,'public/vendor'),{recursive:true});
await copyFile(source,path.join(root,'public/vendor/lucide.min.js'));
