import {Editorial, DirectedFootage} from './Editorial.jsx';
import React from 'react';
import {AbsoluteFill, Composition, OffthreadVideo, Audio, interpolate, registerRoot, staticFile, useCurrentFrame} from 'remotion';

const colors = {paper: '#f3f2e9', ink: '#183b35', green: '#287c65', muted: '#65766f'};
const stages = [
  ['01', 'Guest request', 'Needs, dates, preferences'],
  ['02', 'Model interprets', 'NVIDIA Nemotron · Nebius'],
  ['03', 'Code validates', 'Rooms, rights, resources'],
  ['04', 'Guest chooses', 'Explicit consent to terms'],
  ['05', 'Plans update', 'Rooms · linen · meals · team'],
];

function Flow() {
  const frame = useCurrentFrame();
  return <AbsoluteFill style={{background: colors.paper, color: colors.ink, padding: 100, fontFamily: 'Arial, sans-serif'}}>
    <div style={{fontSize: 28, letterSpacing: 5}}>STAYWEAVE / HOW IT WORKS</div>
    <h1 style={{fontSize: 78, lineHeight: 1.1, margin: '65px 0 25px'}}>One request.<br/>A coordinated hotel.</h1>
    <p style={{fontSize: 30, color: colors.muted}}>AI understands intent. Validated state drives operations.</p>
    <div style={{display: 'flex', gap: 18, marginTop: 70}}>
      {stages.map(([number, title, subtitle], i) => {
        const progress = interpolate(frame, [i * 30, i * 30 + 20], [0, 1], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'});
        return <div key={number} style={{flex: 1, height: 240, padding: 24, borderRadius: 22, background: progress > 0.5 ? colors.green : '#e0e5dc', color: progress > 0.5 ? 'white' : colors.ink, transform: `translateY(${(1-progress)*18}px)`, opacity: .45 + progress*.55}}>
          <div style={{fontSize: 24, opacity: .65}}>{number}</div>
          <div style={{fontSize: 33, fontWeight: 700, marginTop: 35}}>{title}</div>
          <div style={{fontSize: 22, lineHeight: 1.4, marginTop: 18}}>{subtitle}</div>
        </div>;
      })}
    </div>
    <div style={{position: 'absolute', bottom: 155, fontSize: 25, color: colors.muted}}>Architecture illustration · actual application footage follows</div>
  </AbsoluteFill>;
}

function FinalFilm({picture, narration, captions = [], testOnly = false}) {
  const time = useCurrentFrame() / 30;
  const caption = captions.find(c => time >= c.start && time < c.end);
  return <AbsoluteFill style={{background: '#101d1a', fontFamily: 'Arial, sans-serif'}}>
    <OffthreadVideo src={staticFile(picture)} muted style={{width: '100%', height: '100%', objectFit: 'contain'}}/>
    <Audio src={staticFile(narration)}/>
    {caption && <div style={{position: 'absolute', bottom: 45, left: '8%', width: '84%', display: 'flex', justifyContent: 'center'}}>
      <div style={{whiteSpace: 'pre-line', textAlign: 'center', background: 'rgba(10,25,22,.92)', color: 'white', fontSize: 38, lineHeight: 1.3, borderRadius: 12, padding: '14px 24px'}}>{caption.text}</div>
    </div>}
    {testOnly && <div style={{position: 'absolute', right: 35, top: 30, padding: 15, background: '#fff', color: '#183b35', fontSize: 24}}>PIPELINE TEST · SYNTHETIC AUDIO</div>}
  </AbsoluteFill>;
}

registerRoot(() => <>
  <Composition id="StayWeaveEditorial" component={Editorial} durationInFrames={630} fps={30} width={1920} height={1080}/>
  <Composition id="StayWeaveDirectedFootage" component={DirectedFootage} durationInFrames={300} fps={30} width={1920} height={1080} defaultProps={{source:null,keys:[],caption:'',durationFrames:300}} calculateMetadata={({props})=>({durationInFrames:props.durationFrames})}/>
  <Composition id="StayWeaveFlow" component={Flow} durationInFrames={240} fps={30} width={1920} height={1080}/>
  <Composition id="StayWeaveFinal" component={FinalFilm} durationInFrames={240} fps={30} width={1920} height={1080}
    defaultProps={{picture: 'picture.mp4', narration: 'voice.wav', captions: [], durationFrames: 240}}
    calculateMetadata={({props}) => ({durationInFrames: props.durationFrames})}/>
</>);
