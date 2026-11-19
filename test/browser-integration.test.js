import test from 'node:test';
import assert from 'node:assert/strict';
import {getPlaywright} from '../lib/playwright-runtime.js';
import {BrowserViews} from '../lib/browser-view.js';
import {verifyInWindow} from '../lib/verification-window.js';

// Local fixture only: CI never logs in to Feishu or solves an upstream CAPTCHA.
const enabled=process.env.DSH_BROWSER_TEST==='1';
test('actual Chrome headless view forwards human pointer events and verification resumes with SDK result',{skip:!enabled,timeout:45000},async()=>{
 const {chromium}=getPlaywright(),browser=await chromium.launch({channel:'chrome',headless:true});
 const views=new BrowserViews();
 try{
  const page=await browser.newPage({viewport:{width:1000,height:760}});
  await page.setContent('<button style="position:absolute;left:0;top:0;width:200px;height:100px" onclick="this.textContent=\'clicked\'">fixture</button>');
  const detach=views.attach(page,'login',()=>{}),id=views.list()[0].id;
  assert.match((await views.snapshot(id)).image,/^data:image\/jpeg;base64,/);
  for(const type of ['down','up'])await views.input({id,type,x:.05,y:.05});
  assert.equal(await page.locator('button').textContent(),'clicked');detach();
 }finally{await browser.close();}
 // Use a fixture SDK that requires a real UI click before the success callback.
 // Intercept only inside this test; production always loads the official SDK.
 const runtime=getPlaywright(),original=runtime.chromium.launch.bind(runtime.chromium);
 runtime.chromium.launch=async options=>{
  const b=await original(options);const create=b.newContext.bind(b);
  b.newContext=async options=>{const c=await create(options);await c.route('https://lf-rc1.yhgfb-cn-static.com/**',r=>r.fulfill({contentType:'application/javascript',body:`window.verifySDK={initVerifyOptions(){},getCaptchaWebId:async()=> 'verify_fixture_user',autoRender(o){const b=document.createElement('button');b.textContent='Fixture verify';b.style='position:fixed;left:0;top:0;width:200px;height:100px';b.onclick=()=>o.captchaOptions.successCb({});document.body.append(b)}};`}));return c;};return b;
 };
 try{
  const result=verifyInWindow({decision:{type:'verify'},session:{query:new URLSearchParams({aid:'497858'}),cookies:[]},view:views,headed:false});
  const deadline=Date.now()+15000;while(!views.list().length){if(Date.now()>deadline)throw Error('View not attached');await new Promise(r=>setTimeout(r,50));}
  const id=views.list()[0].id;
  for(const type of ['down','up'])await views.input({id,type,x:.05,y:.05});
  assert.equal((await result).fp,'verify_fixture_user');assert.deepEqual(views.list(),[]);
 }finally{runtime.chromium.launch=original;views.cancelAll();}
});
