import {randomUUID} from 'node:crypto';
import {WorldError,event,hhmm} from './world.js';
import {resourceTotals,recoveryPlans} from './planning.js';

const fail=(m,status=409)=>{throw new WorldError(m,status)};
const active=t=>['scheduled','in_progress'].includes(t.status);
const related=(a,b)=>a.orderId? a.orderId===b.orderId : Boolean(a.bookingId)&&a.bookingId===b.bookingId;
const booked=(s,o)=>s.reservations.some(b=>b.status==='confirmed'&&(b.sharedOrderId===o.id||b.roomId===o.roomId&&b.phase!=='checked_out'));
export const defaultPolicy=()=>({revision:0,enabled:false,kinds:['extra_cleaning','staff_absence','linen_count','arrival_change'],maxTaskShift:120,maxTasks:12,maxArrivalShift:120,maxDeferrals:2,expiresAt:null});
export function policyOf(s){return s.autopilot?.policy||defaultPolicy()}
function init(s){s.autopilot??={policy:defaultPolicy(),cases:[]};return s.autopilot}
export function setPolicy(s,b){const a=init(s);if(b.revision!==a.policy.revision)fail('Policy changed. Reload before saving.');
 if(typeof b.enabled!=='boolean'||!Array.isArray(b.kinds)||b.kinds.some(k=>!defaultPolicy().kinds.includes(k)))fail('Choose supported automation permissions.',400);
 for(const [k,max] of [['maxTaskShift',240],['maxTasks',30],['maxArrivalShift',240],['maxDeferrals',6]])if(!Number.isInteger(b[k])||b[k]<0||b[k]>max)fail(`Invalid ${k} limit.`,400);
 a.policy={revision:a.policy.revision+1,enabled:b.enabled,kinds:[...new Set(b.kinds)],maxTaskShift:b.maxTaskShift,maxTasks:b.maxTasks,maxArrivalShift:b.maxArrivalShift,maxDeferrals:b.maxDeferrals,expiresAt:b.enabled?new Date(Date.now()+24*3600000).toISOString():null};s.version++;event(s,'Owner automation limits saved',`Policy ${a.policy.revision} · ${b.enabled?'24-hour permission':'paused'} · no spending, overtime or guest-rights changes`);return a.policy;
}
export function validateOpsIncident(s,x){
 if(!x||!defaultPolicy().kinds.includes(x.kind))fail('This incident needs clarification. Supported: extra cleaning, today’s staff absence, physical clean-linen count, or today’s arrival time.',422);
 const out={kind:x.kind,message:String(x.message||'').slice(0,1500),evidence:String(x.evidence||'').slice(0,500),measurement:x.measurement||null};
 if(x.kind==='extra_cleaning'){if(!s.rooms.some(r=>r.id===x.roomId)||!Number.isInteger(x.delayMinutes)||x.delayMinutes<1||x.delayMinutes>180)fail('Specify a known room and 1–180 extra cleaning minutes.',400);Object.assign(out,{roomId:x.roomId,delayMinutes:x.delayMinutes});}
 if(x.kind==='staff_absence'){if(!s.team.some(p=>p.id===x.staffId))fail('Choose a known teammate.',400);out.staffId=x.staffId;}
 if(x.kind==='linen_count'){if(!Number.isInteger(x.cleanSets)||x.cleanSets<0||x.cleanSets>500)fail('Enter the physical count of clean sets, including already reserved sets, from 0–500.',400);out.cleanSets=x.cleanSets;}
 if(x.kind==='arrival_change'){const b=s.reservations.find(b=>b.id===x.bookingId&&b.status==='confirmed');if(!b)fail('Choose a confirmed reservation.',400);if(!Number.isInteger(x.arrival)||x.arrival<600||x.arrival>1320)fail('Arrival must be between 10:00 and 22:00.',400);Object.assign(out,{bookingId:x.bookingId,arrival:x.arrival,roomId:b.roomId});}
 return out;
}
function impact(a,b){const x=resourceTotals(a),y=resourceTotals(b);return {cleaning:{before:x.cleaning,after:y.cleaning},team:{before:x.team,after:y.team},linen:{before:x.linen,after:y.linen},breakfast:x.breakfast.map((v,i)=>({date:v.date,before:v.covers,after:y.breakfast[i].covers})).filter(v=>v.before!==v.after)}}
function describe(s,c,next,label,blocked=[],extra={}){
 const taskChanges=next.tasks.flatMap(t=>{const old=s.tasks.find(x=>x.id===t.id);return old&&JSON.stringify(old)!==JSON.stringify(t)?[{id:t.id,roomId:t.roomId,kind:t.kind,before:structuredClone(old),after:structuredClone(t)}]:[]});
 const orderChanges=(next.workOrders||[]).flatMap(o=>{const old=s.workOrders.find(x=>x.id===o.id);return old&&JSON.stringify(old)!==JSON.stringify(o)?[{id:o.id,before:structuredClone(old),after:structuredClone(o)}]:[]});
 const bookingChanges=next.reservations.flatMap(b=>{const old=s.reservations.find(x=>x.id===b.id);return old&&JSON.stringify(old)!==JSON.stringify(b)?[{id:b.id,before:structuredClone(old),after:structuredClone(b)}]:[]});
 const roomIds=[...new Set([...taskChanges.map(t=>t.roomId),...bookingChanges.map(b=>b.after.roomId),...(c.incident.kind==='staff_absence'?s.tasks.filter(t=>active(t)&&t.assignee===c.incident.staffId).map(t=>t.roomId):[]),...(c.incident.roomId?[c.incident.roomId]:[])])];
 return {key:label,label,feasible:!blocked.length,blocked,taskChanges,orderChanges,bookingChanges,roomIds,impact:impact(s,next),maxShift:Math.max(0,...taskChanges.map(t=>Math.max(Math.abs(t.after.start-t.before.start),Math.abs(t.after.end-t.before.end)))),cashCostUsd:0,additionalPaidHours:0,...extra};
}
function slot(person,earliest,duration,fixed){let at=Math.max(person.start,earliest);for(const [a,b] of [...person.breaks,...fixed.filter(t=>t.assignee===person.id).map(t=>[t.start,t.end])].sort((a,b)=>a[0]-b[0])){if(at+duration<=a)break;if(at<b&&at+duration>a)at=b;}return at+duration<=person.end?at:null;}
function guestRisks(s){return s.reservations.filter(b=>b.status==='confirmed'&&b.checkIn===s.date&&b.phase!=='checked_in').flatMap(b=>{const jobs=s.tasks.filter(t=>t.status!=='cancelled'&&(t.bookingId===b.id||b.sharedOrderId&&t.orderId===b.sharedOrderId));const ready=jobs.length?Math.max(...jobs.map(t=>t.end))+15:600;return ready>b.arrival?[`${b.guest}, room ${b.roomId}: ready ${hhmm(ready)}, promised ${hhmm(b.arrival)}.`]:[]})}
function schedule(s,c,early=false){const next=structuredClone(s),x=c.incident,blocked=[];
 if(x.kind==='arrival_change'){
  const b=next.reservations.find(b=>b.id===x.bookingId);
  if(b.checkIn!==s.date||['checked_in','checked_out'].includes(b.phase))blocked.push('Only today’s not-yet-checked-in arrival can be changed here. Use a full guest amendment for dates or rooms.');
  if(b.arrival!==x.arrival&&(!c.consent||c.consent.bookingId!==b.id||c.consent.arrival!==x.arrival))blocked.push('Guest consent to this exact arrival time has not been recorded. Owner policy cannot replace it.');
  b.arrival=x.arrival;
 }
 const work=next.tasks.filter(t=>t.date===s.date&&active(t)),fixed=next.tasks.filter(t=>t.date===s.date&&['completed','in_progress'].includes(t.status));
 if(x.kind==='staff_absence'&&work.some(t=>t.assignee===x.staffId&&t.status==='in_progress'))blocked.push('This teammate has work recorded in progress. A real handover must be recorded before reassignment.');
 const pending=work.filter(t=>t.status==='scheduled').sort((a,b)=>a.start-b.start||a.id.localeCompare(b.id));
 const changed=[];let guard=0;
 while(pending.length&&guard++<100){const index=pending.findIndex(t=>t.kind!=='inspection'||!pending.some(cl=>cl.kind==='cleaning'&&related(t,cl)));if(index<0){blocked.push('Preparation dependency is unresolved.');break;}const task=pending.splice(index,1)[0];
  const room=s.rooms.find(r=>r.id===task.roomId),previous=s.reservations.some(b=>b.status==='confirmed'&&b.roomId===room.id&&b.checkOut===s.date);
  let earliest=early?Math.max(room.releaseAt||600,previous?660:600):task.start;
  const clean=[...fixed,...changed].find(t=>t.kind==='cleaning'&&related(task,t));if(task.kind==='inspection'&&clean)earliest=Math.max(earliest,clean.end);
  const role=task.kind==='cleaning'?'housekeeper':'inspector',choices=s.team.filter(p=>p.role===role&&!p.unavailableDates?.includes(s.date)).map(p=>({p,start:slot(p,earliest,task.end-task.start,[...fixed,...changed])})).filter(v=>v.start!==null).sort((a,b)=>(early?a.start-b.start:0)||Number(b.p.id===task.assignee)-Number(a.p.id===task.assignee)||a.start-b.start||a.p.id.localeCompare(b.p.id));
  if(!choices.length){blocked.push(`No qualified teammate can cover room ${task.roomId} within existing shifts.`);break;}
  const best=choices[0];changed.push({...task,assignee:best.p.id,assigneeName:best.p.name,start:best.start,end:best.start+task.end-task.start});
 }
 for(const t of changed)Object.assign(next.tasks.find(x=>x.id===t.id),t);
 blocked.push(...guestRisks(next));
 return describe(s,c,next,early?'Reorder unstarted work for the new deadline':'Keep timings where possible; reassign qualified teammates',blocked);
}
export function alternatives(s,c){const x=c.incident;
 if(x.kind==='extra_cleaning'){try{return recoveryPlans(s,x).plans.map(p=>{const next=structuredClone(s);p.changes.forEach(t=>Object.assign(next.tasks.find(x=>x.id===t.id),t.after));return describe(s,c,next,p.label,p.feasible?[]:[p.blocked])})}catch(e){return [describe(s,c,structuredClone(s),'Coordinate room preparation',[e.message])]}}
 if(x.kind==='linen_count'){
  const next=structuredClone(s),short=Math.max(0,-resourceTotals(s).linen),deferred=[];let released=0;
  const candidates=(s.workOrders||[]).filter(o=>o.status==='scheduled'&&o.linenReserved>0&&!booked(s,o)&&s.tasks.filter(t=>t.orderId===o.id&&t.status!=='cancelled').every(t=>t.status==='scheduled')).sort((a,b)=>b.linenReserved-a.linenReserved||a.id.localeCompare(b.id));
  for(const o of candidates){if(released>=short)break;const target=next.workOrders.find(w=>w.id===o.id);released+=target.linenReserved;target.linenReserved=0;target.status='deferred';target.reasonDetail='Unbooked turnover deferred to protect linen for confirmed stays. Queue preparation after replenishment.';next.tasks.filter(t=>t.orderId===o.id&&t.status==='scheduled').forEach(t=>t.status='cancelled');deferred.push(o.roomId);}
  const remaining=Math.max(0,-resourceTotals(next).linen);return [describe(s,c,next,deferred.length?'Defer unbooked turnovers; protect confirmed stays':'Reconcile the physical linen count',remaining?[`${remaining} more clean sets are required for protected commitments. Record a real delivery or coordinate guest impact; no stock is invented.`]:[],{deferrals:deferred.length,deferralRooms:deferred,shortage:remaining})];
 }
 return [schedule(s,c,false),schedule(s,c,true)].sort((a,b)=>Number(b.feasible)-Number(a.feasible)||a.taskChanges.length-b.taskChanges.length||a.maxShift-b.maxShift);
}
function permissions(s,c,p){const policy=policyOf(s),why=[];
 if(!policy.enabled||!policy.expiresAt||Date.parse(policy.expiresAt)<Date.now())why.push('Owner automation permission is paused or expired.');
 if(!policy.kinds.includes(c.incident.kind))why.push('This incident type is outside the owner’s permission.');
 if(p.taskChanges.length>policy.maxTasks)why.push(`${p.taskChanges.length} changed tasks exceeds the limit of ${policy.maxTasks}.`);
 if(p.maxShift>policy.maxTaskShift)why.push(`${p.maxShift} minutes of schedule movement exceeds the ${policy.maxTaskShift}-minute limit.`);
 if((p.deferrals||0)>policy.maxDeferrals)why.push('Too many unbooked rooms would be deferred.');
 if(p.bookingChanges.some(b=>Math.abs(b.after.arrival-b.before.arrival)>policy.maxArrivalShift))why.push('The arrival-time change exceeds the owner’s limit.');
 return why;
}
function execute(s,c,p,mode){
 for(const t of p.taskChanges)Object.assign(s.tasks.find(x=>x.id===t.id),t.after);
 for(const o of p.orderChanges)Object.assign(s.workOrders.find(x=>x.id===o.id),o.after);
 for(const b of p.bookingChanges){Object.assign(s.reservations.find(x=>x.id===b.id),b.after);const r=s.requests.find(r=>r.bookingId===b.id);if(r)r.arrival=b.after.arrival;}
 s.version++;Object.assign(c,{status:'resolved',mode,plan:p,reason:p.label,appliedAt:new Date().toISOString(),appliedVersion:s.version,policyRevision:policyOf(s).revision});event(s,mode==='automatic'?'Agent handled an operating change':'Owner approved an operating change',`${p.label} · ${p.roomIds.join(', ')||'property'} · saved locally`);
}
export function reconcileAutopilot(s){if(!s.autopilot)return;for(const c of s.autopilot.cases.filter(c=>c.status!=='resolved')){
 if(c.incident.kind==='arrival_change'&&s.reservations.find(b=>b.id===c.incident.bookingId)?.status!=='confirmed'){Object.assign(c,{status:'resolved',mode:'superseded',reason:'Original reservation is no longer active; its pending arrival change was closed.',plan:describe(s,c,structuredClone(s),'Original reservation is no longer active; pending arrival change closed'),appliedAt:new Date().toISOString(),appliedVersion:s.version});continue;}
 const plans=alternatives(s,c);plans.forEach(p=>p.permissionReasons=permissions(s,c,p));c.plans=plans;c.version=s.version;c.policyRevision=policyOf(s).revision;c.expiresAt=new Date(Date.now()+10*60000).toISOString();
 const auto=plans.find(p=>p.feasible&&!p.permissionReasons.length);if(auto){execute(s,c,auto,'automatic');continue;}
 c.status='exception';const first=plans.find(p=>p.feasible)||plans[0];c.reason=first.feasible?first.permissionReasons.join(' '):first.blocked.join(' ');c.plan=first;
 }
 // Other automatic cases may have changed the ledger; expose current exception previews.
 for(const c of s.autopilot.cases.filter(c=>c.status!=='resolved')){c.plans=alternatives(s,c);c.plans.forEach(p=>p.permissionReasons=permissions(s,c,p));c.version=s.version;c.plan=c.plans.find(p=>p.feasible)||c.plans[0];c.reason=(c.plan.feasible?c.plan.permissionReasons:c.plan.blocked).join(' ');}
}
export function intakeIncident(s,raw,{key,source='owner_report',consent=null}={}){
 const a=init(s),incident=validateOpsIncident(s,raw);if(a.cases.length>=100)fail('Archive or reset the demo before recording more incidents.');
 if(a.cases.some(c=>c.key===key))return a.cases.find(c=>c.key===key);
 const before=resourceTotals(s);
 if(incident.kind==='staff_absence'){const person=s.team.find(p=>p.id===incident.staffId);person.unavailableDates=[...new Set([...(person.unavailableDates||[]),s.date])];s.version++;}
 if(incident.kind==='linen_count'){s.linenStock=s.linenUsed+incident.cleanSets;s.version++;}
 const c={id:randomUUID(),key,incident,source,consent,createdAt:new Date().toISOString(),status:'pending',observation:{linenBefore:before.linen,linenAfter:resourceTotals(s).linen}};a.cases.unshift(c);event(s,'Operating incident recorded',incident.message||incident.kind);return c;
}
export function approveCase(s,id,{version,policyRevision,planKey,confirmed}){const c=s.autopilot?.cases.find(c=>c.id===id);if(!c)fail('Incident not found.',404);if(c.status==='resolved')return c;
 if(!confirmed)fail('Review and approve this exact local plan.',400);if(version!==s.version||version!==c.version||policyRevision!==policyOf(s).revision||Date.parse(c.expiresAt)<Date.now())fail('The plan or permission changed. Review the refreshed alternative.');
 const p=alternatives(s,c).find(p=>p.key===planKey);if(!p?.feasible)fail('Resolve guest consent, real capacity or staff handover first.');execute(s,c,p,'owner_approved');return c;
}
