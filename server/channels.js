import {createHash} from 'node:crypto';
import {channelCatalog} from '../shared/channels.js';
import {WorldError} from './world.js';
const hash=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex').slice(0,18);
const clock=n=>`${String(Math.floor(n/60)).padStart(2,'0')}:${String(n%60).padStart(2,'0')}`;
export function ensureChannels(s){
 s.channelOps??={revision:1,rules:{},jobs:[]};
 for(const id of Object.keys(channelCatalog))s.channelOps.rules[id]??={draftReplies:true,queueInventory:true};
 return s.channelOps;
}
function reply(s,r){
 if(['expired','declined'].includes(r.status))return {kind:'status',text:r.status==='expired'?'Your response window ended. Request fresh options when ready. Any original booking remains protected.':'Your proposal was declined. Any original booking remains protected.',review:false};
 if(r.status==='needs_review'&&r.coordination?.status==='waiting')return {kind:'waiting',text:r.coordination.reason,review:false};
 if(r.status==='needs_review')return {kind:'clarification',text:r.ownerNote||`We need to clarify a required condition before offering a stay. ${r.reason||'Please review the request with your host.'}`,review:true};
 if(r.status==='offered')return {kind:'options',text:`${r.options.length} local stay options are ready for your review. ${r.options.map(o=>`Room ${o.roomId}: $${o.total} total, arrival ${clock(o.arrival)}`).join('; ')}. Review all conditions and choose on your guest page. These are not holds.`,review:false};
 if(r.status==='confirmed'){const b=s.reservations.find(b=>b.id===r.bookingId);if(b)return {kind:'confirmation',text:`Your local StayWeave reservation ${b.id} is confirmed: room ${b.roomId}, ${b.checkIn} to ${b.checkOut}, arrival ${clock(b.arrival)}, $${b.total} total. Preparation and linen are linked. No OTA booking or payment has been made.`,review:false};}
 return {kind:'status',text:r.status==='amended'?'This request was replaced by your updated reservation. Please use the latest guest page.':'This local reservation was cancelled. No external cancellation or refund was sent.',review:false};
}
// Room-night inventory only: preparation feasibility and OTA rate/room mappings are not implied.
function inventory(s){return Array.from({length:30},(_,i)=>{const date=new Date(Date.parse(s.date)+i*86400000).toISOString().slice(0,10);const available=s.rooms.filter(room=>!room.blocked&&!s.reservations.some(b=>b.status==='confirmed'&&b.phase!=='checked_out'&&b.roomId===room.id&&b.checkIn<=date&&b.checkOut>date));return {date,byType:Object.fromEntries([...new Set(s.rooms.map(r=>r.type))].map(type=>[type,available.filter(r=>r.type===type).length]))};});}
export function reconcileChannels(s){
 const ops=ensureChannels(s),wanted=new Set();
 function upsert(channel,entity,payload,review=false){
  const id=`CH-${hash({channel,entity,payload})}`;wanted.add(id);let job=ops.jobs.find(j=>j.id===id);
  if(!job){job={id,channel,entity,payload,status:review?'needs_review':channelCatalog[channel].local?'published_local':'connector_needed',createdAt:new Date().toISOString(),attempts:0};ops.jobs.unshift(job);}
  if(job.status==='superseded'||job.status==='paused')job.status=review?'needs_review':channelCatalog[channel].local?'published_local':'connector_needed';
  return job;
 }
 for(const r of s.requests){
  const rule=ops.rules[r.channel];if(!rule?.draftReplies){r.channelMessage=null;continue;}
  const draft=reply(s,r),payload={kind:draft.kind,requestId:r.id,guest:r.guest,text:draft.text,scope:'Local StayWeave records. External delivery requires an authorized connector.'};
  if(r.status==='offered')payload.expiresAt=r.expiresAt;
  const job=upsert(r.channel,`request:${r.id}`,payload,draft.review);
  r.channelMessage=job.status==='published_local'?{text:draft.text,updatedAt:job.createdAt,scope:'Published on this local guest page only'}:null;
 }
 const availability=inventory(s);
 for(const id of Object.keys(channelCatalog))if(ops.rules[id].queueInventory)upsert(id,'inventory',{kind:'availability',dates:availability,scope:'Unbooked room-night inventory; no preparation promise, price, OTA mapping or external sync.'});
 for(const j of ops.jobs)if(!wanted.has(j.id)&&j.status!=='superseded'){
  const enabled=j.entity==='inventory'?ops.rules[j.channel].queueInventory:ops.rules[j.channel].draftReplies;
  j.status=enabled?'superseded':'paused';
 }
 // Keep the current jobs and a bounded audit trail of obsolete versions.
 const current=ops.jobs.filter(j=>!['superseded','paused'].includes(j.status));const old=ops.jobs.filter(j=>['superseded','paused'].includes(j.status)).slice(0,160);ops.jobs=[...current,...old];
 return ops;
}
export function setChannelRule(s,id,body){
 const ops=ensureChannels(s);if(!channelCatalog[id])throw new WorldError('Unknown channel.',404);
 if(body.revision!==ops.revision)throw new WorldError('Channel controls changed. Refresh before saving.',409);
 if(typeof body.draftReplies!=='boolean'||typeof body.queueInventory!=='boolean')throw new WorldError('Choose both automation settings.',400);
 ops.rules[id]={draftReplies:body.draftReplies,queueInventory:body.queueInventory};ops.revision++;
}
export function simulateChannelJob(s,id,body){
 const ops=reconcileChannels(s),job=ops.jobs.find(j=>j.id===id);if(!job)throw new WorldError('Channel job not found.',404);
 if(body.simulate!==true)throw new WorldError('Explicit sandbox simulation is required.',400);
 if(channelCatalog[job.channel].local)throw new WorldError('This channel already reads the local state.',400);
 if(job.status==='simulated')return job;
 if(job.status!=='connector_needed')throw new WorldError('This job is paused, outdated or needs owner clarification.',409);
 job.status='simulated';job.attempts++;job.completedAt=new Date().toISOString();job.receipt={adapter:'local-sandbox',externalTransmission:false,payloadHash:hash(job.payload)};ops.revision++;return job;
}
export function channelView(s){
 const ops=ensureChannels(s);
 return {revision:ops.revision,channels:Object.entries(channelCatalog).map(([id,c])=>({id,...c,rule:ops.rules[id],connection:c.local?'Local endpoint':'Not connected',requests:s.requests.filter(r=>r.channel===id).length,attention:s.requests.filter(r=>r.channel===id&&r.status==='needs_review').length,jobs:ops.jobs.filter(j=>j.channel===id&&!['superseded','paused'].includes(j.status)).length})),jobs:ops.jobs,externalConnections:0};
}
