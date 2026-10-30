import { calculateSchedule, DomainError } from './engine.js';

// A separate, synthetic example: it does not read or update the Park group booking.
const rooms = [
  {id:'201', label:'Garden room', capacity:2, stepFree:true, quiet:true, sea:false, status:'ready', readyAt:660, departure:660,cleaning:0,inspection:0,buffer:0,linen:0},
  {id:'202', label:'Coast room', capacity:2, stepFree:false, quiet:false, sea:true, status:'waiting', departure:720,cleaning:45,inspection:15,buffer:15,linen:2},
  {id:'203', label:'Coast room', capacity:2, stepFree:false, quiet:true, sea:true, status:'waiting', departure:780,cleaning:45,inspection:15,buffer:15,linen:2},
  {id:'204', label:'Courtyard room', capacity:2, stepFree:true, quiet:false, sea:false, status:'ready', readyAt:660, departure:660,cleaning:0,inspection:0,buffer:0,linen:0},
  {id:'205', label:'Coast room', capacity:2, stepFree:true, quiet:true, sea:true, status:'blocked', blockedReason:'Already reserved for these dates',departure:660,cleaning:0,inspection:0,buffer:0,linen:0},
];
const guests = [
  {id:'maya', name:'Maya Chen', initials:'MC', status:'confirmed', party:2, arrival:840, latest:840, hard:['stepFree'], preference:'quiet'},
  {id:'alex', name:'Alex Rivera', initials:'AR', status:'confirmed', party:2, arrival:900, latest:900, hard:['sea'], preference:'quiet'},
  {id:'sam', name:'Sam Park', initials:'SP', status:'request', party:2, arrival:840, latest:960, hard:[], preference:'sea'},
];
const options=['sea','quiet','stepFree','none'];
const labels={sea:'Sea view',quiet:'Quiet room',stepFree:'Step-free access',none:'No preference'};
const staff=[
  {id:'alex-cleaner',name:'Alex',role:'Housekeeper',start:720,end:960,breaks:[]},
  {id:'sam-cleaner',name:'Sam',role:'Housekeeper',start:720,end:960,breaks:[]},
  {id:'lee-inspector',name:'Lee',role:'Inspector',start:720,end:960,breaks:[]},
];
const clone=x=>structuredClone(x);
const minute=n=>`${String(Math.floor(n/60)).padStart(2,'0')}:${String(n%60).padStart(2,'0')}`;
export function matchingDefaults(){return {preferences:Object.fromEntries(guests.map(g=>[g.id,g.preference])),linenDelayed:false};}
function inputs(body){
  if(!body || typeof body!=='object' || Array.isArray(body))throw new DomainError('Choose valid scenario settings.');
  const keys=Object.keys(body);
  if(keys.some(k=>!['preferences','linenDelayed'].includes(k)))throw new DomainError('Unknown scenario setting.');
  if(typeof body.linenDelayed!=='boolean'||!body.preferences||typeof body.preferences!=='object'||Array.isArray(body.preferences))throw new DomainError('Choose valid scenario settings.');
  const ids=guests.map(g=>g.id);
  if(Object.keys(body.preferences).length!==ids.length||ids.some(id=>!options.includes(body.preferences[id])))throw new DomainError('Choose a valid preference for each guest.');
  return {preferences:Object.fromEntries(ids.map(id=>[id,body.preferences[id]])),linenDelayed:body.linenDelayed};
}
function isCompatible(g,r){return r.status!=='blocked' && r.capacity>=g.party && (!g.assignedRoomId || g.assignedRoomId===r.id) && g.hard.every(key=>r[key]===true);}
function findPlans(settings, data={rooms,guests,staff,linen:{onHand:2,delivery:2,deliveryAt:settings.linenDelayed?840:750}}){
  const people=data.guests.map(g=>({...g,preference:settings.preferences[g.id]}));
  const usable=data.rooms.filter(r=>r.status!=='blocked'); const combinations=[];
  function enumerate(index,chosen,used){
    if(index===people.length){combinations.push([...chosen]);return;}
    const guest=people[index];
    for(const room of usable) if(!used.has(room.id)&&isCompatible(guest,room)){
      used.add(room.id);chosen.push(room);enumerate(index+1,chosen,used);chosen.pop();used.delete(room.id);
    }
    // A new request may remain unanswered; an existing confirmed stay cannot be silently displaced.
    if(guest.status==='request'){chosen.push(null);enumerate(index+1,chosen,used);chosen.pop();}
  }
  enumerate(0,[],new Set());
  const plans=[];
  for(const chosen of combinations){
    let schedule;
    try{schedule=calculateSchedule({rooms:chosen.filter(Boolean).map(clone),staff:clone(data.staff),linen:clone(data.linen)});}catch(e){if(e instanceof DomainError)continue;throw e;}
    const wanted=g=>Array.isArray(g.preferences)?g.preferences:(g.preference==='none'?[]:[g.preference]);
    const assignments=[];let delay=0, matched=0, stated=people.reduce((n,g)=>n+wanted(g).length,0), served=0;let feasible=true;
    for(let i=0;i<people.length;i++){
      const guest=people[i], room=chosen[i];
      if(!room){assignments.push({guest,room:null,reasons:['No room was proposed for this new request.'],preferenceMatched:false,delayMinutes:0});continue;}
      const scheduled=schedule.rooms.find(r=>r.id===room.id),readyAt=scheduled.readyAt;
      if(readyAt>guest.latest){feasible=false;break;}
      served++;
      const preferences=wanted(guest), preferenceMatched=preferences.length>0&&preferences.every(key=>room[key]===true);
      matched+=preferences.filter(key=>room[key]===true).length;
      const late=Math.max(0,readyAt-guest.arrival);delay+=late;
      const reasons=[];
      if(guest.hard.includes('stepFree'))reasons.push('Meets the stated step-free requirement');
      if(guest.hard.includes('sea'))reasons.push('Meets the required sea-view condition');
      if(guest.hard.includes('quiet'))reasons.push('Meets the required quiet-room condition');
      for(const pref of preferences)reasons.push(room[pref]?`${labels[pref]} preference met`:`${labels[pref]} preference not met`);
      reasons.push(late?`Planned ready by ${minute(readyAt)}; guest must accept a later arrival`:`${room.status==='ready'?'Recorded ready':'Planned ready'} by the ${minute(guest.arrival)} ${guest.status==='confirmed'?'confirmed':'requested'} arrival`);
      assignments.push({guest,room:{id:room.id,label:room.label,sea:room.sea,quiet:room.quiet,stepFree:room.stepFree,readyAt,alreadyReady:room.status==='ready'},reasons,preferenceMatched,delayMinutes:late});
    }
    if(!feasible)continue;
    const id=assignments.map(a=>a.room?.id||'none').join('-');
    plans.push({id,assignments,matched,stated,served,totalDelay:delay,schedule,linenSets:schedule.linenAllocated,cleaningMinutes:schedule.cleaningMinutes,inspectionMinutes:schedule.inspectionMinutes});
  }
  // Lexicographic policy is explicit: confirmed rights, serve requests, minimize delays, then match stated preferences.
  plans.sort((a,b)=>b.served-a.served||a.totalDelay-b.totalDelay||b.matched-a.matched||a.cleaningMinutes-b.cleaningMinutes||a.id.localeCompare(b.id));
  return plans;
}
export function previewMatching(body){
  const settings=inputs(body), plans=findPlans(settings);
  const best=plans[0], chosen=best?[best]:[];
  // Keep a relevant counterfactual visible even when the lexicographic policy ranks it below other plans.
  if(best) for(const assignment of best.assignments){
    if(!assignment.room || assignment.guest.preference==='none' || assignment.preferenceMatched)continue;
    const comparison=plans.find(p=>p.served===best.served && p.assignments.some(a=>a.guest.id===assignment.guest.id && a.preferenceMatched));
    if(comparison && !chosen.some(p=>p.id===comparison.id))chosen.push(comparison);
  }
  for(const plan of plans)if(chosen.length<3&&!chosen.some(p=>p.id===plan.id))chosen.push(plan);
  const visible=chosen.slice(0,3).map(plan=>({...plan,assignments:plan.assignments.map(a=>{
    if(!a.room || a.guest.preference==='none'||a.preferenceMatched)return a;
    const other=plans.find(p=>p.served===plan.served && p.assignments.some(b=>b.guest.id===a.guest.id&&b.preferenceMatched));
    const alternative=other?.assignments.find(b=>b.guest.id===a.guest.id);
    return {...a,contrast:alternative?{planId:other.id,roomId:alternative.room.id,readyAt:alternative.room.readyAt,delayMinutes:alternative.delayMinutes,totalDelay:other.totalDelay,matched:other.matched}:null};
  })}));
  return {scenario:{date:'29 Oct 2026',checkIn:'2026-10-29',checkOut:'2026-10-31',property:'Harbor House',kind:'Separate simulation',guests:guests.map(g=>({...g,preference:settings.preferences[g.id]})),rooms:rooms.map(({id,label,capacity,stepFree,quiet,sea,status,blockedReason})=>({id,label,capacity,stepFree,quiet,sea,status,blockedReason})),linen:{onHand:2,delivery:2,deliveryAt:settings.linenDelayed?840:750},staff:staff.map(({name,role,start,end})=>({name,role,start,end})),preferences:labels},settings,policy:['Keep confirmed stay requirements and arrival promises','Do not assign the same room twice or use occupied rooms','Serve as many new requests as feasible','Minimize new-request arrival delays, then match stated preferences','Use fewer cleaning minutes as a final tie-break'],plans:visible,totalFeasible:plans.length};
}

// Custom plans are local, ephemeral previews for one shared check-in/check-out window.
// They deliberately do not mutate the independent Park-group operating record.
export function customFitDefaults(){
  return {checkIn:'2026-10-29',checkOut:'2026-10-31',rooms:clone(rooms.slice(0,4)),guests:guests.map(g=>({...clone(g),assignedRoomId:g.id==='maya'?'201':g.id==='alex'?'202':''})),linen:{onHand:2,delivery:2,deliveryAt:750},team:{housekeepers:2,inspectors:1,start:720,end:960}};
}
export function previewCustomMatching(body){
  const fail=message=>{throw new DomainError(message)};
  const int=(v,min,max,label)=>{if(!Number.isInteger(v)||v<min||v>max)fail(`${label} must be between ${min} and ${max}.`);return v};
  const date=v=>typeof v==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(v)&&!Number.isNaN(Date.parse(v))&&new Date(v+'T00:00:00Z').toISOString().slice(0,10)===v;
  if(!body||typeof body!=='object'||!date(body.checkIn)||!date(body.checkOut)||body.checkOut<=body.checkIn)fail('Enter a valid shared check-in and later check-out date.');
  if(!Array.isArray(body.rooms)||body.rooms.length<1||body.rooms.length>7||!Array.isArray(body.guests)||body.guests.length<1||body.guests.length>6)fail('Enter 1–7 rooms and 1–6 guest requests.');
  const ids=new Set();
  const roomData=body.rooms.map(r=>{
    if(!r||typeof r.id!=='string'||!/^[-A-Za-z0-9_]{1,20}$/.test(r.id)||ids.has(r.id))fail('Room IDs must be unique and contain only letters, numbers, hyphens or underscores.');ids.add(r.id);
    if(typeof r.label!=='string'||!r.label.trim()||r.label.length>60)fail('Enter a room name (up to 60 characters).');
    if(!['ready','waiting','blocked'].includes(r.status)||['sea','quiet','stepFree'].some(k=>typeof r[k]!=='boolean'))fail(`Check the features and status for room ${r.id}.`);
    const common={id:r.id,label:r.label.trim(),capacity:int(r.capacity,1,20,'Room capacity'),sea:r.sea,quiet:r.quiet,stepFree:r.stepFree,status:r.status};
    if(r.status==='blocked')return {...common,blockedReason:'Marked unavailable for this stay'};
    if(r.status==='ready')return {...common,readyAt:int(r.readyAt,0,1439,'Recorded ready time'),departure:0,cleaning:0,inspection:0,buffer:0,linen:0};
    return {...common,departure:int(r.departure,0,1439,'Previous checkout'),cleaning:int(r.cleaning,1,480,'Cleaning minutes'),inspection:int(r.inspection,1,240,'Inspection minutes'),buffer:int(r.buffer,0,180,'Readiness buffer'),linen:int(r.linen,0,100,'Linen sets')};
  });
  const guestsSeen=new Set(), locked=new Set();
  const guestData=body.guests.map(g=>{
    if(!g||typeof g.id!=='string'||!/^[-A-Za-z0-9_]{1,40}$/.test(g.id)||guestsSeen.has(g.id))fail('Guest IDs must be unique.');guestsSeen.add(g.id);
    if(typeof g.name!=='string'||!g.name.trim()||g.name.length>60)fail('Enter each guest name (up to 60 characters).');
    const preferences=g.preferences===undefined?(g.preference==='none'?[]:[g.preference]):g.preferences;
    if(!['confirmed','request'].includes(g.status)||!options.includes(g.preference)||!Array.isArray(g.hard)||g.hard.some(k=>!['sea','quiet','stepFree'].includes(k))||new Set(g.hard).size!==g.hard.length||!Array.isArray(preferences)||preferences.some(k=>!['sea','quiet','stepFree'].includes(k))||new Set(preferences).size!==preferences.length)fail(`Check the conditions for ${g.name}.`);
    if(g.unresolvedRequired!==undefined&&(!Array.isArray(g.unresolvedRequired)||g.unresolvedRequired.length))fail(`Resolve unsupported required conditions for ${g.name} before calculating.`);
    const arrival=int(g.arrival,0,1439,'Arrival time'),latest=int(g.latest,0,1439,'Latest arrival');
    if(latest<arrival||g.status==='confirmed'&&latest!==arrival)fail('Latest arrival must be at or after the request; confirmed arrivals cannot be delayed.');
    const assignedRoomId=g.assignedRoomId||'';
    if(g.status==='confirmed'){
      if(!ids.has(assignedRoomId)||locked.has(assignedRoomId))fail('Each confirmed stay needs a different existing room assignment.');
      locked.add(assignedRoomId);
    }else if(assignedRoomId)fail('Only confirmed stays may have an existing room assignment.');
    return {id:g.id,name:g.name.trim(),initials:g.name.trim().split(/\s+/).slice(0,2).map(x=>x[0]).join('').toUpperCase(),status:g.status,party:int(g.party,1,20,'Guest count'),arrival,latest,hard:g.hard,preference:g.preference,preferences,assignedRoomId};
  });
  const l=body.linen,t=body.team;if(!l||!t)fail('Enter linen and team availability.');
  const linen={onHand:int(l.onHand,0,1000,'Linen on hand'),delivery:int(l.delivery,0,1000,'Linen delivery'),deliveryAt:int(l.deliveryAt,0,1439,'Linen delivery time')};
  const start=int(t.start,0,1439,'Shift start'),end=int(t.end,1,1440,'Shift end');if(end<=start)fail('Shift end must be later than shift start.');
  const housekeepers=int(t.housekeepers,0,10,'Housekeepers'),inspectors=int(t.inspectors,0,10,'Inspectors');
  const team=[...Array.from({length:housekeepers},(_,i)=>({id:`h${i}`,name:`Housekeeper ${i+1}`,role:'Housekeeper',start,end,breaks:[]})),...Array.from({length:inspectors},(_,i)=>({id:`i${i}`,name:`Inspector ${i+1}`,role:'Inspector',start,end,breaks:[]}))];
  const settings={preferences:Object.fromEntries(guestData.map(g=>[g.id,g.preference]))};
  const plans=findPlans(settings,{rooms:roomData,guests:guestData,staff:team,linen});
  return {scenario:{checkIn:body.checkIn,checkOut:body.checkOut,rooms:roomData,guests:guestData,linen,team:t},plans:plans.slice(0,3),totalFeasible:plans.length};
}
