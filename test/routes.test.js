import test from 'node:test';import assert from 'node:assert/strict';import {apply} from '../index.js';
test('plugin adds only exact routes and never occupies the host API interceptor',async()=>{
 const routes=[];const connection={rpc:{intercept(){throw Error('Shared host interceptor must remain owned by DSH');}},fetch:{register(route){routes.push(route);return ()=>{};}}};
 const child={connection,effect:fn=>fn()};const ctx={llm:{registerAdapter:()=>()=>{}},effect:fn=>fn(),inject:(services,fn)=>{if(services.includes('connection'))fn(child);},emit(){}};
 apply(ctx);assert.deepEqual(routes.map(r=>r.path).sort(),['browser-input','browser-snapshot','browser-views','cancel','diagnostics','diagnostics-clear','login','logout','models','quiet-notice','quiet-notice-ack','quota','status','switch'].map(a=>'/api/feishu-subscription/'+a));
 for(const action of ['diagnostics','diagnostics-clear']){
 const route=routes.find(r=>r.path.endsWith('/'+action));
 const response=await route.fetch(new Request('http://localhost'+route.path,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({type:'client-request',rpcId:'diagnostic-test',method:'feishu-subscription/'+action,payload:{}})}));
 const result=await response.json();assert.equal(result.result.ok,true);assert.deepEqual(result.result.value.rows,[]);
 }
 assert.ok(routes.every(r=>r.path!=='/api/settings/describe'));
 const invalid=await routes[0].fetch(new Request('http://localhost'+routes[0].path,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({type:'client-request',rpcId:'test',method:'settings/describe'})}));assert.equal(invalid.status,400);
});
