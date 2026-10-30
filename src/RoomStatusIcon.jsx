import React from 'react';
import {statusGlyphs} from '../shared/scene.js';
export default function RoomStatusIcon({status,size=20}){return <svg className={`sw-status-icon status-${status}`} width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{(statusGlyphs[status]||statusGlyphs.blocked).map((d,i)=><path d={d} key={i}/>)}</svg>}
