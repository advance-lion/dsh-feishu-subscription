import test from 'node:test';import assert from 'node:assert/strict';import {mkdtemp,readFile,rm} from 'node:fs/promises';import path from 'node:path';import os from 'node:os';import {AccountStore} from '../lib/accounts.js';import {loadCredentials,saveCredentials} from '../lib/credentials.js';import {presentQuota} from '../lib/quota.js';
test('encrypted account migration, adding preserves selection, removal targets its account, logout clears all',async()=>{
 const root=await mkdtemp(path.join(os.tmpdir(),'feishu-accounts-')),file=path.join(root,'active.dpapi');
 try{
  const a={accountId:'a',displayName:'账号甲',accessToken:'fake-a-credential',expiresAt:Date.now()+3600000,authKind:'feishu-passport-token'};
  await saveCredentials(a,file);const store=new AccountStore(file);const migrated=await store.list();assert.equal(migrated.accounts.length,1);
  const b=await store.add({...a,accountId:'b',displayName:'账号乙',accessToken:'fake-b-credential'});assert.equal((await loadCredentials(file)).accountId,'a');assert.equal((await store.list()).activeId,migrated.activeId);
  await store.switch(b);assert.equal((await loadCredentials(file)).accountId,'b');
  await store.switch(migrated.activeId);assert.equal((await loadCredentials(file)).accountId,'a');
  const encrypted=await readFile(store.file);assert.equal(encrypted.includes(Buffer.from('fake-a-credential')),false);
  await store.remove(migrated.activeId);assert.equal((await store.list()).activeId,null);assert.equal((await store.list()).accounts.length,1);await assert.rejects(()=>loadCredentials(file));
  await store.switch(b);assert.equal((await loadCredentials(file)).accountId,'b');await store.add(a);assert.equal((await store.list()).accounts.length,2);await store.logout();assert.equal((await store.list()).accounts.length,0);await assert.rejects(()=>loadCredentials(file));
  const fresh=await store.add(a);assert.equal((await store.list()).activeId,null);await assert.rejects(()=>loadCredentials(file));await store.switch(fresh);assert.equal((await loadCredentials(file)).accountId,'a');
 }finally{const resolved=path.resolve(root);if(!resolved.startsWith(path.resolve(os.tmpdir())+path.sep))throw Error('Unsafe temp path');await rm(resolved,{recursive:true,force:true});}
});
test('personal membership cannot become fake enterprise zero quota',()=>{
 const value=presentQuota({member_info:{hasEnterpriseSubscription:false},enterprise_window_limit_section:{usage_exhausted:false,window_limit_groups:[]}});
 assert.equal(value.enterpriseConfirmed,false);assert.equal(value.exhausted,null);assert.deepEqual(value.windows,[]);
 const actual=presentQuota({member_info:{hasEnterpriseSubscription:true},enterprise_window_limit_section:{window_limit_groups:[{feature_group_name:'工作模型',window_limits:[{used_percent:23,used_amount:'23',total_amount:'100',window_type:2}]}]}});
 assert.equal(actual.windows[0].usedPercent,23);assert.equal(actual.windows[0].totalAmount,'100');
});
