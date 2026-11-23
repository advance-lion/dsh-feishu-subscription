import {randomUUID} from 'node:crypto';
import {FINISH_REASONS} from './completion-metadata.js';
import {errorIdentity,REQUEST_ERROR_CODES} from './request-errors.js';

export function errorCategory(error){
 const identity=errorIdentity(error);
 if(['AUTH_REQUIRED','AUTH_SESSION_INVALID'].includes(identity.errorCode))return 'authentication';
 if(['RESPONSE_HEADERS_TIMEOUT','RESPONSE_IDLE_TIMEOUT'].includes(identity.errorCode))return 'timeout';
 if(identity.errorCode?.startsWith('SSE_')||identity.errorCode==='EMPTY_ASSISTANT_REPLY')return 'stream-incomplete';
 if(error.code==='TOOL_PROTOCOL_INVALID'||error.code==='TOOL_PROTOCOL_INCOMPLETE')return 'tool-protocol';
 if(error.code==='UPSTREAM_OUTPUT_LIMIT')return 'output-limit';
 if(error.code==='INPUT_TOO_LARGE')return 'input-limit';
 if(error.verificationRequired)return 'verification-required';
 if(Number(error.code)===710020702)return 'upstream-system-error';
 if(Number(error.code)===710022004)return 'upstream-rejected';
 if(Number(error.code)===710022002)return 'shark-block';
 if(['UND_ERR_CONNECT_TIMEOUT','UND_ERR_HEADERS_TIMEOUT','UND_ERR_BODY_TIMEOUT','ETIMEDOUT'].includes(identity.transportCode))return 'timeout';
 if(identity.transportCode)return 'connection-closed';
 if(error.name==='AbortError')return 'cancelled';
 if(error.name==='TimeoutError'||error.cause?.code==='UND_ERR_CONNECT_TIMEOUT')return 'timeout';
 return 'request-failed';
}
const stages=new Set(['catalog','projection','credentials','request','completion','tool-envelope','login','models','verification','quiet-prepare','task-cleanup']);
const events=new Set(['started','response','completed','failed','verification-required','waiting-user','verified','resuming','idle','first-text','input-ready','upstream-end']);
export class DiagnosticLog{
 constructor(limit=150){this.limit=limit;this.rows=[];}
 requestId(){return randomUUID();}
 add({requestId,stage,event,model,httpStatus,upstreamCode,transportCode,category,elapsedMs,count,...metrics}={}){
  const row={time:new Date().toISOString(),stage:stages.has(stage)?stage:'request',event:events.has(event)?event:'failed'};
  if(/^[a-f0-9-]{36}$/.test(requestId||''))row.requestId=requestId;
  if(/^[\w.-]{1,64}$/.test(model||''))row.model=model;
  if(Number.isInteger(httpStatus)&&httpStatus>=100&&httpStatus<=599)row.httpStatus=httpStatus;
  if(Number.isSafeInteger(Number(upstreamCode))&&Number(upstreamCode)>0)row.upstreamCode=Number(upstreamCode);
  if(['UND_ERR_SOCKET','UND_ERR_CONNECT_TIMEOUT','UND_ERR_HEADERS_TIMEOUT','UND_ERR_BODY_TIMEOUT','ECONNRESET','ECONNREFUSED','ENOTFOUND','EAI_AGAIN','ETIMEDOUT'].includes(transportCode))row.transportCode=transportCode;
  if(REQUEST_ERROR_CODES.has(metrics.errorCode))row.errorCode=metrics.errorCode;
  if(['Error','TypeError','SyntaxError','TimeoutError','AbortError','SubscriptionStreamError','FeishuApiError','ToolProtocolError','LlmError'].includes(metrics.errorName))row.errorName=metrics.errorName;
  for(const key of ['messageFinished','streamFinished','hasText'])if(typeof metrics[key]==='boolean')row[key]=metrics[key];
  if(['authentication','stream-incomplete','verification-required','upstream-system-error','upstream-rejected','shark-block','connection-closed','cancelled','timeout','request-failed','cleanup-failed','quiet-setting-failed','tool-protocol','output-limit','input-limit'].includes(category))row.category=category;
  if(Number.isFinite(elapsedMs))row.elapsedMs=Math.max(0,Math.round(elapsedMs));
  if(Number.isInteger(count)&&count>=0)row.count=count;
  for(const key of ['inputCharacters','inputBytes','requestBytes','historyMessages','toolDefinitions','toolSchemaBytes','contextWindow','requestedMaxTokens','maxOutputTokens','outputCharacters','outputBytes','inputTokens','outputTokens','endType','upstreamEndReasonCode','toolCallCount','prefixCharacters'])if(Number.isSafeInteger(metrics[key])&&metrics[key]>=0)row[key]=metrics[key];
  if(['catalog','fallback'].includes(metrics.contextSource))row.contextSource=metrics.contextSource;
  if(['catalog','not-exposed'].includes(metrics.outputBudgetSource))row.outputBudgetSource=metrics.outputBudgetSource;
  if(typeof metrics.requestedMaxTokensApplied==='boolean')row.requestedMaxTokensApplied=metrics.requestedMaxTokensApplied;
  if(FINISH_REASONS.has(metrics.upstreamFinishReason))row.upstreamFinishReason=metrics.upstreamFinishReason;
  if(['standard','legacy'].includes(metrics.protocolClosure))row.protocolClosure=metrics.protocolClosure;
  this.rows.push(row);this.rows.splice(0,Math.max(0,this.rows.length-this.limit));
 }
 list(){return {retention:'memory-only',limit:this.limit,rows:this.rows.map(row=>({...row}))};}
 clear(){this.rows=[];return this.list();}
}
