import {randomUUID,createHash} from 'node:crypto';
import {WorldError,cancelReservation} from './world.js';
import {coordinationImpact} from './coordination.js';
export const pending=r=>['offered','needs_review'].includes(r.status);
const get=(s,id)=>{const r=s.requests.find(r=>r.id===id);if(!r)throw new WorldError('Request not found.',404);return r};
const snapshot=s=>s.requests.filter(pending).map(r=>({id:r.id,guest:r.guest,roomId:r.options[0]?.roomId||null}));
export function armResponse(r,now=Date.now()){r.lifecycleVersion=1;if(r.options.length&&!r.responseDueAt)r.responseDueAt=new Date(now+900000).toISOString();}
export function recordLifecycle(s,before,r,kind,reason,source='authenticated_customer'){
 if(r.liveRunId&&source==='authenticated_customer')source='simulated_customer_choice';
 const b=s.reservations.find(b=>b.id===r.bookingId),prior=before.reservations.find(b=>b.id===r.bookingId);
 const affected=s.tasks.filter(t=>JSON.stringify(t)!==JSON.stringify(before.tasks.find(x=>x.id===t.id)));
 const e={id:randomUUID(),at:new Date().toISOString(),requestId:r.id,guest:r.guest,kind,reason,source,impact:coordinationImpact(before,s),roomIds:[...new Set([b?.roomId,prior?.roomId,...affected.map(t=>t.roomId),...(before.requests.find(x=>x.id===r.id)?.options.slice(0,1).map(o=>o.roomId)||[])].filter(Boolean))],tasks:affected.map(t=>({id:t.id,roomId:t.roomId,kind:t.kind,status:t.status})),retainedTasks:s.tasks.filter(t=>t.bookingId===b?.id&&t.status==='completed').length,_offers:snapshot(before),reoffered:[]};
 s.lifecycle??={events:[]};s.lifecycle.events.unshift(e);s.lifecycle.events=s.lifecycle.events.slice(0,40);return e;
}
export function finishLifecycle(s){
 for(const r of s.requests)if(r.lifecycleVersion&&pending(r))armResponse(r);
 for(const e of s.lifecycle?.events||[]){if(!e._offers)continue;const current=s.requests.find(r=>r.id===e.requestId);e.nextRoomId=pending(current||{})?current.options[0]?.roomId||null:null;if(e.nextRoomId)e.roomIds.push(e.nextRoomId);e.reoffered=e._offers.filter(x=>x.id!==e.requestId).flatMap(x=>{const r=s.requests.find(r=>r.id===x.id);const roomId=r?.options[0]?.roomId||null;return pending(r||{})&&x.roomId!==roomId?[{requestId:x.id,guest:x.guest,beforeRoomId:x.roomId,roomId,reason:r.coordination?.reason||'Availability rechecked.'}]:[]});e.roomIds=[...new Set([...e.roomIds,...e.reoffered.flatMap(x=>[x.beforeRoomId,x.roomId]).filter(Boolean)])];delete e._offers;}
}
export function expireResponses(s,{now=Date.now(),ids=null,source='response_timer'}={}){
 const due=s.requests.filter(r=>pending(r)&&r.lifecycleVersion&&r.responseDueAt&&Date.parse(r.responseDueAt)<=now&&(!ids||ids.includes(r.id)));
 for(const r of due){const before=structuredClone(s);r.status='expired';r.options=[];r.coordinationQuotes=[];r.coordination=null;s.version++;recordLifecycle(s,before,r,'expired','Response window ended. No booking was cancelled; ask for fresh options when ready.',source)}return due.length;
}
export function decline(s,id,body){
 const r=get(s,id);if(r.status==='declined'&&body.all===true)return;
 if(!pending(r))throw new WorldError('Only an open proposal can be declined.',409);
 const before=structuredClone(s);
 if(body.all===true){r.status='declined';r.options=[];r.coordination=null;}
 else {const o=r.options.find(o=>o.id===body.optionId&&o.choiceToken===body.choiceToken);if(!o)throw new WorldError('Review the current option before declining it.',409);r.declinedRoomIds=[...new Set([...(r.declinedRoomIds||[]),o.roomId])];r.options=r.options.filter(x=>x.roomId!==o.roomId);r.waitForAvailability=true;}
 r.coordinationQuotes=[];s.version++;const e=recordLifecycle(s,before,r,body.all?'declined':'option_declined',body.all?'Guest declined the proposal. Any original booking remains protected.':'Guest declined this room. Rechecking other rooms and the remaining guest mix.');
 if(!body.all){e.declinedRoomId=before.requests.find(x=>x.id===id)?.options.find(o=>o.id===body.optionId)?.roomId;if(e.declinedRoomId)e.roomIds=[...new Set([e.declinedRoomId,...e.roomIds])];}
}
export function resume(s,id){const r=get(s,id);if(!['expired','declined'].includes(r.status))throw new WorldError('Only an expired or declined proposal can be reopened.',409);if(r.amendmentOf&&!s.reservations.some(b=>b.id===r.amendmentOf&&b.status==='confirmed'))throw new WorldError('The original stay changed. Submit a new request.',409);const before=structuredClone(s);r.status='offered';r.responseDueAt=null;r.coordinationQuotes=[];r.lifecycleVersion=1;s.version++;recordLifecycle(s,before,r,'resumed','Customer requested fresh options. Availability and operating capacity are rechecked.');}
const cancellationScope=(s,r)=>{const b=s.reservations.find(b=>b.id===r.bookingId);return {booking:b,tasks:s.tasks.filter(t=>t.bookingId===b?.id)}};
const digest=x=>createHash('sha256').update(JSON.stringify(x)).digest('hex');
export function cancellationPreview(s,id){
 const r=get(s,id);if(r.status!=='confirmed')throw new WorldError('This capability has no current confirmed stay to cancel.',409);
 const copy=structuredClone(s);let blocked=null;try{cancelReservation(copy,r.bookingId)}catch(e){if(!(e instanceof WorldError))throw e;blocked=e.message;}
 const offer={token:randomUUID(),scope:digest(cancellationScope(s,r)),bookingId:r.bookingId,expiresAt:new Date(Date.now()+900000).toISOString(),blocked,impact:blocked?null:coordinationImpact(s,copy)};r.cancellationOffer=offer;return offer;
}
export function confirmCancellation(s,id,body){
 const r=get(s,id);if(r.status==='cancelled'&&r.cancelledWith===body.cancelToken&&body.confirmed===true)return;
 const q=r.cancellationOffer;if(body.confirmed!==true||!q||q.token!==body.cancelToken||Date.parse(q.expiresAt)<=Date.now()||q.scope!==digest(cancellationScope(s,r)))throw new WorldError('Review a fresh cancellation preview before confirming.',409);
 const before=structuredClone(s);
 try{cancelReservation(s,r.bookingId)}catch(e){if(!(e instanceof WorldError))throw e;if(!r.cancellationException){r.cancellationException={reason:e.message,requestedAt:new Date().toISOString(),expiresAt:q.expiresAt};recordLifecycle(s,before,r,'cancel_review',e.message)}return;}
 r.cancelledWith=body.cancelToken;r.cancellationException=null;r.options=[];r.coordinationQuotes=[];r.coordination=null;
 // Pending amendments cannot outlive the reservation they would replace.
 for(const other of s.requests.filter(x=>x.amendmentOf===r.bookingId&&pending(x))){other.status='declined';other.options=[];other.coordinationQuotes=[];other.coordination=null;other.closedReason='The guest cancelled the original stay.';}
 recordLifecycle(s,before,r,'cancelled','Customer confirmed cancellation. Only unstarted work and unused allocations were released; completed work and consumed linen remain recorded.');
}
