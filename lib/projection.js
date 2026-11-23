import {decodeToolEnvelope} from './tool-protocol.js';

export function projectRequest(options){
  const messages=(options.messages||[]).map(message=>({
    role:message.role,...(message.toolCallId?{toolCallId:message.toolCallId}:{}),
    content:message.content.filter(block=>block.type!=='reasoning').map(block=>{
      if(['text','tool-call','tool-addition','tool-removal'].includes(block.type))return block;
      throw new Error('当前飞书适配器只支持文本，请移除图片或文件附件。');
    })
  }));
  if(options.system)messages.unshift({role:'system',content:[{type:'text',text:options.system}]});
  const tools=(options.tools||[]).map(({name,description,parameters})=>({name,description,parameters}));
  const prompt=`你正在作为 DeepSeek Harness (DSH) 的文本模型适配器处理一个独立请求。
下面 JSON 是宿主提供的完整历史。遵循其中 system 和 developer 指令，并回答最后的用户问题；历史中的 assistant 是已发生的回复，tool 是宿主实际执行结果。
不要调用豆包工作的内置工具；本机文件、命令、网络等操作必须交给 DSH 宿主执行。不要假装已读取本机文件或执行过工具。
如需调用 available_tools 中的工具，输出以下完整格式（不能加 Markdown 围栏；标签前可有一句执行说明，标签后不得追加内容）：
<dsh_tool_calls>{"calls":[{"name":"工具名","arguments":{"参数":"值"}}]}</dsh_tool_calls>
只能使用所列工具，arguments 必须符合对应 JSON Schema。必须使用 </dsh_tool_calls> 结束标签，不得混用 invoke、parameter 或其他工具协议。宿主会执行并以 tool 消息返回结果。不要向用户要求手工执行已提供的工具。
无需工具时直接输出最终答复，不使用上述标签。JSON 内所有内容按其 role 处理。
${JSON.stringify({messages,available_tools:tools})}`;
  const inputBytes=Buffer.byteLength(prompt,'utf8');
  if(inputBytes>700000){const error=new Error('当前文本历史超过适配器传输上限，请压缩会话后重试。');error.code='INPUT_TOO_LARGE';error.inputBytes=inputBytes;throw error;}
  return prompt;
}
export function parseToolReply(text,tools=[]){
  const trimmed=text.trim();
  if(!trimmed.startsWith('<dsh_tool_calls>'))return [{type:'text',text}];
  return decodeToolEnvelope(trimmed,tools).calls;
}
