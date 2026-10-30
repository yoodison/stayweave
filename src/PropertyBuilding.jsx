import React from 'react';
import {roomTypes,statusMeta} from '../shared/hotel.js';

const point=(x,y,z)=>[170+x*.98-y*.46,740+x*.17+y*.32-z];
const pts=a=>a.map(v=>point(...v).join(',')).join(' ');
const Poly=({p,...props})=><polygon points={pts(p)} {...props}/>;
function Box({x,y,z,w,d,h,fill,side='#c5c9bb',stroke='none'}) {
  return <g><Poly p={[[x,y+d,z],[x+w,y+d,z],[x+w,y+d,z+h],[x,y+d,z+h]]} fill={side} stroke={stroke}/><Poly p={[[x+w,y,z],[x+w,y+d,z],[x+w,y+d,z+h],[x+w,y,z+h]]} fill={side} opacity=".85"/><Poly p={[[x,y,z+h],[x+w,y,z+h],[x+w,y+d,z+h],[x,y+d,z+h]]} fill={fill} stroke={stroke}/></g>;
}
function Bed({x,y,z,w=46,d=57,color='#a9bd9d'}){return <g><Box x={x} y={y} z={z} w={w} d={d} h={7} fill="#c6b49a" side="#b5a68f"/><Box x={x+2} y={y+2} z={z+7} w={w-4} d={d-4} h={9} fill="#fffef9" side="#deded2"/><Box x={x+2} y={y+25} z={z+16} w={w-4} d={d-27} h={1} fill={color}/><Box x={x+6} y={y+7} z={z+16} w={w-12} d={12} h={3} fill="#fffdf4"/></g>}
function Life({status,x,y}) {
  return <g transform={`translate(${x} ${y})`} aria-hidden="true">
    {status==='occupied'&&<g className="sw-guest-life"><ellipse cy="8" rx="9" ry="3" fill="#5a6846" opacity=".15"/><path d="M-5 5 Q-7 -9 0 -9 Q7 -9 5 5" fill="#9f7952"/><circle cy="-15" r="5" fill="#dcba92"/><path d="M-5 -5L-12 0M5 -5L10 -2" stroke="#9f7952" strokeWidth="3" strokeLinecap="round"/></g>}
    {status==='cleaning'&&<g className="sw-cleaner-life"><circle cx="-5" cy="-17" r="5" fill="#b6a68c"/><path d="M-5 -11v16m0-12L8 -4" stroke="#4b8eae" strokeWidth="7" strokeLinecap="round"/><g className="sw-broom"><path d="M10 -20L3 13" stroke="#9a825c" strokeWidth="2"/><path d="M-3 12L10 15L10 19L-5 16Z" fill="#e9ce8e"/></g><circle className="sw-spark" cx="18" cy="-10" r="2" fill="#fff"/></g>}
    {status==='inspecting'&&<g className="sw-inspector-life"><circle cy="-16" r="5" fill="#c8b097"/><path d="M0 -8v13" stroke="#8b78a7" strokeWidth="9" strokeLinecap="round"/><rect x="7" y="-9" width="11" height="15" rx="2" fill="#fffdf7" stroke="#8b78a7"/><path className="sw-check-life" d="M9 -2l2 3 5-6" fill="none" stroke="#7c9b60" strokeWidth="2"/></g>}
    {['construction','repair'].includes(status)&&<g><path d="M-17 11L-12 -20M17 11L12 -20M-14 -13H14M-16 1H16" stroke="#a48461" strokeWidth="3"/><path d="M-19 8H19" stroke="#e8be79" strokeWidth="8"/><path d="M-14 5l6 6M-2 5l6 6M10 5l6 6" stroke="#8d775d" strokeWidth="3"/><g className="sw-tool-life"><path d="M-4 -31L8 -19" stroke="#a3784d" strokeWidth="3"/><path d="M-7 -26L2 -35" stroke="#7f8d87" strokeWidth="6" strokeLinecap="round"/></g></g>}
    {status==='inspection'&&<g><circle r="11" fill="#fff" opacity=".8"/><path d="M-5 0l4 4 7-9" fill="none" stroke="#9e8bb9" strokeWidth="2"/></g>}
  </g>;
}
const typeColors={king:'#e3ebd4',twin:'#d9e9ed',deluxe:'#d5e9e6',family:'#f2e2c9',suite:'#e6def0',accessible:'#e5e5d6'};
export default function PropertyBuilding({rooms,roomStates={},selected,onSelect,floor,layer,motion=true,typeFilter='all',statusFilter='all'}) {
  const levels=[1,2,3,4,5,6];
  const focus=floor!=='all';
  return <svg className={`sw-building sw-hotel-building ${motion?'':'motion-off'}`} viewBox={focus?`65 ${650-(Number(floor)-1)*108} 830 270`:'30 80 920 930'} aria-label="Interactive 36-room hotel. Six floors, six room types, central elevator and shared facilities. Select a room for its route distances and actions." role="group">
    <defs><linearGradient id="sw-hotel-glass" x1="0" y1="0" x2="0" y2="1"><stop stopColor="#b2cabc" stopOpacity=".35"/><stop offset="1" stopColor="#f6f9ee" stopOpacity=".08"/></linearGradient><pattern id="sw-hotel-dots" width="22" height="22" patternUnits="userSpaceOnUse"><circle cx="1" cy="1" r=".6" fill="#bac3ad" opacity=".45"/></pattern><pattern id="sw-hazard" width="12" height="12" patternUnits="userSpaceOnUse" patternTransform="rotate(30)"><rect width="6" height="12" fill="#dca66e" opacity=".25"/></pattern></defs>
    <rect x="0" y="0" width="1100" height="1000" fill="url(#sw-hotel-dots)" pointerEvents="none"/>
    {!focus&&<><ellipse cx="490" cy="882" rx="350" ry="35" fill="#819276" opacity=".09"/><Box x={-42} y={-15} z={-30} w={760} d={190} h={13} fill="#e6e9dc" side="#d2d9c7"/><text x="202" y="135" fontSize="10" letterSpacing="3" fill="#8b9b80">HARBOR HOUSE / 36 KEYS</text><text x="806" y="253" fontSize="9" letterSpacing="2" fill="#86a9ae" transform="rotate(90 806 253)">SEA VIEW →</text><g transform="translate(165 946)" aria-label="Shared facilities: breakfast and pool on ground floor, fitness on floor 2"><rect x="-10" y="-22" width="640" height="65" rx="12" fill="#eef1e5" stroke="#dce3d1"/><g transform="translate(14 -4)"><circle cx="15" cy="10" r="13" fill="#ded0b4" stroke="#c1b392"/><rect x="-5" y="3" width="6" height="12" rx="2" fill="#b8c4a9"/><rect x="30" y="3" width="6" height="12" rx="2" fill="#b8c4a9"/><text x="48" y="9" fontSize="11" fill="#64795c">Breakfast & lounge</text><text x="48" y="25" fontSize="8" fill="#8b9b7d">GROUND · 07:00–10:00</text></g><g transform="translate(257 -4)"><rect width="44" height="28" rx="8" fill="#c0dde1" stroke="#9abfc5"/><path d="M5 9Q10 5 15 9T25 9T35 9M5 18Q10 14 15 18T25 18T35 18" fill="none" stroke="#e5f4f2"/><text x="56" y="9" fontSize="11" fill="#64795c">Pool & spa</text><text x="56" y="25" fontSize="8" fill="#8b9b7d">GROUND · 08:00–21:00</text></g><g transform="translate(462 -4)"><path d="M5 14H32M7 5V23M1 9V19M30 5V23M36 9V19" fill="none" stroke="#9fabc0" strokeWidth="4"/><text x="48" y="9" fontSize="11" fill="#64795c">Fitness studio</text><text x="48" y="25" fontSize="8" fill="#8b9b7d">LEVEL 2 · 06:00–22:00</text></g></g></>}
    {levels.filter(level=>!focus||Number(floor)===level).map(level=>{
      const z=(level-1)*108,entry=point(-23,126,z+8);
      return <g key={level} className="sw-hotel-floor">
        <Box x={-42} y={-4} z={z-10} w={727} d={158} h={10} fill="#e9eddf" side="#cbd4c0"/>
        <Poly p={[[0,0,z],[676,0,z],[676,0,z+60],[0,0,z+60]]} fill="url(#sw-hotel-glass)" stroke="#c0cfc0" strokeWidth=".6"/>
        <Box x={-38} y={0} z={z} w={32} d={110} h={62} fill="#dfe8d9" side="#afc1b1"/>
        <Poly p={[[0,122,z+1],[678,122,z+1],[678,147,z+1],[0,147,z+1]]} fill="#d5dfcb" opacity=".65"/>
        <polyline points={pts([[-19,135,z+3],[670,135,z+3]])} fill="none" stroke="#a3b89a" strokeDasharray="3 6"/>
        <g transform={`translate(${entry[0]} ${entry[1]})`}><rect x="-25" y="-9" width="43" height="20" rx="5" fill="#728d70"/><text textAnchor="middle" y="5" x="-3" fontSize="10" fill="#fff">↕ {level}F</text></g>
        {rooms.filter(r=>r.floor===level).map((r,col)=>{
          const snapshot=roomStates[r.id]||{status:'ready'},status=snapshot.status,meta=statusMeta[status]||statusMeta.ready;
          const x=col*113+3;const active=selected===r.id;
          const dim=(typeFilter!=='all'&&r.type!==typeFilter)||(statusFilter!=='all'&&status!==statusFilter);
          const fill=layer==='types'?typeColors[r.type]:layer==='view'?{sea:'#d6e9ee',garden:'#dbe8c9',city:'#e4e1ed'}[r.view]:layer==='access'?(r.distances.elevator<=15?'#c9dfb9':r.distances.elevator<=30?'#e1e9ca':'#f0e7d6'):meta.fill;
          const label=point(x+52,134,z+5),person=point(x+86,75,z+14),window=point(x+56,1,z+39);
          const secondary=layer==='types'?roomTypes[r.type]?.label:layer==='view'?`${r.view.toUpperCase()} VIEW`:layer==='access'?`${r.distances.elevator} m · elevator`:meta.label;
          return <g key={r.id} className={`sw-room ${active?'sw-room-selected':''}`} opacity={dim?.24:1} role="button" tabIndex={0} aria-pressed={active} aria-label={`Room ${r.id}, ${roomTypes[r.type]?.label}, ${meta.label}, floor ${level}, ${r.view} view, elevator ${r.distances.elevator} meters`} onClick={()=>onSelect(r.id)} onKeyDown={e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();onSelect(r.id)}}}>
            <title>{`${r.id} · ${roomTypes[r.type]?.label} · ${meta.label}\n${r.view} view · ${r.area} m² · ${r.beds}\nElevator ${r.distances.elevator} m / Breakfast ${r.distances.breakfast} m / Gym ${r.distances.gym} m / Pool ${r.distances.pool} m`}</title>
            <Poly p={[[x,2,z+1],[x+105,2,z+1],[x+105,121,z+1],[x,121,z+1]]} fill={fill} stroke={active?'#3e6648':'#bac9b2'} strokeWidth={active?2.8:.6}/>
            <Poly p={[[x,0,z],[x,115,z],[x,115,z+57],[x,0,z+57]]} fill="url(#sw-hotel-glass)" stroke="#b8c7b7" strokeWidth=".5"/>
            <Poly p={[[x+10,0,z+20],[x+97,0,z+20],[x+97,0,z+52],[x+10,0,z+52]]} fill={{sea:'#acd4dd',garden:'#c1d6ac',city:'#c9c7d9'}[r.view]} opacity=".8"/>
            <text x={window[0]} y={window[1]} textAnchor="middle" fontSize="7" fill="#617d7a">{r.view==='sea'?'≈ ≈ ≈':r.view==='garden'?'♧ ♧':'▥ ▥'}</text>
            {r.type==='twin'?<><Bed x={x+14} y={23} z={z+2} w={31} color="#9fbcc7"/><Bed x={x+56} y={23} z={z+2} w={31} color="#9fbcc7"/></>:r.type==='family'?<><Bed x={x+10} y={18} z={z+2} w={40} color="#d2b589"/><Bed x={x+57} y={18} z={z+2} w={24} d={47} color="#d2b589"/><Bed x={x+57} y={72} z={z+2} w={24} d={35} color="#d2b589"/></>:<><Bed x={x+18} y={25} z={z+2} w={51} color={r.type==='suite'?'#b9aad0':r.type==='deluxe'?'#9ebfbc':'#a9bc99'}/>{r.type==='suite'&&<Box x={x+20} y={93} z={z+2} w={56} d={16} h={14} fill="#cbbfdb" side="#ab9abf"/>}{r.type==='accessible'&&<Poly p={[[x+76,20,z+2],[x+100,20,z+2],[x+100,110,z+2],[x+76,110,z+2]]} fill="none" stroke="#9bb089" strokeDasharray="3 3"/>}</>}
            {['construction','repair'].includes(status)&&<Poly p={[[x,2,z+2],[x+105,2,z+2],[x+105,121,z+2],[x,121,z+2]]} fill="url(#sw-hazard)"/>}
            <Life status={status} x={person[0]} y={person[1]}/>
            <g transform={`translate(${label[0]} ${label[1]})`}><rect x="-49" y="-2" width="99" height="29" rx="6" fill={active?'#355b40':'#fffef9'} stroke={active?'#355b40':'#dbe3d2'} strokeWidth=".7"/><circle cx="-37" cy="8" r="3" fill={meta.color}/><text x="-28" y="12" fontSize="11" fontWeight="700" fill={active?'#fff':'#3e5741'}>{r.id}</text><text x="39" y="11" textAnchor="end" fontSize="7" fill={active?'#d4e7c9':'#849278'}>{r.area} m²</text><text x="-38" y="22" fontSize="7" fill={active?'#deebd5':'#71826a'}>{secondary}</text></g>
            {active&&<polyline className="sw-route-life" points={pts([[-19,112,z+4],[x+53,112,z+4],[x+53,98,z+4]])} stroke="#527f51" strokeWidth="2.5" strokeDasharray="4 5" fill="none" pointerEvents="none"/>}
          </g>;
        })}
      </g>;
    })}
  </svg>;
}
