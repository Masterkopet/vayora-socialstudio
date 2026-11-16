import { cp, mkdir } from 'node:fs/promises';
import path from 'node:path';
const root=path.resolve(import.meta.dirname,'..'),output=path.join(root,'.next/standalone');
await mkdir(path.join(output,'.next'),{recursive:true});
await cp(path.join(root,'public'),path.join(output,'public'),{recursive:true});
await cp(path.join(root,'.next/static'),path.join(output,'.next/static'),{recursive:true});
// Sharp loads its platform DLL/shared libraries at runtime; retain the complete
// native package, including Windows DLLs that file tracing can otherwise omit.
await cp(path.join(root,'node_modules/@img'),path.join(output,'node_modules/@img'),{recursive:true});
console.log('Next.js standalone assets ready. Private workspace data is external.');
