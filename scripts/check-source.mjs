import { readdir } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
const root=path.resolve(import.meta.dirname,'..');
async function check(directory){for(const item of await readdir(directory,{withFileTypes:true})){const file=path.join(directory,item.name);if(item.isDirectory())await check(file);else if(/\.(mjs|js)$/.test(item.name))execFileSync(process.execPath,['--check',file],{stdio:'pipe'});}}
await check(path.join(root,'src'));await check(path.join(root,'scripts'));console.log('JavaScript syntax OK. Next.js build validates JSX and App Router files.');
