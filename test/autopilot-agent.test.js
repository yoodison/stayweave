import test from 'node:test';
import assert from 'node:assert/strict';
import {interpretOps} from '../server/autopilot-agent.js';
import {newWorld} from '../server/world.js';
test('operations interpreter grounds explicit facts and never manufactures consent',async t=>{
 const old=global.fetch,key=process.env.NEBIUS_API_KEY,enabled=process.env.NEBIUS_INFERENCE_ENABLED;process.env.NEBIUS_API_KEY='test';process.env.NEBIUS_INFERENCE_ENABLED='true';t.after(()=>{global.fetch=old;if(key===undefined)delete process.env.NEBIUS_API_KEY;else process.env.NEBIUS_API_KEY=key;if(enabled===undefined)delete process.env.NEBIUS_INFERENCE_ENABLED;else process.env.NEBIUS_INFERENCE_ENABLED=enabled});
 let value;global.fetch=async()=>({ok:true,json:async()=>({choices:[{finish_reason:'stop',message:{content:JSON.stringify(value)}}],usage:{prompt_tokens:10,completion_tokens:10}})});const s=newWorld();
 value={kind:'staff_absence',staffId:'sam',evidence:'Sam is absent today.'};assert.equal((await interpretOps(value.evidence,s)).staffId,'sam');value.staffId='alex';await assert.rejects(()=>interpretOps(value.evidence,s),/named/);
 value={kind:'linen_count',cleanSets:6,evidence:'Physical clean linen count is 60 sets.'};await assert.rejects(()=>interpretOps(value.evidence,s),/grounded/);value.cleanSets=60;assert.equal((await interpretOps(value.evidence,s)).cleanSets,60);value.evidence='invented';await assert.rejects(()=>interpretOps('60 sets',s),/quote/);
 value={kind:'arrival_change',arrival:'15:30',evidence:'I will arrive at 15:30.',guestConsent:true};const out=await interpretOps(value.evidence,s,'SEED-101');assert.equal(out.arrival,930);assert.equal(out.guestConsent,undefined);assert.equal(out.consent,undefined);
 value={kind:'unsupported',evidence:'Move me to a suite tomorrow.'};await assert.rejects(()=>interpretOps(value.evidence,s),/clarification/);
});
