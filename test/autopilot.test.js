import test from 'node:test';
import assert from 'node:assert/strict';
import {newWorld,queueTurnover,addRequest,acceptRequest,startTask,completeTask} from '../server/world.js';
import {defaultPolicy,setPolicy,intakeIncident,reconcileAutopilot,approveCase,alternatives} from '../server/autopilot.js';
const enable=(s,extra={})=>setPolicy(s,{...defaultPolicy(),revision:s.autopilot?.policy.revision||0,enabled:true,...extra});
function report(s,x,key='case-key'){const c=intakeIncident(s,x,{key});reconcileAutopilot(s);return c}
test('absence automatically reassigns unstarted work, preserves before/after and excludes future allocation',()=>{
 const s=newWorld();queueTurnover(s,'602');enable(s);const task=s.tasks.find(t=>t.roomId==='602'&&t.kind==='cleaning'),absent=task.assignee,before=structuredClone(s.reservations);
 const c=report(s,{kind:'staff_absence',staffId:absent});assert.equal(c.status,'resolved');assert.equal(c.mode,'automatic');assert.notEqual(task.assignee,absent);assert.equal(c.plan.taskChanges.find(t=>t.id===task.id).before.assignee,absent);assert.deepEqual(s.reservations,before);
 queueTurnover(s,'604');assert.ok(s.tasks.filter(t=>t.roomId==='604').every(t=>t.assignee!==absent));
 const snapshot=JSON.stringify(s.tasks);reconcileAutopilot(s);assert.equal(JSON.stringify(s.tasks),snapshot);
});
test('active staff absence becomes an exception, never inventing a handover',()=>{
 const s=newWorld();enable(s);const t=s.tasks.find(t=>t.status==='in_progress'),before=structuredClone(s.tasks);const c=report(s,{kind:'staff_absence',staffId:t.assignee});assert.equal(c.status,'exception');assert.match(c.reason,/handover/);assert.deepEqual(s.tasks,before);
 assert.throws(()=>approveCase(s,c.id,{confirmed:true,version:s.version,policyRevision:s.autopilot.policy.revision,planKey:c.plan.key}),/handover/);
});
test('linen count releases only unbooked unstarted turnover; no stock is invented',()=>{
 const s=newWorld();queueTurnover(s,'602');enable(s);const reserved=[...s.reservations,...s.workOrders].reduce((n,b)=>n+(b.linenReserved||0),0),before=structuredClone(s.reservations),used=s.linenUsed;
 const c=report(s,{kind:'linen_count',cleanSets:reserved-2});assert.equal(c.status,'resolved');assert.ok(c.plan.deferralRooms.includes('602'));assert.equal(s.linenStock,used+reserved-2);assert.equal(s.linenUsed,used);assert.deepEqual(s.reservations,before);assert.equal(s.workOrders.find(o=>o.roomId==='602').status,'deferred');
 const blocked=report(s,{kind:'linen_count',cleanSets:0},'empty');assert.equal(blocked.status,'exception');assert.ok(blocked.plan.shortage>0);const cleaning=s.tasks.find(t=>t.kind==='cleaning'&&t.status==='in_progress');assert.throws(()=>completeTask(s,cleaning.id),/linen/);
});
test('owner limits, policy pause/expiry, version and approval bind the exact plan',()=>{
 const s=newWorld();queueTurnover(s,'602');enable(s,{maxTasks:0});const t=s.tasks.find(t=>t.roomId==='602'&&t.kind==='cleaning'),c=report(s,{kind:'staff_absence',staffId:t.assignee});assert.equal(c.status,'exception');assert.match(c.reason,/limit/);
 assert.throws(()=>approveCase(s,c.id,{confirmed:true,version:s.version-1,policyRevision:s.autopilot.policy.revision,planKey:c.plan.key}),/changed/);
 approveCase(s,c.id,{confirmed:true,version:s.version,policyRevision:s.autopilot.policy.revision,planKey:c.plan.key});assert.equal(c.mode,'owner_approved');
 const paused=newWorld();const p=report(paused,{kind:'linen_count',cleanSets:70});assert.equal(p.status,'exception');assert.match(p.reason,/paused/);
 enable(paused);paused.autopilot.policy.expiresAt='2000-01-01T00:00:00Z';reconcileAutopilot(paused);assert.equal(p.status,'exception');
});
test('arrival change needs exact separate guest consent and never changes room, price or meals',()=>{
 const s=newWorld();enable(s);const b=s.reservations.find(b=>b.id==='SEED-101'),original=structuredClone(b);
 const c=report(s,{kind:'arrival_change',bookingId:b.id,arrival:960});assert.equal(c.status,'exception');assert.equal(b.arrival,original.arrival);assert.match(c.reason,/consent/);
 c.consent={bookingId:b.id,arrival:950};reconcileAutopilot(s);assert.equal(c.status,'exception');
 c.consent={bookingId:b.id,arrival:960,source:'guest_capability'};reconcileAutopilot(s);assert.equal(c.mode,'automatic');assert.equal(b.arrival,960);assert.deepEqual({...b,arrival:original.arrival},original);
});
test('rescheduled work remains within shifts, protected breaks and cleaning dependencies',()=>{
 const s=newWorld();queueTurnover(s,'602');queueTurnover(s,'604');enable(s);const c=report(s,{kind:'staff_absence',staffId:s.tasks.find(t=>t.roomId==='602'&&t.kind==='cleaning').assignee});assert.equal(c.status,'resolved');
 const tasks=s.tasks.filter(t=>t.date===s.date&&['scheduled','in_progress'].includes(t.status));
 for(const t of tasks){const p=s.team.find(p=>p.id===t.assignee);assert.ok(t.start>=p.start&&t.end<=p.end);assert.ok(p.breaks.every(([a,b])=>t.end<=a||t.start>=b));assert.ok(!p.unavailableDates?.includes(s.date));for(const other of tasks.filter(o=>o.id!==t.id&&o.assignee===t.assignee))assert.ok(t.end<=other.start||t.start>=other.end);if(t.kind==='inspection'){const cl=tasks.find(o=>o.kind==='cleaning'&&(t.orderId?o.orderId===t.orderId:o.bookingId===t.bookingId));if(cl)assert.ok(t.start>=cl.end);}}
});
test('earlier arrival explores another qualified cleaner when keeping the assignee misses the deadline',()=>{
 const s=newWorld();s.rooms.find(r=>r.id==='602').releaseAt=660;queueTurnover(s,'602');const o=s.workOrders.find(o=>o.roomId==='602'),b=s.reservations.find(b=>b.id==='SEED-101');Object.assign(b,{roomId:'602',sharedOrderId:o.id,arrival:900});
 const clean=s.tasks.find(t=>t.orderId===o.id&&t.kind==='cleaning'),inspect=s.tasks.find(t=>t.orderId===o.id&&t.kind==='inspection');Object.assign(clean,{assignee:'alex',assigneeName:'Alex',start:780,end:830});Object.assign(inspect,{assignee:'jules',assigneeName:'Jules',start:830,end:845});enable(s);
 const c=intakeIncident(s,{kind:'arrival_change',bookingId:b.id,arrival:840},{key:'early-arrival',consent:{bookingId:b.id,arrival:840}});reconcileAutopilot(s);
 assert.equal(c.status,'resolved');assert.notEqual(clean.assignee,'alex');assert.ok(inspect.end+15<=840);assert.ok(c.plan.maxShift<=120);assert.equal(b.arrival,840);
});
