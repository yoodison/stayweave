import test from 'node:test';import assert from 'node:assert/strict';
import {newWorld,addRequest,addAmendment,acceptRequest,refreshRequest} from '../server/world.js';
import {coordinate,reconcileCoordination,selectCoordinated} from '../server/coordination.js';
const input=(guest,spatial={})=>({guest,message:'A quiet stay.',checkIn:'2026-11-05',checkOut:'2026-11-07',party:2,breakfast:2,arrival:900,latest:1020,spatial});
const book=(s,r)=>acceptRequest(s,r.id,{optionId:r.options[0].id,version:r.offerVersion,customerConfirmed:true,conditionsReviewed:true});
const choose=(s,r,o=r.options[0])=>selectCoordinated(s,r.id,{optionId:o.id,choiceToken:o.choiceToken,version:r.offerVersion,customerConfirmed:true,conditionsReviewed:true});
function fixture(){const s=newWorld();s.requests=[];for(const r of s.rooms)r.blocked=!['503','504','505','102'].includes(r.id);return s;}
test('mixed changes and new requests avoid contention and retain all originals until individual choices',()=>{
 const s=fixture(),oldRequest=addRequest(s,{...input('Existing',{roomId:'102'}),checkIn:'2026-11-01',checkOut:'2026-11-03'},{claims:[]},'old','agent'),old=book(s,oldRequest);
 const a=addAmendment(s,old.id,input('Existing',{minFloor:5,maxFloor:5}),{claims:[{kind:'preference',feature:'sea'}]},'change','agent');
 const b=addRequest(s,input('Sea required',{roomId:'503'}),{claims:[]},'sea','agent'),c=addRequest(s,input('Other',{minFloor:5,maxFloor:5}),{claims:[{kind:'preference',feature:'sea'}]},'other','agent');
 const before=structuredClone({reservations:s.reservations,tasks:s.tasks,linenStock:s.linenStock});reconcileCoordination(s);
 assert.deepEqual({reservations:s.reservations,tasks:s.tasks,linenStock:s.linenStock},before);const plan=s.coordination.current.plans[0];assert.equal(plan.served,3);assert.ok(s.coordination.current.competingFirstChoices>=1);assert.equal(plan.assignments.find(a=>a.requestId===b.id).option.roomId,'503');assert.equal(new Set(plan.assignments.map(a=>a.option.roomId)).size,3);
 const choices=[a,b,c].map(r=>({id:r.id,body:{optionId:r.options[0].id,choiceToken:r.options[0].choiceToken,version:r.offerVersion,customerConfirmed:true,conditionsReviewed:true}}));
 for(const x of choices){selectCoordinated(s,x.id,x.body);reconcileCoordination(s);}
 assert.equal(old.status,'replaced');assert.ok([a,b,c].every(r=>r.status==='confirmed'));assert.equal(s.reservations.filter(b=>b.replaces===old.id).length,1);
});
test('unsigned amendments cannot release a room to another guest; automatically recheck after real selection',()=>{
 const s=fixture(),oldr=addRequest(s,input('Existing',{roomId:'503'}),{claims:[]},'o','agent'),old=book(s,oldr),a=addAmendment(s,old.id,input('Existing',{roomId:'505'}),{claims:[]},'a','agent');
 const b=addRequest(s,input('Needs original',{roomId:'503'}),{claims:[]},'b','agent');reconcileCoordination(s);assert.equal(s.coordination.current.plans[0].served,1);assert.equal(b.options.length,0);assert.equal(b.coordination.status,'waiting');assert.equal(s.coordination.exceptions,0);assert.equal(old.status,'confirmed');choose(s,a);reconcileCoordination(s);assert.equal(b.coordination.status,'offered');assert.equal(b.options[0].roomId,'503');
});
test('stale customer terms require new choice; tokens do not grant consent or cross-request access',()=>{
 const s=fixture(),a=addRequest(s,input('A',{roomId:'503'}),{claims:[]},'a','agent'),b=addRequest(s,input('B',{roomId:'505'}),{claims:[]},'b','agent');reconcileCoordination(s);
 const o=a.options[0],body={optionId:o.id,choiceToken:o.choiceToken,version:a.offerVersion,customerConfirmed:true,conditionsReviewed:true};
 assert.throws(()=>selectCoordinated(s,a.id,{...body,choiceToken:b.options[0].choiceToken}),/terms changed/);
 assert.throws(()=>selectCoordinated(s,a.id,{...body,customerConfirmed:false}),/explicitly confirm/);
 s.rooms.find(r=>r.id==='503').nightly++;s.version++;reconcileCoordination(s);assert.throws(()=>selectCoordinated(s,a.id,body),/terms changed/);assert.equal(a.status,'offered');
});
test('scarce linen routes flexible guests to ready rooms, never inventing stock',()=>{
 const s=fixture();s.rooms.find(r=>r.id==='102').condition='dirty';s.linenStock=s.linenUsed+[...s.reservations,...s.workOrders].reduce((n,x)=>n+(x.linenReserved||0),0);
 const a=addRequest(s,input('A'),{claims:[]},'a','agent'),b=addRequest(s,input('B',{roomId:'503'}),{claims:[]},'b','agent'),stock=s.linenStock;
 reconcileCoordination(s);assert.equal(s.coordination.current.plans[0].served,2);assert.ok(s.coordination.current.plans[0].assignments.every(a=>a.option.prep.linen===0));assert.equal(s.linenStock,stock);
});
test('bounded queue processes more customers when a choice frees a batch slot',()=>{
 const s=newWorld();s.requests=[];for(let i=0;i<7;i++)addRequest(s,input('Guest '+i),{claims:[]},'r'+i,'agent');reconcileCoordination(s);assert.equal(s.coordination.queueSize,1);assert.equal(s.coordination.current.requestIds.length,6);const queued=s.requests.find(r=>r.coordination.status==='queued');assert.ok(queued);choose(s,s.requests.find(r=>r.coordination.status==='offered'));reconcileCoordination(s);assert.equal(s.coordination.queueSize,0);assert.ok(s.coordination.current.requestIds.includes(queued.id));
});
test('circular unsigned room swaps escalate instead of leaving both guests waiting forever',()=>{
 const s=fixture(),ar=addRequest(s,input('A',{roomId:'503'}),{claims:[]},'oa','agent'),ab=book(s,ar),br=addRequest(s,input('B',{roomId:'505'}),{claims:[]},'ob','agent'),bb=book(s,br);
 const a=addAmendment(s,ab.id,input('A',{roomId:'505'}),{claims:[]},'ca','agent'),b=addAmendment(s,bb.id,input('B',{roomId:'503'}),{claims:[]},'cb','agent');reconcileCoordination(s);assert.equal(a.coordination.status,'exception');assert.equal(b.coordination.status,'exception');assert.equal(ab.status,'confirmed');assert.equal(bb.status,'confirmed');
});
test('expired quotes and changed visible room details cannot reuse old guest acceptance',()=>{
 const s=fixture(),a=addRequest(s,input('A',{roomId:'503'}),{claims:[]},'a','agent');reconcileCoordination(s);const o=a.options[0],body={optionId:o.id,choiceToken:o.choiceToken,customerConfirmed:true,conditionsReviewed:true};
 s.coordinationQuotes=[];a.coordinationQuotes.find(q=>q.token===o.choiceToken).expiresAt='2000-01-01T00:00:00Z';assert.throws(()=>selectCoordinated(s,a.id,body),/expired/);
 reconcileCoordination(s,{force:true});const newChoice={...body,choiceToken:a.options[0].choiceToken};s.rooms.find(r=>r.id==='503').area++;assert.throws(()=>selectCoordinated(s,a.id,newChoice),/terms changed/);
});
