import { useEffect, useMemo, useRef, useState, type MutableRefObject } from 'react'
import { Sky } from '@react-three/drei'
import { useFrame, useThree, type ThreeEvent } from '@react-three/fiber'
import { Maximize2, Minimize2, RotateCcw, ArrowLeft, ArrowRight, ArrowUp, ArrowDown, Play, Pause } from 'lucide-react'
import { BackSide, BufferGeometry, CanvasTexture, CatmullRomCurve3, Color, Float32BufferAttribute, Fog, Group, InstancedBufferAttribute, InstancedMesh, Light, Matrix4, Object3D, Quaternion, RepeatWrapping, Sprite, SRGBColorSpace, Vector3 } from 'three'
import { formatRaceClock, getDriverState } from '../../history/replay'
import { loadDriverTelemetry } from '../../history/loader'
import { historicalCompound, type CameraMode, type DriverRaceState, type HistoricalDriver, type HistoricalRace, type ReplayClock, type TelemetrySample } from '../../history/types'
import SceneFrame from '../three/SceneFrame'
import { cockpitCameraPose, createFormulaCarParts, formulaTeamLivery, historicalLighting, CockpitInterior } from './FormulaCarModel'
import { circuitOverviewHeight, cockpitRivalVisibility, REPLAY_CAMERAS, sceneryClearsRoad } from './replayPresentation'
import './HistoricalScene.css'

type HistoricalSceneProps={race:HistoricalRace;clockRef:MutableRefObject<ReplayClock>;time:number;selectedDriver:number;cameraMode:CameraMode;onSelectDriver:(number:number)=>void;playing:boolean;onCameraChange?:(mode:CameraMode)=>void;onTogglePlay?:()=>void;onSeek?:(time:number)=>void;onSpeedChange?:(speed:number)=>void}
type TrackProjection={scale:number;meterScale:number;width:number;depth:number;point:(x:number,y:number,height?:number)=>Vector3}
type RaceSnapshot={time:number;states:DriverRaceState[]}
type LookDirection={yaw:number;pitch:number}
const OVERHEAD:[number,number,number]=[15.7,19.1,14.8]
const ORIGIN:[number,number,number]=[0,.215,0]
const UP=new Vector3(0,1,0)
const HIDDEN_MATRIX=new Matrix4().makeScale(0,0,0)
const CAMERA_LABELS:Record<CameraMode,string>={strategist:'FREE ORBIT / WHOLE FIELD',helicopter:'HELICOPTER / FOLLOW',trackside:'TRACKSIDE / FOLLOW',onboard:'DRIVER EYES / LOOK AROUND',tcam:'ROLL HOOP / T-CAM',chase:'CHASE / FOLLOW',top:'TOP VIEW / FOLLOW DRIVER',overview:'WHOLE CIRCUIT / NORTH UP'}
const driverColor=(driver:HistoricalDriver)=>/^#?[0-9a-f]{6}$/i.test(driver.color)?`#${driver.color.replace('#','')}`:'#c8d9ba'
const locationVisible=(state:DriverRaceState)=>['recorded','interpolated','finished'].includes(state.location.status)&&Number.isFinite(state.location.x)&&Number.isFinite(state.location.y)
function onboardCount(race:HistoricalRace,selected:DriverRaceState,time:number,projection:TrackProjection){
  return race.drivers.filter(driver=>driver.number!==selected.driver.number&&cockpitRivalVisibility(selected.location,getDriverState(race,driver.number,time).location,projection.meterScale/projection.scale)<1).length
}

function createProjection(race:HistoricalRace):TrackProjection {
  const points=race.track.points,minX=Math.min(...points.map(p=>p[0])),maxX=Math.max(...points.map(p=>p[0])),minY=Math.min(...points.map(p=>p[1])),maxY=Math.max(...points.map(p=>p[1]))
  const scale=16/Math.max(maxX-minX,maxY-minY,1),centerX=(minX+maxX)/2,centerY=(minY+maxY)/2
  let traceLength=0;for(let i=1;i<points.length;i++)traceLength+=Math.hypot(points[i][0]-points[i-1][0],points[i][1]-points[i-1][1])*scale
  return {scale,meterScale:traceLength/Math.max(race.track.length,1),width:(maxX-minX)*scale,depth:(maxY-minY)*scale,point:(x,y,height=.215)=>new Vector3((x-centerX)*scale,height,-(y-centerY)*scale)}
}
function makeCurve(race:HistoricalRace,projection:TrackProjection){
  const stride=Math.max(1,Math.floor(race.track.points.length/850)),points=race.track.points.filter((_,i)=>i%stride===0).map(([x,y])=>projection.point(x,y))
  if(points.length>2&&points[0].distanceTo(points.at(-1)!)<.03)points.pop()
  return new CatmullRomCurve3(points,true,'centripetal',.35)
}
function roadRibbon(curve:CatmullRomCurve3,inner:number,outer:number,kerbs=false){
  const positions:number[]=[],indices:number[]=[],colors:number[]=[],uv:number[]=[],segments=2200
  for(let i=0;i<=segments;i++){
    const p=curve.getPointAt(i/segments),t=curve.getTangentAt(i/segments),normal=new Vector3(-t.z,0,t.x).normalize(),color=new Color(Math.floor(i/2)%2?'#eee9e1':'#a93433')
    for(const [j,width] of [inner,outer].entries()){const v=p.clone().addScaledVector(normal,width);positions.push(v.x,v.y,v.z);colors.push(color.r,color.g,color.b);uv.push(j,i/segments*240)}
    if(i<segments){const n=i*2;indices.push(n,n+1,n+2,n+1,n+3,n+2)}
  }
  const geometry=new BufferGeometry();geometry.setAttribute('position',new Float32BufferAttribute(positions,3));geometry.setAttribute('uv',new Float32BufferAttribute(uv,2));if(kerbs)geometry.setAttribute('color',new Float32BufferAttribute(colors,3));geometry.setIndex(indices);geometry.computeVertexNormals();return geometry
}
function surfaceTexture(base:[number,number,number],variation:number){
  const canvas=document.createElement('canvas');canvas.width=128;canvas.height=128;const context=canvas.getContext('2d')!,pixels=context.createImageData(128,128)
  let seed=42;for(let i=0;i<pixels.data.length;i+=4){seed=(seed*1664525+1013904223)>>>0;const noise=((seed/4294967296)-.5)*variation;for(let j=0;j<3;j++)pixels.data[i+j]=base[j]+noise;pixels.data[i+3]=255}context.putImageData(pixels,0,0)
  const texture=new CanvasTexture(canvas);texture.colorSpace=SRGBColorSpace;texture.wrapS=texture.wrapT=RepeatWrapping;return texture
}

function ReferenceCircuit({race,projection,immersive,time}:{race:HistoricalRace;projection:TrackProjection;immersive:boolean;time:number}){
  const scene=useThree(state=>state.scene)
  const lighting=historicalLighting(race.meta.circuit,race.meta.name),night=lighting==='night',twilight=lighting==='twilight'
  const rainy=race.weather.filter(sample=>sample.time<=time).at(-1)?.rainfall===1
  const skyColor=night?'#11263d':twilight?'#69758b':rainy?'#8397a6':'#b9d5e6'
  const curve=useMemo(()=>makeCurve(race,projection),[race,projection]),m=projection.meterScale,halfWidth=m*6.5
  // Approximate road dimensions, calibrated against the published lap length.
  const geometries=useMemo(()=>[roadRibbon(curve,-halfWidth*1.35,halfWidth*1.35),roadRibbon(curve,-halfWidth,halfWidth),roadRibbon(curve,-halfWidth-m,-halfWidth,true),roadRibbon(curve,halfWidth,halfWidth+m,true),roadRibbon(curve,-halfWidth+m*.3,-halfWidth+m*.42),roadRibbon(curve,halfWidth-m*.42,halfWidth-m*.3)],[curve,halfWidth,m])
  const [asphalt,grass]=useMemo(()=>[surfaceTexture([76,80,81],23),surfaceTexture([75,100,52],36)],[])
  const nightSky=useMemo(()=>{const canvas=document.createElement('canvas');canvas.width=16;canvas.height=256;const context=canvas.getContext('2d')!,gradient=context.createLinearGradient(0,0,0,256);gradient.addColorStop(0,'#060d1b');gradient.addColorStop(.55,'#18334f');gradient.addColorStop(1,'#4e657b');context.fillStyle=gradient;context.fillRect(0,0,16,256);const texture=new CanvasTexture(canvas);texture.colorSpace=SRGBColorSpace;return texture},[])
  useEffect(()=>{asphalt.repeat.set(2,1);grass.repeat.set(400,400);return()=>{asphalt.dispose();grass.dispose()}},[asphalt,grass])
  useEffect(()=>()=>nightSky.dispose(),[nightSky])
  useEffect(()=>()=>geometries.forEach(g=>g.dispose()),[geometries])
  useEffect(()=>{const previousBackground=scene.background,previousFog=scene.fog;scene.background=new Color(skyColor);scene.fog=new Fog(skyColor,immersive?13:27,immersive?55:90);return()=>{scene.background=previousBackground;scene.fog=previousFog}},[scene,immersive,skyColor])
  useEffect(()=>{if(!night&&!twilight)return;const lights=scene.children.filter((node):node is Light=>(node as Light).isLight===true).map(light=>({light,intensity:light.intensity}));for(const {light} of lights)light.intensity*=night?.15:.55;return()=>{for(const {light,intensity} of lights)light.intensity=intensity}},[scene,night,twilight])
  const pitCurve=useMemo(()=>{const points=(race.track.pitLane??[]).map(([x,y])=>projection.point(x,y,.2152));return points.length>2?new CatmullRomCurve3(points,false,'centripetal'):null},[race,projection])
  const start=curve.getPointAt(0),heading=curve.getTangentAt(0)
  return <group>
    {night?<mesh><sphereGeometry args={[65,32,16]}/><meshBasicMaterial map={nightSky} side={BackSide} toneMapped={false}/></mesh>:<Sky distance={65} sunPosition={twilight?[-8,.6,4]:[12,16,8]} inclination={.4} azimuth={.2} turbidity={rainy?14:twilight?9:5.5} rayleigh={twilight?2.5:1.5}/>}
    <hemisphereLight args={[night?'#a2b6d7':'#e7eff8',night?'#26312c':'#728655',night?.4:twilight?.8:1.4]}/>
    {(night||twilight)&&<><directionalLight position={[8,12,4]} intensity={night?2.2:1.3} color="#dce9ff"/><directionalLight position={[-10,7,-5]} intensity={night?.9:.5} color="#becfed"/></>}
    <mesh rotation={[-Math.PI/2,0,0]} position={[0,.212,0]} receiveShadow><planeGeometry args={[160,160]}/><meshStandardMaterial color="#8a9d62" map={grass} roughness={1}/></mesh>
    <mesh geometry={geometries[0]} position={[0,-.001,0]}><meshStandardMaterial color="#728765" roughness={1} side={2}/></mesh>
    <mesh geometry={geometries[1]} receiveShadow><meshStandardMaterial color={rainy?'#7a858a':'#b0b5b8'} map={asphalt} metalness={rainy?.1:.03} roughness={rainy?.48:.96} side={2}/></mesh>
    {[2,3].map(i=><mesh key={i} geometry={geometries[i]} position={[0,.00015,0]}><meshStandardMaterial vertexColors roughness={.9} side={2}/></mesh>)}
    {[4,5].map(i=><mesh key={i} geometry={geometries[i]} position={[0,.0003,0]}><meshStandardMaterial color="#f0efe8" roughness={.9} side={2}/></mesh>)}
    {pitCurve&&<mesh><tubeGeometry args={[pitCurve,240,m*2.5,4,false]}/><meshStandardMaterial color="#646c6b" roughness={.9}/></mesh>}
    <group position={[start.x,.2157,start.z]} rotation={[0,Math.atan2(heading.x,heading.z),0]}>{Array.from({length:16},(_,x)=>[0,1].map(z=><mesh key={`${x}-${z}`} position={[(x-7.5)*halfWidth/8,0,(z-.5)*m*.65]}><boxGeometry args={[halfWidth/8,.0001,m*.65]}/><meshStandardMaterial color={(x+z)%2?'#22272a':'#f2efe5'}/></mesh>))}</group>
    <TrackFurniture curve={curve} pitCurve={pitCurve} m={m}/>
    {(night||twilight)&&<CircuitFloodlights curve={curve} m={m}/>}
  </group>
}

function CircuitFloodlights({curve,m}:{curve:CatmullRomCurve3;m:number}){
  const poles=useRef<InstancedMesh>(null),heads=useRef<InstancedMesh>(null),count=58
  useEffect(()=>{if(!poles.current||!heads.current)return;const object=new Object3D();for(let i=0;i<count;i++){const point=curve.getPointAt(i/count),tangent=curve.getTangentAt(i/count),normal=new Vector3(-tangent.z,0,tangent.x).normalize();if(normal.dot(point)<0)normal.negate();point.addScaledVector(normal,m*26);object.position.set(point.x,.215+m*7,point.z);object.rotation.set(0,0,0);object.scale.set(m*.28,m*14,m*.28);object.updateMatrix();poles.current.setMatrixAt(i,object.matrix);object.position.y=.215+m*14;object.rotation.y=Math.atan2(tangent.x,tangent.z);object.scale.set(m*3.2,m*.3,m*1.2);object.updateMatrix();heads.current.setMatrixAt(i,object.matrix)}poles.current.instanceMatrix.needsUpdate=true;heads.current.instanceMatrix.needsUpdate=true},[curve,m])
  return <group><instancedMesh ref={poles} args={[undefined,undefined,count]} frustumCulled={false}><boxGeometry/><meshStandardMaterial color="#697681" metalness={.7} roughness={.5}/></instancedMesh><instancedMesh ref={heads} args={[undefined,undefined,count]} frustumCulled={false}><boxGeometry/><meshStandardMaterial color="#d8e7ff" emissive="#acc9ff" emissiveIntensity={2.2} roughness={.4} toneMapped={false}/></instancedMesh></group>
}
// Indicative original context, not a surveyed circuit model.
function TrackFurniture({curve,pitCurve,m}:{curve:CatmullRomCurve3;pitCurve:CatmullRomCurve3|null;m:number}){
  const furniture=useMemo(()=>Array.from({length:150},(_,i)=>{const p=curve.getPointAt(i/150),t=curve.getTangentAt(i/150),n=new Vector3(-t.z,0,t.x).normalize();return {p,n,angle:Math.atan2(t.x,t.z)}}),[curve])
  const roadSamples=useMemo(()=>curve.getSpacedPoints(1500),[curve])
  const building=(pitCurve??curve).getPointAt(.5),tangent=(pitCurve??curve).getTangentAt(.5),side=new Vector3(-tangent.z,0,tangent.x).normalize()
  if(side.dot(building)<0)side.negate();building.addScaledVector(side,m*20)
  return <group>
    <CircuitBarriers furniture={furniture} m={m}/>
    {sceneryClearsRoad(roadSamples,building,Math.atan2(tangent.x,tangent.z),10,73,m)&&<group position={[building.x,.215,building.z]} rotation={[0,Math.atan2(tangent.x,tangent.z),0]} scale={m}>
      <mesh position={[0,4,0]}><boxGeometry args={[14,8,140]}/><meshStandardMaterial color="#b3b8b9" metalness={.3} roughness={.55}/></mesh><mesh position={[0,8.5,0]} rotation={[0,0,.08]}><boxGeometry args={[19,.7,145]}/><meshStandardMaterial color="#e2e3dc" metalness={.55} roughness={.4}/></mesh>
      {Array.from({length:25},(_,i)=><group key={i} position={[0,0,(i-12)*5.4]}><mesh position={[-7.03,2.4,0]}><boxGeometry args={[.08,4.5,4.7]}/><meshStandardMaterial color="#303b40" metalness={.5} roughness={.4}/></mesh><mesh position={[-7.09,6.2,0]}><boxGeometry args={[.1,1.7,4.6]}/><meshStandardMaterial color="#9db5c3" metalness={.75} roughness={.2}/></mesh></group>)}
    </group>}
    {[.12,.28,.43,.65,.82].map((progress,index)=>{const p=curve.getPointAt(progress),t=curve.getTangentAt(progress),n=new Vector3(-t.z,0,t.x).normalize();if(n.dot(p)<0)n.negate();p.addScaledVector(n,m*42);const angle=Math.atan2(t.x,t.z),center={x:p.x+Math.cos(angle)*m*3.5,z:p.z-Math.sin(angle)*m*3.5};if(!sceneryClearsRoad(roadSamples,center,angle,9,43,m))return null;return <group key={progress} position={[p.x,.215,p.z]} rotation={[0,Math.atan2(t.x,t.z),0]} scale={m}>{Array.from({length:8},(_,row)=><mesh key={row} position={[row*1.2,row*.7+.5,0]}><boxGeometry args={[1.3,row*1.4+1,80]}/><meshStandardMaterial color={row%2?'#7b929b':'#c0bfc1'} roughness={.85}/></mesh>)}<mesh position={[3.5,8,0]} rotation={[0,0,-.04]}><boxGeometry args={[17,.4,85]}/><meshStandardMaterial color={index%2?'#d1d2cc':'#b2b6b8'} metalness={.5} roughness={.5}/></mesh></group>})}
    {[.04,.18,.34,.53,.7,.89].flatMap(progress=>{const p=curve.getPointAt(progress),t=curve.getTangentAt(progress),n=new Vector3(-t.z,0,t.x).normalize();if(n.dot(p)<0)n.negate();return Array.from({length:5},(_,i)=>{const q=p.clone().addScaledVector(n,m*(60+i%2*20)).addScaledVector(t,m*(i-2)*14);return <group key={`${progress}-${i}`} position={[q.x,.215,q.z]} scale={m}><mesh position={[0,2,0]}><cylinderGeometry args={[.45,.65,4,6]}/><meshStandardMaterial color="#5e5d4d"/></mesh><mesh position={[0,6,0]}><sphereGeometry args={[3.8,6,5]}/><meshStandardMaterial color={i%2?'#566a3b':'#4b6441'} roughness={1}/></mesh></group>})})}
  </group>
}

function CircuitBarriers({furniture,m}:{furniture:{p:Vector3;n:Vector3;angle:number}[];m:number}){
  const ref=useRef<InstancedMesh>(null)
  useEffect(()=>{if(!ref.current)return;const object=new Object3D();let index=0;for(const {p,n,angle} of furniture)for(const side of [-1,1])for(const y of [.4,.85]){object.position.set(p.x+n.x*m*20*side,.215+m*y,p.z+n.z*m*20*side);object.rotation.set(0,angle,0);object.scale.set(m*.25,m*.26,m*32);object.updateMatrix();ref.current.setMatrixAt(index++,object.matrix)}ref.current.instanceMatrix.needsUpdate=true},[furniture,m])
  return <instancedMesh ref={ref} args={[undefined,undefined,furniture.length*4]} frustumCulled={false}><boxGeometry/><meshStandardMaterial color="#b4bbbc" metalness={.65} roughness={.48}/></instancedMesh>
}

function DriverMarker({driver,snapshot,projection,selected,onSelect,followTop=false}:{driver:HistoricalDriver;snapshot:MutableRefObject<RaceSnapshot>;projection:TrackProjection;selected:boolean;onSelect:()=>void;followTop?:boolean}){
  const sprite=useRef<Sprite>(null)
  const texture=useMemo(()=>{const canvas=document.createElement('canvas');canvas.width=256;canvas.height=96;const context=canvas.getContext('2d')!;context.fillStyle='#10222aee';context.beginPath();context.roundRect(1,1,254,94,12);context.fill();context.fillStyle=driverColor(driver);context.fillRect(1,10,7,76);context.font='bold 39px monospace';context.fillText(`${driver.number} ${driver.code}`,24,63);const map=new CanvasTexture(canvas);map.colorSpace=SRGBColorSpace;return map},[driver])
  useEffect(()=>()=>texture.dispose(),[texture])
  useFrame(()=>{if(!sprite.current)return;const state=snapshot.current.states.find(state=>state.driver.number===driver.number);sprite.current.visible=!!state&&locationVisible(state);if(state&&sprite.current.visible)sprite.current.position.copy(projection.point(state.location.x,state.location.y,.215+(selected?.17:.07)))},-1)
  const width=followTop?projection.meterScale*(selected?19:12):selected?.85:.42
  return <sprite ref={sprite} scale={[width,width*.375,1]} renderOrder={15} onClick={event=>{event.stopPropagation();onSelect()}}><spriteMaterial map={texture} transparent depthTest={false} depthWrite={false} toneMapped={false}/></sprite>
}

function visibilityShader(shader:{vertexShader:string;fragmentShader:string}){
  shader.vertexShader='attribute float replayOpacity; varying float vReplayOpacity;\n'+shader.vertexShader
  shader.vertexShader=shader.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\nvReplayOpacity = replayOpacity;')
  shader.fragmentShader='varying float vReplayOpacity;\n'+shader.fragmentShader
  shader.fragmentShader=shader.fragmentShader.replace('#include <alphatest_fragment>','diffuseColor.a *= vReplayOpacity;\n#include <alphatest_fragment>')
}

function DriverFleet({race,projection,snapshot,selectedDriver,onSelectDriver,onboard,telemetry,clockRef}:{race:HistoricalRace;projection:TrackProjection;snapshot:MutableRefObject<RaceSnapshot>;selectedDriver:number;onSelectDriver:(number:number)=>void;onboard:boolean;telemetry:TelemetrySample[];clockRef:MutableRefObject<ReplayClock>}){
  const parts=useMemo(()=>{const values=createFormulaCarParts();values.forEach(part=>part.geometry.setAttribute('replayOpacity',new InstancedBufferAttribute(new Float32Array(race.drivers.length).fill(1),1)));return values},[race.drivers.length]),instances=useRef<(InstancedMesh|null)[]>([]),interior=useRef<Group>(null),transform=useMemo(()=>new Object3D(),[]),parentMatrix=useMemo(()=>new Matrix4(),[]),partMatrix=useMemo(()=>new Matrix4(),[]),rotation=useMemo(()=>new Quaternion(),[])
  useEffect(()=>()=>parts.forEach(part=>part.geometry.dispose()),[parts])
  const selected=race.drivers.find(d=>d.number===selectedDriver)??race.drivers[0]
  useEffect(()=>{race.drivers.forEach((driver,index)=>{const paint=formulaTeamLivery(driver.team,driverColor(driver));parts.forEach((part,p)=>{instances.current[p]?.setColorAt(index,new Color(part.paint?paint[part.paint]:part.helmet?driver.number%2?'#e1e7a9':'#a9d6e7':part.color))})});instances.current.forEach(instance=>{if(instance?.instanceColor)instance.instanceColor.needsUpdate=true})},[race,parts])
  useFrame(()=>{
    if(interior.current)interior.current.visible=false
    const followed=snapshot.current.states.find(state=>state.driver.number===selectedDriver)
    snapshot.current.states.forEach((state,index)=>{
      if(!locationVisible(state)){instances.current.forEach(instance=>instance?.setMatrixAt(index,HIDDEN_MATRIX));return}
      const opacity=onboard&&followed&&state.driver.number!==selectedDriver?cockpitRivalVisibility(followed.location,state.location,projection.meterScale/projection.scale):1
      parts.forEach(part=>{const attribute=part.geometry.getAttribute('replayOpacity');attribute.setX(index,opacity);attribute.needsUpdate=true})
      if(opacity===0){instances.current.forEach(instance=>instance?.setMatrixAt(index,HIDDEN_MATRIX));return}
      const point=projection.point(state.location.x,state.location.y);rotation.setFromAxisAngle(UP,state.location.heading+Math.PI/2);parentMatrix.compose(point,rotation,new Vector3(projection.meterScale,projection.meterScale,projection.meterScale))
      parts.forEach((part,p)=>{if(onboard&&state.driver.number===selectedDriver&&(part.helmet||part.hideInside)){instances.current[p]?.setMatrixAt(index,HIDDEN_MATRIX);return}transform.position.set(...part.offset);transform.rotation.set(...(part.rotation??[0,0,0]));transform.scale.set(1,1,1);transform.updateMatrix();partMatrix.multiplyMatrices(parentMatrix,transform.matrix);instances.current[p]?.setMatrixAt(index,partMatrix);if(part.tyre)instances.current[p]?.setColorAt(index,new Color(historicalCompound(state.compound).color))})
      if(state.driver.number===selectedDriver&&interior.current){interior.current.visible=onboard;interior.current.position.copy(point);interior.current.quaternion.copy(rotation);interior.current.scale.setScalar(projection.meterScale)}
    })
    instances.current.forEach(instance=>{if(instance){instance.instanceMatrix.needsUpdate=true;if(instance.instanceColor)instance.instanceColor.needsUpdate=true}})
  },-1)
  const select=(event:ThreeEvent<MouseEvent>)=>{event.stopPropagation();if(event.instanceId!=null)onSelectDriver(race.drivers[event.instanceId].number)}
  return <group>{parts.map((part,index)=><instancedMesh key={index} ref={value=>{instances.current[index]=value}} args={[part.geometry,undefined,race.drivers.length]} frustumCulled={false} onClick={select}><meshStandardMaterial color="#ffffff" transparent depthWrite alphaTest={.01} onBeforeCompile={visibilityShader} customProgramCacheKey={()=>'replay-visibility-v2'} metalness={part.tyre?.02:part.paint?.45:.15} roughness={part.tyre?.92:part.paint?.34:.68}/></instancedMesh>)}<group ref={interior}><CockpitInterior color={driverColor(selected)} team={selected.team} number={selected.number} clockRef={clockRef} telemetry={telemetry}/></group></group>
}

function CameraDirector({mode,projection,selectedDriver,clockRef,snapshot,active,playing,look}:{mode:CameraMode;projection:TrackProjection;selectedDriver:number;clockRef:MutableRefObject<ReplayClock>;snapshot:MutableRefObject<RaceSnapshot>;active:boolean;playing:boolean;look:LookDirection}){
  const {camera,invalidate}=useThree(),previous=useRef({mode,selectedDriver,time:clockRef.current.current,initialized:false}),trackside=useRef<Vector3|null>(null),target=useMemo(()=>new Vector3(),[]),wanted=useMemo(()=>new Vector3(),[]),lastTarget=useMemo(()=>new Vector3(),[])
  useEffect(()=>{camera.up.set(0,mode==='top'||mode==='overview'?0:1,mode==='top'||mode==='overview'?-1:0);if('fov'in camera){camera.fov=mode==='onboard'?83:mode==='tcam'?74:mode==='chase'?60:mode==='trackside'?44:42;camera.near=mode==='onboard'||mode==='tcam'?Math.max(.000025,projection.meterScale*.025):.001;camera.far=160;camera.updateProjectionMatrix()}invalidate()},[mode,selectedDriver,playing,invalidate,camera,projection])
  useEffect(()=>invalidate(),[look,invalidate])
  useFrame((_,delta)=>{
    if(!active)return
    const state=snapshot.current.states.find(row=>row.driver.number===selectedDriver),now=snapshot.current.time,changed=previous.current.mode!==mode||previous.current.selectedDriver!==selectedDriver,seek=Math.abs(now-previous.current.time)>Math.max(1.25,clockRef.current.speed*.2),snap=changed||seek||!previous.current.initialized
    previous.current={mode,selectedDriver,time:now,initialized:true}
    if(mode==='strategist'){if(snap){camera.position.set(...OVERHEAD);camera.lookAt(...ORIGIN);invalidate()}trackside.current=null;return}
    if(mode==='overview'){
      const aspect='aspect'in camera?Number(camera.aspect):1
      camera.position.set(0,.215+circuitOverviewHeight(projection.width+.8,projection.depth+.8,aspect),0)
      camera.lookAt(0,.215,0);trackside.current=null;return
    }
    if(!state||!locationVisible(state))return
    const m=projection.meterScale,point=projection.point(state.location.x,state.location.y),angle=state.location.heading+Math.PI/2,forward=new Vector3(Math.sin(angle),0,Math.cos(angle)),normal=new Vector3(forward.z,0,-forward.x)
    target.copy(point)
    if(mode==='helicopter'){wanted.copy(point).addScaledVector(forward,-m*70).addScaledVector(normal,m*24);wanted.y=point.y+m*65;target.addScaledVector(forward,m*15)}
    else if(mode==='top'){wanted.copy(point);wanted.y+=m*155;target.copy(point)}
    else if(mode==='chase'){wanted.copy(point).addScaledVector(forward,-m*10);wanted.y+=m*3.3;target.addScaledVector(forward,m*10);target.y+=m*.7}
    else if(mode==='tcam'){wanted.copy(point).addScaledVector(forward,-m*1);wanted.y+=m*1.65;target.addScaledVector(forward,m*35);target.y+=m*.85}
    else if(mode==='trackside'){if(snap||!trackside.current||trackside.current.distanceTo(point)>m*150){trackside.current=point.clone().addScaledVector(normal,m*20).addScaledVector(forward,m*26);trackside.current.y=point.y+m*2.7}wanted.copy(trackside.current);target.y=point.y+m*.6}
    else {const pose=cockpitCameraPose(point,state.location.heading,m,look);wanted.copy(pose.position);target.copy(pose.target)}
    const attached=mode==='onboard'||mode==='tcam',alpha=snap||attached?1:1-Math.exp(-Math.min(delta,.08)*7);camera.position.lerp(wanted,alpha);if(snap||attached)lastTarget.copy(target);else lastTarget.lerp(target,alpha);camera.lookAt(lastTarget)
    if(!playing&&camera.position.distanceToSquared(wanted)>.00000001)invalidate()
  })
  return null
}
function HistoricalWorld({race,clockRef,selectedDriver,cameraMode,onSelectDriver,projection,active,playing,time,look,telemetry}:HistoricalSceneProps&{projection:TrackProjection;active:boolean;look:LookDirection;telemetry:TelemetrySample[]}){
  const snapshot=useRef<RaceSnapshot>({time,states:race.drivers.map(d=>getDriverState(race,d.number,time))}),invalidate=useThree(s=>s.invalidate)
  useEffect(()=>invalidate(),[time,selectedDriver,cameraMode,telemetry,invalidate]);useFrame(()=>{const current=clockRef.current.current;snapshot.current={time:current,states:race.drivers.map(d=>getDriverState(race,d.number,current))}},-2)
  return <group><ReferenceCircuit race={race} projection={projection} time={time} immersive={cameraMode==='onboard'}/><DriverFleet race={race} projection={projection} snapshot={snapshot} selectedDriver={selectedDriver} onSelectDriver={onSelectDriver} onboard={cameraMode==='onboard'} telemetry={telemetry} clockRef={clockRef}/>{['strategist','overview','top'].includes(cameraMode)&&race.drivers.map(driver=><DriverMarker key={driver.number} driver={driver} snapshot={snapshot} projection={projection} selected={driver.number===selectedDriver} followTop={cameraMode==='top'} onSelect={()=>onSelectDriver(driver.number)}/>)}<CameraDirector mode={cameraMode} projection={projection} selectedDriver={selectedDriver} clockRef={clockRef} snapshot={snapshot} active={active} playing={playing} look={look}/></group>
}
function Historical2D({race,time,selectedDriver,onSelectDriver,projection}:{race:HistoricalRace;time:number;selectedDriver:number;onSelectDriver:(number:number)=>void;projection:TrackProjection}){
  const width=projection.width+1.8,depth=projection.depth+1.8,project=(x:number,y:number)=>{const p=projection.point(x,y);return {x:p.x+width/2,y:p.z+depth/2}}
  const path=race.track.points.map(([x,y],i)=>{const p=project(x,y);return `${i?'L':'M'}${p.x.toFixed(3)} ${p.y.toFixed(3)}`}).join(' ')+'Z'
  return <div className="historical-2d"><svg viewBox={`0 0 ${width} ${depth}`} role="img" aria-label={`${race.meta.circuit} recorded reference trace and driver locations`}><path d={path} fill="none" stroke="#61776d" strokeWidth=".19" strokeLinejoin="round"/><path d={path} fill="none" stroke="#cad8ba" strokeWidth=".025"/>{race.drivers.map(d=>getDriverState(race,d.number,time)).filter(locationVisible).map(state=>{const p=project(state.location.x,state.location.y),selected=state.driver.number===selectedDriver,color=driverColor(state.driver);return <g key={state.driver.number} transform={`translate(${p.x} ${p.y})`} role="button" tabIndex={0} aria-label={`Follow ${state.driver.name}`} onClick={()=>onSelectDriver(state.driver.number)} onKeyDown={event=>{if(event.key==='Enter'||event.key===' '){event.preventDefault();onSelectDriver(state.driver.number)}}} className="historical-2d-driver"><title>{state.driver.name} · {state.location.status}</title>{selected&&<circle r=".27" fill="none" stroke={color} strokeWidth=".035"/>}<circle r={selected?'.14':'.1'} fill={color} stroke="#101a1f" strokeWidth=".045"/>{selected&&<text x=".27" y="-.23" fill={color} fontSize=".25" fontFamily="monospace">{state.driver.code}</text>}</g>})}</svg></div>
}

export default function HistoricalScene(props:HistoricalSceneProps){
  const {race,time,selectedDriver,cameraMode,playing}=props,projection=useMemo(()=>createProjection(race),[race]),selected=getDriverState(race,selectedDriver,time),visible=locationVisible(selected),status=selected.location.status
  const occluded=cameraMode==='onboard'?onboardCount(race,selected,time,projection):0
  const shell=useRef<HTMLDivElement>(null),drag=useRef<{id:number;x:number;y:number}|null>(null),lookFrame=useRef<number|null>(null),lookDelta=useRef({yaw:0,pitch:0})
  const [look,setLook]=useState<LookDirection>({yaw:0,pitch:-.035}),[fullscreen,setFullscreen]=useState(false),[telemetry,setTelemetry]=useState<TelemetrySample[]>([]),[presentation3D,setPresentation3D]=useState(true),onboard=cameraMode==='onboard'
  useEffect(()=>{if(lookFrame.current!=null)cancelAnimationFrame(lookFrame.current);lookFrame.current=null;lookDelta.current={yaw:0,pitch:0};setLook({yaw:0,pitch:-.035})},[selectedDriver,cameraMode])
  useEffect(()=>()=>{if(lookFrame.current!=null)cancelAnimationFrame(lookFrame.current)},[])
  useEffect(()=>{setTelemetry([]);if(!onboard)return;const controller=new AbortController();loadDriverTelemetry(race,selectedDriver,controller.signal).then(setTelemetry).catch(()=>{});return()=>controller.abort()},[race,selectedDriver,onboard])
  useEffect(()=>{const change=()=>setFullscreen(document.fullscreenElement===shell.current);document.addEventListener('fullscreenchange',change);return()=>document.removeEventListener('fullscreenchange',change)},[])
  useEffect(()=>{if(!fullscreen)return;const escape=(event:KeyboardEvent)=>{if(event.key==='Escape'&&!document.fullscreenElement)setFullscreen(false)};document.addEventListener('keydown',escape);return()=>document.removeEventListener('keydown',escape)},[fullscreen])
  const turn=(yaw:number,pitch=0)=>setLook(current=>{const nextYaw=Math.max(-Math.PI*.97,Math.min(Math.PI*.97,current.yaw+yaw)),nextPitch=Math.max(-1.05,Math.min(.75,current.pitch+pitch));return nextYaw===current.yaw&&nextPitch===current.pitch?current:{yaw:nextYaw,pitch:nextPitch}})
  const queueTurn=(yaw:number,pitch:number)=>{lookDelta.current.yaw+=yaw;lookDelta.current.pitch+=pitch;if(lookFrame.current!=null)return;lookFrame.current=requestAnimationFrame(()=>{const change=lookDelta.current;lookDelta.current={yaw:0,pitch:0};lookFrame.current=null;turn(change.yaw,change.pitch)})}
  const toggleFullscreen=()=>{if(fullscreen){if(document.fullscreenElement)void document.exitFullscreen();else setFullscreen(false)}else if(shell.current?.requestFullscreen)void shell.current.requestFullscreen().catch(()=>setFullscreen(true));else setFullscreen(true)}
  const gapMessage=selected.retired?`${selected.driver.code} is retired. No car is drawn after the final competitive lap.`:status==='gap'?`Location gap for ${selected.driver.code}. Car hidden until the next valid recorded bracket.`:status==='unavailable'?`No recorded location for ${selected.driver.code} at this time. Car hidden.`:`${selected.driver.code} finished. The last recorded finish point is held.`
  return <div ref={shell} className={`historical-scene-shell ${onboard?'is-immersive':''} ${fullscreen?'is-fullscreen':''}`}>
    <div className="hs-scene-heading"><div><span className="hs-kicker">RECORDED RACE / {race.meta.year}</span><h3>{race.meta.circuit} · {REPLAY_CAMERAS.find(view=>view.id===cameraMode)?.label}</h3></div><button className="hs-fullscreen" onClick={toggleFullscreen} aria-label={fullscreen?'Exit immersive fullscreen':'Open immersive fullscreen'}>{fullscreen?<Minimize2 size={15}/>:<Maximize2 size={15}/>}<span>{fullscreen?'Exit fullscreen':'Immersive view'}</span></button></div>
    <div className="hs-scene-stage">
      <SceneFrame label={`Historical ${race.meta.circuit} race reconstruction`} className={`historical-race-scene camera-${cameraMode}`} camera={OVERHEAD} target={ORIGIN} animated={playing} explicitPlayback={playing} interactive={cameraMode==='strategist'} motionControl={false} onPresentationChange={value=>setPresentation3D(value.is3D)} fallback={<Historical2D race={race} time={time} selectedDriver={selectedDriver} onSelectDriver={props.onSelectDriver} projection={projection}/>}>
        {({active})=><HistoricalWorld {...props} projection={projection} active={active} look={look} telemetry={telemetry}/>}
      </SceneFrame>
      <div className="hs-camera-readout"><span>{CAMERA_LABELS[cameraMode]}</span><b style={{color:driverColor(selected.driver)}}>{selected.driver.code} <em>#{selectedDriver} / {selected.driver.team}</em></b></div>
      {onboard&&presentation3D&&occluded>0&&<div className="hs-proximity-note" role="note"><b>Close-car visibility guard</b><span>{occluded} nearby {occluded===1?'model fades':'models fade'} where recorded coordinates overlap. Timing and overhead positions remain unchanged.</span></div>}
      {onboard&&presentation3D&&<>
        <div className="hs-look-zone" tabIndex={0} role="application" aria-label="Cockpit look-around. Drag to look. Use arrow keys to look around; R to face forward." onKeyDown={event=>{const keys:Record<string,[number,number]>={ArrowLeft:[.16,0],ArrowRight:[-.16,0],ArrowUp:[0,.12],ArrowDown:[0,-.12]};if(keys[event.key]){event.preventDefault();turn(...keys[event.key])}else if(event.key.toLowerCase()==='r'){event.preventDefault();setLook({yaw:0,pitch:-.035})}}} onPointerDown={event=>{if(event.button!==0)return;event.currentTarget.focus({preventScroll:true});event.currentTarget.setPointerCapture(event.pointerId);drag.current={id:event.pointerId,x:event.clientX,y:event.clientY}}} onPointerMove={event=>{if(!drag.current||drag.current.id!==event.pointerId)return;queueTurn(-(event.clientX-drag.current.x)*.005,-(event.clientY-drag.current.y)*.004);drag.current={id:event.pointerId,x:event.clientX,y:event.clientY}}} onPointerUp={event=>{if(event.currentTarget.hasPointerCapture(event.pointerId))event.currentTarget.releasePointerCapture(event.pointerId);drag.current=null}} onPointerCancel={()=>{drag.current=null}}/>
        <div className="hs-cockpit-tools" role="group" aria-label="Cockpit look direction"><button onClick={()=>turn(.45)} aria-label="Look left"><ArrowLeft size={15}/></button><button onClick={()=>turn(0,.2)} aria-label="Look up"><ArrowUp size={15}/></button><button onClick={()=>setLook({yaw:0,pitch:-.035})} aria-label="Face forward"><RotateCcw size={14}/><span>Forward</span></button><button onClick={()=>turn(0,-.2)} aria-label="Look down at cockpit"><ArrowDown size={15}/></button><button onClick={()=>turn(-.45)} aria-label="Look right"><ArrowRight size={15}/></button></div>
        <div className="hs-onboard-note">DRAG TO LOOK AROUND <span>Arrow keys · R to face forward</span></div>
      </>}
      {!visible&&!['strategist','overview'].includes(cameraMode)&&<div className="hs-location-notice" role="status"><span>LOCATION {selected.retired?'ENDED':'UNAVAILABLE'}</span><p>{gapMessage}</p><small>Camera holds its last valid view.</small></div>}
      {fullscreen&&<><button className="hs-fullscreen-exit" onClick={toggleFullscreen}><Minimize2 size={16}/>Exit fullscreen</button><div className="hs-fullscreen-player">
        <label>FOLLOW DRIVER<select aria-label="Fullscreen driver" value={selectedDriver} onChange={event=>props.onSelectDriver(Number(event.target.value))}>{race.drivers.map(driver=><option key={driver.number} value={driver.number}>{driver.number} · {driver.name}</option>)}</select></label>
        {props.onCameraChange&&<label>CAMERA<select aria-label="Fullscreen camera view" value={cameraMode} onChange={event=>props.onCameraChange?.(event.target.value as CameraMode)}>{REPLAY_CAMERAS.map(view=><option key={view.id} value={view.id}>{view.label}</option>)}</select></label>}
        {props.onTogglePlay&&<button className="hs-fullscreen-play" onClick={props.onTogglePlay} aria-label={playing?'Pause fullscreen replay':'Play fullscreen replay'}>{playing?<Pause size={17}/>:<Play size={17}/>}<span>{playing?'Pause':'Play'}</span></button>}
        {props.onSeek&&<label className="hs-fullscreen-timeline"><span>{formatRaceClock(time)} <b>/ {formatRaceClock(race.meta.duration)}</b></span><input type="range" aria-label="Fullscreen race timeline" min={0} max={race.meta.duration} step={.1} value={Math.min(time,race.meta.duration)} onChange={event=>props.onSeek?.(Number(event.target.value))}/></label>}
        {props.onSpeedChange&&<label>SPEED<select aria-label="Fullscreen playback speed" value={props.clockRef.current.speed} onChange={event=>props.onSpeedChange?.(Number(event.target.value))}>{[1,4,16,32].map(speed=><option key={speed} value={speed}>{speed}×</option>)}</select></label>}
      </div></>}
    </div>
    <div className="hs-data-strip"><span><i className={`hs-location-dot ${visible?'is-valid':''}`}/>{status==='interpolated'?'INTERPOLATED BETWEEN RECORDED SAMPLES':status==='recorded'?'RECORDED POSITION':status==='finished'?'LAST RECORDED FINISH POINT':'LOCATION COVERAGE GAP'}</span><span>ORIGINAL FORMULA-STYLE MODELS <i/>{race.coverage.sampleInterval.toFixed(1)}s data</span></div>
    <p className="hs-accuracy-note">Recorded positions drive every car; location gaps remain hidden. Driver-eye cameras, bodywork, track width and scenery are reconstructions. OpenF1 cannot resolve exact racing lines or wheel-to-wheel placement. In cockpit view, nearby rival models fade before overlapping the selected car; timing and overhead coordinates are unchanged. This visibility guard does not simulate collisions or alter historical trajectories. The cockpit display uses recorded telemetry; wheel steering and surveyed elevation are unavailable.</p>
  </div>
}
