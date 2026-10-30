import {operatingImpact} from '../shared/impact.js';
import { randomUUID } from 'node:crypto';
import {hotelFeatures,roomTypes,roomFacts,roomSnapshot,enrichRoom} from '../shared/hotel.js';

export class WorldError extends Error {
  constructor(message, status = 409, code = 'CONFLICT') { super(message); this.status = status; this.code = code; }
}
const fail = (message, status = 400, code = 'INVALID') => { throw new WorldError(message, status, code); };
export const channels = ['agent', 'website', 'airbnb', 'booking', 'agoda', 'trip', 'phone', 'sms'];
export const features = hotelFeatures;
const stamp = () => new Date().toISOString();
export const hhmm = n => `${String(Math.floor(n / 60)).padStart(2, '0')}:${String(n % 60).padStart(2, '0')}`;
const integer = (v, lo, hi, name) => Number.isInteger(v) && v >= lo && v <= hi ? v : fail(`${name}: enter ${lo}–${hi}.`);
const text = (v, max, name) => typeof v === 'string' && v.trim() && v.length <= max ? v.trim() : fail(`Enter ${name} (up to ${max} characters).`);
const date = v => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) && Number.isFinite(Date.parse(v)) && new Date(v).toISOString().slice(0, 10) === v;
const nights = (a, b) => Math.round((Date.parse(b) - Date.parse(a)) / 86400000);
const overlaps = (a, b) => a.checkIn < b.checkOut && b.checkIn < a.checkOut;
export function event(s, title, detail) { s.activity.unshift({ id: randomUUID(), at: stamp(), title, detail }); s.activity = s.activity.slice(0, 150); }
const linenHolders=s=>[...s.reservations.filter(b=>b.status==='confirmed'),...(s.workOrders||[]).filter(o=>o.status!=='cancelled')];
function validateSpatial(input,s) {
  if(input===undefined)return {};
  if(!input||typeof input!=='object'||Array.isArray(input))fail('Invalid room constraints.');
  const allowed=['roomId','type','view','minFloor','maxFloor','elevatorMax','breakfastMax','gymMax','poolMax'];
  if(Object.keys(input).some(k=>!allowed.includes(k)))fail('Unknown room constraint.');
  const out={};
  for(const [k,v] of Object.entries(input)){
    if(k==='roomId'){if(!s.rooms.some(r=>r.id===v))fail('Choose a known room number.');out[k]=v;}
    else if(k==='type'){if(!roomTypes[v])fail('Choose a valid room type.');out[k]=v;}
    else if(k==='view'){if(!['sea','garden','city'].includes(v))fail('Choose a valid view.');out[k]=v;}
    else out[k]=integer(v,k.endsWith('Floor')?1:0,k.endsWith('Floor')?6:300,k);
  }
  if((out.minFloor||1)>(out.maxFloor||6))fail('Minimum floor cannot exceed maximum floor.');
  return out;
}
function spatialFits(r,c={}) {
  return (!c.roomId||r.id===c.roomId)&&(!c.type||r.type===c.type)&&(!c.view||r.view===c.view)&&(!c.minFloor||r.floor>=c.minFloor)&&(!c.maxFloor||r.floor<=c.maxFloor)&&['elevator','breakfast','gym','pool'].every(k=>c[k+'Max']===undefined||r.distances?.[k]<=c[k+'Max']);
}
function spatialReasons(r,c={}) {
  return [...(c.type?[`${roomTypes[r.type].label} · required type met`]:[]),...(c.view?[`${r.view} view · required view met`]:[]),...(c.minFloor||c.maxFloor?[`Floor ${r.floor} · requested floor range met`]:[]),...['elevator','breakfast','gym','pool'].filter(k=>c[k+'Max']!==undefined).map(k=>`${k}: ${r.distances[k]} m ≤ ${c[k+'Max']} m required`)];
}

export function validateInbound(s, b, source = 'agent') {
  if (!b || typeof b !== 'object') fail('Request details are required.');
  const guest = text(b.guest, 60, 'guest name'), message = text(b.message, 2000, 'guest message');
  if (!date(b.checkIn) || !date(b.checkOut) || b.checkIn < s.date || b.checkOut <= b.checkIn || nights(s.date, b.checkOut) > 30) fail('Choose a stay within the property’s next 30 days.');
  const arrival = integer(b.arrival, 600, 1320, 'Arrival minute'), latest = integer(b.latest, arrival, 1320, 'Latest acceptable arrival');
  const party = integer(b.party, 1, 4, 'Party size');
  const breakfast = integer(b.breakfast ?? 0, 0, party, 'Breakfast guests');
  if (!channels.includes(source)) fail('Unknown channel.');
  const spatial=validateSpatial(b.spatial,s);
  return { spatial, guest, message, checkIn: b.checkIn, checkOut: b.checkOut, arrival, latest, party, breakfast, channel: source };
}

function startSlot(person, earliest, duration, tasks) {
  let cursor = Math.max(earliest, person.start);
  const occupied = [...person.breaks, ...tasks.filter(t => t.assignee === person.id).map(t => [t.start, t.end])].sort((a,b) => a[0]-b[0]);
  for (const [start, end] of occupied) {
    if (cursor + duration <= start) break;
    if (cursor < end && cursor + duration > start) cursor = end;
  }
  return cursor + duration <= person.end ? cursor : null;
}

// Reserve fixed staff slots. Later requests never move work promised to an earlier booking.
function preparation(s, request, room) {
  // A stay inserted before a later promise must not silently create a missing turnover.
  const subsequent = s.reservations.filter(b => b.status === 'confirmed' && b.roomId === room.id && b.checkIn >= request.checkOut).sort((a,b) => a.checkIn.localeCompare(b.checkIn))[0];
  if (subsequent) {
    const clean = s.tasks.find(t => t.bookingId === subsequent.id && t.kind === 'cleaning' && t.status === 'scheduled');
    if (!clean || (request.checkOut === subsequent.checkIn && clean.start < 660)) return null;
  }
  const previous = s.reservations.filter(b => b.status === 'confirmed' && b.roomId === room.id && b.checkOut <= request.checkIn).sort((a,b) => b.checkOut.localeCompare(a.checkOut))[0];
  const existingOrder=(s.workOrders||[]).find(o=>o.roomId===room.id&&o.status==='scheduled'&&o.date===request.checkIn);
  if(existingOrder){const jobs=s.tasks.filter(t=>t.orderId===existingOrder.id&&t.status!=='cancelled');return {tasks:[],linen:0,readyAt:Math.max(...jobs.map(t=>t.end))+15,minutes:0,sharedOrderId:existingOrder.id};}
  const needsPrep = room.condition !== 'ready' || Boolean(previous);
  if (!needsPrep) return { tasks: [], linen: 0, readyAt: 600, minutes: 0 };
  const linen = room.linen;
  if (s.linenStock - s.linenUsed - linenHolders(s).reduce((n,b) => n + b.linenReserved, 0) < linen) return null;
  let cursor = previous?.checkOut === request.checkIn ? 660 : room.releaseAt;
  const occupied = s.tasks.filter(t => t.date === request.checkIn && t.status !== 'cancelled');
  const tasks = [];
  for (const [kind, duration, role] of [['cleaning', room.cleaning, 'housekeeper'], ['inspection', 15, 'inspector']]) {
    const choices = s.team.filter(p => p.role === role && !p.unavailableDates?.includes(request.checkIn)).map(p => ({ p, start: startSlot(p, cursor, duration, [...occupied, ...tasks]) })).filter(x => x.start !== null).sort((a,b) => a.start-b.start || a.p.id.localeCompare(b.p.id));
    if (!choices.length) return null;
    const { p, start } = choices[0];
    tasks.push({ kind, roomId: room.id, date: request.checkIn, assignee: p.id, assigneeName: p.name, start, end: start + duration, status: 'scheduled' });
    cursor = start + duration;
  }
  return { tasks, linen, readyAt: cursor + 15, minutes: room.cleaning + 15 };
}

export function amendmentTarget(s,id){
  const b=s.reservations.find(b=>b.id===id);
  if(!b||b.status!=='confirmed')fail('The original reservation is no longer open to change.',409);
  if(['checked_in','checked_out'].includes(b.phase)||s.tasks.some(t=>t.bookingId===id&&['in_progress','completed'].includes(t.status)))fail('This stay or its preparation has already started. The owner must coordinate this change manually.',409);
  return b;
}
function planningState(s,r){
  if(!r.amendmentOf)return s;
  amendmentTarget(s,r.amendmentOf);
  const copy=structuredClone(s),b=copy.reservations.find(b=>b.id===r.amendmentOf);
  b.status='change_preview';b.linenReserved=0;
  copy.tasks.filter(t=>t.bookingId===b.id&&t.status==='scheduled').forEach(t=>t.status='cancelled');
  return copy;
}
export function addAmendment(s,id,input,interpretation,key,source,{requirementsMode='replace',requestedBy='owner'}={}){
  const b=amendmentTarget(s,id);
  const r=addRequest(s,{...input,guest:b.guest},interpretation,key,source);
  r.amendmentOf=id;r.original={roomId:b.roomId,checkIn:b.checkIn,checkOut:b.checkOut,party:b.party,breakfast:b.breakfast,total:b.total,arrival:b.arrival,hard:b.hard||[],preferences:b.preferences||[],spatial:s.requests.find(x=>x.id===b.requestId)?.spatial||{}};
  r.requirementsMode=requirementsMode;r.requestedBy=requestedBy;
  if(requirementsMode==='preserve'){r.hard=[...new Set([...(b.hard||[]),...r.hard])];r.preferences=[...new Set([...(b.preferences||[]),...r.preferences])];r.spatial={...r.original.spatial,...r.spatial};}
  refreshRequest(s,r.id);event(s,'Change proposed; original stay protected',`${b.guest} · ${b.id}`);return r;
}

export function optionsFor(s, r, limit=3) {
  if (r.unresolved.length) return [];
  const original=s;try{s=planningState(s,r)}catch{return [];}
  return s.rooms.filter(room => !room.blocked && !(r.declinedRoomIds||[]).includes(room.id) && room.capacity >= r.party && r.hard.every(f => roomFacts(room)[f]) && spatialFits(room,r.spatial) && !s.reservations.some(b => b.status === 'confirmed' && b.roomId === room.id && overlaps(b, r)))
    .map(room => {
      const prep = preparation(s, r, room);
      if (!prep || prep.readyAt > r.latest) return null;
      const arrival = Math.max(prep.readyAt, r.arrival);
      const matched = r.preferences.filter(f => roomFacts(room)[f]);
      const unmet = r.preferences.filter(f => !roomFacts(room)[f]);
      const stayNights = nights(r.checkIn, r.checkOut);
      return { id: `${r.id}-${room.id}`, roomId: room.id, label: room.label, type:room.type, area:room.area, view:room.view, floor:room.floor, distances:room.distances, arrival, matched, unmet, nightly: room.nightly, nights: stayNights, total: room.nightly * stayNights + r.breakfast * 12 * stayNights, breakfastTotal: r.breakfast * 12 * stayNights, currency: 'USD', prep,
        reasons: [...r.hard.map(f => `${features[f]} required · met`), ...matched.map(f => `${features[f]} preference · met`), ...unmet.map(f => `${features[f]} preference · not met`), ...spatialReasons(room,r.spatial), arrival > r.arrival ? `Later arrival at ${hhmm(arrival)} needs your acceptance` : `Ready for your ${hhmm(arrival)} arrival`], version: s.version };
    }).filter(Boolean).map(o=>({...o,impact:operatingImpact(original,r,o)})).filter(o=>!o.impact.requiresOwner).sort((a,b) => b.matched.length-a.matched.length || a.arrival-b.arrival || a.total-b.total).slice(0, limit);
}

export function addRequest(s, input, interpretation, key, source) {
  if (s.requests.length >= 300) fail('This local workspace has reached 300 requests.', 409);
  const payload = validateInbound(s, input, source);
  const claims = interpretation.claims;
  if (!Array.isArray(claims)) fail('No valid interpretation was returned.');
  const hard = [...new Set(claims.filter(c => c.kind === 'requirement').map(c => c.feature))];
  const preferences = [...new Set(claims.filter(c => c.kind === 'preference').map(c => c.feature))];
  const unresolved = claims.filter(c => ['unsupported_required', 'unclear'].includes(c.kind)).map(c => c.evidence);
  const r = { id: randomUUID(), ...payload, hard, preferences, unresolved, interpretation, idempotencyKey: key, createdAt: stamp(), status: 'offered', options: [], bookingId: null };
  s.requests.unshift(r); refreshRequest(s, r.id);
  event(s, r.status === 'needs_review' ? 'Request needs a closer look' : 'Options prepared automatically', `${r.guest} · ${r.channel}`);
  return r;
}
export function refreshRequest(s, id) {
  const r = s.requests.find(x => x.id === id); if (!r) fail('Request not found.', 404);
  if (['confirmed', 'cancelled', 'amended', 'expired', 'declined'].includes(r.status)) return r;
  r.options = r.jointSuggestion && Date.parse(r.jointSuggestion.expiresAt)>Date.now() ? optionsFor(s,r,36).sort((a,b)=>Number(b.roomId===r.jointSuggestion.roomId)-Number(a.roomId===r.jointSuggestion.roomId)).slice(0,3) : optionsFor(s, r); r.status = r.options.length ? 'offered' : 'needs_review';
  r.reason = r.unresolved.length ? `Clarify: ${r.unresolved.join('; ')}` : r.options.length ? null : 'No option meets the required features, dates, breakfast capacity and available staff/linen. Review capacity or ask the guest to change the request.';
  r.expiresAt = new Date(Date.now() + 15 * 60000).toISOString(); r.offerVersion = s.version;
  return r;
}

export function acceptRequest(s, id, body, now = Date.now()) {
  const r = s.requests.find(x => x.id === id); if (!r) fail('Request not found.', 404);
  // Safe retry: the same selected option returns the original receipt, never a second booking.
  if (r.status === 'confirmed') {
    if (body.optionId !== r.selectedOptionId) fail('This request already has a different confirmed selection.', 409);
    return s.reservations.find(b => b.id === r.bookingId);
  }
  if (r.lifecycleVersion && r.responseDueAt && now >= Date.parse(r.responseDueAt)) fail('Response window ended. Request fresh options.',409,'STALE_OFFER');
  if (r.status !== 'offered') fail('This request is not open for selection.', 409);
  if (body.customerConfirmed !== true || body.conditionsReviewed !== true) fail('The customer must review the interpreted conditions and explicitly confirm this option.');
  if (now > Date.parse(r.expiresAt) || body.version !== r.offerVersion || s.version !== r.offerVersion) fail('The operating plan changed or the offer expired. Refresh options and choose again.', 409, 'STALE_OFFER');
  const offered = r.options.find(o => o.id === body.optionId);
  const fresh = optionsFor(s, r, 36).find(o => o.id === body.optionId);
  if (!offered || !fresh || JSON.stringify(Object.fromEntries(Object.entries(offered).filter(([k])=>k!=='choiceToken'))) !== JSON.stringify(fresh)) fail('This option is no longer available. Refresh options.', 409, 'STALE_OFFER');
  const booking = { id: `SW-${randomUUID().slice(0,8).toUpperCase()}`, requestId: r.id, guest: r.guest, roomId: fresh.roomId, checkIn: r.checkIn, checkOut: r.checkOut, arrival: fresh.arrival, party: r.party, breakfast: r.breakfast, channel: r.channel, total: fresh.total, status: 'confirmed', linenReserved: fresh.prep.linen, linenConsumed: 0, sharedOrderId:fresh.prep.sharedOrderId||null, selectedAt: stamp(), hard: r.hard, preferences: r.preferences };
  if(r.amendmentOf){
    const old=amendmentTarget(s,r.amendmentOf);old.status='replaced';old.replacedBy=booking.id;old.linenReserved=0;
    s.tasks.filter(t=>t.bookingId===old.id&&t.status==='scheduled').forEach(t=>t.status='cancelled');
    const previous=s.requests.find(x=>x.id===old.requestId);if(previous)previous.status='amended';
    for(const other of s.requests.filter(x=>x.id!==r.id&&x.amendmentOf===old.id&&['offered','needs_review'].includes(x.status))){other.status='amended';other.closedReason='Another replacement was selected by this guest.';other.options=[];}
    booking.replaces=old.id;
  }
  r.appliedImpact=fresh.impact;
  s.reservations.push(booking);
  s.tasks.push(...fresh.prep.tasks.map(t => ({ ...t, id: `${booking.id}-${t.kind}`, bookingId: booking.id })));
  r.status = 'confirmed'; r.bookingId = booking.id; r.selectedOptionId = fresh.id;
  s.version++;
  event(s, 'Stay confirmed · operations reserved', `${r.guest} → room ${fresh.roomId} · ${fresh.prep.minutes} team minutes · ${fresh.prep.linen} linen sets`);
  return booking;
}

export function completeTask(s, id) {
  const t = s.tasks.find(x => x.id === id); if (!t) fail('Task not found.', 404);
  if (t.status === 'completed') return;
  if (!['scheduled','in_progress'].includes(t.status)) fail('This task is no longer scheduled.', 409);
  if (t.date !== s.date) fail('Only today’s tasks can be completed in this local simulation.', 409);
  const booking = s.reservations.find(b => b.id === t.bookingId) || (s.workOrders||[]).find(o=>o.id===t.orderId);
  const room=s.rooms.find(r=>r.id===t.roomId);
  if(room.maintenance?.status==='open')fail('Finish the repair before room preparation.',409);
  if(roomSnapshot(s,room).status==='occupied')fail('Check the guest out before room preparation.',409);
  if (t.kind === 'inspection' && s.tasks.some(x => (t.orderId?x.orderId===t.orderId:x.bookingId === t.bookingId) && x.kind === 'cleaning' && x.status !== 'completed')) fail('Complete cleaning before recording inspection.', 409);
  if(t.kind==='cleaning'&&s.linenStock-s.linenUsed<(booking?.linenReserved||0))fail('Physical clean linen is insufficient. Record a real receipt before completing cleaning.',409);
  t.status = 'completed'; t.completedAt = stamp();
  if (t.kind === 'cleaning') {
    booking.linenConsumed += booking.linenReserved; s.linenUsed += booking.linenReserved; booking.linenReserved = 0;
  } else { room.condition = 'ready';if(t.orderId){booking.status='completed';if(room.maintenance?.status==='recovery'){room.maintenance.status='closed';room.blocked=false;event(s,'Room reopened after recovery inspection',`Room ${room.id} · sellable again`);}} }
  s.version++; event(s, `${t.kind === 'cleaning' ? 'Cleaning' : 'Inspection'} recorded`, `Room ${t.roomId} · local staff simulation`);
}
export function cancelReservation(s, id) {
  const b = s.reservations.find(x => x.id === id); if (!b) fail('Reservation not found.', 404);
  if (b.status === 'cancelled') return;
  if(b.status!=='confirmed')fail('This reservation has been replaced and cannot be cancelled.',409);
  if(b.phase==='checked_in')fail('In-house cancellation requires an owner handover.',409);
  if(b.phase==='checked_out')fail('A completed stay cannot be cancelled through the guest flow. The owner must review the historic record.',409);
  if(s.tasks.some(t=>t.bookingId===id&&t.status==='in_progress'))fail('Finish active room work before cancelling the stay.',409);
  b.status = 'cancelled'; b.linenReserved = 0;
  s.tasks.filter(t => t.bookingId === id && t.status !== 'completed').forEach(t => { t.status = 'cancelled'; });
  const r = s.requests.find(r => r.id === b.requestId); if (r) r.status = 'cancelled';
  s.version++; event(s, 'Local reservation cancelled', `${b.guest} · pending work and reserved linen released; consumed linen retained`);
}
export function editRoom(s, id, body) {
  const room = s.rooms.find(r => r.id === id); if (!room) fail('Room not found.', 404);
  if (body.version !== s.version) fail('The property changed. Reload before editing.', 409);
  if (s.reservations.some(b => b.status === 'confirmed' && b.roomId === id)) fail('This room has a confirmed stay. Preserve its promise before editing availability or features.', 409);
  if(s.tasks.some(t=>t.roomId===id&&['scheduled','in_progress'].includes(t.status)))fail('Finish existing preparation before changing this room’s layout or resources.',409);
  if (typeof body.blocked !== 'boolean' || ['sea','quiet','stepFree'].some(f => typeof body[f] !== 'boolean')) fail('Check room features and availability.');
  Object.assign(room, { label: text(body.label, 50, 'room name'), capacity: integer(body.capacity, 1, 4, 'Capacity'), nightly: integer(body.nightly, 30, 2000, 'Nightly price'), sea: body.sea, quiet: body.quiet, stepFree: body.stepFree, blocked: body.blocked });
  if(body.type!==undefined){if(!roomTypes[body.type])fail('Choose a valid room type.');room.type=body.type;room.beds=roomTypes[body.type].beds;room.cleaning=roomTypes[body.type].cleaning;room.linen=roomTypes[body.type].linen;}
  if(body.view!==undefined){if(!['sea','garden','city'].includes(body.view))fail('Choose a valid view.');room.view=body.view;room.sea=body.view==='sea';}
  if(body.area!==undefined)room.area=integer(body.area,15,150,'Area');
  if(body.distances!==undefined){for(const k of ['elevator','breakfast','gym','pool'])integer(body.distances[k],0,300,`${k} distance`);room.distances={...body.distances};}
  if(room.maintenance&&room.maintenance.status!=='closed'&&!room.blocked)fail('Complete maintenance, recovery cleaning and inspection before reopening.',409);
  s.version++; event(s, 'Room updated', `Room ${id} · new offers use the updated room information`);
}

export function startTask(s,id) {
  const t=s.tasks.find(t=>t.id===id);if(!t)fail('Task not found.',404);
  if(t.status==='in_progress')return;
  if(t.status!=='scheduled'||t.date!==s.date)fail('Only today’s scheduled work can be started.',409);
  if(s.team.find(p=>p.id===t.assignee)?.unavailableDates?.includes(t.date))fail('This teammate is recorded absent. Reassign work before starting it.',409);
  const holder=s.reservations.find(b=>b.id===t.bookingId)||s.workOrders?.find(o=>o.id===t.orderId);if(t.kind==='cleaning'&&s.linenStock-s.linenUsed<(holder?.linenReserved||0))fail('Physical clean linen is insufficient.',409);
  const r=s.rooms.find(r=>r.id===t.roomId);
  if(r.maintenance?.status==='open'||roomSnapshot(s,r).status==='occupied')fail('Room is occupied or under maintenance.',409);
  if(t.kind==='inspection'&&s.tasks.some(x=>(t.orderId?x.orderId===t.orderId:x.bookingId===t.bookingId)&&x.kind==='cleaning'&&x.status!=='completed'))fail('Complete cleaning before starting inspection.',409);
  if(s.tasks.some(x=>x.id!==id&&x.assignee===t.assignee&&x.status==='in_progress'))fail('This team member is already working on another room.',409);
  t.status='in_progress';t.startedAt=stamp();s.version++;event(s,`${t.kind} started`,`Room ${r.id} · ${t.assigneeName} · local staff record`);
}

export function queueTurnover(s,roomId,reason='turnover') {
  const room=s.rooms.find(r=>r.id===roomId);if(!room)fail('Room not found.',404);
  if(room.maintenance?.status==='open'||roomSnapshot(s,room).status==='occupied')fail('Finish occupancy or maintenance before preparing this room.',409);
  s.workOrders??=[];
  const active=s.workOrders.find(o=>o.roomId===roomId&&['scheduled','needs_schedule'].includes(o.status));
  if(active?.status==='scheduled')return active;
  if(s.tasks.some(t=>t.roomId===roomId&&t.date===s.date&&['scheduled','in_progress'].includes(t.status)))return null;
  const order=active||{id:`TURN-${randomUUID().slice(0,8)}`,roomId,date:s.date,reason,linenReserved:0,linenConsumed:0};
  const preview=preparation(s,{checkIn:s.date,checkOut:new Date(Date.parse(s.date)+86400000).toISOString().slice(0,10)},{...room,condition:'dirty'});
  room.condition='dirty';
  if(preview){order.status='scheduled';order.linenReserved=preview.linen;order.readyAt=preview.readyAt;s.tasks.push(...preview.tasks.map(t=>({...t,id:`${order.id}-${t.kind}`,orderId:order.id,bookingId:null})));}
  else {order.status='needs_schedule';order.reasonDetail='Insufficient linen, staff slots, or an existing promise prevents preparation. Replenish/review and retry.';}
  if(!active)s.workOrders.push(order);
  s.version++;event(s,preview?'Room preparation linked':'Preparation needs capacity',`Room ${roomId} · ${reason}`);return order;
}

export function maintenanceAction(s,roomId,body) {
  const r=s.rooms.find(r=>r.id===roomId);if(!r)fail('Room not found.',404);
  if(body.version!==s.version)fail('The hotel changed. Refresh before updating maintenance.',409);
  if(body.action==='open'){
    if(r.maintenance&&r.maintenance.status!=='closed')fail('Maintenance is already active.',409);
    if(s.reservations.some(b=>b.roomId===roomId&&b.status==='confirmed'&&b.phase!=='checked_out'))fail('This room has a confirmed stay. Resolve that commitment before planned maintenance.',409);
    if(s.tasks.some(t=>t.roomId===roomId&&['scheduled','in_progress'].includes(t.status)))fail('Finish existing preparation before planned maintenance.',409);
    if(!['construction','repair'].includes(body.kind))fail('Choose construction or repair.');
    r.maintenance={id:randomUUID(),kind:body.kind,status:'open',note:text(body.note,200,'maintenance reason'),openedAt:stamp()};r.blocked=true;s.version++;
    event(s,'Room removed from sale',`${roomId} · ${body.kind} · pending guest options will be recalculated`);
  }else if(body.action==='repair_done'){
    if(r.maintenance?.status!=='open')fail('There is no open repair or construction work.',409);
    r.maintenance.status='recovery';r.maintenance.repairedAt=stamp();r.condition='dirty';s.version++;
    queueTurnover(s,roomId,'post-maintenance recovery');
    event(s,'Repair complete; room stays off sale',`${roomId} · recovery cleaning and inspection required`);
  }else fail('Unknown maintenance action.');
}

export function stayAction(s,id,action) {
  const b=s.reservations.find(b=>b.id===id);if(!b||b.status!=='confirmed')fail('Confirmed reservation not found.',404);
  const r=s.rooms.find(r=>r.id===b.roomId);
  if(action==='check_in'){
    if(b.phase==='checked_in')return;
    if(b.phase==='checked_out'||b.checkIn>s.date||b.checkOut<=s.date)fail('This stay cannot check in on the operating date.',409);
    if(r.blocked||r.condition!=='ready'||s.tasks.some(t=>t.roomId===r.id&&t.date===s.date&&['scheduled','in_progress'].includes(t.status)))fail('The room must pass inspection and be ready before check-in.',409);
    b.phase='checked_in';event(s,'Guest checked in',`${b.guest} · room ${r.id}`);
  }else if(action==='check_out'){
    if(b.phase==='checked_out')return;
    if(b.phase!=='checked_in'||b.checkOut!==s.date)fail('Only an in-house stay departing today can check out.',409);
    b.phase='checked_out';r.condition='dirty';queueTurnover(s,r.id,'guest checkout');event(s,'Checkout triggered room turnover',`${b.guest} · ${r.id} · cleaning, inspection and linen linked`);
  }else fail('Unknown stay action.');
  s.version++;
}

export function expandHotel(old) {
  if(old.schema===2)return old;
  const s=structuredClone(old);s.schema=2;s.workOrders=[];
  s.rooms=s.rooms.map(enrichRoom);
  const added=[];
  for(let floor=1;floor<=6;floor++)for(let col=1;col<=6;col++){
    const id=`${floor}0${col}`;if(s.rooms.some(r=>r.id===id))continue;
    const type=Object.keys(roomTypes)[col-1],spec=roomTypes[type];
    const view=col%3===0?'sea':col%3===1?'garden':'city';
    const room=enrichRoom({id,floor,type,label:spec.label,capacity:spec.capacity,nightly:spec.nightly+(floor-1)*10,quiet:col>2,stepFree:type==='accessible'||floor===1,sea:view==='sea',view,condition:'ready',releaseAt:660,cleaning:spec.cleaning,linen:spec.linen,blocked:false});
    s.rooms.push(room);added.push(id);
  }
  s.rooms.sort((a,b)=>a.id.localeCompare(b.id));s.linenStock+=60;s.breakfastStock=48;
  s.team.push({id:'mina',name:'Mina',role:'housekeeper',start:660,end:1080,breaks:[[780,810]]},{id:'noah',name:'Noah',role:'housekeeper',start:660,end:1080,breaks:[[750,780]]},{id:'jules',name:'Jules',role:'inspector',start:660,end:1080,breaks:[[780,810]]});
  s.facilities=[{id:'breakfast',label:'Breakfast & lounge',floor:0,detail:'Ground floor · 07:00–10:00'},{id:'gym',label:'Fitness studio',floor:2,detail:'Level 2 · 06:00–22:00'},{id:'pool',label:'Pool & spa',floor:0,detail:'Ground floor · 08:00–21:00'},{id:'elevator',label:'Central elevator',floor:'all',detail:'All floors · step-free circulation'}];
  const occupied=['104','106','204','205','206','304','305','401','402','403','501','502','601'];
  const guests=['Avery Brooks','Leo Park','Nora Chen','Amir Patel','Lucia Costa','Ben Wilson','Yuna Lee','Mia Scott','Theo Lin','Ella Reed','Daniel Cho','Zoe Hill','Aria Kim'];
  occupied.forEach((id,i)=>{if(!added.includes(id))return;s.reservations.push({id:`HOTEL-${id}`,guest:guests[i],roomId:id,channel:channels[(i+2)%channels.length],party:2,breakfast:i%2?0:2,checkIn:'2026-10-28',checkOut:i%4===0?s.date:'2026-10-31',arrival:900,total:300,status:'confirmed',phase:'checked_in',linenReserved:0,linenConsumed:0,hard:[],preferences:[]});});
  for(const [id,kind,note] of [['406','construction','Bathroom renovation'],['506','repair','Air-conditioning service']])if(added.includes(id)){const r=s.rooms.find(r=>r.id===id);r.blocked=true;r.maintenance={id:`MAINT-${id}`,kind,status:'open',note,openedAt:stamp()};}
  for(const id of ['404','504','603'])if(added.includes(id)){const r=s.rooms.find(r=>r.id===id);r.condition='dirty';const o=queueTurnover(s,id,'sample turnover');if(o?.status==='scheduled'){const clean=s.tasks.find(t=>t.orderId===o.id&&t.kind==='cleaning');if(id==='404')startTask(s,clean.id);else{completeTask(s,clean.id);if(id==='603')startTask(s,s.tasks.find(t=>t.orderId===o.id&&t.kind==='inspection').id);}}}
  s.version++;event(s,'Hotel expanded to 36 rooms','Six floors · six types · route distances · +60 demo linen sets and three roster members. Existing records retained.');
  for(const r of s.requests)if(!['confirmed','cancelled','amended'].includes(r.status))refreshRequest(s,r.id);
  return s;
}

export function newWorld({legacy=false}={}) {
  const s = { schema: 1, version: 1, name: 'Harbor House', date: '2026-10-29', timezone: 'Asia/Seoul', linenStock: 24, linenUsed: 0, breakfastStock: 16,
    rooms: Array.from({length:9}, (_, i) => ({ id: `${Math.floor(i/3)+1}0${i%3+1}`, floor: Math.floor(i/3)+1, label: ['Garden hideaway','Courtyard studio','Ocean corner'][i%3], capacity: i%3===1?3:2, sea: i%3===2, quiet: i%3!==1, stepFree: i<3, nightly: [120,135,165][i%3]+Math.floor(i/3)*15, condition: [0,4,8].includes(i)?'ready':'dirty', releaseAt: i===5?780:660, cleaning: 40, linen: 2, blocked: false })),
    team: [{id:'alex',name:'Alex',role:'housekeeper',start:660,end:1020,breaks:[[750,780]]},{id:'sam',name:'Sam',role:'housekeeper',start:660,end:1020,breaks:[[720,750]]},{id:'lee',name:'Lee',role:'inspector',start:660,end:1020,breaks:[[750,780]]}],
    requests: [], reservations: [], tasks: [], activity: [] };
  for (const [guest, roomId, channel, breakfast] of [['Maya Chen','101','airbnb',2],['Alex Rivera','202','booking',0],['Oliver Reed','303','trip',2]]) {
    s.reservations.push({ id:`SEED-${roomId}`,guest,roomId,channel,party:2,breakfast,checkIn:s.date,checkOut:'2026-10-31',arrival:900,total:300,status:'confirmed',linenReserved:0,linenConsumed:0,hard:[],preferences:[] });
  }
  const samples = [
    ['Sofia Martin','airbnb','I would love a quiet room with a sea view.',[],['quiet','sea']],
    ['Daniel Kim','agoda','I need step-free access. A quiet room would be lovely.',['stepFree'],['quiet']],
    ['Emma Wilson','sms','We must have connecting rooms.',[],[]],
  ];
  for (const [guest, source, message, hard, prefs] of samples) {
    const claims = [...hard.map(feature=>({kind:'requirement',feature,evidence:'I need step-free access.'})),...prefs.map(feature=>({kind:'preference',feature,evidence:message}))];
    if (source==='sms') claims.push({kind:'unsupported_required',feature:null,evidence:'We must have connecting rooms.'});
    addRequest(s,{guest,message,checkIn:s.date,checkOut:'2026-10-31',party:2,arrival:840,latest:960,breakfast:0},{claims,provider:'Sample fixture · no model call'},`seed-${source}`,source);
  }
  return legacy?s:expandHotel(s);
}

export function publicRequest(r) { const {idempotencyKey, fingerprint, coordinationQuotes, cancellationOffer, cancelledWith, ...rest} = r; return rest; }
export function worldView(s, selectedDate = s.date) {
  if (!date(selectedDate) || selectedDate < s.date || nights(s.date, selectedDate) > 29) fail('Choose a date in the next 30 days.');
  const live = s.reservations.filter(b => b.status === 'confirmed');
  const staying = live.filter(b => b.phase!=='checked_out'&&b.checkIn <= selectedDate && (b.checkOut > selectedDate||(selectedDate===s.date&&b.checkOut===selectedDate&&b.phase==='checked_in')));
  const todayTasks = s.tasks.filter(t => t.date === selectedDate && t.status !== 'cancelled');
  const linenReserved = linenHolders(s).reduce((n,b)=>n+b.linenReserved,0);
  const roomStates=Object.fromEntries(s.rooms.map(r=>[r.id,roomSnapshot(s,r,selectedDate)]));
  const statusCounts=Object.values(roomStates).reduce((acc,r)=>(acc[r.status]=(acc[r.status]||0)+1,acc),{});
  // Breakfast is served on each occupied night’s following morning.
  const covers = live.filter(b=>b.checkIn < selectedDate && b.checkOut >= selectedDate).reduce((n,b)=>n+b.breakfast,0);
  return { ...s, roomStates, statusCounts, requests: s.requests.map(publicRequest), selectedDate, summary: { staying: staying.length, arrivals: staying.filter(b=>b.checkIn===selectedDate).length, attention: s.requests.filter(r=>r.status==='confirmed'&&r.cancellationException).length+s.requests.filter(r=>r.status==='needs_review'&&!['waiting','queued'].includes(r.coordination?.status)).length+(s.workOrders||[]).filter(o=>o.status==='needs_schedule').length, pendingTasks: todayTasks.filter(t=>t.status!=='completed').length, linenReserved, linenAvailable:s.linenStock-s.linenUsed-linenReserved, breakfast:covers, breakfastShortage:Math.max(0,covers-s.breakfastStock) } };
}
