import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import express from 'express';
import {mountWorld} from '../server/world-api.js';

test('HTTP agent lifecycle authenticates, deduplicates, persists and reads back across restart',async t=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'stayweave-world-'));let calls=0;
  const interpreter=async()=>{calls++;await new Promise(r=>setTimeout(r,20));return {claims:[{kind:'requirement',feature:'stepFree',evidence:'need step-free access'}]};};
  function createServer(){const app=express();app.use(express.json());mountWorld(app,dir,interpreter);return app.listen(0,'127.0.0.1');}
  let server=createServer();await new Promise(r=>server.once('listening',r));
  t.after(()=>{server.close();fs.rmSync(dir,{recursive:true,force:true})});
  const key=fs.readFileSync(path.join(dir,'agent-key'),'utf8');
  async function call(url,body,token=key,idem='test-idempotency-key-001'){
    const res=await fetch(`http://127.0.0.1:${server.address().port}${url}`,{method:body===undefined?'GET':'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${token}`,'Idempotency-Key':idem},...(body===undefined?{}:{body:JSON.stringify(body)})});
    return {status:res.status,data:await res.json()};
  }
  const baseline=(await call('/api/world')).data;
  const body={guest:'HTTP guest',message:'I need step-free access.',checkIn:'2026-10-29',checkOut:'2026-10-31',party:2,arrival:840,latest:960,breakfast:2};
  assert.equal((await call('/api/agent/requests',body,'wrong')).status,401);
  const [one,two]=await Promise.all([call('/api/agent/requests',body),call('/api/agent/requests',body)]);
  assert.equal(one.status,201);assert.equal(one.data.request.id,two.data.request.id);assert.equal(calls,1);
  assert.equal((await call('/api/agent/requests',{...body,guest:'Changed'})).status,409);
  const id=one.data.request.id,token=one.data.requestToken;
  assert.equal((await call(`/api/guest/requests/${id}`,undefined,'wrong')).status,401);
  const selected=one.data.request.options[0];
  const payload={optionId:selected.id,version:one.data.request.offerVersion,customerConfirmed:true,conditionsReviewed:true};
  const missing=await call(`/api/guest/requests/${id}/select`,{...payload,conditionsReviewed:false},token);assert.equal(missing.status,400);
  const [accepted,retry]=await Promise.all([call(`/api/guest/requests/${id}/select`,payload,token),call(`/api/guest/requests/${id}/select`,payload,token)]);
  assert.equal(accepted.status,200);assert.equal(retry.data.reservation.id,accepted.data.reservation.id);assert.equal(accepted.data.tasks.length,selected.prep.tasks.length);
  const persisted=JSON.parse(fs.readFileSync(path.join(dir,'world.json'),'utf8'));
  assert.equal(persisted.reservations.filter(b=>b.requestId===id).length,1);assert.equal(persisted.tasks.filter(t=>t.bookingId===accepted.data.reservation.id).length,selected.prep.tasks.length);
  await new Promise(r=>server.close(r));server=createServer();await new Promise(r=>server.once('listening',r));
  const read=await call(`/api/guest/requests/${id}`,undefined,token);assert.equal(read.data.reservation.id,accepted.data.reservation.id);assert.equal(read.data.readback,true);assert.match(read.data.request.channelMessage.text,/confirmed/);assert.match(read.data.request.channelMessage.scope,/local guest page/);
  const owner=await call('/api/world');assert.equal(owner.data.summary.linenReserved,baseline.summary.linenReserved+accepted.data.reservation.linenReserved);assert.equal(owner.data.requests.find(r=>r.id===id).idempotencyKey,undefined);
  const other=owner.data.requests.find(r=>r.guest==='Daniel Kim');
  assert.ok(!other.options.some(o=>o.roomId===accepted.data.reservation.roomId));
  assert.equal(other.offerVersion,owner.data.version);
});

test('failed snapshot write never acknowledges or exposes a half-booked in-memory state',async t=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'stayweave-atomic-'));const app=express();app.use(express.json());mountWorld(app,dir,async()=>({claims:[]}));
  const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));
  t.after(()=>{server.close();fs.rmSync(dir,{recursive:true,force:true})});
  const base=`http://127.0.0.1:${server.address().port}`;
  const before=await(await fetch(base+'/api/world')).json();const r=before.requests.find(r=>r.status==='offered');
  const link=await(await fetch(base+`/api/world/requests/${r.id}/guest-link`,{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'})).json();
  fs.mkdirSync(path.join(dir,'world.json.tmp'));
  const result=await fetch(base+`/api/guest/requests/${r.id}/select`,{method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${link.path.split('#')[1]}`},body:JSON.stringify({optionId:r.options[0].id,version:r.offerVersion,conditionsReviewed:true,customerConfirmed:true})});
  assert.equal(result.status,500);const after=await(await fetch(base+'/api/world')).json();assert.deepEqual(after.reservations,before.reservations);assert.deepEqual(after.tasks,before.tasks);
});

test('schema-1 file is backed up once, expanded, and lifecycle routes persist linked recovery work',async t=>{
  const {newWorld}=await import('../server/world.js');
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'stayweave-migrate-'));
  const legacy=newWorld({legacy:true});fs.writeFileSync(path.join(dir,'world.json'),JSON.stringify(legacy));
  const app=express();app.use(express.json());mountWorld(app,dir,async()=>({claims:[]}));
  const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));
  t.after(()=>{server.close();fs.rmSync(dir,{recursive:true,force:true})});
  const base=`http://127.0.0.1:${server.address().port}`;
  async function call(url,body){const res=await fetch(base+url,body===undefined?{}:{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});return {status:res.status,data:await res.json()};}
  let state=(await call('/api/world')).data;assert.equal(state.rooms.length,36);assert.equal(state.schema,2);
  assert.equal(fs.readFileSync(path.join(dir,'world-before-hotel-expansion.json'),'utf8'),JSON.stringify(legacy));
  assert.equal((await call('/api/world/rooms/506/maintenance',{action:'repair_done',version:0})).status,409);
  assert.equal((await call('/api/world/rooms/506/maintenance',{action:'repair_done',version:state.version})).status,200);
  state=(await call('/api/world')).data;const order=state.workOrders.find(o=>o.roomId==='506');const jobs=state.tasks.filter(t=>t.orderId===order.id);
  assert.equal(jobs.length,2);assert.equal(state.rooms.find(r=>r.id==='506').blocked,true);
  assert.equal((await call(`/api/world/tasks/${jobs[1].id}/start`,{})).status,409);
  // Complete any already-active assignee before starting the newly reserved slot.
  for(const t of state.tasks.filter(t=>t.status==='in_progress'&&jobs.some(j=>j.assignee===t.assignee)))assert.equal((await call(`/api/world/tasks/${t.id}/complete`,{})).status,200);
  for(const t of jobs){assert.equal((await call(`/api/world/tasks/${t.id}/start`,{})).status,200);assert.equal((await call(`/api/world/tasks/${t.id}/complete`,{})).status,200);}
  state=(await call('/api/world')).data;assert.equal(state.rooms.find(r=>r.id==='506').blocked,false);assert.equal(state.roomStates['506'].status,'ready');
  const disk=JSON.parse(fs.readFileSync(path.join(dir,'world.json')));assert.equal(disk.rooms.find(r=>r.id==='506').maintenance.status,'closed');
  assert.equal((await call('/api/world/reservations/HOTEL-104/stay',{action:'check_out'})).status,200);
  state=(await call('/api/world')).data;assert.equal(state.roomStates['104'].status,'scheduled');assert.equal(state.workOrders.find(o=>o.roomId==='104').linenReserved,4);
});

test('demo reset and simulated choices are isolated; amendment retry remains idempotent after acceptance',async t=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'stayweave-demo-')),demoDir=path.join(dir,'demo');fs.mkdirSync(demoDir);let calls=0;
 const app=express();app.use(express.json());const interpreter=async()=>{calls++;await new Promise(r=>setTimeout(r,10));return {claims:[]}};mountWorld(app,dir,interpreter);const router=express.Router();mountWorld(router,demoDir,interpreter,{demo:true});app.use('/api/demo',router);
 const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));t.after(()=>{server.close();fs.rmSync(dir,{recursive:true,force:true})});const base=`http://127.0.0.1:${server.address().port}`;
 const call=async(url,body,headers={})=>{const res=await fetch(base+url,{method:body===undefined?'GET':'POST',headers:{'Content-Type':'application/json',...headers},...(body===undefined?{}:{body:JSON.stringify(body)})});return {status:res.status,data:res.headers.get('content-type')?.includes('json')?await res.json():null}};
 const baseline=fs.readFileSync(path.join(dir,'world.json'),'utf8');assert.equal((await call('/api/world/demo/reset',{})).status,404);
 const received=(await call('/api/demo/api/world/demo/scenario',{scenario:'new',liveModel:false})).data.request;assert.equal(calls,0);
 const selected=await call(`/api/demo/api/world/demo/select/${received.id}`,{optionId:received.options[0].id,version:received.offerVersion,conditionsReviewed:true,customerConfirmed:true,simulateCustomer:true});assert.equal(selected.status,200);
 const demo=(await call('/api/demo/api/world')).data,b=demo.reservations.find(b=>b.requestId===received.id);
 const input={guest:b.guest,message:'I need a family room.',checkIn:b.checkIn,checkOut:b.checkOut,party:3,arrival:840,latest:960,breakfast:3,spatial:{type:'family',minFloor:4,maxFloor:4}};
 const endpoint=`/api/demo/api/world/reservations/${b.id}/change`,headers={'Idempotency-Key':'amendment-test-idem-001'};
 const [one,two]=await Promise.all([call(endpoint,input,headers),call(endpoint,input,headers)]);assert.equal(one.status,201);assert.equal(one.data.request.id,two.data.request.id);assert.equal(calls,1);
 const r=one.data.request;const link=(await call(`/api/demo/api/world/requests/${r.id}/guest-link`,{})).data;
 const accept=await call(`/api/demo/api/guest/requests/${r.id}/select`,{optionId:r.options[0].id,version:r.offerVersion,conditionsReviewed:true,customerConfirmed:true},{Authorization:`Bearer ${link.path.split('#')[1]}`});assert.equal(accept.status,200);
 assert.equal((await call(endpoint,input,headers)).data.request.status,'confirmed');assert.equal(calls,1);
 assert.equal((await call(endpoint,{...input,party:4},headers)).status,409);
 assert.equal((await call('/api/demo/api/world/demo/reset',{})).status,200);assert.equal(fs.readFileSync(path.join(dir,'world.json'),'utf8'),baseline);assert.ok(fs.readdirSync(demoDir).some(n=>n.startsWith('world-before-reset-')));
});

test('channel controls persist and sandbox receipts cannot imply external delivery',async t=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'stayweave-channels-'));
 function serve(){const app=express();app.use(express.json());mountWorld(app,dir,async()=>({claims:[]}));return app.listen(0,'127.0.0.1');}
 let server=serve();await new Promise(r=>server.once('listening',r));t.after(()=>{server.close();fs.rmSync(dir,{recursive:true,force:true})});
 async function call(url,body){const res=await fetch(`http://127.0.0.1:${server.address().port}${url}`,{method:body===undefined?'GET':'POST',headers:{'Content-Type':'application/json'},...(body===undefined?{}:{body:JSON.stringify(body)})});return {status:res.status,data:await res.json()};}
 const before=(await call('/api/world')).data;
 const revision=before.channelControl.revision;
 const change=await call('/api/world/channels/agoda/rules',{revision,draftReplies:false,queueInventory:true});assert.equal(change.status,200);assert.equal(change.data.readback,true);
 assert.equal((await call('/api/world/channels/agoda/rules',{revision,draftReplies:true,queueInventory:true})).status,409);
 let state=(await call('/api/world')).data;assert.equal(state.version,before.version);assert.deepEqual(state.reservations,before.reservations);assert.deepEqual(state.tasks,before.tasks);
 const inventory=state.channelControl.jobs.find(j=>j.channel==='agoda'&&j.entity==='inventory'&&j.status==='connector_needed');
 const simulated=await call(`/api/world/channel-jobs/${inventory.id}/simulate`,{simulate:true});assert.equal(simulated.status,200);assert.equal(simulated.data.externalTransmission,false);
 await new Promise(r=>server.close(r));server=serve();await new Promise(r=>server.once('listening',r));
 state=(await call('/api/world')).data;assert.equal(state.channelControl.channels.find(c=>c.id==='agoda').rule.draftReplies,false);
 const job=state.channelControl.jobs.find(j=>j.id===inventory.id);assert.equal(job.status,'simulated');assert.equal(job.receipt.externalTransmission,false);assert.equal(job.attempts,1);
 assert.equal((await call(`/api/world/channel-jobs/${inventory.id}/simulate`,{simulate:true})).status,200);
 state=(await call('/api/world')).data;assert.equal(state.channelControl.jobs.find(j=>j.id===inventory.id).attempts,1);assert.equal(state.channelControl.externalConnections,0);
});
