import {FeishuAdapter} from './lib/provider.js';
import {login,loginStatus} from './lib/login.js';
import {AccountStore,newLoginProfile} from './lib/accounts.js';
import {readQuota} from './lib/quota.js';
import {credentialPath,loadCredentials} from './lib/credentials.js';
import {rm} from 'node:fs/promises';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {QuietPreference} from './lib/quiet-preference.js';
export const name='dsh-feishu-subscription';
export const inject=['llm'];
export function apply(ctx,config={}){
  const quietPreference=new QuietPreference(config.quietNoticeFile||path.join(path.dirname(config.credentialFile||credentialPath()),'quiet-preference.json'));
  const adapter=new FeishuAdapter({...config,quietPreference});
  const accounts=new AccountStore(config.credentialFile);
  ctx.effect(()=>ctx.llm.registerAdapter(['feishu-subscription'],adapter));
  let loginJob,loginState='idle',controller;
  const startLogin=(fresh=false)=>{
    if(loginJob)return;
    controller=new AbortController();loginState='starting';
    const temporary=path.join(path.dirname(config.credentialFile||credentialPath()),'login-'+randomUUID()+'.dpapi');
    const profile=fresh?newLoginProfile():undefined;
    loginJob=login({credentialFile:temporary,...(profile?{profileDir:profile}:{}),signal:controller.signal,onState:state=>{loginState=state;}})
      .then(async()=>{await accounts.add(await loadCredentials(temporary));adapter.invalidate();ctx.emit('llm/adapters-updated');loginState='authenticated';})
      .catch(error=>{loginState=error.message;}).finally(async()=>{
        await rm(temporary,{force:true});
        if(profile){const parent=path.resolve(process.env.LOCALAPPDATA,'dsh-feishu-subscription','account-logins');const resolved=path.resolve(profile);if(resolved.startsWith(parent+path.sep))await rm(resolved,{recursive:true,force:true,maxRetries:3,retryDelay:200}).catch(()=>{});}
        loginJob=undefined;
      });
  };
  const handle=async(endpoint,payload={})=>{
    try{
      if(endpoint.endsWith('/quiet-notice'))return {ok:true,value:await quietPreference.status()};
      if(endpoint.endsWith('/quiet-notice-ack'))return {ok:true,value:await quietPreference.acknowledge(payload)};
      if(endpoint.endsWith('/diagnostics'))return {ok:true,value:adapter.diagnostics.list()};
      if(endpoint.endsWith('/diagnostics-clear'))return {ok:true,value:adapter.diagnostics.clear()};
      if(endpoint.endsWith('/login')){startLogin(payload.fresh===true);return {ok:true,value:{loginState}};}
      if(endpoint.endsWith('/cancel')){controller?.abort();await loginJob;return {ok:true,value:{cancelled:true}};}
      if(endpoint.endsWith('/logout')||endpoint.endsWith('/switch')){
        if(loginJob)throw Error('请先取消正在进行的登录。');
        adapter.cancelRequests();
        if(endpoint.endsWith('/logout'))await accounts.logout(payload.id);else await accounts.switch(payload.id);
        adapter.invalidate();ctx.emit('llm/adapters-updated');return {ok:true,value:await accounts.list()};
      }
      if(endpoint.endsWith('/quota'))return {ok:true,value:await readQuota(config.credentialFile)};
      if(endpoint.endsWith('/models')){adapter.invalidate();return {ok:true,value:await adapter.entries()};}
      return {ok:true,value:{...await loginStatus(config.credentialFile),...await accounts.list(),loginState,loginPending:!!loginJob,quietWarning:adapter.quietWarning,version:'0.3.2'}};
    }catch(error){return {ok:false,error:{code:'FEISHU_OPERATION',message:['请先取消正在进行的登录。','账号不存在。','账号登录已过期，请重新登录。'].includes(error.message)?error.message:'操作未完成，请检查登录状态。'}};}
  };
  ctx.inject(['connection'],child=>{
    for(const action of ['status','models','login','logout','switch','quota','cancel','diagnostics','diagnostics-clear','quiet-notice','quiet-notice-ack']){
      const method='feishu-subscription/'+action;
      child.effect(()=>child.connection.fetch.register({path:'/api/'+method,methods:['POST'],requestBody:'buffered',async fetch(request){
        if(request.headers.get('content-type')?.split(';')[0]!=='application/json')return new Response('JSON required',{status:415});
        let body;try{body=await request.json();}catch{return new Response('Invalid JSON',{status:400});}
        if(body.type!=='client-request'||body.method!==method||typeof body.rpcId!=='string')return new Response('Invalid envelope',{status:400});
        if(!body.payload||typeof body.payload!=='object'||Array.isArray(body.payload))return new Response('Invalid payload',{status:400});
        return Response.json({type:'server-response',rpcId:body.rpcId,result:await handle(method,body.payload)});
      }}));
    }
  });
  ctx.effect(()=>()=>{controller?.abort();adapter.cancelRequests();});
  ctx.inject(['commands'],commandCtx=>{
    commandCtx.effect(()=>commandCtx.commands.register({
      name:'feishu',description:'飞书豆包工作：登录、登录状态与企业模型目录',input:{hint:'login | status | models'},recordInput:false,
      handler:async({rawInput})=>{
        const action=rawInput.trim()||'status';
        if(action==='login'){
          if(loginJob)return {kind:'success',text:'飞书登录正在进行，请在专用 Chrome 窗口完成确认，然后运行 /feishu status。'};
          startLogin();
          return {kind:'success',text:'已启动飞书登录；如出现 Chrome 窗口，请手动扫码确认。运行 /feishu status 查看结果。'};
        }
        if(action==='status'){
          const status=await loginStatus(config.credentialFile);
          return {kind:'success',text:JSON.stringify({...status,loginState},null,2)};
        }
        if(action==='models'){
          try{return {kind:'success',text:(await adapter.entries()).map(m=>`${m.name} — ${m.id}`).join('\n')};}
          catch{return {kind:'error',text:'读取飞书模型失败，请先运行 /feishu login。'};}
        }
        return {kind:'error',text:'用法：/feishu login、/feishu status、/feishu models'};
      }
    }));
  });
}
