import React from 'react';
import {AbsoluteFill, Img, OffthreadVideo, staticFile, useCurrentFrame} from 'remotion';
import {easeSpring, scaleLerp} from './vendor/openscreen-motion.js';

const C = {paper:'#f2f0e9', ink:'#19382f', quiet:'#64766d', accent:'#bb764d', line:'#d6dcd1'};
const clamp = x => Math.min(1,Math.max(0,x));
const mix = (a,b,t) => a+(b-a)*t;
export const blend = (frame,start,length=34) => easeSpring(clamp((frame-start)/length));

// Camera decisions are authored explicitly. No synthetic pointer or invented clicks.
export function cameraAt(frame, keys) {
  const index = keys.findIndex(k=>k.frame>frame);
  if(index===0) return keys[0];
  if(index===-1) return keys.at(-1);
  const a=keys[index-1], b=keys[index], t=blend(frame,a.frame,b.frame-a.frame);
  return {scale:scaleLerp(a.scale,b.scale,t),x:mix(a.x,b.x,t),y:mix(a.y,b.y,t)};
}

function ProductCrop({region, width, height, zoom=1, focus=[.5,.5]}) {
  const [x,y,w,h]=region;
  const base=Math.max(width/w,height/h), scale=base*zoom;
  const tx=Math.min(0,Math.max(width-w*scale,width/2-w*focus[0]*scale));
  const ty=Math.min(0,Math.max(height-h*scale,height/2-h*focus[1]*scale));
  return <div style={{width,height,position:'relative',overflow:'hidden',background:'#e8eee5'}}>
    <Img src={staticFile('stayweave-verified-ui.png')} style={{position:'absolute',width:1230*scale,height:1086*scale,maxWidth:'none',left:tx-x*scale,top:ty-y*scale}}/>
  </div>;
}

function Brand({dark=false}) {
 return <div style={{position:'absolute',left:72,top:48,right:72,display:'flex',justifyContent:'space-between',alignItems:'center',color:dark?'#f2f0e9':C.ink,fontSize:23}}>
  <span style={{fontWeight:650,letterSpacing:-.7}}>stayweave<span style={{color:C.accent}}> /</span></span>
  <span style={{fontSize:15,letterSpacing:2,opacity:.65}}>HOSPITALITY, CONNECTED</span>
 </div>;
}
function Footer({chapter,dark=false}) {
 return <div style={{position:'absolute',bottom:32,left:72,right:72,display:'flex',justifyContent:'space-between',fontSize:16,color:dark?'#b8c6bc':C.quiet}}>
  <span>0{chapter} / 03</span><span>Saved prototype UI · editorial camera movement</span><span>STAYWEAVE — FILM STUDY</span>
 </div>;
}
function Tag({children}) {return <div style={{fontSize:16,letterSpacing:2,color:C.quiet,marginBottom:28}}>{children}</div>;}

export function Editorial() {
 const f=useCurrentFrame();
 const scene=f<210?0:f<420?1:2;
 const local=f-scene*210;
 const enter=blend(local,0,26);
 const titleStyle={fontFamily:'Georgia, serif',fontSize:105,fontWeight:400,lineHeight:1.03,letterSpacing:-5,margin:'0 0 35px'};
 if(scene===0) return <AbsoluteFill style={{background:C.paper,color:C.ink,fontFamily:'Arial, sans-serif'}}>
  <Brand/>
  <div style={{position:'absolute',left:72,top:245,width:550,opacity:enter,transform:`translateY(${(1-enter)*18}px)`}}>
   <Tag>YOUR PROPERTY. ONE VIEW.</Tag><h1 style={titleStyle}>A hotel,<br/><i>in sync.</i></h1>
   <div style={{fontSize:27,lineHeight:1.5,color:C.quiet,maxWidth:455}}>Guest requests become<br/>a coordinated operating plan.</div>
   <div style={{borderTop:`1px solid ${C.line}`,width:390,marginTop:65,paddingTop:26,display:'flex',gap:38}}>
    <div><b style={{fontSize:45,fontWeight:400}}>36</b><div style={{fontSize:17,marginTop:8,color:C.quiet}}>rooms in view</div></div>
    <div><b style={{fontSize:45,fontWeight:400}}>01</b><div style={{fontSize:17,marginTop:8,color:C.quiet}}>connected workspace</div></div>
   </div>
  </div>
  <div style={{position:'absolute',left:665,top:128,width:1183,height:820,overflow:'hidden',borderRadius:6,boxShadow:'0 24px 70px #16382f18'}}>
   <ProductCrop region={[0,239,813,630]} width={1183} height={820} zoom={scaleLerp(1,1.055,blend(local,0,209))} focus={[.5,.49]}/>
  </div>
  <Footer chapter={1}/>
 </AbsoluteFill>;
 if(scene===1) return <AbsoluteFill style={{background:C.paper,color:C.ink,fontFamily:'Arial, sans-serif'}}>
  <Brand/>
  <div style={{position:'absolute',left:72,top:160}}><Tag>INTENT BEFORE ALLOCATION</Tag>
   <h1 style={{...titleStyle,fontSize:74,letterSpacing:-3}}>The difference is <i>in the request.</i></h1>
  </div>
  <div style={{position:'absolute',left:72,top:350,width:810,height:540,borderTop:`1px solid ${C.line}`,paddingTop:42}}>
   <div style={{fontSize:17,color:C.quiet,letterSpacing:1}}>ARIA / REQUIRED</div>
   <div style={{fontSize:44,lineHeight:1.25,margin:'23px 0 34px'}}>“A sea view is required.”</div>
   <div style={{display:'flex',alignItems:'center',gap:18,color:C.ink,fontSize:20}}><span style={{width:8,height:8,borderRadius:8,background:C.ink}}/>A condition the allocation must satisfy.</div>
   <div style={{marginTop:64,borderTop:`1px solid ${C.line}`,paddingTop:30,fontSize:17,color:C.quiet,letterSpacing:1}}>NOAH / PREFERRED</div>
   <div style={{fontSize:35,lineHeight:1.35,marginTop:20,maxWidth:760}}>“I prefer a sea view,<br/>but another view is fine.”</div>
  </div>
  <div style={{position:'absolute',right:72,top:350,width:850,height:560,overflow:'hidden',borderRadius:6,boxShadow:'0 18px 55px #16382f12',opacity:enter}}>
   <ProductCrop region={[837,257,354,222]} width={850} height={560} zoom={scaleLerp(1.02,1,blend(local,0,209))}/>
  </div>
  <div style={{position:'absolute',right:72,top:934,width:850,fontSize:18,color:C.quiet}}>Actual saved model interpretation and customer selection.</div>
  <Footer chapter={2}/>
 </AbsoluteFill>;
 return <AbsoluteFill style={{background:C.ink,color:C.paper,fontFamily:'Arial, sans-serif'}}>
  <Brand dark/>
  <div style={{position:'absolute',left:72,top:174,width:660,opacity:enter}}>
   <div style={{fontSize:17,letterSpacing:2,color:'#a7beb0',marginBottom:30}}>AFTER THE CUSTOMER CHOOSES</div>
   <h1 style={{...titleStyle,fontSize:86,letterSpacing:-3}}>One choice.<br/><i>A visible impact.</i></h1>
   <div style={{fontSize:26,lineHeight:1.5,maxWidth:555,color:'#c1cec3'}}>Breakfast demand updates.<br/>The ready room needs no extra cleaning.</div>
   <div style={{display:'flex',alignItems:'baseline',gap:30,marginTop:65}}>
    <span style={{fontSize:100,fontWeight:400,opacity:.45}}>2</span><span style={{fontSize:50,color:'#a7beb0'}}>→</span><span style={{fontSize:140,fontWeight:400}}>4</span><span style={{fontSize:25,color:'#c1cec3'}}>covers</span>
   </div>
   <div style={{fontSize:19,color:'#a7beb0'}}>November 2 · saved local plan</div>
  </div>
  <div style={{position:'absolute',left:825,top:165,width:1023,height:710,overflow:'hidden',borderRadius:6,background:C.paper}}>
   <ProductCrop region={[827,486,379,331]} width={1023} height={710} zoom={scaleLerp(1,1.035,blend(local,0,209))} focus={[.5,.70]}/>
  </div>
  <div style={{position:'absolute',left:825,top:912,fontSize:18,color:'#a7beb0'}}>Code-owned quantities. Existing reservations protected.</div>
  <Footer chapter={3} dark/>
 </AbsoluteFill>;
}

// Use with a real 16:9 recording; the sample study above uses labelled stills.
// Props example lives in assets/directed-footage.example.json.
export function DirectedFootage({source, keys=[], caption=''}) {
 const f=useCurrentFrame();
 const c=cameraAt(f, keys.length?keys:[{frame:0,scale:1,x:.5,y:.5}]);
 const w=1760,h=990;
 const tx=Math.min(0,Math.max(w-w*c.scale,w/2-w*c.x*c.scale));
 const ty=Math.min(0,Math.max(h-h*c.scale,h/2-h*c.y*c.scale));
 return <AbsoluteFill style={{background:C.paper,fontFamily:'Arial, sans-serif'}}>
  <div style={{position:'absolute',left:80,top:45,width:w,height:h,overflow:'hidden',borderRadius:8,boxShadow:'0 14px 45px #16382f18'}}>
   {source?<OffthreadVideo src={staticFile(source)} muted style={{width:w,height:h,objectFit:'contain',transformOrigin:'0 0',transform:`translate(${tx}px, ${ty}px) scale(${c.scale})`}}/>:<div style={{padding:80,fontSize:40,color:C.ink}}>Add an actual screen recording through composition props.</div>}
  </div>
  {caption&&<div style={{position:'absolute',bottom:70,left:130,padding:'12px 20px',background:C.ink,color:C.paper,fontSize:27}}>{caption}</div>}
 </AbsoluteFill>;
}
