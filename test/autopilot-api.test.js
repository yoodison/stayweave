import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import express from 'express';
import {mountWorld} from '../server/world-api.js';
import {defaultPolicy} from '../server/autopilot.js';

test('autopilot HTTP saves atomically, replays without inference, binds consent to guest capability and survives restart',async t=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'stayweave-auto-'));let calls=0;
 const opsInterpreter=async(message)=>{calls++;return {kind:'linen_count',cleanSets:70,message,evidence:message}};
 function create(){const app=express();app.use(express.json());mountWorld(app,dir,async()=>({claims:[]}),{opsInterpreter,demo:true});return app.listen(0,'127.0.0.1')}
 let server=create();await new Promise(r=>server.once('listening',r));t.after(()=>{server.close();fs.rmSync(dir,{recursive:true,force:true})});
 const call=async(url,body,headers={})=>{const r=await fetch(`http://127.0.0.1:${server.address().port}`+url,{method:body===undefined?'GET':'POST',headers:{'Content-Type':'application/json',...headers},...(body===undefined?{}:{body:JSON.stringify(body)})});return {status:r.status,data:await r.json()}};
 const root='/api/world',auto=root+'/autopilot';
 const schema=(await call('/api/agent/schema')).data;assert.equal(schema.version,6);assert.match(schema.arrivalChange,/arrival-change/);
 assert.equal((await call(auto+'/policy',{...defaultPolicy(),enabled:true})).status,200);
 let s=(await call(root)).data;const body={version:s.version,live:true,message:'Physical clean linen count is 70 sets.',incident:{kind:'linen_count'}},headers={'Idempotency-Key':'ops-report-test-001'};
 fs.mkdirSync(path.join(dir,'world.json.tmp'));assert.equal((await call(auto+'/report',body,headers)).status,500);assert.equal((await call(root)).data.linenStock,s.linenStock);assert.equal((await call(root)).data.autopilot.cases.length,0);fs.rmdirSync(path.join(dir,'world.json.tmp'));
 const recorded=await call(auto+'/report',body,headers);assert.equal(recorded.status,200);assert.equal(recorded.data.case.mode,'automatic');const n=calls;
 assert.equal((await call(auto+'/report',{...body,version:body.version+1},headers)).data.case.id,recorded.data.case.id);assert.equal(calls,n);assert.equal((await call(auto+'/report',{...body,message:'different'},headers)).status,409);
 assert.equal((await call(auto+'/report',{...body,version:0},{'Idempotency-Key':'stale-report-test-001'})).status,409);
 // A guest capability can change only its own reservation, with explicit confirmation.
 s=(await call(root)).data;const request=s.requests.find(r=>r.status==='offered'),link=(await call(`${root}/requests/${request.id}/guest-link`,{})).data;
 const auth={Authorization:'Bearer '+link.path.split('#')[1],'Idempotency-Key':'guest-arrival-test-001'};
 const accepted=await call(`/api/guest/requests/${request.id}/select`,{optionId:request.options[0].id,version:request.offerVersion,conditionsReviewed:true,customerConfirmed:true},auth);assert.equal(accepted.status,200);
 const b=accepted.data.reservation,endpoint=`/api/guest/requests/${request.id}/arrival-change`,arrival=b.arrival+30;
 const waiting=await call(auto+'/report',{version:(await call(root)).data.version,live:false,incident:{kind:'arrival_change',bookingId:b.id,arrival}},{'Idempotency-Key':'pending-arrival-test-001'});assert.equal(waiting.data.case.status,'exception');
 assert.equal((await call(auto+'/'+waiting.data.case.id+'/consent',{version:0,confirmed:true,arrival,bookingId:b.id})).status,409);
 assert.equal((await call(endpoint,{arrival,confirmed:true})).status,401);
 assert.equal((await call(endpoint,{arrival,confirmed:false},auth)).status,400);
 const other=s.requests.find(r=>r.id!==request.id);assert.equal((await call(`/api/guest/requests/${other.id}/arrival-change`,{arrival,confirmed:true},auth)).status,401);
 const changed=await call(endpoint,{arrival,confirmed:true},auth);assert.equal(changed.status,200);assert.equal(changed.data.status,'resolved');assert.equal(changed.data.reservation.arrival,arrival);assert.equal(changed.data.reservation.roomId,b.roomId);assert.equal(changed.data.reservation.total,b.total);
 assert.equal((await call(endpoint,{arrival,confirmed:true},auth)).status,200);assert.equal((await call(endpoint,{arrival:arrival+10,confirmed:true},auth)).status,409);
 const before=(await call(root)).data;assert.equal(before.autopilot.cases.length,2);assert.equal(before.autopilot.cases.find(c=>c.id===waiting.data.case.id).consent.source,'guest_capability');
 const next=await call(auto+'/report',{version:before.version,live:false,incident:{kind:'arrival_change',bookingId:b.id,arrival:arrival+15}},{'Idempotency-Key':'attested-arrival-test-001'});assert.equal(next.data.case.status,'exception');
 const current=(await call(root)).data,attested=await call(auto+'/'+next.data.case.id+'/consent',{version:current.version,confirmed:true,arrival:arrival+15,bookingId:b.id});assert.equal(attested.status,200);assert.equal(attested.data.case.status,'resolved');assert.equal(attested.data.case.consent.source,'owner_attested');
 const saved=(await call(root)).data;
 await new Promise(r=>server.close(r));server=create();await new Promise(r=>server.once('listening',r));const after=(await call(root)).data;assert.deepEqual(after.autopilot,saved.autopilot);assert.deepEqual(after.tasks,saved.tasks);assert.equal(after.reservations.find(x=>x.id===b.id).arrival,arrival+15);
});
