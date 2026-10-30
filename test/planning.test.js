import test from 'node:test';
import assert from 'node:assert/strict';
import {newWorld,addRequest,refreshRequest,acceptRequest} from '../server/world.js';
import {planningDemoInputs,jointPlans,publishJoint,commitJointDemo,recoveryPlans,applyRecovery,resourceTotals} from '../server/planning.js';
import {evaluatePlanning} from '../server/evaluation.js';

function fixture(){
 const s=newWorld();s.rooms.filter(r=>['602','604','605'].includes(r.id)).forEach(r=>r.condition='dirty');
 const ids=planningDemoInputs(s).map(r=>addRequest(s,r,{claims:[...r.hard.map(feature=>({kind:'requirement',feature,evidence:r.message})),...r.preferences.map(feature=>({kind:'preference',feature,evidence:r.message}))]},r.guest,'agent').id);
 return {s,ids};
}
test('joint allocation preserves live state, required scarce access and confirmed rights',()=>{
 const {s,ids}=fixture(),before=structuredClone(s),p=jointPlans(s,ids);
 assert.deepEqual(s,before);assert.equal(p.baseline.served,2);assert.equal(p.plans[0].served,3);
 assert.equal(p.plans[0].assignments[2].roomId,'606');assert.notEqual(p.plans[0].assignments[0].roomId,'606');
 assert.throws(()=>commitJointDemo(s,p,p.plans[0].id,false),/Explicit/);
 commitJointDemo(s,p,p.plans[0].id,true);assert.deepEqual(s.reservations.slice(0,before.reservations.length),before.reservations);
 assert.equal(s.reservations.length,before.reservations.length+3);
 assert.equal(resourceTotals(s).linen,p.plans[0].impact.linen.after);assert.equal(s.linenUsed,before.linenUsed);
 assert.equal(resourceTotals(s).team,p.plans[0].impact.team.after);
 const saved=structuredClone(s);commitJointDemo(s,p,p.plans[0].id,true);assert.deepEqual(s,saved);
 assert.throws(()=>commitJointDemo(s,p,p.plans[1].id,true),/different/);
});
test('published suggestions are not holds and survive safe sequential customer readback',()=>{
 const {s,ids}=fixture(),before=structuredClone(s),p=jointPlans(s,ids),best=p.plans[0];
 publishJoint(s,p,best.id);assert.deepEqual(s.reservations,before.reservations);assert.deepEqual(s.tasks,before.tasks);
 for(const a of best.assignments){const r=refreshRequest(s,a.requestId);assert.equal(r.options[0].roomId,a.roomId);assert.throws(()=>acceptRequest(s,r.id,{optionId:r.options[0].id,version:s.version}),/customer/);acceptRequest(s,r.id,{optionId:r.options[0].id,version:s.version,customerConfirmed:true,conditionsReviewed:true});}
 assert.equal(s.reservations.length,before.reservations.length+3);
});
test('joint proposals reject stale versions, expiry, amendments and duplicate IDs',()=>{
 const {s,ids}=fixture(),p=jointPlans(s,ids);s.version++;assert.throws(()=>publishJoint(s,p,p.plans[0].id),/stale/);s.version--;
 p.expiresAt='2000-01-01T00:00:00Z';assert.throws(()=>commitJointDemo(s,p,p.plans[0].id,true),/expired/);
 assert.throws(()=>jointPlans(s,[ids[0],ids[0]]),/distinct/);s.requests.find(r=>r.id===ids[0]).amendmentOf='protected';assert.throws(()=>jointPlans(s,ids),/protected/);
});
test('recovery protects arrival promises, breaks and dependencies; approval is version-bound and idempotent',()=>{
 const {s,ids}=fixture(),p=jointPlans(s,ids);commitJointDemo(s,p,p.plans[0].id,true);
 const roomId=p.plans[0].assignments.find(a=>a.prep.tasks.some(t=>t.kind==='cleaning')).roomId;
 const before=structuredClone(s),r=recoveryPlans(s,{roomId,delayMinutes:40});assert.deepEqual(s,before);
 const feasible=r.plans.find(p=>p.feasible),blocked=r.plans.find(p=>!p.feasible);assert.ok(feasible);assert.ok(blocked);
 assert.throws(()=>applyRecovery(s,r,blocked.id,true),/manual/);assert.throws(()=>applyRecovery(s,r,feasible.id,false),/approve/);
 applyRecovery(s,r,feasible.id,true);assert.deepEqual(s.reservations,before.reservations);assert.equal(s.linenUsed,before.linenUsed);
 assert.equal(resourceTotals(s).cleaning-resourceTotals(before).cleaning,40);
 assert.equal(s.tasks.filter(t=>t.status==='completed').length,before.tasks.filter(t=>t.status==='completed').length);
 for(const c of feasible.changes){const t=s.tasks.find(t=>t.id===c.id),person=s.team.find(p=>p.id===t.assignee);assert.ok(t.start>=person.start&&t.end<=person.end);assert.ok(person.breaks.every(([a,b])=>t.end<=a||t.start>=b));if(t.kind==='inspection'){const clean=s.tasks.find(x=>x.kind==='cleaning'&&x.bookingId===t.bookingId);assert.ok(t.start>=clean.end);}}
 const saved=structuredClone(s);applyRecovery(s,r,feasible.id,true);assert.deepEqual(s,saved);
 const stale=recoveryPlans(s,{roomId,delayMinutes:1});s.version++;assert.throws(()=>applyRecovery(s,stale,stale.plans[0].id,true),/stale/);
});
test('capacity evaluations require expected outcomes, protecting existing linen reservations during shortages',async()=>{
 const r=await evaluatePlanning(()=>{throw new Error('offline evaluation must not call a model')});assert.equal(r.passed,4);assert.equal(r.total,4);assert.equal(r.cases[0].served,3);assert.equal(r.cases[1].served,1);r.cases.slice(2).forEach(c=>assert.equal(c.served,0));
});
