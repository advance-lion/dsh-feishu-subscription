import { createClient } from './client.js';

export function parseCatalog(html){
  const scripts=[...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)].map(m=>m[1]);
  const script=scripts.find(s=>s.includes('window._ROUTER_DATA ='));
  if(!script)throw new Error('Doubao page no longer exposes the expected model catalog.');
  // Parse inert JSON; never evaluate the server's JavaScript.
  const router=JSON.parse(script.slice(script.indexOf('=')+1).trim().replace(/;$/,''));
  const layout=router.loaderData?.chat_layout?.chat_layout;
  const account=layout?.accountInfo;
  if(account?.message!=='success'||!(account.data?.user_id_str||account.data?.user_id)){
    const error=new Error('Passport session is not authenticated. Sign in again; model-menu visibility is not proof of login.');
    error.code='AUTH_SESSION_INVALID';
    throw error;
  }
  const menu=layout?.actionBarBriefList?.modeSelectData?.menuConfV2;
  const mode=menu?.mode_list?.item_list?.find(m=>m.mode_id==='3');
  if(!mode?.model_list?.item_list)throw new Error('No work-model catalog returned for this account.');
  return mode.model_list.item_list.filter(m=>m.subscribe_config?.need_upgrade!==true).map(m=>({
    id:String(m.model_item_key??m.item_id),name:m.name,modeId:mode.mode_id,agentMode:mode.agent_mode,
    extraParams:m.model_extra_params??{}
  }));
}
export async function listModels(options={}){
  const client=await createClient(options);
  try{return parseCatalog(await(await client.getPage('/chat/')).text());}finally{await client.close()}
}
