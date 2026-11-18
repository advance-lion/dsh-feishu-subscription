import {createCipheriv,createDecipheriv,randomBytes} from 'node:crypto';
import {mkdir,rmdir} from 'node:fs/promises';
import path from 'node:path';
import {dataDirectory} from './paths.js';
const prefix=Buffer.from('FSUB-AES1\n');
const unavailable=()=>new Error('凭据加密不可用：请解锁系统钥匙串，或为无桌面服务器配置 FEISHU_SUBSCRIPTION_VAULT_KEY（32 字节 Base64 密钥）。');
let keyFlight;
async function withKeyCreationLock(work){
 const root=dataDirectory(),lock=path.join(root,'vault-key-create.lock');
 await mkdir(root,{recursive:true,mode:0o700});
 const deadline=Date.now()+10000;
 for(;;){try{await mkdir(lock,{mode:0o700});break;}catch(e){if(e.code!=='EEXIST'||Date.now()>=deadline)throw unavailable();await new Promise(resolve=>setTimeout(resolve,100));}}
 try{return await work();}finally{await rmdir(lock);}
}
export function decodeVaultKey(value){
 if(typeof value!=='string'||! /^[A-Za-z0-9+/]{43}=$/.test(value))throw unavailable();
 const key=Buffer.from(value,'base64');if(key.length!==32||key.toString('base64')!==value)throw unavailable();return key;
}
export async function portableKey(create=false){
 if(process.env.FEISHU_SUBSCRIPTION_VAULT_KEY!==undefined)return decodeVaultKey(process.env.FEISHU_SUBSCRIPTION_VAULT_KEY);
 if(keyFlight)return keyFlight;
 keyFlight=(async()=>{try{
  const {AsyncEntry}=await import('@napi-rs/keyring');
  // Kernel-only keyutils do not survive reboots; require persistent Secret Service.
  const entry=new AsyncEntry('dsh-feishu-subscription','vault-encryption-v1',{linux:{store:'secret-service'}});
  let saved=await entry.getPassword(AbortSignal.timeout(10000));
  if(saved===null||saved===undefined){
   if(!create)throw unavailable();
   saved=await withKeyCreationLock(async()=>{
    const existing=await entry.getPassword(AbortSignal.timeout(10000));if(existing!==null&&existing!==undefined)return existing;
    const generated=randomBytes(32).toString('base64');await entry.setPassword(generated,AbortSignal.timeout(10000));return generated;
   });
  }
  return decodeVaultKey(saved);
 }catch{throw unavailable();}})();
 try{return await keyFlight;}finally{keyFlight=undefined;}
}
export function encryptPortable(bytes,key){
 const iv=randomBytes(12),cipher=createCipheriv('aes-256-gcm',key,iv);cipher.setAAD(prefix);
 const encrypted=Buffer.concat([cipher.update(bytes),cipher.final()]);
 return Buffer.concat([prefix,iv,cipher.getAuthTag(),encrypted]);
}
export function decryptPortable(bytes,key){
 if(bytes.length<prefix.length+28||!bytes.subarray(0,prefix.length).equals(prefix))throw new Error('凭据格式无效，未尝试明文读取。');
 const offset=prefix.length,decipher=createDecipheriv('aes-256-gcm',key,bytes.subarray(offset,offset+12));
 decipher.setAAD(prefix);decipher.setAuthTag(bytes.subarray(offset+12,offset+28));
 return Buffer.concat([decipher.update(bytes.subarray(offset+28)),decipher.final()]);
}
