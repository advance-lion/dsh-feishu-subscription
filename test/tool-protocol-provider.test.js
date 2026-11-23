import test from 'node:test';import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';import os from 'node:os';import path from 'node:path';
import {FeishuAdapter} from '../lib/provider.js';import {saveCredentials} from '../lib/credentials.js';
const frame=(event,data)=>`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
const chunk=text=>frame('STREAM_CHUNK',{patch_op:[{patch_object:1,patch_value:{content_block:[{block_type:10000,block_id:'a',content:{text_block:{text}}}]}}]});
const end=frame('SSE_REPLY_END',{end_type:1,msg_finish_attr:{brief:'private finish brief',msgid:'private id'}})+frame('SSE_REPLY_END',{end_type:3});
test('adapter delivers prefixed tools, consumes host results, diagnoses invalid output and never logs payloads',{timeout:30000},async()=>{
 const dir=await mkdtemp(path.join(os.tmpdir(),'feishu-tool-protocol-')),credentialFile=path.join(dir,'fixture.enc'),original=globalThis.fetch;
 try{
  await saveCredentials({accessToken:'fixture-only-token',authKind:'feishu-passport-token',expiresAt:Date.now()+3600000},credentialFile);
  const a=new FeishuAdapter({credentialFile,quietPreference:{status:async()=>({enabled:false})}});a.entries=async()=>[{id:'fixture',modeId:'3',agentMode:1,extraParams:{total_window_size:'256000'}}];
  const tools=[{name:'read',description:'fixture schema secret',parameters:{type:'object'}}],collect=async messages=>{const result=[];for await(const e of a.stream({model:'fixture',tools,maxTokens:4096,messages}))result.push(e);return result;};
  let requestBytes;
  globalThis.fetch=async(url,r)=>{requestBytes=Buffer.byteLength(r.body);return new Response(chunk('先读取。\n<dsh_tool_calls>{"calls":[{"name":"read","arguments":{"path":"private fixture path"}}]}</｜｜ parameter>\n</｜｜ invoke>\n</｜｜ calls>')+end,{headers:{'Content-Type':'text/event-stream'}});};
  const out=await collect([{role:'user',content:[{type:'text',text:'private prompt'}]}]);
  assert.equal(out.filter(x=>x.type==='text-delta').map(x=>x.text).join(''),'先读取。\n');
  assert.equal(out.at(-1).reason.kind,'tool-calls');const call=out.find(x=>x.type==='block-end'&&x.block.type==='tool-call').block;
  globalThis.fetch=async(url,r)=>{assert.ok(JSON.parse(r.body).messages[0].content_block[0].content.text_block.text.includes('host-result-fixture'));return new Response(chunk('工具结果已接收。')+end,{headers:{'Content-Type':'text/event-stream'}});};
  const next=await collect([{role:'assistant',content:[call]},{role:'tool',toolCallId:call.id,content:[{type:'text',text:'host-result-fixture'}]}]);assert.equal(next.at(-1).reason.kind,'stop');
  const log=a.diagnostics.list(),input=log.rows.find(r=>r.event==='input-ready');assert.equal(input.requestBytes,requestBytes);assert.equal(input.contextWindow,256000);assert.equal(input.contextSource,'catalog');assert.equal(input.requestedMaxTokens,4096);assert.equal(input.requestedMaxTokensApplied,false);assert.equal(input.outputBudgetSource,'not-exposed');
  assert.ok(log.rows.some(r=>r.protocolClosure==='legacy'&&r.toolCallCount===1));assert.ok(log.rows.some(r=>r.event==='upstream-end'&&r.endType===3&&r.upstreamFinishReason==='not-provided'));
  assert.doesNotMatch(JSON.stringify(log),/private|fixture-only-token|host-result-fixture|fixture schema secret/);
  for(const mode of ['bad-json','length']){
   globalThis.fetch=async()=>new Response(mode==='bad-json'?chunk('准备读取。\n<dsh_tool_calls>{"calls":[')+end:chunk('partial')+frame('SSE_REPLY_END',{end_type:1,finish_reason:'length'}),{headers:{'Content-Type':'text/event-stream'}});
   await assert.rejects(()=>collect([]),e=>e.code===(mode==='bad-json'?'PROVIDER_TOOL_PROTOCOL':'PROVIDER_OUTPUT_LIMIT'));
  }
  assert.ok(a.diagnostics.list().rows.some(r=>r.category==='tool-protocol'));assert.ok(a.diagnostics.list().rows.some(r=>r.category==='output-limit'));
 }finally{globalThis.fetch=original;await rm(dir,{recursive:true,force:true});}
});
