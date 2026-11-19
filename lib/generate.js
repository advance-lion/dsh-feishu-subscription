import {randomUUID} from 'node:crypto';
import {createClient} from './client.js';
import {listModels} from './catalog.js';
import {decodeSse} from './sse.js';

// General-task assistant identifier observed in the official client request.
const WORK_BOT_ID='7338286299411103781';
export function buildRequest(model,prompt){
  if(model.modeId!=='3'||model.agentMode!==1)throw new Error('A work-mode model entry is required.');
  if(typeof prompt!=='string'||!prompt.trim())throw new Error('A nonempty prompt is required.');
  const id=randomUUID(),now=Date.now();
  const runtime={runtime_type:1,folder_name:'',device_name:'',workspace:'',local_app_id:'',local_device_id:''};
  const task={action:0,thread_local_message_id:[id],project_id:'',runtime_type:1,agent_task_param:runtime,server_do_compare:true};
  const init={project_id:'',need_ack_conversation:true};
  return {
    client_meta:{local_conversation_id:'local_'+now+String(Math.floor(Math.random()*100000)),conversation_id:'',bot_id:WORK_BOT_ID,last_section_id:'',last_message_index:null,local_permissions:[]},
    messages:[{local_message_id:id,content_block:[{block_type:10000,content:{text_block:{text:prompt,icon_url:'',icon_url_dark:'',summary:''},pc_event_block:''},block_id:randomUUID(),parent_id:'',meta_info:[],extra_info:{},append_fields:[]}],message_status:0}],
    option:{send_message_scene:'',create_time_ms:now,collect_id:'',is_audio:false,answer_with_suggest:false,agent_mode:1,tts_switch:false,need_deep_think:9,click_clear_context:false,from_suggest:false,is_regen:false,is_replace:false,is_from_click_option:false,is_from_click_softlink:false,disable_sse_cache:false,select_text_action:'',is_select_text:false,resend_for_regen:false,scene_type:0,unique_key:randomUUID(),start_seq:0,need_create_conversation:true,conversation_init_option:init,
      conversation_init_ext:{agent_task_param:JSON.stringify(runtime),model_item_key:model.id,reasoning_effort:'3',mode_id:'3'},regen_query_id:[],edit_query_id:[],regen_instruction:'',no_replace_for_regen:false,message_from:0,shared_app_name:'',shared_app_id:'',sse_recv_event_options:{support_chunk_delta:true},support_lazy_fetch_stream:true,is_ai_playground:false,is_old_user:false,general_task_param:task,recovery_option:{is_recovery:false,req_create_time_sec:Math.floor(now/1000),append_sse_event_scene:0},message_storage_type:0,related_deleted_message_ids:{},connector_info_list:[],
      model_config:{model_item_key:model.id,model_extra_params:model.extraParams,reasoning_effort:3},aggregate_params:{mention_skill_list:'[]',mention_plugin_list:'[]',mention_ext:'[{}]',conversation_mode:'',mode_id:'3',model_item_key:model.id,agent_mode:'1',reasoning_effort:'3',provider_id:''}},
    user_context:[],ext:{general_task_param:JSON.stringify(task),use_deep_think:'9',agent_mode:'1',conversation_init_option:JSON.stringify(init),sub_conv_firstmet_type:'1',collection_id:'',is_finish:'1',commerce_credit_config_enable:'0'}
  };
}

export async function parseCompletion(chunks,{onAck,onText}={}){
  const blocks=new Map(),hidden=new Set();let messageFinished=false,streamFinished=false,enterpriseTenantPresent=false,deltaTemplate;
  function update(items){for(const block of items||[]){
    if(block.control_info?.is_visible===false||block.block_type===10040)hidden.add(block.block_id);
    if(block.parent_id&&hidden.has(block.parent_id))hidden.add(block.block_id);
    if(block.block_type!==10000||hidden.has(block.block_id))continue;
    if(block.patch_type===3){blocks.delete(block.block_id);continue;}
    const text=block.content?.text_block?.text;if(typeof text!=='string')continue;
    const previous=blocks.get(block.block_id)||'';blocks.set(block.block_id,block.patch_type===2?text:previous+text);if(text)onText?.();
  }}
  for await(const {event,data} of decodeSse(chunks)){
    if(event==='SSE_ACK'){enterpriseTenantPresent=!!data.ack_client_meta?.conversation_info?.tenant_id;await onAck?.(data.ack_client_meta);}
    else if(event==='STREAM_MSG_NOTIFY')update(data.content?.content_block);
    else if(event==='STREAM_CHUNK'){
      const patches=data.patch_op||[];
      if(patches.length===1&&patches[0].patch_object===1&&patches[0].patch_value?.content_block?.length===1)deltaTemplate=patches[0].patch_value.content_block[0];
      for(const patch of data.patch_op||[])if(patch.patch_object===1)update(patch.patch_value?.content_block);
    }
    else if(event==='CHUNK_DELTA'){
      if(!deltaTemplate)throw new Error('CHUNK_DELTA arrived without its required block template.');
      const key=Object.keys(deltaTemplate.content||{})[0];
      if(!key)throw new Error('CHUNK_DELTA has no content target.');
      update([{...deltaTemplate,patch_type:1,content:{[key]:data}}]);
    }
    else if(event==='SSE_REPLY_END'){
      if(data.end_type===1||data.end_type===2)messageFinished=true;
      if(data.end_type===3)streamFinished=true;
    }
  }
  const text=[...blocks.values()].join('\n');
  if(!messageFinished||!streamFinished||!text)throw new Error('No verified completed assistant text in the provider response.');
  return {text,enterpriseTenantPresent};
}

export async function complete({modelId,prompt}){
  const model=(await listModels()).find(m=>m.id===modelId);
  if(!model)throw new Error('Selected model is not available in the authenticated account catalog.');
  const client=await createClient();
  try{
    const response=await client.raw('/chat/completion',buildRequest(model,prompt));
    if(!response.ok()||!response.headers()['content-type']?.startsWith('text/event-stream'))throw new Error('Provider did not return a successful SSE response.');
    const result=await parseCompletion([await response.body()]);
    return {...result,selectedModel:model.id,generationVerified:true,enterpriseBillingVerified:false};
  }finally{await client.close()}
}
