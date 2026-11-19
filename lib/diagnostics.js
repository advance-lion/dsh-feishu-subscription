import {randomUUID} from 'node:crypto';

export function errorCategory(error){
 if(error.verificationRequired)return 'verification-required';
 if(Number(error.code)===710020702)return 'upstream-system-error';
 if(Number(error.code)===710022004)return 'upstream-rejected';
 if(Number(error.code)===710022002)return 'shark-block';
 if(error.cause?.code==='UND_ERR_SOCKET')return 'connection-closed';
 if(error.name==='AbortError')return 'cancelled';
 if(error.name==='TimeoutError'||error.cause?.code==='UND_ERR_CONNECT_TIMEOUT')return 'timeout';
 return 'request-failed';
}
const stages=new Set(['catalog','projection','credentials','request','completion','tool-envelope','login','models','verification']);
const events=new Set(['started','response','completed','failed','verification-required','waiting-user','verified','resuming','idle']);
export class DiagnosticLog{
 constructor(limit=150){this.limit=limit;this.rows=[];}
 requestId(){return randomUUID();}
 add({requestId,stage,event,model,httpStatus,upstreamCode,transportCode,category,elapsedMs,count}={}){
  const row={time:new Date().toISOString(),stage:stages.has(stage)?stage:'request',event:events.has(event)?event:'failed'};
  if(/^[a-f0-9-]{36}$/.test(requestId||''))row.requestId=requestId;
  if(/^[\w.-]{1,64}$/.test(model||''))row.model=model;
  if(Number.isInteger(httpStatus)&&httpStatus>=100&&httpStatus<=599)row.httpStatus=httpStatus;
  if(Number.isSafeInteger(Number(upstreamCode))&&Number(upstreamCode)>0)row.upstreamCode=Number(upstreamCode);
  if(['UND_ERR_SOCKET','UND_ERR_CONNECT_TIMEOUT','ECONNRESET','ECONNREFUSED','ENOTFOUND','ETIMEDOUT'].includes(transportCode))row.transportCode=transportCode;
  if(['verification-required','upstream-system-error','upstream-rejected','shark-block','connection-closed','cancelled','timeout','request-failed'].includes(category))row.category=category;
  if(Number.isFinite(elapsedMs))row.elapsedMs=Math.max(0,Math.round(elapsedMs));
  if(Number.isInteger(count)&&count>=0)row.count=count;
  this.rows.push(row);this.rows.splice(0,Math.max(0,this.rows.length-this.limit));
 }
 list(){return {retention:'memory-only',limit:this.limit,rows:this.rows.map(row=>({...row}))};}
 clear(){this.rows=[];return this.list();}
}
