import { useEffect, useMemo, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { Euler, Matrix4, PerspectiveCamera, Quaternion, Vector3 } from 'three'
import { pathFrame, wrap, type TrackGuide } from '../../history/trackGuide'
import type { CameraMode } from '../../history/types'
import { circuitOverviewHeight } from '../historical/replayPresentation'
import { CAR } from './carGeometry'
import type { RaceRuntime } from './raceRuntime'

export type { Obstacle }
export type LookDirection={yaw:number;pitch:number}
export type CameraFx={speedBlur:number;center:[number,number];onboard:boolean}
type Shot=Exclude<CameraMode,'director'|'strategist'|'overview'|'top'>
type TvCamera={s:number;x:number;y:number;z:number}

const UP=new Vector3(0,1,0)
const clamp=(v:number,lo:number,hi:number)=>Math.max(lo,Math.min(hi,v))
const ease=(t:number)=>t<.5?2*t*t:1-(-2*t+2)**2/2

type Obstacle={x:number;z:number;yaw:number;w:number;d:number;h:number;y:number}
const inside=(o:Obstacle,x:number,y:number,z:number,margin:number)=>{
  const c=Math.cos(o.yaw),s=Math.sin(o.yaw),dx=x-o.x,dz=z-o.z,lx=dx*c-dz*s,lz=dx*s+dz*c
  return Math.abs(lx)<o.w/2+margin&&Math.abs(lz)<o.d/2+margin&&y<o.y+o.h+margin
}
/** Broadcast-style trackside camera positions beyond the barriers, clear of buildings and stands. */
export function tvCameras(guide:TrackGuide,obstacles:Obstacle[]=[],street=false):TvCamera[]{
  const path=guide.track,cameras:TvCamera[]=[],spacing=street?150:210
  for(let s=0,k=0;s<path.length;s+=spacing,k++){
    const f=pathFrame(path,s+spacing*.35),preferred=Math.abs(f.curvature)>1/600?(f.curvature>0?-1:1):(k%2?1:-1)
    let placed:TvCamera|null=null
    for(const side of [preferred,-preferred])for(const reach of street?[7,11,4]:[20+(k%3)*5,13,28]){
      if(placed)break
      const w=f.offset+side*(path.halfWidth+reach),x=f.x+f.tz*w,z=f.z-f.tx*w,y=f.y+(street?11+(k%3)*3:5+(k%4)*2.2)
      if(!obstacles.some(o=>inside(o,x,y,z,3)))placed={s,x,y,z}
    }
    if(placed)cameras.push(placed)
  }
  return cameras
}

export default function CameraRig({mode,runtime,selected,look,guide,bounds,active,fx,obstacles,street}:{mode:CameraMode;runtime:{current:RaceRuntime};selected:number;look:LookDirection;guide:TrackGuide|null;bounds:{x:number;z:number;width:number;depth:number;y:number};active:boolean;fx:{current:CameraFx};obstacles:Obstacle[];street:boolean}){
  const {camera,invalidate,size}=useThree(),cam=camera as PerspectiveCamera
  const tv=useMemo(()=>guide?tvCameras(guide,obstacles,street):[],[guide,obstacles,street])
  const state=useRef({
    mode:mode as CameraMode,shot:'chase' as Shot,shotUntil:0,selected,time:0,initialized:false,
    blendFrom:{pos:new Vector3(),quat:new Quaternion(),fov:50},blend:1,
    orbitReady:false,chaseYaw:0,chasePos:new Vector3(),heliPos:new Vector3(),heliTarget:new Vector3(),tvIndex:-1,tvTarget:new Vector3(),tvFov:30,
  })
  const tmp=useMemo(()=>({m:new Matrix4(),q:new Quaternion(),q2:new Quaternion(),e:new Euler(),p:new Vector3(),t:new Vector3(),f:new Vector3(),s:new Vector3()}),[])
  useEffect(()=>{
    const s=state.current
    if(s.initialized&&s.mode!==mode&&mode!=='strategist'){s.blendFrom.pos.copy(cam.position);s.blendFrom.quat.copy(cam.quaternion);s.blendFrom.fov=cam.fov;s.blend=0}
    s.mode=mode;invalidate()
  },[mode,cam,invalidate])
  useEffect(()=>invalidate(),[look,selected,invalidate])

  useFrame((_,delta)=>{
    if(!active)return
    const s=state.current,rt=runtime.current,car=rt.cars.find(c=>c.driver.number===selected)
    const jump=Math.abs(rt.time-s.time)>2.5||s.selected!==selected||!s.initialized
    s.time=rt.time;s.selected=selected;s.initialized=true
    const dt=Math.min(delta,.1)
    let effective:CameraMode=mode
    if(mode==='director'){
      if(jump||performance.now()>s.shotUntil){
        const r=Math.random(),pick:Shot=r<.38?'trackside':r<.53?'helicopter':r<.68?'onboard':r<.8?'chase':r<.9?'rear':r<.95?'tcam':'nose'
        s.shot=pick===s.shot?'trackside':pick;s.shotUntil=performance.now()+(5500+Math.random()*4500);s.tvIndex=-1;s.blend=1
      }
      effective=s.shot
    }
    if(effective==='strategist'){
      if(!s.orbitReady){cam.up.copy(UP);cam.position.set(bounds.x+bounds.width*.55,bounds.y+Math.max(bounds.width,bounds.depth)*.5,bounds.z+bounds.depth*.65);cam.lookAt(bounds.x,bounds.y,bounds.z);s.orbitReady=true}
      cam.near=1;cam.far=40000;cam.fov=42;cam.up.copy(UP);cam.updateProjectionMatrix();fx.current.speedBlur=0;fx.current.onboard=false
      return
    }
    s.orbitReady=false
    if(effective==='overview'){
      const height=circuitOverviewHeight(bounds.width+120,bounds.depth+120,size.width/Math.max(1,size.height))
      cam.up.set(0,0,-1);cam.position.set(bounds.x,bounds.y+height,bounds.z);cam.lookAt(bounds.x,bounds.y,bounds.z)
      cam.fov=42;cam.near=5;cam.far=60000;cam.updateProjectionMatrix();fx.current.speedBlur=0;fx.current.onboard=false
      return
    }
    if(!car||!car.visible)return
    const pose=car.pose,dyn=car.dynamics,speedNorm=clamp(dyn.speed/85,0,1)
    const nx=Math.cos(pose.yaw),nz=-Math.sin(pose.yaw),carX=pose.x+nx*car.lateral,carZ=pose.z+nz*car.lateral,carY=pose.y
    const position=tmp.p,quat=tmp.q
    let fov=50,near=.05,far=40000
    cam.up.copy(UP)
    const attached=(local:[number,number,number],yaw:number,pitch:number,roll=0)=>{
      tmp.m.copy(car.chassis)
      position.set(...local).applyMatrix4(tmp.m)
      tmp.m.decompose(tmp.f,quat,tmp.s)
      tmp.e.set(pitch,Math.PI+yaw,roll,'YXZ');tmp.q2.setFromEuler(tmp.e);quat.multiply(tmp.q2)
    }
    if(effective==='onboard'){
      // Helmet camera: the head shifts against lateral and longitudinal load and buzzes at speed.
      const lat=clamp(dyn.lat,-55,55),acc=clamp(dyn.accel,-55,20),t=dyn.phase,buzz=speedNorm*.0012+dyn.kerb*.006
      const local:[number,number,number]=[CAR.eye.x-lat*.0005+Math.sin(t*47)*buzz,CAR.eye.y+Math.sin(t*71)*buzz,CAR.eye.z-acc*.0004]
      attached(local,look.yaw,look.pitch-.06,-lat*.00045+Math.sin(t*29)*buzz*.6)
      fov=66+speedNorm*5;near=.02
    }else if(effective==='tcam'){attached([0,1.1,-.02],0,-.1);fov=60;near=.03}
    else if(effective==='nose'){attached([0,.68,1.32],0,-.045);fov=64;near=.02}
    else if(effective==='rear'){attached([0,1.12,-.36],Math.PI,-.14);fov=58;near=.03}
    else if(effective==='chase'){
      // The chase camera trails the car's heading with a lag, so it rotates into corners.
      if(jump)s.chaseYaw=pose.yaw
      s.chaseYaw+=wrap(pose.yaw-s.chaseYaw,Math.PI*2)*(1-Math.exp(-dt*4.2))
      const back=5.3+dyn.speed*.012,fx2=Math.sin(s.chaseYaw),fz2=Math.cos(s.chaseYaw)
      const wanted=tmp.t.set(carX-fx2*back,carY+1.38+speedNorm*.12,carZ-fz2*back)
      // Heading lag alone gives the motion; only the height is softened so kerbs don't jolt the view.
      if(jump)s.chasePos.copy(wanted);else{s.chasePos.x=wanted.x;s.chasePos.z=wanted.z;s.chasePos.y+=(wanted.y-s.chasePos.y)*(1-Math.exp(-dt*10))}
      position.copy(s.chasePos)
      tmp.f.set(carX+fx2*5,carY+.62,carZ+fz2*5)
      tmp.m.lookAt(position,tmp.f,UP);quat.setFromRotationMatrix(tmp.m)
      fov=50+speedNorm*8
    }else if(effective==='top'){
      cam.up.set(0,0,-1);position.set(carX,carY+150,carZ);tmp.m.lookAt(position,tmp.f.set(carX,carY,carZ),cam.up);quat.setFromRotationMatrix(tmp.m);fov=42;near=2
    }else if(effective==='helicopter'){
      const angle=rt.time*.025+selected,reach=street?70:110,wanted=tmp.t.set(carX+Math.sin(angle)*reach,carY+(street?120:70),carZ+Math.cos(angle)*reach)
      if(jump){s.heliPos.copy(wanted);s.heliTarget.set(carX,carY,carZ)}
      s.heliPos.lerp(wanted,1-Math.exp(-dt*1.5));s.heliTarget.lerp(tmp.f.set(carX+Math.sin(pose.yaw)*dyn.speed*.4,carY,carZ+Math.cos(pose.yaw)*dyn.speed*.4),1-Math.exp(-dt*4))
      position.copy(s.heliPos);tmp.m.lookAt(position,s.heliTarget,UP);quat.setFromRotationMatrix(tmp.m);fov=24;near=1
    }else{
      // Trackside TV camera: the nearest camera ahead of the car; pans and zooms to follow.
      if(tv.length&&pose.mode===1&&guide){
        const L=guide.track.length
        const valid=(i:number)=>{const ahead=wrap(tv[i].s-pose.s,L);return ahead>-70&&ahead<230}
        if(s.tvIndex<0||jump||!valid(s.tvIndex)){
          let best=-1,bestAhead=Infinity
          tv.forEach((c,i)=>{const ahead=wrap(c.s-pose.s,L);if(ahead>-20&&ahead<bestAhead){best=i;bestAhead=ahead}})
          s.tvIndex=best;s.tvTarget.set(carX,carY+.5,carZ)
        }
      }else if(s.tvIndex<0||jump){
        s.tvIndex=-2;s.tvTarget.set(carX,carY,carZ)
      }
      const c=s.tvIndex>=0?tv[s.tvIndex]:{x:carX+30,y:carY+8,z:carZ+30}
      if(s.tvIndex===-2&&s.tvTarget.distanceTo(tmp.t.set(carX,carY,carZ))>200)s.tvIndex=-1
      position.set(c.x,c.y,c.z)
      s.tvTarget.lerp(tmp.t.set(carX,carY+.5,carZ),jump?1:1-Math.exp(-dt*7))
      tmp.m.lookAt(position,s.tvTarget,UP);quat.setFromRotationMatrix(tmp.m)
      const distance=position.distanceTo(s.tvTarget),wantedFov=clamp(2*Math.atan(11/Math.max(1,distance))*180/Math.PI,5,48)
      s.tvFov=jump?wantedFov:s.tvFov+(wantedFov-s.tvFov)*(1-Math.exp(-dt*3))
      fov=s.tvFov;near=.5
    }
    if(mode==='director'||jump)s.blend=1
    if(s.blend<1){
      s.blend=Math.min(1,s.blend+dt/.75)
      const k=ease(s.blend)
      cam.position.copy(s.blendFrom.pos).lerp(position,k)
      cam.quaternion.copy(s.blendFrom.quat).slerp(quat,k)
      cam.fov=s.blendFrom.fov+(fov-s.blendFrom.fov)*k
    }else{cam.position.copy(position);cam.quaternion.copy(quat);cam.fov=fov}
    cam.near=near;cam.far=far;cam.updateProjectionMatrix()
    const onboard=effective==='onboard'||effective==='nose'||effective==='tcam'
    fx.current.onboard=effective==='onboard'
    fx.current.speedBlur=onboard||effective==='chase'?clamp((dyn.speed-30)/55,0,1)*(effective==='chase'?.55:1):0
    fx.current.center=[.5,effective==='nose'?.46:.55]
  })
  return null
}
