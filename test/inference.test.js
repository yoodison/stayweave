import test from 'node:test';
import assert from 'node:assert/strict';
import {estimateCost,completion,metrics,verifyModel,MODEL} from '../server/inference.js';
test('token cost separates cached input; unknown usage/model is not free',()=>{
 assert.equal(estimateCost({prompt_tokens:1000000,completion_tokens:1000000,prompt_tokens_details:{cached_tokens:500000}}),1.08);
 assert.equal(estimateCost(null),null);assert.equal(estimateCost({prompt_tokens:1,completion_tokens:1},'other'),null);
});
test('catalog verification, measurement and local budget fail closed without exposing content',async t=>{
 const oldFetch=global.fetch,env={...process.env};t.after(()=>{global.fetch=oldFetch;for(const k of ['NEBIUS_API_KEY','NEBIUS_INFERENCE_ENABLED','STAYWEAVE_INFERENCE_BUDGET_USD']){if(env[k]===undefined)delete process.env[k];else process.env[k]=env[k]}});
 process.env.NEBIUS_API_KEY='test-only';process.env.NEBIUS_INFERENCE_ENABLED='true';process.env.STAYWEAVE_INFERENCE_BUDGET_USD='0.10';
 global.fetch=async()=>({ok:true,json:async()=>({data:[{id:MODEL}]})});assert.equal((await verifyModel()).available,true);
 global.fetch=async()=>({ok:true,json:async()=>({model:MODEL,usage:{prompt_tokens:100,completion_tokens:50,total_tokens:150},choices:[{message:{content:'private answer'}}]})});
 const result=await completion({model:MODEL,max_tokens:100,messages:[{role:'user',content:'private prompt'}]},'test');assert.equal(result.measurement.usage.total_tokens,150);assert.ok(result.measurement.estimatedUsd>0);assert.ok(!JSON.stringify(metrics()).includes('private'));
 const calls=metrics().calls;process.env.STAYWEAVE_INFERENCE_BUDGET_USD='0.000001';await assert.rejects(()=>completion({model:MODEL,max_tokens:100}),/budget/);assert.equal(metrics().calls,calls);
 process.env.STAYWEAVE_INFERENCE_BUDGET_USD='0.10';global.fetch=async()=>{throw new Error('network')};await assert.rejects(()=>completion({model:MODEL,max_tokens:100}),/network/);assert.equal(metrics().failed,1);assert.equal(metrics().unknownCostCalls,1);assert.ok(metrics().budgetUsedUsd>metrics().estimatedUsd);
 process.env.NEBIUS_INFERENCE_ENABLED='false';await assert.rejects(()=>completion({model:MODEL}),/paused/);
});
