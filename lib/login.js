import {getPlaywright} from './playwright-runtime.js';
import {mkdir} from 'node:fs/promises';
import path from 'node:path';
import {loadCredentials,saveCredentials} from './credentials.js';
import {dataDirectory} from './paths.js';
import {defaultHeaded,waitForFeishuSession} from './login-session.js';

export const loginProfilePath=()=>path.join(dataDirectory(),'login-profile');
export async function loginStatus(credentialFile){
  try{
    const credentials=await loadCredentials(credentialFile);
    return {credentialStored:true,authKind:credentials.authKind,expiresAt:new Date(credentials.expiresAt).toISOString()};
  }catch{return {credentialStored:false,action:'请运行 /feishu login 登录飞书'};}
}
export async function login({credentialFile,profileDir=loginProfilePath(),signal,headed=defaultHeaded(),onState=()=>{},view}={}){
  const {chromium,request}=getPlaywright();
  await mkdir(profileDir,{recursive:true,mode:0o700});
  let browser,api;
  try{
    signal?.throwIfAborted();
    browser=await chromium.launchPersistentContext(profileDir,{channel:'chrome',headless:!headed,viewport:{width:1000,height:760}});
    const close=()=>{void browser.close().catch(()=>{});};
    signal?.addEventListener('abort',close,{once:true});
    try{
      const cookies=await waitForFeishuSession(browser,{signal,headed,onState,view});
      const session=cookies.find(c=>c.name==='session'),device=cookies.find(c=>c.name==='passport_web_did')?.value;
      if(!session)throw new Error('登录超时，请重新运行 /feishu login。');
      onState('verifying');
      const response=await browser.request.post('https://accounts.feishu.cn/accounts/mix/v1/token/doubao',{
        headers:{'Suite-Session-Key':session.value,'X-App-Id':'1',...(device?{'X-Passport-Device-IDs':device,'X-Passport-Uni-Did':device}:{})},data:{},timeout:15000});
      const exchanged=await response.json(),token=exchanged.data?.access_token;
      if(!response.ok()||exchanged.code!==0||!token)throw new Error('飞书换票失败，请在独立 Chrome 窗口检查登录状态后重试。');
      const cookie=`passport_access_token=${token}; passport_access_platform=feishu`+(device?`; x-flow-device-id=${device}`:'');
      api=await request.newContext({extraHTTPHeaders:{Cookie:cookie},timeout:15000});
      const account=await(await api.get('https://accounts.doubao.com/passport/account/info/v2/?aid=497858&device_platform=web&sdk_version=2.2.11-doubao.0&account_sdk_source=web')).json();
      if(account.message!=='success'||!(account.data?.user_id_str||account.data?.user_id))throw new Error('豆包 Passport 校验失败，未保存凭据。');
      signal?.throwIfAborted();
      await saveCredentials({accessToken:token,deviceId:device,expiresAt:Date.now()+Number(exchanged.data.expires_in)*1000,authKind:'feishu-passport-token',passportVerified:true,
        accountId:String(account.data.user_id_str||account.data.user_id),displayName:account.data.screen_name||account.data.name||account.data.username||'飞书账号'},credentialFile);
      onState('authenticated');
      return loginStatus(credentialFile);
    }finally{signal?.removeEventListener('abort',close);}
  }catch(error){
    // Playwright diagnostics can contain request details; expose only a fixed summary.
    if(signal?.aborted)throw new Error('登录已取消。');
    if(error.message?.startsWith('飞书')||error.message?.startsWith('豆包')||error.message?.startsWith('登录')||error.message?.startsWith('需要')||error.message?.startsWith('凭据加密不可用'))throw error;
    throw new Error('无法完成飞书登录。请关闭占用专用登录目录的 Chrome 窗口，确认已安装 Chrome 后重试。');
  }finally{await api?.dispose();await browser?.close().catch(()=>{});}
}
