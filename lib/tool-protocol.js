import {randomUUID} from 'node:crypto';
export const TOOL_TAG='<dsh_tool_calls>';
export class ToolProtocolError extends Error{
 constructor(message,code='TOOL_PROTOCOL_INVALID'){super(message);this.name='ToolProtocolError';this.code=code;}
}
// A documented example in Markdown is text, never an executable tool request.
function literalAt(text,at){
 let fence=null,inline=0;
 for(let i=0;i<at;){
  const c=text[i],lineStart=i===0||text.slice(text.lastIndexOf('\n',i-1)+1,i).trim()==='';
  if(c==='`'||c==='~'){
   let n=1;while(text[i+n]===c)n++;
   if(fence){if(lineStart&&c===fence.c&&n>=fence.n)fence=null;}
   else if(!inline&&lineStart&&n>=3)fence={c,n};
   else if(c==='`'){if(inline===n)inline=0;else if(!inline)inline=n;}
   i+=n;continue;
  }
  if(!fence&&c==='\\'){i+=2;continue;}i++;
 }
 let slashes=0;for(let i=at-1;i>=0&&text[i]==='\\';i--)slashes++;
 return !!fence||!!inline||slashes%2===1;
}
export function toolEnvelopeStart(text){
 for(let at=text.indexOf(TOOL_TAG);at>=0;at=text.indexOf(TOOL_TAG,at+1))if(!literalAt(text,at))return at;
 return -1;
}
export function heldToolPrefix(text){
 for(let n=Math.min(TOOL_TAG.length-1,text.length);n>0;n--)if(text.endsWith(TOOL_TAG.slice(0,n))&&!literalAt(text,text.length-n))return n;
 return 0;
}
export function decodeToolEnvelope(text,tools=[]){
 const value=text.trim();
 let match=value.match(/^<dsh_tool_calls>([\s\S]*)<\/dsh_tool_calls>$/),closure='standard';
 // Compatibility for the exact complete closer seen in real Kimi replies.
 // No JSON repair, guessed braces, missing-close acceptance or partial execution.
 if(!match){match=value.match(/^<dsh_tool_calls>([\s\S]*)<\/｜｜ parameter>\s*<\/｜｜ invoke>\s*<\/｜｜ calls>$/u);closure='legacy';}
 if(!match)throw new ToolProtocolError('模型返回了不完整或带额外内容的 DSH 工具请求。','TOOL_PROTOCOL_INCOMPLETE');
 let body;try{body=JSON.parse(match[1]);}catch{throw new ToolProtocolError('模型返回的 DSH 工具请求不是有效 JSON。');}
 if(!Array.isArray(body?.calls)||!body.calls.length||body.calls.length>8)throw new ToolProtocolError('模型返回的工具调用数量无效。');
 const calls=body.calls.map(call=>{
  if(!call||!tools.some(tool=>tool.name===call.name)||!call.arguments||typeof call.arguments!=='object'||Array.isArray(call.arguments))throw new ToolProtocolError('模型请求了未提供的工具或无效参数。');
  return {type:'tool-call',id:'feishu_'+randomUUID(),name:call.name,arguments:JSON.stringify(call.arguments)};
 });
 return {calls,closure};
}
