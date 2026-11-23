import test from 'node:test';import assert from 'node:assert/strict';
import {modelLimits,completionMetadata} from '../lib/completion-metadata.js';
import {parseCompletion} from '../lib/generate.js';import {DiagnosticLog} from '../lib/diagnostics.js';
const frame=(event,data)=>`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
test('catalog context and unknown budgets are distinguished from fallback and host requests',()=>{
 assert.deepEqual(modelLimits({extraParams:{total_window_size:'256000',memory_profile:'256k'}}),{contextWindow:256000,contextSource:'catalog',maxOutputTokens:undefined,outputBudgetSource:'not-exposed'});
 assert.equal(modelLimits({extraParams:{total_window_size:'invalid'}}).contextSource,'fallback');
 assert.equal(modelLimits({extraParams:{max_output_tokens:'8192'}}).maxOutputTokens,8192);
});
test('upstream end attributes never expose brief text, identifiers or arbitrary reasons',()=>{
 const raw={end_type:2,msg_finish_attr:{brief:'private reply',msgid:'private-id'},answer_finish_attr:{has_suggest:false}};
 const info=completionMetadata(raw);assert.equal(info.upstreamFinishReason,'not-provided');assert.equal(info.endType,2);assert.ok(!JSON.stringify(info).includes('private'));
 assert.equal(completionMetadata({end_type:3,finish_reason:'private secret'}).upstreamFinishReason,'other');
 const log=new DiagnosticLog();log.add({stage:'projection',event:'input-ready',inputBytes:1234,contextWindow:256000,contextSource:'catalog',requestedMaxTokens:4096,requestedMaxTokensApplied:false,outputBudgetSource:'not-exposed',brief:'private reply',maxOutputTokens:NaN});
 log.add({stage:'completion',event:'upstream-end',...info});assert.equal(log.list().rows[0].inputBytes,1234);assert.ok(!JSON.stringify(log.list()).includes('private'));assert.ok(!('maxOutputTokens' in log.list().rows[0]));
});
test('explicit output exhaustion is diagnosed and never treated as successful completion',async()=>{
 const text=frame('STREAM_CHUNK',{patch_op:[{patch_object:1,patch_value:{content_block:[{block_type:10000,block_id:'a',content:{text_block:{text:'partial'}}}]}}]});
 let info;await assert.rejects(()=>parseCompletion([text+frame('SSE_REPLY_END',{end_type:1,finish_reason:'length'})+frame('SSE_REPLY_END',{end_type:3})],{onEnd:x=>{info=x;}}),e=>e.code==='UPSTREAM_OUTPUT_LIMIT');assert.equal(info.upstreamFinishReason,'length');
});
