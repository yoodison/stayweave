import test from 'node:test';
import assert from 'node:assert/strict';
import {newWorld,acceptRequest,addAmendment,startTask,worldView,refreshRequest} from '../server/world.js';
import {demoInput,addDemoRequest} from '../server/demo.js';
const receive=(s,scenario)=>{const d=demoInput(s,scenario);return addDemoRequest(s,scenario,d,{claims:d.claims})};
const select=(s,r)=>acceptRequest(s,r.id,{optionId:r.options[0].id,version:r.offerVersion,conditionsReviewed:true,customerConfirmed:true});
test('demo new stay and amendment preserve the old promise until atomic choice, with exact operating deltas',()=>{
 const s=newWorld(),r=receive(s,'new'),o=r.options[0];assert.equal(o.roomId,'102');
 const first=select(s,r);const before=structuredClone(s);const change=receive(s,'change');assert.equal(first.status,'confirmed');assert.equal(change.options[0].roomId,'404');
 assert.deepEqual(s.tasks,before.tasks);assert.equal(worldView(s).summary.linenAvailable,worldView(before).summary.linenAvailable);
 const impact=change.options[0].impact;assert.equal(impact.oldRoomId,'102');assert.equal(impact.removed.length,2);assert.equal(impact.linked.length,2);assert.equal(impact.added.length,0);assert.equal(impact.linen.after-impact.linen.before,2);
 const amended=select(s,change);assert.equal(first.status,'replaced');assert.equal(amended.replaces,first.id);assert.equal(r.status,'amended');assert.equal(change.status,'confirmed');assert.deepEqual(change.appliedImpact,impact);
 assert.equal(worldView(s).summary.linenAvailable,impact.linen.after);
 assert.equal(s.tasks.filter(t=>t.bookingId===first.id&&t.status==='scheduled').length,0);
 assert.ok(s.tasks.filter(t=>t.orderId===amended.sharedOrderId).every(t=>t.status!=='cancelled'));
 for(const d of impact.breakfast)assert.equal(worldView(s,d.date).summary.breakfast,d.after);
 const minutes=s.tasks.filter(t=>['scheduled','in_progress'].includes(t.status)).reduce((n,t)=>n+t.end-t.start,0);assert.equal(minutes,impact.team.after);
 const same=select(s,change);assert.equal(same.id,amended.id);
 refreshRequest(s,r.id);assert.equal(r.status,'amended');
});
test('stale, expired and unaccepted changes leave the original reservation and resources intact',()=>{
 const s=newWorld(),r=receive(s,'new'),b=select(s,r),c=receive(s,'change');const before=structuredClone(s);
 assert.throws(()=>acceptRequest(s,c.id,{optionId:c.options[0].id,version:c.offerVersion,customerConfirmed:true,conditionsReviewed:true},Date.parse(c.expiresAt)+1),/expired/);
 assert.deepEqual(s.reservations,before.reservations);assert.deepEqual(s.tasks,before.tasks);assert.equal(b.status,'confirmed');
 s.version++;assert.throws(()=>select(s,c),/changed/);assert.equal(b.status,'confirmed');
});
test('started physical work and checked-in stays require owner coordination instead of automatic amendments',()=>{
 const s=newWorld(),r=receive(s,'new'),b=select(s,r);startTask(s,`${b.id}-cleaning`);
 assert.throws(()=>receive(s,'change'),/owner|started|preparation/i);assert.equal(b.status,'confirmed');
});
test('breakfast capacity and unsupported conditions prevent new commitments',()=>{
 const s=newWorld(),r=receive(s,'new'),b=select(s,r);s.breakfastStock=0;
 const c=receive(s,'change');assert.equal(c.status,'needs_review');assert.equal(c.options.length,0);assert.equal(b.status,'confirmed');
 const before=structuredClone(s),e=receive(s,'exception');assert.equal(e.status,'needs_review');assert.deepEqual(s.reservations,before.reservations);assert.deepEqual(s.tasks,before.tasks);
});
