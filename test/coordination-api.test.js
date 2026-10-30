import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import express from 'express';
import {newWorld} from '../server/world.js';import {mountWorld} from '../server/world-api.js';
test('parallel authenticated agents coordinate and select without double booking or partial saves',async t=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'sw-concurrent-')),s=newWorld();s.requests=[];s.rooms.forEach(r=>r.blocked=!['503','504','505','102'].includes(r.id));fs.writeFileSync(path.join(dir,'world.json'),JSON.stringify(s));
 const make=()=>{const app=express();app.use(express.json());mountWorld(app,dir,async m=>({claims:m.includes('prefer')?[{kind:'preference',feature:'sea',evidence:m}]:[]}));return app.listen(0,'127.0.0.1')};let server=make();await new Promise(r=>server.once('listening',r));t.after(()=>{server.close();fs.rmSync(dir,{recursive:true,force:true})});const key=fs.readFileSync(path.join(dir,'agent-key'),'utf8');
 const call=async(url,body,token=key,idem='concurrent-test-key-000')=>{const r=await fetch(`http://127.0.0.1:${server.address().port}${url}`,{method:body===undefined?'GET':'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+token,'Idempotency-Key':idem},...(body===undefined?{}:{body:JSON.stringify(body)})});return {status:r.status,data:await r.json()}};
 const base={guest:'Existing',message:'Ready room.',checkIn:'2026-11-01',checkOut:'2026-11-03',party:2,breakfast:1,arrival:900,latest:1020,spatial:{roomId:'102'}};
 const parent=(await call('/api/agent/requests',base)).data;
 const select=(x)=>({optionId:x.request.options[0].id,choiceToken:x.request.options[0].choiceToken,version:x.request.offerVersion,conditionsReviewed:true,customerConfirmed:true});
 const saved=(await call(`/api/guest/requests/${parent.request.id}/select`,select(parent),parent.requestToken)).data;
 const before=JSON.parse(fs.readFileSync(path.join(dir,'world.json')));
 const updated={...base,message:'I prefer a sea view.',checkIn:'2026-11-05',checkOut:'2026-11-07',spatial:{minFloor:5,maxFloor:5},requirementsMode:'replace'};
 const results=await Promise.all([call(`/api/guest/requests/${parent.request.id}/changes`,updated,parent.requestToken,'concurrent-change-01'),call('/api/agent/requests',{...updated,guest:'Must sea',spatial:{roomId:'503'}},key,'concurrent-new-001'),call('/api/agent/requests',{...updated,guest:'Flexible'},key,'concurrent-new-002')]);assert.ok(results.every(x=>x.status===201));
 const proposed=JSON.parse(fs.readFileSync(path.join(dir,'world.json')));assert.deepEqual(proposed.reservations,before.reservations);assert.deepEqual(proposed.tasks,before.tasks);assert.equal(proposed.coordination.current.plans[0].served,3);
 const scoped=await Promise.all(results.map(async x=>({...((await call(`/api/guest/requests/${x.data.request.id}`,undefined,x.data.requestToken)).data),requestToken:x.data.requestToken})));
 assert.equal((await call(`/api/guest/requests/${scoped[0].request.id}`,undefined,scoped[1].requestToken)).status,401);
 assert.ok(scoped.every(x=>!('coordinationQuotes' in x.request)));assert.ok(scoped.every(x=>!JSON.stringify(x.request.coordination).includes('Must sea')));
 // Persistence failure cannot cancel the original or consume a customer's choice.
 fs.mkdirSync(path.join(dir,'world.json.tmp'));assert.equal((await call(`/api/guest/requests/${scoped[0].request.id}/select`,select(scoped[0]),scoped[0].requestToken)).status,500);fs.rmdirSync(path.join(dir,'world.json.tmp'));assert.equal(JSON.parse(fs.readFileSync(path.join(dir,'world.json'))).reservations.find(b=>b.id===saved.reservation.id).status,'confirmed');
 const committed=await Promise.all(scoped.map(x=>call(`/api/guest/requests/${x.request.id}/select`,select(x),x.requestToken)));assert.deepEqual(committed.map(x=>x.status),[200,200,200]);assert.equal(new Set(committed.map(x=>x.data.reservation.roomId)).size,3);
 const again=await call(`/api/guest/requests/${scoped[0].request.id}/select`,select(scoped[0]),scoped[0].requestToken);assert.equal(again.data.reservation.id,committed[0].data.reservation.id);
 await new Promise(r=>server.close(r));server=make();await new Promise(r=>server.once('listening',r));assert.equal((await call(`/api/guest/requests/${scoped[0].request.id}`,undefined,scoped[0].requestToken)).data.reservation.id,committed[0].data.reservation.id);
 // Two independent callers insist on the last same room. One can win; no double-booking.
 const race=await Promise.all([0,1].map(i=>call('/api/agent/requests',{...base,guest:'Race '+i,checkIn:'2026-11-10',checkOut:'2026-11-12',spatial:{roomId:'503'}},key,'concurrent-race-00'+i)));const read=await Promise.all(race.map(async x=>({...((await call(`/api/guest/requests/${x.data.request.id}`,undefined,x.data.requestToken)).data),requestToken:x.data.requestToken})));
 const raced=await Promise.all(read.map(x=>call(`/api/guest/requests/${x.request.id}/select`,select(x),x.requestToken)));assert.deepEqual(raced.map(x=>x.status).sort(),[200,409]);
});
