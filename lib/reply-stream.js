import {parseToolReply} from './projection.js';

// Ordinary text streams immediately. A possible tool envelope stays private
// until its complete JSON can be validated; fragments must never execute.
export class ReplyStream{
 constructor(){this.text='';this.sent='';this.mode='pending';}
 push(text){
  this.text=text;
  if(this.mode==='pending'){
   const value=text.trimStart(),tag='<dsh_tool_calls>';
   if(!value||tag.startsWith(value))return [];
   this.mode=value.startsWith(tag)?'tools':'text';
  }
  if(this.mode==='tools')return [];
  if(!text.startsWith(this.sent))throw Error('STREAM_OUTPUT_REVISED');
  const delta=text.slice(this.sent.length),events=[];
  if(!delta)return events;
  if(!this.sent)events.push({type:'block-start',index:0,blockType:'text'});
  this.sent=text;events.push({type:'text-delta',index:0,text:delta});return events;
 }
 finish(tools){
  if(this.mode==='text')return [{type:'block-end',index:0,block:{type:'text',text:this.text}}];
  return parseToolReply(this.text,tools).flatMap((block,index)=>[
   {type:'block-start',index,blockType:block.type},
   block.type==='text'?{type:'text-delta',index,text:block.text}:{type:'tool-call-delta',index,id:block.id,name:block.name,argumentsDelta:block.arguments},
   {type:'block-end',index,block}
  ]);
 }
}
