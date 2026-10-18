import { Euler, Matrix4, Quaternion, Vector3 } from 'three'
import type { MotionPose } from '../../history/trackGuide'
import { CAR } from './carGeometry'

/**
 * Render-only chassis behaviour driven by the track-guided motion: suspension pitch
 * under braking and traction, roll from lateral load, aero squat, steering lock from
 * path curvature (bicycle model), wheel rotation from speed and kerb vibration.
 * None of these values are recorded telemetry; they animate the reconstruction.
 */
export type CarDynamics={
  initialized:boolean
  pitch:number;pitchV:number;roll:number;rollV:number;heave:number;heaveV:number
  steer:number;steerV:number;spin:number;spinRate:number
  speed:number;accel:number;lat:number;kerb:number;phase:number
}
export const createDynamics=():CarDynamics=>({initialized:false,pitch:0,pitchV:0,roll:0,rollV:0,heave:0,heaveV:0,steer:0,steerV:0,spin:0,spinRate:0,speed:0,accel:0,lat:0,kerb:0,phase:Math.random()*100})

/** Semi-implicit damped spring toward `target`; returns [value, velocity]. */
export function spring(value:number,velocity:number,target:number,omega:number,zeta:number,dt:number):[number,number]{
  if(!(dt>0))return [value,velocity]
  const steps=Math.max(1,Math.ceil(dt/.008)),h=dt/steps
  for(let i=0;i<steps;i++){velocity+=(omega*omega*(target-value)-2*zeta*omega*velocity)*h;value+=velocity*h}
  return [value,velocity]
}
const clamp=(v:number,lo:number,hi:number)=>Math.max(lo,Math.min(hi,v))

/** Front-wheel steer angle (rad, positive left) needed to follow `curvature` (1/m). */
export const steerForCurvature=(curvature:number)=>clamp(Math.atan(CAR.wheelbase*curvature),-.42,.42)
/** Nose-down pitch (rad) for a longitudinal acceleration (m/s²); braking dives, traction squats. */
export const pitchForAccel=(accel:number)=>clamp(-accel*.00062,-.012,.032)
/** Body roll (rad) for left-positive lateral acceleration (m/s²): the body leans to the outside. */
export const rollForLateral=(lateral:number)=>clamp(lateral*.00052,-.034,.034)

export function updateDynamics(state:CarDynamics,pose:MotionPose,wallDt:number,replayDt:number,snap:boolean){
  // Raw accelerations come from 1 Hz data; clip outliers before they reach the springs.
  const speed=clamp(pose.speed,0,95),accel=clamp(pose.accel,-55,22),lat=clamp(pose.latAccel,-60,60)
  const edge=Math.abs(pose.d-pose.roadOffset)-(pose.halfWidth-1.25)
  const onKerb=pose.mode===1&&edge>0&&Math.abs(pose.curvature)>1/450?clamp(edge/.6,0,1):0
  if(snap||!state.initialized){
    state.initialized=true;state.speed=speed;state.accel=accel;state.lat=lat
    state.pitch=pitchForAccel(accel);state.roll=rollForLateral(lat);state.steer=speed>1?steerForCurvature(pose.curvature):state.steer
    state.pitchV=state.rollV=state.steerV=state.heaveV=0;state.heave=0;state.kerb=onKerb
  }
  const dt=clamp(wallDt,0,.1)
  const follow=1-Math.exp(-dt*9)
  state.speed+=(speed-state.speed)*follow;state.accel+=(accel-state.accel)*(1-Math.exp(-dt*5));state.lat+=(lat-state.lat)*(1-Math.exp(-dt*7))
  state.kerb+=(onKerb-state.kerb)*(1-Math.exp(-dt*12))
  ;[state.pitch,state.pitchV]=spring(state.pitch,state.pitchV,pitchForAccel(state.accel),9,.55,dt)
  ;[state.roll,state.rollV]=spring(state.roll,state.rollV,rollForLateral(state.lat),10,.6,dt)
  const steerTarget=speed>1.5?steerForCurvature(pose.curvature):state.steer
  ;[state.steer,state.steerV]=spring(state.steer,state.steerV,steerTarget,16,.85,dt)
  // Downforce compresses the springs at speed (about 12 mm at 300 km/h).
  const squat=-.012*(state.speed/83)**2
  ;[state.heave,state.heaveV]=spring(state.heave,state.heaveV,squat,14,.5,dt)
  state.spinRate=state.speed/CAR.wheelRadius
  state.spin=(state.spin+speed/CAR.wheelRadius*Math.max(0,replayDt))%(Math.PI*2)
  if(replayDt!==0)state.phase+=Math.abs(replayDt)
}

const CG=new Matrix4().makeTranslation(0,.3,-.2),CG_BACK=new Matrix4().makeTranslation(0,-.3,.2)
const scratch={ground:new Matrix4(),local:new Matrix4(),q:new Quaternion(),e:new Euler(),v:new Vector3(),s:new Vector3(1,1,1)}
/** Ground frame: position + heading + road grade. */
export function groundMatrix(pose:MotionPose,out:Matrix4,lateral=0){
  const nx=Math.cos(pose.yaw),nz=-Math.sin(pose.yaw)
  scratch.e.set(-Math.atan(clamp(pose.grade,-.3,.3)),pose.yaw,0,'YXZ')
  scratch.q.setFromEuler(scratch.e)
  return out.compose(scratch.v.set(pose.x+nx*lateral,pose.y,pose.z+nz*lateral),scratch.q,scratch.s.set(1,1,1))
}
/** Sprung-mass transform: ground × heave × pitch × roll about the centre of gravity. */
export function chassisMatrix(ground:Matrix4,state:CarDynamics,out:Matrix4){
  const t=state.phase,buzz=state.kerb*(Math.sin(t*61)*.6+Math.sin(t*37)*.4)
  const engine=.0006*Math.min(1,state.speed/20)*Math.sin(t*93)
  scratch.e.set(state.pitch+buzz*.004,0,state.roll+buzz*.006,'YXZ')
  scratch.q.setFromEuler(scratch.e)
  scratch.local.compose(scratch.v.set(0,state.heave+buzz*.006+engine,0),scratch.q,scratch.s.set(1,1,1))
  // Rotate about the centre of gravity (~0.3 m high, slightly behind mid-wheelbase).
  return out.copy(ground).multiply(CG).multiply(scratch.local).multiply(CG_BACK)
}
const wheelScratch={m:new Matrix4(),q:new Quaternion(),e:new Euler(),p:new Vector3(),s:new Vector3()}
export function wheelMatrix(ground:Matrix4,state:CarDynamics,slot:{x:number;z:number;width:number;front:boolean},out:Matrix4){
  const bump=state.kerb*Math.sin(state.phase*53+slot.x*7)*.01
  wheelScratch.e.set(state.spin,slot.front?state.steer:0,0,'YXZ')
  wheelScratch.q.setFromEuler(wheelScratch.e)
  wheelScratch.m.compose(wheelScratch.p.set(slot.x,CAR.wheelRadius+bump,slot.z),wheelScratch.q,wheelScratch.s.set(slot.width,1,1))
  return out.copy(ground).multiply(wheelScratch.m)
}
