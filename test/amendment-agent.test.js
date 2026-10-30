import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import express from 'express';
import {mountWorld} from '../server/world-api.js';

test('guest agent negotiates dates, room and party while preserving old commitments until atomic customer selection',async t=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'stayweave-change-'));let calls=0;
 const interpret=async()=>{calls++;return {claims:[]}};
 const create=()=>{const app=express();app.use(express.json());mountWorld(app,dir,interpret);return app.listen(0,'127.0.0.1')};let server=create();await new Promise(r=>server.once('listening',r));t.after(()=>{server.close();fs.rmSync(dir,{recursive:true,force:true})});
 const key=fs.readFileSync(path.join(dir,'agent-key'),'utf8');const call=async(url,body,token=key,idem='test-change-unique-01')=>{const r=await fetch(`http://127.0.0.1:${server.address().port}`+url,{method:body===undefined?'GET':'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+token,'Idempotency-Key':idem},...(body===undefined?{}:{body:JSON.stringify(body)})});return {status:r.status,data:await r.json()}};
 const input={guest:'Negotiation guest',message:'A quiet stay please.',checkIn:'2026-10-29',checkOut:'2026-10-31',party:2,breakfast:1,arrival:900,latest:1000,spatial:{roomId:'102'}};
 const created=await call('/api/agent/requests',input);assert.equal(created.status,201);const parent=created.data.request,cap=created.data.requestToken;
 const first=await call(`/api/guest/requests/${parent.id}/select`,{optionId:parent.options[0].id,version:parent.offerVersion,customerConfirmed:true,conditionsReviewed:true},cap);assert.equal(first.status,200);const old=first.data.reservation;
 const before=(await call('/api/world')).data,proposalInput={...input,guest:'Cannot rename somebody',checkIn:'2026-11-01',checkOut:'2026-11-04',party:3,breakfast:3,spatial:{roomId:'504',type:'family'}};
 const endpoint=`/api/guest/requests/${parent.id}/changes`;
 assert.equal((await call(endpoint,proposalInput,'wrong')).status,401);
 const result=await call(endpoint,proposalInput,cap);assert.equal(result.status,201);assert.equal(result.data.request.guest,'Negotiation guest');assert.equal(result.data.request.status,'offered');assert.equal(result.data.request.options[0].roomId,'504');assert.equal(result.data.originalReservation.status,'confirmed');
 const pending=result.data.request,childCap=result.data.requestToken,n=calls;assert.equal((await call(endpoint,proposalInput,cap)).data.request.id,pending.id);assert.equal(calls,n);assert.equal((await call(endpoint,{...proposalInput,party:4},cap)).status,409);
 const afterProposal=(await call('/api/world')).data;assert.deepEqual(afterProposal.reservations,before.reservations);assert.deepEqual(afterProposal.tasks,before.tasks);assert.equal(afterProposal.summary.linenReserved,before.summary.linenReserved);
 assert.equal((await call(`/api/guest/requests/${pending.id}`,undefined,cap)).status,401);assert.equal((await call(`/api/guest/requests/${parent.id}`,undefined,childCap)).status,401);
 const impact=pending.options[0].impact;assert.equal(impact.stay.after.party,3);assert.equal(impact.stay.before.checkIn,input.checkIn);assert.ok(impact.breakfast.some(x=>x.after!==x.before));
 const selection={optionId:pending.options[0].id,version:pending.offerVersion,conditionsReviewed:true,customerConfirmed:true};assert.equal((await call(`/api/guest/requests/${pending.id}/select`,{...selection,customerConfirmed:false},childCap)).status,400);
 fs.mkdirSync(path.join(dir,'world.json.tmp'));assert.equal((await call(`/api/guest/requests/${pending.id}/select`,selection,childCap)).status,500);assert.deepEqual((await call('/api/world')).data.reservations,before.reservations);fs.rmdirSync(path.join(dir,'world.json.tmp'));
 const selected=await call(`/api/guest/requests/${pending.id}/select`,selection,childCap);assert.equal(selected.status,200);assert.equal(selected.data.reservation.party,3);assert.equal(selected.data.reservation.checkIn,'2026-11-01');assert.equal(selected.data.originalReservation.status,'replaced');assert.equal((await call(`/api/guest/requests/${pending.id}/select`,selection,childCap)).data.reservation.id,selected.data.reservation.id);
 const saved=(await call('/api/world')).data;assert.equal(saved.tasks.filter(t=>t.bookingId===old.id&&t.status==='scheduled').length,0);assert.equal(saved.summary.linenAvailable,impact.linen.after);
 // A second change uses the NEW reservation, never the replaced original.
 const second=await call(`/api/guest/requests/${pending.id}/changes`,{...proposalInput,party:4},childCap,'second-change-unique-01');assert.equal(second.status,201);assert.equal(second.data.request.amendmentOf,selected.data.reservation.id);
 assert.equal((await call(`/api/guest/requests/${second.data.request.id}/withdraw`,{keepOriginal:true},second.data.requestToken)).status,200);assert.equal((await call('/api/world')).data.reservations.find(b=>b.id===selected.data.reservation.id).status,'confirmed');
 await new Promise(r=>server.close(r));server=create();await new Promise(r=>server.once('listening',r));const read=await call(`/api/guest/requests/${pending.id}`,undefined,childCap);assert.equal(read.data.reservation.id,selected.data.reservation.id);assert.equal(read.data.readback,true);
});

test('preserved room rights, stale offers and competing proposals cannot silently replace a stay',async()=>{
 const {newWorld,addRequest,acceptRequest,addAmendment,refreshRequest}=await import('../server/world.js');const s=newWorld();const input={guest:'Rights',message:'Need step-free access.',checkIn:'2026-10-29',checkOut:'2026-10-31',party:2,breakfast:0,arrival:900,latest:1000};
 const r=addRequest(s,input,{claims:[{kind:'requirement',feature:'stepFree',evidence:input.message}]},'seed','agent');const b=acceptRequest(s,r.id,{optionId:r.options[0].id,version:r.offerVersion,customerConfirmed:true,conditionsReviewed:true});
 const change={...input,message:'Change my dates.',checkIn:'2026-11-01',checkOut:'2026-11-03'};const a=addAmendment(s,b.id,change,{claims:[]},'first','agent',{requirementsMode:'preserve'});assert.ok(a.hard.includes('stepFree'));assert.ok(a.options.length);
 const sibling=addAmendment(s,b.id,change,{claims:[]},'second','agent',{requirementsMode:'preserve'});const stale=a.offerVersion;s.version++;assert.throws(()=>acceptRequest(s,a.id,{optionId:a.options[0].id,version:stale,customerConfirmed:true,conditionsReviewed:true}),/changed/);assert.equal(b.status,'confirmed');
 refreshRequest(s,a.id);acceptRequest(s,a.id,{optionId:a.options[0].id,version:a.offerVersion,customerConfirmed:true,conditionsReviewed:true});assert.equal(sibling.status,'amended');assert.equal(sibling.options.length,0);assert.throws(()=>acceptRequest(s,sibling.id,{optionId:'anything',version:s.version,customerConfirmed:true,conditionsReviewed:true}),/not open/);
});

test('replacement closes an older arrival negotiation without changing the retired reservation',async()=>{
 const {newWorld,addRequest,acceptRequest,addAmendment}=await import('../server/world.js');
 const {intakeIncident,reconcileAutopilot}=await import('../server/autopilot.js');
 const s=newWorld(),input={guest:'Protected change',message:'Quiet room.',checkIn:'2026-10-29',checkOut:'2026-10-31',party:2,breakfast:1,arrival:900,latest:1000};
 const r=addRequest(s,input,{claims:[]},'seed','agent');
 const b=acceptRequest(s,r.id,{optionId:r.options[0].id,version:r.offerVersion,customerConfirmed:true,conditionsReviewed:true});
 const c=intakeIncident(s,{kind:'arrival_change',bookingId:b.id,arrival:960},{key:'pending-arrival'});reconcileAutopilot(s);assert.equal(c.status,'exception');
 const a=addAmendment(s,b.id,{...input,checkIn:'2026-11-01',checkOut:'2026-11-03'},{claims:[]},'replacement','agent',{requirementsMode:'preserve'});
 acceptRequest(s,a.id,{optionId:a.options[0].id,version:a.offerVersion,customerConfirmed:true,conditionsReviewed:true});
 reconcileAutopilot(s);assert.equal(b.status,'replaced');assert.equal(b.arrival,900);assert.equal(c.status,'resolved');assert.equal(c.mode,'superseded');assert.equal(c.plan.taskChanges.length,0);
});
