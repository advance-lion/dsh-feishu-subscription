import {ToolProtocolError,decodeToolEnvelope,toolEnvelopeStart,heldToolPrefix} from './tool-protocol.js';

// Ordinary text streams immediately. A possible tool envelope stays private
// until its complete JSON can be validated; fragments must never execute.
export class ReplyStream{
 constructor(){this.text='';this.sent='';this.toolStart=-1;this.protocol=null;}
 emit(text){
  if(!text.startsWith(this.sent))throw Error('STREAM_OUTPUT_REVISED');
  if(!text.trim()&&!this.sent)return [];
  const delta=text.slice(this.sent.length),events=[];
  if(!delta)return events;
  if(!this.sent)events.push({type:'block-start',index:0,blockType:'text'});
  this.sent=text;events.push({type:'text-delta',index:0,text:delta});return events;
 }
 push(text){
  this.text=text;
  const at=toolEnvelopeStart(text);
  if(this.toolStart>=0&&at!==this.toolStart)throw Error('STREAM_OUTPUT_REVISED');
  if(at>=0){this.toolStart=at;return this.emit(text.slice(0,at));}
  return this.emit(text.slice(0,text.length-heldToolPrefix(text)));
 }
 finish(tools){
  if(this.toolStart<0){
   if(heldToolPrefix(this.text)>=5)throw new ToolProtocolError('模型返回了不完整的 DSH 工具请求。','TOOL_PROTOCOL_INCOMPLETE');
   const tail=this.emit(this.text);
   if(!this.sent)throw Error('EMPTY_ASSISTANT_REPLY');
   return [...tail,{type:'block-end',index:0,block:{type:'text',text:this.sent}}];
  }
  const {calls,closure}=decodeToolEnvelope(this.text.slice(this.toolStart),tools);
  this.protocol={closure,callCount:calls.length,prefixCharacters:this.sent.length};
  const prefix=this.sent?[{type:'block-end',index:0,block:{type:'text',text:this.sent}}]:[];
  return [...prefix,...calls.flatMap((block,i)=>{const index=i+(this.sent?1:0);return [
   {type:'block-start',index,blockType:block.type},
   {type:'tool-call-delta',index,id:block.id,name:block.name,argumentsDelta:block.arguments},
   {type:'block-end',index,block}
  ];})];
 }
}
