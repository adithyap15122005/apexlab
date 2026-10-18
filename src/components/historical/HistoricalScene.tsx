import { useEffect, useMemo, useRef, useState, type MutableRefObject } from 'react'
import { OrbitControls } from '@react-three/drei'
import { useFrame, useThree } from '@react-three/fiber'
import { Maximize2, Minimize2, RotateCcw, ArrowLeft, ArrowRight, ArrowUp, ArrowDown, Play, Pause, Volume2, VolumeX } from 'lucide-react'
import { CanvasTexture, Sprite, SpriteMaterial, SRGBColorSpace, Vector3 } from 'three'
import { formatHistoricalGap, formatRaceClock, getDriverState, sampleTelemetry } from '../../history/replay'
import { loadDriverTelemetry } from '../../history/loader'
import { createTrackGuide } from '../../history/trackGuide'
import { historicalCompound, type CameraMode, type DriverRaceState, type HistoricalDriver, type HistoricalRace, type ReplayClock, type TelemetrySample } from '../../history/types'
import SceneFrame from '../three/SceneFrame'
import { REPLAY_CAMERAS } from './replayPresentation'
import Atmosphere, { QUALITY, type SceneQuality } from '../race3d/Atmosphere'
import CameraRig, { type CameraFx, type LookDirection } from '../race3d/CameraRig'
import CarFleet from '../race3d/CarFleet'
import { CircuitScenery, CircuitSurface, GroundPlane, Horizon } from '../race3d/Circuit3D'
import { buildCircuit } from '../race3d/circuitBuilder'
import Cockpit from '../race3d/Cockpit'
import Effects from '../race3d/Effects'
import Spray from '../race3d/Spray'
import { EngineAudio } from '../race3d/engineAudio'
import { buildPendingMotion, createRuntime, trackStatus, updateRuntime, type RaceRuntime, type TrackStatus } from '../race3d/raceRuntime'
import { venueFor } from '../race3d/venues'
import './HistoricalScene.css'

type HistoricalSceneProps={race:HistoricalRace;clockRef:MutableRefObject<ReplayClock>;time:number;selectedDriver:number;cameraMode:CameraMode;onSelectDriver:(number:number)=>void;playing:boolean;onCameraChange?:(mode:CameraMode)=>void;onTogglePlay?:()=>void;onSeek?:(time:number)=>void;onSpeedChange?:(speed:number)=>void}
type QualityLevel=SceneQuality['level']
const CAMERA_LABELS:Record<CameraMode,string>={director:'BROADCAST DIRECTOR / AUTO CUTS',strategist:'FREE ORBIT / WHOLE FIELD',helicopter:'HELICOPTER / FOLLOW',trackside:'TRACKSIDE TV / FOLLOW',onboard:'DRIVER EYES / LOOK AROUND',tcam:'ROLL HOOP / T-CAM',nose:'NOSE CAMERA / LOW',rear:'REAR-FACING / ROLL HOOP',chase:'CHASE / FOLLOW',top:'TOP VIEW / FOLLOW DRIVER',overview:'WHOLE CIRCUIT / NORTH UP'}
const STATUS_TEXT:Partial<Record<TrackStatus,string>>={yellow:'YELLOW FLAG',sc:'SAFETY CAR',vsc:'VIRTUAL SAFETY CAR',red:'RED FLAG',chequered:'CHEQUERED FLAG'}
const driverColor=(driver:HistoricalDriver)=>/^#?[0-9a-f]{6}$/i.test(driver.color)?`#${driver.color.replace('#','')}`:'#c8d9ba'
const locationVisible=(state:DriverRaceState)=>['recorded','interpolated','finished'].includes(state.location.status)&&Number.isFinite(state.location.x)&&Number.isFinite(state.location.y)
const readQuality=():QualityLevel=>{try{const v=localStorage.getItem('apexlab-quality');return v==='ultra'||v==='high'||v==='medium'||v==='low'?v:'high'}catch{return 'high'}}

/** 2D projection used only by the analytical fallback view. */
type TrackProjection={width:number;depth:number;point:(x:number,y:number)=>{x:number;z:number}}
function createProjection(race:HistoricalRace):TrackProjection{
  const points=race.track.points,minX=Math.min(...points.map(p=>p[0])),maxX=Math.max(...points.map(p=>p[0])),minY=Math.min(...points.map(p=>p[1])),maxY=Math.max(...points.map(p=>p[1]))
  const scale=16/Math.max(maxX-minX,maxY-minY,1),centerX=(minX+maxX)/2,centerY=(minY+maxY)/2
  return {width:(maxX-minX)*scale,depth:(maxY-minY)*scale,point:(x,y)=>({x:(x-centerX)*scale,z:-(y-centerY)*scale})}
}
function Historical2D({race,time,selectedDriver,onSelectDriver}:{race:HistoricalRace;time:number;selectedDriver:number;onSelectDriver:(number:number)=>void}){
  const projection=useMemo(()=>createProjection(race),[race])
  const width=projection.width+1.8,depth=projection.depth+1.8,project=(x:number,y:number)=>{const p=projection.point(x,y);return {x:p.x+width/2,y:p.z+depth/2}}
  const path=race.track.points.map(([x,y],i)=>{const p=project(x,y);return `${i?'L':'M'}${p.x.toFixed(3)} ${p.y.toFixed(3)}`}).join(' ')+'Z'
  return <div className="historical-2d"><svg viewBox={`0 0 ${width} ${depth}`} role="img" aria-label={`${race.meta.circuit} recorded reference trace and driver locations`}><path d={path} fill="none" stroke="#61776d" strokeWidth=".19" strokeLinejoin="round"/><path d={path} fill="none" stroke="#cad8ba" strokeWidth=".025"/>{race.drivers.map(d=>getDriverState(race,d.number,time)).filter(locationVisible).map(state=>{const p=project(state.location.x,state.location.y),selected=state.driver.number===selectedDriver,color=driverColor(state.driver);return <g key={state.driver.number} transform={`translate(${p.x} ${p.y})`} role="button" tabIndex={0} aria-label={`Follow ${state.driver.name}`} onClick={()=>onSelectDriver(state.driver.number)} onKeyDown={event=>{if(event.key==='Enter'||event.key===' '){event.preventDefault();onSelectDriver(state.driver.number)}}} className="historical-2d-driver"><title>{state.driver.name} · {state.location.status}</title>{selected&&<circle r=".27" fill="none" stroke={color} strokeWidth=".035"/>}<circle r={selected?'.14':'.1'} fill={color} stroke="#101a1f" strokeWidth=".045"/>{selected&&<text x=".27" y="-.23" fill={color} fontSize=".25" fontFamily="monospace">{state.driver.code}</text>}</g>})}</svg></div>
}

/** Screen-sized driver tags for the overhead and helicopter views. */
function DriverTags({race,runtime,selected,onSelect,range=Infinity}:{race:HistoricalRace;runtime:{current:RaceRuntime};selected:number;onSelect:(n:number)=>void;range?:number}){
  const sprites=useRef<(Sprite|null)[]>([])
  const materials=useMemo(()=>race.drivers.map(driver=>{
    const canvas=document.createElement('canvas');canvas.width=256;canvas.height=96;const c=canvas.getContext('2d')!
    c.fillStyle='#0d1a20ee';c.beginPath();c.roundRect(2,2,252,92,14);c.fill();c.fillStyle=driverColor(driver);c.fillRect(2,14,9,68)
    c.fillStyle='#f2f7ee';c.font='bold 44px monospace';c.fillText(driver.code,30,64);c.fillStyle='#9fb6a8';c.font='28px monospace';c.fillText(String(driver.number),160,62)
    const map=new CanvasTexture(canvas);map.colorSpace=SRGBColorSpace
    return new SpriteMaterial({map,depthTest:false,depthWrite:false,toneMapped:false,sizeAttenuation:false})
  }),[race])
  useEffect(()=>()=>materials.forEach(m=>{m.map?.dispose();m.dispose()}),[materials])
  useFrame(()=>{
    runtime.current.cars.forEach((car,i)=>{
      const sprite=sprites.current[i];if(!sprite)return
      sprite.visible=car.visible&&(car.driver.number===selected||car.distance<range)
      if(!sprite.visible)return
      const nx=Math.cos(car.pose.yaw),nz=-Math.sin(car.pose.yaw)
      sprite.position.set(car.pose.x+nx*car.lateral,car.pose.y+2.4,car.pose.z+nz*car.lateral)
      const big=car.driver.number===selected?1.3:1;sprite.scale.set(.052*big,.0195*big,1)
      sprite.renderOrder=car.driver.number===selected?21:20
    })
  })
  return <group>{race.drivers.map((driver,i)=><sprite key={driver.number} ref={s=>{sprites.current[i]=s}} material={materials[i]} center={[.5,0]} onClick={event=>{event.stopPropagation();onSelect(driver.number)}}/>)}</group>
}

function RaceWorld({race,clockRef,time,selectedDriver,cameraMode,onSelectDriver,active,look,telemetry,quality,audio}:{race:HistoricalRace;clockRef:MutableRefObject<ReplayClock>;time:number;selectedDriver:number;cameraMode:CameraMode;onSelectDriver:(n:number)=>void;active:boolean;look:LookDirection;telemetry:TelemetrySample[];quality:SceneQuality;audio:EngineAudio|null}){
  const {camera,invalidate}=useThree()
  const guide=useMemo(()=>createTrackGuide(race),[race])
  const venue=useMemo(()=>venueFor(race.meta.circuit,race.meta.name),[race])
  const layout=useMemo(()=>guide?buildCircuit(guide,venue,{trees:quality.trees,buildings:quality.buildings},race.meta.round):null,[guide,venue,quality.trees,quality.buildings,race.meta.round])
  useEffect(()=>()=>layout?.dispose(),[layout])
  const runtime=useMemo(()=>({current:createRuntime(race)}),[race])
  const focus=useRef(new Vector3()),fx=useRef<CameraFx>({speedBlur:0,center:[.5,.55],onboard:false})
  const selectedIndex=race.drivers.findIndex(d=>d.number===selectedDriver)
  const bounds=useMemo(()=>{
    if(!guide)return {x:0,z:0,width:1000,depth:1000,y:0}
    let minX=Infinity,maxX=-Infinity,minZ=Infinity,maxZ=-Infinity,y=0
    const t=guide.track;for(let i=0;i<t.count;i++){minX=Math.min(minX,t.x[i]);maxX=Math.max(maxX,t.x[i]);minZ=Math.min(minZ,t.z[i]);maxZ=Math.max(maxZ,t.z[i]);y+=t.y[i]/t.count}
    return {x:(minX+maxX)/2,z:(minZ+maxZ)/2,width:maxX-minX,depth:maxZ-minZ,y}
  },[guide])
  const obstacles=useMemo(()=>layout?[...layout.buildings,...layout.grandstands.map(g=>({...g,w:16,d:16,h:15})),...layout.garages.map(g=>({...g,w:14,d:24,h:12}))]:[],[layout])
  const lapStart=useMemo(()=>{const leader=race.drivers.find(d=>d.finishPosition===1)??race.drivers[0];return race.laps[leader.number]?.find(l=>l.lap===1)?.start??0},[race])
  const rain=race.weather.filter(w=>w.time<=time).at(-1)?.rainfall===1
  useEffect(()=>invalidate(),[time,selectedDriver,cameraMode,telemetry,quality,invalidate])
  // Guided motion is prepared a few cars per frame, followed car first.
  useFrame(()=>{if(runtime.current.pending.length){buildPendingMotion(runtime.current,race,guide,9,selectedIndex);invalidate()}},-3)
  useFrame((_,delta)=>{
    updateRuntime(runtime.current,race,{guide,time:clockRef.current.current,wallDt:delta,selected:selectedDriver,onboard:cameraMode==='onboard',telemetry,camera:camera.position})
    const car=runtime.current.cars[selectedIndex]
    if(car?.visible)focus.current.set(car.pose.x,car.pose.y,car.pose.z)
    else if(cameraMode==='overview'||cameraMode==='strategist')focus.current.set(bounds.x,bounds.y,bounds.z)
    audio?.update(car,camera.position,cameraMode,clockRef.current)
  },-2)
  const tags=['strategist','overview','top','helicopter'].includes(cameraMode)
  const selected=race.drivers[selectedIndex]??race.drivers[0]
  return <>
    <Atmosphere venue={venue} rain={rain} quality={quality} focus={focus}/>
    {layout&&guide&&<>
      <CircuitSurface layout={layout} venue={venue} wet={rain?1:0} length={guide.track.length} halfWidth={guide.track.halfWidth} gridCount={race.drivers.length}/>
      <CircuitScenery layout={layout} venue={venue} runtime={runtime} lapStart={lapStart}/>
      <Horizon venue={venue} radius={layout.terrainSize*2.2+1500} baseY={layout.baseY}/>
      <GroundPlane venue={venue} y={layout.baseY-.4}/>
    </>}
    {rain&&<Spray runtime={runtime} carCount={race.drivers.length}/>}
    <CarFleet runtime={runtime} carCount={race.drivers.length} selected={selectedDriver} hideSelectedDriver={cameraMode==='onboard'} shadows={quality.shadows>0} onSelect={onSelectDriver}/>
    <Cockpit runtime={runtime} selected={selectedDriver} team={selected.team} color={driverColor(selected)} telemetry={telemetry} visible={cameraMode==='onboard'} mirrors={quality.level==='ultra'||quality.level==='high'}/>
    {tags&&<DriverTags race={race} runtime={runtime} selected={selectedDriver} onSelect={onSelectDriver} range={cameraMode==='helicopter'?190:Infinity}/>}
    {cameraMode==='strategist'&&<OrbitControls makeDefault target={[bounds.x,bounds.y,bounds.z]} enablePan minDistance={40} maxDistance={Math.max(bounds.width,bounds.depth)*2.2} maxPolarAngle={1.45} enableDamping dampingFactor={.12}/>}
    <CameraRig mode={cameraMode} runtime={runtime} selected={selectedDriver} look={look} guide={guide} bounds={bounds} active={active} fx={fx} obstacles={obstacles} street={venue.street}/>
    <Effects quality={quality} fx={fx} night={venue.lighting!=='day'}/>
  </>
}

export default function HistoricalScene(props:HistoricalSceneProps){
  const {race,time,selectedDriver,cameraMode,playing}=props,selected=getDriverState(race,selectedDriver,time),visible=locationVisible(selected),status=selected.location.status
  const shell=useRef<HTMLDivElement>(null),drag=useRef<{id:number;x:number;y:number}|null>(null),lookFrame=useRef<number|null>(null),lookDelta=useRef({yaw:0,pitch:0})
  const [look,setLook]=useState<LookDirection>({yaw:0,pitch:0}),[fullscreen,setFullscreen]=useState(false),[telemetry,setTelemetry]=useState<TelemetrySample[]>([]),[presentation3D,setPresentation3D]=useState(true),onboard=cameraMode==='onboard'
  const [qualityLevel,setQualityLevel]=useState<QualityLevel>(readQuality),quality=QUALITY[qualityLevel]
  const [audio,setAudio]=useState<EngineAudio|null>(null)
  useEffect(()=>{try{localStorage.setItem('apexlab-quality',qualityLevel)}catch{/* Optional preference. */}},[qualityLevel])
  useEffect(()=>()=>{audio?.dispose()},[audio])
  useEffect(()=>{if(audio)audio.setPlaying(playing)},[audio,playing])
  useEffect(()=>{audio?.setTelemetry(telemetry)},[audio,telemetry])
  useEffect(()=>{if(lookFrame.current!=null)cancelAnimationFrame(lookFrame.current);lookFrame.current=null;lookDelta.current={yaw:0,pitch:0};setLook({yaw:0,pitch:0})},[selectedDriver,cameraMode])
  useEffect(()=>()=>{if(lookFrame.current!=null)cancelAnimationFrame(lookFrame.current)},[])
  // Recorded telemetry drives the wheel display, shift lights, DRS flap, HUD and engine audio.
  useEffect(()=>{setTelemetry([]);const controller=new AbortController();loadDriverTelemetry(race,selectedDriver,controller.signal).then(setTelemetry).catch(()=>{});return()=>controller.abort()},[race,selectedDriver])
  useEffect(()=>{const change=()=>setFullscreen(document.fullscreenElement===shell.current);document.addEventListener('fullscreenchange',change);return()=>document.removeEventListener('fullscreenchange',change)},[])
  useEffect(()=>{if(!fullscreen)return;const escape=(event:KeyboardEvent)=>{if(event.key==='Escape'&&!document.fullscreenElement)setFullscreen(false)};document.addEventListener('keydown',escape);return()=>document.removeEventListener('keydown',escape)},[fullscreen])
  const turn=(yaw:number,pitch=0)=>setLook(current=>{const nextYaw=Math.max(-Math.PI*.97,Math.min(Math.PI*.97,current.yaw+yaw)),nextPitch=Math.max(-1.05,Math.min(.75,current.pitch+pitch));return nextYaw===current.yaw&&nextPitch===current.pitch?current:{yaw:nextYaw,pitch:nextPitch}})
  const queueTurn=(yaw:number,pitch:number)=>{lookDelta.current.yaw+=yaw;lookDelta.current.pitch+=pitch;if(lookFrame.current!=null)return;lookFrame.current=requestAnimationFrame(()=>{const change=lookDelta.current;lookDelta.current={yaw:0,pitch:0};lookFrame.current=null;turn(change.yaw,change.pitch)})}
  const toggleFullscreen=()=>{if(fullscreen){if(document.fullscreenElement)void document.exitFullscreen();else setFullscreen(false)}else if(shell.current?.requestFullscreen)void shell.current.requestFullscreen().catch(()=>setFullscreen(true));else setFullscreen(true)}
  const toggleAudio=()=>{if(audio){audio.dispose();setAudio(null)}else{const engine=new EngineAudio();engine.setPlaying(playing);setAudio(engine)}}
  const sample=telemetry.length?sampleTelemetry(telemetry,time):null,live=sample&&sample.sampleAge<=3?sample:null
  const trackState=trackStatus(race,time),compound=historicalCompound(selected.compound)
  const gapMessage=selected.retired?`${selected.driver.code} is retired. No car is drawn after the final competitive lap.`:status==='gap'?`Location gap for ${selected.driver.code}. Car hidden until the next valid recorded bracket.`:status==='unavailable'?`No recorded location for ${selected.driver.code} at this time. Car hidden.`:`${selected.driver.code} finished. The last recorded finish point is held.`
  const qualityPicker=<label className="hs-quality"><span>GRAPHICS</span><select aria-label="Graphics quality" value={qualityLevel} onChange={event=>setQualityLevel(event.target.value as QualityLevel)}><option value="ultra">Ultra</option><option value="high">High</option><option value="medium">Medium</option><option value="low">Low</option></select></label>
  return <div ref={shell} className={`historical-scene-shell ${onboard?'is-immersive':''} ${fullscreen?'is-fullscreen':''}`}>
    <div className="hs-scene-heading"><div><span className="hs-kicker">RECORDED RACE / {race.meta.year}</span><h3>{race.meta.circuit} · {REPLAY_CAMERAS.find(view=>view.id===cameraMode)?.label}</h3></div><div className="hs-heading-tools"><button className={`hs-fullscreen hs-audio ${audio?'is-on':''}`} onClick={toggleAudio} aria-pressed={!!audio} aria-label={audio?'Mute engine sound':'Play synthesized engine sound'}>{audio?<Volume2 size={15}/>:<VolumeX size={15}/>}<span>{audio?'Engine sound on':'Engine sound'}</span></button><button className="hs-fullscreen" onClick={toggleFullscreen} aria-label={fullscreen?'Exit immersive fullscreen':'Open immersive fullscreen'}>{fullscreen?<Minimize2 size={15}/>:<Maximize2 size={15}/>}<span>{fullscreen?'Exit fullscreen':'Immersive view'}</span></button></div></div>
    <div className="hs-scene-stage">
      <SceneFrame label={`Historical ${race.meta.circuit} race reconstruction`} className={`historical-race-scene camera-${cameraMode}`} camera={[0,400,400]} target={[0,0,0]} animated={playing||cameraMode==='director'} explicitPlayback interactive={cameraMode==='strategist'} motionControl={false} studio={false} smooth toolbar={qualityPicker}
        canvas={{fov:50,near:.05,far:40000,dpr:quality.dpr,shadows:quality.shadows>0,antialias:!quality.post,logarithmicDepthBuffer:true,highPerformance:true}}
        onPresentationChange={value=>setPresentation3D(value.is3D)} fallback={<Historical2D race={race} time={time} selectedDriver={selectedDriver} onSelectDriver={props.onSelectDriver}/>}>
        {({active})=><RaceWorld race={race} clockRef={props.clockRef} time={time} selectedDriver={selectedDriver} cameraMode={cameraMode} onSelectDriver={props.onSelectDriver} active={active} look={look} telemetry={telemetry} quality={quality} audio={audio}/>}
      </SceneFrame>
      <div className="hs-camera-readout"><span>{CAMERA_LABELS[cameraMode]}</span><b style={{color:driverColor(selected.driver)}}>{selected.driver.code} <em>#{selectedDriver} / {selected.driver.team}</em></b></div>
      {presentation3D&&STATUS_TEXT[trackState]&&<div className={`hs-status-banner is-${trackState}`} role="status">{STATUS_TEXT[trackState]}</div>}
      {presentation3D&&visible&&!['strategist','overview'].includes(cameraMode)&&<div className="hs-hud" aria-label={`${selected.driver.name} live data`}>
        <div className="hs-hud-driver"><b>P{selected.position??'—'}</b><i style={{background:driverColor(selected.driver)}}/><span>{selected.driver.code}</span><em>LAP {selected.lap||'—'}</em></div>
        <div className="hs-hud-speed"><b>{live?.speed!=null?live.speed.toFixed(0):'—'}</b><span>KM/H</span><b className="hs-hud-gear">{live?.gear==null?'—':live.gear===0?'N':live.gear}</b><span>GEAR</span></div>
        <div className="hs-hud-pedals"><span><i style={{width:`${Math.max(0,Math.min(100,live?.throttle??0))}%`}}/></span><span className="is-brake"><i style={{width:`${Math.max(0,Math.min(100,live?.brake??0))}%`}}/></span></div>
        <div className="hs-hud-meta"><span style={{color:compound.color}}>{compound.letter} {selected.tyreAge!=null?`· ${selected.tyreAge} laps`:''}</span><span>{live?.drs!=null&&live.drs>=10?'DRS OPEN':'DRS'}</span><span>{formatHistoricalGap(selected.gap)}</span></div>
        <small>{live?'RECORDED TELEMETRY':'TELEMETRY UNAVAILABLE AT THIS TIME'}</small>
      </div>}
      {onboard&&presentation3D&&<>
        <div className="hs-look-zone" tabIndex={0} role="application" aria-label="Cockpit look-around. Drag to look. Use arrow keys to look around; R to face forward." onKeyDown={event=>{const keys:Record<string,[number,number]>={ArrowLeft:[.16,0],ArrowRight:[-.16,0],ArrowUp:[0,.12],ArrowDown:[0,-.12]};if(keys[event.key]){event.preventDefault();turn(...keys[event.key])}else if(event.key.toLowerCase()==='r'){event.preventDefault();setLook({yaw:0,pitch:0})}}} onPointerDown={event=>{if(event.button!==0)return;event.currentTarget.focus({preventScroll:true});event.currentTarget.setPointerCapture(event.pointerId);drag.current={id:event.pointerId,x:event.clientX,y:event.clientY}}} onPointerMove={event=>{if(!drag.current||drag.current.id!==event.pointerId)return;queueTurn(-(event.clientX-drag.current.x)*.005,-(event.clientY-drag.current.y)*.004);drag.current={id:event.pointerId,x:event.clientX,y:event.clientY}}} onPointerUp={event=>{if(event.currentTarget.hasPointerCapture(event.pointerId))event.currentTarget.releasePointerCapture(event.pointerId);drag.current=null}} onPointerCancel={()=>{drag.current=null}}/>
        <div className="hs-cockpit-tools" role="group" aria-label="Cockpit look direction"><button onClick={()=>turn(.45)} aria-label="Look left"><ArrowLeft size={15}/></button><button onClick={()=>turn(0,.2)} aria-label="Look up"><ArrowUp size={15}/></button><button onClick={()=>setLook({yaw:0,pitch:0})} aria-label="Face forward"><RotateCcw size={14}/><span>Forward</span></button><button onClick={()=>turn(0,-.2)} aria-label="Look down at cockpit"><ArrowDown size={15}/></button><button onClick={()=>turn(-.45)} aria-label="Look right"><ArrowRight size={15}/></button></div>
        <div className="hs-onboard-note">DRAG TO LOOK AROUND <span>Arrow keys · R to face forward</span></div>
      </>}
      {!visible&&!['strategist','overview'].includes(cameraMode)&&<div className="hs-location-notice" role="status"><span>LOCATION {selected.retired?'ENDED':'UNAVAILABLE'}</span><p>{gapMessage}</p><small>Camera holds its last valid view.</small></div>}
      {fullscreen&&<><button className="hs-fullscreen-exit" onClick={toggleFullscreen}><Minimize2 size={16}/>Exit fullscreen</button><div className="hs-fullscreen-player">
        <label>FOLLOW DRIVER<select aria-label="Fullscreen driver" value={selectedDriver} onChange={event=>props.onSelectDriver(Number(event.target.value))}>{race.drivers.map(driver=><option key={driver.number} value={driver.number}>{driver.number} · {driver.name}</option>)}</select></label>
        {props.onCameraChange&&<label>CAMERA<select aria-label="Fullscreen camera view" value={cameraMode} onChange={event=>props.onCameraChange?.(event.target.value as CameraMode)}>{REPLAY_CAMERAS.map(view=><option key={view.id} value={view.id}>{view.label}</option>)}</select></label>}
        {props.onTogglePlay&&<button className="hs-fullscreen-play" onClick={props.onTogglePlay} aria-label={playing?'Pause fullscreen replay':'Play fullscreen replay'}>{playing?<Pause size={17}/>:<Play size={17}/>}<span>{playing?'Pause':'Play'}</span></button>}
        {props.onSeek&&<label className="hs-fullscreen-timeline"><span>{formatRaceClock(time)} <b>/ {formatRaceClock(race.meta.duration)}</b></span><input type="range" aria-label="Fullscreen race timeline" min={0} max={race.meta.duration} step={.1} value={Math.min(time,race.meta.duration)} onChange={event=>props.onSeek?.(Number(event.target.value))}/></label>}
        {props.onSpeedChange&&<label>SPEED<select aria-label="Fullscreen playback speed" value={props.clockRef.current.speed} onChange={event=>props.onSpeedChange?.(Number(event.target.value))}>{[1,4,16,32].map(speed=><option key={speed} value={speed}>{speed}×</option>)}</select></label>}
        {qualityPicker}
      </div></>}
    </div>
    <div className="hs-data-strip"><span><i className={`hs-location-dot ${visible?'is-valid':''}`}/>{status==='interpolated'?'TRACK-GUIDED BETWEEN RECORDED SAMPLES':status==='recorded'?'RECORDED POSITION':status==='finished'?'LAST RECORDED FINISH POINT':'LOCATION COVERAGE GAP'}</span><span>ORIGINAL 2022-SPEC CAR MODELS <i/>{race.coverage.sampleInterval.toFixed(1)}s data <i/>{quality.level.toUpperCase()} GRAPHICS</span></div>
    <p className="hs-accuracy-note">Recorded positions drive every car. Between samples (about one per second), each car advances along the circuit's recorded reference line instead of a straight chord, using a smoothed, monotone fit of its recorded lap progress; brackets longer than {race.coverage.maxInterpolationGap} seconds or physically impossible jumps stay hidden. OpenF1 cannot resolve exact lateral placement, so cars that would overlap are eased apart across the road; lap progress, gaps and positions are unchanged. Suspension movement, steering lock and wheel rotation are animated from the reconstructed path, not measured. DRS, gear, speed, RPM and pedal traces come only from recorded telemetry, and the engine sound is synthesized from it. Bodywork, road width, kerbs, run-off, barriers and scenery are original reconstructions, not surveyed circuits.</p>
  </div>
}
