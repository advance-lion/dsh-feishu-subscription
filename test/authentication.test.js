import test from 'node:test';
import assert from 'node:assert/strict';
import {authenticationCookies} from '../lib/client.js';
import {parseCatalog} from '../lib/catalog.js';

test('verified Passport authentication supplies the saved token and excludes stale web sessions',()=>{
 const cookies=authenticationCookies({authKind:'feishu-passport-token',accessToken:'unit-test-token',deviceId:'test-device',expiresAt:Date.now()+60000,doubaoCookies:[{name:'sessionid',value:'stale-session'}]});
 assert.equal(cookies.find(c=>c.name==='passport_access_token')?.value,'unit-test-token');
 assert.equal(cookies.find(c=>c.name==='passport_access_platform')?.value,'feishu');
 assert.equal(cookies.find(c=>c.name==='x-flow-device-id')?.value,'test-device');
 assert.equal(cookies.some(c=>c.name==='sessionid'),false);
 assert(cookies.every(c=>c.domain==='.doubao.com'&&c.secure));
});
test('a declared Passport identity never silently falls back to another session',()=>{
 assert.throws(()=>authenticationCookies({authKind:'feishu-passport-token',doubaoCookies:[{name:'sessionid',value:'other-account'}]}),/token missing/);
});
function html(account){return '<script>window._ROUTER_DATA = '+JSON.stringify({loaderData:{chat_layout:{chat_layout:{accountInfo:account,actionBarBriefList:{modeSelectData:{menuConfV2:{mode_list:{item_list:[{mode_id:'3',agent_mode:1,model_list:{item_list:[{model_item_key:'seed-lite-7b',name:'豆包 2.1 Lite'}]}}]}}}}}}}})+';</script>'}
test('visible model menu does not authenticate an expired Passport session',()=>{
 assert.throws(()=>parseCatalog(html({message:'error',data:{error_code:13}})),e=>e.code==='AUTH_SESSION_INVALID');
 const models=parseCatalog(html({message:'success',data:{user_id_str:'test-user'}}));
 assert.equal(models[0].id,'seed-lite-7b');assert.equal(models[0].agentMode,1);
});
