export const channelCatalog={
 airbnb:{name:'Airbnb',mark:'A',color:'#e96b76',local:false},
 booking:{name:'Booking.com',mark:'B.',color:'#4268bd',local:false},
 agoda:{name:'Agoda',mark:'a',color:'#9368bc',local:false},
 trip:{name:'Trip.com',mark:'t',color:'#4b91c8',local:false},
 agent:{name:'Guest agent',mark:'✳',color:'#567b62',local:true},
 website:{name:'Direct website',mark:'W',color:'#328b8d',local:true},
 phone:{name:'Phone',mark:'☎',color:'#b88a45',local:false},
 sms:{name:'SMS',mark:'↗',color:'#7a8b69',local:false},
};
export function nextGuestAction(r,data){
 if(['expired','declined'].includes(r.status))return {label:r.status==='expired'?'Response window ended':'Proposal declined',kind:'done',reason:'No booking was cancelled. The guest can request fresh options from their portal.',roomId:null};
 if(r.status==='needs_review'&&['waiting','queued'].includes(r.coordination?.status))return {label:'Agent watching availability',kind:'waiting',reason:r.coordination.reason,roomId:null};
 if(r.cancellationException&&r.status==='confirmed')return {label:'Cancellation needs handover',kind:'attention',reason:r.cancellationException.reason,roomId:null};
 if(r.status==='needs_review')return {label:r.ownerNote?'Review clarification':'Clarify requirement',kind:'attention',reason:r.ownerNote?'A host note is saved. The guest still needs to revise the request.':r.reason||'A required condition needs your decision.',roomId:null};
 if(r.status==='offered'){const o=r.options[0];return {label:'Review recommended stay',kind:'choice',reason:o?`Room ${o.roomId} meets required conditions. ${o.matched?.length||0} preferences matched; guest choice is still needed.`:'Recheck current availability.',roomId:o?.roomId};}
 if(r.status==='confirmed'){
  const b=data.reservations.find(b=>b.id===r.bookingId),tasks=data.tasks.filter(t=>(t.bookingId===b?.id||(b?.sharedOrderId&&t.orderId===b.sharedOrderId))&&['scheduled','in_progress'].includes(t.status));
  return {label:tasks.length?'Follow room preparation':'Open the room',kind:'work',reason:tasks.length?`${tasks.length} linked tasks · ${tasks.some(t=>t.status==='in_progress')?'work in progress':'work scheduled'}. Linen is already accounted for.`:'The stay is saved. Check room readiness and guest actions.',roomId:b?.roomId};
 }
 return {label:'View history',kind:'done',reason:r.status==='amended'?'Replaced by the guest’s updated stay.':'This stay is closed.',roomId:null};
}
