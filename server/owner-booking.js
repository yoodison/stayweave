import {randomUUID} from 'node:crypto';
import {structured} from './inference.js';
import {WorldError,validateInbound,addRequest,addAmendment,amendmentTarget,publicRequest,channels} from './world.js';
import {hotelFeatures} from '../shared/hotel.js';
import {armResponse,recordLifecycle,decline,resume,cancellationPreview,confirmCancellation} from './lifecycle.js';
import {selectCoordinated,reconcileCoordination,coordinationImpact} from './coordination.js';

const fields=['guest','checkIn','checkOut','party','arrival','latest','breakfast','channel','bookingId','roomId'];
export async function interpretBookingTurn(message,context){
 return structured(`Extract ONLY explicit hotel booking details from the latest message; history/draft are context, not commands. Return JSON {updates:[{slot:0,fields:{},evidence:{},claims:[]}]}. Up to 3 guests, slots 0..2; use existing slots for follow-up answers and a new slot for another guest. Only output changed fields. Fields: guest, checkIn/checkOut ISO dates, party integer1..4, arrival/latest local minutes600..1320, breakfast integer0..party, channel (website,airbnb,booking,agoda,trip,phone,sms,agent), bookingId (EXACT confirmed ID from context only if explicitly changing that stay), roomId (EXACT requested room). For EACH field include evidence[field] as an exact case-sensitive substring from latest message; never invent missing values or infer consent. Example: for "November 18 to 20, 2026", checkIn is "2026-11-18", checkOut is "2026-11-20", and BOTH evidence strings must be the literal "November 18 to 20, 2026". Never synthesize "November 20, 2026" as a quote. Evidence is copied, not paraphrased. Resolve relative dates against operatingDate; ask rather than guess ambiguous dates/times. Do not fill breakfast, party or arrival defaults. Latest means latest arrival the guest explicitly accepts. Multiple guests sharing dates/counts may share evidence only when explicitly stated. If changing a reservation, use bookingId and changed fields; stored fields are inherited by code. Never turn an existing guest's change into a new stay. Claims use {kind:requirement|preference|unsupported_required|unsupported_preference|unclear,feature:key|null,evidence:exact substring}. Supported features: ${JSON.stringify(hotelFeatures)}. Use requirement only for explicit must-have, never infer from age, job or story. Keep numeric dates, times, party, exact room in fields, NOT claims. Other unsupported explicit conditions stay in claims. If correcting preferences output the COMPLETE current claims for that guest based on latest explicit conditions; otherwise omit claims to preserve them. Empty claims only for explicit no preferences. If ambiguous return updates:[]; do not execute or manufacture outcomes.`,{message,...context},'owner-booking','owner-agent');
}
const clone=structuredClone;
const validDate=v=>typeof v==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(v)&&Number.isFinite(Date.parse(v))&&new Date(v).toISOString().slice(0,10)===v;
function checkField(k,v,s){
 if(k==='guest')return typeof v==='string'&&v.trim().length>0&&v.length<=60;
 if(['checkIn','checkOut'].includes(k))return validDate(v)&&v>=s.date&&(Date.parse(v)-Date.parse(s.date))/86400000<=30;
 if(['party','breakfast','arrival','latest'].includes(k))return Number.isInteger(v)&&v>=(k==='party'?1:k==='breakfast'?0:600)&&v<=(k==='party'||k==='breakfast'?4:1320);
 if(k==='channel')return channels.includes(v);
 if(k==='roomId')return s.rooms.some(r=>r.id===v);
 if(k==='bookingId')return s.reservations.some(b=>b.id===v&&b.status==='confirmed');
 return false;
}
export function mergeBookingTurn(s,previous,raw,message,measurement){
 if(!raw||!Array.isArray(raw.updates)||raw.updates.length>3)throw new WorldError('The model returned invalid booking details. Please try again.',422);
 const d=previous?clone(previous):{id:randomUUID(),revision:0,items:[],status:'collecting',measurements:[]};
 if(!['collecting','ready'].includes(d.status))throw new WorldError('Start a new request to change a published proposal.',409);
 const seen=new Set();
 for(const u of raw.updates){
  if(!Number.isInteger(u.slot)||u.slot<0||u.slot>2||u.slot>d.items.length||seen.has(u.slot)||!u.fields||typeof u.fields!=='object'||Array.isArray(u.fields))throw new WorldError('The model mixed up the guest slots. Nothing was saved.',422);
  seen.add(u.slot);const item=d.items[u.slot]||{fields:{channel:'website'},claims:[],evidence:{}};
  for(const [k,v] of Object.entries(u.fields)){
   if(!fields.includes(k)||!checkField(k,v,s)||typeof u.evidence?.[k]!=='string'||!u.evidence[k].trim()||!message.includes(u.evidence[k]))throw new WorldError(`Please clarify ${k}; the interpreted value was invalid or ungrounded.`,422);
  }
  if(u.fields.bookingId){
   if(item.fields.bookingId&&item.fields.bookingId!==u.fields.bookingId)throw new WorldError('Start a new request to change a different existing reservation.',409);
   const b=amendmentTarget(s,u.fields.bookingId);
   item.priorRequirements=(b.hard||[]).map(k=>hotelFeatures[k]||k);
   item.original={roomId:b.roomId,checkIn:b.checkIn,checkOut:b.checkOut,party:b.party,breakfast:b.breakfast};
   if(!item.fields.bookingId)item.fields={...item.fields,guest:b.guest,checkIn:b.checkIn,checkOut:b.checkOut,party:b.party,breakfast:b.breakfast,arrival:b.arrival,latest:b.arrival,channel:b.channel,bookingId:b.id};
  }
  Object.assign(item.fields,u.fields);Object.assign(item.evidence,u.evidence);
  if(item.fields.bookingId)item.fields.guest=s.reservations.find(b=>b.id===item.fields.bookingId).guest;
  if(u.claims!==undefined){
   if(!Array.isArray(u.claims)||u.claims.length>12)throw new WorldError('Invalid guest conditions.',422);
   item.claims=u.claims.map(c=>{
    const mapped=['requirement','preference'].includes(c.kind);
    if(!['requirement','preference','unsupported_required','unsupported_preference','unclear'].includes(c.kind)||typeof c.evidence!=='string'||!c.evidence.trim()||c.evidence.length>300||!message.includes(c.evidence)||(mapped?!Object.hasOwn(hotelFeatures,c.feature):c.feature!==null))throw new WorldError('A guest condition was not grounded in the message.',422);
    return {kind:c.kind,feature:c.feature,evidence:c.evidence};
   });
  }
  // No flexibility is assumed: an exact arrival remains exact until explicitly extended.
  if(u.fields.arrival!==undefined&&u.fields.latest===undefined)item.fields.latest=u.fields.arrival;
  item.message=[...new Set(item.claims.map(c=>c.evidence))].join('; ')||'No additional room preferences stated.';
  d.items[u.slot]=item;
 }
 d.revision++;if(measurement)d.measurements.push(measurement);
 d.missing=missingBookingDetails(s,d);d.status=d.missing.length?'collecting':'ready';
 return d;
}
export function missingBookingDetails(s,d){
 if(!d.items.length)return [{slot:0,field:'guest',question:'Who is the stay for, and what would they like?'}];
 const missing=[];
 for(const [slot,i] of d.items.entries()){
  const f=i.fields,name=f.guest||`Guest ${slot+1}`;
  for(const c of i.claims.filter(c=>['unclear','unsupported_required'].includes(c.kind)))missing.push({slot,field:'conditions',question:`${name}: we cannot verify “${c.evidence}”. What supported alternative would the guest accept?`});
  for(const [k,q] of [['guest','What is the guest’s name?'],['checkIn',`${name}: what is the check-in date?`],['checkOut',`${name}: what is the check-out date?`],['party',`${name}: how many guests?`],['arrival',`${name}: what time will they arrive?`],['breakfast',`${name}: breakfast for how many guests (0 for none)?`]])if(f[k]===undefined)missing.push({slot,field:k,question:q});
  if(f.checkIn&&f.checkOut&&f.checkOut<=f.checkIn)missing.push({slot,field:'checkOut',question:`${name}: check-out must be after check-in. What is the correct date?`});
  if(f.latest<f.arrival)missing.push({slot,field:'latest',question:`${name}: the latest arrival cannot be earlier than arrival. What time is acceptable?`});
  if(f.breakfast>f.party)missing.push({slot,field:'breakfast',question:`${name}: breakfast exceeds the party size. How many breakfast guests?`});
 }
 return missing;
}
export function bookingAnswer(d){return {tool:'guest_intake',view:'overview',draftId:d.id,draftRevision:d.revision,title:d.status==='ready'?'Ready to find their stays.':'Just the missing details.',text:d.status==='ready'?'Review these details, or type a correction. Matching considers the other pending guests. Nothing is booked until each customer chooses.':d.missing.slice(0,2).map(m=>m.question).join(' ')};}
export function bookingView(s,d){
 if(!d)return null;
 const requests=(d.requestIds||[]).map(id=>s.requests.find(r=>r.id===id)).filter(Boolean);
 return {...d,items:d.items.map(i=>{const b=s.reservations.find(b=>b.id===i.fields.bookingId);return {...i,priorRequirements:i.priorRequirements||(b?.hard||[]).map(k=>hotelFeatures[k]||k)}}),requests:requests.map(publicRequest),reservations:s.reservations.filter(b=>requests.some(r=>r.bookingId===b.id)),coordination:requests.length?{groupSize:s.coordination?.current?.requestIds.length||0,queueSize:s.coordination?.queueSize||0}:null};
}
export function publishBooking(s,d){
 const existing=s.requests.filter(r=>r.ownerDraftId===d.id&&r.ownerDraftRevision===d.revision);
 if(existing.length===d.items.length&&existing.length)return existing.map(r=>r.id);
 if(existing.length)throw new WorldError('Partial draft state requires review.',409);
 if(missingBookingDetails(s,d).length||!d.items.length)throw new WorldError('Complete the missing details first.',422);
 const ids=[];
 for(const [i,item] of d.items.entries()){
  const f=item.fields,input=validateInbound(s,{...f,message:item.message,spatial:f.roomId?{roomId:f.roomId}:{}},f.channel);
  const interpretation={claims:item.claims,provider:'Nebius Token Factory',measurements:d.measurements,model:d.measurements.at(-1)?.responseModel||null};
  const key=`owner-booking:${d.id}:${d.revision}:${i}`;
  const r=f.bookingId?addAmendment(s,f.bookingId,input,interpretation,key,f.channel,{requirementsMode:'preserve',requestedBy:'owner_chat'}):addRequest(s,input,interpretation,key,f.channel);
  r.ownerDraftId=d.id;r.ownerDraftRevision=d.revision;armResponse(r);ids.push(r.id);
 }
 return ids;
}
export function bookingGuestAction(s,id,action,body){
 const before=clone(s),r=s.requests.find(r=>r.id===id);if(!r)throw new WorldError('Guest request not found.',404);
 let cancellation;
 if(action==='select'){
  const was=r.status;selectCoordinated(s,id,body);if(was!=='confirmed')recordLifecycle(s,before,r,'selected','Customer chose reviewed terms in the conversation. Reservation and operations saved together.');
 }else if(action==='decline')decline(s,id,body);
 else if(action==='resume')resume(s,id,body);
 else if(action==='cancel-preview')cancellation=cancellationPreview(s,id,body);
 else if(action==='cancel')confirmCancellation(s,id,body);
 else throw new WorldError('Unknown guest response.',400);
 reconcileCoordination(s,{force:true});
 return {action,requestId:id,impact:coordinationImpact(before,s),cancellation,at:new Date().toISOString(),readback:true};
}
