import {randomUUID} from 'node:crypto';
import {streamCompletion} from './generate.js';
import {verificationDecision} from './sse.js';

// Preserve original message/conversation identity. The official sending path
// creates a new sending session (unique_key) when resending a failed message.
export async function* recoverCompletionStream({send,verify,body,signal,onEvent=()=>{},onAck}){
 let accepted=false,hasText=false;
 for(let attempt=0;attempt<2;attempt++){
  signal?.throwIfAborted();
  try{
   const response=await send(body,attempt);
   yield* streamCompletion(response.body,{onAck:async ack=>{accepted=true;await onAck?.(ack);},onText:()=>{hasText=true;}});
   return;
  }catch(error){
   const decision=verificationDecision(error);
   if(!decision||attempt||accepted||hasText)throw error;
   onEvent('verification-required');
   const result=await verify(decision);signal?.throwIfAborted();
   if(result?.verified!==true)throw Error('VERIFICATION_NOT_CONFIRMED');
   body.option={...body.option,unique_key:randomUUID()};
   body.ext={...body.ext,resend:'1'};
   onEvent('resuming');
  }
 }
}

export async function recoverCompletion(options){
 let result;for await(const event of recoverCompletionStream(options))if(event.type==='completed')result=event.result;
 return result;
}
