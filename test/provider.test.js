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
  const adapter=new FeishuAdapter({credentialFile,quietPreference:{status:async()=>({enabled:false})}});
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
  let attempts=[],verificationCalls=0;
  adapter.verify=async({onState})=>{verificationCalls++;onState('waiting-user');onState('verified');return {verified:true,fp:'verify_sdk_test_session'};};
  globalThis.fetch=async(url,request)=>{
   const body=JSON.parse(request.body);attempts.push({url:new URL(url),body});
   if(attempts.length===1)return new Response(frame('STREAM_ERROR',{error_code:710022004,extra:{decision:{code:10000,type:'verify',detail:'not-for-logs'}}}),{headers:{'Content-Type':'text/event-stream'}});
   assert.equal(new URL(url).searchParams.get('fp'),'verify_sdk_test_session');
   assert.equal(body.ext.resend,'1');assert.notEqual(body.option.unique_key,attempts[0].body.option.unique_key);assert.deepEqual(body.messages,attempts[0].body.messages);
   return new Response(frame('STREAM_CHUNK',{patch_op:[{patch_object:1,patch_value:{content_block:[{block_type:10000,block_id:'a',content:{text_block:{text:'resumed reply'}}}]}}]})+frame('SSE_REPLY_END',{end_type:1})+frame('SSE_REPLY_END',{end_type:3}),{headers:{'Content-Type':'text/event-stream'}});
  };
  const resumed=[];for await(const event of adapter.stream({model:'seed-lite-7b',messages:[]}))resumed.push(event);
  assert.equal(resumed.find(e=>e.type==='text-delta').text,'resumed reply');assert.equal(verificationCalls,1);assert.equal(attempts.length,2);
  const logs=JSON.stringify(adapter.diagnostics.list());assert.ok(logs.includes('verified'));assert.ok(!logs.includes('verify_sdk_test_session'));assert.ok(!logs.includes('not-for-logs'));
  globalThis.fetch=async(url,request)=>{
   assert.equal(new URL(url).searchParams.get('fp'),'verify_sdk_test_session');assert.equal(JSON.parse(request.body).ext.resend,undefined);
   return new Response(frame('STREAM_CHUNK',{patch_op:[{patch_object:1,patch_value:{content_block:[{block_type:10000,block_id:'a',content:{text_block:{text:'next reply'}}}]}}]})+frame('SSE_REPLY_END',{end_type:1})+frame('SSE_REPLY_END',{end_type:3}),{headers:{'Content-Type':'text/event-stream'}});
  };
  for await(const event of adapter.stream({model:'seed-lite-7b',messages:[]})){}
  assert.equal(verificationCalls,1);adapter.cancelRequests();assert.equal(adapter.verifiedSessions.size,0);
  adapter.quietPreference={status:async()=>({enabled:true})};
  let archiveFails=false,prepareFails=false,generationFails=false,generations=0,readCount=0,archiveCount=0,ownId;
  globalThis.fetch=async(url,request)=>{
   const body=JSON.parse(request.body),route=new URL(url).pathname;
   assert.match(request.headers.Cookie,/passport_access_token=test-only-not-a-real-token/);
   assert.equal(request.headers['Content-Type'],route.startsWith('/im/')||route.startsWith('/alice/')?'application/json; encoding=utf-8':'application/json');
   if(route==='/alice/user/config/pull')return Response.json({code:0,data:{configs:prepareFails?[]:[{object:145,value:'0',version:1}]}});
   if(route==='/im/conversation/batch_operate'){archiveCount++;assert.deepEqual(body.uplink_body.batch_operate_conv_uplink_body.conversation_id_list,[ownId]);assert.equal(request.signal.aborted,false);return Response.json({status_code:0,downlink_body:{batch_operate_conv_downlink_body:{has_failure:archiveFails,conversation_list:[{conversation_id:ownId,success:!archiveFails}]}}});}
   if(route==='/im/message/mark_conv_read'){readCount++;assert.equal(request.signal.aborted,false);return Response.json({status_code:0});}
   assert.equal(route,'/chat/completion');generations++;ownId='owned-'+generations;
   return new Response(frame('SSE_ACK',{ack_client_meta:{local_conversation_id:body.client_meta.local_conversation_id,conversation_id:ownId}})+(generationFails?frame('STREAM_ERROR',{error_code:710020702}):frame('STREAM_CHUNK',{patch_op:[{patch_object:1,patch_value:{content_block:[{block_type:10000,block_id:'a',content:{text_block:{text:'quiet reply'}}}]}}]})+frame('SSE_REPLY_END',{end_type:1})+frame('SSE_REPLY_END',{end_type:3})),{headers:{'Content-Type':'text/event-stream'}});
  };
  for(const variant of ['normal','archive-failure','preference-failure','generation-failure']){
   archiveFails=variant==='archive-failure';prepareFails=variant==='preference-failure';generationFails=variant==='generation-failure';
   const values=[],run=async()=>{for await(const event of adapter.stream({model:'seed-lite-7b',messages:[]}))values.push(event);};
   if(generationFails)await assert.rejects(run,error=>error.code==='PROVIDER_ERROR');else{await run();assert.equal(values.find(e=>e.type==='text-delta').text,'quiet reply');assert.equal(values.at(-1).type,'finish');}
  }
  assert.equal(generations,4);assert.equal(archiveCount,4);assert.equal(readCount,4);assert.equal(adapter.quietWarning,true);
 }finally{globalThis.fetch=originalFetch;await rm(dir,{recursive:true,force:true});}
});
