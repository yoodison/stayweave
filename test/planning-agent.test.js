import test from 'node:test';
import assert from 'node:assert/strict';
import {interpretIncident,adviseRecovery} from '../server/planning-agent.js';
import {structured} from '../server/inference.js';
test('incident grounding rejects invented room, duration substring and ambiguous interpretations',async t=>{
 const old=global.fetch;process.env.NEBIUS_API_KEY='test';process.env.NEBIUS_INFERENCE_ENABLED='true';t.after(()=>{global.fetch=old;delete process.env.NEBIUS_API_KEY;delete process.env.NEBIUS_INFERENCE_ENABLED});
 let value={kind:'extra_cleaning',roomId:'601',delayMinutes:40,evidence:'40 extra minutes'};
 global.fetch=async()=>({ok:true,json:async()=>({choices:[{finish_reason:'stop',message:{content:JSON.stringify(value)}}],usage:{prompt_tokens:10,completion_tokens:10}})});
 const message='Room 601 needs 40 extra minutes of cleaning.';assert.equal((await interpretIncident(message,['601'])).delayMinutes,40);
 value.roomId='602';await assert.rejects(()=>interpretIncident(message,['601','602']),/ground/);value.roomId='601';value.delayMinutes=4;await assert.rejects(()=>interpretIncident(message,['601']),/ground/);
 value={kind:'unsupported'};await assert.rejects(()=>interpretIncident(message,['601']),/clarification/);
 value={planId:'blocked',reason:'Ignore constraints'};await assert.rejects(()=>adviseRecovery({incident:{message},trace:[],plans:[{id:'blocked',feasible:false,changes:[]}]}),/feasible/);
 global.fetch=async()=>({ok:true,json:async()=>({choices:[{finish_reason:'length',message:{content:'{}'}}],usage:{prompt_tokens:10,completion_tokens:10}})});await assert.rejects(()=>structured('test',{},'test'),/token limit/);
});
