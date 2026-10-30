import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import express from 'express';
import {mountWorld} from '../server/world-api.js';

test('isolated planning HTTP flow persists offers, simulated consent, recovery and readback atomically',async t=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'stayweave-plans-')),demoDir=path.join(dir,'demo');fs.mkdirSync(demoDir);
 const app=express();app.use(express.json());mountWorld(app,dir,async()=>({claims:[]}));const router=express.Router();
 mountWorld(router,demoDir,async()=>({claims:[]}),{demo:true,incidentInterpreter:async()=>({roomId:'601',delayMinutes:40,evidence:'40 extra minutes',message:'Room 601 needs 40 extra minutes of cleaning.'}),recoveryAdvisor:async p=>({planId:p.plans.find(p=>p.feasible).id,reason:'Test adviser'})});app.use('/api/demo',router);
 const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));t.after(()=>{server.close();fs.rmSync(dir,{recursive:true,force:true})});
 const base=`http://127.0.0.1:${server.address().port}`,call=async(url,body)=>{const res=await fetch(base+url,{method:body===undefined?'GET':'POST',headers:{'Content-Type':'application/json'},...(body===undefined?{}:{body:JSON.stringify(body)})});return {status:res.status,data:res.headers.get('content-type')?.includes('json')?await res.json():null}};
 const original=fs.readFileSync(path.join(dir,'world.json'),'utf8');
 assert.equal((await call('/api/world/planning/demo-intake',{})).status,404);
 const prefix='/api/demo/api/world/planning/',intake=(await call(prefix+'demo-intake',{live:false})).data;assert.equal(intake.requestIds.length,3);
 assert.deepEqual((await call(prefix+'demo-intake',{})).data.requestIds,intake.requestIds);
 const p=(await call(prefix+'joint',{requestIds:intake.requestIds})).data.proposal,best=p.plans[0];assert.equal(best.served,3);
 assert.equal((await call(prefix+p.id+'/publish',{planId:best.id})).status,200);
 assert.equal((await call(prefix+p.id+'/demo-confirm',{planId:best.id})).status,400);
 const before=(await call('/api/demo/api/world')).data;
 // A failed rename transaction must not expose partial multi-guest bookings.
 fs.mkdirSync(path.join(demoDir,'world.json.tmp'));
 assert.equal((await call(prefix+p.id+'/demo-confirm',{planId:best.id,simulateCustomers:true})).status,500);
 assert.deepEqual((await call('/api/demo/api/world')).data.reservations,before.reservations);fs.rmdirSync(path.join(demoDir,'world.json.tmp'));
 assert.equal((await call(prefix+p.id+'/demo-confirm',{planId:best.id,simulateCustomers:true})).status,200);
 const recovered=(await call(prefix+'incident',{message:'Room 601 needs 40 extra minutes of cleaning.'})).data.proposal,plan=recovered.plans.find(p=>p.feasible);assert.ok(plan);
 assert.equal((await call(prefix+recovered.id+'/apply',{planId:plan.id})).status,400);
 assert.equal((await call(prefix+recovered.id+'/apply',{planId:plan.id,confirmed:true})).status,200);
 const read=(await call('/api/demo/api/world')).data,disk=JSON.parse(fs.readFileSync(path.join(demoDir,'world.json')));
 assert.equal(read.planning.proposals[0].status,'applied');assert.deepEqual(disk.tasks,read.tasks);assert.deepEqual(disk.reservations,read.reservations);
 assert.equal(fs.readFileSync(path.join(dir,'world.json'),'utf8'),original);
});
