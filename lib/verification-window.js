import {createServer} from 'node:http';
import {randomBytes} from 'node:crypto';
import {getPlaywright} from './playwright-runtime.js';
const defaultHeaded=()=>process.platform==='win32'||process.platform==='darwin'||!!(process.env.DISPLAY||process.env.WAYLAND_DISPLAY);

// A plugin-owned page renders the upstream challenge unchanged. Only the
// official SDK success callback releases the suspended request; no solver.
const SDK='https://lf-rc1.yhgfb-cn-static.com/obj/rc-verifycenter/verifycenter/@latest/index.js';
export async function verifyInWindow({decision,session,signal,onState=()=>{}}){
  const {chromium}=getPlaywright();
  if(!defaultHeaded())throw Error('VERIFICATION_DISPLAY_REQUIRED');
  signal?.throwIfAborted();
  const key=randomBytes(32).toString('hex'),route='/'+key;
  const query=new URLSearchParams(session.query);
  const settings={commonOptions:{aid:Number(query.get('aid')),iid:'0',did:'0',repoId:600061},captchaOptions:{showMode:'mask'}};
  const encode=value=>JSON.stringify(value).replaceAll('<','\\u003c');
  let settle,browser,timer,finished=false,verifiedFp;
  const outcome=new Promise(resolve=>{settle=value=>{if(!finished){finished=true;resolve(value);}};});
  const html=`<!doctype html><meta charset="utf-8"><title>DSH · 飞书安全验证</title><style>body{font:16px system-ui;margin:48px;background:#f7f8fa;color:#222}main{max-width:540px;margin:auto;padding:32px;background:white;border-radius:16px}</style><main><h2>完成飞书安全验证</h2><p id="status">正在加载官方验证码。完成后将继续原来的 DSH 请求。</p><p>关闭窗口会取消恢复。</p></main><script src="${SDK}" onerror="document.getElementById('status').textContent='官方验证码加载失败，请关闭窗口后重试。'"></script><script>
  const report=(state,fp)=>fetch(${encode(route+'/result')},{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({state,fp})});
  const options=${encode(settings)};
  const success=async result=>{if(result?.skipRetry){report('failed');return;}try{const fp=await window.verifySDK.getCaptchaWebId();if(typeof fp!=='string'||!/^verify_[A-Za-z0-9_-]{1,200}$/.test(fp))throw Error();document.getElementById('status').textContent='验证成功，正在恢复 DSH 请求…';await report('verified',fp);}catch{report('failed')}};
  const close=()=>report('cancelled');
  options.captchaOptions={...options.captchaOptions,successCb:success,closeCb:close,errorCb:()=>{document.getElementById('status').textContent='验证码未完成，请在官方组件中重试。'}};
  options.secondVerifyWebOptions={callBack:success,closeCallBack:close};
  try{window.verifySDK.initVerifyOptions(options);window.verifySDK.autoRender({...options,verify_data:${encode(decision)}})}catch{document.getElementById('status').textContent='无法加载本次验证，请关闭窗口后重试。';report('failed')}
  </script>`;
  const server=createServer(async(req,res)=>{
    res.setHeader('Cache-Control','no-store');res.setHeader('Referrer-Policy','no-referrer');
    if(req.url===route&&req.method==='GET'){res.setHeader('Content-Type','text/html; charset=utf-8');res.end(html);return;}
    if(req.url===route+'/result'&&req.method==='POST'&&req.headers.origin===origin){
      let text='';for await(const chunk of req){text+=chunk;if(text.length>512){res.writeHead(413).end();return;}}
      try{const {state,fp}=JSON.parse(text);if(state==='verified'&&/^verify_[A-Za-z0-9_-]{1,200}$/.test(fp||'')){verifiedFp=fp;settle(state);res.end('ok');return;}if(['cancelled','failed'].includes(state)){settle(state);res.end('ok');return;}}catch{}
    }
    res.writeHead(404).end();
  });
  let origin;
  const abort=()=>settle('cancelled');
  try{
    await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});
    origin=`http://127.0.0.1:${server.address().port}`;
    signal?.addEventListener('abort',abort,{once:true});signal?.throwIfAborted();
    timer=setTimeout(()=>settle('expired'),600000);
    browser=await chromium.launch({channel:'chrome',headless:false,chromiumSandbox:true});
    signal?.throwIfAborted();
    browser.on('disconnected',()=>settle('cancelled'));
    const context=await browser.newContext();
    await context.addCookies(session.cookies);
    const page=await context.newPage();page.on('close',()=>settle('cancelled'));
    await page.goto(origin+route);signal?.throwIfAborted();onState('waiting-user');
    const state=await outcome;signal?.throwIfAborted();
    if(state!=='verified')throw Error('VERIFICATION_'+state.toUpperCase());
    onState('verified');return {verified:true,fp:verifiedFp,cookies:await context.cookies('https://www.doubao.com/chat/completion')};
  }finally{clearTimeout(timer);signal?.removeEventListener('abort',abort);await browser?.close().catch(()=>{});server.closeAllConnections();await new Promise(resolve=>server.close(resolve));onState('idle');}
}
