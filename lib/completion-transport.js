// Bound connection/header waits and idle reads separately. A healthy long
// stream must not be aborted merely because total generation exceeds 3 min.
export async function completionTransport(url,init,{headerTimeoutMs=30000,idleTimeoutMs=180000}={}){
 const controller=new AbortController(),signal=AbortSignal.any([controller.signal,...(init.signal?[init.signal]:[])]);
 let timeoutCode,timer;
 const clear=()=>clearTimeout(timer);
 const arm=code=>{clear();timer=setTimeout(()=>{timeoutCode=code;controller.abort();},code==='RESPONSE_HEADERS_TIMEOUT'?headerTimeoutMs:idleTimeoutMs);timer.unref?.();};
 const failure=error=>timeoutCode?Object.assign(new Error('Feishu response timed out.'),{code:timeoutCode}):error;
 let response;
 arm('RESPONSE_HEADERS_TIMEOUT');
 try{response=await fetch(url,{...init,signal});}catch(error){throw failure(error);}finally{clear();}
 const reader=response.body?.getReader();
 const cancel=async()=>{clear();controller.abort();await reader?.cancel().catch(()=>{});};
 const body={cancel,async *[Symbol.asyncIterator](){
  try{
   if(!reader)return;
   while(true){
    signal.throwIfAborted();arm('RESPONSE_IDLE_TIMEOUT');
    let part;try{part=await reader.read();}catch(error){throw failure(error);}finally{clear();}
    if(timeoutCode)throw failure();
    if(part.done)return;
    yield part.value;
   }
  }finally{await cancel();}
 }};
 return {ok:response.ok,status:response.status,headers:response.headers,body};
}
