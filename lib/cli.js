#!/usr/bin/env node
import {loadCredentials} from './credentials.js';
import {listModels} from './catalog.js';
import {complete} from './generate.js';
const command=process.argv[2];
try{
 if(command==='models')console.log(JSON.stringify(await listModels(),null,2));
 else if(command==='chat'){
   const modelId=process.argv[3],prompt=process.argv.slice(4).join(' ');
   if(!modelId||!prompt)throw new Error('Usage: node lib/cli.js chat <model-id> <prompt>');
   console.log(JSON.stringify(await complete({modelId,prompt}),null,2));
 }
 else if(command==='status'){
   const state=await loadCredentials();
   console.log(JSON.stringify({credentialStored:true,authKind:state.authKind||'web-session',passportVerificationRecorded:state.passportVerified===true,expiresAt:new Date(state.expiresAt).toISOString(),generationCheckedByThisCommand:false,enterpriseBillingVerified:false},null,2));
 }else console.log('Development prototype. Commands: status | models | chat <model-id> <prompt>. DSH adapter is not released.');
}catch(error){console.error(error.message);process.exitCode=1}
