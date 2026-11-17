import test from 'node:test';
import assert from 'node:assert/strict';
import {buildRequest,parseCompletion} from '../lib/generate.js';

test('work-model selection stays consistent across all protocol fields',()=>{
 const body=buildRequest({id:'seed-lite-7b',modeId:'3',agentMode:1,extraParams:{memory_profile:'256k'}},'只回复 OK');
 assert.equal(body.option.agent_mode,1);assert.equal(body.option.model_config.model_item_key,'seed-lite-7b');
 assert.equal(body.option.conversation_init_ext.model_item_key,'seed-lite-7b');assert.equal(body.option.aggregate_params.model_item_key,'seed-lite-7b');
 assert.deepEqual(body.option.general_task_param.thread_local_message_id,[body.messages[0].local_message_id]);
 const other=buildRequest({id:'seed-lite-7b',modeId:'3',agentMode:1,extraParams:{}},'只回复 OK');
 assert.notEqual(body.option.unique_key,other.option.unique_key);
 assert.throws(()=>buildRequest({id:'0',modeId:'1',agentMode:2},'text'),/work-mode/);
});
const frame=(event,data)=>`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
test('assistant patches are assembled and end_type 3 alone does not prove completion',async()=>{
 const wire=frame('SSE_ACK',{ack_client_meta:{conversation_info:{tenant_id:1}}})+
 frame('STREAM_CHUNK',{patch_op:[{patch_object:1,patch_value:{content_block:[{block_type:10000,block_id:'a',patch_type:1,content:{text_block:{text:'O'}}}]}}]})+
 frame('STREAM_CHUNK',{patch_op:[{patch_object:1,patch_value:{content_block:[{block_type:10000,block_id:'a',patch_type:1,content:{text_block:{text:'K'}}}]}}]})+
 frame('SSE_REPLY_END',{end_type:1})+frame('SSE_REPLY_END',{end_type:3});
 assert.deepEqual(await parseCompletion([wire]),{text:'OK',enterpriseTenantPresent:true});
 await assert.rejects(()=>parseCompletion([frame('SSE_REPLY_END',{end_type:3})]),/No verified completed/);
});
