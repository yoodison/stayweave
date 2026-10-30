import {addRequest,addAmendment,amendmentTarget,WorldError} from './world.js';

export function demoInput(s,scenario){
  const base={guest:'Taylor Brooks',message:'I need twin beds. I prefer a room near breakfast.',checkIn:s.date,checkOut:new Date(Date.parse(s.date)+2*86400000).toISOString().slice(0,10),party:2,arrival:840,latest:960,breakfast:0,spatial:{type:'twin',minFloor:1,maxFloor:1}};
  if(scenario==='new')return {input:base,claims:[{kind:'requirement',feature:'twin',evidence:'twin beds'},{kind:'preference',feature:'nearBreakfast',evidence:'near breakfast'}]};
  if(scenario==='change'){
    const b=s.reservations.find(b=>b.guest==='Taylor Brooks'&&b.status==='confirmed');
    if(!b)throw new WorldError('Confirm Taylor’s first stay before this demo moment.',409);
    amendmentTarget(s,b.id);
    return {bookingId:b.id,input:{...base,message:'I need a family room. I prefer a high floor and a quiet room.',party:3,breakfast:3,spatial:{type:'family',minFloor:4,maxFloor:4}},claims:[{kind:'requirement',feature:'family',evidence:'family room'},{kind:'preference',feature:'highFloor',evidence:'high floor'},{kind:'preference',feature:'quiet',evidence:'quiet room'}]};
  }
  if(scenario==='exception')return {input:{...base,guest:'Jordan Ellis',message:'We must have connecting rooms.',spatial:{}},claims:[{kind:'unsupported_required',feature:null,evidence:'connecting rooms'}]};
  throw new WorldError('Unknown demo moment.',400);
}
export function addDemoRequest(s,scenario,details,interpretation){
  const key=`demo-${scenario}-${s.version}-${s.requests.length}`;
  return details.bookingId?addAmendment(s,details.bookingId,details.input,interpretation,key,'agent'):addRequest(s,details.input,interpretation,key,'agent');
}
