import test from 'node:test';import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {getPlaywright} from '../lib/playwright-runtime.js';

test('native Playwright singleton survives plugin module re-evaluation and remains usable',async()=>{
 const first=getPlaywright(),require=createRequire(import.meta.url);
 assert.equal(first,require('playwright-core'));
 for(let i=0;i<3;i++){
  const module=await import('../lib/playwright-runtime.js?reload='+i);
  const current=module.getPlaywright();assert.equal(current,first);
  const api=await current.request.newContext();
  try{assert.equal(typeof api.get,'function');}finally{await api.dispose();}
 }
});
