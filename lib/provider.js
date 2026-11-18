import {LlmAdapter,LlmError,attributionHeaders,resolveRetryPolicy} from '@deepseek-ai/dsh-llm';
import {loadCredentials} from './credentials.js';
import {authenticationCookies} from './client.js';
import {listModels} from './catalog.js';
import {buildRequest,streamCompletion} from './generate.js';
import {projectRequest,parseToolReply} from './projection.js';
import {createQuietTask} from './quiet-task.js';

export class FeishuAdapter extends LlmAdapter{
  constructor({credentialFile}={}){super();this.credentialFile=credentialFile;this.catalog=[];this.updatedAt=0;}
  invalidate(){this.updatedAt=0;this.catalog=[];}
  providerInfo(provider){return {id:provider,name:'飞书 · 豆包工作（企业订阅）'};}
  providerRetryPolicy(){return resolveRetryPolicy({mode:'normal',maxRetries:0});}
  async entries(){
    if(Date.now()-this.updatedAt<30000)return this.catalog;
    this.catalog=await listModels({credentialFile:this.credentialFile,headers:attributionHeaders()});this.updatedAt=Date.now();return this.catalog;
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
    let stage='catalog',secrets=[],quiet,cleanupHandled=false;
    const cleanup=async()=>{cleanupHandled=true;try{await quiet?.cleanup();}catch{throw new LlmError('回复已保留，但飞书任务归档或已读操作未确认，请在飞书检查。','TASK_CLEANUP_FAILED');}};
    try{
      options.signal?.throwIfAborted();
      const model=(await this.entries()).find(m=>m.id===options.model);
      if(!model)throw new LlmError('飞书账号未开放此模型。','MODEL_NOT_FOUND');
      stage='projection';const prompt=projectRequest(options);
      stage='credentials';
      const credentials=await loadCredentials(this.credentialFile);
      secrets=authenticationCookies(credentials).map(c=>c.value);
      const cookie=authenticationCookies(credentials).map(c=>`${c.name}=${c.value}`).join('; ');
      const query=new URLSearchParams({aid:'497858',real_aid:'497858',device_platform:'web',doubao_device_platform:'web',version_code:'20800',samantha_web:'1',pc_version:'3.43.1',web_platform:'browser',language:'zh',region:'CN','use-olympus-account':'1'});
      if(credentials.deviceId)query.set('device_id',credentials.deviceId);
      const body=buildRequest(model,prompt);
      const headers={...attributionHeaders(),'Content-Type':'application/json; encoding=utf-8','Agw-Js-Conv':'str',Origin:'https://www.doubao.com',Referer:'https://www.doubao.com/chat/',Cookie:cookie};
      quiet=createQuietTask({request:body,post:async(endpoint,payload,signal)=>{
        const reply=await fetch('https://www.doubao.com'+endpoint+'?'+query,{method:'POST',headers,body:JSON.stringify(payload),signal});
        if(!reply.ok)throw Error('Quiet task operation failed');return reply.json();
      }});
      stage='quiet-notifications';
      try{await quiet.prepare(AbortSignal.any([AbortSignal.timeout(8000),...(options.signal?[options.signal]:[])]));}
      catch(error){if(options.signal?.aborted)throw error;throw new LlmError('无法确认豆包桌面横幅已关闭，本次未发起模型请求，请稍后再试。','QUIET_MODE_FAILED');}
      stage='request';const response=await fetch('https://www.doubao.com/chat/completion?'+query,{
        method:'POST',headers:{...attributionHeaders(),'Content-Type':'application/json','Agw-Js-Conv':'str',Origin:'https://www.doubao.com',Referer:'https://www.doubao.com/chat/',Cookie:cookie},
        body:JSON.stringify(body),signal:AbortSignal.any([AbortSignal.timeout(180000),...(options.signal?[options.signal]:[])])
      });
      if(!response.ok||!response.headers.get('content-type')?.startsWith('text/event-stream')){
        await response.body?.cancel();
        if(response.status===429)throw new LlmError('飞书模型请求频率受限，请稍后再试。','RATE_LIMIT',{status:429});
        throw new LlmError('飞书模型请求失败。','PROVIDER_RESPONSE',{status:response.status});
      }
      stage='completion';let result,emitted='',textStarted=false,toolMode=false;
      for await(const event of streamCompletion(response.body,{onAck:ack=>quiet.acknowledge(ack)})){
        options.signal?.throwIfAborted();
        if(event.type==='complete'){result=event;continue;}
        const trimmed=event.text.trimStart(),marker='<dsh_tool_calls>';
        // Buffer only a possible tool envelope; ordinary text is emitted immediately.
        if(!textStarted&&(toolMode||!trimmed||marker.startsWith(trimmed)||trimmed.startsWith(marker))){
          toolMode=trimmed.startsWith(marker);continue;
        }
        if(!event.text.startsWith(emitted))throw new LlmError('上游修改了已输出的文本，无法安全追加。','STREAM_TEXT_REVISED');
        if(!textStarted){textStarted=true;yield {type:'block-start',index:0,blockType:'text'};}
        const delta=event.text.slice(emitted.length);emitted=event.text;
        if(delta)yield {type:'text-delta',index:0,text:delta};
      }
      if(!result)throw new LlmError('模型流未完成。','INCOMPLETE_STREAM');
      options.signal?.throwIfAborted();
      stage='task-cleanup';quiet.requireOwnership();await cleanup();
      stage='tool-envelope';const blocks=parseToolReply(result.text,options.tools);
      if(textStarted){
        if(blocks.length!==1||blocks[0].type!=='text'||result.text!==emitted)throw new LlmError('流式回复类型不一致。','STREAM_TYPE_CHANGED');
        yield {type:'block-end',index:0,block:blocks[0]};
        yield {type:'finish',reason:{kind:'stop'}};return;
      }
      for(const [index,block]of blocks.entries()){
        yield {type:'block-start',index,blockType:block.type};
        if(block.type==='text')yield {type:'text-delta',index,text:block.text};
        else yield {type:'tool-call-delta',index,id:block.id,name:block.name,argumentsDelta:block.arguments};
        yield {type:'block-end',index,block};
      }
      yield {type:'finish',reason:{kind:blocks.some(b=>b.type==='tool-call')?'tool-calls':'stop'}};
    }catch(error){
      const diagnostic=secrets.reduce((message,secret)=>message.replaceAll(secret,'[redacted]'),String(error.message||'')).replace(/[A-Za-z0-9_+/=-]{60,}/g,'[redacted]').slice(0,300);
      console.warn('[feishu-subscription]',JSON.stringify({stage,name:error.name,code:error.code,causeCode:error.cause?.code,diagnostic}));
      if(error instanceof LlmError)throw error;
      if(options.signal?.aborted)throw new LlmError('已停止接收飞书回复；云端任务可能继续运行。','ABORTED');
      if(error.kind==='RATE_LIMIT')throw new LlmError('飞书模型请求频率受限，请稍后再试。','RATE_LIMIT');
      if(error.kind==='SHARK_BLOCK')throw new LlmError('飞书拒绝了该请求（SharkBlock），请检查登录和账号状态。','SHARK_BLOCK');
      throw new LlmError(error.code==='AUTH_SESSION_INVALID'?'飞书会话已过期，请运行 /feishu login。':'飞书模型调用未完成，请检查登录状态或稍后重试。','FEISHU_REQUEST_FAILED');
    }finally{
      if(!cleanupHandled)await cleanup();
    }
  }
}
