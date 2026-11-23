import test from 'node:test';import assert from 'node:assert/strict';import http from 'node:http';
import {completionTransport} from '../lib/completion-transport.js';
import {requestFailure,errorIdentity} from '../lib/request-errors.js';
import {DiagnosticLog,errorCategory} from '../lib/diagnostics.js';
test('actual HTTP stream outlives timeout budget while each new chunk arrives promptly',async()=>{
 const server=http.createServer((req,res)=>{res.writeHead(200,{'content-type':'text/event-stream'});let n=0;res.write('a');const timer=setInterval(()=>{res.write('b');if(++n===6){clearInterval(timer);res.end();}},30);res.on('close',()=>clearInterval(timer));});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 try{const r=await completionTransport(`http://127.0.0.1:${server.address().port}`,{},{headerTimeoutMs:1000,idleTimeoutMs:100});let text='';for await(const b of r.body)text+=Buffer.from(b);assert.equal(text,'abbbbbb');}
 finally{server.closeAllConnections();await new Promise(r=>server.close(r));}
});
test('header wait and stalled body have distinct errors, external abort remains cancellation',async()=>{
 const server=http.createServer((req,res)=>{if(req.url==='/stall'){res.writeHead(200);res.write('a');}});await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const url=`http://127.0.0.1:${server.address().port}`;
 try{
  await assert.rejects(completionTransport(url+'/headers',{},{headerTimeoutMs:50}),{code:'RESPONSE_HEADERS_TIMEOUT'});
  const r=await completionTransport(url+'/stall',{},{idleTimeoutMs:50});await assert.rejects(async()=>{for await(const b of r.body){}},{code:'RESPONSE_IDLE_TIMEOUT'});
  const c=new AbortController(),pending=completionTransport(url+'/headers',{signal:c.signal});c.abort();await assert.rejects(pending,e=>e.name==='AbortError');
 }finally{server.closeAllConnections();await new Promise(r=>server.close(r));}
});
test('network and stream errors never imply authentication and diagnostics retain only safe identity',()=>{
 for(const e of [{code:'SSE_COMPLETION_INCOMPLETE'},{code:'RESPONSE_IDLE_TIMEOUT'},new TypeError('private url/cookie',{cause:{cause:{code:'ECONNRESET'}}}),{code:710099999}])assert.notEqual(requestFailure(e).code,'AUTH');
 assert.equal(requestFailure({code:'AUTH_SESSION_INVALID'}).code,'AUTH');assert.equal(errorCategory({code:'SSE_FRAME_INVALID'}),'stream-incomplete');
 const error=new TypeError('private payload',{cause:{cause:{code:'ENOTFOUND'}}});assert.equal(errorIdentity(error).transportCode,'ENOTFOUND');
 const log=new DiagnosticLog();log.add({...errorIdentity(error),category:errorCategory(error),messageFinished:false,streamFinished:true,hasText:true,message:error.message});
 assert.equal(log.list().rows[0].transportCode,'ENOTFOUND');assert.doesNotMatch(JSON.stringify(log.list()),/private/);
});
