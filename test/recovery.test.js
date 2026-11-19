import test from 'node:test';import assert from 'node:assert/strict';
import {recoverCompletion} from '../lib/verification-recovery.js';
const frame=(event,data)=>`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
const challenge=frame('STREAM_ERROR',{error_code:710022004,extra:{decision:{code:10000,type:'verify',detail:'private'}}});
const text=frame('STREAM_CHUNK',{patch_op:[{patch_object:1,patch_value:{content_block:[{block_type:10000,block_id:'b',content:{text_block:{text:'OK'}}}]}}]});
const done=text+frame('SSE_REPLY_END',{end_type:1})+frame('SSE_REPLY_END',{end_type:3});
test('verified resend creates new sending session, preserves original message and timestamp',async()=>{
 const body={client_meta:{local_conversation_id:'owned'},messages:[{local_message_id:'message'}],option:{unique_key:'first',create_time_ms:123},ext:{}};let calls=0,release;const attempts=[];
 const pending=recoverCompletion({body,send:async value=>{attempts.push(structuredClone(value));return new Response(++calls===1?challenge:done);},verify:()=>new Promise(resolve=>{release=resolve;})});
 while(!release)await new Promise(resolve=>setImmediate(resolve));assert.equal(calls,1);release({verified:true});assert.equal((await pending).text,'OK');
 assert.equal(calls,2);assert.notEqual(attempts[1].option.unique_key,'first');assert.deepEqual(attempts[1].messages,attempts[0].messages);assert.deepEqual(attempts[1].client_meta,attempts[0].client_meta);assert.equal(attempts[1].option.create_time_ms,123);assert.equal(attempts[1].ext.resend,'1');
});
test('cancel, second challenge, accepted or partial responses never loop or duplicate',async()=>{
 for(const mode of ['cancel','repeat','ack','text']){let calls=0,verifyCalls=0;
 await assert.rejects(()=>recoverCompletion({body:{option:{},ext:{}},send:async()=>{calls++;return new Response((mode==='ack'?frame('SSE_ACK',{ack_client_meta:{conversation_id:'accepted'}}):mode==='text'?text:'')+challenge);},verify:async()=>{verifyCalls++;if(mode==='cancel')throw Error('cancelled');return {verified:true};}}));
 assert.equal(calls,mode==='repeat'?2:1);assert.equal(verifyCalls,['ack','text'].includes(mode)?0:1);
 }
});
