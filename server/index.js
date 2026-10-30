import express from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { initialState, calculateSchedule, makeOffer, acceptOffer, retryExecution, approveDraft, replayStaffCompletion, invalidatePlan, replan, confirmReadback, DomainError } from './engine.js';
import { aiStatus, interpret, interpretFit } from './ai.js';
import { matchingDefaults, previewMatching, customFitDefaults, previewCustomMatching } from './matching.js';
import { mountWorld } from './world-api.js';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const dir=path.join(root,'.stayweave'); const file=path.join(dir,'state.json');
fs.mkdirSync(dir,{recursive:true});
let state; try {state=JSON.parse(fs.readFileSync(file,'utf8'));} catch {state=initialState();}
function saveAndRead(candidate){const tmp=`${file}.tmp`;fs.writeFileSync(tmp,JSON.stringify(candidate,null,2),{mode:0o600});fs.renameSync(tmp,file);return JSON.parse(fs.readFileSync(file,'utf8'));}
const app=express();
// Local operator UI only. Reject cross-origin writes and DNS-rebinding hosts.
app.use((req,res,next)=>{
  const allowedHosts=['127.0.0.1','localhost','[::1]'];
  let host,origin;
  try{host=new URL(`http://${req.headers.host}`).hostname;origin=req.headers.origin?new URL(req.headers.origin):null;}catch{return res.status(403).json({error:'Invalid local origin.'});}
  if(!allowedHosts.includes(host)||(origin&&(!allowedHosts.includes(origin.hostname)||!['5173','3001',String(process.env.PORT||3001)].includes(origin.port))))return res.status(403).json({error:'This prototype accepts local requests only.'});
  if(!['GET','HEAD'].includes(req.method)&&!req.is('application/json'))return res.status(415).json({error:'Use application/json.'});
  next();
});
app.use(express.json({limit:'32kb'}));
mountWorld(app,dir);
const demoDir=path.join(dir,'hackathon-demo');fs.mkdirSync(demoDir,{recursive:true});
const demoRouter=express.Router();mountWorld(demoRouter,demoDir,undefined,{demo:true});app.use('/api/demo',demoRouter);
const view=()=>({state,ai:aiStatus(),schedule:state.offer?.schedule || calculateSchedule(state)});
app.get('/api/state',(_req,res)=>res.json(view()));
app.get('/api/fit',(_req,res)=>res.json(previewMatching(matchingDefaults())));
app.get('/api/custom-fit',(_req,res)=>res.json(customFitDefaults()));
app.post('/api/custom-fit',(req,res)=>{try{res.json(previewCustomMatching(req.body));}catch(e){res.status(e instanceof DomainError?400:500).json({error:e instanceof DomainError?e.message:'The plan could not be calculated.'});}});
const fitDraftFile=path.join(dir,'fit-draft.json');
app.get('/api/custom-fit/draft',(_req,res)=>{try{if(!fs.existsSync(fitDraftFile))return res.json({draft:null});res.json({draft:JSON.parse(fs.readFileSync(fitDraftFile,'utf8'))});}catch{res.status(500).json({error:'The saved draft could not be read.'});}});
app.post('/api/custom-fit/draft',(req,res)=>{try{
  const {scenario,planIndex}=req.body||{};
  if(!Number.isInteger(planIndex)||planIndex<0||planIndex>2)throw new DomainError('Select an available plan.');
  const result=previewCustomMatching(scenario),plan=result.plans[planIndex];
  if(!plan)throw new DomainError('The selected plan is no longer available.');
  const draft={scenario,planIndex,result,matcherVersion:2,savedAt:new Date().toISOString(),status:'local_draft'};
  const tmp=`${fitDraftFile}.tmp`;fs.writeFileSync(tmp,JSON.stringify(draft,null,2),{mode:0o600});fs.renameSync(tmp,fitDraftFile);
  const stored=JSON.parse(fs.readFileSync(fitDraftFile,'utf8'));
  if(JSON.stringify(stored)!==JSON.stringify(draft))throw new Error('Draft readback mismatch');
  res.json({draft:stored});
}catch(e){res.status(e instanceof DomainError?400:500).json({error:e instanceof DomainError?e.message:'The draft could not be saved and verified.'});}});
app.post('/api/fit', (req,res)=>{try{res.json(previewMatching(req.body));}catch(e){res.status(e instanceof DomainError?400:500).json({error:e instanceof DomainError?e.message:'The fit plan could not be calculated.'});}});
app.post('/api/interpret-fit',async(req,res)=>{try{res.json(await interpretFit(req.body?.message));}catch(e){res.status(e.status||502).json({error:e.message});}});
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
