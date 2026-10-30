// Suggestions never hold inventory or borrow another guest's unaccepted release.
import {randomUUID,createHash} from 'node:crypto';
import {optionsFor,acceptRequest,amendmentTarget,WorldError} from './world.js';
import {resourceTotals} from './planning.js';
const open=r=>['offered','needs_review'].includes(r.status);
const sum=(xs,f)=>xs.reduce((n,x)=>n+f(x),0);
const hash=x=>createHash('sha256').update(JSON.stringify(x)).digest('hex');
export const guestTerms=(r,o)=>({roomId:o.roomId,label:o.label,type:o.type,view:o.view,area:o.area,floor:o.floor,distances:o.distances,nightly:o.nightly,breakfastTotal:o.breakfastTotal,checkIn:r.checkIn,checkOut:r.checkOut,party:r.party,breakfast:r.breakfast,arrival:o.arrival,total:o.total,currency:o.currency,hard:r.hard,preferences:r.preferences,spatial:r.spatial,matched:o.matched,unmet:o.unmet});
const rank=(a,b)=>b.served-a.served||b.matched-a.matched||a.delay-b.delay||a.minutes-b.minutes||a.total-b.total||a.key.localeCompare(b.key);
const planningCopy=s=>structuredClone({...s,coordination:undefined,planning:undefined,channelOps:undefined,autopilot:undefined,activity:[],requests:s.requests.map(({options,coordinationQuotes,appliedImpact,...r})=>({...r,options:[]}))});
const score=rows=>({served:rows.filter(a=>a.option).length,matched:sum(rows,a=>a.option?.matched.length||0),delay:sum(rows,a=>a.option?a.option.arrival-a.arrival:0),minutes:sum(rows,a=>a.option?.prep.minutes||0),total:sum(rows,a=>a.option?.total||0),key:rows.map(a=>a.option?.roomId||'-').join('/')});
function simulate(s,id,roomId,{protect=true}={}){
 const r=s.requests.find(r=>r.id===id),old=r.amendmentOf?structuredClone(amendmentTarget(s,r.amendmentOf)):null,oldTasks=old?s.tasks.filter(t=>t.bookingId===old.id).map(t=>structuredClone(t)):[];
 r.options=optionsFor(s,r,36);const o=r.options.find(o=>o.roomId===roomId);if(!o)throw new WorldError('Coordinated option is no longer feasible.',409);
 r.offerVersion=s.version;r.expiresAt=new Date(Date.now()+900000).toISOString();r.status='offered';
 acceptRequest(s,id,{optionId:o.id,version:s.version,customerConfirmed:true,conditionsReviewed:true});
 // Reserve both possibilities in the search only. No other request can depend on an unsigned amendment.
 if(old&&protect){Object.assign(s.reservations.find(b=>b.id===old.id),old);for(const t of oldTasks)Object.assign(s.tasks.find(x=>x.id===t.id),t);}
 return o;
}
export function coordinationImpact(before,after){const a=resourceTotals(before),b=resourceTotals(after);return {cleaning:{before:a.cleaning,after:b.cleaning},linen:{before:a.linen,after:b.linen},team:{before:a.team,after:b.team},breakfast:a.breakfast.map((d,i)=>({date:d.date,before:d.covers,after:b.breakfast[i].covers})).filter(d=>d.before!==d.after)};}
export function coordinate(s,ids){
 const started=performance.now(),count=new Map(ids.map(id=>[id,optionsFor(s,s.requests.find(r=>r.id===id),36).length]));
 // Constrained guests first, with original stable intake order as the tie breaker.
 const order=[...ids].sort((a,b)=>count.get(a)-count.get(b));let beam=[{state:planningCopy(s),rows:[],...score([])}],nodes=0;
 for(const id of order){const next=[];for(const item of beam){const r=item.state.requests.find(r=>r.id===id),base={requestId:id,guest:r.guest,oldRoomId:r.original?.roomId,amendmentOf:r.amendmentOf,arrival:r.arrival,checkIn:r.checkIn,checkOut:r.checkOut,party:r.party};
   for(const option of optionsFor(item.state,r,8)){if(nodes>=1600)break;nodes++;const state=structuredClone(item.state);try{const o=simulate(state,id,option.roomId),rows=[...item.rows,{...base,option:o}];next.push({state,rows,...score(rows)})}catch{}}
   const rows=[...item.rows,{...base,option:null}];next.push({...item,rows,...score(rows)});
 }next.sort(rank);beam=next.slice(0,12);}
 const plans=beam.slice(0,3).map((p,i)=>{const committed=planningCopy(s);for(const a of p.rows.filter(a=>a.option))simulate(committed,a.requestId,a.option.roomId,{protect:false});return {id:`alternative-${i}`,assignments:p.rows,served:p.served,matched:p.matched,impact:coordinationImpact(s,committed),roomIds:[...new Set(p.rows.flatMap(a=>[a.oldRoomId,a.option?.roomId]).filter(Boolean))]}});
 const firstChoices=ids.map(id=>optionsFor(s,s.requests.find(r=>r.id===id),1)[0]?.roomId).filter(Boolean);
 return {competingFirstChoices:firstChoices.length-new Set(firstChoices).size,id:randomUUID(),requestIds:ids,createdAt:new Date().toISOString(),expiresAt:new Date(Date.now()+900000).toISOString(),plans,nodes,latencyMs:Math.round(performance.now()-started),search:'Up to 6 requests · constrained first · beam 12 · 8 room branches · 1600 expansions · bounded, not a guaranteed optimum'};
}
export function reconcileCoordination(s,{force=false}={}){
 const pending=s.requests.filter(open),latest=new Map();for(const r of pending)if(r.amendmentOf&&!latest.has(r.amendmentOf))latest.set(r.amendmentOf,r.id);
 const candidates=pending.filter(r=>!r.unresolved.length&&(!r.amendmentOf||latest.get(r.amendmentOf)===r.id)).reverse();
 const basis=hash([s.version,candidates.map(r=>r.id),pending.filter(r=>r.unresolved.length).map(r=>r.id)]);
 if(!force&&s.coordination?.basis===basis&&Date.parse(s.coordination.current?.expiresAt)>Date.now())return;
 const ids=candidates.slice(0,6).map(r=>r.id),round=coordinate(s,ids),best=round.plans[0],previous=s.coordination?.current;
 const history=[...(previous?.requestIds.length? [previous]:[]),...(s.coordination?.history||[])].slice(0,12);
 for(const r of pending){
   const all=optionsFor(s,r,36),a=best?.assignments.find(a=>a.requestId===r.id),roomId=a?.option?.roomId;
   let awaitingRelease=false;
   if(!all.length&&!r.unresolved.length){const preview=planningCopy(s);for(const other of candidates.filter(x=>x.amendmentOf&&x.amendmentOf!==r.amendmentOf&&optionsFor(s,x,1).length>0)){try{const old=amendmentTarget(preview,other.amendmentOf);old.status='unsigned_release_preview';old.linenReserved=0;preview.tasks.filter(t=>t.bookingId===old.id&&t.status==='scheduled').forEach(t=>t.status='cancelled')}catch{}}awaitingRelease=optionsFor(preview,r,1).length>0;}
   const optedWait=r.waitForAvailability&&!r.unresolved.length&&!all.length;
   const status=awaitingRelease||optedWait?'waiting':r.unresolved.length||!all.length?'exception':!ids.includes(r.id)?'queued':roomId?'offered':'waiting';
   const reason=optedWait?'The guest chose to wait for availability. We will recheck automatically; no room or date is promised.':awaitingRelease?'Waiting for another guest to accept their change. Their original booking remains protected; we will automatically recheck afterwards.':status==='exception'?(r.reason||'No feasible option; review required conditions or real capacity.'):status==='queued'?'Queued for the next bounded coordination round. Your current stay is protected.':status==='waiting'?'Other choices compete for capacity. Options will be rechecked after a guest chooses; no existing booking is released.':all[0].roomId!==roomId?'Another feasible room avoids competing room or operating-resource demand.':'This option fits the current guest mix and recorded operating resources.';
   r.coordination={roundId:round.id,status,roomId:roomId||null,reason,groupSize:ids.length};
   if(r.unresolved.length||!all.length){r.status='needs_review';r.options=[];if(awaitingRelease||optedWait)r.reason=reason;continue;}
   r.options=all.sort((a,b)=>Number(b.roomId===roomId)-Number(a.roomId===roomId)).slice(0,3);r.status='offered';r.reason=null;r.offerVersion=s.version;r.expiresAt=r.responseDueAt||round.expiresAt;
   const quotes=(r.coordinationQuotes||[]).filter(q=>Date.parse(q.expiresAt)>Date.now());
   for(const o of r.options){const terms=hash(guestTerms(r,o));let q=quotes.find(q=>q.terms===terms);if(!q){q={token:randomUUID(),optionId:o.id,terms,version:r.offerVersion,expiresAt:r.expiresAt};quotes.push(q)}o.choiceToken=q.token;}
   r.coordinationQuotes=quotes.slice(-60);
 }
 s.coordination={...s.coordination,basis,current:round,history,queueSize:Math.max(0,candidates.length-6),exceptions:pending.filter(r=>r.coordination.status==='exception').length};
}
export function selectCoordinated(s,id,body){
 const r=s.requests.find(r=>r.id===id);if(!r||r.status==='confirmed'||!body.choiceToken)return acceptRequest(s,id,body);
 const q=r.coordinationQuotes?.find(q=>q.token===body.choiceToken&&q.optionId===body.optionId);
 const fresh=optionsFor(s,r,36).find(o=>o.id===body.optionId);
 if(!q||Date.parse(q.expiresAt)<Date.now()||!fresh||hash(guestTerms(r,fresh))!==q.terms)throw new WorldError('The selected terms changed or expired. Review the updated alternatives; your existing booking is protected.',409,'STALE_OFFER');
 const roundId=r.coordination?.roundId;r.options=optionsFor(s,r,36);r.offerVersion=s.version;r.expiresAt=q.expiresAt;
 const b=acceptRequest(s,id,{...body,version:s.version});r.confirmedCoordinationRound=roundId;return b;
}
