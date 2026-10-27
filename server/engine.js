import { randomUUID } from 'node:crypto';

export class DomainError extends Error {
  constructor(message, code = 'INVALID') { super(message); this.code = code; }
}
const m = (time) => { const [h, n] = time.split(':').map(Number); return h * 60 + n; };
export const formatTime = (mins) => `${String(Math.floor(mins / 60)).padStart(2, '0')}:${String(mins % 60).padStart(2, '0')}`;
const stamp = () => new Date().toISOString();
const addEvent = (state, title, detail, kind = 'info') => state.activity.unshift({ id: randomUUID(), time: stamp(), title, detail, kind });

export function initialState() {
  return {
    version: 1,
    property: { name: 'Harbor House', rooms: 20, date: '2026-10-29', timezone: 'Asia/Seoul' },
    booking: { id: 'BK-1048', guest: 'The Park group', rooms: ['203','204','205','206'], guests: 12, guaranteedArrival: 900, arrival: null, status: 'confirmed', breakfast: 0 },
    request: { message: 'Could our group of 12 check in at 14:00? We have four rooms and would also like breakfast the next morning.', requestedTime: 840, breakfast: 12, rooms: 4, guests: 12 },
    rooms: [
      { id:'203', departure:780, cleaning:60, inspection:15, buffer:15, linen:3, status:'waiting' },
      { id:'204', departure:660, cleaning:60, inspection:15, buffer:15, linen:3, status:'waiting' },
      { id:'205', departure:600, cleaning:0, inspection:0, buffer:0, linen:0, status:'ready', readyAt:600 },
      { id:'206', departure:660, cleaning:60, inspection:15, buffer:15, linen:3, status:'waiting' },
    ],
    staff: [
      { id:'alex', name:'Alex', role:'Housekeeper', start:660, end:900, breaks:[[720,750]] },
      { id:'sam', name:'Sam', role:'Housekeeper', start:660, end:900, breaks:[[720,750]] },
      { id:'lee', name:'Lee', role:'Inspector', start:660, end:900, breaks:[[720,750]] },
    ],
    linen: { onHand:6, delivery:3, deliveryAt:750, allocated:0 },
    breakfast: { existing:18, added:0, onHand:24, delivery:6, safety:3, minOrder:6, price:4, order:null, serviceDate:'2026-10-30' },
    offer: null, execution: null, tasks: [], exceptions: [], activity: [], simulatedClock: '28 Oct · 09:00',
  };
}

function availableStart(person, earliest, duration, allocations) {
  let cursor = Math.max(earliest, person.start);
  const blocked = [...person.breaks, ...(allocations[person.id] || [])].sort((a,b) => a[0] - b[0]);
  for (const [start,end] of blocked) {
    if (cursor + duration <= start) break;
    if (cursor < end && cursor + duration > start) cursor = end;
  }
  return cursor + duration <= person.end ? cursor : null;
}

// Greedy scheduling is deliberately scoped to this fixture; reservations and actual staffing are simulated.
export function calculateSchedule(state) {
  const allocations = Object.fromEntries(state.staff.map(s => [s.id, []]));
  const rooms = state.rooms.map(room => ({ ...room }));
  const jobs = [];
  let linenAllocated = 0;
  for (const room of rooms.filter(r => r.status !== 'ready').sort((a,b) => a.departure - b.departure || a.id.localeCompare(b.id))) {
    let earliest = room.departure;
    if (linenAllocated + room.linen > state.linen.onHand) earliest = Math.max(earliest, state.linen.deliveryAt);
    if (linenAllocated + room.linen > state.linen.onHand + state.linen.delivery) throw new DomainError('Not enough clean linen is due before preparation.', 'LINEN_SHORTAGE');
    const candidates = state.staff.filter(s => s.role === 'Housekeeper').map(person => ({ person, start: availableStart(person, earliest, room.cleaning, allocations) })).filter(x => x.start !== null).sort((a,b) => a.start-b.start || a.person.name.localeCompare(b.person.name));
    if (!candidates.length) throw new DomainError(`No approved housekeeper can prepare room ${room.id}.`, 'STAFF_SHORTAGE');
    const cleaner = candidates[0];
    const cleanEnd = cleaner.start + room.cleaning;
    allocations[cleaner.person.id].push([cleaner.start, cleanEnd]);
    const inspectors = state.staff.filter(s => s.role === 'Inspector').map(person => ({ person, start: availableStart(person, cleanEnd, room.inspection, allocations) })).filter(x => x.start !== null).sort((a,b) => a.start-b.start || a.person.name.localeCompare(b.person.name));
    if (!inspectors.length) throw new DomainError(`No approved inspector can inspect room ${room.id}.`, 'STAFF_SHORTAGE');
    const inspector = inspectors[0];
    const inspectionEnd = inspector.start + room.inspection;
    allocations[inspector.person.id].push([inspector.start, inspectionEnd]);
    linenAllocated += room.linen;
    room.readyAt = inspectionEnd + room.buffer;
    room.cleaner = cleaner.person.name; room.cleanStart = cleaner.start; room.cleanEnd = cleanEnd;
    room.inspector = inspector.person.name; room.inspectStart = inspector.start; room.inspectEnd = inspectionEnd;
    jobs.push({id:`clean-${room.id}`, room:room.id, kind:'cleaning', assignee:room.cleaner, start:room.cleanStart, end:room.cleanEnd, status:'scheduled'});
    jobs.push({id:`inspect-${room.id}`, room:room.id, kind:'inspection', assignee:room.inspector, start:room.inspectStart, end:room.inspectEnd, status:'scheduled'});
  }
  return { rooms, jobs, linenAllocated, cleaningMinutes: jobs.filter(j => j.kind === 'cleaning').reduce((n,j)=>n+j.end-j.start,0), inspectionMinutes: jobs.filter(j => j.kind === 'inspection').reduce((n,j)=>n+j.end-j.start,0) };
}

export function validateRequest(request, state) {
  if (!request || typeof request !== 'object') throw new DomainError('Request details are missing.');
  if (typeof request.requestedTime !== 'number' || typeof request.breakfast !== 'number') throw new DomainError('Enter the arrival time and breakfast portions.');
  const time = request.requestedTime, breakfast = request.breakfast;
  if (!Number.isInteger(time) || time < 660 || time > 900 || time % 15 !== 0) throw new DomainError('Choose an arrival time between 11:00 and 15:00 in 15-minute steps.');
  if (!Number.isInteger(breakfast) || breakfast < 0 || breakfast > state.booking.guests) throw new DomainError('Breakfast portions must be between 0 and 12.');
  return { message: String(request.message || '').slice(0, 1000), requestedTime:time, breakfast, rooms:4, guests:12 };
}

export function makeOffer(state, request) {
  if (state.execution && !['needs_replan'].includes(state.execution.status)) throw new DomainError('Reset the demo to create another request.', 'ALREADY_STARTED');
  const normalized = validateRequest(request, state);
  const schedule = calculateSchedule(state);
  const ready = schedule.rooms.filter(r => r.readyAt <= normalized.requestedTime);
  const last = Math.max(...schedule.rooms.map(r => r.readyAt));
  const originalFeasible = schedule.rooms.every(r => r.readyAt <= state.booking.guaranteedArrival);
  const options = [];
  if (originalFeasible) options.push({id:'standard', title:'Keep the confirmed arrival', description:'All four rooms together', arrival:state.booking.guaranteedArrival, early:[], late:[], split:false});
  if (ready.length === schedule.rooms.length && normalized.requestedTime < state.booking.guaranteedArrival) options.unshift({id:'early', title:'All rooms earlier', description:`All four rooms at ${formatTime(normalized.requestedTime)}`, arrival:normalized.requestedTime, early:ready.map(r=>r.id), late:[], split:false});
  else if (ready.length > 0 && ready.length < schedule.rooms.length && last <= state.booking.guaranteedArrival && normalized.requestedTime < state.booking.guaranteedArrival) options.unshift({id:'split', title:'Start with rooms that are ready', description:`${ready.length} rooms at ${formatTime(normalized.requestedTime)} · remaining at ${formatTime(last)}`, arrival:normalized.requestedTime, early:ready.map(r=>r.id), late:schedule.rooms.filter(r=>r.readyAt>normalized.requestedTime).map(r=>r.id), lastReady:last, split:true});
  if (!options.length) throw new DomainError('No feasible plan protects the existing arrival. Review the room schedule.', 'NO_FEASIBLE_PLAN');
  const wanted = state.breakfast.existing + normalized.breakfast;
  const shortage = Math.max(0,wanted + state.breakfast.safety - state.breakfast.onHand - state.breakfast.delivery);
  const orderQty = shortage ? Math.ceil(shortage/state.breakfast.minOrder)*state.breakfast.minOrder : 0;
  state.request = normalized;
  state.offer = { id: randomUUID(), snapshotVersion:state.version, request:normalized, schedule, options, breakfast:{ covers:wanted, shortage, orderQty, amount:orderQty*state.breakfast.price }, createdAt:stamp() };
  addEvent(state,'Options prepared',`${normalized.guests} guests · ${formatTime(normalized.requestedTime)} requested`);
  return state;
}

export function acceptOffer(state, {offerId, optionId, addBreakfast, guestAccepted, breakfastAccepted, injectFailure = false}) {
  const offer = state.offer;
  if (!offer || offer.id !== offerId) throw new DomainError('This offer no longer exists. Prepare the options again.', 'STALE_OFFER');
  if (state.execution) {
    if (state.execution.offerId === offerId && state.execution.optionId === optionId) return state;
    throw new DomainError('Another change is already in progress.', 'ALREADY_STARTED');
  }
  if (state.version !== offer.snapshotVersion) throw new DomainError('The property changed after this offer. Review updated options.', 'STALE_OFFER');
  if (guestAccepted !== true) throw new DomainError('The guest must select the arrival arrangement before it can be applied.');
  if (addBreakfast === true && breakfastAccepted !== true) throw new DomainError('The guest must separately accept the breakfast terms.');
  const option = offer.options.find(x => x.id === optionId);
  if (!option) throw new DomainError('Select a valid arrival option.');
  state.booking.pendingArrival = { optionId, early:option.early, late:option.late, time:option.arrival, lastReady:option.lastReady || option.arrival };
  state.booking.status = 'update_pending';
  state.version++;
  state.execution = { id:randomUUID(), offerId, optionId, addBreakfast:addBreakfast === true, status:'applying', expectedVersion:state.version, startedAt:stamp(), actions:[{id:'reservation',label:'Arrival arrangement',status:'applied_unverified',detail:'Pending update awaiting readback'},{id:'housekeeping',label:'Housekeeping schedule',status:'pending'},{id:'linen',label:'Linen allocation',status:'pending'},{id:'breakfast',label:'Breakfast entitlement',status:'pending'}] };
  addEvent(state,'Guest selected an option','Reservation update recorded · preparing the operating plan');
  if (injectFailure === true) {
    state.execution.status = 'partially_applied';
    state.execution.actions[1].status='failed';
    state.exceptions.push({ id:'housekeeping', type:'failure', title:'Housekeeping schedule needs confirmation', detail:'The arrival update is recorded, but the room tasks were not applied. Guest confirmation is pending.', status:'open' });
    addEvent(state,'Housekeeping update failed','Arrival update is pending; no duplicate tasks were created.','warning');
    return state;
  }
  return finishExecution(state);
}

function finishExecution(state) {
  const e = state.execution;
  if (!e || !state.offer || e.expectedVersion !== state.version) {
    if (e) e.status = 'needs_replan';
    throw new DomainError('The property changed. Review a new plan before applying.', 'STALE_PLAN');
  }
  const schedule = state.offer.schedule;
  state.tasks = schedule.jobs.map(j=>({...j}));
  state.linen.allocated = schedule.linenAllocated;
  state.breakfast.added = e.addBreakfast ? state.offer.request.breakfast : 0;
  const covers = state.breakfast.existing + state.breakfast.added;
  const shortfall = Math.max(0, covers + state.breakfast.safety - state.breakfast.onHand - state.breakfast.delivery);
  const qty = shortfall ? Math.ceil(shortfall/state.breakfast.minOrder)*state.breakfast.minOrder : 0;
  if (qty) {
    state.breakfast.order = {id:'ORDER-DRAFT-1048', quantity:qty, amount:qty*state.breakfast.price, status:'approval_required', version:state.version+1};
    if (!state.exceptions.some(x=>x.id==='supply')) state.exceptions.push({id:'supply',type:'purchase',title:'Breakfast buffer needs a decision',detail:`Draft ${qty} packs · $${qty*state.breakfast.price} · not sent`,status:'open'});
  }
  state.booking.arrival = state.booking.pendingArrival;
  delete state.booking.pendingArrival;
  state.booking.breakfast = state.breakfast.added;
  state.booking.status = 'applied_unverified';
  for (const action of e.actions) { action.status = 'applied_unverified'; delete action.checkedAt; }
  e.status = 'applied_unverified';
  state.version++;
  addEvent(state,'Operating updates applied','Waiting for local record readback before confirming the arrival.');
  return state;
}

// Compare the independently reloaded local record to the computed plan before claiming verification.
export function confirmReadback(state, stored) {
  const e=state.execution, actual=stored.execution;
  if (!e || !actual || actual.id!==e.id || stored.version!==state.version) throw new DomainError('Local readback did not match the pending update.', 'READBACK_MISMATCH');
  if (e.status === 'partially_applied') {
    if (stored.booking.status!=='update_pending' || JSON.stringify(stored.booking.pendingArrival)!==JSON.stringify(state.booking.pendingArrival)) throw new DomainError('The pending arrival could not be verified.', 'READBACK_MISMATCH');
    const reservation=e.actions.find(a=>a.id==='reservation'); reservation.status='verified'; reservation.detail='Pending update read back'; reservation.checkedAt=stamp();
    return state;
  }
  if (e.status!=='applied_unverified' || actual.status!=='applied_unverified') return state;
  const planned=state.offer.schedule.jobs;
  const expectedBreakfast=e.addBreakfast ? state.offer.request.breakfast : 0;
  const shortfall=Math.max(0,stored.breakfast.existing + expectedBreakfast + stored.breakfast.safety - stored.breakfast.onHand - stored.breakfast.delivery);
  const expectedQty=shortfall ? Math.ceil(shortfall/stored.breakfast.minOrder)*stored.breakfast.minOrder : 0;
  const order=stored.breakfast.order;
  const orderMatches=expectedQty ? order?.quantity===expectedQty && order.amount===expectedQty*stored.breakfast.price && order.status==='approval_required' && order.version===stored.version : order===null;
  if (stored.booking.status!=='applied_unverified' || stored.booking.arrival?.optionId!==e.optionId || stored.booking.breakfast!==expectedBreakfast || JSON.stringify(stored.tasks)!==JSON.stringify(planned) || stored.linen.allocated!==state.offer.schedule.linenAllocated || stored.breakfast.added!==expectedBreakfast || !orderMatches) throw new DomainError('The operating records did not match the selected plan.', 'READBACK_MISMATCH');
  state.booking.status='confirmed_scheduled';
  for (const action of e.actions) {action.status='verified'; action.checkedAt=stamp(); if(action.id==='reservation')action.detail='Arrival arrangement read back';}
  e.status='verified'; e.completedAt=stamp();
  state.exceptions=state.exceptions.map(x=>x.id==='housekeeping' ? {...x,status:'resolved'} : x);
  addEvent(state,'Operating plan confirmed','Arrival arrangement and task updates read back. Rooms remain scheduled until staff completion.','success');
  return state;
}

export function retryExecution(state) {
  if (!state.execution || state.execution.status !== 'partially_applied') throw new DomainError('There is no failed update to retry.');
  return finishExecution(state);
}

export function approveDraft(state, id, version, amount) {
  const order = state.breakfast.order;
  if (!order || order.id !== id || order.version !== version || order.amount !== amount) throw new DomainError('The purchase draft changed. Review it again.', 'STALE_APPROVAL');
  if (order.status === 'approved_not_sent') return state;
  if (order.status !== 'approval_required') throw new DomainError('This draft cannot be approved.');
  if (state.version !== version) throw new DomainError('The property changed. Review this draft again.', 'STALE_APPROVAL');
  order.status='approved_not_sent'; order.approvedAt=stamp();
  state.exceptions = state.exceptions.map(x=>x.id==='supply' ? {...x,status:'resolved'} : x);
  addEvent(state,'Purchase draft approved',`${order.quantity} packs · $${order.amount} · not sent`);
  return state;
}

export function replayStaffCompletion(state) {
  if (state.execution?.status !== 'verified') throw new DomainError('The operating plan must be confirmed first.');
  if (state.simulatedClock === '29 Oct · 15:00') return state;
  for (const task of state.tasks) { task.status='completed'; task.evidence=`SIM-${task.id}`; task.completedAt=formatTime(task.end); }
  for (const room of state.rooms) if (room.status !== 'ready') { room.status='ready'; room.evidence=`SIM-inspection-${room.id}`; }
  state.simulatedClock='29 Oct · 15:00'; state.version++;
  addEvent(state,'Staff completion replayed','Three cleaning and inspection tasks completed in the simulated timeline.','success');
  return state;
}

export function invalidatePlan(state) { state.version++; addEvent(state,'Property data changed','A simulated external update changed the source version.','warning'); return state; }
export function replan(state) {
  if (!state.execution || state.execution.status !== 'partially_applied' || state.execution.expectedVersion === state.version) throw new DomainError('A new plan is not required.');
  delete state.booking.pendingArrival;
  state.booking.status = 'confirmed';
  state.execution = null; state.offer = null;
  state.exceptions = state.exceptions.filter(x => x.id !== 'housekeeping');
  addEvent(state,'Plan cleared for review','The original arrival remains confirmed; the guest must select updated terms.');
  return state;
}
export const serializeTime = formatTime;
