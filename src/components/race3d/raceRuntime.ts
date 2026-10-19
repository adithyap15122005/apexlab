import { Color, Matrix4 } from 'three'
import { getDriverState, sampleTelemetry } from '../../history/replay'
import { createDriverMotion, emptyPose, sampleMotion, toWorld, wrap, type DriverMotion, type MotionPose, type TrackGuide } from '../../history/trackGuide'
import { historicalCompound, type DriverRaceState, type HistoricalDriver, type HistoricalRace, type TelemetrySample } from '../../history/types'
import { boxWeight, pitPhase, planPitStops, type PitPhase, type PitStopPlan } from '../../history/pitStops'
import { formulaTeamLivery } from '../historical/FormulaCarModel'
import { footprintSeparation } from '../historical/replayPresentation'
import { chassisMatrix, createDynamics, groundMatrix, spring, updateDynamics, wheelMatrix, type CarDynamics } from './vehicleDynamics'
import { CAR } from './carGeometry'

export type CarRuntime={
  index:number;driver:HistoricalDriver;state:DriverRaceState|null;visible:boolean;moving:boolean
  pose:MotionPose;dynamics:CarDynamics;motion:DriverMotion|null;guided:boolean
  lateral:number;lateralV:number;fade:number;flap:number;rainLight:number;lod:0|1;distance:number
  ground:Matrix4;chassis:Matrix4;wheels:Matrix4[]
  livery:{a:Color;b:Color;c:Color};helmet:Color;tcam:Color;compound:Color
  /** The pit stop in progress, if any: phase, service progress and how firmly the car is held in its box. */
  pit:{plan:PitStopPlan;phase:PitPhase;progress:number;weight:number}|null
  /** Jack height (m) and whether the wheels are off the car during the tyre change. */
  lift:number;wheelsOff:boolean
}
export type PitBox={x:number;y:number;z:number;yaw:number}
export type TrackStatus='green'|'yellow'|'sc'|'vsc'|'red'|'chequered'
export type RaceRuntime={
  cars:CarRuntime[];time:number;initialized:boolean;status:TrackStatus;rain:boolean
  pending:number[]
  /** Every recorded pit stop, and where each car stood in its box once motion is ready. */
  pitStops:PitStopPlan[];boxes:Map<PitStopPlan,PitBox>;boxesReady:boolean
}

const HELMETS=['#f4d03f','#e8ecef','#2f6fd6','#e3342f','#f28c28','#18b4a8','#9b59b6','#1b1f24','#d5ff3f','#ff5fa2']
const hash=(text:string)=>Array.from(text).reduce((h,c)=>(h*31+c.charCodeAt(0))>>>0,7)
const driverColor=(driver:HistoricalDriver)=>/^#?[0-9a-f]{6}$/i.test(driver.color)?`#${driver.color.replace('#','')}`:'#c8d9ba'

export function createRuntime(race:HistoricalRace):RaceRuntime{
  // The second-numbered team-mate carries the fluorescent-yellow T-camera, as in the regulations.
  const byTeam=new Map<string,number[]>()
  race.drivers.forEach(d=>byTeam.set(d.team,[...(byTeam.get(d.team)??[]),d.number].sort((a,b)=>a-b)))
  return {
    time:0,initialized:false,status:'green',rain:false,pending:race.drivers.map((_,i)=>i),
    pitStops:planPitStops(race),boxes:new Map(),boxesReady:false,
    cars:race.drivers.map((driver,index)=>{
      const paint=formulaTeamLivery(driver.team,driverColor(driver)),teammates=byTeam.get(driver.team)??[]
      return {
        index,driver,state:null,visible:false,moving:false,pose:emptyPose(),dynamics:createDynamics(),motion:null,guided:false,
        lateral:0,lateralV:0,fade:1,flap:0,rainLight:0,lod:1,distance:Infinity,
        ground:new Matrix4(),chassis:new Matrix4(),wheels:[0,1,2,3].map(()=>new Matrix4()),
        livery:{a:new Color(paint.primary),b:new Color(paint.secondary),c:new Color(paint.accent)},
        helmet:new Color(HELMETS[hash(driver.code)%HELMETS.length]),
        tcam:new Color(teammates.length>1&&teammates.indexOf(driver.number)===1?'#e6ff1f':'#101214'),
        compound:new Color('#f2dc5c'),pit:null,lift:0,wheelsOff:false,
      }
    }),
  }
}

/** Builds guided motion for a few cars per call so loading never blocks a frame for long. */
export function buildPendingMotion(runtime:RaceRuntime,race:HistoricalRace,guide:TrackGuide|null,budgetMs=10,priority?:number){
  const start=performance.now()
  if(priority!=null){const i=runtime.pending.indexOf(priority);if(i>0){runtime.pending.splice(i,1);runtime.pending.unshift(priority)}}
  while(runtime.pending.length&&performance.now()-start<budgetMs){
    const car=runtime.cars[runtime.pending.shift()!]
    const samples=race.locations[car.driver.number]??[]
    car.motion=samples.length?createDriverMotion(guide,samples,race.coverage.maxInterpolationGap):null
  }
  return runtime.pending.length===0
}

export function trackStatus(race:HistoricalRace,time:number):TrackStatus{
  let status:TrackStatus='green'
  for(const event of race.events){
    if(event.time>time)break
    const message=event.message.toUpperCase(),flag=(event.flag??'').toUpperCase()
    // Word boundaries matter: "CHEQUERED FLAG" contains the letters of "RED FLAG".
    if(flag==='RED'||/\bRED FLAG\b/.test(message))status='red'
    else if(flag==='CHEQUERED')status='chequered'
    else if(/VIRTUAL SAFETY CAR DEPLOYED/.test(message))status='vsc'
    else if(/^SAFETY CAR DEPLOYED/.test(message))status='sc'
    else if(/VIRTUAL SAFETY CAR ENDING|SAFETY CAR IN THIS LAP/.test(message))status='yellow'
    else if(flag==='GREEN'||/TRACK CLEAR|GREEN LIGHT/.test(message))status='green'
    else if(flag==='CLEAR'&&status==='yellow')status='green'
  }
  return status
}

const visibleStatus=(state:DriverRaceState)=>['recorded','interpolated','finished'].includes(state.location.status)&&Number.isFinite(state.location.x)

type UpdateOptions={guide:TrackGuide|null;time:number;wallDt:number;selected:number;onboard:boolean;telemetry:TelemetrySample[];camera:{x:number;y:number;z:number}}
export function updateRuntime(runtime:RaceRuntime,race:HistoricalRace,options:UpdateOptions){
  const {guide,time,wallDt,selected,onboard,telemetry,camera}=options
  const replayDt=runtime.initialized?time-runtime.time:0
  const snap=!runtime.initialized||Math.abs(replayDt)>2.5||replayDt<0
  runtime.time=time;runtime.initialized=true
  runtime.status=trackStatus(race,time)
  runtime.rain=race.weather.filter(w=>w.time<=time).at(-1)?.rainfall===1
  const maxGap=race.coverage.maxInterpolationGap
  // Once every car's motion is ready, find where each one stood in its pit box.
  if(!runtime.boxesReady&&!runtime.pending.length){
    for(const plan of runtime.pitStops){
      const car=runtime.cars.find(c=>c.driver.number===plan.driver)
      if(!plan.standard||!car?.motion)continue
      const pose=sampleMotion(guide,car.motion,plan.stopAt,maxGap,emptyPose())
      if(pose)runtime.boxes.set(plan,{x:pose.x,y:pose.y,z:pose.z,yaw:pose.yaw})
    }
    runtime.boxesReady=true
  }
  for(const car of runtime.cars){
    const state=getDriverState(race,car.driver.number,time)
    car.state=state;car.visible=false;car.moving=false
    if(!visibleStatus(state))continue
    const finished=state.location.status==='finished'
    const at=finished?state.location.sampleTime??time:time
    const pose=car.motion?sampleMotion(guide,car.motion,at,maxGap,car.pose):null
    if(pose){car.guided=pose.mode!==0}
    else{
      // Motion still loading (or a glitch bracket): fall back to the recorded point.
      if(car.motion&&!finished)continue
      const w=toWorld(guide?.frame??{unitsPerMeter:10,cx:0,cy:0,z0:0},state.location.x,state.location.y,state.location.z)
      Object.assign(car.pose,{x:w.x,y:w.y,z:w.z,yaw:state.location.heading+Math.PI/2,speed:0,accel:0,latAccel:0,yawRate:0,grade:0,mode:0,curvature:0})
      car.guided=false
    }
    if(finished){car.pose.speed=0;car.pose.accel=0;car.pose.latAccel=0;car.pose.curvature=0}
    car.compound.set(historicalCompound(state.compound).color)
    applyPitStop(runtime,car,time)
    car.visible=true;car.moving=car.pose.speed>.5
  }
  separate(runtime,guide,wallDt,snap)
  const sample=telemetry.length?sampleTelemetry(telemetry,time):null
  for(const car of runtime.cars){
    if(!car.visible)continue
    updateDynamics(car.dynamics,car.pose,wallDt,replayDt,snap)
    groundMatrix(car.pose,car.ground,car.lateral)
    chassisMatrix(car.ground,car.dynamics,car.chassis)
    car.wheels.forEach((m,i)=>wheelMatrix(car.ground,car.dynamics,WHEELS[i],m))
    // On the jacks, the whole car (and any fitted wheel) rises a few centimetres.
    if(car.lift>0){car.chassis.elements[13]+=car.lift;car.wheels.forEach(m=>{m.elements[13]+=car.lift})}
    // DRS opens only where recorded telemetry says so (OpenF1 values 10, 12, 14).
    const drsOpen=car.driver.number===selected&&sample&&sample.sampleAge<=2&&(sample.drs??0)>=10?1:0
    car.flap+=(drsOpen-car.flap)*(1-Math.exp(-Math.min(wallDt,.1)*10))
    car.rainLight=runtime.rain?1:0
    const dx=car.pose.x-camera.x,dy=car.pose.y-camera.y,dz=car.pose.z-camera.z
    car.distance=Math.sqrt(dx*dx+dy*dy+dz*dz)
    car.lod=car.distance<70||car.driver.number===selected?0:1
  }
  // Cockpit visibility guard: fade any rival body that still intersects the driver's car.
  const own=runtime.cars.find(c=>c.driver.number===selected)
  for(const car of runtime.cars){
    car.fade=1
    if(!onboard||!own?.visible||car===own||!car.visible)continue
    const gap=footprintSeparation(foot(own),foot(car)),t=Math.max(0,Math.min(1,(gap+.15)/.55))
    car.fade=t*t*(3-2*t)
  }
}
const WHEELS=[{x:CAR.frontTrack,z:CAR.frontAxle,width:CAR.frontTyreWidth,front:true},{x:-CAR.frontTrack,z:CAR.frontAxle,width:CAR.frontTyreWidth,front:true},{x:CAR.rearTrack,z:CAR.rearAxle,width:CAR.rearTyreWidth,front:false},{x:-CAR.rearTrack,z:CAR.rearAxle,width:CAR.rearTyreWidth,front:false}]
const foot=(car:CarRuntime)=>{const nx=Math.cos(car.pose.yaw),nz=-Math.sin(car.pose.yaw);return {x:car.pose.x+nx*car.lateral,z:car.pose.z+nz*car.lateral,heading:car.pose.yaw-Math.PI/2}}

/**
 * Render-only lateral separation. The provider cannot resolve which side of a rival a
 * car is on, so recorded points can overlap. Overlapping bodies are eased apart across
 * the road; progress along the lap (and therefore every gap and position) is unchanged.
 */
function separate(runtime:RaceRuntime,guide:TrackGuide|null,wallDt:number,snap:boolean){
  const cars=runtime.cars.filter(c=>c.visible&&c.guided&&!(c.pit&&c.pit.weight>.3))
  const target=new Map<CarRuntime,number>(cars.map(c=>[c,0]))
  if(guide)for(let iteration=0;iteration<4;iteration++){
    for(let i=0;i<cars.length;i++)for(let j=i+1;j<cars.length;j++){
      const a=cars[i],b=cars[j]
      if(a.pose.mode!==b.pose.mode)continue
      const length=a.pose.mode===1?guide.track.length:Infinity
      const ds=Math.abs(a.pose.mode===1?wrap(a.pose.s-b.pose.s,length):a.pose.s-b.pose.s)
      if(ds>5.9)continue
      const need=ds<5.3?2.25:2.25*(5.9-ds)/.6
      const da=a.pose.d+target.get(a)!,db=b.pose.d+target.get(b)!,gap=Math.abs(da-db)
      if(gap>=need)continue
      const push=(need-gap)/2,dir=da>db||(da===db&&a.driver.number<b.driver.number)?1:-1
      target.set(a,target.get(a)!+dir*push);target.set(b,target.get(b)!-dir*push)
    }
    for(const car of cars){
      // Keep the separated cars on the racing surface.
      const half=car.pose.halfWidth-.95,lo=car.pose.roadOffset-half,hi=car.pose.roadOffset+half
      const d=car.pose.d+target.get(car)!
      target.set(car,Math.max(lo,Math.min(hi,d))-car.pose.d)
    }
  }
  for(const car of runtime.cars){
    const goal=target.get(car)??0
    if(snap||!car.visible){car.lateral=goal;car.lateralV=0;continue}
    ;[car.lateral,car.lateralV]=spring(car.lateral,car.lateralV,goal,11,1,Math.min(wallDt,.1))
  }
}

/**
 * Render-only pit stop: the car is eased into the spot where its recorded positions stood
 * still, held there for the stationary time (recorded, or a typical 2.5 s), lifted on the
 * jacks while the wheels are changed, then released. Timing and positions are unchanged.
 */
function applyPitStop(runtime:RaceRuntime,car:CarRuntime,time:number){
  car.pit=null;car.lift=0;car.wheelsOff=false
  const plan=runtime.pitStops.find(p=>p.driver===car.driver.number&&time>=p.entry-1&&time<=p.exit+1)
  const phase=plan?pitPhase(plan,time):null
  if(!plan||!phase)return
  const box=runtime.boxes.get(plan),weight=box?boxWeight(plan,time):0
  if(box&&weight>0){
    const pose=car.pose,keep=1-weight
    pose.x+=(box.x-pose.x)*weight;pose.y+=(box.y-pose.y)*weight;pose.z+=(box.z-pose.z)*weight
    pose.yaw+=wrap(box.yaw-pose.yaw,Math.PI*2)*weight
    pose.speed*=keep;pose.accel*=keep;pose.latAccel*=keep;pose.yawRate*=keep;pose.curvature*=keep;pose.grade*=keep
  }
  car.pit={plan,phase:phase.phase,progress:phase.progress,weight}
  const k=phase.progress
  if(phase.phase==='service'){
    const up=Math.min(1,Math.max(0,(k-.05)/.08)),down=Math.min(1,Math.max(0,(.95-k)/.06))
    car.lift=.065*Math.min(up,down)
    car.wheelsOff=k>.18&&k<.8
  }
  // The new compound goes on halfway through the change.
  car.compound.set(historicalCompound(phase.phase==='approach'||(phase.phase==='service'&&k<.55)?plan.from:plan.to).color)
}
