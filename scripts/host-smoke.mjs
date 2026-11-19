import {spawn} from 'node:child_process';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
const data=await mkdtemp(path.join(tmpdir(),'feishu-host-smoke-'));
const child=spawn(process.execPath,[process.argv[2],'--profile',process.argv[3]||'cross-platform','--no-open','--host','127.0.0.1','--port','0'],{windowsHide:true,env:{...process.env,LOCALAPPDATA:data,XDG_DATA_HOME:data},stdio:['ignore','pipe','pipe']});
let output='',exited=false;child.stdout.on('data',b=>{output+=b;});child.stderr.on('data',b=>{output+=b;});child.on('exit',()=>{exited=true;});
try{
 const deadline=Date.now()+60000;let address;
 while(!(address=output.match(/http:\/\/127\.0\.0\.1:\d+\/\?token=[A-Za-z0-9_-]+/))){if(exited||Date.now()>deadline)throw Error('Official DSH Web did not start');await new Promise(r=>setTimeout(r,100));}
 assert.doesNotMatch(output,/failed to import|did not activate/i);
 const url=new URL(address[0]),base=url.origin;
 const auth=await fetch(url,{redirect:'manual'}),cookie=auth.headers.getSetCookie().map(x=>x.split(';')[0]).join('; ');
 assert.ok(cookie,'Host must issue authenticated session');
 for(const action of ['status','browser-views','diagnostics']){
  const method='feishu-subscription/'+action,body=JSON.stringify({type:'client-request',method,rpcId:'smoke',payload:{}});
  const response=await fetch(base+'/api/'+method,{method:'POST',headers:{'Content-Type':'application/json',Origin:base,Cookie:cookie},body});
  const result=(await response.json()).result;assert.equal(result.ok,true);
  if(action==='status'){assert.equal(result.value.version,'0.4.0');assert.deepEqual(result.value.accounts,[]);}
  if(action==='browser-views')assert.deepEqual(result.value,[]);
  const foreign=await fetch(base+'/api/'+method,{method:'POST',headers:{'Content-Type':'application/json',Origin:'https://untrusted.example',Cookie:cookie},body});
  assert.ok([401,403].includes(foreign.status),'Host must reject foreign browser origin');
  const unauth=await fetch(base+'/api/'+method,{method:'POST',headers:{'Content-Type':'application/json',Origin:base},body});
  assert.ok([401,403].includes(unauth.status),'Host must require authentication');
 }
 console.log('Actual DSH host loaded v0.4.0; account, diagnostics and browser-view RPC work; unauthenticated and foreign-origin requests rejected.');
}finally{
 child.kill();await new Promise(resolve=>{if(exited)return resolve();child.once('exit',resolve);setTimeout(resolve,5000).unref();});
 await rm(data,{recursive:true,force:true,maxRetries:3});
}
