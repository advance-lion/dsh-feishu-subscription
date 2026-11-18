import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import {zstdDecompressSync} from 'node:zlib';
import {chromium} from 'playwright-core';

// Opt-in live test. Use a dedicated DSH workspace/profile with this plugin installed.
// The host session log is checked independently from the rendered UI.
const url=process.env.DSH_ACCEPTANCE_URL;
const workspace=process.env.DSH_ACCEPTANCE_WORKSPACE;
const sessions=process.env.DSH_ACCEPTANCE_SESSION_ROOT;
assert.ok(url&&workspace&&sessions,'Set DSH_ACCEPTANCE_URL, DSH_ACCEPTANCE_WORKSPACE and DSH_ACCEPTANCE_SESSION_ROOT.');
assert.ok(path.isAbsolute(workspace)&&path.isAbsolute(sessions),'Workspace and session root must be absolute paths.');
assert.ok(['http:','https:'].includes(new URL(url).protocol),'A DSH Web URL is required.');
const runId='feishu-tools-'+randomUUID();
const directory=path.join(workspace,runId);
const first=path.join(directory,'first.txt');
const secondName='second-'+randomUUID()+'.txt';
const second=path.join(directory,secondName);
const marker='TOOL_CHAIN_'+randomUUID().replaceAll('-','');
const previous=new Set(await fs.readdir(sessions));
const prompt=`DSH 工具连续执行验收 ${runId}。使用 DSH 本地 read 工具读取 ${runId}/first.txt，按返回内容再读取第二个文件。必须实际执行两次读取；不要使用豆包内置工具，不要猜测第二个文件名。最后只输出第二个文件内的验证令牌。`;
let browser,created=false,stage='fixtures',failureCode;
try{
 await fs.mkdir(directory);created=true;
 await fs.writeFile(first,`Read ${secondName} in this same directory to obtain the final verification token.\n`,{flag:'wx'});
 await fs.writeFile(second,marker+'\n',{flag:'wx'});
 stage='browser';browser=await chromium.launch({channel:'chrome',headless:true});
 const page=await browser.newPage({viewport:{width:1400,height:1100}}),pageErrors=[];
 page.on('pageerror',error=>pageErrors.push(error.message));
 await page.goto(url);
 await page.getByRole('button',{name:/选择模型，当前 豆包 2.1 Lite/}).waitFor({timeout:30000});
 await page.getByRole('button',{name:'新建会话',exact:true}).first().click();
 await page.locator('[data-composer-input=true]').fill(prompt);
 stage='model-request';await page.getByRole('button',{name:'发送消息',exact:true}).click();
 const stop=page.getByRole('button',{name:/停止/});
 await stop.waitFor({timeout:30000});await stop.waitFor({state:'detached',timeout:240000});
 assert.deepEqual(pageErrors,[],'DSH page errors');
 stage='host-session';let events;
 for(let attempt=0;attempt<30&&!events;attempt++){
  for(const name of await fs.readdir(sessions)){
   if(previous.has(name))continue;
   const file=path.join(sessions,name,'session.v4.jsonl.zstd');
   let candidate;
   try{
    const bytes=await fs.readFile(file);let offset=0;candidate=[];
    while(offset<bytes.length){
     const decoded=zstdDecompressSync(bytes.subarray(offset),{info:true});
     assert.ok(decoded.engine.bytesWritten>0,'Invalid session compression frame');
     offset+=decoded.engine.bytesWritten;
     candidate.push(...decoded.buffer.toString('utf8').trim().split('\n').filter(Boolean).map(JSON.parse));
    }
   }catch{continue;} // A host append may still be in flight.
   if(JSON.stringify(candidate).includes(runId)&&candidate.some(e=>e.type==='turn/end'))events=candidate;
  }
  if(!events)await new Promise(resolve=>setTimeout(resolve,500));
 }
 assert.ok(events,'No completed new host session matching this unique probe');
 const ended=events.findLast(e=>e.type==='turn/end');
 if(ended.data.reason.kind==='error'){
  const code=ended.data.reason.error?.code;
  if(['RATE_LIMIT','AUTH','SHARK_BLOCK','FEISHU_REQUEST_FAILED'].includes(code))failureCode=code;
 }
 assert.equal(ended.data.reason.kind,'completed','DSH turn failed before tool acceptance completed');
 const assistant=events.filter(e=>e.type==='assistant/message');
 const calls=assistant.flatMap(e=>e.data.message.content.filter(b=>b.type==='tool-call').map(b=>({...b,seq:e.seq})));
 const results=events.filter(e=>e.type==='tool/result');
 assert.equal(calls.length,2,'Expected two actual host tool calls');
 assert.deepEqual(calls.map(c=>c.name),['read','read']);
 assert.equal(results.length,2);
 for(let i=0;i<2;i++){
  assert.equal(results[i].data.message.toolCallId,calls[i].id);
  assert.equal(results[i].data.message.isError,false);
  assert.ok(results[i].seq>calls[i].seq);
 }
 assert.ok(results[0].seq<calls[1].seq,'Second call must follow the first result');
 assert.ok(JSON.stringify(results[0].data.message.content).includes(secondName));
 assert.ok(JSON.stringify(results[1].data.message.content).includes(marker));
 const final=assistant.at(-1).data.message;
 assert.equal(final.source.provider,'feishu-subscription');
 assert.equal(final.source.model,'seed-lite-7b');
 assert.equal(final.content.map(b=>b.type==='text'?b.text:'').join('').trim(),marker);
 assert.ok(await page.getByText(marker,{exact:true}).isVisible(),'Final token must be rendered in DSH');
 const report={passed:true,pluginVersion:JSON.parse(await fs.readFile(new URL('../package.json',import.meta.url),'utf8')).version,model:final.source.model,hostToolCalls:2,hostToolResults:2,orderedResults:true,finalTokenMatches:true,pageErrors};
 await fs.mkdir(new URL('../.acceptance/',import.meta.url),{recursive:true});
 await fs.writeFile(new URL('../.acceptance/tools.json',import.meta.url),JSON.stringify(report,null,2)+'\n');
 console.log(JSON.stringify(report));
}catch(error){
 // Browser diagnostics can contain the token-bearing URL; keep failure output fixed.
 const report={passed:false,stage,error:error.name,...(failureCode?{code:failureCode}:{}),message:'Check the dedicated DSH session and server logs.'};
 await fs.mkdir(new URL('../.acceptance/',import.meta.url),{recursive:true});
 await fs.writeFile(new URL('../.acceptance/tools.json',import.meta.url),JSON.stringify(report,null,2)+'\n');
 console.error(JSON.stringify(report));
 process.exitCode=1;
}finally{
 await browser?.close();
 if(created){
  // Remove only the two known local fixtures, never cloud conversations or session logs.
  await fs.unlink(first).catch(()=>{});await fs.unlink(second).catch(()=>{});await fs.rmdir(directory).catch(()=>{});
 }
}
