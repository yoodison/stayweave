import React,{useEffect,useRef,useState} from 'react';
import {Maximize2,Minimize2,Plus,Minus,MessageCircle,Radio,Sun,Sunset,Navigation,ClipboardCheck} from 'lucide-react';
import * as THREE from 'three';
import {OrbitControls} from 'three/addons/controls/OrbitControls.js';
import PropertyBuilding from './PropertyBuilding.jsx';
import {roomTypes,statusMeta} from '../shared/hotel.js';
import {roomVisuals,scenePosition,hotelClock,roomSlot,statusGlyphs} from '../shared/scene.js';

import RoomStatusIcon from './RoomStatusIcon.jsx';
const roomPosition=r=>scenePosition(r,false);
const servicePoints={cleaning:[-9,1,4],linen:[-9,1,-3],breakfast:[8,1,0],team:[7,1,-4]};
const colors={room:'#b9c868',cleaning:'#369bad',linen:'#8171bd',breakfast:'#bd8b38',team:'#67874e'};
export default function Hotel3D(props){
  const mount=useRef(),runtime=useRef(),latest=useRef(props),labels=useRef({}),connector=useRef(),connectorDot=useRef();latest.current=props;
  const [failed,setFailed]=useState(false),[ready,setReady]=useState(false);
  const [lightMode,setLightMode]=useState('auto'),[hover,setHover]=useState(null);const lighting=useRef('day');lighting.current=lightMode==='auto'?hotelClock(props.now).phase:lightMode;
  const lightModeRef=useRef(lightMode);lightModeRef.current=lightMode;
  const signature=props.rooms.map(r=>`${r.id}:${r.type}:${r.view}`).join('|');
  useEffect(()=>{
    let renderer,frame,observer,disposed=false;const host=mount.current;if(!host)return;
    try{renderer=new THREE.WebGLRenderer({antialias:true,alpha:true,powerPreference:'high-performance'});}catch{setFailed(true);return;}
    renderer.setPixelRatio(Math.min(devicePixelRatio,2));renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFSoftShadowMap;renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.15;renderer.setClearColor('#dceef0',1);host.prepend(renderer.domElement);
    const scene=new THREE.Scene();scene.fog=new THREE.Fog('#dceef0',85,150);
    const camera=new THREE.PerspectiveCamera(37,1,.1,180);camera.position.set(30,27,40);
    const controls=new OrbitControls(camera,renderer.domElement);controls.target.set(0,11,0);controls.enableDamping=true;controls.dampingFactor=.08;controls.minDistance=13;controls.maxDistance=90;controls.maxPolarAngle=Math.PI*.49;controls.enablePan=false;
    const ambient=new THREE.HemisphereLight('#eefaff','#719ca1',2.6);scene.add(ambient);const sun=new THREE.DirectionalLight('#fff5de',3.5);sun.position.set(18,35,15);sun.castShadow=true;sun.shadow.mapSize.set(2048,2048);Object.assign(sun.shadow.camera,{left:-28,right:28,top:30,bottom:-24,near:1,far:100});sun.shadow.bias=-.00015;sun.shadow.normalBias=.035;sun.shadow.radius=2;scene.add(sun);
    const mats=new Map();const material=(color,opacity=1)=>{const key=color+opacity;if(!mats.has(key))mats.set(key,new THREE.MeshStandardMaterial({color,roughness:.72,metalness:.04,transparent:opacity<1,opacity,depthWrite:opacity===1}));return mats.get(key)};
    const boxGeometry=new THREE.BoxGeometry(1,1,1),sphereGeometry=new THREE.SphereGeometry(1,20,16);
    const box=(parent,x,y,z,w,h,d,color,opacity=1)=>{const m=new THREE.Mesh(boxGeometry,material(color,opacity));m.position.set(x,y,z);m.scale.set(w,h,d);m.castShadow=opacity===1;m.receiveShadow=true;parent.add(m);return m};
    const ball=(parent,x,y,z,r,color)=>{const m=new THREE.Mesh(sphereGeometry,material(color));m.position.set(x,y,z);m.scale.setScalar(r);m.castShadow=true;parent.add(m);return m};
    // Coastal diorama: water is an illustrative animated setting, not weather data.
    const seaGeometry=new THREE.PlaneGeometry(180,180,64,64);seaGeometry.rotateX(-Math.PI/2);
    const seaMaterial=new THREE.MeshStandardMaterial({color:'#62aebb',roughness:.38,metalness:.15});
    const sea=new THREE.Mesh(seaGeometry,seaMaterial);sea.position.y=-1.05;scene.add(sea);
    const beachShape=new THREE.Shape();beachShape.moveTo(-21,-16);beachShape.bezierCurveTo(-27,-7,-22,10,-16,15);beachShape.bezierCurveTo(-7,22,14,21,21,12);beachShape.bezierCurveTo(29,3,24,-13,14,-17);beachShape.bezierCurveTo(0,-21,-13,-20,-21,-16);
    const beach=new THREE.Mesh(new THREE.ShapeGeometry(beachShape,32),material('#ebdfbd'));beach.rotation.x=-Math.PI/2;beach.position.y=-.72;beach.receiveShadow=true;scene.add(beach);
    const surf=[];for(let j=0;j<7;j++){const pts=[];for(let i=0;i<45;i++){const x=-28+i*1.4;pts.push(new THREE.Vector3(x,-.75,23+j*4+Math.sin(x*.12+j)*1.1));}const line=new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts),new THREE.LineBasicMaterial({color:'#d3f0e8',transparent:true,opacity:.35}));scene.add(line);surf.push(line);}
    // Timber pier, beach loungers and palms give the hotel a real coastal context.
    box(scene,-9,-.3,21,2.2,.22,18,'#bca98a');for(let i=0;i<8;i++){box(scene,-9,-.12,13+i*2,2.3,.08,.08,'#d5c7a8');for(const x of [-10,-8])box(scene,x,-.45,13+i*2,.1,1.2,.1,'#a79176');}
    for(const x of [-3,3,9]){box(scene,x,-.4,17,1,.35,2,'#f1e5c9');box(scene,x+1.5,.7,17,.06,2.8,.06,'#af9976');const umbrella=new THREE.Mesh(new THREE.ConeGeometry(1.6,.6,16),material(x===3?'#d1a28d':'#eee5ce'));umbrella.position.set(x+1.5,2,17);scene.add(umbrella);}
    for(const [x,z] of [[-17,10],[17,10],[17,-7],[-16,-10]]){box(scene,x,1.3,z,.24,4.1,.24,'#ad9b78');for(let k=0;k<6;k++){const leaf=new THREE.Mesh(new THREE.SphereGeometry(1,8,4),material(k%2?'#7b9e78':'#91af7f'));leaf.scale.set(1.65,.1,.43);leaf.rotation.z=.3;leaf.rotation.y=k*Math.PI/3;leaf.position.set(x+Math.cos(k*Math.PI/3)*1.2,3.4,z-Math.sin(k*Math.PI/3)*1.2);scene.add(leaf);}}
    box(scene,0,-.45,0,34,.6,26,'#dbe4d2');box(scene,0,-.06,0,17,.3,13,'#e8e5db');
    box(scene,1,.15,8.2,6,.14,4,'#d9d7c8');box(scene,1,.23,9.3,5,.12,1.7,'#e6e2d5');
    for(let i=0;i<3;i++)box(scene,1,.06+i*.08,10.3-i*.7,5+i*.4,.15,.9,'#e6e2d5');
    // Ground-floor lobby, portico and three-dimensional service wings.
    box(scene,0,1.2,0,12,2.3,8,'#e7e6dc');box(scene,0,1.2,4.1,10,2.2,.1,'#9fbec0',.35);box(scene,0,2.5,5.8,7,.25,4,'#e9e2ce');
    [-3,3].forEach(x=>box(scene,x,1.2,6.8,.18,2.4,.18,'#a9ad9a'));
    box(scene,9,.05,6,6,.3,6,'#e3dac5');box(scene,9,.25,6,4.8,.12,4.8,'#9ac9cc');
    for(let i=0;i<3;i++){box(scene,8+i*.85,.33,6,.03,.025,4,'#d7ece5');box(scene,12.3,.55,4+i*1.8,.8,.3,1.3,'#ede5cc');}
    box(scene,-9,1,-3,4,2,4,'#d1d8ca');box(scene,-9,2.05,-3,4.3,.2,4.3,'#a7b8a0');
    box(scene,-9,.6,4,3,1.2,3,'#ddd9c8');for(let i=0;i<3;i++)box(scene,-10+i,.95,4,.7,.15,.8,'#f5f1e5');
    box(scene,8,.15,0,4,.25,4,'#e3d8bf');for(const z of [-1,1]){box(scene,8,.85,z,1.8,.12,1.2,'#e9e2cb');box(scene,8,.45,z,.12,.8,.12,'#8f9e87');box(scene,9.2,.5,z,.5,.9,.5,'#b3c2a1');}box(scene,8,1,-4,3,2,3,'#c5d4c6');box(scene,8,2.1,-4,3.3,.2,3.3,'#8ca58e');
    const trees=[];for(const [x,z] of [[-13,-8],[-13,7],[13,-8],[-5,10],[6,-9],[14,0]]){box(scene,x,.8,z,.2,1.8,.2,'#a49b7e');trees.push(ball(scene,x,2.1,z,1.1,'#a5bb8b'));ball(scene,x+.4,2.4,z,.65,'#b3c598');}
    const floors=[],rooms=[],shells=[],structures=[],pickables=[],roof=new THREE.Group();scene.add(roof);
    const roofY=24.1;box(roof,0,roofY,0,13.4,.35,9.8,'#e6e5d9');box(roof,-4,roofY+.45,-2,2,.7,2,'#adbcac');box(roof,2,roofY+.3,-2,4,.25,2,'#708c91');
    for(let level=1;level<=6;level++){
      const g=new THREE.Group();g.position.y=(level-1)*3.6+2.8;scene.add(g);floors.push(g);
      const structure=new THREE.Group();g.add(structure);structures.push(structure);
      box(structure,0,-.12,0,13,.22,9.5,'#e5e0d1');box(structure,0,.015,0,12,.05,1.65,'#c6d0b8');
      // Floor bands and structural columns give the cutaway a continuous building envelope.
      for(const x of [-6.4,6.4])for(const z of [-4.65,4.65])box(structure,x,1.45,z,.16,3.1,.16,'#b9c3b1');
      box(structure,-6.8,1.4,0,.8,3.1,2,'#a7beb0',.55);box(structure,-6.36,1.1,0,.06,2,1.2,'#dbe5db');
      for(const z of [-4.6,4.6]){shells.push(box(structure,0,1.4,z,12.7,2.8,.08,'#a8c4bf',.25));for(const x of [-6.2,-2.1,2.1,6.2])box(structure,x,1.4,z,.09,2.8,.09,'#839f92');box(structure,0,.15,z,13,.3,.2,'#c3cbbb');}
      shells.push(box(structure,6.4,1.4,0,.07,2.8,9.2,'#bed1c4',.25));
    }
      const textures={};for(const [state,paths] of Object.entries(statusGlyphs)){const c=document.createElement('canvas');c.width=c.height=128;const ctx=c.getContext('2d');ctx.fillStyle=roomVisuals[state].color;ctx.beginPath();ctx.roundRect(4,4,120,120,state==='ready'?60:24);ctx.fill();ctx.scale(4,4);ctx.translate(4,4);ctx.strokeStyle='#ffffff';ctx.lineWidth=1.9;ctx.lineCap='round';ctx.lineJoin='round';for(const d of paths)ctx.stroke(new Path2D(d));const texture=new THREE.CanvasTexture(c);texture.colorSpace=THREE.SRGBColorSpace;textures[state]=texture;}
    for(const r of latest.current.rooms){
      const [x,y,z]=scenePosition(r),g=new THREE.Group();g.position.set(x,0,z);floors[r.floor-1].add(g);
      const floorMat=new THREE.MeshStandardMaterial({color:statusMeta.ready.fill,roughness:.8});const tile=new THREE.Mesh(boxGeometry,floorMat);tile.position.set(0,.04,0);tile.scale.set(3.9,.12,3.55);tile.receiveShadow=true;g.add(tile);const statusBand=box(g,0,.19,1.77,3.9,.18,.1,'#408b69');statusBand.material=statusBand.material.clone();
      const partition=box(g,-1.99,1.2,0,.08,2.4,3.6,'#dce2d2');const backWall=box(g,0,1.1,-1.8,3.96,2.2,.09,'#e3e6dc');
      const sign=1;
      box(g,.75,1.5,-1.73,1.65,.95,.035,{sea:'#99cbdc',garden:'#afc99b',city:'#b4c0cd'}[r.view]);box(g,.75,1.5,-1.7,.045,.95,.04,'#f4f3ea');
      const bed=(bx,bz,w=1.4)=>{box(g,bx,.23,bz,w,.25,1.95,'#bbaa90');box(g,bx,.44,bz,w-.06,.2,1.9,'#fff9ea');box(g,bx,.55,bz+.35,w-.05,.03,1.12,{family:'#cdb58b',suite:'#b6a8c7',deluxe:'#9cbdba',twin:'#a0b6c3'}[r.type]||'#a8b990');box(g,bx,.59,bz-.62,w-.25,.12,.36,'#fffdf3');box(g,bx,.65,bz-1,w,.8,.08,'#b9b199');};
      if(r.type==='twin'){bed(-.85,0,1);bed(.65,0,1);}else if(r.type==='family'){bed(-.8,-.15,1.35);bed(.8,-.2,.7);box(g,.8,.35,1.2,.8,.5,.65,'#d5c4a4');}else{bed(-.45,0,1.75);if(r.type==='suite'){box(g,1.25,.43,.3,.65,.6,1.8,'#bbb1c6');box(g,1.2,.3,-1,.65,.45,.7,'#e5d8bf');}}
      // Lamps have flat shades and stems; people have faces, articulated limbs and uniforms.
      box(g,1.35,.38,-1.1,.6,.7,.6,'#b7ab90');box(g,1.35,.95,-1.1,.055,.5,.055,'#8c825d');
      const shade=new THREE.Mesh(new THREE.CylinderGeometry(.23,.32,.28,20),new THREE.MeshStandardMaterial({color:'#f5dba4',emissive:'#dfb35f',emissiveIntensity:.25}));shade.position.set(1.35,1.21,-1.1);g.add(shade);
      function person(worker){const person=new THREE.Group(),body=new THREE.Group();person.add(body);
        const shirt=worker?'#237fa8':'#bb7857';const head=ball(body,0,1.48,0,.22,'#d6b493');head.scale.set(.2,.24,.2);
        box(body,0,1.06,0,.43,.58,.29,shirt);box(body,0,.75,0,.4,.12,.28,worker?'#183e56':'#526c76');
        const arms=[];for(const sign of [-1,1]){const arm=new THREE.Group();arm.position.set(sign*.28,1.28,0);body.add(arm);box(arm,0,-.22,0,.12,.43,.14,shirt);ball(arm,0,-.48,0,.085,'#d6b493');arms.push(arm);}
        const legs=[];for(const sign of [-1,1]){const leg=new THREE.Group();leg.position.set(sign*.12,.71,0);body.add(leg);box(leg,0,-.25,0,.16,.48,.18,'#455967');box(leg,0,-.51,.06,.18,.12,.3,'#293b46');legs.push(leg);}
        box(body,-.075,1.5,.191,.035,.035,.025,'#33434a');box(body,.075,1.5,.191,.035,.035,.025,'#33434a');
        if(worker){box(body,0,1.06,.16,.31,.45,.035,'#eaf3e7');box(body,0,1.68,0,.44,.10,.43,'#f9fcf5');box(body,0,1.63,.22,.44,.035,.16,'#f9fcf5');}
        else {const hair=ball(body,0,1.63,-.02,.21,'#5b4d40');hair.scale.set(.22,.1,.21);}
        return {group:person,body,arms,legs};}
      const staff=person(true),guest=person(false);const actor=staff.group;g.add(actor);g.add(guest.group);
      const broom=new THREE.Group();staff.arms[1].add(broom);broom.position.set(0,-.43,.1);box(broom,0,-.2,0,.045,.85,.045,'#94785b');box(broom,0,-.64,0,.5,.12,.24,'#e1bb66');
      const cart=new THREE.Group();g.add(cart);cart.position.set(1.4,0,1);box(cart,0,.55,0,.62,.7,.5,'#508eab');box(cart,0,.95,0,.64,.08,.56,'#d1e6e9');for(const x of [-.21,.21]){const wheel=ball(cart,x,.15,.12,.12,'#354d5a');wheel.scale.z=.06;}box(cart,0,1.05,0,.48,.14,.4,'#fff8e4');
      const cleanSpark=new THREE.Group();g.add(cleanSpark);for(let i=0;i<3;i++){const star=box(cleanSpark,(i-1)*.55,.24,1.1,.08,.02,.3,'#e5fbff');box(star,0,0,0,3,.5,.25,'#e5fbff');}
      const repair=new THREE.Group();g.add(repair);for(const xx of [-1.5,1.5])box(repair,xx,1.1,1.7,.08,2.2,.08,'#bb9562');for(const yy of [.5,1.3,2.1])box(repair,0,yy,1.7,3.1,.07,.07,'#d9b176');for(let k=0;k<8;k++){const hazard=box(repair,-1.4+k*.4,.7,1.78,.3,1.05,.13,k%2?'#ed9d27':'#554539');hazard.rotation.z=-.22;}const clipboard=box(actor,-.38,1.05,.23,.3,.4,.06,'#e9e8cf');const dirtyLinen=box(g,1.3,.22,.8,.6,.3,.5,'#c6c0b3');dirtyLinen.material=dirtyLinen.material.clone();
      // Graphic state in the room: physical props plus the same symbols used by the HUD.

      const badge=new THREE.Sprite(new THREE.SpriteMaterial({map:textures.ready,depthTest:true,transparent:true}));badge.scale.set(1.15,1.15,1);badge.position.set(-1.15,1.4,1.9);g.add(badge);
      const arrival=new THREE.Group();g.add(arrival);arrival.position.set(1.1,.15,1.2);box(arrival,0,.38,0,.6,.72,.34,'#4fa8c4');box(arrival,0,.85,0,.3,.3,.06,'#325e72');box(arrival,0,.55,.19,.45,.06,.04,'#d8edf3');for(const xx of [-.2,.2])ball(arrival,xx,0,0,.085,'#334e5a');
      const waitingInspection=new THREE.Group();g.add(waitingInspection);box(waitingInspection,0,.67,1.7,2.8,.12,.12,'#9372bc');for(const xx of [-1.4,1.4])box(waitingInspection,xx,.45,1.7,.08,.9,.08,'#9372bc');
      const bubbles=new THREE.Group();g.add(bubbles);for(let i=0;i<5;i++)ball(bubbles,1+Math.sin(i)*.35,.4+i*.3,1,.09+i*.015,'#9ae9fb');
      const selectionFill=new THREE.Group();g.add(selectionFill);const fillMat=new THREE.MeshBasicMaterial({color:'#39c5e8',transparent:true,opacity:.18,depthWrite:false,depthTest:false,side:THREE.DoubleSide});
      for(const [x,y,z,w,h,d] of [[0,.15,0,3.9,.03,3.55],[-1.95,1.4,0,.025,2.7,3.55],[0,1.4,-1.77,3.9,2.7,.025]]){const plane=new THREE.Mesh(boxGeometry,fillMat);plane.position.set(x,y,z);plane.scale.set(w,h,d);plane.renderOrder=980;selectionFill.add(plane);}
      const selectionFrame=new THREE.Group();g.add(selectionFrame);for(const xx of [-2.01,2.01])for(const zz of [-1.87,1.87])box(selectionFrame,xx,1.48,zz,.065,2.9,.065,'#53d9f4');for(const yy of [.05,2.93]){for(const zz of [-1.87,1.87])box(selectionFrame,0,yy,zz,4.08,.065,.065,'#53d9f4');for(const xx of [-2.01,2.01])box(selectionFrame,xx,yy,0,.065,.065,3.8,'#53d9f4');}
      const ring=new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(4.06,2.9,3.74)),new THREE.LineBasicMaterial({color:'#f5fff0',transparent:true,opacity:1}));ring.position.y=1.48;g.add(ring);
      const hit=new THREE.Mesh(new THREE.BoxGeometry(3.96,2.85,3.6),new THREE.MeshBasicMaterial({visible:false}));hit.position.y=1.46;hit.userData.roomId=r.id;g.add(hit);pickables.push(hit);
      rooms.push({r,g,textures,badge,arrival,waitingInspection,bubbles,selectionFill,tile,statusBand,selectionFrame,ring,actor,staff,guest,broom,repair,clipboard,dirtyLinen,cart,cleanSpark,partition,backWall,shade,hit,labelPoint:new THREE.Vector3()});

    }
    const elevator=box(scene,-6.8,4,0,.7,1.7,1.7,'#cadbc8',.6);
    let route=null,routeKey='',dots=[];const clock=new THREE.Clock(),project=new THREE.Vector3();let prevFocus=null,prevCandidate=null,cameraDestination=null,hoverId=null;controls.addEventListener('start',()=>{cameraDestination=null});
    const raycaster=new THREE.Raycaster(),pointer=new THREE.Vector2();let down=null;
    function hitRoom(e){const rect=renderer.domElement.getBoundingClientRect();pointer.set((e.clientX-rect.left)/rect.width*2-1,-(e.clientY-rect.top)/rect.height*2+1);raycaster.setFromCamera(pointer,camera);return raycaster.intersectObjects(pickables.filter(m=>m.parent.parent.visible&&m.userData.enabled),false)[0]?.object.userData.roomId||null;}
    const move=e=>{if(e.buttons)return;const id=hitRoom(e);if(id!==hoverId){hoverId=id;setHover(id)}renderer.domElement.style.cursor=id?'pointer':'grab'};
    const pointerDown=e=>{down={x:e.clientX,y:e.clientY}};
    const pointerUp=e=>{if(down&&Math.hypot(e.clientX-down.x,e.clientY-down.y)<6){const id=hitRoom(e);if(id)latest.current.onSelect(id);}down=null;};
    const leave=()=>{hoverId=null;setHover(null)};
    renderer.domElement.addEventListener('pointermove',move);renderer.domElement.addEventListener('pointerdown',pointerDown);renderer.domElement.addEventListener('pointerup',pointerUp);renderer.domElement.addEventListener('pointerleave',leave);
    const resize=()=>{if(!host.clientWidth)return;renderer.setSize(host.clientWidth,host.clientHeight);camera.aspect=host.clientWidth/host.clientHeight;camera.updateProjectionMatrix()};observer=new ResizeObserver(resize);observer.observe(host);resize();
    runtime.current={zoom:factor=>{const offset=camera.position.clone().sub(controls.target).multiplyScalar(factor);offset.setLength(Math.max(controls.minDistance,Math.min(controls.maxDistance,offset.length())));camera.position.copy(controls.target).add(offset);cameraDestination=null},reset:()=>{const f=latest.current.floor,y=f==='all'?11:(Number(f)-1)*3.6+3.5;camera.position.set(f==='all'?30:20,f==='all'?27:y+12,f==='all'?40:26);controls.target.set(0,y,0);cameraDestination=null},turn:()=>{const offset=camera.position.clone().sub(controls.target);offset.applyAxisAngle(new THREE.Vector3(0,1,0),Math.PI/4);camera.position.copy(controls.target).add(offset)}};
    const reduced=matchMedia('(prefers-reduced-motion: reduce)');
    function draw(){if(disposed)return;frame=requestAnimationFrame(draw);const p=latest.current,t=clock.getElapsedTime(),animate=p.motion&&!reduced.matches,focused=p.floor==='all'?null:Number(p.floor),j=p.journey;
      const phase=lighting.current,night=phase==='night',evening=phase==='sunset';const sky=night?'#819bad':evening?'#e9c8ae':'#c6e5ed';renderer.setClearColor(sky);scene.fog.color.set(sky);sun.color.set(night?'#adc5e2':evening?'#ffd1a2':'#fff4df');sun.intensity=night?.65:evening?1.6:2.2;ambient.intensity=night?1.5:2.1;seaMaterial.color.set(night?'#4a7e96':evening?'#7dabb2':'#539dae');
      const hour=lightModeRef.current==='auto'?hotelClock(p.now).hour:night?22:evening?18:12,angle=(hour-6)/12*Math.PI;sun.position.set(Math.cos(angle)*28,Math.max(9,Math.sin(angle)*38),18);
      const seaVertices=seaGeometry.attributes.position;for(let i=0;i<seaVertices.count;i++){const x=seaVertices.getX(i),z=seaVertices.getZ(i);seaVertices.setY(i,Math.sin(x*.24+(animate?t*.6:0))*.13+Math.cos(z*.3+(animate?t*.45:0))*.1);}seaVertices.needsUpdate=true;surf.forEach((line,i)=>{line.position.z=animate?Math.sin(t*.35+i)*.7:0;line.material.opacity=.2+(animate?(Math.sin(t*.5+i)+1)*.08:.08)});
      if(prevFocus!==focused){const y=focused?(focused-1)*3.6+3.5:11;controls.target.y=y;if(focused)camera.position.set(20,y+12,p.selected&&Number(p.selected.slice(1))>3?-26:26);else camera.position.set(30,27,40);prevFocus=focused;}
      if(j?.roomId!==prevCandidate){prevCandidate=j?.roomId;if(j?.roomId){const candidate=p.rooms.find(r=>r.id===j.roomId);const sign=roomPosition(candidate)[2]>0?1:-1;cameraDestination=new THREE.Vector3(32,35,sign*38);}}
      if(cameraDestination&&!focused){if(animate)camera.position.lerp(cameraDestination,.055);else camera.position.copy(cameraDestination);if(camera.position.distanceTo(cameraDestination)<.05)cameraDestination=null;}
      controls.update();camera.updateMatrixWorld();
      floors.forEach((f,i)=>{f.visible=!focused||i+1===focused});structures.forEach(g=>g.visible=true);roof.visible=!focused;shells.forEach(m=>m.visible=true);elevator.visible=!focused;elevator.position.y=3+(animate?(Math.sin(t*.25)+1)*8:9);
      rooms.forEach(v=>{v.r=p.rooms.find(r=>r.id===v.r.id)||v.r;const state=p.roomStates[v.r.id]?.status||'ready',isCandidate=j?.roomId===v.r.id||(j?.roomIds?.includes(v.r.id)&&j?.oldRoomId!==v.r.id),isOld=j?.oldRoomId===v.r.id,selected=p.selected===v.r.id;
        const pos=scenePosition(v.r);v.g.position.set(pos[0],0,pos[2]);v.g.rotation.y=pos[2]<0?Math.PI:0;v.backWall.visible=false;v.partition.visible=false;
        const dim=(p.typeFilter!=='all'&&v.r.type!==p.typeFilter)||(p.statusFilter!=='all'&&state!==p.statusFilter);
        const visual=roomVisuals[state],hot=hoverId===v.r.id;v.statusBand.material.color.set(visual.color);v.statusBand.material.emissive.set(visual.color);v.statusBand.material.emissiveIntensity=.12;v.hit.userData.enabled=!dim;
        v.tile.material.color.set(selected?'#61d8e9':dim?'#d2d4cf':isCandidate?colors[j.stage]||colors.room:visual.floor);v.tile.material.emissive.set(selected||hot||isCandidate?visual.color:'#000000');v.tile.material.emissiveIntensity=selected?.3:hot?.2:isCandidate?.2:0;
        v.selectionFrame.visible=selected;v.selectionFill.visible=selected;v.badge.material.map=v.textures[state];v.badge.material.opacity=dim?.28:1;v.arrival.visible=state==='arriving';v.waitingInspection.visible=state==='inspection';v.bubbles.visible=state==='cleaning';v.bubbles.children.forEach((b,i)=>{b.position.y=.4+((i*.3+(animate?t*.55:0))%1.65);b.scale.setScalar(.09+i*.015)});v.badge.scale.setScalar(state==='cleaning'||state==='inspecting'?1.3:1.15);v.badge.material.rotation=state==='inspecting'&&animate?Math.sin(t*2)*.12:0;v.ring.visible=isCandidate||isOld||hot;v.ring.material.color.set(selected?'#fff9d6':isCandidate?'#b8db60':isOld?'#d29465':visual.color);
        const working=['cleaning','inspecting','construction','repair'].includes(state);v.actor.visible=working;v.guest.group.visible=state==='occupied';
        v.actor.scale.setScalar(1.1);v.actor.position.set(state==='cleaning'&&animate?.5+Math.sin(t*1.8)*.65:.6,0,.45);v.actor.rotation.y=state==='cleaning'?.4:0;
        v.staff.arms[1].rotation.x=state==='cleaning'&&animate?-.5+Math.sin(t*3)*.55:state==='inspecting'?-.55:0;v.staff.arms[0].rotation.x=state==='cleaning'&&animate?Math.sin(t*1.8)*.2:0;
        v.staff.legs.forEach((leg,i)=>leg.rotation.x=state==='cleaning'&&animate?Math.sin(t*1.8+i*Math.PI)*.18:0);
        v.broom.visible=state==='cleaning';v.cart.visible=state==='cleaning';v.cleanSpark.visible=state==='cleaning';v.cleanSpark.position.x=animate?Math.sin(t*1.8)*.65:0;v.cleanSpark.scale.setScalar(animate? .8+Math.sin(t*4)*.2:1);
        v.repair.visible=['construction','repair'].includes(state);v.clipboard.visible=state==='inspecting';v.dirtyLinen.visible=['dirty','cleaning'].includes(state);v.dirtyLinen.scale.set(state==='dirty'?1.4:.6,state==='dirty'?1.5:.3,state==='dirty'?1.4:.5);v.dirtyLinen.material.color.set('#c59161');
        const resting=night||Number(v.r.id)%2===0;v.guest.group.rotation.x=resting?-Math.PI/2:0;v.guest.group.scale.setScalar(resting?.78:.9);v.guest.group.position.set(resting?-.45:.65,resting?.7:.05,resting?.52:-.35);
        v.guest.arms.forEach(a=>a.rotation.x=resting?-.1:-.7);v.guest.legs.forEach(l=>l.rotation.x=resting?0:-Math.PI/2.5);v.shade.material.emissiveIntensity=night?1.1:evening?.6:.15;
        v.g.updateWorldMatrix(true,false);v.labelPoint.set(0,1.1,0).applyMatrix4(v.g.matrixWorld);
        if(selected&&connector.current&&labels.current[v.r.id]){project.copy(v.labelPoint).project(camera);const rect=host.getBoundingClientRect(),token=labels.current[v.r.id].getBoundingClientRect(),x=(project.x*.5+.5)*host.clientWidth,y=(-project.y*.5+.5)*host.clientHeight;connector.current.setAttribute('x1',String((token.left+token.right)/2-rect.left));connector.current.setAttribute('y1',String((token.top+token.bottom)/2-rect.top));connector.current.setAttribute('x2',String(x));connector.current.setAttribute('y2',String(y));connectorDot.current.setAttribute('cx',String(x));connectorDot.current.setAttribute('cy',String(y));}

      });
      const routeIds=j?.routeRoomIds||[j?.roomId];
      const key=j?.roomId&&routeIds.length&&['cleaning','linen','breakfast','team'].includes(j.stage)?`${routeIds.join(',')}:${j.stage}:building`:'';
      if(routeKey!==key){
        if(route){scene.remove(route);route.traverse(o=>{o.geometry?.dispose();o.material?.dispose()})}
        dots.forEach(d=>{scene.remove(d);d.material.dispose()});dots=[];route=null;routeKey=key;
        if(key){route=new THREE.Group();scene.add(route);for(const roomId of routeIds){const r=p.rooms.find(r=>r.id===roomId);if(!r)continue;
          const [x,y,z]=scenePosition(r),end=servicePoints[j.stage];
          const curve=new THREE.CatmullRomCurve3([new THREE.Vector3(x,y+.5,z),new THREE.Vector3(-7.5,y+.8,0),new THREE.Vector3(-7.5,1.5,0),new THREE.Vector3(...end)]);
          const path=new THREE.Mesh(new THREE.TubeGeometry(curve,60,.11,6,false),new THREE.MeshBasicMaterial({color:colors[j.stage],transparent:true,opacity:.9,depthTest:false}));path.renderOrder=990;route.add(path);
          for(let i=0;i<5;i++){const dot=ball(scene,0,0,0,.19,colors[j.stage]);dot.material=dot.material.clone();dot.material.depthTest=false;dot.renderOrder=991;dot.userData={curve,offset:i/5};dots.push(dot)}
        }}
      }
      dots.forEach(d=>d.position.copy(d.userData.curve.getPoint((d.userData.offset+(animate?t*.14:0))%1)));
      Object.entries(servicePoints).forEach(([id,pos])=>{const el=labels.current[id];if(el){project.set(...pos).project(camera);el.style.transform=`translate(-50%,-50%) translate(${(project.x*.5+.5)*host.clientWidth}px,${(-project.y*.5+.5)*host.clientHeight}px)`;el.style.display=focused||!j?.impact?'none':'';}});
      renderer.render(scene,camera);
    }
    draw();setReady(true);
    const lost=e=>{e.preventDefault();setFailed(true)};renderer.domElement.addEventListener('webglcontextlost',lost);
    return()=>{disposed=true;cancelAnimationFrame(frame);observer?.disconnect();controls.dispose();renderer.domElement.removeEventListener('pointermove',move);renderer.domElement.removeEventListener('pointerdown',pointerDown);renderer.domElement.removeEventListener('pointerup',pointerUp);renderer.domElement.removeEventListener('pointerleave',leave);scene.traverse(o=>{o.geometry?.dispose();if(o.material){(Array.isArray(o.material)?o.material:[o.material]).forEach(m=>m.dispose());}});Object.values(textures).forEach(t=>t.dispose());renderer.dispose();renderer.domElement.remove();runtime.current=null;};
  },[signature,failed]);
  if(failed)return <div className="sw-webgl-fallback"><p>3D isn’t available on this device. Showing the accessible cutaway.</p><PropertyBuilding {...props}/></div>;
  const j=props.journey;
  const hovered=props.rooms.find(r=>r.id===hover),visual=hovered?roomVisuals[props.roomStates[hover].status]:null;
  return <div className="sw-three-wrap sw-tycoon-scene assembled sw-building-hud" data-motion={props.motion}><div className="sw-three-controls"><button onClick={()=>runtime.current?.turn()} aria-label="Rotate building">↻</button><button onClick={()=>runtime.current?.reset()} aria-label="Reset camera">Reset</button><button className="sw-focus-toggle" aria-label={props.immersive?'Exit immersive mode':'Enter immersive mode'} onClick={props.onImmersive}>{props.immersive?<Minimize2 size={15}/>:<Maximize2 size={15}/>}</button></div><div className="sw-three-scene" ref={mount} role="group" aria-label="Interactive hotel. Click a room interior to select it. Drag to orbit.">{!ready&&<div className="sw-three-loading">Opening the hotel…</div>}<svg className="sw-selection-link" aria-hidden="true" style={{display:props.selected?'':'none'}}><line ref={connector}/><circle ref={connectorDot} r="5"/></svg>{['front','rear'].map(wing=><div className={`sw-facade-register ${wing}`} key={wing} aria-label={`${wing} rooms`}><header>{wing==='front'?'FRONT':'REAR'}<small>{wing==='front'?'01–03':'04–06'}</small></header>{[6,5,4,3,2,1].map(f=><div className={`sw-facade-floor ${props.floor!=='all'&&Number(props.floor)!==f?'muted-floor':''}`} key={f}><small>F{f}</small><div>{props.rooms.filter(r=>r.floor===f&&roomSlot(r).wing===wing).map(r=>{const state=props.roomStates[r.id].status,v=roomVisuals[state];return <button ref={el=>labels.current[r.id]=el} key={r.id} onMouseEnter={()=>setHover(r.id)} onMouseLeave={()=>setHover(null)} className={`sw-room-token state-${state} ${props.statusFilter!=='all'&&props.statusFilter!==state?'filtered-out':''} ${props.selected===r.id?'selected':''} ${j?.roomId===r.id||j?.roomIds?.includes(r.id)?'recommended':''}`} aria-label={`Room ${r.id}, ${roomTypes[r.type].label}, ${v.label}`} aria-pressed={props.selected===r.id} onClick={()=>props.onSelect(r.id)} style={{'--room-color':v.color,'--room-fill':v.floor}}><RoomStatusIcon status={state}/><strong>{r.id}</strong>{['cleaning','inspecting'].includes(state)&&<i className="sw-token-working"/>}</button>})}</div></div>)}</div>)}{Object.keys(servicePoints).map(id=><div key={id} ref={el=>labels.current[id]=el} className={`sw-3d-service ${j?.stage===id?'active':''}`}><i style={{background:colors[id]}}/>{({cleaning:'Housekeeping',linen:'Linen',breakfast:'Breakfast',team:'Team'})[id]}{j?.stage===id&&<strong>{j.caption}</strong>}</div>)}</div><div className="sw-visual-key" aria-label="Room status legend">{['ready','occupied','arriving','dirty','cleaning','inspection','inspecting','construction'].map(state=><span key={state} style={{color:roomVisuals[state].color}}><RoomStatusIcon status={state} size={18}/>{({ready:'Ready',occupied:'In house',arriving:'Arriving',dirty:'Clean pending',cleaning:'Cleaning',inspection:'Inspect pending',inspecting:'Inspecting',construction:'Off sale'})[state]}</span>)}</div><div className="sw-scene-context"><span>{hovered?<><b>Room {hovered.id} · {visual.label}</b> · {roomTypes[hovered.type].label} · click to open</>:'Click a room or its icon · all 36 rooms stay accessible'}</span><label>Light<select aria-label="Scene lighting" value={lightMode} onChange={e=>setLightMode(e.target.value)}><option value="auto">Live · KST</option><option value="day">Day preview</option><option value="sunset">Sunset preview</option><option value="night">Night preview</option></select></label><button aria-label="Zoom in" onClick={()=>runtime.current?.zoom(.85)}><Plus size={14}/></button><button aria-label="Zoom out" onClick={()=>runtime.current?.zoom(1.18)}><Minus size={14}/></button></div>{j?.impact&&<div className="sw-scene-impact"><div><span>{j.applied?'SAVED CHANGE':'PROPOSED CHANGE'}</span><b>{j.oldRoomId?`${j.oldRoomId} → ${j.roomId}`:j.roomIds?.length>1?j.roomIds.join(' · '):j.roomId}</b></div>{[['cleaning','Cleaning','min'],['linen','Fresh linen','sets'],['breakfast','Breakfast','covers'],['team','Team','min']].map(([id,label,unit])=>{const v=id==='breakfast'?(j.impact.breakfast.find(d=>d.date===j.breakfastDate)||j.impact.breakfast[0]):j.impact[id];return <div key={id} className={j.stage===id?'active':''}><span>{label}{id==='breakfast'&&v?` · ${v.date.slice(5)}`:''}</span><b>{v?`${v.before} → ${v.after}`:'No change'}</b><small>{unit}{id==='linen'?' available':id==='cleaning'||id==='team'?' scheduled':''}</small></div>})}</div>}<div>{j?.why&&<div className="sw-scene-agent-story" data-mode={j.mode}><strong>{j.mode==='live_presentation'?(j.applied?'Live · saved change':'Live · shared proposal'):j.mode==='presentation'?'Recorded demo':j.mode==='lifecycle'?'Guest response · agent replanned':j.mode==='coordination'?'Guest agents coordinating':j.mode==='coordinated_saved'?'Customer choices saved':j.mode==='superseded'?'Closed without applying':j.mode==='guest_selected'?'Guest selected':j.mode==='guest_proposal'?'Awaiting guest choice':j.mode==='automatic'?'Agent handled it':j.applied?'Owner approved':'Your decision needed'} · {j.incidentTitle}</strong><span>{j.why}</span></div>}</div><div className="sw-scene-disclaimer">Illustrative room poses & staff locations · recorded status, not live tracking</div></div>;
}
