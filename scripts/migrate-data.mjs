import { DatabaseSync, backup } from 'node:sqlite';
import { mkdir, readFile, copyFile, chmod } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Creates a private, consistent snapshot; never alters the source workspace.
export async function migrationSnapshot(sourceDirectory,destinationDirectory,{preserveSessions=false}={}){
 const source=path.resolve(sourceDirectory),destination=path.resolve(destinationDirectory);
 if(source===destination||destination.startsWith(source+path.sep))throw Error('The destination folder must be separate from the original data folder.');
 const sourceDB=new DatabaseSync(path.join(source,'studio.sqlite'),{readOnly:true});
 try{
  const setting=(key,fallback)=>{const row=sourceDB.prepare('SELECT value FROM settings WHERE key=?').get(key);return row?JSON.parse(row.value):fallback;};
  if(!sourceDB.prepare("SELECT id FROM users WHERE role='owner'").get())throw Error('The owner account is not available yet.');
  if(setting('publishingEnabled',false)||!setting('paused',true)||sourceDB.prepare("SELECT id FROM posts WHERE status='processing'").get())throw Error('Pause the queue and disable publishing before migrating data.');
  const key=await readFile(path.join(source,'.encryption-key'));if(key.length!==32)throw Error('The source encryption key is invalid.');
  await mkdir(path.dirname(destination),{recursive:true});
  await mkdir(destination,{mode:0o700}); // Must be a new path; do not overwrite an earlier export.
  const targetPath=path.join(destination,'studio.sqlite');
  await backup(sourceDB,targetPath);
  const target=new DatabaseSync(targetPath);
  try{
   const media=target.prepare('SELECT path,poster FROM media').all(),files=new Set(media.flatMap(m=>[m.path,m.poster]).filter(Boolean));
   const mediaDirectory=path.join(destination,'media');await mkdir(mediaDirectory,{mode:0o700});
   for(const file of files){if(path.basename(file)!==file||file==='.'||file==='..')throw Error('Invalid media path.');const output=path.join(mediaDirectory,file);await copyFile(path.join(source,'media',file),output);await chmod(output,0o600);}
   await copyFile(path.join(source,'.encryption-key'),path.join(destination,'.encryption-key'));await chmod(path.join(destination,'.encryption-key'),0o600);
   target.exec('BEGIN IMMEDIATE');
   try{
    if(!preserveSessions)target.exec('DELETE FROM sessions; DELETE FROM oauth_states; DELETE FROM invites;');
    const set=target.prepare('INSERT INTO settings(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value');set.run('paused','true');set.run('publishingEnabled','false');
    target.exec('COMMIT');
   }catch(error){target.exec('ROLLBACK');throw error;}
   target.exec('PRAGMA wal_checkpoint(TRUNCATE); PRAGMA journal_mode=DELETE;');
   const result={posts:target.prepare('SELECT count(*) n FROM posts').get().n,users:target.prepare('SELECT count(*) n FROM users').get().n,media:media.length,files:files.size};
   await chmod(targetPath,0o600);return result;
  }finally{target.close();}
 }finally{sourceDB.close();}
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const [source,destination]=process.argv.slice(2);if(!source||!destination)throw Error('Usage: node scripts/migrate-data.mjs <original-data-folder> <new-private-folder>');
 console.log(JSON.stringify(await migrationSnapshot(source,destination,{preserveSessions:process.argv.includes('--keep-sessions')})));
}
