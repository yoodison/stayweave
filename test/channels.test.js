import test from 'node:test';
import assert from 'node:assert/strict';
import {newWorld,addRequest,acceptRequest,cancelReservation} from '../server/world.js';
import {reconcileChannels,setChannelRule,simulateChannelJob,channelView} from '../server/channels.js';
import {nextGuestAction} from '../shared/channels.js';
const input=s=>({guest:'Channel test',message:'I prefer a quiet room.',checkIn:s.date,checkOut:'2026-10-31',arrival:840,latest:960,party:2,breakfast:0});
const intake=(s,channel)=>addRequest(s,input(s),{claims:[{kind:'preference',feature:'quiet',evidence:'quiet room'}]},crypto.randomUUID(),channel);
const select=(s,r)=>acceptRequest(s,r.id,{optionId:r.options[0].id,version:r.offerVersion,conditionsReviewed:true,customerConfirmed:true});
test('channel reconciliation prepares all destinations, publishes only locally, and deduplicates repeated passes',()=>{
 const s=newWorld(),r=intake(s,'website');reconcileChannels(s);const count=s.channelOps.jobs.length;
 assert.ok(r.channelMessage?.text.includes('local stay options'));assert.equal(channelView(s).externalConnections,0);
 assert.ok(s.channelOps.jobs.filter(j=>['airbnb','booking','agoda','trip','phone','sms'].includes(j.channel)).every(j=>j.status!=='published_local'));
 reconcileChannels(s);assert.equal(s.channelOps.jobs.length,count);
 const old=s.channelOps.jobs.find(j=>j.entity===`request:${r.id}`);select(s,r);reconcileChannels(s);
 assert.equal(old.status,'superseded');assert.ok(r.channelMessage.text.includes('confirmed'));assert.equal(s.channelOps.jobs.filter(j=>j.entity===`request:${r.id}`&&j.status==='published_local').length,1);
});
test('reservation changes supersede platform inventory payloads and never imply external synchronization',()=>{
 const s=newWorld(),r=intake(s,'agoda');reconcileChannels(s);const old=s.channelOps.jobs.find(j=>j.channel==='agoda'&&j.entity==='inventory'),oldCount=old.payload.dates[0].byType[s.rooms.find(x=>x.id===r.options[0].roomId).type];
 const b=select(s,r);reconcileChannels(s);assert.equal(old.status,'superseded');const current=s.channelOps.jobs.find(j=>j.channel==='agoda'&&j.entity==='inventory'&&j.status==='connector_needed');
 assert.equal(current.payload.dates[0].byType[s.rooms.find(x=>x.id===b.roomId).type],oldCount-1);
 assert.equal(r.channelMessage,null);simulateChannelJob(s,current.id,{simulate:true});assert.equal(current.receipt.externalTransmission,false);assert.equal(current.status,'simulated');
 simulateChannelJob(s,current.id,{simulate:true});assert.equal(current.attempts,1);
 cancelReservation(s,b.id);reconcileChannels(s);assert.equal(current.status,'superseded');assert.throws(()=>simulateChannelJob(s,current.id,{simulate:true}),/outdated/);
});
test('paused channel controls stay paused across reconciliation and reject stale settings',()=>{
 const s=newWorld(),r=intake(s,'website');reconcileChannels(s);const version=s.version;
 setChannelRule(s,'website',{revision:1,draftReplies:false,queueInventory:false});reconcileChannels(s);assert.equal(r.channelMessage,null);assert.equal(s.version,version);
 assert.ok(s.channelOps.jobs.filter(j=>j.channel==='website').every(j=>j.status==='paused'));
 assert.throws(()=>setChannelRule(s,'website',{revision:1,draftReplies:true,queueInventory:true}),/changed/);
 setChannelRule(s,'website',{revision:2,draftReplies:true,queueInventory:true});reconcileChannels(s);assert.ok(r.channelMessage);assert.equal(channelView(s).channels.find(c=>c.id==='website').rule.queueInventory,true);
});
test('unsupported required conditions remain human exceptions and cannot be dispatched by sandbox controls',()=>{
 const s=newWorld();reconcileChannels(s);const r=s.requests.find(r=>r.status==='needs_review'),job=s.channelOps.jobs.find(j=>j.entity===`request:${r.id}`);
 assert.equal(job.status,'needs_review');assert.equal(r.channelMessage,null);assert.throws(()=>simulateChannelJob(s,job.id,{simulate:true}),/clarification/);
 assert.equal(nextGuestAction(r,s).kind,'attention');const offered=s.requests.find(r=>r.status==='offered');assert.equal(nextGuestAction(offered,s).roomId,offered.options[0].roomId);
});
