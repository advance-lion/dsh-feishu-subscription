import { request } from 'playwright-core';
import { loadCredentials } from './credentials.js';

export class FeishuApiError extends Error {
  constructor(endpoint,code,status){super(`Doubao API ${endpoint} rejected the request (HTTP ${status}, code ${code}).`);this.name='FeishuApiError';this.code=code;this.status=status;}
}
export function authenticationCookies(credentials){
  if(credentials.authKind==='feishu-passport-token'||(!credentials.doubaoCookies?.length&&credentials.accessToken)){
    if(!credentials.accessToken)throw new Error('Feishu Passport token missing.');
    const cookie=(name,value,httpOnly=true)=>({name,value,domain:'.doubao.com',path:'/',secure:true,httpOnly,sameSite:'Lax',expires:credentials.expiresAt/1000});
    return [cookie('passport_access_token',credentials.accessToken),cookie('passport_access_platform','feishu',false),...(credentials.deviceId?[cookie('x-flow-device-id',credentials.deviceId)]:[])];
  }
  return credentials.doubaoCookies||[];
}
export async function createClient({credentialFile,headers={}}={}){
  const credentials=await loadCredentials(credentialFile);
  const context=await request.newContext({
    storageState:{cookies:authenticationCookies(credentials),origins:[]},
    ...(credentials.userAgent?{userAgent:credentials.userAgent}:{}),
    extraHTTPHeaders:{'Agw-Js-Conv':'str',Origin:'https://www.doubao.com',Referer:'https://www.doubao.com/chat/',...headers},
    timeout:30000
  });
  const query=new URLSearchParams({aid:'497858',real_aid:'497858',device_platform:'web',doubao_device_platform:'web',version_code:'20800',samantha_web:'1',pc_version:'3.43.1',web_platform:'browser',language:'zh',region:'CN','use-olympus-account':'1'});
  if(credentials.deviceId)query.set('device_id',credentials.deviceId);
  if(credentials.authKind!=='feishu-passport-token'&&credentials.query)for(const [k,v]of Object.entries(credentials.query))query.set(k,v);
  return {
    async post(endpoint,body={}){
      if(!endpoint.startsWith('/')||endpoint.startsWith('//'))throw new Error('Invalid API path.');
      const response=await context.post('https://www.doubao.com'+endpoint+'?'+query,{data:body});
      const result=await response.json();
      if(!response.ok()||result.code!==0)throw new FeishuApiError(endpoint,result.code??'INVALID_RESPONSE',response.status());
      return result.data;
    },
    async raw(endpoint,body){return context.post('https://www.doubao.com'+endpoint+'?'+query,{data:body});},
    async getPage(endpoint){return context.get('https://www.doubao.com'+endpoint);},
    close:()=>context.dispose()
  };
}
