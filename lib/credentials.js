import { spawn } from 'node:child_process';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';
import {dataDirectory} from './paths.js';
import {portableKey,encryptPortable,decryptPortable} from './portable-protection.js';

const entropy = 'dsh-feishu-subscription:v1';
export const credentialPath = () => path.join(dataDirectory(), process.platform==='win32'?'credentials.dpapi':'credentials.enc');

async function protect(bytes){return process.platform==='win32'?dpapi(bytes,'Protect'):encryptPortable(bytes,await portableKey(true));}
async function unprotect(bytes){return process.platform==='win32'?dpapi(bytes,'Unprotect'):decryptPortable(bytes,await portableKey(false));}

async function dpapi(bytes, operation) {
  if (process.platform !== 'win32') throw new Error('This prototype currently requires Windows DPAPI.');
  const script = `[void][Reflection.Assembly]::LoadWithPartialName('System.Security'); $bytes=[Convert]::FromBase64String([Console]::In.ReadToEnd()); $entropy=[Text.Encoding]::UTF8.GetBytes('${entropy}'); $result=[Security.Cryptography.ProtectedData]::${operation}($bytes,$entropy,[Security.Cryptography.DataProtectionScope]::CurrentUser); [Console]::Out.Write([Convert]::ToBase64String($result));`;
  return new Promise((resolve, reject) => {
    const child = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script], { windowsHide: true, stdio: ['pipe','pipe','pipe'] });
    const chunks=[];
    const timer=setTimeout(()=>{child.kill();reject(new Error('Windows credential protection timed out.'));},15000);
    child.stdout.on('data',chunk=>chunks.push(chunk));
    child.stderr.resume();
    child.on('error',()=>{clearTimeout(timer);reject(new Error('Could not start Windows credential protection.'));});
    child.on('close',code=>{clearTimeout(timer);if(code!==0)return reject(new Error('Windows credential protection failed.'));resolve(Buffer.from(Buffer.concat(chunks).toString().trim(),'base64'));});
    child.stdin.end(Buffer.from(bytes).toString('base64'));
  });
}
export async function saveCredentials(value, file=credentialPath()) {
  if(!(typeof value.accessToken==='string'&&value.accessToken)&&!value.doubaoCookies?.some(c=>c.name==='sessionid'&&c.value)) throw new Error('Missing login credential.');
  if(!Number.isFinite(value.expiresAt))throw new Error('Invalid credential expiry.');
  const encrypted=await protect(Buffer.from(JSON.stringify(value)));
  await mkdir(path.dirname(file),{recursive:true,mode:0o700});
  const temporary=file+'.'+process.pid+'.tmp';
  await writeFile(temporary,encrypted,{mode:0o600});
  await rename(temporary,file);
}
export async function loadCredentials(file=credentialPath()) {
  let encrypted;try{encrypted=await readFile(file);}catch(error){if(error.code==='ENOENT')error.code='AUTH_REQUIRED';throw error;}
  const value=JSON.parse((await unprotect(encrypted)).toString('utf8'));
  if(!(typeof value.accessToken==='string'&&value.accessToken)&&!value.doubaoCookies?.some(c=>c.name==='sessionid'&&c.value)) throw new Error('Invalid saved credentials.');
  if(!Number.isFinite(value.expiresAt))throw new Error('Invalid saved credential expiry.');
  if(value.expiresAt<=Date.now()+60000)throw Object.assign(new Error('Feishu login has expired. Sign in again.'),{code:'AUTH_SESSION_INVALID'});
  return value;
}

export async function saveProtectedJson(value,file){
  const encrypted=await protect(Buffer.from(JSON.stringify(value)));
  await mkdir(path.dirname(file),{recursive:true,mode:0o700});
  const temporary=file+'.'+process.pid+'.tmp';await writeFile(temporary,encrypted,{mode:0o600});await rename(temporary,file);
}
export async function loadProtectedJson(file){return JSON.parse((await unprotect(await readFile(file))).toString('utf8'));}
