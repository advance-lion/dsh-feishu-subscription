import test from 'node:test';import assert from 'node:assert/strict';import path from 'node:path';
import {randomBytes} from 'node:crypto';
import {encryptPortable,decryptPortable,decodeVaultKey,portableKey} from '../lib/portable-protection.js';
import {dataDirectory} from '../lib/paths.js';
test('portable vault authenticates ciphertext, rejects wrong keys and never reads plaintext',()=>{
 const key=randomBytes(32),value=Buffer.from('{"accessToken":"fixture-secret","displayName":"测试"}');
 const a=encryptPortable(value,key),b=encryptPortable(value,key);
 assert.notDeepEqual(a,b);assert.equal(a.includes(Buffer.from('fixture-secret')),false);assert.deepEqual(decryptPortable(a,key),value);
 assert.throws(()=>decryptPortable(a,randomBytes(32)));
 const changed=Buffer.from(a);changed[changed.length-1]^=1;assert.throws(()=>decryptPortable(changed,key));
 assert.throws(()=>decryptPortable(value,key),/格式/);assert.throws(()=>decryptPortable(a.subarray(0,20),key));
 assert.deepEqual(decodeVaultKey(key.toString('base64')),key);assert.throws(()=>decodeVaultKey('short'));assert.throws(()=>decodeVaultKey(randomBytes(16).toString('base64')));
});
test('platform data paths preserve Windows and respect macOS and Linux conventions',()=>{
 assert.equal(dataDirectory({platform:'win32',env:{LOCALAPPDATA:'local'},home:'home'}),path.join('local','dsh-feishu-subscription'));
 assert.equal(dataDirectory({platform:'darwin',env:{},home:'home'}),path.join('home','Library','Application Support','dsh-feishu-subscription'));
 assert.equal(dataDirectory({platform:'linux',env:{},home:'home'}),path.join('home','.local','share','dsh-feishu-subscription'));
 assert.equal(dataDirectory({platform:'linux',env:{XDG_DATA_HOME:'xdg'},home:'home'}),path.join('xdg','dsh-feishu-subscription'));
});
test('headless server key is explicit, validated, and unchanged between reads',async()=>{
 const previous=process.env.FEISHU_SUBSCRIPTION_VAULT_KEY,key=randomBytes(32);
 try{
  process.env.FEISHU_SUBSCRIPTION_VAULT_KEY=key.toString('base64');
  assert.deepEqual(await portableKey(false),key);assert.deepEqual(await portableKey(true),key);
  process.env.FEISHU_SUBSCRIPTION_VAULT_KEY='invalid';await assert.rejects(()=>portableKey(true),/凭据加密不可用/);
 }finally{if(previous===undefined)delete process.env.FEISHU_SUBSCRIPTION_VAULT_KEY;else process.env.FEISHU_SUBSCRIPTION_VAULT_KEY=previous;}
});
