import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {FeishuAdapter} from '../lib/provider.js';
import {saveCredentials} from '../lib/credentials.js';
const frame=(event,data)=>`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
test('DSH adapter accepts native fetch responses and sends Passport plus attribution',async()=>{
 const dir=await mkdtemp(path.join(os.tmpdir(),'feishu-provider-test-'));
 const credentialFile=path.join(dir,'test.dpapi');
 const originalFetch=globalThis.fetch;
 try{
  await saveCredentials({accessToken:'test-only-not-a-real-token',authKind:'feishu-passport-token',expiresAt:Date.now()+3600000},credentialFile);
  const adapter=new FeishuAdapter({credentialFile});
  adapter.entries=async()=>[{id:'seed-lite-7b',name:'Lite',modeId:'3',agentMode:1,extraParams:{}}];
  let calls=0;
  globalThis.fetch=async(url,request)=>{
   calls++;assert.match(request.headers.Cookie,/passport_access_token=test-only-not-a-real-token/);
   assert.match(request.headers['user-agent'],/^deepseek-harness\//);
   assert.equal(JSON.parse(request.body).option.model_config.model_item_key,'seed-lite-7b');
   return new Response(frame('STREAM_CHUNK',{patch_op:[{patch_object:1,patch_value:{content_block:[{block_type:10000,block_id:'a',content:{text_block:{text:'verified response'}}}]}}]})+frame('SSE_REPLY_END',{end_type:1})+frame('SSE_REPLY_END',{end_type:3}),{headers:{'Content-Type':'text/event-stream'}});
  };
  assert.equal(adapter.providerRetryPolicy().maxRetries,0);
  const chunks=[];for await(const chunk of adapter.stream({provider:'feishu-subscription',model:'seed-lite-7b',messages:[{role:'user',content:[{type:'text',text:'hi'}]}]}))chunks.push(chunk);
  assert.equal(calls,1);assert.equal(chunks.find(c=>c.type==='text-delta').text,'verified response');
  assert.deepEqual(chunks.at(-1),{type:'finish',reason:{kind:'stop'}});
  const controller=new AbortController();controller.abort();
  await assert.rejects(async()=>{for await(const chunk of adapter.stream({signal:controller.signal})){}},e=>e.code==='ABORTED');
  assert.equal(calls,1);
 }finally{globalThis.fetch=originalFetch;await rm(dir,{recursive:true,force:true});}
});
