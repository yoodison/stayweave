import {createHash} from 'node:crypto';

// An evidence projection: never mutate hotel state or manufacture earlier proposals.
export function modelEvidence(r) {
  const i=r.interpretation||{}, m=i.measurement;
  return {id:r.id,guest:r.guest,message:r.message,checkIn:r.checkIn,checkOut:r.checkOut,
    claims:(i.claims||[]).map(({kind,feature,evidence})=>({kind,feature,evidence})),
    measurement:m?{id:m.id,at:m.at,model:m.responseModel||i.responseModel||i.model,
      latencyMs:m.latencyMs,estimatedUsd:m.estimatedUsd,status:m.status,
      tokens:m.usage?.total_tokens}:null};
}
export function summarizeCalls(requests) {
  const calls=[...new Map(requests.filter(r=>r.measurement?.id).map(r=>[r.measurement.id,r.measurement])).values()];
  const costs=calls.map(c=>c.estimatedUsd), times=calls.map(c=>c.latencyMs).filter(Number.isFinite).sort((a,b)=>a-b);
  return {calls:calls.length,missingMeasurements:requests.filter(r=>!r.measurement?.id).length,
    estimatedUsd:calls.length&&requests.every(r=>r.measurement?.id)&&costs.every(Number.isFinite)?costs.reduce((a,b)=>a+b,0):null,
    minMs:times[0]??null,maxMs:times.at(-1)??null,
    tokens:calls.length&&calls.every(c=>Number.isFinite(c.tokens))?calls.reduce((n,c)=>n+c.tokens,0):null,
    models:[...new Set(calls.map(c=>c.model).filter(Boolean))]};
}
export function presentationSnapshot(state) {
  const round=state.coordinationDemo?.completedRound, demo=state.lifecycleDemo;
  const ids=[...(state.coordinationDemo?.requestIds||[]),demo?.holderId,...(demo?.requestIds||[])].filter(Boolean);
  const requests=ids.map(id=>state.requests.find(r=>r.id===id)).filter(Boolean).map(modelEvidence);
  const events=state.lifecycle?.events||[];
  const find=(id,kind)=>events.filter(e=>e.requestId===id&&e.kind===kind).sort((a,b)=>a.at.localeCompare(b.at))[0];
  const lifecycle=demo?[find(demo.holderId,'selected'),find(demo.requestIds?.[0],'option_declined'),find(demo.requestIds?.[1],'expired'),find(demo.holderId,'cancelled'),find(demo.requestIds?.[2],'selected')]:[];
  if(!round?.plans?.[0]||requests.length!==7||lifecycle.length!==5||lifecycle.some(e=>!e))return {ready:false,reason:'Complete the concurrent guest demo and all four lifecycle reactions first. Existing stays will not be reset.',requests,chapters:[]};
  const plan=round.plans[0], assignments=plan.assignments.map(a=>({requestId:a.requestId,guest:a.guest,roomId:a.option?.roomId,oldRoomId:a.oldRoomId,checkIn:a.checkIn,checkOut:a.checkOut,matched:a.option?.matched||[],unmet:a.option?.unmet||[],reasons:a.option?.reasons||[]}));
  const common={roomIds:plan.roomIds,requestIds:state.coordinationDemo.requestIds};
  const chapters=[
    {id:'intake',title:'Every guest has a different ask.',eyebrow:'01 / REQUESTS → INTERPRETATION',...common,roomIds:[],
      why:'Nemotron separates a required sea view from a flexible preference. Dates and party size come from validated structured fields.',
      code:'Hard requirements remain mandatory. Preferences can be traded off; purchased rights cannot.',saved:'Interpretations recorded. This chapter does not claim a booking change.',applied:false},
    {id:'coordinate',title:'One hotel. Three agents. A shared plan.',eyebrow:'02 / JOINT ALLOCATION',...common,assignments,
      why:'Riley’s required sea view receives room 503. Casey receives 504; Jamie receives 505. The shared plan makes the preference trade-offs visible.',
      code:`${round.nodes} search nodes · ${round.competingFirstChoices} competing first choices · ${round.latencyMs} ms coordinator time. Availability and resource limits are code-checked.`,
      saved:'Recorded allocation from the completed round, not a current bookable offer.',applied:false},
    {id:'choices',title:'A choice becomes a connected plan.',eyebrow:'03 / CUSTOMER CHOICES → SAVED WORK',...common,assignments,impact:plan.impact,applied:true,
      why:'Three separate simulated customer choices were saved. Casey’s original stay was replaced only when Casey selected the new terms.',
      code:'Each choice rechecks availability, terms and operating capacity. No agent can choose for a customer.',saved:'Three local bookings saved. Breakfast moves to the new stay dates; preparation workload is unchanged for these ready rooms.'},
    {id:'new-requests',title:'Then the day changes.',eyebrow:'04 / FOUR MORE REQUESTS',roomIds:['502','405','105'],requestIds:[demo.holderId,...demo.requestIds],applied:false,
      why:'Four more guests enter the hotel’s queue. Nemotron interprets quiet-room and flexible-view preferences.',
      code:'Exact room constraints, dates and party sizes are structured inputs. An offer reserves no linen or staff time.',saved:'Recorded request intake. Guest choices and the subsequent reactions follow.'},
  ];
  const titles=['Avery chooses. Preparation begins on paper.','Drew says no. Everyone gets rechecked.','Parker is silent. A promise stays safe.','Avery cancels. Capacity returns.','Quinn chooses. The hotel is in sync.'];
  lifecycle.forEach((e,i)=>chapters.push({id:e.id,title:titles[i],eyebrow:`0${i+5} / ${['CONFIRMED CHOICE','REJECTION → RE-OFFER','RESPONSE DEADLINE','CANCELLATION → RE-OFFER','NEW CHOICE → OPERATIONS'][i]}`,
    requestIds:[e.requestId],roomIds:e.roomIds,impact:structuredClone(e.impact),tasks:e.tasks.map(({id,roomId,kind,status})=>({id,roomId,kind,status})),
    reoffered:e.reoffered.map(({guest,beforeRoomId,roomId,reason})=>({guest,beforeRoomId,roomId,reason})),nextRoomId:e.nextRoomId,
    applied:true,source:e.source,at:e.at,why:e.reason,
    code:i===1?'The declined room is excluded. Remaining guest requests are re-scored together.':i===2?'The simulated deadline expires the offer, not any existing booking.':i===3?'Cancellation releases only unstarted work and unused allocations. Completed work remains recorded.':'The guest’s exact choice is checked again before reservation and tasks are saved together.',
    saved:i===1?`Drew’s fresh option: ${e.nextRoomId}. Other changed suggestions are shown below. No booking or resource use changed.`:i===2?'Offer expired. No booking, linen, breakfast or staffing allocation changed.':i===3?'Cancellation saved. Quinn receives a fresh option; Quinn has not yet accepted it.':'Customer choice and local operating plan saved and read back.'}));
  return {ready:true,id:createHash('sha256').update(JSON.stringify([round.id,...lifecycle.map(e=>e.id),...requests.map(r=>r.measurement?.id)])).digest('hex').slice(0,16),
    scope:'Recorded local demo · fictional guests · real provider responses · simulated customer choices',
    requests,chapters,metrics:summarizeCalls(requests),coordinatorMs:round.latencyMs,
    excluded:'Metrics cover the seven successful interpretations in this story only. Earlier clarification attempts and other app calls are excluded. Estimates use recorded token usage, not provider invoices.',
    currentReadback:{at:new Date().toISOString(),bookings:ids.map(id=>state.requests.find(r=>r.id===id)).filter(r=>r.bookingId).map(r=>{const b=state.reservations.find(b=>b.id===r.bookingId);return {guest:r.guest,id:r.bookingId,status:b?.status||'missing',roomId:b?.roomId}})}};
}
