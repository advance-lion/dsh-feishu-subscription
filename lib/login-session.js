export function defaultHeaded({platform=process.platform,env=process.env}={}){
 return platform!=='linux'||!!(env.DISPLAY||env.WAYLAND_DISPLAY);
}
// The application only displays a login challenge; it never clicks authentication controls.
export async function waitForFeishuSession(browser,{signal,headed,onState=()=>{},onChallenge=()=>{},timeoutMs=240000,view}={}){
 const origins=['https://my.feishu.cn/','https://accounts.feishu.cn/'];
 let cookies=await browser.cookies(origins);
 if(cookies.some(c=>c.name==='session'))return cookies;
 const page=browser.pages()[0]||await browser.newPage();
 await page.goto('https://my.feishu.cn/');onState('waiting-for-user');
 const detach=!headed&&view?view.attach(page,'login',()=>browser.close().catch(()=>{}),async()=>!(await browser.cookies(origins)).some(c=>c.name==='session')):()=>{};
 const deadline=Date.now()+timeoutMs;let capturedAt=0;
 try{
  while(Date.now()<deadline){
   signal?.throwIfAborted();cookies=await browser.cookies(origins);
   if(cookies.some(c=>c.name==='session'))return cookies;
   if(!headed&&!view&&Date.now()-capturedAt>=5000){
    const bytes=await page.screenshot({type:'jpeg',quality:65,fullPage:false,timeout:10000});
    signal?.throwIfAborted();
    // Login can finish while the screenshot is in flight. Never publish that frame.
    cookies=await browser.cookies(origins);
    if(cookies.some(c=>c.name==='session'))return cookies;
    capturedAt=Date.now();
    onChallenge({image:'data:image/jpeg;base64,'+bytes.toString('base64'),updatedAt:capturedAt});
   }
   await new Promise(resolve=>setTimeout(resolve,1000));
  }
  throw new Error('登录超时，请重新添加账号。');
 }finally{detach();onChallenge(null);}
}
