import { useEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { Color, InstancedMesh, Matrix4, Vector3 } from 'three'
import type { CircuitLayout } from './circuitBuilder'
import { fillPeople, peopleMaterial, personGeometry, POSE, type Person } from './personGeometry'
import type { RaceRuntime, TrackStatus } from './raceRuntime'

const FAN_COLOURS=['#d8202c','#f47b20','#1c3d8f','#00a19c','#ffffff','#f5d200','#1d1f22','#2f8f46','#e94f9b','#5bb8f0','#c9ced3']
function rng(seed:number){let s=seed>>>0||1;return()=>{s=(s*1664525+1013904223)>>>0;return s/4294967296}}

/** Spectators seated along each grandstand slope; one instanced mesh per cluster of stands. */
function crowdClusters(layout:CircuitLayout,density:number){
  const random=rng(91),clusters:Person[][]=[]
  let current:Person[]=[],last:{x:number;z:number}|null=null,along=0
  const rows=Math.max(2,Math.round(6*density)),cols=Math.max(4,Math.round(11*density))
  for(const stand of layout.grandstands){
    if(last&&Math.hypot(stand.x-last.x,stand.z-last.z)>40){clusters.push(current);current=[];along=0}
    if(last)along+=Math.hypot(stand.x-last.x,stand.z-last.z)
    last=stand
    const c=Math.cos(stand.yaw),s=Math.sin(stand.yaw),sy=stand.h/11
    for(let r=0;r<rows;r++)for(let k=0;k<cols;k++){
      if(random()<.12)continue
      // The seating slope runs from (y 1.5, z 4.5) at the front to (y 9.3, z −6.5) at the back.
      const f=(r+.5)/rows,lx=-6.3+(k+.5+(random()-.5)*.4)*12.6/cols,ly=(1.5+7.8*f)*sy-.55,lz=4.5-11*f
      current.push({x:stand.x+lx*c+lz*s,y:stand.y+ly,z:stand.z-lx*s+lz*c,yaw:stand.yaw+(random()-.5)*.4,color:FAN_COLOURS[Math.floor(random()*FAN_COLOURS.length)],skin:random(),pose:POSE.cheer,phase:(along+lx)/9,scale:.92+random()*.14})
    }
  }
  if(current.length)clusters.push(current)
  return clusters
}

const CREW_SPOTS:[number,number,number][]=[
  // Three mechanics per wheel (gun, off, on), front and rear jacks, wing and stabilisers.
  ...[1.8,-1.8].flatMap(z=>[1,-1].flatMap(side=>[[side*1.42,z+.42,side>0?-Math.PI/2:Math.PI/2],[side*1.55,z-.32,side>0?-Math.PI/2:Math.PI/2],[side*1.25,z,side>0?-Math.PI/2:Math.PI/2]] as [number,number,number][])),
  [0,3.45,Math.PI],[0,-3.25,0],[1.25,2.75,Math.PI*.8],[-1.25,2.75,-Math.PI*.8],[1.3,-.2,-Math.PI/2],[-1.3,-.2,Math.PI/2],
]

export default function People({layout,runtime,teams,density,lapStart,finishTime}:{layout:CircuitLayout;runtime:{current:RaceRuntime};teams:string[];density:number;lapStart:number;finishTime:number}){
  const {material,uniforms}=useMemo(peopleMaterial,[])
  useEffect(()=>()=>material.dispose(),[material])
  const crowd=useMemo(()=>{
    if(density<=0)return []
    return crowdClusters(layout,density).map(people=>{
      const mesh=fillPeople(new InstancedMesh(personGeometry(false,true),material,people.length),people)
      // People live on layer 1: the main camera sees them, the rear-view mirror pass skips them.
      mesh.layers.set(1)
      mesh.computeBoundingSphere();return mesh
    })
  },[layout,density,material])
  useEffect(()=>()=>crowd.forEach(m=>m.geometry.dispose()),[crowd])

  // Garage crews wait in front of each garage in team colours; marshals stand at each post.
  const staff=useMemo(()=>{
    const random=rng(7),people:Person[]=[]
    layout.garages.forEach((g,i)=>{
      const team=teams.length?teams[Math.floor(i/2)%teams.length]:'#d8202c',c=Math.cos(g.yaw),s=Math.sin(g.yaw)
      for(let k=0;k<4;k++){const lx=-3.6+k*2.4+(random()-.5),lz=2.2+random()*1.6;people.push({x:g.x+lx*c+lz*s,y:g.y,z:g.z-lx*s+lz*c,yaw:g.yaw+(random()-.5)*1.2,color:team,skin:random(),pose:POSE.idle,phase:random()*10})}
    })
    const crew=fillPeople(new InstancedMesh(personGeometry(true),material,Math.max(1,people.length)),people)
    const marshals:Person[]=layout.marshals.flatMap(p=>[-.9,.9].map(dx=>({x:p.x+Math.cos(p.yaw)*dx,y:p.y,z:p.z-Math.sin(p.yaw)*dx,yaw:p.yaw,color:'#ff7a1a',skin:random(),pose:POSE.idle,phase:random()*10})))
    const marshalMesh=fillPeople(new InstancedMesh(personGeometry(),material,Math.max(1,marshals.length)),marshals)
    crew.computeBoundingSphere();marshalMesh.computeBoundingSphere();crew.layers.set(1);marshalMesh.layers.set(1)
    return {crew,marshalMesh,marshals}
  },[layout,teams,material])
  useEffect(()=>()=>{staff.crew.geometry.dispose();staff.marshalMesh.geometry.dispose()},[staff])

  // A live pit crew surrounds any car stopped in the pit lane.
  const pit=useMemo(()=>{const m=new InstancedMesh(personGeometry(true),material,8*CREW_SPOTS.length);m.frustumCulled=false;m.count=0;m.layers.set(1);return m},[material])
  useEffect(()=>()=>pit.geometry.dispose(),[pit])
  const scratch=useMemo(()=>({v:new Vector3(),m:new Matrix4(),color:new Color(),people:[] as Person[],status:'' as TrackStatus|'',key:''}),[])
  const marshalsRef=useRef(staff.marshals);marshalsRef.current=staff.marshals

  useFrame((state)=>{
    const rt=runtime.current
    uniforms.uTime.value=state.clock.elapsedTime
    const start=Math.abs(rt.time-lapStart)<25,finish=rt.status==='chequered'||rt.time>=finishTime
    uniforms.uExcite.value+=((finish?1:start?.55:0)-uniforms.uExcite.value)*.05
    // Marshals wave whenever race control shows a yellow, safety car or red flag.
    if(rt.status!==scratch.status){
      scratch.status=rt.status
      const waving=rt.status==='yellow'||rt.status==='sc'||rt.status==='vsc'||rt.status==='red'
      fillPeople(staff.marshalMesh,marshalsRef.current.map(p=>({...p,pose:waving?POSE.flag:POSE.idle})))
    }
    const people=scratch.people;people.length=0
    let key=''
    for(const car of rt.cars){
      if(!car.visible||car.pose.mode!==2||car.dynamics.speed>1.2||people.length>=pit.instanceMatrix.count)continue
      key+=car.index+','
      for(const [k,[x,z,yaw]] of CREW_SPOTS.entries()){
        const v=scratch.v.set(x,0,z).applyMatrix4(car.ground)
        people.push({x:v.x,y:v.y,z:v.z,yaw:car.pose.yaw+yaw,color:car.livery.a,skin:(k*.37+car.index*.13)%1,pose:POSE.work,phase:k*1.3})
      }
    }
    if(key!==scratch.key||people.length){scratch.key=key;fillPeople(pit,people)}
  })
  return <group>
    {crowd.map((mesh,i)=><primitive key={i} object={mesh}/>)}
    <primitive object={staff.crew}/>
    <primitive object={staff.marshalMesh}/>
    <primitive object={pit}/>
  </group>
}
