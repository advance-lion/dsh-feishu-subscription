export const FINISH_REASONS=new Set(['stop','length','max_tokens','max_output_tokens','tool_calls','end_turn','eos','cancelled','content_filter','not-provided','other']);
const positive=value=>{const n=Number(value);return Number.isSafeInteger(n)&&n>0?n:undefined;};
export function modelLimits(model){
 const p=model.extraParams||{},declared=positive(p.total_window_size);
 const maxOutputTokens=positive(p.max_output_tokens)||positive(p.max_completion_tokens)||positive(p.max_tokens);
 return {contextWindow:declared||256000,contextSource:declared?'catalog':'fallback',maxOutputTokens,outputBudgetSource:maxOutputTokens?'catalog':'not-exposed'};
}
function object(value){if(typeof value==='string'&&value.length<32768){try{return JSON.parse(value);}catch{return {};}}return value&&typeof value==='object'?value:{};}
// Never copy finish attributes wholesale: msg_finish_attr.brief contains reply
// text, and other attributes contain conversation IDs and billing information.
export function completionMetadata(data){
 const msg=object(data.msg_finish_attr),answer=object(data.answer_finish_attr);
 const raw=data.finish_reason??data.stop_reason??msg.finish_reason??msg.stop_reason??answer.finish_reason??answer.stop_reason;
 const reason=typeof raw==='string'?(FINISH_REASONS.has(raw)?raw:'other'):'not-provided';
 const usage=object(data.usage??answer.usage??msg.usage);
 return {endType:Number.isInteger(data.end_type)?data.end_type:undefined,upstreamFinishReason:reason,
  upstreamEndReasonCode:Number.isSafeInteger(raw)&&raw>=0?raw:undefined,
  inputTokens:positive(usage.input_tokens??usage.prompt_tokens),outputTokens:positive(usage.output_tokens??usage.completion_tokens)};
}
export function isOutputLimit(info){return ['length','max_tokens','max_output_tokens'].includes(info.upstreamFinishReason);}
