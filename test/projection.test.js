import test from 'node:test';
import assert from 'node:assert/strict';
import {projectRequest,parseToolReply} from '../lib/projection.js';
test('history projection preserves roles and actual host tool results',()=>{
 const prompt=projectRequest({system:'system rule',messages:[{role:'user',content:[{type:'text',text:'read fixture'}]},{role:'assistant',content:[{type:'tool-call',id:'a',name:'read',arguments:'{}'}]},{role:'tool',toolCallId:'a',content:[{type:'text',text:'nonce-unique'}]}],tools:[{name:'read',description:'read only',parameters:{type:'object'}}]});
 assert.match(prompt,/nonce-unique/);assert.match(prompt,/"toolCallId":"a"/);assert.match(prompt,/system rule/);assert.match(prompt,/"available_tools":\[/);
 assert.throws(()=>projectRequest({messages:[{role:'user',content:[{type:'image'}]}]}),/文本/);
});
test('only complete valid allowlisted tool envelopes become host calls',()=>{
 const tool={name:'read',parameters:{type:'object'}};
 const result=parseToolReply('<dsh_tool_calls>{"calls":[{"name":"read","arguments":{"path":"fixture"}}]}</dsh_tool_calls>',[tool]);
 assert.equal(result[0].type,'tool-call');assert.equal(result[0].name,'read');assert.equal(JSON.parse(result[0].arguments).path,'fixture');
 assert.throws(()=>parseToolReply('<dsh_tool_calls>{"calls":[{"name":"delete","arguments":{}}]}</dsh_tool_calls>',[tool]),/未提供/);
 assert.throws(()=>parseToolReply('<dsh_tool_calls>{"calls":[]}',[tool]),/不完整/);
 assert.deepEqual(parseToolReply('normal answer',[tool]),[{type:'text',text:'normal answer'}]);
});
