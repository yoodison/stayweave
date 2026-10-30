import test from 'node:test';
import assert from 'node:assert/strict';
import { aiStatus, interpret } from '../server/ai.js';

const originalKey=process.env.NEBIUS_API_KEY;
const originalFetch=globalThis.fetch;
const originalEnabled=process.env.NEBIUS_INFERENCE_ENABLED;
test.after(()=>{if(originalEnabled===undefined) delete process.env.NEBIUS_INFERENCE_ENABLED; else process.env.NEBIUS_INFERENCE_ENABLED=originalEnabled; globalThis.fetch=originalFetch; if(originalKey===undefined) delete process.env.NEBIUS_API_KEY; else process.env.NEBIUS_API_KEY=originalKey;});

test('model adapter requires credentials before calling the provider', async()=>{
  delete process.env.NEBIUS_API_KEY;
  await assert.rejects(interpret('Request'), /not connected/);
  assert.equal(aiStatus().configured,false);
});

test('model calls stay paused until explicitly enabled', async()=>{
  process.env.NEBIUS_API_KEY='test-key'; delete process.env.NEBIUS_INFERENCE_ENABLED;
  await assert.rejects(interpret('Request'), /paused/);
  assert.equal(aiStatus().inferenceEnabled,false);
});

test('model adapter validates structured results and records a successful response', async()=>{
  process.env.NEBIUS_API_KEY='test-key'; process.env.NEBIUS_INFERENCE_ENABLED='true';
  globalThis.fetch=async(url,opts)=>{
    assert.equal(url,'https://api.tokenfactory.nebius.com/v1/chat/completions');
    assert.equal(JSON.parse(opts.body).response_format.type,'json_object');
    return {ok:true,json:async()=>({choices:[{message:{content:JSON.stringify({requested_time:'14:00',breakfast_portions:12,room_count:4,guest_count:12})}}],usage:{total_tokens:123}})};
  };
  const result=await interpret('A fictional group request');
  assert.deepEqual([result.requestedTime,result.breakfast,result.rooms,result.guests],['14:00',12,4,12]);
  assert.equal(result.usage.total_tokens,123);
  assert.equal(aiStatus().verified,true);
});

test('malformed provider output cannot become a valid request', async()=>{
  process.env.NEBIUS_API_KEY='test-key'; process.env.NEBIUS_INFERENCE_ENABLED='true';
  globalThis.fetch=async()=>({ok:true,json:async()=>({choices:[{message:{content:'null'}}]})});
  await assert.rejects(interpret('Request'),/invalid request/);
  globalThis.fetch=async()=>({ok:true,json:async()=>({choices:[{message:{content:'not JSON'}}]})});
  await assert.rejects(interpret('Request'),/valid request details/);
});

import {interpretFit} from '../server/ai.js';
test('guest interpretation preserves grounded requirements and preferences for review',async()=>{
  process.env.NEBIUS_API_KEY='test-key';process.env.NEBIUS_INFERENCE_ENABLED='true';
  globalThis.fetch=async()=>({ok:true,json:async()=>({choices:[{message:{content:JSON.stringify({claims:[{kind:'requirement',feature:'stepFree',evidence:'need step-free access'},{kind:'preference',feature:'quiet',evidence:'prefer a quiet room'}]})}}],usage:{total_tokens:50}})});
  const result=await interpretFit('I need step-free access and prefer a quiet room.');
  assert.deepEqual(result.claims.map(x=>[x.kind,x.feature]),[['requirement','stepFree'],['preference','quiet']]);
});
test('ungrounded or malformed model claims never reach a plan',async()=>{
  process.env.NEBIUS_API_KEY='test-key';process.env.NEBIUS_INFERENCE_ENABLED='true';
  globalThis.fetch=async()=>({ok:true,json:async()=>({choices:[{message:{content:JSON.stringify({claims:[{kind:'requirement',feature:'stepFree',evidence:'wheelchair required'}]})}}]})});
  await assert.rejects(interpretFit('I would like a quiet room.'),/ungrounded/);
  globalThis.fetch=async()=>({ok:true,json:async()=>({choices:[{message:{content:JSON.stringify({claims:[{kind:'requirement',feature:'pool',evidence:'quiet room'}]})}}]})});
  await assert.rejects(interpretFit('I would like a quiet room.'),/unsupported/);
});

test('hotel interpreter supports grounded spatial features while legacy stays bounded',async()=>{
  process.env.NEBIUS_API_KEY='test-key';process.env.NEBIUS_INFERENCE_ENABLED='true';
  let prompt;
  globalThis.fetch=async(_url,opts)=>{prompt=JSON.parse(opts.body).messages[0].content;return {ok:true,json:async()=>({choices:[{message:{content:JSON.stringify({claims:[{kind:'requirement',feature:'family',evidence:'need a family room'},{kind:'preference',feature:'highFloor',evidence:'prefer a high floor'}]})}}]})};};
  const message='I need a family room and prefer a high floor.';
  const result=await interpretFit(message,{hotel:true});assert.equal(result.claims[0].feature,'family');assert.match(prompt,/nearElevator/);assert.match(prompt,/must NOT be approximated/);
  await assert.rejects(interpretFit(message),/unsupported/);
});
