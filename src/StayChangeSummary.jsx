import React from 'react';
import {ArrowRight,ShieldCheck} from 'lucide-react';
import {hotelFeatures,roomTypes} from '../shared/hotel.js';
import './changes.css';
export default function StayChangeSummary({original,proposed,roomId,total,applied=false}){
 if(!original)return null;
 const rows=[['Dates',`${original.checkIn} → ${original.checkOut}`,`${proposed.checkIn} → ${proposed.checkOut}`],['Room',original.roomId,roomId||'Guest chooses an option'],['Guests',original.party,proposed.party],['Breakfast / morning',original.breakfast,proposed.breakfast],['Stay total',`$${original.total}`,total===undefined?'Quoted per option':`$${total}`]];
 const conditions=x=>[...(x.hard||[]).map(f=>hotelFeatures[f]||f),...Object.entries(x.spatial||{}).map(([k,v])=>`${({roomId:'Exact room',type:'Room type',view:'View',minFloor:'Minimum floor',maxFloor:'Maximum floor',elevatorMax:'Elevator ≤ m',breakfastMax:'Breakfast ≤ m',gymMax:'Gym ≤ m',poolMax:'Pool ≤ m'})[k]||k}: ${k==='type'?roomTypes[v]?.label||v:v}`)].join(' · ')||'No additional room requirements';
 return <section className="sw-change-compare" aria-label="Current and proposed stay"><div><ShieldCheck size={16}/><strong>{applied?'Customer selected · replacement saved':'Original booking stays protected'}</strong></div><table><thead><tr><th>Stay</th><th>{applied?'Before':'Current'}</th><th>{applied?'Now':'Proposed'}</th></tr></thead><tbody>{rows.map(([label,before,after])=><tr key={label} className={String(before)!==String(after)?'changed':''}><th>{label}</th><td>{before}</td><td><ArrowRight size={11}/>{after}</td></tr>)}</tbody></table><details className="sw-change-conditions"><summary>Compare required room conditions</summary><p>Before: {conditions(original)}</p><p>{applied?'Now':'Proposed'}: {conditions(proposed)}</p></details></section>;
}
