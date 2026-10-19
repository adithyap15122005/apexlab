import { useEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { BoxGeometry, BufferGeometry, Color, CylinderGeometry, Euler, Float32BufferAttribute, InstancedMesh, Matrix4, MeshStandardMaterial, Object3D, Quaternion, TorusGeometry, Vector3 } from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import type { PitStopPlan } from '../../history/pitStops'
import { historicalCompound, type HistoricalDriver } from '../../history/types'
import { CAR } from './carGeometry'
import { fillPeople, peopleMaterial, personGeometry, POSE, type Person } from './personGeometry'
import type { CarRuntime, PitBox, RaceRuntime } from './raceRuntime'

/** Stops by teammates closer than this share one box and one crew (metres). */
const SHARED_BOX=8
const teamColour=(driver:HistoricalDriver)=>/^#?[0-9a-f]{6}$/i.test(driver.color)?`#${driver.color.replace('#','')}`:'#c8d9ba'

type Spot=[x:number,z:number,yaw:number]
type Role={service:Spot;wait:Spot;kind:'wheel'|'front'|'rear'|'other'}
const FACE_LEFT=-Math.PI/2,FACE_RIGHT=Math.PI/2
const WHEELS=[{x:CAR.frontTrack,z:CAR.frontAxle,width:CAR.frontTyreWidth},{x:-CAR.frontTrack,z:CAR.frontAxle,width:CAR.frontTyreWidth},{x:CAR.rearTrack,z:CAR.rearAxle,width:CAR.rearTyreWidth},{x:-CAR.rearTrack,z:CAR.rearAxle,width:CAR.rearTyreWidth}]
/** The real choreography: three mechanics per wheel, two jacks, wing men, stabilisers and the lights operator. */
const ROLES:Role[]=[
  ...WHEELS.flatMap(w=>{const s=Math.sign(w.x),face=s>0?FACE_LEFT:FACE_RIGHT;return [
    {service:[s*1.22,w.z,face],wait:[s*2.35,w.z,face],kind:'wheel'},
    {service:[s*1.52,w.z-.4,face],wait:[s*2.6,w.z-.6,face],kind:'wheel'},
    {service:[s*1.46,w.z+.46,face],wait:[s*2.5,w.z+.62,face],kind:'wheel'},
  ] as Role[]}),
  {service:[0,3.32,Math.PI],wait:[0,4.5,Math.PI],kind:'front'},
  {service:[0,-3.25,0],wait:[1.95,-3.5,FACE_LEFT],kind:'rear'},
  {service:[1.32,-.3,FACE_LEFT],wait:[2.4,-.3,FACE_LEFT],kind:'other'},{service:[-1.32,-.3,FACE_RIGHT],wait:[-2.4,-.3,FACE_RIGHT],kind:'other'},
  {service:[1.15,2.72,Math.PI*.8],wait:[2.3,2.95,FACE_LEFT],kind:'other'},{service:[-1.15,2.72,-Math.PI*.8],wait:[-2.3,2.95,FACE_RIGHT],kind:'other'},
  {service:[-2.3,3.7,Math.PI*.75],wait:[-2.3,3.7,Math.PI*.75],kind:'other'},
]
const smooth=(a:number,b:number,v:number)=>{const t=Math.max(0,Math.min(1,(v-a)/(b-a)));return t*t*(3-2*t)}
const lerp=(a:number,b:number,t:number)=>a+(b-a)*t

function coloured(geometry:BufferGeometry,colour:string){
  const g=geometry.index?geometry.toNonIndexed():geometry,c=new Color(colour),n=g.getAttribute('position').count
  g.setAttribute('color',new Float32BufferAttribute(new Float32Array(n*3).map((_,i)=>[c.r,c.g,c.b][i%3]),3));g.deleteAttribute('uv');return g
}
/** A loose racing tyre on its rim (axle along X, unit width), plus a ring that takes the compound colour. */
function tyreProps(){
  const body=mergeGeometries([coloured(new CylinderGeometry(.36,.36,1,28).rotateZ(Math.PI/2),'#141516'),coloured(new CylinderGeometry(.235,.235,1.04,20).rotateZ(Math.PI/2),'#33393e')],false)!
  body.computeVertexNormals()
  const ring=mergeGeometries([new TorusGeometry(.3,.028,6,32).rotateY(Math.PI/2).translate(.53,0,0),new TorusGeometry(.3,.028,6,32).rotateY(Math.PI/2).translate(-.53,0,0)],false)!
  return {body,ring}
}

export default function PitStopCrew({runtime}:{runtime:{current:RaceRuntime}}){
  const {material,uniforms}=useMemo(peopleMaterial,[])
  const assets=useMemo(()=>{
    const crew=new InstancedMesh(personGeometry(true),material,ROLES.length*6)
    const props=tyreProps()
    const tyreMaterial=new MeshStandardMaterial({vertexColors:true,roughness:.85,metalness:.15})
    const ringMaterial=new MeshStandardMaterial({color:'#ffffff',roughness:.5})
    const tyres=new InstancedMesh(props.body,tyreMaterial,8*6),rings=new InstancedMesh(props.ring,ringMaterial,8*6)
    rings.setColorAt(0,new Color('#fff'))
    const lineMaterial=new MeshStandardMaterial({color:'#ffffff',roughness:.6})
    const lines=new InstancedMesh(new BoxGeometry(1,1,1),lineMaterial,4*24);lines.setColorAt(0,new Color('#fff'));lines.count=0
    for(const m of [crew,tyres,rings,lines]){m.frustumCulled=false;m.layers.set(1)}
    tyres.count=0;rings.count=0;crew.count=0
    return {crew,tyres,rings,lines,tyreMaterial,ringMaterial,lineMaterial,props}
  },[material])
  useEffect(()=>()=>{material.dispose();assets.crew.geometry.dispose();assets.props.body.dispose();assets.props.ring.dispose();assets.lines.geometry.dispose();assets.tyreMaterial.dispose();assets.ringMaterial.dispose();assets.lineMaterial.dispose()},[assets,material])
  const scratch=useMemo(()=>({box:new Matrix4(),local:new Vector3(),q:new Quaternion(),e:new Euler(),o:new Object3D(),c:new Color(),fresh:new Color(),worn:new Color(),people:[] as Person[],active:[] as {plan:PitStopPlan;box:PitBox;car:CarRuntime}[]}),[])
  const boxesSeen=useRef(-1)

  // Team-coloured pit boxes, painted once every stop's location is known. Teammates share a box.
  const paintBoxes=(rt:RaceRuntime)=>{
    const painted:{team:string;box:PitBox}[]=[],o=scratch.o
    let n=0
    for(const [plan,box] of rt.boxes){
      const car=rt.cars.find(c=>c.driver.number===plan.driver)
      if(!car||n+4>assets.lines.instanceMatrix.count||painted.some(p=>p.team===car.driver.team&&Math.hypot(p.box.x-box.x,p.box.z-box.z)<SHARED_BOX))continue
      painted.push({team:car.driver.team,box})
      const colour=scratch.c.set(teamColour(car.driver)).lerp(new Color('#ffffff'),.2)
      for(const [x,z,w,l] of [[1.7,.15,.12,7.1],[-1.7,.15,.12,7.1],[0,3.7,3.52,.12],[0,-3.4,3.52,.12]]){
        o.position.set(x,.025,z).applyAxisAngle(new Vector3(0,1,0),box.yaw).add(new Vector3(box.x,box.y,box.z))
        o.rotation.set(0,box.yaw,0);o.scale.set(w,.012,l);o.updateMatrix()
        assets.lines.setMatrixAt(n,o.matrix);assets.lines.setColorAt(n,colour);n++
      }
    }
    assets.lines.count=n;assets.lines.instanceMatrix.needsUpdate=true;if(assets.lines.instanceColor)assets.lines.instanceColor.needsUpdate=true
  }

  useFrame(state=>{
    const rt=runtime.current,t=rt.time
    uniforms.uTime.value=state.clock.elapsedTime
    if(rt.boxesReady&&boxesSeen.current!==rt.boxes.size){boxesSeen.current=rt.boxes.size;paintBoxes(rt)}
    const people=scratch.people;people.length=0
    let tyreCount=0
    const placeTyre=(box:PitBox,x:number,y:number,z:number,width:number,colour:Color)=>{
      if(tyreCount>=assets.tyres.instanceMatrix.count)return
      scratch.local.set(x,y,z).applyMatrix4(scratch.box)
      scratch.o.position.copy(scratch.local);scratch.o.rotation.set(0,box.yaw,0);scratch.o.scale.set(width,1,1);scratch.o.updateMatrix()
      assets.tyres.setMatrixAt(tyreCount,scratch.o.matrix);assets.rings.setMatrixAt(tyreCount,scratch.o.matrix);assets.rings.setColorAt(tyreCount,colour);tyreCount++
    }
    const active=scratch.active;active.length=0
    for(const [plan,box] of rt.boxes){
      const start=plan.stopAt-plan.service/2,end=start+plan.service,car=rt.cars.find(c=>c.driver.number===plan.driver)
      if(car&&t>=start-14&&t<=end+8)active.push({plan,box,car})
    }
    for(const {plan,box,car} of active){
      const start=plan.stopAt-plan.service/2,end=start+plan.service
      if(people.length+ROLES.length>assets.crew.instanceMatrix.count)break
      // One crew per box: when teammates stop back to back, it serves whichever stop is nearer in time.
      if(active.some(o=>o.plan!==plan&&o.car.driver.team===car.driver.team&&Math.hypot(o.box.x-box.x,o.box.z-box.z)<SHARED_BOX&&Math.abs(t-o.plan.stopAt)<Math.abs(t-plan.stopAt)))continue
      const shirt=teamColour(car.driver)
      scratch.q.setFromEuler(scratch.e.set(0,box.yaw,0));scratch.box.compose(scratch.local.set(box.x,box.y,box.z),scratch.q,scratch.o.scale.set(1,1,1))
      const stepIn=smooth(start-1,start-.15,t),stepOut=smooth(end+1.6,end+3,t)
      const pose=t>=start-.2&&t<=end?POSE.work:t>end&&t<=end+1.6?POSE.celebrate:POSE.idle
      ROLES.forEach((role,k)=>{
        let f=(role.kind==='rear'?smooth(start-.1,start+.3,t):stepIn)*(1-stepOut)
        let [x,z,yaw]=role.wait
        x=lerp(x,role.service[0],f);z=lerp(z,role.service[1],f);yaw=f>.5?role.service[2]:role.wait[2]
        // The front-jack man pulls the jack and steps aside to release the car.
        if(role.kind==='front'&&t>end-.1){const aside=smooth(end-.1,end+.4,t);x=lerp(x,1.9,aside);z=lerp(z,3.7,aside);f=1}
        scratch.local.set(x,0,z).applyMatrix4(scratch.box)
        people.push({x:scratch.local.x,y:scratch.local.y,z:scratch.local.z,yaw:box.yaw+yaw,color:shirt,skin:(k*.37+plan.driver*.13)%1,pose,phase:k*1.7})
      })
      // Tyres: new sets wait with the tyre-on men; old ones are carried away once the wheels come off.
      const p=Math.max(0,Math.min(1,(t-start)/plan.service)),lift=car.pit?.plan===plan?car.lift:0
      const fresh=scratch.fresh.set(historicalCompound(plan.to).color),worn=scratch.worn.set(historicalCompound(plan.from).color).multiplyScalar(.6)
      WHEELS.forEach(w=>{
        const s=Math.sign(w.x),wheelY=CAR.wheelRadius+lift
        if(t<end&&!(t>=start&&p>=.8)){
          const holdX=lerp(s*2.18,s*(Math.abs(w.x)+.62),stepIn),holdZ=lerp(w.z+.62,w.z+.4,stepIn),insert=t>=start?smooth(.3,.72,p):0
          placeTyre(box,lerp(holdX,w.x,insert),lerp(.42,wheelY,insert),lerp(holdZ,w.z,insert),w.width,fresh)
        }
        if(t>=start+.18*plan.service&&t<end+3){
          const away=smooth(.18,.48,p)
          placeTyre(box,lerp(w.x,s*2.25,away),lerp(wheelY,.36,away),lerp(w.z,w.z-.75,away),w.width,worn)
        }
      })
    }
    fillPeople(assets.crew,people)
    assets.tyres.count=tyreCount;assets.rings.count=tyreCount
    assets.tyres.instanceMatrix.needsUpdate=true;assets.rings.instanceMatrix.needsUpdate=true;if(assets.rings.instanceColor)assets.rings.instanceColor.needsUpdate=true
  })
  return <group>
    <primitive object={assets.lines}/>
    <primitive object={assets.crew}/>
    <primitive object={assets.tyres}/>
    <primitive object={assets.rings}/>
  </group>
}
