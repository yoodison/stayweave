import test from 'node:test';
import assert from 'node:assert/strict';
import {scenePosition,hotelClock,taskGate,roomVisuals,roomSlot,statusGlyphs} from '../shared/scene.js';
import {statusMeta} from '../shared/hotel.js';

test('compact building keeps all 36 rooms addressable through unique camera-independent facade slots',()=>{
 const slots=[],positions=[];
 for(let floor=1;floor<=6;floor++)for(let n=1;n<=6;n++){
  const room={id:`${floor}0${n}`,floor},slot=roomSlot(room),pos=scenePosition(room);
  assert.equal(slot.wing,n<4?'front':'rear');assert.equal(slot.row,6-floor);assert.equal(slot.column,(n-1)%3);
  assert.ok(Math.abs(pos[0])<=4.2);assert.equal(pos[2],n<4?2.65:-2.65);
  slots.push(JSON.stringify(slot));positions.push(pos.join(','));
 }
 assert.equal(new Set(slots).size,36);assert.equal(new Set(positions).size,36);
 for(const state of Object.keys(statusMeta))assert.ok(statusGlyphs[state]?.length,`${state} has a graphic`);
 assert.notDeepEqual(statusGlyphs.dirty,statusGlyphs.cleaning);assert.notDeepEqual(statusGlyphs.inspection,statusGlyphs.inspecting);
});

test('hotel wall clock uses Seoul time and handles midnight independently of server timezone',()=>{
 assert.deepEqual(hotelClock(new Date('2026-10-28T15:07:00Z')),{time:'00:07',hour:7/60,phase:'night',zone:'KST'});
 assert.equal(hotelClock(new Date('2026-10-28T22:00:00Z')).phase,'sunset');
 assert.equal(hotelClock(new Date('2026-10-29T03:00:00Z')).phase,'day');
 assert.equal(hotelClock(new Date('2026-10-29T09:00:00Z')).phase,'sunset');
 assert.equal(hotelClock(new Date('2026-10-29T10:00:00Z')).phase,'night');
});

test('control desk keeps inspection, assignee and plan-date gates visible',()=>{
 const date='2026-10-29',clean={id:'clean',date,kind:'cleaning',status:'scheduled',orderId:'turnover',assignee:'mina'},inspect={id:'inspect',date,kind:'inspection',status:'scheduled',orderId:'turnover',assignee:'lee'};
 assert.equal(taskGate(inspect,[clean,inspect],date),'Cleaning comes first');
 assert.equal(taskGate(clean,[clean,{...inspect,status:'in_progress',assignee:'mina'}],date),'Teammate is busy');
 assert.equal(taskGate(inspect,[{...clean,status:'completed'},inspect],date),null);
 assert.equal(taskGate({...clean,status:'in_progress'},[],date),null);
 assert.equal(taskGate(clean,[],'2026-10-30'),'Different operating day');
 assert.equal(taskGate({...clean,status:'cancelled'},[],date),'Cancelled');
 for(const state of Object.keys(statusMeta)){assert.ok(roomVisuals[state].short);assert.ok(roomVisuals[state].icon);}
 assert.notEqual(roomVisuals.ready.short,roomVisuals.occupied.short);
});
