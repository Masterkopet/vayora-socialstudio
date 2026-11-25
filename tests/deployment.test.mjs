import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { openStore } from '../src/store.mjs';
import { createApp } from '../src/server.mjs';
import { migrationSnapshot } from '../scripts/migrate-data.mjs';

test('production owner guard fails closed until the existing internal account is imported',async()=>{
 const directory=await mkdtemp(path.join(os.tmpdir(),'vayora-deploy-'));
 try{
  assert.throws(()=>createApp({dataDir:directory,requireExistingOwner:true,scheduler:false}),/has not been migrated/);
  const store=openStore(directory);store.run('INSERT INTO users(id,email,name,password_hash,role,created_at) VALUES(?,?,?,?,?,?)','owner','owner@example.test','Owner','fixture-hash','owner',new Date().toISOString());store.close();
  const app=createApp({dataDir:directory,requireExistingOwner:true,scheduler:false});assert.equal(app.store.get('SELECT count(*) n FROM users').n,1);app.close();
 }finally{const target=path.resolve(directory);assert.ok(target.startsWith(path.resolve(os.tmpdir())+path.sep)&&path.basename(target).startsWith('vayora-deploy-'));await rm(target,{recursive:true,force:true});}
});

test('migration snapshot keeps accounts, media and encrypted settings without changing live records or copying active sessions',async()=>{
 const directory=await mkdtemp(path.join(os.tmpdir(),'vayora-deploy-')),source=path.join(directory,'source'),destination=path.join(directory,'private-copy');const store=openStore(source);
 try{
  const at=new Date().toISOString();store.run('INSERT INTO users(id,email,name,password_hash,role,created_at) VALUES(?,?,?,?,?,?)','owner','owner@example.test','Owner','existing-password-hash','owner',at);
  store.run('INSERT INTO sessions(hash,user_id,csrf,expires) VALUES(?,?,?,?)','session-fixture','owner','csrf-fixture',Date.now()+100000);
  store.setSecret('deployment.fixture',{value:'private-setting-fixture'});store.set('paused',true);store.set('publishingEnabled',false);
  await mkdir(path.join(source,'media'));await writeFile(path.join(source,'media','image.jpg'),'image-fixture');store.run('INSERT INTO media(id,path,mime,name,size,width,height,created_at) VALUES(?,?,?,?,?,?,?,?)','fixture','image.jpg','image/jpeg','Fixture',13,1080,1350,at);
  const post=store.insertPost({id:'I01',title:'Original',caption:'Original',format:'Gambar',mediaIds:['fixture'],status:'draft'});
  const report=await migrationSnapshot(source,destination);assert.deepEqual(report,{posts:1,users:1,media:1,files:1});
  const copy=openStore(destination);try{assert.equal(copy.get('SELECT count(*) n FROM sessions').n,0);assert.equal(copy.get('SELECT password_hash FROM users').password_hash,'existing-password-hash');assert.deepEqual(copy.post('I01'),post);assert.equal(copy.secret('deployment.fixture').value,'private-setting-fixture');assert.equal(copy.setting('paused'),true);assert.equal(copy.setting('publishingEnabled'),false);}finally{copy.close();}
  assert.equal(store.get('SELECT count(*) n FROM sessions').n,1);assert.deepEqual(store.post('I01'),post);assert.equal(await readFile(path.join(destination,'media','image.jpg'),'utf8'),'image-fixture');
  await assert.rejects(migrationSnapshot(source,destination),/EEXIST/);await assert.rejects(migrationSnapshot(source,path.join(source,'nested')),/must be separate/);
  store.set('publishingEnabled',true);await assert.rejects(migrationSnapshot(source,path.join(directory,'must-not-export')),/Pause the queue/);
 }finally{store.close();const target=path.resolve(directory);assert.ok(target.startsWith(path.resolve(os.tmpdir())+path.sep)&&path.basename(target).startsWith('vayora-deploy-'));await rm(target,{recursive:true,force:true});}
});
