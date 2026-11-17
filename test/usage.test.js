import test from 'node:test';import assert from 'node:assert/strict';
import {readEnterpriseUsage} from '../lib/usage.js';
const entry=(id,amount)=>({entry_type:1,usage:{item_id:id,display_name:'PRIVATE PROMPT',occurred_at_ms:123,quota_source:{quota_source_code:'AI_credits',display_text:amount}}});
const page=(entries,more=false,cursor)=>({categories:[52],entries,has_more:more,next_cursor:cursor,window_start_time_ms:1,window_end_time_ms:2});
test('enterprise usage paginates, deduplicates and sums decimal points without exposing prompts or cursors',async()=>{
 const calls=[],responses=[page([entry('a','0.10 点')],true,'private-cursor'),page([entry('a','0.10 点'),entry('b','0.20 点')])];
 const result=await readEnterpriseUsage({post:async(p,b)=>{calls.push([p,b]);return responses.shift();}});
 assert.equal(result.usedAmount,'0.30');assert.equal(result.complete,true);assert.equal(result.recordCount,2);assert.equal(result.remainingAmount,null);
 assert.equal(calls[1][1].cursor,'private-cursor');assert.equal(calls[0][1].category,52);
 assert.equal(/PRIVATE|private-cursor|item_id/.test(JSON.stringify(result)),false);
});
test('bounded or malformed history is explicitly incomplete and never becomes a remaining balance',async()=>{
 const truncated=await readEnterpriseUsage({post:async()=>page([entry('a','1.23 点')],true,'next')},{maxPages:1});
 assert.equal(truncated.complete,false);assert.equal(truncated.usedAmount,'1.23');assert.equal(truncated.totalAmount,null);
 const unknown=await readEnterpriseUsage({post:async()=>page([entry('a','1.234 点')])});assert.equal(unknown.complete,false);assert.equal(unknown.recordCount,0);
 await assert.rejects(()=>readEnterpriseUsage({post:async()=>({...page([]),categories:[61]})}));
});
