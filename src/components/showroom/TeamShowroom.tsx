import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { ArrowDown, ArrowLeft, ArrowRight, ArrowUp, ArrowUpRight, Camera, ChevronRight, CircleGauge, Expand, Eye, RotateCcw, Scan } from 'lucide-react'
import { PerspectiveCamera, Vector3 } from 'three'
import SceneFrame from '../three/SceneFrame'
import RaceCar, { type CarVariant } from '../three/RaceCar'
import { getDriverPortrait } from '../../history/people'
import './TeamShowroom.css'

type ShowroomView='exterior'|'driver'|'cockpit'|'aero'
type Driver={code:string;name:string;number:number}
type TeamCar={id:CarVariant;name:string;short:string;car:string;accent:string;body:string;secondary:string;description:string;source:string;drivers:Driver[]}
export const SHOWROOM_CARS:TeamCar[]=[
 {id:'mercedes',name:'Mercedes-AMG PETRONAS',short:'Mercedes',car:'W15',accent:'#27f4d2',body:'#20282c',secondary:'#c0c6c8',description:'Silver, black and turquoise. Explore the open cockpit, halo, front wing and carbon floor of our W15-inspired reconstruction.',source:'https://www.mercedesamgf1.com/car/2024',drivers:[{code:'HAM',name:'Lewis Hamilton',number:44},{code:'RUS',name:'George Russell',number:63}]},
 {id:'ferrari',name:'Scuderia Ferrari',short:'Ferrari',car:'SF-24',accent:'#ffce50',body:'#d20c25',secondary:'#f2f1e9',description:'Maranello red, a sculpted sidepod and a yellow accent. Get close to the steering wheel and the low, open driving position.',source:'https://www.ferrari.com/en-CA/formula1/year-2024',drivers:[{code:'LEC',name:'Charles Leclerc',number:16},{code:'SAI',name:'Carlos Sainz',number:55}]},
 {id:'mclaren',name:'McLaren Formula 1 Team',short:'McLaren',car:'MCL38',accent:'#ff8000',body:'#ee7100',secondary:'#171d21',description:'Papaya and anthracite, downwash sidepods and exposed suspension. Inspect the details from every angle before stepping inside.',source:'https://www.mclaren.com/racing/formula-1/2024/mclaren-formula-1-team-reveals-the-mcl38/',drivers:[{code:'NOR',name:'Lando Norris',number:4},{code:'PIA',name:'Oscar Piastri',number:81}]},
 {id:'redbull',name:'Oracle Red Bull Racing',short:'Red Bull',car:'RB20',accent:'#ffd238',body:'#112351',secondary:'#e52a39',description:'Midnight blue and a yellow nose accent. Look around from the driver’s seat, then inspect the wings and wheel assemblies.',source:'https://www.redbullracing.com/int-en/cars/rb20',drivers:[{code:'VER',name:'Max Verstappen',number:1},{code:'PER',name:'Sergio Pérez',number:11}]},
]
const views:{id:ShowroomView;label:string;icon:typeof Eye}[]=[{id:'exterior',label:'Exterior',icon:Scan},{id:'driver',label:'Driver’s seat',icon:Eye},{id:'cockpit',label:'Cockpit detail',icon:CircleGauge},{id:'aero',label:'Aero detail',icon:Camera}]
const target:[number,number,number]=[0,.55,0]
const exteriorCamera:[number,number,number]=[6.7,3.3,6.7]
function CarIllustration({car}:{car:TeamCar}){
 return <svg viewBox="0 0 350 130" aria-hidden="true"><ellipse cx="172" cy="109" rx="143" ry="8" fill="#000" opacity=".34"/><g transform="translate(6 4)"><path d="M26 99h285v-8h-48l-18-27-61-15-62 7-25 24-66 6z" fill={car.body}/><path d="m99 80 35-24 22-2 19 22 61-6 15 16-128 8z" fill={car.body} stroke={car.accent} strokeWidth="2"/><path d="m154 55 8-14 28 0 18 31" fill="none" stroke={car.accent} strokeWidth="4"/><path d="M38 66v32M25 65h44M263 94h50" stroke={car.accent} strokeWidth="6"/><path d="m156 62 6-14 31 3 12 17" fill="none" stroke="#95a2a3" strokeWidth="4"/>{[81,252].map(x=><g key={x}><circle cx={x} cy="87" r="26" fill="#101416"/><circle cx={x} cy="87" r="20" fill="none" stroke="#f2d64b" strokeWidth="2"/><circle cx={x} cy="87" r="13" fill="#414b50"/><circle cx={x} cy="87" r="5" fill="#94a0a3"/></g>)}</g></svg>
}
function ShowroomCamera({view,yaw,pitch}:{view:ShowroomView;yaw:number;pitch:number}){
 const {camera,gl,invalidate}=useThree()
 const previous=useRef<ShowroomView|null>(null)
 const look=useMemo(()=>new Vector3(),[])
 useEffect(()=>{invalidate()},[view,yaw,pitch,invalidate])
 useFrame(()=>{
  const perspective=camera as PerspectiveCamera
  if(view==='exterior'){
   if(previous.current!==view){camera.position.set(...exteriorCamera);camera.lookAt(...target);perspective.fov=37;perspective.near=.1;perspective.updateProjectionMatrix()}
  }else if(view==='aero'){
   camera.position.set(3.4,1.8,2.7);camera.lookAt(1.45,.4,0);perspective.fov=40;perspective.near=.05;perspective.updateProjectionMatrix()
  }else{
   const detail=view==='cockpit'
   camera.position.set(detail?-.29:-.19,detail?1.01:1.035,detail?.12:0)
   const angle=detail?-.42+pitch:pitch-.035
   look.set(Math.cos(yaw)*Math.cos(angle),Math.sin(angle),Math.sin(yaw)*Math.cos(angle)).add(camera.position)
   camera.lookAt(look);perspective.fov=detail?62:74;perspective.near=.025;perspective.updateProjectionMatrix()
  }
  previous.current=view
 })
 useEffect(()=>{gl.domElement.style.touchAction=view==='driver'||view==='cockpit'?'none':'pan-y';return()=>{gl.domElement.style.touchAction='pan-y'}},[view,gl])
 return null
}
function DragLook({inside,onLook}:{inside:boolean;onLook:(x:number,y:number)=>void}){
 const {gl}=useThree()
 const drag=useRef<{x:number;y:number}|null>(null)
 const callback=useRef(onLook);callback.current=onLook
 useEffect(()=>{
  if(!inside)return
  const node=gl.domElement
  const down=(event:PointerEvent)=>{drag.current={x:event.clientX,y:event.clientY};node.setPointerCapture(event.pointerId)}
  const move=(event:PointerEvent)=>{if(!drag.current)return;callback.current((event.clientX-drag.current.x)*.005,(event.clientY-drag.current.y)*.004);drag.current={x:event.clientX,y:event.clientY}}
  const up=()=>{drag.current=null}
  node.addEventListener('pointerdown',down);node.addEventListener('pointermove',move);node.addEventListener('pointerup',up);node.addEventListener('pointercancel',up)
  return()=>{node.removeEventListener('pointerdown',down);node.removeEventListener('pointermove',move);node.removeEventListener('pointerup',up);node.removeEventListener('pointercancel',up);drag.current=null}
 },[gl,inside])
 return null
}
function Studio({car,driver,view,yaw,pitch,onLook}:{car:TeamCar;driver:Driver;view:ShowroomView;yaw:number;pitch:number;onLook:(x:number,y:number)=>void}){
 return <>
  <color attach="background" args={['#0a0f13']}/><fog attach="fog" args={['#0a0f13',12,35]}/>
  <ShowroomCamera view={view} yaw={yaw} pitch={pitch}/><DragLook inside={view==='driver'||view==='cockpit'} onLook={onLook}/>
  <directionalLight position={[-3,5,3]} color="#bcdfff" intensity={2.3}/><pointLight position={[2,2,-3]} color={car.accent} intensity={14} distance={12}/>
  <RaceCar key={car.id} variant={car.id} bodyColor={car.body} secondaryColor={car.secondary} accent={car.accent} driverNumber={driver.number} teamName={car.short} compound="medium"/>
  <mesh position={[0,-.05,0]} rotation={[-Math.PI/2,0,0]}><circleGeometry args={[12,80]}/><meshStandardMaterial color="#151d22" roughness={.24} metalness={.65}/></mesh>
  <mesh position={[0,-.034,0]} rotation={[-Math.PI/2,0,0]}><ringGeometry args={[3.9,3.91,100]}/><meshBasicMaterial color={car.accent} transparent opacity={.45}/></mesh>
  <gridHelper args={[24,48,'#283640','#182128']} position={[0,-.025,0]}/>
  {[-1,1].map(side=><mesh key={side} position={[-2,2.5,side*4]}><boxGeometry args={[.06,4,.06]}/><meshBasicMaterial color={side===1?car.accent:'#c5e9ee'}/></mesh>)}
 </>
}
function DriverPhoto({driver}:{driver:Driver}){
 const portrait=getDriverPortrait(driver.code)
 const [failed,setFailed]=useState(false)
 return portrait&&!failed?<img src={portrait.url} alt={driver.name} loading="lazy" onError={()=>setFailed(true)}/>:<span className="showroom-photo-fallback">{driver.code}</span>
}
export default function TeamShowroom({onExploreRaces}:{onExploreRaces:()=>void}){
 const [selected,setSelected]=useState(0),[driverIndex,setDriverIndex]=useState(0),[view,setView]=useState<ShowroomView>('exterior')
 const [look,setLook]=useState({yaw:0,pitch:0}),[expanded,setExpanded]=useState(false)
 const stage=useRef<HTMLDivElement>(null)
 const car=SHOWROOM_CARS[selected],driver=car.drivers[driverIndex],inside=view==='driver'||view==='cockpit'
 const shiftLook=(x:number,y:number)=>setLook(old=>({yaw:Math.max(-1.35,Math.min(1.35,old.yaw-x)),pitch:Math.max(-.45,Math.min(.50,old.pitch+y))}))
 const selectCar=(index:number)=>{setSelected(index);setDriverIndex(0);setLook({yaw:0,pitch:0})}
 const selectView=(next:ShowroomView)=>{setView(next);setLook({yaw:0,pitch:0});if(window.matchMedia('(max-width:760px)').matches)stage.current?.scrollIntoView({behavior:'auto',block:'start'})}
 return <section id="the-garage" className="team-showroom" style={{'--team-color':car.accent} as CSSProperties} aria-labelledby="showroom-heading">
  <div className="showroom-section-heading"><div><span className="eyebrow">THE GARAGE / FOUR TEAMS. FOUR PERSPECTIVES.</span><h2 id="showroom-heading">Get closer.<br/><span>Then get inside.</span></h2></div><p>Pick a 2024 car. Explore its details in 3D, sit behind the wheel, and meet the people who raced it.</p></div>
  <div className="showroom-team-tabs" role="group" aria-label="Choose a 2024 team car">
   {SHOWROOM_CARS.map((item,index)=><button key={item.id} className={selected===index?'is-selected':''} style={{'--car-accent':item.accent} as CSSProperties} aria-pressed={selected===index} onClick={()=>selectCar(index)}><span className="showroom-card-meta"><b>{item.short}</b><span>2024</span></span><CarIllustration car={item}/><span className="showroom-card-bottom"><strong>{item.car}</strong><span>{selected===index?'IN THE STUDIO':'EXPLORE CAR'} <ArrowUpRight size={12}/></span></span></button>)}
  </div>
  <div className={`showroom-main ${expanded?'showroom-expanded':''}`}>
   <div className="showroom-stage" ref={stage}>
    <div className="showroom-stage-title" aria-hidden="true"><span>2024</span><b>{car.car}</b></div>
    <SceneFrame label={`${car.name} ${car.car} reconstruction`} className={`showroom-canvas ${inside?'showroom-inside':''}`} camera={exteriorCamera} target={target} animated={false} motionControl={false} interactive={view==='exterior'} fallback={<div className="showroom-fallback"><CarIllustration car={car}/><p>{car.short} {car.car} · {driver.name} #{driver.number}</p><span>3D requires a WebGL browser. Choose any team and explore the driver and car details below.</span></div>}>
     {()=> <Studio car={car} driver={driver} view={view} yaw={look.yaw} pitch={look.pitch} onLook={shiftLook}/>}
    </SceneFrame>
    {inside&&<div className="showroom-driver-viewbar"><span>{driver.code} / {view==='cockpit'?'COCKPIT DETAIL':'DRIVER’S SEAT'}<small>DRAG TO LOOK AROUND</small></span><button onClick={()=>selectView('exterior')}>Exit cockpit <ArrowUpRight size={12}/></button></div>}
    <div className="showroom-stage-caption"><span><i/>ORIGINAL 3D RECONSTRUCTION</span><button onClick={()=>setExpanded(!expanded)} aria-pressed={expanded}><Expand size={13}/>{expanded?'Compact view':'Expand studio'}</button></div>
   </div>
   <aside className="showroom-car-info">
    <div className="showroom-team-wordmark"><span style={{background:car.accent}}/><span>{car.name}</span></div><div className="showroom-car-title"><span>2024 CHALLENGER</span><h3>{car.car}</h3></div><p>{car.description}</p>
    <span className="showroom-control-label">01 / CHOOSE YOUR VIEW</span>
    <div className="showroom-view-buttons" role="group" aria-label="Showroom camera views">{views.map(item=><button key={item.id} aria-pressed={view===item.id} onClick={()=>selectView(item.id)}><item.icon size={15}/>{item.label}</button>)}</div>
    {inside&&<div className="showroom-look-around"><div><span>DRAG THE VIEW TO LOOK AROUND</span><button onClick={()=>setLook({yaw:0,pitch:0})} aria-label="Center cockpit view"><RotateCcw size={12}/></button></div><div className="showroom-look-buttons"><button onClick={()=>shiftLook(.26,0)} aria-label="Look left inside car"><ArrowLeft size={15}/></button><button onClick={()=>shiftLook(0,.13)} aria-label="Look up inside car"><ArrowUp size={15}/></button><button onClick={()=>shiftLook(0,-.13)} aria-label="Look down inside car"><ArrowDown size={15}/></button><button onClick={()=>shiftLook(-.26,0)} aria-label="Look right inside car"><ArrowRight size={15}/></button></div></div>}
    <span className="showroom-control-label">02 / THE 2024 DRIVER LINEUP</span>
    <div className="showroom-driver-list">{car.drivers.map((item,index)=><button key={item.code} aria-pressed={driverIndex===index} onClick={()=>setDriverIndex(index)}><DriverPhoto driver={item}/><span><b>{item.name}</b><small>#{item.number} · {item.code}</small></span><ChevronRight size={14}/></button>)}</div>
    <button className="showroom-race-cta" onClick={onExploreRaces}>Watch a real historical race <ArrowUpRight size={17}/></button>
   </aside>
  </div>
  <div className="showroom-footnote"><p><b>A closer look, with honest detail.</b> These are original, approximate reconstructions inspired by the named 2024 cars. The cockpit controls and geometry are illustrative. Team names identify historical competitors; models are not official manufacturer CAD or an endorsement.</p><a href={car.source} target="_blank" rel="noreferrer">Explore the official {car.car} <ArrowUpRight size={12}/></a></div>
  <details className="showroom-credits"><summary>Driver photograph credits &amp; licenses</summary><p>Portraits identify the drivers and may be from a different season. Displayed as portrait crops; original photographs and licenses are linked below.</p><div>{SHOWROOM_CARS.flatMap(item=>item.drivers).map(item=>{const photo=getDriverPortrait(item.code);return photo?<p key={item.code}><b>{item.name}</b> — {photo.credit}. <a href={photo.source} target="_blank" rel="noreferrer">Original photograph</a> · <a href={photo.licenseUrl||photo.source} target="_blank" rel="noreferrer">{photo.license}</a></p>:null})}</div></details>
 </section>
}
