const transports=new Set(['UND_ERR_SOCKET','UND_ERR_CONNECT_TIMEOUT','UND_ERR_HEADERS_TIMEOUT','UND_ERR_BODY_TIMEOUT','ECONNRESET','ECONNREFUSED','ENOTFOUND','EAI_AGAIN','ETIMEDOUT']);
export const REQUEST_ERROR_CODES=new Set(['AUTH_REQUIRED','AUTH_SESSION_INVALID','RESPONSE_HEADERS_TIMEOUT','RESPONSE_IDLE_TIMEOUT','SSE_FRAME_INCOMPLETE','SSE_FRAME_INVALID','SSE_COMPLETION_INCOMPLETE','SSE_DELTA_INVALID','EMPTY_ASSISTANT_REPLY','STREAM_OUTPUT_REVISED','TOOL_PROTOCOL_INVALID','TOOL_PROTOCOL_INCOMPLETE','UPSTREAM_OUTPUT_LIMIT','INPUT_TOO_LARGE']);
export function transportCode(error){
 for(let i=0;error&&i<5;i++,error=error.cause)if(transports.has(error.code))return error.code;
}
export function errorIdentity(error){
 const known=REQUEST_ERROR_CODES;
 const code=known.has(error.code)?error.code:known.has(error.message)?error.message:undefined;
 return {errorCode:code,transportCode:transportCode(error),errorName:['Error','TypeError','SyntaxError','TimeoutError','AbortError','SubscriptionStreamError','FeishuApiError','ToolProtocolError','LlmError'].includes(error.name)?error.name:'Error'};
}
export function requestFailure(error){
 const {errorCode,transportCode:transport}=errorIdentity(error);
 if(errorCode==='AUTH_REQUIRED'||errorCode==='AUTH_SESSION_INVALID')return {code:'AUTH',message:'飞书登录凭据不存在或已过期，请在飞书订阅设置中重新登录。'};
 if(errorCode==='RESPONSE_HEADERS_TIMEOUT'||errorCode==='RESPONSE_IDLE_TIMEOUT'||error.name==='TimeoutError'||['UND_ERR_CONNECT_TIMEOUT','UND_ERR_HEADERS_TIMEOUT','UND_ERR_BODY_TIMEOUT','ETIMEDOUT'].includes(transport))return {code:'PROVIDER_TIMEOUT',message:'等待飞书连接或新数据超时；这不表示登录失效。为避免重复任务，本轮未自动重发，请查看诊断日志。'};
 if(transport)return {code:'PROVIDER_CONNECTION_CLOSED',message:'飞书请求连接失败或中断；这不表示登录失效。请查看诊断日志中的网络错误码。'};
 if(['SSE_FRAME_INCOMPLETE','SSE_FRAME_INVALID','SSE_COMPLETION_INCOMPLETE','SSE_DELTA_INVALID','EMPTY_ASSISTANT_REPLY'].includes(errorCode))return {code:'PROVIDER_STREAM_INCOMPLETE',message:'飞书响应流不完整或缺少有效回复，本轮未标记完成，也未自动重发。请查看诊断日志。'};
 if(Number.isSafeInteger(Number(error.code))&&Number(error.code)>0)return {code:'PROVIDER_ERROR',message:`飞书上游返回错误（${Number(error.code)}）；登录状态不能说明具体原因，请查看诊断日志。`};
 return {code:'FEISHU_REQUEST_FAILED',message:'飞书请求未完成，原因尚未确定；请复制飞书订阅诊断日志排查，无需仅凭此提示退出登录。'};
}
