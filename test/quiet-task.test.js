import test from 'node:test';
import assert from 'node:assert/strict';
import {createQuietTask} from '../lib/quiet-task.js';
const request={client_meta:{conversation_id:'',local_conversation_id:'local_owned'}};
test('only matching fresh request ACK can authorize archive; cleanup is idempotent',async()=>{
 const calls=[];
 const task=createQuietTask({request,post:async(route,body,signal)=>{
  calls.push({route,body,signal});
  return {status_code:0,downlink_body:{batch_operate_conv_downlink_body:{conversation_list:[{conversation_id:'owned',success:true}]}}};
 }});
 await task.cleanup();assert.equal(calls.length,0);
 assert.throws(()=>task.acknowledge({conversation_id:'user-task',local_conversation_id:'other'}));
 assert.throws(()=>task.requireOwnership());
 task.acknowledge({conversation_id:'owned',local_conversation_id:'local_owned'});
 assert.throws(()=>task.acknowledge({conversation_id:'different',local_conversation_id:'local_owned'}));
 task.requireOwnership();await Promise.all([task.cleanup(),task.cleanup()]);assert.equal(calls.length,2);
 assert.deepEqual(calls[0].body.uplink_body.batch_operate_conv_uplink_body,{operate_type:8,conversation_id_list:['owned']});
 assert.deepEqual(calls[1].body.uplink_body.mark_conv_read_uplink_body,{conversation_id:'owned',conversation_type:3});
 assert.equal(calls[0].signal.aborted,false);
 const existing=createQuietTask({request:{client_meta:{conversation_id:'existing',local_conversation_id:'local_owned'}},post:()=>assert.fail()});
 assert.throws(()=>existing.acknowledge({conversation_id:'existing',local_conversation_id:'local_owned'}));
});
test('partial archive failure still marks read and cannot report cleanup success',async()=>{
 let read=false;
 const task=createQuietTask({request,post:async(route)=>{
  if(route.endsWith('mark_conv_read')){read=true;return {status_code:0};}
  return {status_code:0,downlink_body:{batch_operate_conv_downlink_body:{has_failure:true,conversation_list:[{conversation_id:'owned',success:false}]}}};
 }});
 task.acknowledge({conversation_id:'owned',local_conversation_id:'local_owned'});
 await assert.rejects(task.cleanup());assert.equal(read,true);
});
test('quiet preference changes only Doubao banner and requires persisted readback',async()=>{
 const writes=[];let value='1';
 const task=createQuietTask({request,post:async(route,body)=>{
  if(route.endsWith('/sync')){writes.push(body);value=body.configs[0].value;return {code:0};}
  assert.deepEqual(body.objects,[145]);return {code:0,data:{configs:[{object:145,value,version:7}]}};
 }});
 await task.prepare();await task.prepare();assert.deepEqual(writes,[{configs:[{object:145,value:'0',version:7}]}]);
 const unsupported=createQuietTask({request,post:async()=>({code:0,data:{configs:[]}})});
 await assert.rejects(unsupported.prepare());
 const unsaved=createQuietTask({request,post:async(route)=>route.endsWith('/sync')?{code:0}:{code:0,data:{configs:[{object:145,value:'1',version:1}]}}});
 await assert.rejects(unsaved.prepare());
});
