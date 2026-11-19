import test from 'node:test';
import assert from 'node:assert/strict';
import {BrowserViews} from '../lib/browser-view.js';

test('remote challenges isolate sessions, validate input, serialize dragging and expire immediately',async()=>{
 const views=new BrowserViews(),actions=[];let cancelled=0,release;
 const page={screenshot:async()=>Buffer.from('fixture'),viewportSize:()=>({width:1000,height:760}),mouse:{move:async(x,y)=>actions.push(['move',x,y]),down:async()=>actions.push(['down']),up:async()=>actions.push(['up'])}};
 const detach=views.attach(page,'verification',()=>cancelled++),id=views.list()[0].id;
 assert.deepEqual(Object.keys(views.list()[0]).sort(),['id','kind']);
 assert.match((await views.snapshot(id)).image,/^data:image\/jpeg;base64,/);
 await assert.rejects(()=>views.input({id,type:'evaluate',x:0,y:0}));
 await assert.rejects(()=>views.input({id,type:'down',x:Infinity,y:0}));
 await assert.rejects(()=>views.input({id,type:'down',x:1.01,y:0}));
 await Promise.all(['down','move','up'].map(type=>views.input({id,type,x:.5,y:.5})));
 assert.deepEqual(actions,[['move',499.5,379.5],['down'],['move',499.5,379.5],['move',499.5,379.5],['up']]);
 await views.input({id,type:'cancel'});assert.equal(cancelled,1);
 page.screenshot=()=>new Promise(r=>{release=r;});const pending=views.snapshot(id);
 while(!release)await new Promise(r=>setImmediate(r));detach();release(Buffer.from('private'));
 await assert.rejects(()=>pending,/EXPIRED/);await assert.rejects(()=>views.snapshot(id),/EXPIRED/);
 assert.deepEqual(views.list(),[]);
});

test('login snapshots cannot publish a frame after authentication wins the race',async()=>{
 const views=new BrowserViews();let authenticated=false;
 const page={screenshot:async()=>{authenticated=true;return Buffer.from('private authenticated page');}};
 views.attach(page,'login',()=>{},async()=>!authenticated);
 await assert.rejects(()=>views.snapshot(views.list()[0].id),/EXPIRED/);
 views.cancelAll();assert.deepEqual(views.list(),[]);
});
