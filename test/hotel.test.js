import test from 'node:test';
import assert from 'node:assert/strict';
import {newWorld,expandHotel,addRequest,acceptRequest,refreshRequest,completeTask,startTask,queueTurnover,maintenanceAction,stayAction,editRoom,worldView,validateInbound} from '../server/world.js';
import {roomTypes,roomSnapshot} from '../shared/hotel.js';
const input=(extra={})=>({guest:'Hotel QA guest',message:'I need a family room. I prefer a high floor.',checkIn:'2026-10-29',checkOut:'2026-10-31',party:3,arrival:840,latest:1020,breakfast:2,...extra});
const req=(s,extra={},claims=[])=>addRequest(s,input(extra),{claims},crypto.randomUUID(),'agent');
const select=(s,r,i=0)=>acceptRequest(s,r.id,{optionId:r.options[i].id,version:r.offerVersion,conditionsReviewed:true,customerConfirmed:true});
const byRoom=(s,id)=>s.rooms.find(r=>r.id===id);
const jobs=(s,order)=>s.tasks.filter(t=>t.orderId===order.id);

test('schema migration adds 36 spatially described rooms without changing prior reservation or task records',()=>{
  const old=newWorld({legacy:true});const request=req(old,{party:2},[{kind:'requirement',feature:'sea',evidence:'sea'}]);select(old,request);
  const before=structuredClone(old),s=expandHotel(old);
  assert.equal(s.schema,2);assert.equal(s.rooms.length,36);assert.equal(new Set(s.rooms.map(r=>r.id)).size,36);
  assert.deepEqual(new Set(s.rooms.map(r=>r.type)),new Set(Object.keys(roomTypes)));
  assert.equal(new Set(s.rooms.map(r=>r.floor)).size,6);
  for(const r of s.rooms){assert.ok(r.distances.elevator>0);assert.ok(r.area>=26);assert.ok(['sea','city','garden'].includes(r.view));}
  for(const b of before.reservations)assert.deepEqual(s.reservations.find(x=>x.id===b.id),b);
  for(const t of before.tasks)assert.deepEqual(s.tasks.find(x=>x.id===t.id),t);
  assert.deepEqual(old,before);assert.deepEqual(expandHotel(s),s);assert.equal(s.linenStock,before.linenStock+60);
});
test('exact type, floor, view and route limits are enforced before preferences',()=>{
  const s=newWorld();
  const r=req(s,{spatial:{type:'family',view:'garden',minFloor:4,maxFloor:5,elevatorMax:35,breakfastMax:75,gymMax:60,poolMax:85}},[{kind:'preference',feature:'highFloor',evidence:'high floor'},{kind:'requirement',feature:'family',evidence:'family room'}]);
  assert.deepEqual(r.options.map(o=>o.roomId),['404','504']);
  assert.ok(r.options.every(o=>o.matched.includes('highFloor')&&o.reasons.some(x=>x.includes('34 m ≤ 35 m'))));
  const impossible=req(s,{spatial:{type:'family',elevatorMax:20}});assert.equal(impossible.status,'needs_review');
  assert.throws(()=>validateInbound(s,input({spatial:{minFloor:6,maxFloor:2}})),/Minimum floor/);
  assert.throws(()=>validateInbound(s,input({spatial:{elevatorMax:-1}})),/elevatorMax/);
  assert.throws(()=>validateInbound(s,input({spatial:{floor:4}})),/Unknown/);
});
test('booking reuses existing turnover work and linen without reserving it twice',()=>{
  const s=newWorld(),before=worldView(s).summary,breakfastBefore=worldView(s,'2026-10-30').summary.breakfast;const r=req(s,{spatial:{type:'family',minFloor:4,maxFloor:4}});assert.equal(r.options.length,1);
  assert.ok(r.options[0].prep.sharedOrderId);const taskCount=s.tasks.length;
  const b=select(s,r);assert.ok(b.sharedOrderId);assert.equal(b.linenReserved,0);assert.equal(s.tasks.length,taskCount);
  assert.equal(worldView(s).summary.linenReserved,before.linenReserved);
  assert.equal(worldView(s,'2026-10-30').summary.breakfast,breakfastBefore+2);
});
test('recorded work status changes to cleaning then inspection then ready, with linen consumed once',()=>{
  const s=newWorld(),room=byRoom(s,'102'),o=queueTurnover(s,room.id);const [clean,inspect]=jobs(s,o);
  assert.equal(roomSnapshot(s,room).status,'scheduled');
  assert.throws(()=>startTask(s,inspect.id),/Complete cleaning/);
  // A current sample job uses Alex; finish it before starting Alex's next room.
  for(const t of s.tasks.filter(t=>t.assignee===clean.assignee&&t.status==='in_progress'))completeTask(s,t.id);
  const used=s.linenUsed;startTask(s,clean.id);assert.equal(roomSnapshot(s,room).status,'cleaning');
  completeTask(s,clean.id);completeTask(s,clean.id);assert.equal(s.linenUsed,used+room.linen);assert.equal(roomSnapshot(s,room).status,'inspection');
  for(const t of s.tasks.filter(t=>t.assignee===inspect.assignee&&t.status==='in_progress'))completeTask(s,t.id);
  startTask(s,inspect.id);assert.equal(roomSnapshot(s,room).status,'inspecting');completeTask(s,inspect.id);assert.equal(roomSnapshot(s,room).status,'ready');
  assert.equal(o.status,'completed');assert.equal(o.linenReserved,0);
});
test('maintenance excludes rooms and recovery inspection is the only path back on sale',()=>{
  const s=newWorld(),room=byRoom(s,'506');assert.equal(roomSnapshot(s,room).status,'repair');
  assert.ok(req(s,{party:2,spatial:{type:'accessible',minFloor:5,maxFloor:5}}).options.length===0);
  maintenanceAction(s,'506',{action:'repair_done',version:s.version});assert.equal(room.blocked,true);assert.equal(room.maintenance.status,'recovery');
  const o=s.workOrders.find(o=>o.roomId==='506');assert.equal(o.status,'scheduled');
  const [clean,inspect]=jobs(s,o);assert.throws(()=>completeTask(s,inspect.id),/cleaning/);
  completeTask(s,clean.id);assert.equal(room.blocked,true);completeTask(s,inspect.id);assert.equal(room.blocked,false);assert.equal(room.maintenance.status,'closed');
  assert.equal(req(s,{party:2,spatial:{type:'accessible',minFloor:5,maxFloor:5}}).options[0].roomId,'506');
  assert.throws(()=>maintenanceAction(s,'104',{action:'open',kind:'repair',note:'Test repair',version:s.version}),/confirmed stay/);
});
test('repair capacity failure stays off sale and can retry once linen is received',()=>{
  const s=newWorld(),room=byRoom(s,'506');s.linenStock=s.linenUsed+worldView(s).summary.linenReserved;
  maintenanceAction(s,room.id,{action:'repair_done',version:s.version});const o=s.workOrders.find(o=>o.roomId===room.id);
  assert.equal(o.status,'needs_schedule');assert.equal(room.blocked,true);assert.equal(jobs(s,o).length,0);
  const attention=worldView(s).summary.attention;s.linenStock+=10;queueTurnover(s,room.id);assert.equal(o.status,'scheduled');assert.equal(jobs(s,o).length,2);
  assert.equal(worldView(s).summary.attention,attention-1);assert.equal(room.blocked,true);
});
test('checkout queues dependent preparation once and prevents work while occupied',()=>{
  const s=newWorld(),b=s.reservations.find(b=>b.id==='HOTEL-104'),room=byRoom(s,b.roomId);
  assert.equal(roomSnapshot(s,room).status,'occupied');assert.throws(()=>queueTurnover(s,room.id),/occupancy/);
  stayAction(s,b.id,'check_out');const o=s.workOrders.find(o=>o.roomId===room.id);assert.ok(o);assert.equal(o.linenReserved,4);assert.equal(jobs(s,o).length,2);assert.equal(roomSnapshot(s,room).status,'scheduled');
  const count=s.tasks.length;stayAction(s,b.id,'check_out');assert.equal(s.tasks.length,count);assert.equal(b.phase,'checked_out');
  assert.throws(()=>stayAction(s,'HOTEL-106','check_out'),/departing today/);
});
test('check-in requires recorded readiness; active team members cannot start a second task',()=>{
  const s=newWorld(),r=req(s,{party:2,spatial:{type:'deluxe',minFloor:6,maxFloor:6}}),b=select(s,r);
  assert.throws(()=>stayAction(s,b.id,'check_in'),/inspection/);
  const inspect=s.tasks.find(t=>t.roomId===b.roomId&&t.status==='in_progress');completeTask(s,inspect.id);stayAction(s,b.id,'check_in');assert.equal(b.phase,'checked_in');
  const o=queueTurnover(s,'102'),t=jobs(s,o)[0];const other=s.tasks.find(x=>x.status==='in_progress'&&x.kind==='cleaning');t.assignee=other.assignee;
  assert.throws(()=>startTask(s,t.id),/already working/);
  const room=byRoom(s,'102');assert.throws(()=>editRoom(s,room.id,{...room,type:'family',version:s.version}),/existing preparation/);
});
test('floor and facility preferences use functional facts rather than guest identity',()=>{
  const s=newWorld(),r=req(s,{party:2,spatial:{type:'twin',minFloor:4}},[{kind:'preference',feature:'highFloor',evidence:'high floor'},{kind:'preference',feature:'nearGym',evidence:'near gym'}]);
  assert.equal(r.options[0].roomId,'402');assert.ok(r.options[0].matched.includes('highFloor'));assert.ok(r.options[0].matched.includes('nearGym'));assert.ok(r.options.find(o=>o.roomId==='602').unmet.includes('nearGym'));
  const oldVersion=r.offerVersion;maintenanceAction(s,'602',{action:'open',kind:'construction',note:'Window replacement',version:s.version});refreshRequest(s,r.id);
  assert.ok(!r.options.some(o=>o.roomId==='602'));assert.ok(r.offerVersion>oldVersion);
});
