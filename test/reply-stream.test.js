import test from 'node:test';import assert from 'node:assert/strict';
import {ReplyStream} from '../lib/reply-stream.js';
import {streamCompletion} from '../lib/generate.js';
const frame=(event,data)=>`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
const block=(text,patch_type=1)=>frame('STREAM_CHUNK',{patch_op:[{patch_object:1,patch_value:{content_block:[{block_type:10000,block_id:'a',patch_type,content:{text_block:{text}}}]}}]});
test('split tool envelope stays private until complete validation',()=>{
 const r=new ReplyStream();for(const text of ['\n<','\n<dsh_tool','\n<dsh_tool_calls>','\n<dsh_tool_calls>{"calls":['])assert.deepEqual(r.push(text),[]);
 r.push('\n<dsh_tool_calls>{"calls":[{"name":"read","arguments":{"path":"test"}}]}</dsh_tool_calls>');
 const events=r.finish([{name:'read'}]);assert.equal(events.length,3);assert.equal(events[1].type,'tool-call-delta');assert.equal(events[1].name,'read');
 const bad=new ReplyStream();bad.push('<dsh_tool_calls>{');assert.throws(()=>bad.finish([]));
});

test('commentary before standard or observed legacy tool envelope stays streamed but commands stay private',()=>{
 const json=JSON.stringify({calls:[{name:'read',arguments:{path:'fixture'}}]}),intro='先读取文件。\n\n';
 for(const close of ['</dsh_tool_calls>','</｜｜ parameter>\n</｜｜ invoke>\n</｜｜ calls>']){
  const r=new ReplyStream(),events=[],text=intro+'<dsh_tool_calls>'+json+close;
  for(let i=1;i<=text.length;i++)events.push(...r.push(text.slice(0,i)));
  assert.equal(events.filter(e=>e.type==='text-delta').map(e=>e.text).join(''),intro);
  assert.ok(!events.some(e=>e.type==='tool-call-delta'));
  const end=r.finish([{name:'read'}]);assert.equal(end[0].block.text,intro);
  assert.equal(end.filter(e=>e.type==='tool-call-delta').length,1);
  assert.equal(end.find(e=>e.type==='tool-call-delta').index,1);
  assert.equal(r.protocol.closure,close==='</dsh_tool_calls>'?'standard':'legacy');
 }
});

test('truncated JSON, unknown closers and unprovided calls fail the whole batch',()=>{
 const json=JSON.stringify({calls:[{name:'read',arguments:{}},{name:'unknown',arguments:{}}]});
 for(const body of ['<dsh_tool_calls>{"calls":[','<dsh_tool_calls>{"calls":[]}</other>','<dsh_tool_calls>'+json+'</dsh_tool_calls>','<dsh_tool_calls>{"calls":[{"name":"read","arguments":{}}]}</dsh_tool_calls> extra']){
  const r=new ReplyStream();const emitted=r.push('开始。'+body);
  assert.ok(!emitted.some(e=>e.type==='tool-call-delta'));assert.throws(()=>r.finish([{name:'read'}]),e=>e.name==='ToolProtocolError');
 }
});

test('Markdown examples and inline or escaped tags remain text, and a trailing math angle is flushed',()=>{
 const json='{"calls":[{"name":"read","arguments":{}}]}';
 for(const text of ['```json\n<dsh_tool_calls>'+json+'</dsh_tool_calls>\n```','~~~\n<dsh_tool_calls>'+json+'</dsh_tool_calls>\n~~~','`<dsh_tool_calls>'+json+'</dsh_tool_calls>`','\\<dsh_tool_calls>'+json+'</dsh_tool_calls>','2 <']){
  const r=new ReplyStream(),events=[];for(let i=1;i<=text.length;i++)events.push(...r.push(text.slice(0,i)));events.push(...r.finish([{name:'read'}]));
  assert.equal(events.filter(e=>e.type==='text-delta').map(e=>e.text).join(''),text);assert.ok(!events.some(e=>e.type==='tool-call-delta'));
 }
});
test('text prefixes, cumulative replacement and compact deltas do not duplicate text',async()=>{
 const r=new ReplyStream(),events=[];
 const wire=block('你')+block('你好',2)+frame('CHUNK_DELTA',{text:'世界'})+frame('SSE_REPLY_END',{end_type:1})+frame('SSE_REPLY_END',{end_type:3});
 // Arbitrary UTF-8 network boundaries, including inside Chinese characters.
 const bytes=new TextEncoder().encode(wire);const pieces=(async function*(){for(let i=0;i<bytes.length;i+=7)yield bytes.slice(i,i+7);})();
 for await(const event of streamCompletion(pieces))if(event.type==='text')events.push(...r.push(event.text));
 events.push(...r.finish([]));assert.equal(events.filter(e=>e.type==='text-delta').map(e=>e.text).join(''),'你好世界');assert.equal(events.at(-1).block.text,'你好世界');
 assert.throws(()=>r.push('改写正文'),/STREAM_OUTPUT_REVISED/);
});
test('a stream failure after text cannot emit a successful completion',async()=>{
 const r=new ReplyStream(),events=[];let completed=false;
 await assert.rejects(async()=>{for await(const event of streamCompletion([block('partial')+frame('STREAM_ERROR',{error_code:710020702})])){if(event.type==='text')events.push(...r.push(event.text));if(event.type==='completed')completed=true;}});
 assert.equal(events.find(e=>e.type==='text-delta').text,'partial');assert.equal(completed,false);assert.ok(!events.some(e=>e.type==='block-end'));
});
