import {LlmAdapter,LlmError,attributionHeaders,resolveRetryPolicy} from '@deepseek-ai/dsh-llm';
import {loadCredentials} from './credentials.js';
import {authenticationCookies} from './client.js';
import {listModels} from './catalog.js';
import {buildRequest} from './generate.js';
import {projectRequest} from './projection.js';
import {ReplyStream} from './reply-stream.js';
import {DiagnosticLog,errorCategory} from './diagnostics.js';
import {verifyInWindow} from './verification-window.js';
import {recoverCompletionStream} from './verification-recovery.js';
import {createHash} from 'node:crypto';
import {createQuietTask} from './quiet-task.js';
import {QuietPreference} from './quiet-preference.js';

export class FeishuAdapter extends LlmAdapter{
  constructor({credentialFile,diagnostics=new DiagnosticLog(),verify=verifyInWindow,quietPreference=new QuietPreference()}={}){super();this.credentialFile=credentialFile;this.diagnostics=diagnostics;this.verify=verify;this.quietPreference=quietPreference;this.quietWarning=false;this.activeRequests=new Set();this.verifiedSessions=new Map();this.catalog=[];this.updatedAt=0;}
  cancelRequests(){for(const controller of this.activeRequests)controller.abort();this.verifiedSessions.clear();}
  invalidate(){this.updatedAt=0;this.catalog=[];}
  providerInfo(provider){return {id:provider,name:'飞书 · 豆包工作（企业订阅）'};}
  providerRetryPolicy(){return resolveRetryPolicy({mode:'normal',maxRetries:0});}
  async entries(){
    if(Date.now()-this.updatedAt<30000)return this.catalog;
    try{this.catalog=await listModels({credentialFile:this.credentialFile,headers:attributionHeaders()});this.updatedAt=Date.now();this.diagnostics.add({stage:'models',event:'completed',count:this.catalog.length});return this.catalog;}
    catch(error){this.diagnostics.add({stage:'models',event:'failed',category:errorCategory(error),upstreamCode:error.code,transportCode:error.cause?.code});throw error;}
  }
  async listModels(provider){
    try{return (await this.entries()).map(model=>({provider,id:model.id,name:model.name,inputModalities:['text'],description:'飞书企业目录；文本历史投影，工具由 DSH 执行'}));}
    catch{return [];}
  }
  async resolveModel(provider,id,signal){
    signal?.throwIfAborted();
    let entries;try{entries=await this.entries();}catch{throw new LlmError('请先在 DSH 输入 /feishu login 完成飞书登录。','AUTH');}
    signal?.throwIfAborted();
    const model=entries.find(m=>m.id===id);
    if(!model)throw new LlmError('该模型不在当前飞书账号目录中，请运行 /feishu models。','MODEL_NOT_FOUND');
    return {provider,id:model.id,name:model.name,inputModalities:['text'],context:{contextWindow:Number(model.extraParams.total_window_size)||256000}};
  }
  async *stream(options){
    const controller=new AbortController();this.activeRequests.add(controller);
    options={...options,signal:AbortSignal.any([controller.signal,...(options.signal?[options.signal]:[])])};
    let stage='catalog',secrets=[],quiet,owned=false,cleaned=false;
    const requestId=this.diagnostics.requestId(),started=Date.now();
    const cleanup=async()=>{
      if(cleaned||!quiet||!owned)return;cleaned=true;
      try{await quiet.cleanup();this.diagnostics.add({requestId,stage:'task-cleanup',event:'completed',elapsedMs:Date.now()-started});}
      catch{this.quietWarning=true;this.diagnostics.add({requestId,stage:'task-cleanup',event:'failed',category:'cleanup-failed',elapsedMs:Date.now()-started});}
    };
    this.diagnostics.add({requestId,stage,event:'started',model:options.model});
    try{
      options.signal?.throwIfAborted();
      const model=(await this.entries()).find(m=>m.id===options.model);
      if(!model)throw new LlmError('飞书账号未开放此模型。','MODEL_NOT_FOUND');
      stage='projection';const prompt=projectRequest(options);
      stage='credentials';
      const credentials=await loadCredentials(this.credentialFile);
      secrets=authenticationCookies(credentials).map(c=>c.value);
      const session={credentials,cookies:authenticationCookies(credentials)};
      const sessionKey=createHash('sha256').update(JSON.stringify(session.cookies)).digest('hex');
      const verified=this.verifiedSessions.get(sessionKey);
      if(verified)session.cookies=verified.cookies;
      let cookie=session.cookies.map(c=>`${c.name}=${c.value}`).join('; ');
      const query=new URLSearchParams({aid:'497858',real_aid:'497858',device_platform:'web',doubao_device_platform:'web',version_code:'20800',samantha_web:'1',pc_version:'3.43.1',web_platform:'browser',language:'zh',region:'CN','use-olympus-account':'1'});
      if(credentials.deviceId)query.set('device_id',credentials.deviceId);
      if(verified)query.set('fp',verified.fp);
      session.query=query;
      const body=buildRequest(model,prompt);
      let quietEnabled=false;
      try{quietEnabled=(await this.quietPreference.status()).enabled;}catch{this.quietWarning=true;this.diagnostics.add({requestId,stage:'quiet-prepare',event:'failed',category:'quiet-setting-failed'});}
      if(quietEnabled){
        quiet=createQuietTask({request:body,post:async(endpoint,payload,signal)=>{
          // IM gateways require the encoding parameter; plain application/json
          // is rejected with 712012002 even when account/config calls succeed.
          const response=await fetch('https://www.doubao.com'+endpoint+'?'+query,{method:'POST',headers:{...attributionHeaders(),'Content-Type':'application/json; encoding=utf-8','Agw-Js-Conv':'str',Origin:'https://www.doubao.com',Referer:'https://www.doubao.com/chat/',Cookie:cookie},body:JSON.stringify(payload),signal});
          if(!response.ok)throw Error('Quiet operation rejected');return response.json();
        }});
        try{stage='quiet-prepare';await quiet.prepare(AbortSignal.any([AbortSignal.timeout(8000),options.signal]));this.diagnostics.add({requestId,stage,event:'completed'});}
        catch{options.signal.throwIfAborted();this.quietWarning=true;this.diagnostics.add({requestId,stage,event:'failed',category:'quiet-setting-failed'});}
      }
      const send=async(body,attempt)=>{stage='request';const response=await fetch('https://www.doubao.com/chat/completion?'+query,{
        method:'POST',headers:{...attributionHeaders(),'Content-Type':'application/json','Agw-Js-Conv':'str',Origin:'https://www.doubao.com',Referer:'https://www.doubao.com/chat/',Cookie:cookie},
        body:JSON.stringify(body),signal:AbortSignal.any([AbortSignal.timeout(180000),options.signal])
      });
      this.diagnostics.add({requestId,stage,event:'response',model:options.model,httpStatus:response.status,elapsedMs:Date.now()-started});
      if(!response.ok||!response.headers.get('content-type')?.startsWith('text/event-stream')){await response.body?.cancel();throw new LlmError('飞书模型请求失败。','PROVIDER_RESPONSE',{status:response.status});}
      stage='completion';return response;};
      const reply=new ReplyStream();let firstText=false;
      const upstream=recoverCompletionStream({body,send,signal:options.signal,onAck:ack=>{if(!quiet)return;try{quiet.acknowledge(ack);owned=true;}catch{this.quietWarning=true;this.diagnostics.add({requestId,stage:'task-cleanup',event:'failed',category:'cleanup-failed'});}},onEvent:event=>this.diagnostics.add({requestId,stage:'verification',event,model:options.model,elapsedMs:Date.now()-started}),verify:async decision=>{
        stage='verification';
        const result=await this.verify({decision,session,signal:options.signal,onState:event=>this.diagnostics.add({requestId,stage,event,model:options.model,elapsedMs:Date.now()-started})});
        if(result?.verified){
          if(!/^verify_[A-Za-z0-9_-]{1,200}$/.test(result.fp||''))throw Error('VERIFICATION_CONTEXT_MISSING');
          query.set('fp',result.fp);
          if(result.cookies){session.cookies=result.cookies;cookie=result.cookies.map(c=>`${c.name}=${c.value}`).join('; ');secrets.push(...result.cookies.map(c=>c.value).filter(Boolean));}
          if(this.verifiedSessions.size>=8)this.verifiedSessions.clear();
          this.verifiedSessions.set(sessionKey,{fp:result.fp,cookies:session.cookies});
        }
        return result;
      }});
      for await(const event of upstream){
        options.signal.throwIfAborted();
        if(event.type!=='text')continue;
        for(const chunk of reply.push(event.text)){
          if(chunk.type==='text-delta'&&!firstText){firstText=true;this.diagnostics.add({requestId,stage:'completion',event:'first-text',model:options.model,elapsedMs:Date.now()-started});}
          yield chunk;
        }
      }
      options.signal?.throwIfAborted();
      if(quiet&&!owned){this.quietWarning=true;this.diagnostics.add({requestId,stage:'task-cleanup',event:'failed',category:'cleanup-failed'});}
      await cleanup();
      stage='tool-envelope';const output=reply.finish(options.tools);
      for(const chunk of output)yield chunk;
      this.diagnostics.add({requestId,stage,event:'completed',model:options.model,elapsedMs:Date.now()-started});
      yield {type:'finish',reason:{kind:output.some(b=>b.type==='tool-call-delta')?'tool-calls':'stop'}};
    }catch(error){
      this.diagnostics.add({requestId,stage,event:error.verificationRequired?'verification-required':'failed',model:options.model,upstreamCode:error.code,transportCode:error.cause?.code,category:errorCategory(error),elapsedMs:Date.now()-started});
      const diagnostic=secrets.reduce((message,secret)=>message.replaceAll(secret,'[redacted]'),String(error.message||'')).replace(/[A-Za-z0-9_+/=-]{60,}/g,'[redacted]').slice(0,300);
      console.warn('[feishu-subscription]',JSON.stringify({stage,name:error.name,code:error.code,causeCode:error.cause?.code,diagnostic}));
      if(error instanceof LlmError)throw error;
      if(error.message==='STREAM_OUTPUT_REVISED')throw new LlmError('上游改写了已输出的正文，本次流式回复未标记完成。','PROVIDER_STREAM_REVISED');
      if(options.signal?.aborted)throw new LlmError('已停止接收飞书回复；云端任务可能继续运行。','ABORTED');
      if(/^VERIFICATION_/.test(error.message||''))throw new LlmError('安全验证未完成、已取消或上下文缺失，本次未继续重发。','VERIFICATION_REQUIRED');
      if(error.verificationRequired)throw new LlmError('飞书要求安全验证码（710022004），请查看飞书订阅的诊断日志。','VERIFICATION_REQUIRED');
      if(Number(error.code)===710020702)throw new LlmError('飞书上游系统错误（710020702），请查看飞书订阅的诊断日志。','PROVIDER_ERROR');
      if(error.cause?.code==='UND_ERR_SOCKET')throw new LlmError('飞书响应连接中断，请查看飞书订阅的诊断日志。','PROVIDER_CONNECTION_CLOSED');
      if(error.kind==='SHARK_BLOCK')throw new LlmError('飞书拒绝了该请求（SharkBlock），请检查登录和账号状态。','SHARK_BLOCK');
      throw new LlmError(error.code==='AUTH_SESSION_INVALID'?'飞书会话已过期，请运行 /feishu login。':'飞书模型调用未完成，请检查登录状态或稍后重试。','FEISHU_REQUEST_FAILED');
    }finally{controller.abort();await cleanup();this.activeRequests.delete(controller);}
  }
}
