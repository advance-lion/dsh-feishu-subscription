import test from 'node:test';
import assert from 'node:assert/strict';
import {execFile} from 'node:child_process';
import {mkdtemp,readFile,unlink,rmdir} from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';

// This test intentionally uses the production keychain entry. Run ONLY on a
// disposable GitHub runner, never against a developer's existing account vault.
const enabled=process.env.GITHUB_ACTIONS==='true'&&process.env.DSH_NATIVE_KEYRING_TEST==='1'&&process.platform!=='win32';
test('native keychain persists one initialization across processes and decrypts saved credentials', {skip:!enabled,timeout:90000},async()=>{
 assert.equal(process.env.FEISHU_SUBSCRIPTION_VAULT_KEY,undefined,'Native test must not use the environment-key bypass');
 const {AsyncEntry}=await import('@napi-rs/keyring');
 const entry=new AsyncEntry('dsh-feishu-subscription','vault-encryption-v1',{linux:{store:'secret-service'}});
 const before=await entry.getPassword(AbortSignal.timeout(10000));
 assert.ok(before===null,'Refuse to modify an existing vault key');
 const dir=await mkdtemp(path.join(os.tmpdir(),'feishu-native-vault-'));
 const file=path.join(dir,'credentials.enc');
 const protection=new URL('../lib/portable-protection.js',import.meta.url).href;
 const credentials=new URL('../lib/credentials.js',import.meta.url).href;
 const run=source=>new Promise((resolve,reject)=>{
  execFile(process.execPath,['--input-type=module','-e',source],{timeout:30000,env:process.env,windowsHide:true},(error,stdout)=>{
   // Child diagnostics are not echoed: credentials and keychain state stay private.
   if(error)return reject(new Error('Native keychain child process failed'));
   resolve(stdout.trim());
  });
 });
 try{
  const source=`import {portableKey} from ${JSON.stringify(protection)};import {createHash} from 'node:crypto';const key=await portableKey(true);if(key.length!==32)throw Error('Wrong key size');console.log(createHash('sha256').update(key).digest('hex'));`;
  // Two fresh Node processes race on an empty actual OS keychain.
  const [first,second]=await Promise.all([run(source),run(source)]);
  assert.match(first,/^[a-f0-9]{64}$/);assert.equal(second,first);
  const filename=JSON.stringify(file);
  await run(`import {saveCredentials} from ${JSON.stringify(credentials)};await saveCredentials({accessToken:'native-fixture-token',authKind:'feishu-passport-token',expiresAt:Date.now()+3600000},${filename});`);
  const encrypted=await readFile(file);
  assert.equal(encrypted.includes(Buffer.from('native-fixture-token')),false);
  assert.equal(await run(`import {loadCredentials} from ${JSON.stringify(credentials)};const saved=await loadCredentials(${filename});if(saved.accessToken!=='native-fixture-token')throw Error('Round trip failed');console.log('verified');`),'verified');
 }finally{
  // Precondition established the entry did not exist on this disposable runner.
  await entry.deleteCredential(AbortSignal.timeout(10000));
  assert.ok(await entry.getPassword(AbortSignal.timeout(10000))===null);
  await unlink(file).catch(e=>{if(e.code!=='ENOENT')throw e;});await rmdir(dir);
 }
});
