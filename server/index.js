import express from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { initialState, calculateSchedule, makeOffer, acceptOffer, retryExecution, approveDraft, replayStaffCompletion, invalidatePlan, replan, confirmReadback, DomainError } from './engine.js';
import { aiStatus, interpret } from './ai.js';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const dir=path.join(root,'.stayweave'); const file=path.join(dir,'state.json');
fs.mkdirSync(dir,{recursive:true});
let state; try {state=JSON.parse(fs.readFileSync(file,'utf8'));} catch {state=initialState();}
function saveAndRead(candidate){const tmp=`${file}.tmp`;fs.writeFileSync(tmp,JSON.stringify(candidate,null,2),{mode:0o600});fs.renameSync(tmp,file);return JSON.parse(fs.readFileSync(file,'utf8'));}
const app=express(); app.use(express.json({limit:'16kb'}));
const view=()=>({state,ai:aiStatus(),schedule:state.offer?.schedule || calculateSchedule(state)});
app.get('/api/state',(_req,res)=>res.json(view()));
app.post('/api/interpret',async(req,res)=>{try {if(typeof req.body?.message!=='string'||!req.body.message.trim()) return res.status(400).json({error:'Enter a guest request.'});res.json(await interpret(req.body.message));}catch(e){res.status(e.status||502).json({error:e.message});}});
function mutation(fn){return(req,res)=>{try{const candidate=fn(structuredClone(state),req.body || {});state=saveAndRead(candidate);if(['applied_unverified','partially_applied'].includes(state.execution?.status) && state.execution.actions[0].status!=='verified'){state=saveAndRead(confirmReadback(structuredClone(state),state));}else if(state.execution?.status==='applied_unverified'){state=saveAndRead(confirmReadback(structuredClone(state),state));}res.json(view());}catch(e){res.status(e instanceof DomainError?409:500).json({error:e instanceof DomainError?e.message:'The update could not be completed.',code:e.code||'SERVER_ERROR'});}};}
app.post('/api/offer',mutation((s,b)=>makeOffer(s,b)));
app.post('/api/select',mutation((s,b)=>acceptOffer(s,b)));
app.post('/api/retry',mutation(s=>retryExecution(s)));
app.post('/api/verify',mutation(s=>{if(s.execution?.status!=='applied_unverified') throw new DomainError('There is no pending readback.');return s;}));
app.post('/api/approve',mutation((s,b)=>approveDraft(s,b.id,b.version,b.amount)));
app.post('/api/replay',mutation(s=>replayStaffCompletion(s)));
app.post('/api/invalidate',mutation(s=>invalidatePlan(s)));
app.post('/api/replan',mutation(s=>replan(s)));
app.post('/api/reset',mutation(()=>initialState()));
const dist=path.join(root,'dist');if(fs.existsSync(dist)){app.use(express.static(dist));app.get('/{*path}',(_req,res)=>res.sendFile(path.join(dist,'index.html')));}
const port=Number(process.env.PORT||3001);const host=process.env.HOST||'127.0.0.1';
app.listen(port,host,()=>console.log(`StayWeave running at http://${host}:${port}`));
