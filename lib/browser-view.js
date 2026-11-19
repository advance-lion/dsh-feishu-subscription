import {randomUUID} from 'node:crypto';

// Only plugin-owned login/CAPTCHA pages are exposed through DSH's authenticated
// connection. No debug port, cookies, page URLs, arbitrary JS or navigation API.
export class BrowserViews {
  constructor(){this.views=new Map();}
  attach(page,kind,cancel,isChallenge=async()=>true){
    const id=randomUUID(),entry={page,kind,cancel,isChallenge,queue:Promise.resolve(),down:false};
    this.views.set(id,entry);
    return ()=>{this.views.delete(id);};
  }
  list(){return [...this.views].map(([id,{kind}])=>({id,kind}));}
  async snapshot(id){
    const entry=this.views.get(id);if(!entry)throw Error('BROWSER_VIEW_EXPIRED');
    if(!await entry.isChallenge())throw Error('BROWSER_VIEW_EXPIRED');
    const bytes=await entry.page.screenshot({type:'jpeg',quality:65,timeout:5000});
    if(this.views.get(id)!==entry||!await entry.isChallenge())throw Error('BROWSER_VIEW_EXPIRED');
    return {id,kind:entry.kind,image:'data:image/jpeg;base64,'+bytes.toString('base64')};
  }
  async input({id,type,x,y}){
    const entry=this.views.get(id);if(!entry)throw Error('BROWSER_VIEW_EXPIRED');
    if(type==='cancel'){entry.cancel();return;}
    if(!['down','move','up'].includes(type)||!Number.isFinite(x)||!Number.isFinite(y)||x<0||x>1||y<0||y>1)throw Error('BROWSER_INPUT_INVALID');
    const action=entry.queue.then(async()=>{
      if(this.views.get(id)!==entry||!await entry.isChallenge())throw Error('BROWSER_VIEW_EXPIRED');
      const size=entry.page.viewportSize();
      await entry.page.mouse.move(x*(size.width-1),y*(size.height-1));
      if(type==='down'&&!entry.down){await entry.page.mouse.down();entry.down=true;}
      if(type==='up'&&entry.down){await entry.page.mouse.up();entry.down=false;}
    });
    entry.queue=action.catch(()=>{});await action;
  }
  cancelAll(){for(const {cancel} of this.views.values())cancel();this.views.clear();}
}
