import {randomUUID} from 'node:crypto';
import {parseCompletion} from './generate.js';
import {verificationDecision} from './sse.js';

// Preserve original message/conversation identity. The official sending path
// creates a new sending session (unique_key) when resending a failed message.
export async function recoverCompletion({send,verify,body,signal,onEvent=()=>{}}){
 let accepted=false,hasText=false;
 for(let attempt=0;attempt<2;attempt++){
  signal?.throwIfAborted();
  try{
   const response=await send(body,attempt);
   return await parseCompletion(response.body,{onAck:()=>{accepted=true;},onText:()=>{hasText=true;}});
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
