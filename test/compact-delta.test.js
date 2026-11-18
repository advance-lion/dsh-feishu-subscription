import test from 'node:test';import assert from 'node:assert/strict';import {parseCompletion,streamCompletion} from '../lib/generate.js';
const f=(event,data)=>`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
const block=(id,text,extra={})=>({block_type:10000,block_id:id,content:{text_block:{text}},patch_type:1,...extra});
const patch=b=>f('STREAM_CHUNK',{patch_op:[{patch_object:1,patch_value:{content_block:[b]}}]});
const end=f('SSE_REPLY_END',{end_type:1})+f('SSE_REPLY_END',{end_type:3});
test('compact deltas append to their most recent block, preserving long UTF8 output',async()=>{
 const expected='段落。'.repeat(500)+'END_7319';let wire=patch(block('a','开头'));
 for(let i=0;i<expected.length;i+=9)wire+=f('CHUNK_DELTA',{text:expected.slice(i,i+9)});
 const bytes=new TextEncoder().encode(wire+end);const chunks=[];for(let i=0;i<bytes.length;i+=13)chunks.push(bytes.slice(i,i+13));
 assert.equal((await parseCompletion(chunks)).text,'开头'+expected);
});
test('compact deltas never leak invisible thinking blocks or silently drop missing templates',async()=>{
 const wire=patch(block('hidden','hidden',{control_info:{is_visible:false}}))+f('CHUNK_DELTA',{text:'private'})+patch(block('visible','answer'))+f('CHUNK_DELTA',{text:' complete'})+end;
 assert.equal((await parseCompletion([wire])).text,'answer complete');
 await assert.rejects(()=>parseCompletion([f('CHUNK_DELTA',{text:'orphan'})+end]),/template/);
});

test('visible snapshots arrive before upstream completion and retain end validation',async()=>{
 let release;const gate=new Promise(r=>release=r);let reachedEnd=false;
 async function* source(){yield patch(block('a','first'));await gate;yield f('CHUNK_DELTA',{text:' second'});reachedEnd=true;yield end;}
 const stream=streamCompletion(source());assert.deepEqual((await stream.next()).value,{type:'snapshot',text:'first'});assert.equal(reachedEnd,false);
 release();assert.equal((await stream.next()).value.text,'first second');assert.equal((await stream.next()).value.type,'complete');assert.equal((await stream.next()).done,true);
 const incomplete=streamCompletion([patch(block('a','partial'))]);assert.equal((await incomplete.next()).value.text,'partial');await assert.rejects(()=>incomplete.next(),/completed/);
});
