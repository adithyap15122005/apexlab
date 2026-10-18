import { useEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { BoxGeometry, BufferGeometry, CanvasTexture, CatmullRomCurve3, CylinderGeometry, Float32BufferAttribute, Group, RepeatWrapping, SphereGeometry, SRGBColorSpace, TubeGeometry, Vector3 } from 'three'
import { sampleTelemetry } from '../../history/replay'
import type { ReplayClock, TelemetrySample } from '../../history/types'

/** Original, unlicensed-constructor geometry. Units are metres, forward is +Z. */
export function bodyGeometry(rings: [z:number,halfWidth:number,bottom:number,top:number][], topOpening?:[number,number]) {
  if(rings.length<2||rings.some(ring=>ring.some(value=>!Number.isFinite(value))||ring[1]<=0||ring[3]<=ring[2]))throw new Error('A body loft needs finite, non-degenerate cross sections.')
  const positions:number[]=[],indices:number[]=[]
  for(const [z,w,b,t] of rings)positions.push(-w,b,z,w,b,z,w*.9,t,z,-w*.9,t,z)
  for(let r=0;r<rings.length-1;r++)for(let side=0;side<4;side++){
    if(side===2&&topOpening&&rings[r][0]<topOpening[1]&&rings[r+1][0]>topOpening[0])continue
    const a=r*4+side,b=r*4+(side+1)%4,c=(r+1)*4+side,d=(r+1)*4+(side+1)%4;indices.push(a,b,c,b,d,c)
  }
  indices.push(0,2,1,0,3,2)
  const last=(rings.length-1)*4;indices.push(last,last+1,last+2,last,last+2,last+3)
  const geometry=new BufferGeometry();geometry.setAttribute('position',new Float32BufferAttribute(positions,3));geometry.setIndex(indices);geometry.computeVertexNormals();return geometry
}

export const FORMULA_DRIVER_EYE={height:.96,forwardOffset:-.43} as const
export function historicalLighting(circuit:string,raceName=''):'day'|'night'|'twilight'{
  const venue=`${circuit} ${raceName}`
  if(/yas marina|abu dhabi/i.test(venue))return 'twilight'
  return /singapore|marina bay|bahrain|sakhir|jeddah|saudi arab|las vegas|lusail|qatar/i.test(venue)?'night':'day'
}
/** A virtual camera pose; raw X/Y remain the provider's horizontal axes. */
export function cockpitCameraPose(origin:Vector3,rawHeading:number,meterScale:number,look:{yaw:number;pitch:number}){
  if(![origin.x,origin.y,origin.z,rawHeading,meterScale,look.yaw,look.pitch].every(Number.isFinite)||meterScale<=0)throw new Error('A cockpit camera requires a valid recorded position and positive scale.')
  const forward=new Vector3(Math.cos(rawHeading),0,-Math.sin(rawHeading))
  const position=origin.clone().addScaledVector(forward,FORMULA_DRIVER_EYE.forwardOffset*meterScale)
  position.y+=FORMULA_DRIVER_EYE.height*meterScale
  const direction=forward.clone().applyAxisAngle(new Vector3(0,1,0),look.yaw)
  direction.x*=Math.cos(look.pitch);direction.z*=Math.cos(look.pitch);direction.y=Math.sin(look.pitch)
  return {position,target:position.clone().addScaledVector(direction,meterScale*40)}
}

export type FormulaLivery={primary:string;secondary:string;accent:string;halo:string;suit:string;label:string}
/** Descriptive team-inspired paint; timing graphics colours are never full body paint. */
export function formulaTeamLivery(team:string,timingAccent='#97acb4'):FormulaLivery{
  const name=team.toLowerCase(),carbon='#13191e'
  if(name.includes('mercedes'))return {primary:'#252b30',secondary:'#b7c0c5',accent:'#00b9ab',halo:carbon,suit:'#d6dddf',label:'MERCEDES'}
  if(name.includes('ferrari'))return {primary:'#b71d2b',secondary:'#cc2530',accent:'#e9c34b',halo:carbon,suit:'#b9212d',label:'FERRARI'}
  if(name.includes('mclaren'))return {primary:'#e57c25',secondary:'#20262c',accent:'#e8953a',halo:carbon,suit:'#db7629',label:'MCLAREN'}
  if(name.includes('red bull'))return {primary:'#17243d',secondary:'#101a2d',accent:'#e4bc35',halo:carbon,suit:'#19263e',label:'RED BULL'}
  if(name.includes('aston'))return {primary:'#1d4d45',secondary:'#163b37',accent:'#c2d64d',halo:carbon,suit:'#234b43',label:'ASTON MARTIN'}
  if(name.includes('alpine')||name.includes('renault'))return {primary:'#17659c',secondary:'#172a3c',accent:'#d885ba',halo:carbon,suit:'#245679',label:'ALPINE'}
  if(name.includes('williams'))return {primary:'#205fa6',secondary:'#152b47',accent:'#7eaacf',halo:carbon,suit:'#274572',label:'WILLIAMS'}
  if(name.includes('haas'))return {primary:'#dadbd6',secondary:'#242a2e',accent:'#bc333a',halo:carbon,suit:'#d3d5d1',label:'HAAS'}
  if(name.includes('sauber')||name.includes('kick'))return {primary:'#242a28',secondary:'#1c2422',accent:'#57ba43',halo:carbon,suit:'#25342b',label:'SAUBER'}
  if(name.includes('alpha')||name==='rb'||name.includes('racing bulls'))return {primary:'#233b71',secondary:'#d1d6da',accent:'#b6c7df',halo:carbon,suit:'#253f6c',label:'RACING BULLS'}
  return {primary:'#333d46',secondary:'#b2bac0',accent:/^#[0-9a-f]{6}$/i.test(timingAccent)?timingAccent:'#a8b6c2',halo:carbon,suit:'#384450',label:team.toUpperCase()}
}
export type FormulaCarPart={geometry:BufferGeometry;offset:[number,number,number];rotation?:[number,number,number];color:string;paint?:'primary'|'secondary'|'accent';tyre?:boolean;helmet?:boolean;hideInside?:boolean}
/** Shared instanced exterior parts, in physical metres. No DOM, textures or network needed. */
export function createFormulaCarParts():FormulaCarPart[]{
  const body=bodyGeometry([[-2.2,.13,.13,.42],[-1.6,.39,.14,.69],[-.75,.32,.13,.69],[.15,.29,.12,.65],[.9,.24,.13,.42],[1.8,.12,.15,.25],[2.3,.08,.14,.18]],[-.8,.75])
  const sidepod=bodyGeometry([[-1.8,.15,.16,.35],[-1.1,.36,.16,.55],[.05,.35,.13,.57],[.7,.12,.14,.42]])
  const haloCurve=new CatmullRomCurve3([new Vector3(-.36,.82,-.76),new Vector3(-.37,1.03,-.4),new Vector3(-.3,1.07,.08),new Vector3(0,1.03,.42),new Vector3(.3,1.07,.08),new Vector3(.37,1.03,-.4),new Vector3(.36,.82,-.76)])
  const parts:FormulaCarPart[]=[
    {geometry:body,offset:[0,0,0],color:'#ffffff',paint:'primary'},{geometry:new BoxGeometry(1.55,.065,3.95),offset:[0,.13,-.2],color:'#161c21'},
    {geometry:sidepod,offset:[-.39,0,0],color:'#ffffff',paint:'secondary'},{geometry:sidepod.clone(),offset:[.39,0,0],color:'#ffffff',paint:'secondary'},
    {geometry:new BoxGeometry(1.9,.025,.27),offset:[0,.18,2.28],color:'#121a20'},{geometry:new BoxGeometry(1.85,.027,.16),offset:[0,.25,2.36],color:'#ffffff',paint:'secondary'},{geometry:new BoxGeometry(1.8,.025,.12),offset:[0,.31,2.39],color:'#151b22'},
    {geometry:new BoxGeometry(.017,.004,.916),offset:[0,.338,1.35],rotation:[.187,0,0],color:'#ffffff',paint:'accent'},
    {geometry:new BoxGeometry(1.08,.05,.34),offset:[0,.92,-2.14],color:'#ffffff',paint:'primary'},{geometry:new BoxGeometry(1.08,.04,.2),offset:[0,1.04,-2.19],color:'#141b20'},
    {geometry:new BoxGeometry(.3,.4,.7),offset:[0,.82,-.98],color:'#ffffff',paint:'primary'},{geometry:new CylinderGeometry(.23,.25,.22,16),offset:[0,.71,-.39],color:'#20272c',hideInside:true},{geometry:new SphereGeometry(.16,12,10),offset:[0,.87,-.4],color:'#e8e7d9',helmet:true},{geometry:new TubeGeometry(haloCurve,20,.035,5,false),offset:[0,0,0],color:'#151a1e',hideInside:true},
  ]
  for(const side of [-1,1]){
    parts.push({geometry:new BoxGeometry(.035,.31,.38),offset:[side*.94,.29,2.3],color:'#ffffff',paint:'primary'},{geometry:new BoxGeometry(.04,.48,.54),offset:[side*.55,.86,-2.13],color:'#ffffff',paint:'primary'},{geometry:new BoxGeometry(.035,.18,.24),offset:[side*.56,.72,.27],color:'#ffffff',paint:'primary'},{geometry:new BoxGeometry(.04,.025,.36),offset:[side*.44,.62,.27],rotation:[0,0,side*-.2],color:'#1b2329'})
    const trim=new CatmullRomCurve3([new Vector3(side*.72,.50,-1.05),new Vector3(side*.71,.54,-.45),new Vector3(side*.69,.55,.03),new Vector3(side*.55,.40,.5)])
    parts.push({geometry:new TubeGeometry(trim,15,.006,4,false),offset:[0,0,0],color:'#ffffff',paint:'accent'})
    for(const z of [-1.55,1.52]){
      parts.push({geometry:new CylinderGeometry(.36,.36,z<0?.43:.35,24),offset:[side*.79,.36,z],rotation:[0,0,Math.PI/2],color:'#101315'},{geometry:new CylinderGeometry(.185,.185,z<0?.44:.36,14),offset:[side*.79,.36,z],rotation:[0,0,Math.PI/2],color:'#40454a'},{geometry:new CylinderGeometry(.28,.28,.006,24,1,true),offset:[side*(z<0?1.01:.97),.36,z],rotation:[0,0,Math.PI/2],color:'#edcf67',tyre:true})
      for(const y of [.22,.47])parts.push({geometry:new BoxGeometry(.73,.025,.035),offset:[side*.43,y,z],rotation:[0,side*.25,side*.13],color:'#1c2227'})
    }
  }
  return parts
}

export function Strut({from,to,radius=.018,color='#181d22'}:{from:[number,number,number];to:[number,number,number];radius?:number;color?:string}) {
  const a=new Vector3(...from),b=new Vector3(...to),center=a.clone().add(b).multiplyScalar(.5)
  const direction=b.clone().sub(a),rotation=new Group().quaternion.setFromUnitVectors(new Vector3(0,1,0),direction.clone().normalize())
  return <mesh position={center} quaternion={rotation}><cylinderGeometry args={[radius,radius,direction.length(),6]}/><meshStandardMaterial color={color} metalness={.45} roughness={.4}/></mesh>
}

export function Halo({color='#20252b',accent}:{color?:string;accent?:string}) {
  const curve=useMemo(()=>new CatmullRomCurve3([new Vector3(-.36,.82,-.76),new Vector3(-.37,1.03,-.4),new Vector3(-.3,1.07,.08),new Vector3(0,1.03,.42),new Vector3(.3,1.07,.08),new Vector3(.37,1.03,-.4),new Vector3(.36,.82,-.76)],false,'centripetal'),[])
  const trim=useMemo(()=>new CatmullRomCurve3(curve.getPoints(32).map(point=>point.add(new Vector3(0,.034,0)))),[curve])
  return <group><mesh><tubeGeometry args={[curve,42,.035,7,false]}/><meshStandardMaterial color={color} metalness={.25} roughness={.55}/></mesh>{accent&&<mesh><tubeGeometry args={[trim,42,.003,4,false]}/><meshStandardMaterial color={accent} metalness={.35} roughness={.4}/></mesh>}<Strut from={[0,.5,.75]} to={[0,1.03,.42]} radius={.035} color={color}/></group>
}

function makeDisplay(){const canvas=document.createElement('canvas');canvas.width=512;canvas.height=320;const texture=new CanvasTexture(canvas);texture.colorSpace=SRGBColorSpace;return {canvas,texture}}
function carbonWeave(){
  const canvas=document.createElement('canvas');canvas.width=canvas.height=64;const context=canvas.getContext('2d')!
  context.fillStyle='#20262b';context.fillRect(0,0,64,64)
  for(let y=0;y<64;y+=8)for(let x=0;x<64;x+=8){const horizontal=(x/8+y/8)%2===0;context.fillStyle=horizontal?'#30383d':'#252d33';context.fillRect(x,y,7,7);context.strokeStyle=horizontal?'#3a4247':'#343c42';context.lineWidth=.55;for(let i=1;i<7;i+=2){context.beginPath();context.moveTo(x+(horizontal?0:i),y+(horizontal?i:0));context.lineTo(x+(horizontal?7:i),y+(horizontal?i:7));context.stroke()}}
  const texture=new CanvasTexture(canvas);texture.colorSpace=SRGBColorSpace;texture.wrapS=texture.wrapT=RepeatWrapping;texture.repeat.set(7,7);texture.anisotropy=4;return texture
}
export function CockpitInterior({color,team='',number,clockRef,telemetry}:{color:string;team?:string;number:number;clockRef:React.MutableRefObject<ReplayClock>;telemetry:TelemetrySample[]}){
  const wheel=useRef<Group>(null)
  const screen=useMemo(makeDisplay,[])
  const weave=useMemo(carbonWeave,[]),palette=useMemo(()=>formulaTeamLivery(team,color),[team,color])
  const rails=useMemo(()=>[-1,1].map(side=>new CatmullRomCurve3([new Vector3(side*.34,.78,-.72),new Vector3(side*.35,.81,-.2),new Vector3(side*.32,.78,.25)])),[])
  const updated=useRef(-Infinity)
  useEffect(()=>()=>{screen.texture.dispose();weave.dispose()},[screen,weave])
  useEffect(()=>{updated.current=-Infinity},[number,telemetry,palette])
  useFrame(()=>{
    const time=clockRef.current.current
    if(Math.abs(time-updated.current)<.12)return
    updated.current=time
    const sample=sampleTelemetry(telemetry,time)
    const data=sample&&sample.sampleAge<=3?sample:null
    const context=screen.canvas.getContext('2d')!
    context.fillStyle='#080e12';context.fillRect(0,0,512,320)
    context.fillStyle=palette.accent;context.fillRect(0,0,512,5)
    context.font='18px monospace';context.fillText(`${palette.label.slice(0,14)} / ${String(number).padStart(2,'0')}`,20,34)
    context.fillStyle='#ebf8eb';context.textAlign='center';context.font='bold 137px monospace';context.fillText(data?.gear==null?'—':`${data.gear}`,254,178)
    context.font='bold 31px monospace';context.fillText(data?.speed==null?'— km/h':`${data.speed.toFixed(0)} km/h`,254,231)
    context.font='17px monospace';context.fillStyle='#8bb3ae';context.fillText(data?.rpm==null?'RECORDED DATA UNAVAILABLE':`${data.rpm.toFixed(0)} RPM · RECORDED`,254,273)
    context.textAlign='left'
    for(const [x,label,value,colorValue] of [[24,'THR',data?.throttle,'#8bd873'],[446,'BRK',data?.brake,'#ef7266']] as const){context.font='15px monospace';context.fillStyle='#7d9a9d';context.fillText(label,x-3,66);context.fillStyle='#233139';context.fillRect(x,80,25,131);if(value!=null){const height=Math.max(0,Math.min(100,value))*1.31;context.fillStyle=colorValue;context.fillRect(x,211-height,25,height)}context.fillStyle='#c6dcd9';context.font='13px monospace';context.fillText(value==null?'—':`${value.toFixed(0)}%`,x-3,235)}
    context.textAlign='right';context.fillStyle='#a4c6bc';context.font='16px monospace';context.fillText(data?.drs==null?'DRS —':`DRS ${data.drs}`,491,34);context.textAlign='left'
    for(let i=0;i<15;i++){context.fillStyle=data?.rpm!=null&&i<data.rpm/1000?i>11?'#c7a8ff':i>7?'#5fcaf0':'#a3e864':'#233139';context.beginPath();context.roundRect(15+i*32.3,292,24,12,4);context.fill()}
    screen.texture.needsUpdate=true
  })
  const carbon=<meshPhysicalMaterial color="#8a9299" map={weave} metalness={.25} roughness={.48} clearcoat={.45} clearcoatRoughness={.3}/>
  return <group>
    {/* The sculpted tub and head restraints enclose the driver's eye position. */}
    {[-1,1].map(side=><group key={side}>
      <mesh position={[side*.34,.62,-.25]} rotation={[0,0,side*-.12]}><boxGeometry args={[.16,.31,1.12]}/>{carbon}</mesh>
      <mesh position={[side*.29,.84,-.57]} rotation={[0,0,side*-.12]}><boxGeometry args={[.13,.19,.38]}/><meshStandardMaterial color="#1b2024" roughness={.92}/></mesh>
      <mesh><tubeGeometry args={[rails[side<0?0:1],30,.046,8,false]}/>{carbon}</mesh>
    </group>)}
    <mesh position={[0,.29,-.28]} rotation={[-.12,0,0]}><boxGeometry args={[.47,.08,.8]}/><meshStandardMaterial color="#070b0e" roughness={.96}/></mesh>
    <mesh position={[0,.57,-.77]} rotation={[-.24,0,0]}><boxGeometry args={[.48,.6,.13]}/><meshStandardMaterial color="#151a1d" roughness={.93}/></mesh>
    <Halo color={palette.halo} accent={palette.accent}/>
    {[-1,1].map(side=><group key={`mirror-${side}`} position={[side*.56,.72,.27]}>
      <mesh><boxGeometry args={[.1,.15,.25]}/><meshStandardMaterial color={palette.primary} metalness={.45} roughness={.28}/></mesh>
      <mesh position={[0,.077,0]}><boxGeometry args={[.1,.004,.25]}/><meshStandardMaterial color={palette.accent} metalness={.4} roughness={.3}/></mesh>
      <mesh position={[0,0,-.128]} rotation={[0,Math.PI,0]}><planeGeometry args={[.075,.12]}/><meshStandardMaterial color="#a1bed0" metalness={1} roughness={.1} envMapIntensity={1.1}/></mesh>
    </group>)}
    <Strut from={[0,.38,.44]} to={[0,.60,.18]} radius={.028}/>
    <group ref={wheel} position={[0,.64,.19]} rotation={[.42,Math.PI,0]}>
      <mesh><boxGeometry args={[.48,.24,.045]}/>{carbon}</mesh>
      <mesh position={[0,.075,.028]}><planeGeometry args={[.255,.16]}/><meshBasicMaterial map={screen.texture} toneMapped={false}/></mesh>
      {[-1,1].map(side=><group key={side}>
        <mesh position={[side*.24,-.015,0]} rotation={[0,0,side*-.15]}><capsuleGeometry args={[.037,.16,4,10]}/><meshStandardMaterial color="#282d2d" roughness={.92}/></mesh>
        {[0,1,2].map(row=><mesh key={row} position={[side*(.17-row*.014),.061-row*.059,.031]} rotation={[Math.PI/2,0,0]}><cylinderGeometry args={[.015,.015,.012,12]}/><meshStandardMaterial color={['#cf4541','#4fbdba','#d5ba42'][row]} roughness={.4}/></mesh>)}
        <mesh position={[side*.087,-.074,.03]} rotation={[Math.PI/2,0,0]}><cylinderGeometry args={[.033,.033,.021,14]}/><meshStandardMaterial color={side<0?'#e3d550':'#71b5db'} metalness={.4} roughness={.35}/></mesh>
        <mesh position={[side*.2,.025,-.04]}><boxGeometry args={[.1,.15,.014]}/><meshStandardMaterial color="#333a3e" metalness={.8} roughness={.3}/></mesh>
      </group>)}
    </group>
    {/* A restrained, original driver suit is visible when looking down. */}
    {[-1,1].map(side=><mesh key={side} position={[side*.13,.37,-.09]} rotation={[Math.PI/2-.14,0,side*.1]}><capsuleGeometry args={[.1,.4,4,10]}/><meshStandardMaterial color={palette.suit} roughness={.82}/></mesh>)}
  </group>
}
