import {createHash} from 'node:crypto';
import {WorldError,validateInbound,publicRequest} from './world.js';
import {modelEvidence,summarizeCalls} from './presentation.js';

export function liveView(state,id){
 const run=state.liveRuns?.find(r=>r.id===id);if(!run)throw new WorldError('Live session not found.',404);
 const ids=run.items.map(i=>i.requestId).filter(Boolean),requests=state.requests.filter(r=>ids.includes(r.id));
 return {id:run.id,createdAt:run.createdAt,inputs:run.inputs,items:run.items,catalog:run.catalog,
   requests:requests.map(publicRequest),metrics:summarizeCalls(requests.map(modelEvidence)),
   round:state.coordination?.current,queueSize:state.coordination?.queueSize||0,
   events:(state.lifecycle?.events||[]).filter(e=>ids.includes(e.requestId)),
   reservations:state.reservations.filter(b=>ids.includes(b.requestId)),
   complete:run.items.every(i=>i.requestId),readback:true};
}
export function mountLivePresentation(app,{getState,change,safe,loopback,token,key,modelVerifier}){
 const active=new Set();
 const view=id=>liveView(getState(),id);
 app.get('/api/world/live',safe((_req,res)=>res.json({runs:(getState().liveRuns||[]).map(r=>({id:r.id,createdAt:r.createdAt,guests:r.inputs.map(i=>i.guest)}))})));
 app.get('/api/world/live/:id',safe((req,res)=>res.json(view(req.params.id))));
 app.post('/api/world/live',safe(async(req,res)=>{
   const {id,inputs}=req.body;
   if(typeof id!=='string'||!/^[-a-zA-Z0-9_]{16,70}$/.test(id)||!Array.isArray(inputs)||inputs.length<1||inputs.length>3||req.body.runModel!==true)throw new WorldError('Send one to three requests and explicitly run the model.',400);
   const normalized=inputs.map(i=>validateInbound(getState(),i,'agent'));
   const fingerprint=createHash('sha256').update(JSON.stringify(normalized)).digest('hex');
   let run=getState().liveRuns?.find(r=>r.id===id);
   if(run&&run.fingerprint!==fingerprint)throw new WorldError('Session inputs changed. Start a new session; the earlier requests are preserved.',409);
   if(active.has(id))return res.status(202).json(view(id));
   if(run?.items.every(i=>i.requestId))return res.json(view(id));
   if(!run&&(getState().liveRuns?.length||0)>=20)throw new WorldError('This demo has 20 saved sessions. Existing records are preserved.',409);
   active.add(id);
   try{
     const catalog=await modelVerifier();if(!catalog.available)throw new WorldError('Configured Nebius model is unavailable.',503);
     if(!run)change(s=>{s.liveRuns??=[];s.liveRuns.unshift({id,fingerprint,createdAt:new Date().toISOString(),inputs:normalized,items:normalized.map(()=>({status:'pending'})),catalog})});
     const pending=view(id).items.map((item,index)=>({item,index})).filter(x=>!x.item.requestId);
     change(s=>{const r=s.liveRuns.find(r=>r.id===id);r.catalog=catalog;for(const {index} of pending)r.items[index]={status:'interpreting'}});
     await Promise.allSettled(pending.map(async({index})=>{
       try{
         const receipt=await loopback(req,'/api/agent/requests',normalized[index],key,`live-${id}-${index}`);
         change(s=>{s.requests.find(r=>r.id===receipt.request.id).liveRunId=id;s.liveRuns.find(r=>r.id===id).items[index]={status:'received',requestId:receipt.request.id}});
       }catch(e){change(s=>{s.liveRuns.find(r=>r.id===id).items[index]={status:'failed',error:e.message}})}
     }));
     res.json(view(id));
   }finally{active.delete(id)}
 }));
 app.post('/api/world/live/:id/:requestId/:action',safe(async(req,res)=>{
   const session=view(req.params.id),r=session.requests.find(r=>r.id===req.params.requestId);
   if(!r)throw new WorldError('This guest is not in the live session.',404);
   const action=req.params.action;
   if(!['select','decline','resume','wait','cancel-preview','cancel'].includes(action))throw new WorldError('Unknown customer action.',400);
   if(req.body.simulateGuest!==true)throw new WorldError('Explicitly act as this fictional customer.',400);
   const result=await loopback(req,`/api/guest/requests/${r.id}/${action}`,req.body,token(r.id));
   res.json({...view(req.params.id),cancellation:result.cancellation});
 }));
}
