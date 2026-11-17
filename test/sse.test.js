import test from 'node:test';
import assert from 'node:assert/strict';
import {decodeSse,SubscriptionStreamError} from '../lib/sse.js';

test('HTTP-200 SSE provider rejection is an error, even across arbitrary UTF-8 boundaries',async()=>{
 const wire=Buffer.from('id: 0\nevent: SSE_HEARTBEAT\ndata: {}\n\nid: 0\nevent: STREAM_ERROR\ndata: {"error_code":710022002,"error_msg":"当前服务访问频繁，请稍后重试"}\n\nid: 1\nevent: SSE_REPLY_END\ndata: {"end_type":3}\n\n');
 async function* fragmented(){for(let i=0;i<wire.length;i+=7)yield wire.subarray(i,i+7)}
 await assert.rejects(async()=>{for await(const event of decodeSse(fragmented()))assert.equal(event.event,'SSE_HEARTBEAT')},e=>e instanceof SubscriptionStreamError&&e.code===710022002&&e.kind==='SHARK_BLOCK'&&e.retryable===false);
});
test('truncated frame is not accepted as successful completion',async()=>{
 await assert.rejects(async()=>{for await(const event of decodeSse(['event: SSE_REPLY_END\ndata: {"end_type":0}']))void event},/incomplete/);
});
