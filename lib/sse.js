export class SubscriptionStreamError extends Error {
  constructor(code,message,extra){super(message||`Doubao stream error ${code}`);this.name='SubscriptionStreamError';this.code=code;this.kind=code===710022002?'SHARK_BLOCK':'PROVIDER_ERROR';this.retryable=false;
    try{const parsed=typeof extra==='string'?JSON.parse(extra):extra;const decision=typeof parsed?.decision==='string'?JSON.parse(parsed.decision):parsed?.decision;this.verificationRequired=decision?.type==='verify';}catch{}
  }
}
// Decode framing independently from transport. HTTP 200 alone is never success.
export async function* decodeSse(chunks){
  const decoder=new TextDecoder();let buffer='';
  function frame(text){
    const data=[];let event='message';
    for(const line of text.split(/\r?\n/)){
      if(line.startsWith('event:'))event=line.slice(6).trim();
      else if(line.startsWith('data:'))data.push(line.slice(5).replace(/^ /,''));
    }
    if(!data.length)return null;
    const value=JSON.parse(data.join('\n'));
    if(event==='STREAM_ERROR'||event==='STREAM_MSG_ERROR')throw new SubscriptionStreamError(value.error_code,value.error_msg,value.extra);
    return {event,data:value};
  }
  for await(const bytes of chunks){
    buffer+=typeof bytes==='string'?bytes:decoder.decode(bytes,{stream:true});
    let match;
    while((match=/\r?\n\r?\n/.exec(buffer))){
      const result=frame(buffer.slice(0,match.index));buffer=buffer.slice(match.index+match[0].length);
      if(result)yield result;
    }
  }
  buffer+=decoder.decode();
  if(buffer.trim())throw new Error('Doubao stream ended with an incomplete SSE frame.');
}
