import test from 'node:test';
import assert from 'node:assert/strict';
import {newWorld as createWorld, addRequest, acceptRequest, refreshRequest, optionsFor, completeTask, cancelReservation, editRoom, worldView, validateInbound} from '../server/world.js';

const newWorld=()=>createWorld({legacy:true});
const input=(extra={})=>({guest:'Test guest',message:'I need step-free access and prefer a sea view.',checkIn:'2026-10-29',checkOut:'2026-10-31',party:2,arrival:840,latest:960,breakfast:2,...extra});
const parsed={claims:[{kind:'requirement',feature:'stepFree',evidence:'need step-free access'},{kind:'preference',feature:'sea',evidence:'prefer a sea view'}]};
const request=(s,extra={},interpretation=parsed)=>addRequest(s,input(extra),interpretation,crypto.randomUUID(),'agent');
const select=(s,r,index=0)=>acceptRequest(s,r.id,{optionId:r.options[index].id,version:r.offerVersion,conditionsReviewed:true,customerConfirmed:true});

test('agent preferences produce options, fixed staff work, linen and breakfast together',()=>{
  const s=newWorld(),r=request(s);assert.ok(r.options.length);
  assert.equal(r.options[0].roomId,'103'); assert.ok(r.options.every(o=>s.rooms.find(room=>room.id===o.roomId).stepFree));
  const b=select(s,r);assert.equal(b.roomId,'103');assert.equal(b.total,378);
  assert.equal(s.tasks.filter(t=>t.bookingId===b.id).length,2);
  assert.equal(worldView(s).summary.linenAvailable,22);
  assert.equal(worldView(s,'2026-10-30').summary.breakfast,6);
  assert.equal(worldView(s,'2026-10-31').summary.breakfast,6);
  assert.equal(worldView(s,'2026-11-01').summary.breakfast,0);
});
test('customer consent, reviewed interpretation, expiry and exact version are mandatory',()=>{
  const s=newWorld(),r=request(s),payload={optionId:r.options[0].id,version:r.offerVersion,conditionsReviewed:true,customerConfirmed:true};
  assert.throws(()=>acceptRequest(s,r.id,{...payload,customerConfirmed:false}),/customer/);
  assert.throws(()=>acceptRequest(s,r.id,{...payload,conditionsReviewed:false}),/review/);
  assert.throws(()=>acceptRequest(s,r.id,payload,Date.parse(r.expiresAt)+1),/expired/);
  assert.throws(()=>acceptRequest(s,r.id,{...payload,version:99}),/changed/);
  assert.equal(s.reservations.length,3);
});
test('two offers competing for one room cannot double-book it; retries remain idempotent',()=>{
  const s=newWorld(),a=request(s),b=request(s,{guest:'Other guest'});
  const option=a.options[0].id,booking=select(s,a),tasks=structuredClone(s.tasks);
  assert.throws(()=>select(s,b),/changed/);
  refreshRequest(s,b.id);assert.ok(!b.options.some(o=>o.roomId===booking.roomId));
  assert.equal(acceptRequest(s,a.id,{optionId:option}).id,booking.id);
  assert.equal(s.reservations.length,4);assert.deepEqual(s.tasks,tasks);
  assert.throws(()=>acceptRequest(s,a.id,{optionId:'different'}),/different/);
});
test('existing bookings and staff reservations stay fixed and breaks cannot overlap',()=>{
  const s=newWorld(),r=request(s),a=select(s,r),original=structuredClone(s.tasks);
  const r2=request(s,{guest:'Second guest'}, {claims:[]});select(s,r2);
  assert.deepEqual(s.tasks.filter(t=>t.bookingId===a.id),original);
  for(const t of s.tasks){const p=s.team.find(p=>p.id===t.assignee);assert.ok(t.start>=p.start&&t.end<=p.end);assert.ok(p.breaks.every(([a,b])=>t.end<=a||t.start>=b));}
  for(const a of s.tasks)for(const b of s.tasks)if(a.id!==b.id&&a.assignee===b.assignee&&a.date===b.date)assert.ok(a.end<=b.start||b.end<=a.start);
});
test('unsupported mandatory needs and scarce linen never become automatic booking',()=>{
  const s=newWorld(),r=request(s,{}, {claims:[{kind:'unsupported_required',feature:null,evidence:'connecting rooms'}]});
  assert.equal(r.status,'needs_review');assert.equal(r.options.length,0);
  assert.throws(()=>acceptRequest(s,r.id,{}),/not open/);
  s.linenStock=0;const r2=request(s);assert.equal(r2.status,'needs_review');
});
test('work completion is ordered and cancellation releases only unconsumed linen',()=>{
  const s=newWorld(),r=request(s),b=select(s,r);
  assert.throws(()=>completeTask(s,`${b.id}-inspection`),/cleaning/);
  completeTask(s,`${b.id}-cleaning`);completeTask(s,`${b.id}-cleaning`);
  assert.equal(s.linenUsed,2);assert.equal(b.linenReserved,0);
  cancelReservation(s,b.id);cancelReservation(s,b.id);
  assert.equal(s.linenUsed,2);assert.equal(worldView(s).summary.linenAvailable,22);
  assert.throws(()=>completeTask(s,`${b.id}-inspection`),/no longer/);
});
test('cancel before work restores reserved resources and retires pending tasks',()=>{
  const s=newWorld(),r=request(s),b=select(s,r);cancelReservation(s,b.id);
  assert.equal(worldView(s).summary.linenAvailable,24);assert.equal(s.tasks.filter(t=>t.status==='scheduled').length,0);
  assert.equal(r.status,'cancelled');assert.throws(()=>select(s,r),/not open/);
});
test('back-to-back stays require turnover; future work cannot be marked completed today',()=>{
  const s=newWorld(),r=request(s),b=select(s,r);
  const next=request(s,{checkIn:'2026-10-31',checkOut:'2026-11-02'});
  const o=next.options.find(o=>o.roomId===b.roomId);assert.ok(o);assert.equal(o.prep.linen,2);assert.ok(o.prep.tasks[0].start>=660);
  const b2=select(s,next,next.options.indexOf(o));assert.throws(()=>completeTask(s,`${b2.id}-cleaning`),/today/);
});
test('insertion before a later prepared stay cannot invent an unplanned turnover',()=>{
  const s=newWorld();const seed=s.reservations.find(b=>b.roomId==='101');seed.checkIn='2026-11-02';seed.checkOut='2026-11-04';
  const r=request(s);assert.ok(!r.options.some(o=>o.roomId==='101'));
});
test('room edits preserve existing commitments and invalidate previous offers',()=>{
  const s=newWorld(),r=request(s),room=s.rooms.find(r=>r.id==='103');
  assert.throws(()=>editRoom(s,'101',{...s.rooms[0],version:s.version}),/confirmed stay/);
  editRoom(s,'103',{...room,blocked:true,version:s.version});assert.throws(()=>select(s,r),/changed/);
  refreshRequest(s,r.id);assert.ok(!r.options.some(o=>o.roomId==='103'));
});
test('invalid dates, unsupported party size and reversed arrival windows are rejected',()=>{
  const s=newWorld();for(const extra of [{checkIn:'2026-02-30'},{party:7},{latest:700},{checkOut:'2026-10-28'},{checkOut:'2027-01-01'}])assert.throws(()=>validateInbound(s,input(extra)));
});
