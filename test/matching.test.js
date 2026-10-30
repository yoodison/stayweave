import test from 'node:test';
import assert from 'node:assert/strict';
import {matchingDefaults,previewMatching} from '../server/matching.js';

function checkPlan(plan){
  const rooms=plan.assignments.filter(a=>a.room).map(a=>a.room.id);
  assert.equal(new Set(rooms).size,rooms.length,'rooms are unique');
  assert.ok(!rooms.includes('205'),'existing reservation remains protected');
  for(const a of plan.assignments){
    if(a.guest.status==='confirmed') assert.ok(a.room && a.room.readyAt<=a.guest.latest,'confirmed arrival remains protected');
    if(a.guest.hard.includes('stepFree')) assert.equal(a.room.stepFree,true);
    if(a.guest.hard.includes('sea')) assert.equal(a.room.sea,true);
  }
}

test('all guests are evaluated together while protecting existing rights',()=>{
  const result=previewMatching(matchingDefaults()),best=result.plans[0];
  assert.equal(best.id,'201-203-202');
  assert.equal(best.matched,3);assert.equal(best.stated,3);assert.equal(best.totalDelay,0);
  assert.equal(best.linenSets,4);assert.equal(best.cleaningMinutes,90);assert.equal(best.inspectionMinutes,30);
  for(const plan of result.plans)checkPlan(plan);
});

test('a linen delay changes the joint allocation without breaking an existing arrival',()=>{
  const settings=matchingDefaults();settings.linenDelayed=true;
  const result=previewMatching(settings),best=result.plans[0];
  assert.equal(best.id,'201-203-204');assert.equal(best.matched,2);assert.equal(best.totalDelay,0);
  assert.equal(best.linenSets,2);assert.equal(best.cleaningMinutes,45);
  const sam=best.assignments.find(a=>a.guest.id==='sam');assert.equal(sam.preferenceMatched,false);
  assert.deepEqual([sam.contrast.roomId,sam.contrast.readyAt,sam.contrast.delayMinutes],['203',915,75]);
  assert.ok(result.plans.some(p=>p.id===sam.contrast.planId),'a relevant trade-off remains selectable');
  assert.ok(result.plans.every(p=>p.id!=='201-203-202'));
  for(const plan of result.plans)checkPlan(plan);
});

test('changing a stated preference recalculates rather than changing guaranteed requirements',()=>{
  const settings=matchingDefaults();settings.preferences.maya='sea';
  const result=previewMatching(settings);assert.ok(result.plans.length);
  for(const plan of result.plans){checkPlan(plan);assert.equal(plan.assignments[0].guest.preference,'sea');assert.equal(plan.assignments[0].preferenceMatched,false);}
});

test('invalid or extra scenario settings are rejected',()=>{
  const s=matchingDefaults();s.preferences.sam='anything';assert.throws(()=>previewMatching(s),/valid preference/);
  assert.throws(()=>previewMatching({...matchingDefaults(),linenDelayed:'true'}),/valid scenario/);
  assert.throws(()=>previewMatching({...matchingDefaults(),untrusted:'field'}),/Unknown/);
});

import {customFitDefaults,previewCustomMatching} from '../server/matching.js';
test('custom inputs produce linked room and preparation plans while preserving assigned rooms',()=>{
  const input=customFitDefaults();
  input.rooms.find(r=>r.id==='203').label='Sunset suite';
  input.guests[2].arrival=900;
  const result=previewCustomMatching(input),plan=result.plans[0];
  assert.ok(plan);assert.equal(plan.assignments.find(a=>a.guest.id==='maya').room.id,'201');
  assert.equal(plan.assignments.find(a=>a.guest.id==='alex').room.id,'202');
  assert.equal(plan.assignments.find(a=>a.guest.id==='sam').room.label,'Sunset suite');
  assert.deepEqual(plan.schedule.jobs.map(j=>j.room).sort(),['202','202','203','203']);
  assert.equal(plan.linenSets,4);assert.equal(plan.cleaningMinutes,90);
  input.linen.onHand=0;input.linen.delivery=0;
  assert.equal(previewCustomMatching(input).plans.length,0,'an assigned confirmed room cannot be silently moved when linen is insufficient');
});
test('custom inputs enforce confirmed rooms, entitlements, dates and unique inventory',()=>{
  const x=customFitDefaults();x.guests[1].assignedRoomId='201';assert.throws(()=>previewCustomMatching(x),/different existing room/);
  const y=customFitDefaults();y.rooms[1].sea=false;assert.equal(previewCustomMatching(y).plans.length,0,'purchased view cannot be silently dropped');
  const z=customFitDefaults();z.checkOut=z.checkIn;assert.throws(()=>previewCustomMatching(z),/later check-out/);
  const d=customFitDefaults();d.rooms[1].id=d.rooms[0].id;assert.throws(()=>previewCustomMatching(d),/unique/);
});
test('custom new guest can remain unassigned when no room fits, without changing a confirmed stay',()=>{
  const x=customFitDefaults();x.guests[2].party=10;const result=previewCustomMatching(x),p=result.plans[0];
  assert.ok(p);assert.equal(p.assignments[2].room,null);assert.equal(p.assignments[0].room.id,'201');assert.equal(p.assignments[1].room.id,'202');
});

test('multiple explicit preferences are scored and required quiet is enforced',()=>{
  const x=customFitDefaults();x.guests[2].arrival=900;x.guests[2].preferences=['sea','quiet'];x.guests[2].hard=['quiet'];
  const result=previewCustomMatching(x),a=result.plans[0].assignments[2];
  assert.equal(a.room.id,'203');assert.equal(a.room.quiet,true);assert.ok(a.reasons.includes('Sea view preference met'));assert.ok(a.reasons.includes('Quiet room preference met'));
  for(const p of result.plans)if(p.assignments[2].room)assert.equal(p.assignments[2].room.quiet,true);
});
test('unresolved unsupported requirements block calculation',()=>{
  const x=customFitDefaults();x.guests[2].unresolvedRequired=['must have an adjoining room'];
  assert.throws(()=>previewCustomMatching(x),/Resolve unsupported required/);
});
