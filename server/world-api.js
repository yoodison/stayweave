import {interpretBookingTurn} from './owner-booking.js';
import {mountOwnerAgent,interpretOwner} from './owner-agent.js';
import {mountLivePresentation} from './live-presentation.js';
import {presentationSnapshot,modelEvidence} from './presentation.js';
import {pending,armResponse,recordLifecycle,finishLifecycle,expireResponses,decline,resume,cancellationPreview,confirmCancellation} from './lifecycle.js';
import {reconcileCoordination,selectCoordinated,coordinationImpact} from './coordination.js';
import {policyOf,setPolicy,intakeIncident,reconcileAutopilot,approveCase} from './autopilot.js';
import {interpretOps} from './autopilot-agent.js';
import {jointPlans,publishJoint,commitJointDemo,recoveryPlans,applyRecovery,planningDemoInputs} from './planning.js';
import {interpretIncident,adviseRecovery} from './planning-agent.js';
import {verifyModel,metrics} from './inference.js';
import {evaluatePlanning} from './evaluation.js';
import {reconcileChannels,channelView,setChannelRule,simulateChannelJob} from './channels.js';
import {demoInput,addDemoRequest} from './demo.js';
import fs from 'node:fs';
import path from 'node:path';
import { randomBytes, createHmac, timingSafeEqual } from 'node:crypto';
import { interpretFit, aiStatus } from './ai.js';
import { WorldError, newWorld, validateInbound, addRequest, refreshRequest, acceptRequest, completeTask, cancelReservation, editRoom, worldView, publicRequest, event, expandHotel, startTask, queueTurnover, maintenanceAction, stayAction, addAmendment, amendmentTarget } from './world.js';

const lifecycleTimers=new Map();
export function mountWorld(app, dir, interpreter = message=>interpretFit(message,{hotel:true}), {demo=false,incidentInterpreter=interpretIncident,recoveryAdvisor=adviseRecovery,opsInterpreter=interpretOps,modelVerifier=verifyModel,ownerInterpreter=interpretOwner,bookingInterpreter=interpretBookingTurn}={}) {
  const file = path.join(dir, 'world.json');
  const keyFile = path.join(dir, 'agent-key');
  if (!fs.existsSync(keyFile)) fs.writeFileSync(keyFile, randomBytes(32).toString('hex'), {mode:0o600});
  const key = fs.readFileSync(keyFile,'utf8').trim();
  let state;
  if (fs.existsSync(file)) {
    state = JSON.parse(fs.readFileSync(file,'utf8'));
    if (![1,2].includes(state.schema)) throw new Error('Unsupported world schema. Preserve the file and migrate it.');
  } else { state = newWorld(); fs.writeFileSync(file, JSON.stringify(state,null,2), {mode:0o600}); }
  function save(candidate) {
    reconcileChannels(candidate);
    const tmp = `${file}.tmp`;
    fs.writeFileSync(tmp,JSON.stringify(candidate,null,2),{mode:0o600});
    const checked = JSON.parse(fs.readFileSync(tmp,'utf8'));
    if (JSON.stringify(checked)!==JSON.stringify(candidate)) throw new Error('Readback mismatch');
    fs.renameSync(tmp,file); state = checked;
  }
  if(state.schema===1){
    const backup=path.join(dir,'world-before-hotel-expansion.json');if(!fs.existsSync(backup))fs.copyFileSync(file,backup,fs.constants.COPYFILE_EXCL);
    save(expandHotel(state));
  }
  if(!state.channelOps){fs.copyFileSync(file,path.join(dir,'world-before-channel-automation.json'));save(structuredClone(state));}
  function change(fn) {
    const copy=structuredClone(state); expireResponses(copy); const result=fn(copy); reconcileAutopilot(copy);
    if(copy.version!==state.version)for(const r of copy.requests)if(pending(r))refreshRequest(copy,r.id);
    reconcileCoordination(copy); for(const r of copy.requests)if(r.cancellationException&&r.status!=='confirmed')r.cancellationException=null; finishLifecycle(copy); save(copy); return result;
  }
  function safe(fn) { return async(req,res)=>{try{await fn(req,res);}catch(e){res.status(e instanceof WorldError ? e.status : e.status || 500).json({error:e instanceof WorldError || e.status ? e.message : 'The operation could not be saved. No confirmation was issued.',code:e.code||'SERVER_ERROR'});}}; }
  const equal=(a,b)=>typeof a==='string'&&Buffer.byteLength(a)===Buffer.byteLength(b)&&timingSafeEqual(Buffer.from(a),Buffer.from(b));
  const bearer=req=>(req.headers.authorization||'').replace(/^Bearer /,'');
  const token=id=>createHmac('sha256',key).update(`guest:${id}`).digest('hex');
  const authorize=(req,id)=>{if(!equal(bearer(req),key)&&!equal(bearer(req),token(id)))throw new WorldError('A valid request capability is required.',401,'UNAUTHORIZED');};
  const receipt=r=>{const reservation=state.reservations.find(b=>b.id===r.bookingId)||null;const sharedOrder=state.workOrders?.find(o=>o.id===reservation?.sharedOrderId)||null;return {request:publicRequest(r),reservation,originalReservation:r.amendmentOf?state.reservations.find(b=>b.id===r.amendmentOf):null,changeProposals:state.requests.filter(x=>x.amendmentOf===(r.status==='confirmed'?r.bookingId:r.amendmentOf||r.bookingId)&&x.id!==r.id).map(x=>({id:x.id,status:x.status,createdAt:x.createdAt,guestPath:`/?guest=${x.id}#${token(x.id)}`})),sharedOrder,tasks:state.tasks.filter(t=>(r.bookingId&&t.bookingId===r.bookingId)||(sharedOrder&&t.orderId===sharedOrder.id)),readback:true,scope:'Local StayWeave records; no OTA booking or payment'};};
  const inflight=new Map(); let recent=[];
  async function create(req,res,isAgent) {
    if(isAgent&&!equal(bearer(req),key))throw new WorldError('Use the configured StayWeave agent API credential.',401,'UNAUTHORIZED');
    const idempotencyKey=req.headers['idempotency-key'];
    if(typeof idempotencyKey!=='string'||!/^[A-Za-z0-9_-]{16,100}$/.test(idempotencyKey))throw new WorldError('Send a unique Idempotency-Key with 16–100 letters, digits, hyphens or underscores.',400);
    const source=isAgent?'agent':req.body.channel||'website';
    const input=validateInbound(state,req.body,source);
    const scopedKey=`${isAgent?'agent':'local'}:${idempotencyKey}`;
    const fingerprint=JSON.stringify(input);
    let r=state.requests.find(r=>r.idempotencyKey===scopedKey);
    if(r && r.fingerprint!==fingerprint)throw new WorldError('This idempotency key was already used with different details.',409);
    if(!r){
      if(inflight.has(scopedKey)){
        const pending=inflight.get(scopedKey); if(pending.fingerprint!==fingerprint)throw new WorldError('This idempotency key is in use for different details.',409);
        await pending.promise;
      }else{
        recent=recent.filter(t=>Date.now()-t<60000); if(recent.length>=10)throw new WorldError('Too many model requests. Try again in a minute.',429);
        recent.push(Date.now());
        const promise=(async()=>{const result=await interpreter(input.message);change(s=>{const created=addRequest(s,input,result,scopedKey,source);created.fingerprint=fingerprint;armResponse(created);});})();
        inflight.set(scopedKey,{promise,fingerprint});
        try{await promise;}finally{inflight.delete(scopedKey);}
      }
      r=state.requests.find(r=>r.idempotencyKey===scopedKey);
    }
    res.status(201).json({...receipt(r),requestToken:token(r.id),guestPath:`/?guest=${r.id}#${token(r.id)}`});
  }
  mountOwnerAgent(app,{dir,getState:()=>state,change,safe,opsInterpreter,ownerInterpreter,bookingInterpreter,demo,authorize});
  app.get('/api/world',safe((req,res)=>res.json({...worldView(state,req.query.date||state.date),ai:aiStatus(),demo,channelControl:channelView(state),inference:metrics(),autopilot:state.autopilot||{policy:policyOf(state),cases:[]}})));
  let planningBusy=false;
  const planningSafe=fn=>safe(async(req,res)=>{if(planningBusy)throw new WorldError('Another planning run is in progress.',409);planningBusy=true;try{await fn(req,res)}finally{planningBusy=false}});
  if(demo){
    app.get('/api/world/presentation',safe((_req,res)=>res.json(presentationSnapshot(state))));
    app.post('/api/world/presentation/probe',planningSafe(async(req,res)=>{
      const snapshot=presentationSnapshot(state);
      if(req.body.runModel!==true||!snapshot.ready)throw new WorldError('Open a complete demo and explicitly run a new interpretation.',400);
      const recorded=snapshot.requests.find(r=>r.id===req.body.requestId);
      if(!recorded)throw new WorldError('Choose a request from this presentation.',400);
      const catalog=await modelVerifier();
      if(!catalog.available)throw new WorldError('The configured model is not available in the current provider catalog.',503);
      const interpretation=await interpreter(recorded.message);
      res.json({mode:'live',catalog,result:modelEvidence({...recorded,interpretation}),
        operationsChanged:false,scope:'Fresh model interpretation only. No reservation, guest choice or operating plan was changed.'});
    }));
  }
  const proposal=id=>state.planning?.proposals?.find(p=>p.id===id);
  const saveProposal=p=>change(s=>{if(s.version!==p.version)throw new WorldError('The property changed during analysis. Run again.',409);s.planning??={proposals:[]};s.planning.proposals.unshift(p);s.planning.proposals=s.planning.proposals.slice(0,30)});
  app.post('/api/world/autopilot/policy',safe((req,res)=>{change(s=>setPolicy(s,req.body));res.json({policy:policyOf(state),readback:true})}));
  app.post('/api/world/autopilot/report',planningSafe(async(req,res)=>{
    const key=req.headers['idempotency-key'];if(typeof key!=='string'||!/^[A-Za-z0-9_-]{16,100}$/.test(key))throw new WorldError('A unique Idempotency-Key is required.',400);
    const {version:reportedVersion,...reportPayload}=req.body;
    const fingerprint=JSON.stringify(reportPayload),existing=state.autopilot?.cases.find(c=>c.key===key);
    if(existing){if(existing.fingerprint!==fingerprint)throw new WorldError('Incident key already used with different details.',409);return res.json({case:existing,readback:true})}
    const version=state.version;if(req.body.version!==version)throw new WorldError('Property changed. Reload the report.',409);
    const incident=req.body.live===true?await opsInterpreter(req.body.message,structuredClone(state),req.body.bookingId):{...req.body.incident,message:req.body.message||'Verified structured report',evidence:'Verified structured fields'};
    if(req.body.live===true&&incident.kind!==req.body.incident?.kind)throw new WorldError('The interpreted incident differs from the selected report type. Review it before recording.',422);
    const consent=req.body.guestConsent===true&&incident.kind==='arrival_change'&&req.body.consentArrival===incident.arrival?{bookingId:incident.bookingId,arrival:incident.arrival,source:'owner_attested',at:new Date().toISOString()}:null;
    let id;change(s=>{if(s.version!==version)throw new WorldError('Property changed during interpretation. Review again.',409);const c=intakeIncident(s,incident,{key,source:req.body.live?'owner_model_report':'owner_structured_report',consent});c.fingerprint=fingerprint;id=c.id});res.json({case:state.autopilot.cases.find(c=>c.id===id),readback:true});
  }));
  app.post('/api/world/autopilot/:id/approve',safe((req,res)=>{change(s=>approveCase(s,req.params.id,req.body));res.json({case:state.autopilot.cases.find(c=>c.id===req.params.id),readback:true})}));
  app.post('/api/world/autopilot/:id/consent',safe((req,res)=>{
    change(s=>{const c=s.autopilot?.cases.find(c=>c.id===req.params.id);if(!c||c.incident.kind!=='arrival_change'||c.status==='resolved')throw new WorldError('Choose a pending arrival change.',409);
      if(req.body.version!==s.version||req.body.confirmed!==true||req.body.arrival!==c.incident.arrival||req.body.bookingId!==c.incident.bookingId)throw new WorldError('Review the current guest and exact arrival time before recording consent.',409);
      c.consent={bookingId:c.incident.bookingId,arrival:c.incident.arrival,source:'owner_attested',at:new Date().toISOString()};s.version++;event(s,'Guest arrival consent recorded',`Exact time ${c.incident.arrival} · operator attestation`);
    });res.json({case:state.autopilot.cases.find(c=>c.id===req.params.id),readback:true});
  }));
  app.post('/api/world/coordination/recheck',safe((_req,res)=>{change(s=>reconcileCoordination(s,{force:true}));res.json({coordination:state.coordination,readback:true})}));
  app.post('/api/world/autopilot/recheck',safe((_req,res)=>{change(()=>{});res.json({readback:true})}));
  app.post('/api/guest/requests/:id/arrival-change',safe((req,res)=>{
    authorize(req,req.params.id);const r=state.requests.find(r=>r.id===req.params.id),b=state.reservations.find(b=>b.id===r?.bookingId&&b.status==='confirmed');if(!b)throw new WorldError('No active reservation for this guest capability.',409);
    if(req.body.confirmed!==true)throw new WorldError('Confirm this exact arrival time.',400);
    const key=req.headers['idempotency-key'];if(typeof key!=='string'||!/^[A-Za-z0-9_-]{16,100}$/.test(key))throw new WorldError('A unique Idempotency-Key is required.',400);
    const scoped='guest-arrival:'+key,prior=state.autopilot?.cases.find(c=>c.key===scoped||c.guestConfirmationKey===scoped);
    if(prior){if(prior.incident.bookingId!==b.id||prior.incident.arrival!==req.body.arrival)throw new WorldError('Key already used for a different change.',409);return res.json({status:prior.status,reason:prior.reason,reservation:b,readback:true})}
    let id;change(s=>{const consent={bookingId:b.id,arrival:req.body.arrival,source:'guest_capability',at:new Date().toISOString()},pending=s.autopilot?.cases.find(c=>c.status!=='resolved'&&c.incident.kind==='arrival_change'&&c.incident.bookingId===b.id&&c.incident.arrival===req.body.arrival);
      if(pending){pending.consent=consent;pending.guestConfirmationKey=scoped;id=pending.id;s.version++;event(s,'Guest confirmed the arrival change','Request capability verified; existing incident rechecked.');}
      else id=intakeIncident(s,{kind:'arrival_change',bookingId:b.id,arrival:req.body.arrival,message:'Customer confirmed an arrival-time change.'},{key:scoped,source:'authenticated_guest',consent}).id;
    });const c=state.autopilot.cases.find(c=>c.id===id);res.json({status:c.status,reason:c.reason,reservation:state.reservations.find(x=>x.id===b.id),readback:true});
  }));
  if(demo)app.post('/api/world/autopilot/demo-prepare',safe((_req,res)=>{let roomId;change(s=>{const room=s.rooms.find(r=>r.floor===6&&!r.blocked&&!s.reservations.some(b=>b.status==='confirmed'&&b.roomId===r.id)&&!s.tasks.some(t=>t.roomId===r.id&&['scheduled','in_progress'].includes(t.status)));if(!room)throw new WorldError('No unused floor-6 room for this fixture. Existing stays are protected.',409);queueTurnover(s,room.id,'unbooked demo preparation');roomId=room.id});res.json({roomId,readback:true})}));
  app.post('/api/world/planning/model',planningSafe(async(_req,res)=>res.json(await verifyModel())));
  app.get('/api/world/planning/metrics',safe((_req,res)=>res.json(metrics())));
  app.post('/api/world/planning/joint',planningSafe((req,res)=>{const p=jointPlans(state,req.body.requestIds);saveProposal(p);res.json({proposal:p,readback:true})}));
  app.post('/api/world/planning/incident',planningSafe(async(req,res)=>{
    const snapshot=structuredClone(state),incident=await incidentInterpreter(req.body.message,snapshot.rooms.map(r=>r.id),demo?'hackathon-demo':'interactive');const p=recoveryPlans(snapshot,incident);
    try{p.advice=await recoveryAdvisor(p,demo?'hackathon-demo':'interactive')}catch(e){p.adviceError=e.message;}
    p.trace.unshift({tool:'interpret_staff_message',result:`${incident.roomId} · ${incident.delayMinutes} extra cleaning minutes · evidence: ${incident.evidence}`});saveProposal(p);res.json({proposal:p,readback:true});
  }));
  app.post('/api/world/planning/:id/publish',safe((req,res)=>{change(s=>publishJoint(s,s.planning?.proposals?.find(p=>p.id===req.params.id),req.body.planId));res.json({proposal:proposal(req.params.id),readback:true})}));
  app.post('/api/world/planning/:id/apply',safe((req,res)=>{change(s=>{const p=s.planning?.proposals?.find(p=>p.id===req.params.id);if(p?.kind!=='incident')throw new WorldError('Choose an incident plan.',400);applyRecovery(s,p,req.body.planId,req.body.confirmed)});res.json({proposal:proposal(req.params.id),readback:true})}));
  app.post('/api/world/planning/evaluate',planningSafe(async(req,res)=>{const result=await evaluatePlanning(interpreter,{live:req.body.live===true});change(s=>{s.planning??={proposals:[]};s.planning.evaluation=result});res.json({evaluation:result,readback:true})}));
  if(demo){
    app.post('/api/world/planning/demo-intake',planningSafe(async(req,res)=>{
      if(state.planning?.demoRequestIds?.length)return res.json({requestIds:state.planning.demoRequestIds,readback:true});
      const before=state.version,inputs=planningDemoInputs(state),results=[];for(const input of inputs)results.push(req.body.live===true?await interpreter(input.message):{claims:[...input.hard.map(feature=>({kind:'requirement',feature,evidence:input.message})),...input.preferences.map(feature=>({kind:'preference',feature,evidence:input.message}))],provider:'Scripted scenario · no model call'});
      const ids=[];change(s=>{if(s.version!==before)throw new WorldError('Property changed during intake.',409);for(const roomId of ['602','604','605']){const room=s.rooms.find(r=>r.id===roomId);if(!s.reservations.some(b=>b.roomId===roomId&&b.status==='confirmed')&&!s.tasks.some(t=>t.roomId===roomId&&['scheduled','in_progress'].includes(t.status))){room.condition='dirty';s.version++;}}inputs.forEach((input,i)=>ids.push(addRequest(s,input,results[i],`joint-demo-${i}-${s.version}`,'agent').id));s.planning??={proposals:[]};s.planning.demoRequestIds=ids;});res.json({requestIds:ids,readback:true});
    }));
    app.post('/api/world/planning/:id/demo-confirm',safe((req,res)=>{change(s=>commitJointDemo(s,s.planning?.proposals?.find(p=>p.id===req.params.id),req.body.planId,req.body.simulateCustomers));res.json({proposal:proposal(req.params.id),readback:true});}));
  }
  if(demo){
    let coordinationDemoBusy=false;
    const loopback=async(req,url,body,cap,idem)=>{
      const response=await fetch(`http://127.0.0.1:${req.socket.localPort}${req.baseUrl}${url}`,{method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${cap}`,...(idem?{'Idempotency-Key':idem}:{})},body:JSON.stringify(body)});
      const data=await response.json();if(!response.ok)throw new WorldError(data.error||'Concurrent request failed.',response.status);return data;
    };
    mountLivePresentation(app,{getState:()=>state,change,safe,loopback,token,key,modelVerifier});
    app.post('/api/world/lifecycle/demo-prepare',safe(async(req,res)=>{
      if(req.body.simulateCustomers!==true)throw new WorldError('Explicit fictional customer simulation required.',400);
      if(coordinationDemoBusy)throw new WorldError('A guest demo is already running.',409);coordinationDemoBusy=true;
      try{
        if(state.lifecycleDemo?.prepared)return res.json({demo:state.lifecycleDemo,readback:true});
        if(!state.lifecycleDemo)change(s=>{s.lifecycleDemo={key:randomBytes(12).toString('hex'),step:0,requestIds:[],source:'Fictional customer agents · explicit simulation'}});
        const d=state.lifecycleDemo,day=n=>new Date(Date.parse(state.date)+n*86400000).toISOString().slice(0,10),base={checkIn:day(14),checkOut:day(16),party:2,breakfast:2,arrival:900,latest:1080};
        const previous=state.requests.find(r=>r.idempotencyKey===`agent:lifecycle-${d.key}-holder`);if(previous&&pending(previous))await loopback(req,`/api/guest/requests/${previous.id}/decline`,{all:true},token(previous.id));
        const holder=await loopback(req,'/api/agent/requests',{...base,guest:'Avery Harbor',message:'I prefer a quiet room.',spatial:{roomId:'502'}},key,`lifecycle-${d.key}-holder-v2`);
        if(holder.request.status!=='confirmed'){const o=holder.request.options[0];if(!o)throw new WorldError('Room 502 cannot be prepared in the current demo. Existing records were preserved.',409);await loopback(req,`/api/guest/requests/${holder.request.id}/select`,{optionId:o.id,choiceToken:o.choiceToken,version:holder.request.offerVersion,conditionsReviewed:true,customerConfirmed:true},holder.requestToken);}
        const inputs=[{...base,guest:'Drew Bay',message:'I prefer a sea view, but another view is fine.'},{...base,guest:'Parker Shore',message:'I prefer a quiet room.',spatial:{roomId:'105'}},{...base,guest:'Quinn Cove',message:'I prefer a quiet room.',spatial:{roomId:'502'}}];
        const results=await Promise.allSettled(inputs.map((input,i)=>loopback(req,'/api/agent/requests',input,key,`lifecycle-${d.key}-guest-${i}`)));const failed=results.find(r=>r.status==='rejected');if(failed)throw failed.reason;
        const ids=results.map(r=>r.value.request.id);await loopback(req,`/api/guest/requests/${ids[2]}/wait`,{wait:true},token(ids[2]));
        change(s=>{s.lifecycleDemo={...s.lifecycleDemo,holderId:holder.request.id,requestIds:ids,prepared:true};for(const e of s.lifecycle?.events||[])if(e.requestId===holder.request.id)e.source='simulated_customer_choice'});res.json({demo:state.lifecycleDemo,readback:true});
      }finally{coordinationDemoBusy=false}
    }));
    app.post('/api/world/lifecycle/demo-next',safe(async(req,res)=>{
      if(req.body.simulateCustomers!==true)throw new WorldError('Explicit fictional customer simulation required.',400);
      if(coordinationDemoBusy)throw new WorldError('A guest demo is already running.',409);const d=state.lifecycleDemo;if(!d?.prepared)throw new WorldError('Prepare the lifecycle demo first.',409);if(d.step>=4)return res.json({demo:d,readback:true});coordinationDemoBusy=true;
      try{
        const [rejectId,slowId,waitId]=d.requestIds,step=d.step;
        if(step===0&&!state.lifecycle?.events.some(e=>e.requestId===rejectId&&e.kind==='option_declined')){const r=state.requests.find(r=>r.id===rejectId),o=r.options[0];if(!o)throw new WorldError('No current alternative to decline. Ask for fresh options.',409);await loopback(req,`/api/guest/requests/${rejectId}/decline`,{optionId:o.id,choiceToken:o.choiceToken},token(rejectId));}
        if(step===1)change(s=>{const r=s.requests.find(r=>r.id===slowId);if(!r.responseDueAt)throw new WorldError('The slow guest has no offered option to expire.',409);expireResponses(s,{now:Date.parse(r.responseDueAt),ids:[slowId],source:'simulated_deadline'});});
        if(step===2&&state.requests.find(r=>r.id===d.holderId)?.status!=='cancelled'){const p=await loopback(req,`/api/guest/requests/${d.holderId}/cancel-preview`,{},token(d.holderId));await loopback(req,`/api/guest/requests/${d.holderId}/cancel`,{cancelToken:p.cancellation.token,confirmed:true},token(d.holderId));}
        if(step===3&&state.requests.find(r=>r.id===waitId)?.status!=='confirmed'){const r=state.requests.find(r=>r.id===waitId),o=r.options[0];if(!o)throw new WorldError('No feasible replacement yet. Current reservations remain protected.',409);await loopback(req,`/api/guest/requests/${waitId}/select`,{optionId:o.id,choiceToken:o.choiceToken,version:r.offerVersion,conditionsReviewed:true,customerConfirmed:true},token(waitId));}
        change(s=>{s.lifecycleDemo.step=step+1;const latest=s.lifecycle?.events.find(e=>[rejectId,slowId,d.holderId,waitId].includes(e.requestId));if(latest)latest.source=step===1?'simulated_deadline':'simulated_customer_choice';});res.json({demo:state.lifecycleDemo,readback:true});
      }finally{coordinationDemoBusy=false}
    }));
    app.post('/api/world/coordination/demo-intake',safe(async(req,res)=>{
      if(coordinationDemoBusy)throw new WorldError('The concurrent demo is already running.',409);
      if(state.coordinationDemo?.requestIds?.length===3)return res.json({requestIds:state.coordinationDemo.requestIds,readback:true});
      coordinationDemoBusy=true;try{
        if(!state.coordinationDemo){const b=state.reservations.find(b=>b.guest==='Casey Lane'&&b.status==='confirmed'&&b.requestId&&!['checked_in','checked_out'].includes(b.phase));if(!b)throw new WorldError('This cumulative demo needs Casey’s unstarted confirmed stay. Existing records were not reset.',409);
          amendmentTarget(state,b.id);change(s=>{s.coordinationDemo={key:randomBytes(12).toString('hex'),parentId:b.requestId,originalId:b.id,createdAt:new Date().toISOString()}});
        }
        const setup=state.coordinationDemo,day=n=>new Date(Date.parse(state.date)+n*86400000).toISOString().slice(0,10),common={checkIn:day(7),checkOut:day(9),party:2,breakfast:2,arrival:900,latest:1020,spatial:{minFloor:5,maxFloor:5}};
        const inputs=[{...common,guest:'Casey Lane',message:'I would prefer a sea view, but another view is fine.',requirementsMode:'replace'},{...common,guest:'Riley Ocean',message:'A sea view is required.'},{...common,guest:'Jamie Coast',message:'I would prefer a sea view, but a city or garden view is fine.'}];
        const results=await Promise.allSettled(inputs.map((input,i)=>loopback(req,i===0?`/api/guest/requests/${setup.parentId}/changes`:'/api/agent/requests',input,i===0?token(setup.parentId):key,`concurrent-${setup.key}-${i}`)));
        const failed=results.find(x=>x.status==='rejected');if(failed)throw failed.reason;
        const ids=results.map(x=>x.value.request.id);change(s=>{s.coordinationDemo.requestIds=ids;reconcileCoordination(s,{force:true})});res.json({requestIds:ids,readback:true});
      }finally{coordinationDemoBusy=false}
    }));
    app.post('/api/world/coordination/demo-choose',safe(async(req,res)=>{
      if(req.body.simulateCustomers!==true)throw new WorldError('Explicitly simulate each fictional customer choice.',400);
      if(coordinationDemoBusy)throw new WorldError('The concurrent demo is already running.',409);
      if(state.coordinationDemo?.completedRound)return res.json({complete:true,round:state.coordinationDemo.completedRound,readback:true});
      const beforeChoices=structuredClone(state),ids=state.coordinationDemo?.requestIds;if(ids?.length!==3)throw new WorldError('Receive the three requests first.',409);
      const choices=ids.map(id=>{const r=state.requests.find(r=>r.id===id),o=r.options.find(o=>o.id===r.selectedOptionId)||r.options.find(o=>o.roomId===r.coordination?.roomId);if(!o)throw new WorldError('A guest has no coordinated option. Recheck capacity; no choice was simulated.',409);return {id,body:{optionId:o.id,choiceToken:o.choiceToken,version:r.offerVersion,conditionsReviewed:true,customerConfirmed:true}}});
      coordinationDemoBusy=true;try{const results=await Promise.allSettled(choices.map(c=>loopback(req,`/api/guest/requests/${c.id}/select`,c.body,token(c.id))));const outcomes=results.map((r,i)=>({requestId:ids[i],status:r.status==='fulfilled'?'confirmed':'needs_new_choice',...(r.status==='rejected'?{reason:r.reason.message}:{bookingId:r.value.reservation.id})}));const complete=outcomes.every(o=>o.status==='confirmed');let round=null;if(complete){const assignments=beforeChoices.coordination.current.plans[0].assignments.filter(a=>ids.includes(a.requestId));round={id:randomBytes(12).toString('hex'),requestIds:ids,createdAt:new Date().toISOString(),plans:[{id:'saved-choices',assignments,served:3,matched:assignments.reduce((n,a)=>n+(a.option?.matched.length||0),0),impact:coordinationImpact(beforeChoices,state),roomIds:[...new Set(assignments.flatMap(a=>[a.oldRoomId,a.option?.roomId]).filter(Boolean))]}],latencyMs:beforeChoices.coordination.current.latencyMs,nodes:beforeChoices.coordination.current.nodes,search:'Actual saved local outcomes after three separately simulated guest choices',competingFirstChoices:beforeChoices.coordination.current.competingFirstChoices};change(s=>{s.coordinationDemo.completedRound=round})}res.json({outcomes,complete,round,readback:true,scope:'Explicit simulated customer choices; no actual guest consent claimed'});}finally{coordinationDemoBusy=false}
    }));
  }
  app.post('/api/world/channels/:id/rules',safe((req,res)=>{change(s=>setChannelRule(s,req.params.id,req.body));res.json({ok:true,readback:true});}));
  app.post('/api/world/channel-jobs/:id/simulate',safe((req,res)=>{change(s=>simulateChannelJob(s,req.params.id,req.body));res.json({ok:true,readback:true,externalTransmission:false});}));
  app.post('/api/world/channels/reconcile',safe((_req,res)=>{change(s=>reconcileChannels(s));res.json({ok:true,readback:true});}));
  app.get('/api/guest/property',(_req,res)=>res.json({name:state.name,date:state.date,timezone:state.timezone,scope:'Local demo · no payment or OTA booking'}));
  app.post('/api/agent/requests',safe((req,res)=>create(req,res,true)));
  app.post('/api/guest/requests',safe((req,res)=>create(req,res,false)));
  app.post('/api/world/requests',safe((req,res)=>create(req,res,false)));
  app.get('/api/guest/requests/:id',safe((req,res)=>{authorize(req,req.params.id);const r=state.requests.find(r=>r.id===req.params.id);if(!r)throw new WorldError('Request not found.',404);res.json(receipt(r));}));
  app.post('/api/guest/requests/:id/refresh',safe((req,res)=>{authorize(req,req.params.id);change(s=>{refreshRequest(s,req.params.id);reconcileCoordination(s,{force:true})});res.json(receipt(state.requests.find(r=>r.id===req.params.id)));}));
  app.post('/api/guest/requests/:id/select',safe((req,res)=>{authorize(req,req.params.id);change(s=>{const before=structuredClone(s),r=s.requests.find(r=>r.id===req.params.id),was=r?.status;selectCoordinated(s,req.params.id,req.body);if(was!=='confirmed')recordLifecycle(s,before,r,'selected','Customer chose the current terms. Reservation and operations saved together.')});res.json(receipt(state.requests.find(r=>r.id===req.params.id)));}));
  for(const [action,fn] of Object.entries({decline,resume,'cancel-preview':cancellationPreview,cancel:confirmCancellation}))app.post(`/api/guest/requests/:id/${action}`,safe((req,res)=>{authorize(req,req.params.id);let result;change(s=>{result=fn(s,req.params.id,req.body)});res.json({...receipt(state.requests.find(r=>r.id===req.params.id)),...(action==='cancel-preview'?{cancellation:result}:{})});}));
  app.post('/api/guest/requests/:id/wait',safe((req,res)=>{authorize(req,req.params.id);change(s=>{const r=s.requests.find(r=>r.id===req.params.id);if(!r||!pending(r)||req.body.wait!==true)throw new WorldError('Choose an open request and explicitly opt in to waiting.',409);r.waitForAvailability=true;s.version++});res.json(receipt(state.requests.find(r=>r.id===req.params.id)));}));
  // Persist elapsed response windows without extending them on unrelated property updates.
  clearInterval(lifecycleTimers.get(file));
  const responseTimer=setInterval(()=>{if(!fs.existsSync(file)){clearInterval(responseTimer);return;}if(state.requests.some(r=>pending(r)&&r.lifecycleVersion&&Date.parse(r.responseDueAt)<=Date.now()))try{change(()=>{})}catch{/* Keep prior saved state; retry on next tick. */}},5000);responseTimer.unref();lifecycleTimers.set(file,responseTimer);
  app.post('/api/world/requests/:id/refresh',safe((req,res)=>{change(s=>{refreshRequest(s,req.params.id);reconcileCoordination(s,{force:true})});res.json({ok:true});}));
  app.post('/api/world/requests/:id/note',safe((req,res)=>{change(s=>{const r=s.requests.find(r=>r.id===req.params.id);if(!r)throw new WorldError('Request not found.',404);if(typeof req.body.note!=='string'||!req.body.note.trim()||req.body.note.length>1000)throw new WorldError('Enter a clarification of up to 1,000 characters.',400);r.ownerNote=req.body.note.trim();event(s,'Clarification saved for guest',`${r.guest} · visible in local guest page/API, not sent externally`);});res.json({ok:true,readback:true});}));
  app.post('/api/world/requests/:id/guest-link',safe((req,res)=>{const r=state.requests.find(r=>r.id===req.params.id);if(!r)throw new WorldError('Request not found.',404);res.json({path:`/?guest=${r.id}#${token(r.id)}`});}));
  const createChange=isGuest=>safe(async(req,res)=>{
    let bookingId=req.params.id;
    if(isGuest){authorize(req,req.params.id);const parent=state.requests.find(r=>r.id===req.params.id);if(!parent)throw new WorldError('Request not found.',404);bookingId=parent.status==='confirmed'?parent.bookingId:parent.amendmentOf||parent.bookingId;}
    const requirementsMode=req.body.requirementsMode||(isGuest?'preserve':'replace');if(!['preserve','replace'].includes(requirementsMode))throw new WorldError('Choose preserve or replace for prior requirements.',400);
    const old=state.reservations.find(b=>b.id===bookingId);if(!old)throw new WorldError('Reservation not found.',404);const input=validateInbound(state,{...req.body,guest:old.guest},old.channel);
    const key=req.headers['idempotency-key'];if(typeof key!=='string'||!/^[A-Za-z0-9_-]{16,100}$/.test(key))throw new WorldError('A unique Idempotency-Key is required.',400);
    const scoped=`${isGuest?'guest-amend':'amend'}:${key}`,fingerprint=JSON.stringify(isGuest||requirementsMode!=='replace'?{id:old.id,input,requirementsMode}:{id:old.id,input});
    let existing=state.requests.find(r=>r.idempotencyKey===scoped);
    if(existing&&existing.fingerprint!==fingerprint)throw new WorldError('Idempotency key already used with different details.',409);
    if(!existing){
      amendmentTarget(state,old.id);
      if(inflight.has(scoped)){const pending=inflight.get(scoped);if(pending.fingerprint!==fingerprint)throw new WorldError('Idempotency key is in use for different details.',409);await pending.promise;}
      else {recent=recent.filter(t=>Date.now()-t<60000);if(recent.length>=10)throw new WorldError('Too many model requests. Try again in a minute.',429);recent.push(Date.now());
        const promise=(async()=>{const result=await interpreter(input.message);change(s=>{const r=addAmendment(s,old.id,input,result,scoped,old.channel,{requirementsMode,requestedBy:isGuest?'authenticated_customer':'owner'});r.fingerprint=fingerprint;armResponse(r);});})();inflight.set(scoped,{promise,fingerprint});try{await promise;}finally{inflight.delete(scoped);}}
      existing=state.requests.find(r=>r.idempotencyKey===scoped);
    }
    res.status(201).json({...receipt(existing),...(isGuest?{requestToken:token(existing.id),guestPath:`/?guest=${existing.id}#${token(existing.id)}`}:{})});
  });
  app.post('/api/world/reservations/:id/change',createChange(false));
  app.post('/api/guest/requests/:id/changes',createChange(true));
  app.post('/api/guest/requests/:id/withdraw',safe((req,res)=>{authorize(req,req.params.id);change(s=>{const r=s.requests.find(x=>x.id===req.params.id);if(!r?.amendmentOf)throw new WorldError('Choose a pending change proposal.',409);if(r.withdrawn)return;if(!['offered','needs_review'].includes(r.status))throw new WorldError('This change is no longer pending.',409);if(req.body.keepOriginal!==true)throw new WorldError('Confirm keeping the original reservation.',400);amendmentTarget(s,r.amendmentOf);r.status='cancelled';r.withdrawn=true;r.options=[];s.version++;event(s,'Guest kept original reservation',r.amendmentOf)});res.json(receipt(state.requests.find(r=>r.id===req.params.id)));}));
  if(demo){
    app.post('/api/world/demo/reset',safe((_req,res)=>{fs.copyFileSync(file,path.join(dir,`world-before-reset-${Date.now()}.json`));save(newWorld());res.json({ok:true,readback:true});}));
    app.post('/api/world/demo/scenario',safe(async(req,res)=>{
      const details=demoInput(state,req.body.scenario),result=req.body.liveModel===true?await interpreter(details.input.message):{claims:details.claims,provider:'Scripted demo interpretation · no model call'};
      let id;change(s=>{const current=demoInput(s,req.body.scenario);if(current.bookingId!==details.bookingId)throw new WorldError('Demo state changed. Retry.',409);id=addDemoRequest(s,req.body.scenario,current,result).id;});
      res.json({request:publicRequest(state.requests.find(r=>r.id===id)),readback:true});
    }));
    app.post('/api/world/demo/select/:id',safe((req,res)=>{if(req.body.simulateCustomer!==true)throw new WorldError('Explicit simulated customer choice is required.',400);change(s=>selectCoordinated(s,req.params.id,req.body));res.json({request:publicRequest(state.requests.find(r=>r.id===req.params.id)),readback:true});}));
  }
  app.post('/api/world/tasks/:id/start',safe((req,res)=>{change(s=>startTask(s,req.params.id));res.json({ok:true,readback:true});}));
  app.post('/api/world/rooms/:id/prepare',safe((req,res)=>{change(s=>queueTurnover(s,req.params.id));res.json({ok:true,readback:true});}));
  app.post('/api/world/rooms/:id/maintenance',safe((req,res)=>{change(s=>maintenanceAction(s,req.params.id,req.body));res.json({ok:true,readback:true});}));
  app.post('/api/world/reservations/:id/stay',safe((req,res)=>{change(s=>stayAction(s,req.params.id,req.body.action));res.json({ok:true,readback:true});}));
  app.post('/api/world/tasks/:id/complete',safe((req,res)=>{change(s=>completeTask(s,req.params.id));res.json({ok:true,readback:true});}));
  app.post('/api/world/reservations/:id/cancel',safe((req,res)=>{if(req.body.confirm!==true)throw new WorldError('Confirm cancellation.',400);change(s=>cancelReservation(s,req.params.id));res.json({ok:true,readback:true});}));
  app.post('/api/world/rooms/:id',safe((req,res)=>{change(s=>editRoom(s,req.params.id,req.body));res.json({ok:true,readback:true});}));
  app.post('/api/world/linen',safe((req,res)=>{change(s=>{const n=req.body.quantity;if(!Number.isInteger(n)||n<1||n>100)throw new WorldError('Enter 1–100 received linen sets.',400);s.linenStock+=n;s.version++;event(s,'Linen receipt recorded',`${n} additional sets · local inventory only`);});res.json({ok:true,readback:true});}));
  app.get('/api/agent/schema',(_req,res)=>res.json({version:6,lifecycle:{decline:'POST /api/guest/requests/:id/decline {all:true} or {optionId,choiceToken}',resume:'POST /api/guest/requests/:id/resume',wait:'POST /api/guest/requests/:id/wait {wait:true}',cancelPreview:'POST /api/guest/requests/:id/cancel-preview',cancel:'POST /api/guest/requests/:id/cancel {cancelToken,confirmed:true}'},authentication:'Bearer agent API key for intake; returned requestToken for guest operations',intake:'POST /api/agent/requests',read:'GET /api/guest/requests/:id',refresh:'POST /api/guest/requests/:id/refresh',select:'POST /api/guest/requests/:id/select',arrivalChange:'POST /api/guest/requests/:id/arrival-change',change:'POST /api/guest/requests/:id/changes',withdraw:'POST /api/guest/requests/:id/withdraw',changeInput:'Complete intake fields, requirementsMode preserve (default) or replace; original stays confirmed until explicit select',arrivalChangeInput:{arrival:'integer 600–1320, exact customer-confirmed arrival today',confirmed:true},requiredHeaders:['Authorization','Idempotency-Key (intake, stay changes and arrival changes)'],input:{guest:'string',message:'natural-language request, max 2000',checkIn:'YYYY-MM-DD',checkOut:'YYYY-MM-DD',party:'integer 1–4',arrival:'local minute 600–1320',latest:'latest accepted local arrival minute',breakfast:'integer 0–party',spatial:{roomId:'optional exact known room ID',type:'optional: king, twin, deluxe, family, suite, accessible',view:'optional: sea, garden, city',minFloor:'optional integer 1–6',maxFloor:'optional integer 1–6',elevatorMax:'optional route meters 0–300',breakfastMax:'optional route meters 0–300',gymMax:'optional route meters 0–300',poolMax:'optional route meters 0–300'}},selection:{optionId:'returned option ID',choiceToken:'optional returned token; revalidates identical guest terms across concurrent mutations',version:'returned offerVersion',customerConfirmed:true,conditionsReviewed:true},scope:'Loopback local demo, one room per request, 30-day horizon, no OTA or payment execution'}));
}
