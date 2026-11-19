import test from 'node:test';import assert from 'node:assert/strict';
import {mkdtemp,rm,writeFile} from 'node:fs/promises';import os from 'node:os';import path from 'node:path';
import {QuietPreference} from '../lib/quiet-preference.js';
test('first enable needs notice, acknowledgement survives restart and decline keeps operations off',async()=>{
 const directory=await mkdtemp(path.join(os.tmpdir(),'feishu-quiet-notice-')),file=path.join(directory,'notice.json');
 try{
  const preference=new QuietPreference(file);assert.deepEqual(await preference.status(),{version:1,requiresNotice:true,enabled:false});
  await assert.rejects(()=>preference.acknowledge({version:2,enabled:true}));assert.equal((await preference.status()).requiresNotice,true);
  await preference.acknowledge({version:1,enabled:false});assert.deepEqual(await new QuietPreference(file).status(),{version:1,requiresNotice:false,enabled:false});
  await preference.acknowledge({version:1,enabled:true});assert.equal((await new QuietPreference(file).status()).enabled,true);
  await writeFile(file,'malformed');assert.equal((await preference.status()).enabled,false);assert.equal((await preference.status()).requiresNotice,true);
 }finally{await rm(directory,{recursive:true,force:true});}
});
