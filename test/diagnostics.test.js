import test from 'node:test';
import assert from 'node:assert/strict';
import {DiagnosticLog,errorCategory} from '../lib/diagnostics.js';
import {decodeSse} from '../lib/sse.js';
test('diagnostic ring is bounded, isolated and excludes raw sensitive fields',()=>{
 const log=new DiagnosticLog(2),requestId=log.requestId();
 for(let i=0;i<3;i++)log.add({requestId,stage:'request',event:'response',httpStatus:200,upstreamCode:710020702,model:'seed-lite-7b',prompt:'secret-prompt',cookie:'secret-cookie',message:'secret-message',extra:{detail:'secret-challenge'}});
 const result=log.list();assert.equal(result.rows.length,2);assert.equal(result.rows[0].upstreamCode,710020702);assert.ok(!JSON.stringify(result).includes('secret'));
 result.rows[0].httpStatus=500;assert.equal(log.list().rows[0].httpStatus,200);assert.equal(log.clear().rows.length,0);
});
test('verification verdict is logged without retaining the challenge and does not imply frequency limit',async()=>{
 const extra={decision:JSON.stringify({type:'verify',code:10000,detail:'private-challenge'})};
 await assert.rejects(async()=>{for await(const frame of decodeSse([`event: STREAM_ERROR\ndata: ${JSON.stringify({error_code:710022004,error_msg:'rate limited',extra})}\n\n`])){}},error=>errorCategory(error)==='verification-required'&&!JSON.stringify(error).includes('private-challenge'));
 assert.equal(errorCategory({code:710020702}),'upstream-system-error');assert.equal(errorCategory({cause:{code:'UND_ERR_SOCKET'}}),'connection-closed');
});
