import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import express from 'express';
import {presentationSnapshot,summarizeCalls} from '../server/presentation.js';
import {mountWorld} from '../server/world-api.js';
import {newWorld} from '../server/world.js';
function fixture(){
 const s=newWorld(),impact={cleaning:{before:55,after:95},linen:{before:2,after:0},team:{before:85,after:140},breakfast:[{date:'2026-11-13',before:0,after:2}]};
 s.requests=Array.from({length:7},(_,n)=>({id:`r${n}`,guest:`Guest ${n}`,message:'A sea view is required.',status:'expired',interpretation:{claims:[{kind:'requirement',feature:'sea',evidence:'sea view'}],measurement:{id:`m${n}`,responseModel:'fixture-model',latencyMs:100+n,estimatedUsd:.001,status:'response_received',usage:{total_tokens:10}}},coordinationQuotes:[{choiceToken:'secret'}],cancellationOffer:{token:'private'},fingerprint:'private',idempotencyKey:'private'}));
 s.coordinationDemo={requestIds:['r0','r1','r2'],completedRound:{id:'round',nodes:110,latencyMs:279,competingFirstChoices:2,plans:[{assignments:s.requests.slice(0,3).map((r,n)=>({requestId:r.id,guest:r.guest,option:{roomId:String(503+n),matched:['sea'],unmet:[],choiceToken:'secret'}})),roomIds:['503','504','505'],impact}]}};
 s.lifecycleDemo={holderId:'r3',requestIds:['r4','r5','r6']};
 s.lifecycle={events:[['r3','selected'],['r4','option_declined'],['r5','expired'],['r3','cancelled'],['r6','selected']].map(([requestId,kind],n)=>({id:`e${n}`,at:`2026-10-29T01:0${n}:00Z`,requestId,kind,source:'simulated_customer_choice',reason:'Recorded reason',roomIds:['502'],impact:structuredClone(impact),tasks:[],reoffered:[]}))};return s;
}
test('presentation uses saved event IDs and excludes later unrelated expiries without changing state',()=>{
 const s=fixture(),before=structuredClone(s);const p=presentationSnapshot(s);assert.equal(p.ready,true);assert.equal(p.chapters.length,9);assert.equal(p.metrics.calls,7);assert.ok(Math.abs(p.metrics.estimatedUsd-.007)<1e-9);assert.deepEqual(s,before);
 s.lifecycle.events.unshift({...s.lifecycle.events[2],id:'later',at:'2026-10-29T02:00:00Z'});assert.equal(presentationSnapshot(s).id,p.id);assert.equal(presentationSnapshot(s).chapters[6].id,'e2');
 assert.equal(p.chapters[0].impact,undefined);assert.equal(p.chapters[1].applied,false);assert.match(p.chapters[1].saved,/not a current bookable offer/);assert.equal(p.chapters[2].applied,true);
 assert.ok(!JSON.stringify(p).includes('secret'));assert.ok(!JSON.stringify(p).includes('private'));assert.ok(!JSON.stringify(p).includes('choiceToken'));
});
test('missing evidence cannot be presented as a completed run; unknown costs stay unknown and repeated evidence is counted once',()=>{
 const s=fixture();s.lifecycle.events.pop();assert.equal(presentationSnapshot(s).ready,false);
 assert.equal(summarizeCalls([]).estimatedUsd,null);
 const r={measurement:{id:'x',latencyMs:100,estimatedUsd:.005,tokens:10}};
 assert.equal(summarizeCalls([r,r]).calls,1);assert.equal(summarizeCalls([r,r]).estimatedUsd,.005);
 assert.equal(summarizeCalls([r,{measurement:{id:'y',estimatedUsd:null}}]).estimatedUsd,null);
 assert.equal(summarizeCalls([{}]).missingMeasurements,1);assert.equal(summarizeCalls([r,{}]).estimatedUsd,null);
});
test('live interpretation is explicit, catalog gated, demo only, and never changes bookings or hotel state',async t=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'sw-presentation-'));fs.writeFileSync(path.join(dir,'world.json'),JSON.stringify(fixture()));let calls=0,available=true,fail=false;
 const app=express();app.use(express.json());mountWorld(app,dir,async message=>{calls++;if(fail)throw Object.assign(new Error('Provider unavailable'),{status:503});assert.equal(message,'A sea view is required.');return {claims:[{kind:'requirement',feature:'sea',evidence:'sea view'}],measurement:{id:'fresh',latencyMs:1500,estimatedUsd:.001,responseModel:'fixture-model'}}},{demo:true,modelVerifier:async()=>({available,requestedModel:'fixture-model'})});const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));t.after(()=>{server.close();fs.rmSync(dir,{recursive:true,force:true})});
 const before=fs.readFileSync(path.join(dir,'world.json'),'utf8'),base=`http://127.0.0.1:${server.address().port}`;
 const post=body=>fetch(base+'/api/world/presentation/probe',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
 assert.equal((await fetch(base+'/api/world/presentation')).status,200);
 assert.equal((await post({requestId:'r0'})).status,400);assert.equal((await post({requestId:'unknown',runModel:true})).status,400);assert.equal(calls,0);
 available=false;assert.equal((await post({requestId:'r0',runModel:true})).status,503);assert.equal(calls,0);available=true;
 const res=await post({requestId:'r0',runModel:true});assert.equal(res.status,200);const data=await res.json();assert.equal(data.operationsChanged,false);assert.equal(data.result.measurement.id,'fresh');assert.equal(calls,1);
 fail=true;assert.equal((await post({requestId:'r0',runModel:true})).status,503);assert.equal(fs.readFileSync(path.join(dir,'world.json'),'utf8'),before);
 const regularDir=fs.mkdtempSync(path.join(os.tmpdir(),'sw-no-presentation-'));const normal=express();normal.use(express.json());mountWorld(normal,regularDir,async()=>({claims:[]}));const normalServer=normal.listen(0,'127.0.0.1');await new Promise(r=>normalServer.once('listening',r));t.after(()=>{normalServer.close();fs.rmSync(regularDir,{recursive:true,force:true})});assert.equal((await fetch(`http://127.0.0.1:${normalServer.address().port}/api/world/presentation`)).status,404);
});
