import test from 'node:test';import assert from 'node:assert/strict';
import {defaultHeaded,waitForFeishuSession} from '../lib/login-session.js';
test('Linux without a display uses embedded login; desktops keep a visible browser',()=>{
 assert.equal(defaultHeaded({platform:'linux',env:{}}),false);
 assert.equal(defaultHeaded({platform:'linux',env:{DISPLAY:':0'}}),true);
 assert.equal(defaultHeaded({platform:'linux',env:{WAYLAND_DISPLAY:'wayland-0'}}),true);
 assert.equal(defaultHeaded({platform:'darwin',env:{}}),true);
 assert.equal(defaultHeaded({platform:'win32',env:{}}),true);
});
test('existing session never navigates or captures authenticated pages',async()=>{
 const cookies=[{name:'session',value:'fixture-only'}];
 assert.equal(await waitForFeishuSession({cookies:async()=>cookies,pages(){throw Error('Must not inspect authenticated pages');}},{headed:false}),cookies);
});
test('headless login exposes only challenge image, waits for user cookie, then clears image',async()=>{
 let authenticated=false,navigated=false,screenshots=0;const challenges=[],states=[];
 const page={goto:async url=>{assert.equal(url,'https://my.feishu.cn/');navigated=true;},screenshot:async()=>{screenshots++;return Buffer.from('fixture-image');}};
 const browser={cookies:async()=>authenticated?[{name:'session',value:'fixture-session-secret'}]:[],pages:()=>[page]};
 const result=await waitForFeishuSession(browser,{headed:false,onState:s=>states.push(s),onChallenge:c=>{challenges.push(c);if(c)authenticated=true;}});
 assert.equal(navigated,true);assert.equal(screenshots,1);assert.deepEqual(states,['waiting-for-user']);
 assert.equal(result[0].name,'session');assert.match(challenges[0].image,/^data:image\/jpeg;base64,/);assert.equal(challenges.at(-1),null);
 assert.equal(JSON.stringify(challenges).includes('fixture-session-secret'),false);
});
test('cancelling authentication clears the challenge and cannot complete login',async()=>{
 const controller=new AbortController(),challenges=[];
 const page={goto:async()=>{},screenshot:async()=>Buffer.from('fixture')};
 await assert.rejects(()=>waitForFeishuSession({cookies:async()=>[],pages:()=>[page]},{headed:false,signal:controller.signal,onChallenge:c=>{challenges.push(c);if(c)controller.abort();}}),e=>e.name==='AbortError');
 assert.equal(challenges.at(-1),null);
});
