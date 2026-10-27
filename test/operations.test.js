import test from 'node:test';
import assert from 'node:assert/strict';
import { initialState, calculateSchedule, makeOffer, acceptOffer, retryExecution, approveDraft, replayStaffCompletion, invalidatePlan, replan, confirmReadback } from '../server/engine.js';

const selected=(state,options={})=>{acceptOffer(state,{offerId:state.offer.id,optionId:'split',addBreakfast:true,guestAccepted:true,breakfastAccepted:true,...options});return confirmReadback(state,structuredClone(state));};

test('schedule respects departures, breaks, staffing and linen delivery',()=>{
 const state=initialState(), plan=calculateSchedule(state);
 assert.deepEqual(Object.fromEntries(plan.rooms.map(r=>[r.id,r.readyAt])),{'203':870,'204':780,'205':600,'206':795});
 assert.equal(plan.linenAllocated,9); assert.equal(plan.cleaningMinutes,180); assert.equal(plan.inspectionMinutes,45);
 for(const person of state.staff){const tasks=plan.jobs.filter(j=>j.assignee===person.name).sort((a,b)=>a.start-b.start);for(let i=0;i<tasks.length;i++){assert.ok(tasks[i].start>=person.start&&tasks[i].end<=person.end);assert.ok(person.breaks.every(([start,end])=>tasks[i].end<=start||tasks[i].start>=end));if(i)assert.ok(tasks[i-1].end<=tasks[i].start);}}
 assert.ok(plan.jobs.find(j=>j.room==='203'&&j.kind==='cleaning').start>=state.linen.deliveryAt);
});

test('proposal preserves confirmed arrival, shows split option and handles meal buffer',()=>{
 const state=makeOffer(initialState(),initialState().request);
 assert.equal(state.booking.guaranteedArrival,900);assert.equal(state.booking.breakfast,0);
 assert.equal(state.offer.options[0].id,'split');assert.deepEqual(state.offer.options[0].late,['203']);assert.equal(state.offer.options[0].lastReady,870);
 assert.deepEqual(state.offer.breakfast,{covers:30,shortage:3,orderQty:6,amount:24});
 assert.equal(state.tasks.length,0);assert.equal(state.breakfast.order,null);
});

test('guest must explicitly accept both the arrival and meal terms',()=>{
 const state=makeOffer(initialState(),initialState().request);
 assert.throws(()=>acceptOffer(state,{offerId:state.offer.id,optionId:'split',addBreakfast:true}),/guest must select/);
 assert.throws(()=>acceptOffer(state,{offerId:state.offer.id,optionId:'split',addBreakfast:true,guestAccepted:true}),/breakfast terms/);
 assert.equal(state.booking.status,'confirmed');assert.equal(state.breakfast.added,0);
});

test('partial failure never confirms arrival or applies tasks; retry is idempotent',()=>{
 let state=makeOffer(initialState(),initialState().request); const offerId=state.offer.id;
 state=selected(state,{injectFailure:true});assert.equal(state.execution.status,'partially_applied');assert.equal(state.booking.status,'update_pending');assert.equal(state.booking.guaranteedArrival,900);assert.equal(state.tasks.length,0);assert.equal(state.breakfast.added,0);
 state=retryExecution(state);assert.equal(state.execution.status,'applied_unverified');state=confirmReadback(state,structuredClone(state));assert.equal(state.execution.status,'verified');assert.equal(state.tasks.length,6);assert.equal(state.linen.allocated,9);assert.equal(state.breakfast.added,12);assert.equal(state.breakfast.order.quantity,6);assert.equal(state.breakfast.order.status,'approval_required');
 state=acceptOffer(state,{offerId,optionId:'split',addBreakfast:true,guestAccepted:true,breakfastAccepted:true});assert.equal(state.tasks.length,6);assert.equal(state.breakfast.added,12);
 assert.equal(state.rooms.find(r=>r.id==='203').status,'waiting');
});

test('stale offer and stale partial retry do not apply the old plan',()=>{
 let a=makeOffer(initialState(),initialState().request);invalidatePlan(a);assert.throws(()=>selected(a),/property changed/);assert.equal(a.tasks.length,0);
 let b=makeOffer(initialState(),initialState().request);selected(b,{injectFailure:true});invalidatePlan(b);assert.throws(()=>retryExecution(b),/property changed/);assert.equal(b.tasks.length,0);
 // Requests are applied to a cloned state in the server; stale retry is rejected without committing its candidate.
 b.execution.status='partially_applied';replan(b);assert.equal(b.booking.status,'confirmed');assert.equal(b.booking.guaranteedArrival,900);assert.equal(b.offer,null);
});

test('draft approval is scoped and never represents a sent purchase',()=>{
 let state=makeOffer(initialState(),initialState().request);selected(state);const order=state.breakfast.order;
 assert.throws(()=>approveDraft(state,order.id,order.version,order.amount+1),/draft changed/);
 approveDraft(state,order.id,order.version,order.amount);assert.equal(state.breakfast.order.status,'approved_not_sent');
 approveDraft(state,order.id,order.version,order.amount);assert.equal(state.breakfast.order.status,'approved_not_sent');
});

test('staff completion requires a confirmed plan and records simulated evidence',()=>{
 let state=initialState();assert.throws(()=>replayStaffCompletion(state),/confirmed first/);
 makeOffer(state,state.request);selected(state);replayStaffCompletion(state);assert.equal(state.simulatedClock,'29 Oct · 15:00');assert.ok(state.tasks.every(t=>t.status==='completed'&&t.evidence.startsWith('SIM-')));assert.ok(state.rooms.every(r=>r.status==='ready'));
});

test('missing or invalid input cannot silently become a valid request',()=>{
 const state=initialState();assert.throws(()=>makeOffer(state,{requestedTime:840,breakfast:null}),/Enter the arrival/);assert.throws(()=>makeOffer(state,{requestedTime:841,breakfast:12}),/15-minute/);assert.throws(()=>makeOffer(state,{requestedTime:840,breakfast:13}),/between 0 and 12/);
});

test('a mismatched persisted record cannot be marked verified',()=>{
 const state=makeOffer(initialState(),initialState().request);acceptOffer(state,{offerId:state.offer.id,optionId:'split',addBreakfast:true,guestAccepted:true,breakfastAccepted:true});
 const stored=structuredClone(state);stored.tasks.pop();assert.throws(()=>confirmReadback(state,stored),/did not match/);assert.equal(state.execution.status,'applied_unverified');assert.notEqual(state.booking.status,'confirmed_scheduled');
});


test('readback refuses a changed supply draft', () => {
  const state=makeOffer(initialState(),initialState().request);
  acceptOffer(state,{offerId:state.offer.id,optionId:'split',addBreakfast:true,guestAccepted:true,breakfastAccepted:true});
  const stored=structuredClone(state); stored.breakfast.order.amount=0;
  assert.throws(()=>confirmReadback(state,stored),/did not match/);
  assert.equal(state.execution.status,'applied_unverified');
});
