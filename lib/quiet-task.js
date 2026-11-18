import {randomUUID} from 'node:crypto';

// The transport is pinned to the generation's credential snapshot, including
// cleanup after a user switches accounts or aborts the generation signal.
export function createQuietTask({post,request}){
  let conversationId,cleanupPromise;
  const localId=request.client_meta?.local_conversation_id;
  const fresh=request.client_meta?.conversation_id===''&&typeof localId==='string'&&localId.startsWith('local_');
  const im=async(route,cmd,key,payload,signal)=>{
    const result=await post(route,{cmd,sequence_id:randomUUID(),channel:2,version:'1',uplink_body:{[key]:payload}},signal);
    if(result.status_code!==0)throw Error('Conversation operation rejected');
    return result.downlink_body;
  };
  return {
    async prepare(signal){
      const result=await post('/alice/user/config/pull',{objects:[145],reason:1},signal);
      const item=result.data?.configs?.find(x=>x.object===145);
      if(result.code!==0||!item||!['0','1'].includes(item.value))throw Error('Desktop banner preference unavailable');
      if(item.value==='0')return;
      const saved=await post('/alice/user/config/sync',{configs:[{object:145,value:'0',version:item.version}]},signal);
      if(saved.code!==0)throw Error('Desktop banner preference rejected');
      const verified=await post('/alice/user/config/pull',{objects:[145],reason:3},signal);
      if(verified.code!==0||verified.data?.configs?.find(x=>x.object===145)?.value!=='0')throw Error('Desktop banner preference not saved');
    },
    acknowledge(ack){
      if(!fresh||!ack?.conversation_id||ack.local_conversation_id!==localId)throw Error('New task ownership not verified');
      if(conversationId&&conversationId!==ack.conversation_id)throw Error('New task identity changed');
      conversationId=ack.conversation_id;
    },
    requireOwnership(){if(!conversationId)throw Error('Completed task has no verified ownership ACK');},
    cleanup(){
      if(cleanupPromise)return cleanupPromise;
      if(!conversationId)return Promise.resolve();
      cleanupPromise=(async()=>{
        const signal=AbortSignal.timeout(8000);
        // Both operations are attempted: an archive failure must not skip read.
        const results=await Promise.allSettled([
          im('/im/conversation/batch_operate',1125,'batch_operate_conv_uplink_body',{operate_type:8,conversation_id_list:[conversationId]},signal).then(body=>{
            const result=body?.batch_operate_conv_downlink_body;
            if(result?.has_failure||result?.conversation_list?.find(x=>x.conversation_id===conversationId)?.success!==true)throw Error('Task archive not confirmed');
          }),
          im('/im/message/mark_conv_read',2100,'mark_conv_read_uplink_body',{conversation_id:conversationId,conversation_type:3},signal)
        ]);
        if(results.some(x=>x.status==='rejected'))throw Error('Task archive or read status not confirmed');
      })();
      return cleanupPromise;
    }
  };
}
