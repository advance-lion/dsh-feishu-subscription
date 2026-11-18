import {createHash,randomUUID} from 'node:crypto';
import {rm} from 'node:fs/promises';
import path from 'node:path';
import {credentialPath,loadCredentials,saveCredentials,loadProtectedJson,saveProtectedJson} from './credentials.js';
import {authenticationCookies} from './client.js';

export class AccountStore{
 constructor(activeFile=credentialPath()){this.activeFile=activeFile;this.file=activeFile+'.accounts';this.queue=Promise.resolve();}
 transaction(action){const job=this.queue.then(action);this.queue=job.catch(()=>{});return job;}
 async read(){
  try{return await loadProtectedJson(this.file);}catch(e){if(e.code!=='ENOENT')throw e;}
  let credentials;try{credentials=await loadCredentials(this.activeFile);}catch{}
  const vault={version:1,activeId:null,accounts:[]};
  if(credentials){
    if(!credentials.accountId){try{
      const response=await fetch('https://accounts.doubao.com/passport/account/info/v2/?aid=497858&device_platform=web&sdk_version=2.2.11-doubao.0&account_sdk_source=web',{headers:{Cookie:authenticationCookies(credentials).map(c=>c.name+'='+c.value).join('; ')},signal:AbortSignal.timeout(8000)});
      const account=await response.json();if(account.message==='success'&&(account.data?.user_id_str||account.data?.user_id)){credentials.accountId=String(account.data.user_id_str||account.data.user_id);credentials.displayName=account.data.screen_name||account.data.name||account.data.username;}
    }catch{}}
    const id=this.id(credentials);vault.activeId=id;vault.accounts.push({id,label:credentials.displayName||'已登录的飞书账号',credentials});
  }
  await saveProtectedJson(vault,this.file);return vault;
 }
 id(credentials){return createHash('sha256').update(credentials.accountId||credentials.accessToken).digest('hex').slice(0,24);}
 list(){return this.transaction(async()=>{const v=await this.read();return {activeId:v.activeId,accounts:v.accounts.map(a=>({id:a.id,label:a.label,active:a.id===v.activeId,expiresAt:new Date(a.credentials.expiresAt).toISOString(),valid:a.credentials.expiresAt>Date.now()+60000}))};});}
 add(credentials){return this.transaction(async()=>{const v=await this.read(),id=this.id(credentials);v.accounts=v.accounts.filter(a=>a.id!==id);v.accounts.push({id,label:credentials.displayName||'飞书账号 '+(v.accounts.length+1),credentials});await saveProtectedJson(v,this.file);if(v.activeId===id)await saveCredentials(credentials,this.activeFile);return id;});}
 switch(id){return this.transaction(async()=>{const v=await this.read(),a=v.accounts.find(a=>a.id===id);if(!a)throw Error('账号不存在。');if(a.credentials.expiresAt<=Date.now()+60000)throw Error('账号登录已过期，请重新登录。');await saveCredentials(a.credentials,this.activeFile);v.activeId=id;await saveProtectedJson(v,this.file);});}
 remove(id){return this.transaction(async()=>{const v=await this.read();if(!v.accounts.some(a=>a.id===id))throw Error('账号不存在。');v.accounts=v.accounts.filter(a=>a.id!==id);if(v.activeId===id){v.activeId=null;await rm(this.activeFile,{force:true});}await saveProtectedJson(v,this.file);});}
 logout(){return this.transaction(async()=>{await this.read();await rm(this.activeFile,{force:true});await saveProtectedJson({version:1,activeId:null,accounts:[]},this.file);});}
}
export const newLoginProfile=()=>path.join(process.env.LOCALAPPDATA,'dsh-feishu-subscription','account-logins',randomUUID());
