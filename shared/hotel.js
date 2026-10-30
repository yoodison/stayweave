// Synthetic property geometry and explicit matching vocabulary, shared by UI and rules.
export const roomTypes = {
  king: {label:'Classic King',beds:'1 king',area:26,capacity:2,cleaning:35,linen:2,nightly:120},
  twin: {label:'Comfort Twin',beds:'2 singles',area:28,capacity:2,cleaning:40,linen:2,nightly:140},
  deluxe: {label:'Ocean Deluxe',beds:'1 king',area:34,capacity:2,cleaning:45,linen:2,nightly:165},
  family: {label:'Family Studio',beds:'1 queen + 2 singles',area:44,capacity:4,cleaning:55,linen:4,nightly:195},
  suite: {label:'Corner Suite',beds:'1 king + sofa bed',area:58,capacity:3,cleaning:70,linen:3,nightly:260},
  accessible: {label:'Accessible King',beds:'1 king · accessible layout',area:38,capacity:2,cleaning:45,linen:2,nightly:150},
};
export const hotelFeatures = {stepFree:'Step-free access',quiet:'Quiet room',sea:'Sea view',garden:'Garden view',city:'City view',nearElevator:'Near elevator (≤15 m)',farElevator:'Away from elevator (≥30 m)',nearBreakfast:'Near breakfast (≤50 m route)',nearGym:'Near gym (≤40 m route)',nearPool:'Near pool (≤60 m route)',highFloor:'High floor (4–6)',lowFloor:'Low floor (1–2)',king:'King bed',twin:'Twin beds',family:'Family studio',suite:'Suite'};
export const statusMeta = {
  ready:{label:'Ready',color:'#82a972',fill:'#e3efda',symbol:'✓'},
  occupied:{label:'In house',color:'#b68c5c',fill:'#f4e8d6',symbol:'●'},
  arriving:{label:'Arriving',color:'#ad96c8',fill:'#efe7f7',symbol:'↘'},
  dirty:{label:'Needs cleaning',color:'#c19b70',fill:'#f3e9d8',symbol:'⋯'},
  scheduled:{label:'Prep scheduled',color:'#83a4b9',fill:'#e0edf2',symbol:'◷'},
  cleaning:{label:'Cleaning',color:'#5798b7',fill:'#d6ebf4',symbol:'✦'},
  inspection:{label:'Awaiting inspection',color:'#9a8dc0',fill:'#ebe4f5',symbol:'◎'},
  inspecting:{label:'Inspecting',color:'#8a76bb',fill:'#e8dff7',symbol:'⌕'},
  construction:{label:'Construction',color:'#cf9760',fill:'#f6e5d0',symbol:'⚒'},
  repair:{label:'Under repair',color:'#c57f73',fill:'#f3ded8',symbol:'⚒'},
  blocked:{label:'Out of service',color:'#b98983',fill:'#f0e0dc',symbol:'×'},
};
export function roomFacts(room) {
  const d=room.distances||{};
  return {...room,sea:room.view==='sea'||room.sea===true,garden:room.view==='garden',city:room.view==='city',nearElevator:d.elevator<=15,farElevator:d.elevator>=30,nearBreakfast:d.breakfast<=50,nearGym:d.gym<=40,nearPool:d.pool<=60,highFloor:room.floor>=4,lowFloor:room.floor<=2,king:['king','deluxe','suite','accessible'].includes(room.type),twin:room.type==='twin',family:room.type==='family',suite:room.type==='suite'};
}
export function roomSnapshot(s,room,day=s.date) {
  const stays=s.reservations.filter(b=>b.status==='confirmed'&&b.roomId===room.id&&b.phase!=='checked_out'&&b.checkIn<=day&&(b.checkOut>day||(day===s.date&&b.checkOut===day&&b.phase==='checked_in')));
  const stay=stays[0];
  const tasks=s.tasks.filter(t=>t.roomId===room.id&&t.date===day&&t.status!=='cancelled');
  const active=tasks.find(t=>t.status==='in_progress');
  const open=tasks.filter(t=>['scheduled','in_progress'].includes(t.status));
  const maintenance=room.maintenance&&room.maintenance.status!=='closed'?room.maintenance:null;
  let status;
  if(maintenance?.status==='open')status=maintenance.kind;
  else if(stay?.phase==='checked_in'&&day===s.date)status='occupied';
  else if(active)status=active.kind==='inspection'?'inspecting':'cleaning';
  else if(open.length)status=open.some(t=>t.kind==='cleaning')?'scheduled':'inspection';
  else if(room.blocked)status='blocked';
  else if(stay)status='arriving';
  else status=room.condition==='ready'?'ready':'dirty';
  return {status,stay,tasks,open,maintenance,meta:statusMeta[status]};
}
export function enrichRoom(r) {
  const col=Number(r.id.slice(1))-1,floor=r.floor||Number(r.id[0]);
  const type=r.type||Object.keys(roomTypes)[col%6],spec=roomTypes[type];
  const elevator=[8,16,25,34,43,52][col%6];
  const view=r.view||(r.sea?'sea':col%3===0?'garden':'city');
  return {...r,type,area:r.area||spec.area,beds:r.beds||spec.beds,view,floor,position:col,distances:r.distances||{elevator,breakfast:elevator+18+floor*4,gym:elevator+12+Math.abs(floor-2)*4,pool:elevator+28+floor*4},maintenance:r.maintenance||null};
}
