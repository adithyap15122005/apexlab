import type { CameraMode, RecordedPosition } from '../../history/types'

export const REPLAY_CAMERAS:{id:CameraMode;label:string;description:string}[]=[
  {id:'director',label:'Director',description:'Automatic broadcast cuts · follows your driver'},
  {id:'onboard',label:'Cockpit',description:'Driver’s eyes · drag to look around'},
  {id:'tcam',label:'T-cam',description:'Above the roll hoop · follows your driver'},
  {id:'nose',label:'Nose cam',description:'Low on the nose · front wheels and wing in view'},
  {id:'rear',label:'Rear cam',description:'Roll hoop, facing back · DRS flap and rivals'},
  {id:'chase',label:'Chase',description:'Behind the car · follows your driver'},
  {id:'top',label:'Top view',description:'Directly overhead · follows your driver'},
  {id:'overview',label:'Whole circuit',description:'Top-down view · the entire recorded field'},
  {id:'helicopter',label:'Helicopter',description:'Elevated broadcast camera · follows your driver'},
  {id:'trackside',label:'Trackside',description:'Stationary trackside camera · follows the car'},
  {id:'strategist',label:'Free orbit',description:'Drag to orbit the circuit · scroll to zoom'},
]

type Footprint={x:number;z:number;heading:number}
/** Separation of two original car footprints, in metres. Negative means overlap.
 * This is a rendering check only, never collision physics or a new trajectory.
 */
export function footprintSeparation(a:Footprint,b:Footprint):number{
  if(![a.x,a.z,a.heading,b.x,b.z,b.heading].every(Number.isFinite))return Infinity
  const axes=(heading:number)=>[{x:Math.cos(heading),z:-Math.sin(heading)},{x:Math.sin(heading),z:Math.cos(heading)}]
  const aa=axes(a.heading),bb=axes(b.heading),halfLength=2.9,halfWidth=1.15
  const radius=(axis:{x:number;z:number},basis:{x:number;z:number}[])=>halfLength*Math.abs(axis.x*basis[0].x+axis.z*basis[0].z)+halfWidth*Math.abs(axis.x*basis[1].x+axis.z*basis[1].z)
  return Math.max(...[...aa,...bb].map(axis=>Math.abs((b.x-a.x)*axis.x+(b.z-a.z)*axis.z)-radius(axis,aa)-radius(axis,bb)))
}

export function cockpitRivalVisibility(selected:RecordedPosition,rival:RecordedPosition,rawUnitsPerMeter:number):number{
  if(!Number.isFinite(rawUnitsPerMeter)||rawUnitsPerMeter<=0)return 1
  const valid=(p:RecordedPosition)=>['recorded','interpolated','finished'].includes(p.status)&&Number.isFinite(p.x)&&Number.isFinite(p.y)
  if(!valid(selected)||!valid(rival))return 1
  const gap=footprintSeparation({x:selected.x/rawUnitsPerMeter,z:-selected.y/rawUnitsPerMeter,heading:selected.heading},{x:rival.x/rawUnitsPerMeter,z:-rival.y/rawUnitsPerMeter,heading:rival.heading})
  // Fade before reconstructed bodies meet. Fully suppress any body that could
  // enter the selected cockpit; source coordinates and timing stay untouched.
  const t=Math.max(0,Math.min(1,(gap-.35)/1.25))
  return t*t*(3-2*t)
}

/** Perspective camera height required to fit a flat, north-up circuit. */
export function circuitOverviewHeight(width:number,depth:number,aspect:number,fovDegrees=42):number{
  const safeAspect=Number.isFinite(aspect)&&aspect>0?aspect:1
  return Math.max(depth,width/safeAspect,1)*.5/Math.tan(fovDegrees*Math.PI/360)*1.22
}

/** Suppress illustrative buildings whose ground footprint covers the road. */
export function sceneryClearsRoad(samples:{x:number;z:number}[],center:{x:number;z:number},angle:number,halfWidth:number,halfLength:number,metersToWorld:number):boolean{
  const c=Math.cos(angle),s=Math.sin(angle),padding=9*metersToWorld
  return samples.every(point=>{
    const dx=point.x-center.x,dz=point.z-center.z
    return Math.abs(dx*c-dz*s)>halfWidth*metersToWorld+padding||Math.abs(dx*s+dz*c)>halfLength*metersToWorld+padding
  })
}
