// The native member client defines category 52 as ENTERPRISE_QUOTA_PACKAGE.
// Keep only billing fields: titles contain full user prompts and must not reach UI/logs.
export async function readEnterpriseUsage(client,{maxPages=5}={}){
 let cursor,windowStart,windowEnd,complete=false,valid=true,total=0n,pages=0;
 const seen=new Set(),cursors=new Set(),recent=[];
 for(;pages<maxPages;){
  const data=await client.post('/alice/commerce/usage/timeline/',{category:52,page_size:50,...(cursor?{cursor}:{})});
  pages++;
  if(!data||!Array.isArray(data.categories)||!data.categories.includes(52)||!Array.isArray(data.entries))throw Error('Enterprise usage response unavailable.');
  if(pages===1){windowStart=data.window_start_time_ms;windowEnd=data.window_end_time_ms;}
  for(const entry of data.entries){
   if(entry.entry_type!==1){valid=false;continue;}
   const usage=entry.usage,source=usage?.quota_source;
   if(!usage?.item_id||source?.quota_source_code!=='AI_credits'){valid=false;continue;}
   if(seen.has(usage.item_id))continue;
   const match=/^(\d+)(?:\.(\d{1,2}))?\s*点$/.exec(source.display_text||'');
   if(!match){valid=false;continue;}
   seen.add(usage.item_id);
   const cents=BigInt(match[1])*100n+BigInt((match[2]||'').padEnd(2,'0'));
   total+=cents;
   if(recent.length<10)recent.push({amount:formatPoints(cents),occurredAt:usage.occurred_at_ms??null});
  }
  if(data.has_more===false){complete=true;break;}
  if(data.has_more!==true||!data.next_cursor||cursors.has(data.next_cursor))break;
  cursor=data.next_cursor;cursors.add(cursor);
 }
 return {source:'企业用量套餐',scope:'current-account',unit:'点',usedAmount:formatPoints(total),
  complete:complete&&valid,recordCount:seen.size,pages,windowStart:windowStart??null,windowEnd:windowEnd??null,
  remainingAmount:null,totalAmount:null,recent};
}
function formatPoints(cents){return `${cents/100n}.${String(cents%100n).padStart(2,'0')}`;}
