// Display metadata only. Guest presence and worker poses are illustrative, not sensors.
export const roomVisuals={
 ready:{label:'Vacant · ready',short:'VACANT',color:'#408b69',floor:'#c5dfca',icon:'✓'},
 occupied:{label:'In house',short:'IN HOUSE',color:'#b07b43',floor:'#e9cfa8',icon:'▰'},
 arriving:{label:'Arrival expected',short:'ARRIVING',color:'#167e88',floor:'#b8e4df',icon:'↘'},
 dirty:{label:'Needs cleaning',short:'TO CLEAN',color:'#b57f38',floor:'#ead5a8',icon:'≋'},
 scheduled:{label:'Preparation scheduled',short:'SCHEDULED',color:'#55849a',floor:'#bed6df',icon:'◷'},
 cleaning:{label:'Cleaning in progress',short:'CLEANING',color:'#227eaf',floor:'#9dd6ed',icon:'✦'},
 inspection:{label:'Awaiting inspection',short:'TO INSPECT',color:'#8c73ae',floor:'#dbcbea',icon:'◎'},
 inspecting:{label:'Inspection in progress',short:'INSPECTING',color:'#7854ad',floor:'#cdb5e8',icon:'⌕'},
 construction:{label:'Construction · off sale',short:'BUILDING',color:'#b96337',floor:'#eab78d',icon:'⚒'},
 repair:{label:'Repair · off sale',short:'REPAIR',color:'#bc6056',floor:'#e9b8b2',icon:'⚒'},
 blocked:{label:'Out of service',short:'OFF SALE',color:'#9c5b58',floor:'#dab9b6',icon:'×'},
};
// One compact building: three rooms on each facade, on every floor.
export function scenePosition(room){const col=Number(room.id.slice(1))-1;return [(col%3-1)*4.2,(room.floor-1)*3.6+2.8,col<3?2.65:-2.65]}
// Stable HUD coordinates, independent of camera angle and visibility.
export function roomSlot(room){const col=Number(room.id.slice(1))-1;return {wing:col<3?'front':'rear',row:6-room.floor,column:col%3}}
export const statusGlyphs={
 ready:['M5 12l4 4L19 6','M4 20h16'],
 occupied:['M3 18V7','M3 14h18v6','M7 10h3v4H7z','M12 9h7v5'],
 arriving:['M8 7h12v14H8z','M11 7V3h6v4','M2 12h9m-3-3 3 3-3 3'],
 dirty:['M4 9h16l-2 12H6z','M7 4l3 3 3-4 4 4','M9 12v6m6-6v6'],
 scheduled:['M4 5h16v16H4z','M8 3v4m8-4v4M4 10h16','M12 13v3h3'],
 cleaning:['M17 3 8 13','M6 12l6 5-4 5-6-5z','M18 11v6m-3-3h6','M5 3v4M3 5h4'],
 inspection:['M8 5H5v16h14V5h-3','M8 3h8v5H8z','M9 12h6m-6 4h4'],
 inspecting:['M8 5H4v16h12v-3','M7 3h8v5H7z','M21 12a4 4 0 1 1-8 0 4 4 0 1 1 8 0','M20 15l3 4'],
 construction:['M3 8h18v9H3z','M6 8l5 9m2-9 5 9','M5 17v4m14-4v4','M9 5h6'],
 repair:['M15 3a6 6 0 0 0-6 8L3 17l4 4 6-6a6 6 0 0 0 8-6l-4 3-4-4z'],
 blocked:['M5 10h14v11H5z','M8 10V6a4 4 0 0 1 8 0v4','M12 14v3'],
};
export function hotelClock(now=new Date()){
 const parts=new Intl.DateTimeFormat('en-GB',{timeZone:'Asia/Seoul',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).format(now);
 const [h,m]=parts.split(':').map(Number),hour=h+m/60;
 return {time:parts,hour,phase:hour<6||hour>=19?'night':hour<8||hour>=17?'sunset':'day',zone:'KST'};
}
export function taskGate(task,tasks,date){
 if(task.date!==date)return 'Different operating day';
 if(task.status==='completed')return 'Completed';
 if(task.status==='cancelled')return 'Cancelled';
 if(task.status==='in_progress')return null;
 if(tasks.some(t=>t.id!==task.id&&t.assignee===task.assignee&&t.status==='in_progress'))return 'Teammate is busy';
 if(task.kind==='inspection'&&tasks.some(t=>(task.orderId?t.orderId===task.orderId:t.bookingId===task.bookingId)&&t.kind==='cleaning'&&!['completed','cancelled'].includes(t.status)))return 'Cleaning comes first';
 return null;
}
