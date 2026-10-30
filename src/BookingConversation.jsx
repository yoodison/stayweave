import React,{useState} from 'react';
import {Check,ArrowRight,MessageSquare,ShieldCheck} from 'lucide-react';
import {PlatformBadge} from './ChannelDesk.jsx';
const clock=n=>Number.isInteger(n)?`${String(Math.floor(n/60)).padStart(2,'0')}:${String(n%60).padStart(2,'0')}`:'Not given';
export function ChatImpact({impact,label='If selected'}){
 if(!impact)return null;
 return <div className="oa-chat-impact"><small>{label}</small><div>{[['cleaning','Cleaning','min'],['linen','Free linen','sets'],['team','Team','min']].map(([k,l,u])=><span key={k}>{l}<b>{impact[k].before} → {impact[k].after} <em>{u}</em></b></span>)}</div>{impact.breakfast?.map(d=><p key={d.date}>Breakfast · {d.date}: <b>{d.before} → {d.after} covers</b></p>)}{impact.staff?.map(p=><p key={p.id}>{p.name}: {p.before} → {p.after} scheduled min</p>)}<small>Scheduled work, not completed work or paid hours.</small></div>;
}
function GuestCard({r,draftId,demo,busy,onAction,onGuest,onScene,onAmend,cancellation}){
 const [optionId,setOption]=useState(''),[reviewed,setReviewed]=useState(false),[actor,setActor]=useState(false);
 const option=r.options.find(o=>o.id===optionId)||r.options[0];
 const confirmed=r.status==='confirmed',impact=confirmed?r.appliedImpact:option?.impact;
 const signature=JSON.stringify([r.status,option?.choiceToken,r.checkIn,r.checkOut,r.party,r.hard,r.preferences]);
 const reviewKey=reviewed===signature;
 const act=(a,body={})=>onAction(draftId,r.id,a,{...body,simulateGuest:true});
 const choices=()=>({optionId:option.id,choiceToken:option.choiceToken,version:r.offerVersion,customerConfirmed:true,conditionsReviewed:true});
 return <section className="oa-chat-guest" aria-label={`${r.guest} guest coordination`}><header><b>{r.guest}</b><PlatformBadge channel={r.channel}/><span>{r.status.replaceAll('_',' ')}</span></header><p>{r.checkIn} → {r.checkOut} · {r.party} guests · {r.breakfast} breakfast</p>
 {r.amendmentOf&&<p className="oa-chat-protected"><ShieldCheck size={14}/>{confirmed?'Replacement selected.':'Original room '+r.original.roomId+' stays booked until the guest chooses.'} Prior requirements preserved.</p>}
 {r.coordination&&!confirmed&&<p className="oa-chat-reason">{r.coordination.reason}</p>}
 {!['confirmed','cancelled','amended'].includes(r.status)&&r.options.length>0&&<div className="oa-chat-options" role="group" aria-label={`${r.guest} room options`}>{r.options.map(o=><button key={o.id} aria-pressed={o.id===option?.id} onClick={()=>{setOption(o.id);setReviewed(false)}}><small>{o.roomId===r.coordination?.roomId?'JOINT FIT':'OPTION'}</small><b>Room {o.roomId}</b><span>{o.view} · Floor {o.floor}</span><strong>${o.total} total</strong></button>)}</div>}
 {option&&!['cancelled','amended','declined','expired'].includes(r.status)&&<><p className="oa-chat-terms">Arrival {clock(confirmed?impact?.arrival:option.arrival)} · ${confirmed?impact?.total:option.total} total including breakfast</p><ul className="oa-chat-reasons">{(impact?.roomReason||option.reasons||[]).map((reason,i)=><li key={i}><Check size={12}/>{reason}</li>)}</ul></>}
 {r.reason&&r.status==='needs_review'&&<p role="status">{r.reason}</p>}
 {impact&&!['cancelled','amended','declined','expired'].includes(r.status)&&<><ChatImpact impact={impact} label={confirmed?'Saved & read back':'Proposed operating impact'}/><button className="oa-chat-link" onClick={()=>onScene(impact,confirmed,r)}>See this change on the hotel <ArrowRight size={13}/></button></>}
 {confirmed&&<p className="oa-chat-saved"><Check size={14}/>Room {impact?.roomId} confirmed · reservation and operating plan saved together.</p>}
 {demo?<><button className="oa-chat-role" aria-pressed={actor} disabled={busy} onClick={()=>setActor(!actor)}><MessageSquare size={14}/>{actor?`Reviewing as ${r.guest}`:`Demo · act as ${r.guest}`}</button>{actor&&<div className="oa-chat-choice"><small>Fictional customer role · this is not owner approval.</small>
 {r.status==='offered'&&option&&<><label><input type="checkbox" checked={reviewKey} onChange={e=>setReviewed(e.target.checked?signature:false)}/>I reviewed the dates, price, arrival and all conditions.</label><button className="oa-primary" disabled={busy||!reviewKey} onClick={()=>act('select',choices())}>Choose room {option.roomId} as {r.guest}</button><button className="oa-chat-link" disabled={busy} onClick={()=>act('decline',{optionId:option.id,choiceToken:option.choiceToken})}>Decline this room · find another</button></>}
 {['expired','declined'].includes(r.status)&&<button className="oa-secondary" disabled={busy} onClick={()=>act('resume')}>Ask for fresh options</button>}
 {confirmed&&<><button className="oa-chat-link" disabled={busy} onClick={()=>onAmend(r)}>Propose a change in chat</button><button className="oa-chat-link" disabled={busy} onClick={()=>act('cancel-preview')}>Review cancellation</button>{cancellation&&<div className="oa-plan"><b>Cancel this stay?</b><p>{cancellation.blocked||'Only pending booking work and unused allocations are released.'}</p><ChatImpact impact={cancellation.impact} label="Cancellation preview"/><button className="oa-secondary" disabled={busy} onClick={()=>act('cancel',{cancelToken:cancellation.token,confirmed:true})}>{cancellation.blocked?'Ask the owner for help':'Confirm cancellation as '+r.guest}</button></div>}</>}
 </div>}</>:<p className="oa-notice">Awaiting the customer’s authenticated choice. Their agent or guest portal can respond; the result appears here.<button className="oa-chat-link" onClick={()=>onGuest(r.id)}>Open customer access</button></p>}
 </section>;
}
export default function BookingConversation({message,latest,demo,busy,onPublish,onEdit,onAction,onGuest,onScene,onAmend}){
 const d=message.booking;if(!d)return null;
 if(!latest)return <p className="oa-notice">Continued below · latest details are shown in the next request card.</p>;
 const draft=['collecting','ready'].includes(d.status);
 return <div className="oa-booking" aria-label="Booking conversation"><div className="oa-chat-progress"><span className="done">1 Details</span><span className={!draft?'done':''}>2 Joint fit</span><span className={d.requests?.every(r=>r.status==='confirmed')&&!draft?'done':''}>3 Guest choice</span><span className={d.requests?.some(r=>r.status==='confirmed')?'done':''}>4 Operations</span></div>
 {draft?<><div className="oa-draft-items">{d.items.map((item,i)=>{const f=item.fields;return <section key={i}><b>{f.guest||`Guest ${i+1}`}</b>{f.bookingId&&<span className="oa-notice">Changing an existing stay · original protected. Prior required conditions: {item.priorRequirements?.join(', ')||'none recorded'}.</span>}<dl><div><dt>Dates</dt><dd>{f.checkIn||'Check-in?'} → {f.checkOut||'Check-out?'}</dd></div><div><dt>Guests / breakfast</dt><dd>{f.party??'?'} / {f.breakfast??'?'}</dd></div><div><dt>Arrival</dt><dd>{clock(f.arrival)}{f.latest!==f.arrival?'–'+clock(f.latest):' · exact'}</dd></div>{f.roomId&&<div><dt>Requested room</dt><dd>{f.roomId}</dd></div>}<div><dt>Source</dt><dd>{f.channel} · manual intake</dd></div></dl>{item.claims.map((c,n)=><p className="oa-chat-condition" key={n}><b>{c.kind.replaceAll('_',' ')}</b> · {c.evidence}</p>)}</section>})}</div>
 {d.missing?.length>0&&<p className="oa-missing">Still needed: {d.missing.map(m=>`${d.items.length>1?(d.items[m.slot]?.fields.guest||'Guest')+' · ':''}${m.field}`).join(', ')}. Reply in the box below.</p>}
 <button className="oa-chat-link" disabled={busy} onClick={()=>onEdit(d.id)}>Continue / correct these details</button>
 {d.status==='ready'&&<button className="oa-primary" disabled={busy} onClick={()=>onPublish(d.id,d.revision)}>Confirm details & find coordinated options <ArrowRight size={15}/></button>}
 </>:<><p className="oa-chat-reason">Compared with {d.coordination?.groupSize||0} pending requests · {d.coordination?.queueSize||0} queued. Offers do not hold rooms.</p>{d.requests.map(r=><GuestCard key={r.id} r={r} draftId={d.id} demo={demo} busy={busy} onAction={onAction} onGuest={onGuest} onScene={onScene} onAmend={onAmend} cancellation={d.lastResult?.requestId===r.id&&d.lastResult.action==='cancel-preview'?d.lastResult.cancellation:null}/>)}
 {d.lastResult&&d.lastResult.action!=='cancel-preview'&&<details className="oa-chat-receipt"><summary><b>{d.lastResult.actor} · {d.lastResult.action==='select'?'Choice saved':d.lastResult.action==='cancel'?'Cancellation checked':'Alternatives rechecked'}</b></summary><ChatImpact impact={d.lastResult.impact} label="Actual change from this response"/><p>Other pending requests were re-evaluated automatically. Existing guest commitments remain protected.</p></details>}</>}
 </div>;
}
