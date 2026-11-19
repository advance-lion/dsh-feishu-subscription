import {readFile,writeFile,mkdir,rename} from 'node:fs/promises';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {credentialPath} from './credentials.js';

export const QUIET_NOTICE_VERSION=1;
export class QuietPreference{
 constructor(file=path.join(path.dirname(credentialPath()),'quiet-preference.json')){this.file=file;}
 async status(){
  try{const value=JSON.parse(await readFile(this.file,'utf8'));
   if(value.version===QUIET_NOTICE_VERSION&&typeof value.enabled==='boolean'&&typeof value.acknowledgedAt==='string')return {version:QUIET_NOTICE_VERSION,requiresNotice:false,enabled:value.enabled};
  }catch(error){if(error.code&&error.code!=='ENOENT')throw error;}
  return {version:QUIET_NOTICE_VERSION,requiresNotice:true,enabled:false};
 }
 async acknowledge({version,enabled}){
  if(version!==QUIET_NOTICE_VERSION||typeof enabled!=='boolean')throw Error('Invalid quiet notice response');
  await mkdir(path.dirname(this.file),{recursive:true});const temporary=this.file+'.'+randomUUID()+'.tmp';
  await writeFile(temporary,JSON.stringify({version,enabled,acknowledgedAt:new Date().toISOString()}),{mode:0o600});await rename(temporary,this.file);
  return this.status();
 }
}
