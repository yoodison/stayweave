// A separate HTTP client: no imports from the application’s planner or data store.
// Credentials and request capabilities are read/written privately, never printed.
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {randomUUID} from 'node:crypto';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const dir=path.join(root,'.stayweave'),sessionFile=path.join(dir,'agent-session.json');
const base='http://127.0.0.1:3001';
const [command,arg,confirmation]=process.argv.slice(2);
async function call(url,method,body,token,headers={}){
  const response=await fetch(base+url,{method,headers:{'Content-Type':'application/json',Authorization:`Bearer ${token}`,...headers},...(body&&method!=='GET'?{body:JSON.stringify(body)}:{})});
  const data=await response.json();if(!response.ok)throw new Error(data.error);return data;
}
function save(s){fs.writeFileSync(sessionFile,JSON.stringify(s,null,2),{mode:0o600});}
function print(data){console.log(JSON.stringify({requestId:data.request.id,status:data.request.status,coordination:data.request.coordination,requestedStay:{checkIn:data.request.checkIn,checkOut:data.request.checkOut,party:data.request.party,breakfast:data.request.breakfast},originalReservation:data.originalReservation,interpretation:data.request.interpretation,options:data.request.options.map(o=>({id:o.id,room:o.roomId,total:o.total,arrival:o.arrival,reasons:o.reasons,linen:o.prep.linen,teamMinutes:o.prep.minutes})),reservation:data.reservation,tasks:data.tasks,readback:data.readback},null,2));}
try{
  if(command==='request'){
    if(!arg)throw new Error('Usage: node scripts/guest-agent.mjs request examples/guest-request.json');
    const input=JSON.parse(fs.readFileSync(arg,'utf8'));
    const key=fs.readFileSync(path.join(dir,'agent-key'),'utf8').trim();
    const previous=fs.existsSync(sessionFile)?JSON.parse(fs.readFileSync(sessionFile,'utf8')):null;
    const fingerprint=JSON.stringify(input);
    const session=previous?.fingerprint===fingerprint?previous:{fingerprint,idempotencyKey:randomUUID()};save(session);
    const data=await call('/api/agent/requests','POST',input,key,{'Idempotency-Key':session.idempotencyKey});
    save({...session,requestId:data.request.id,token:data.requestToken,version:data.request.offerVersion,choices:data.request.options.map(o=>({id:o.id,choiceToken:o.choiceToken}))});print(data);
    console.log('Present these options to the customer. Select only after their explicit choice.');
  }else if(command==='change'){
    if(!arg)throw new Error('Usage: change <complete updated stay JSON> (proposes only; does not select).');
    const input=JSON.parse(fs.readFileSync(arg,'utf8')),session=JSON.parse(fs.readFileSync(sessionFile,'utf8'));
    const fingerprint=JSON.stringify(input),pending=session.changeDraft?.fingerprint===fingerprint?session.changeDraft:{fingerprint,parentId:session.requestId,parentToken:session.token,idempotencyKey:randomUUID()};save({...session,changeDraft:pending});
    const data=await call(`/api/guest/requests/${pending.parentId}/changes`,'POST',input,pending.parentToken,{'Idempotency-Key':pending.idempotencyKey});
    save({...session,changeDraft:pending,requestId:data.request.id,token:data.requestToken,version:data.request.offerVersion,choices:data.request.options.map(o=>({id:o.id,choiceToken:o.choiceToken}))});print(data);console.log('Original reservation is protected. Present alternatives; select only after the customer chooses.');
  }else if(command==='withdraw'){
    if(arg!=='--keep-original')throw new Error('Usage: withdraw --keep-original (declines only the pending proposal).');
    const session=JSON.parse(fs.readFileSync(sessionFile,'utf8'));const data=await call(`/api/guest/requests/${session.requestId}/withdraw`,'POST',{keepOriginal:true},session.token);print(data);
  }else if(['decline','resume','wait','cancel-preview','cancel'].includes(command)){
    const session=JSON.parse(fs.readFileSync(sessionFile,'utf8'));
    if(command==='decline'&&(!arg||confirmation!=='--customer-confirmed'))throw new Error('Usage: decline <option ID|all> --customer-confirmed');
    if(command==='cancel'&&(arg!=='--customer-confirmed'||!session.cancellation))throw new Error('First run cancel-preview. After the customer reviews it, run cancel --customer-confirmed.');
    const body=command==='decline'?(arg==='all'?{all:true}:{optionId:arg,choiceToken:session.choices?.find(o=>o.id===arg)?.choiceToken}):command==='cancel'?{cancelToken:session.cancellation.token,confirmed:true}:command==='wait'?{wait:true}:{};
    const data=await call(`/api/guest/requests/${session.requestId}/${command}`,'POST',body,session.token);
    save({...session,version:data.request.offerVersion,choices:data.request.options.map(o=>({id:o.id,choiceToken:o.choiceToken})),cancellation:data.cancellation||session.cancellation});print(data);
    if(data.cancellation)console.log(JSON.stringify({cancellation:{bookingId:data.cancellation.bookingId,expiresAt:data.cancellation.expiresAt,blocked:data.cancellation.blocked,impact:data.cancellation.impact},scope:'No external cancellation fee, payment or refund.'},null,2));
  }else if(command==='arrival'){
    if(!/^([01]\d|2[0-3]):[0-5]\d$/.test(arg||'')||confirmation!=='--customer-confirmed')throw new Error('Usage: arrival HH:MM --customer-confirmed (only after the guest confirms this exact time).');
    const arrival=Number(arg.slice(0,2))*60+Number(arg.slice(3)),session=JSON.parse(fs.readFileSync(sessionFile,'utf8'));
    if(!session.requestId)throw new Error('Create and confirm a guest reservation first.');
    const change=session.arrivalChange?.arrival===arrival?session.arrivalChange:{arrival,idempotencyKey:randomUUID()};save({...session,arrivalChange:change});
    const data=await call(`/api/guest/requests/${session.requestId}/arrival-change`,'POST',{arrival,confirmed:true},session.token,{'Idempotency-Key':change.idempotencyKey});
    console.log(JSON.stringify({status:data.status,reason:data.reason,reservation:data.reservation,readback:data.readback},null,2));
  }else if(['read','refresh','select'].includes(command)){
    const session=JSON.parse(fs.readFileSync(sessionFile,'utf8'));
    if(!session.requestId)throw new Error('No completed request. Retry the request command first.');
    if(command==='select'&&(!arg||confirmation!=='--customer-confirmed'))throw new Error('Usage: select <exact option ID> --customer-confirmed (only after customer review).');
    const suffix=command==='read'?'':`/${command}`;
    const body=command==='select'?{optionId:arg,version:session.version,choiceToken:session.choices?.find(o=>o.id===arg)?.choiceToken,conditionsReviewed:true,customerConfirmed:true}:{};
    const data=await call(`/api/guest/requests/${session.requestId}${suffix}`,command==='read'?'GET':'POST',body,session.token);
    save({...session,version:data.request.offerVersion,choices:data.request.options.map(o=>({id:o.id,choiceToken:o.choiceToken}))});print(data);
  }else console.log('Commands: decline <option ID|all> --customer-confirmed | resume | wait | cancel-preview | cancel --customer-confirmed | request <json file> | read | refresh | select <option ID> --customer-confirmed | change <json file> | withdraw --keep-original | arrival HH:MM --customer-confirmed');
}catch(e){console.error(e.message);process.exitCode=1;}
