import {createClient} from './client.js';
import {readEnterpriseUsage} from './usage.js';
export function presentQuota(data={}){
 data=data||{};
 const hasEnterprise=data.member_info?.hasEnterpriseSubscription===true;
 // A personal membership result must never be relabelled as enterprise credit.
 return {updatedAt:new Date().toISOString(),source:'飞书豆包订阅额度接口',enterpriseConfirmed:hasEnterprise,
  state:hasEnterprise?'available':'enterprise-not-returned',
  subscriptionName:hasEnterprise?'企业订阅':null,
  exhausted:hasEnterprise?data.enterprise_window_limit_section?.usage_exhausted===true:null,
  message:hasEnterprise?'企业额度接口已返回；按套餐窗口展示。':'当前接口未返回企业额度；不能据此认定企业额度为零。请在飞书“用量”中核对。',
  windows:hasEnterprise?(data.enterprise_window_limit_section?.window_limit_groups||[]).flatMap(group=>(group.window_limits||[]).map(item=>({
    name:group.feature_group_name||'企业用量',windowType:item.window_type,
    usedPercent:item.used_percent!==undefined&&Number.isFinite(Number(item.used_percent))?Math.max(0,Math.min(100,Number(item.used_percent))):null,
    usedAmount:item.used_amount??null,totalAmount:item.total_amount??null,unlimited:item.unlimited===true,resetAt:item.end_time??null
  }))):[]};
}
export async function readQuota(credentialFile){
 const client=await createClient({credentialFile});
 try{
  const [summary,usage]=await Promise.allSettled([
   client.post('/alice/commerce/sale/subscription/quota/summary/',{product_line:'membership'}),readEnterpriseUsage(client)
  ]);
  if(summary.status==='rejected'&&usage.status==='rejected')throw Error('企业额度与用量暂不可读取，请刷新重试。');
  return {...presentQuota(summary.status==='fulfilled'?summary.value:null),
   usage:usage.status==='fulfilled'?usage.value:null,usageState:usage.status==='fulfilled'?'available':'unavailable'};
 }finally{await client.close();}
}
