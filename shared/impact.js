// Deterministic proposed effects. No model-generated quantities or savings claims.
export function operatingImpact(s,r,o){
  const old=s.reservations.find(b=>b.id===r.amendmentOf);
  const active=s.tasks.filter(t=>['scheduled','in_progress'].includes(t.status));
  const removed=old?active.filter(t=>t.bookingId===old.id):[];
  const added=o.prep.tasks;
  const linked=o.prep.sharedOrderId?s.tasks.filter(t=>t.orderId===o.prep.sharedOrderId&&t.status!=='cancelled'):[];
  const sum=(xs,kind)=>xs.filter(t=>!kind||t.kind===kind).reduce((n,t)=>n+t.end-t.start,0);
  const reserved=[...s.reservations.filter(b=>b.status==='confirmed'),...(s.workOrders||[]).filter(b=>b.status!=='cancelled')].reduce((n,b)=>n+b.linenReserved,0);
  const beforeAvailable=s.linenStock-s.linenUsed-reserved;
  const breakfast=[];
  for(let i=0;i<30;i++){
    const day=new Date(Date.parse(s.date)+i*86400000).toISOString().slice(0,10);
    const before=s.reservations.filter(b=>b.status==='confirmed'&&b.checkIn<day&&b.checkOut>=day).reduce((n,b)=>n+b.breakfast,0);
    const after=before-(old&&old.checkIn<day&&old.checkOut>=day?old.breakfast:0)+(r.checkIn<day&&r.checkOut>=day?r.breakfast:0);
    if(before!==after)breakfast.push({date:day,before,after,shortage:Math.max(0,after-s.breakfastStock)});
  }
  const staff=s.team.map(p=>({id:p.id,name:p.name,before:sum(active.filter(t=>t.assignee===p.id)),after:sum(active.filter(t=>t.assignee===p.id))-sum(removed.filter(t=>t.assignee===p.id))+sum(added.filter(t=>t.assignee===p.id))})).filter(p=>p.before!==p.after||linked.some(t=>t.assignee===p.id));
  return {version:s.version,oldRoomId:old?.roomId||null,roomId:o.roomId,arrival:o.arrival,oldTotal:old?.total??0,total:o.total,
    stay:{before:old?{checkIn:old.checkIn,checkOut:old.checkOut,party:old.party,breakfast:old.breakfast,arrival:old.arrival}:null,after:{checkIn:r.checkIn,checkOut:r.checkOut,party:r.party,breakfast:r.breakfast,arrival:o.arrival}},
    cleaning:{before:sum(active,'cleaning'),after:sum(active,'cleaning')-sum(removed,'cleaning')+sum(added,'cleaning')},
    team:{before:sum(active),after:sum(active)-sum(removed)+sum(added)},
    linen:{before:beforeAvailable,after:beforeAvailable+(old?.linenReserved||0)-o.prep.linen,allocated:o.prep.linen,shared:(s.workOrders||[]).find(w=>w.id===o.prep.sharedOrderId)?.linenReserved||0},
    breakfast,staff,added,removed,linked,roomReason:o.reasons,requiresOwner:breakfast.some(d=>d.shortage>0),scope:'Proposed local plan · scheduled minutes across all dates, fresh linen available, breakfast by service date'};
}
