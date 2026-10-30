import fs from 'node:fs';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
export const MODEL=process.env.NEBIUS_MODEL||'nvidia/Nemotron-3.5-Super-VL';
const base='https://api.tokenfactory.nebius.com/v1';
const file=path.resolve(process.env.STAYWEAVE_METRICS_FILE||'.stayweave/inference.jsonl');
// Provider catalog read 2026-10-29. Usage-based estimate, never an invoice.
export const pricing={model:'nvidia/Nemotron-3.5-Super-VL',input:0.30,output:0.90,cached:0.06,per:1000000,currency:'USD',checkedAt:'2026-10-29',source:'https://tokenfactory.nebius.com/models/catalog/image2text/nvidia%2FNemotron-3.5-Super-VL'};
const testing=Boolean(process.env.NODE_TEST_CONTEXT);let memory=[],reserved=0,catalog=null;
function rows(){if(testing)return memory;try{return fs.readFileSync(file,'utf8').trim().split('\n').filter(Boolean).map(JSON.parse)}catch(e){if(e.code==='ENOENT')return [];throw e;}}
function append(row){if(testing){memory.push(row);return;}fs.mkdirSync(path.dirname(file),{recursive:true});fs.appendFileSync(file,JSON.stringify(row)+'\n',{mode:0o600});}
export function estimateCost(usage,model=MODEL){if(model!==pricing.model||!Number.isInteger(usage?.prompt_tokens)||!Number.isInteger(usage?.completion_tokens)||usage.prompt_tokens<0||usage.completion_tokens<0)return null;const cached=Math.max(0,Math.min(usage.prompt_tokens,usage.prompt_tokens_details?.cached_tokens||0));return ((usage.prompt_tokens-cached)*pricing.input+cached*pricing.cached+usage.completion_tokens*pricing.output)/pricing.per;}
export async function verifyModel(){
 if(!process.env.NEBIUS_API_KEY)throw Object.assign(new Error('Nebius is not connected.'),{status:503});
 const response=await fetch(base+'/models',{headers:{Authorization:`Bearer ${process.env.NEBIUS_API_KEY}`},signal:AbortSignal.timeout(15000)});
 if(!response.ok)throw Object.assign(new Error(`Model catalog returned HTTP ${response.status}.`),{status:502});
 const data=await response.json();catalog={checkedAt:new Date().toISOString(),requestedModel:MODEL,available:data.data?.some(m=>m.id===MODEL)||false,models:(data.data||[]).filter(m=>/nemotron/i.test(m.id)).map(m=>m.id)};return catalog;
}
export async function completion(body,task='guest-interpretation',scope='interactive'){
 if(!process.env.NEBIUS_API_KEY)throw Object.assign(new Error('Nebius is not connected.'),{status:503});
 if(process.env.NEBIUS_INFERENCE_ENABLED!=='true')throw Object.assign(new Error('Model calls are paused.'),{status:403});
 const requestedModel=body.model||MODEL;if(requestedModel!==pricing.model)throw Object.assign(new Error('Verify pricing before using another model.'),{status:409});
 const upper=(Buffer.byteLength(JSON.stringify(body))*pricing.input+(body.max_tokens||1000)*pricing.output)/1e6;
 const cap=Number(process.env.STAYWEAVE_INFERENCE_BUDGET_USD||.10),spent=rows().reduce((n,r)=>n+(r.budgetUsd||0),0);
 if(!Number.isFinite(cap)||cap<=0||spent+reserved+upper>cap)throw Object.assign(new Error('Local inference budget reached. Review usage before increasing the cap.'),{status:429});
 reserved+=upper;const started=Date.now(),id=randomUUID();let data,row;
 try{
  const response=await fetch(base+'/chat/completions',{method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${process.env.NEBIUS_API_KEY}`},signal:AbortSignal.timeout(35000),body:JSON.stringify(body)});
  if(!response.ok)throw Object.assign(new Error(`Nebius returned HTTP ${response.status}.`),{status:502});
  data=await response.json();const cost=estimateCost(data.usage,requestedModel);
  row={id,at:new Date().toISOString(),task,scope,requestedModel,responseModel:data.model||null,finishReason:data.choices?.[0]?.finish_reason||null,latencyMs:Date.now()-started,usage:data.usage||null,estimatedUsd:cost,budgetUsd:cost??upper,status:'response_received'};
  append(row);return {...data,measurement:row};
 }catch(e){if(!row)append({id,at:new Date().toISOString(),task,scope,requestedModel,status:'failed',latencyMs:Date.now()-started,estimatedUsd:null,budgetUsd:upper,error:e.name==='TimeoutError'?'timeout':'provider_or_network_error'});throw e;
 }finally{reserved-=upper;}
}
export async function structured(system,input,task,scope='interactive'){
 const d=await completion({model:MODEL,temperature:0,max_tokens:task==='owner-booking'?6000:['recovery-advice','operations-interpretation'].includes(task)?3200:1200,response_format:{type:'json_object'},messages:[{role:'system',content:system},{role:'user',content:JSON.stringify(input)}]},task,scope);
 if(d.choices?.[0]?.finish_reason==='length')throw Object.assign(new Error('Model output reached its token limit; no plan was applied.'),{status:502});
 let value;try{value=JSON.parse(d.choices?.[0]?.message?.content||'')}catch{throw Object.assign(new Error('Model output was not valid JSON; no plan was applied.'),{status:502});}
 return {value,measurement:d.measurement};
}
export function metrics(){const all=rows(),known=all.filter(r=>r.estimatedUsd!==null&&r.estimatedUsd!==undefined),times=all.filter(r=>r.status==='response_received').map(r=>r.latencyMs).sort((a,b)=>a-b);const pct=p=>times.length?times[Math.max(0,Math.ceil(times.length*p)-1)]:null;return {catalog,pricing,calls:all.length,responses:times.length,failed:all.length-times.length,p50Ms:pct(.5),p95Ms:pct(.95),estimatedUsd:known.reduce((n,r)=>n+r.estimatedUsd,0),unknownCostCalls:all.length-known.length,tokenCount:all.reduce((n,r)=>n+(r.usage?.total_tokens||0),0),budgetUsd:Number(process.env.STAYWEAVE_INFERENCE_BUDGET_USD||.10),budgetUsedUsd:all.reduce((n,r)=>n+(r.budgetUsd||0),0),recent:all.slice(-15).reverse(),scope:'Calls measured by this adapter since instrumentation; estimated token cost, not provider-billed spend.'};}
