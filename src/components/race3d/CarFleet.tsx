import { useEffect, useMemo, useRef } from 'react'
import { useFrame, type ThreeEvent } from '@react-three/fiber'
import { BufferGeometry, Color, DynamicDrawUsage, InstancedBufferAttribute, InstancedMesh, Matrix4, MeshBasicMaterial, PlaneGeometry, Quaternion, Vector3, type Material } from 'three'
import { CAR, createF1CarGeometry, type CarGeometrySet } from './carGeometry'
import { createCarMaterials, type CarMaterials } from './carMaterials'
import type { RaceRuntime } from './raceRuntime'
import { radialTexture } from './textures'

type PartName='paint'|'carbon'|'dark'|'metal'|'flap'|'helmet'|'visor'|'tcam'|'light'|'tyre'|'wheelFace'
const BODY:PartName[]=['paint','carbon','dark','metal','flap','helmet','visor','tcam','light']
const WHEEL:PartName[]=['tyre','wheelFace']
type Lod={set:CarGeometrySet;meshes:Record<PartName,InstancedMesh>;map:number[]}

function attach(geometry:BufferGeometry,name:string,size:number,count:number,fill=1){
  const attribute=new InstancedBufferAttribute(new Float32Array(count*size).fill(fill),size)
  attribute.setUsage(DynamicDrawUsage);geometry.setAttribute(name,attribute);return attribute
}
function buildLod(set:CarGeometrySet,materials:CarMaterials,cars:number,shadows:boolean):Lod{
  const meshes={} as Record<PartName,InstancedMesh>
  for(const name of [...BODY,...WHEEL]){
    const count=WHEEL.includes(name)?cars*4:cars,geometry=set[name as keyof CarGeometrySet] as BufferGeometry
    attach(geometry,'fade',1,count)
    if(name==='paint')for(const key of ['liveryA','liveryB','liveryC'])attach(geometry,key,3,count)
    if(name==='wheelFace')attach(geometry,'blur',1,count,0)
    const mesh=new InstancedMesh(geometry,(name==='flap'?materials.carbon:materials[name]) as Material,count)
    mesh.instanceMatrix.setUsage(DynamicDrawUsage)
    if(['helmet','tcam','light','wheelFace'].includes(name)){mesh.setColorAt(0,new Color('#fff'));mesh.instanceColor!.setUsage(DynamicDrawUsage)}
    mesh.frustumCulled=false;mesh.count=0
    mesh.castShadow=shadows&&['paint','carbon','tyre','flap'].includes(name)
    mesh.receiveShadow=shadows&&['paint','carbon'].includes(name)
    meshes[name]=mesh
  }
  return {set,meshes,map:[]}
}

const flapLocal=new Matrix4(),flapPivot=new Matrix4().makeTranslation(0,CAR.drsPivot.y,CAR.drsPivot.z),temp=new Matrix4(),shadowMatrix=new Matrix4()
const shadowQ=new Quaternion(),shadowP=new Vector3(),shadowS=new Vector3(),HIDE=new Matrix4().makeScale(0,0,0)

export default function CarFleet({runtime,carCount,selected,hideSelectedDriver,shadows,onSelect}:{runtime:{current:RaceRuntime};carCount:number;selected:number;hideSelectedDriver:boolean;shadows:boolean;onSelect:(number:number)=>void}){
  const materials=useMemo(createCarMaterials,[])
  const lods=useMemo(()=>[buildLod(createF1CarGeometry('high'),materials,carCount,shadows),buildLod(createF1CarGeometry('low'),materials,carCount,false)],[materials,carCount,shadows])
  useEffect(()=>()=>{lods.forEach(l=>{l.set.dispose();Object.values(l.meshes).forEach(m=>m.dispose())})},[lods])
  useEffect(()=>()=>materials.dispose(),[materials])
  const contact=useMemo(()=>{
    const geometry=new PlaneGeometry(2.5,6.3);geometry.rotateX(-Math.PI/2)
    const mesh=new InstancedMesh(geometry,new MeshBasicMaterial({color:'#000',transparent:true,opacity:.62,alphaMap:radialTexture(),depthWrite:false,polygonOffset:true,polygonOffsetFactor:-2}),carCount)
    mesh.frustumCulled=false;mesh.renderOrder=1;mesh.count=0;return mesh
  },[carCount])
  useEffect(()=>()=>{contact.geometry.dispose();(contact.material as Material).dispose()},[contact])
  const lastTime=useRef(0)

  useFrame(()=>{
    const cars=runtime.current.cars
    let shadowsUsed=0
    for(const [lodIndex,lod] of lods.entries()){
      const m=lod.meshes,fade=(n:PartName)=>m[n].geometry.getAttribute('fade') as InstancedBufferAttribute
      const livery=['liveryA','liveryB','liveryC'].map(k=>m.paint.geometry.getAttribute(k) as InstancedBufferAttribute)
      const blur=m.wheelFace.geometry.getAttribute('blur') as InstancedBufferAttribute
      let k=0,people=0
      lod.map.length=0
      for(const car of cars){
        if(!car.visible||car.lod!==lodIndex)continue
        const hideHead=hideSelectedDriver&&car.driver.number===selected
        for(const name of ['paint','carbon','dark','metal','tcam','light'] as const){m[name].setMatrixAt(k,car.chassis);fade(name).setX(k,car.fade)}
        flapLocal.makeRotationX(-.48*car.flap);temp.copy(car.chassis).multiply(flapPivot).multiply(flapLocal)
        m.flap.setMatrixAt(k,temp);fade('flap').setX(k,car.fade)
        livery[0].setXYZ(k,car.livery.a.r,car.livery.a.g,car.livery.a.b);livery[1].setXYZ(k,car.livery.b.r,car.livery.b.g,car.livery.b.b);livery[2].setXYZ(k,car.livery.c.r,car.livery.c.g,car.livery.c.b)
        m.tcam.setColorAt(k,car.tcam)
        m.light.setColorAt(k,car.rainLight?LIGHT_ON:LIGHT_OFF)
        if(!hideHead){m.helmet.setMatrixAt(people,car.chassis);m.helmet.setColorAt(people,car.helmet);m.visor.setMatrixAt(people,car.chassis);fade('helmet').setX(people,car.fade);fade('visor').setX(people,car.fade);people++}
        // Rotational blur: the fraction of a revolution swept during one displayed frame.
        const sweep=Math.min(.5,car.dynamics.spinRate*Math.max(1/60,Math.abs(runtime.current.time-lastTime.current))/(Math.PI*2))
        for(let w=0;w<4;w++){
          const i=k*4+w
          m.tyre.setMatrixAt(i,car.wheels[w]);m.wheelFace.setMatrixAt(i,car.wheels[w]);m.wheelFace.setColorAt(i,car.compound)
          fade('tyre').setX(i,car.fade);fade('wheelFace').setX(i,car.fade);blur.setX(i,car.moving?sweep:0)
        }
        lod.map[k]=car.index
        if(car.distance<900){
          car.ground.decompose(shadowP,shadowQ,shadowS)
          shadowMatrix.compose(shadowP.setY(shadowP.y+.03),shadowQ,shadowS.set(1,1,1))
          contact.setMatrixAt(shadowsUsed++,shadowMatrix)
        }
        k++
      }
      for(const name of [...BODY,...WHEEL]){
        const mesh=m[name],count=name==='helmet'||name==='visor'?people:WHEEL.includes(name)?k*4:k
        mesh.count=count;mesh.instanceMatrix.needsUpdate=true
        if(mesh.instanceColor)mesh.instanceColor.needsUpdate=true
        for(const attr of Object.values(mesh.geometry.attributes))if(attr instanceof InstancedBufferAttribute)attr.needsUpdate=true
        if(count===0)mesh.setMatrixAt(0,HIDE)
      }
    }
    contact.count=shadowsUsed;contact.instanceMatrix.needsUpdate=true
    lastTime.current=runtime.current.time
  },-1)
  const select=(lod:Lod)=>(event:ThreeEvent<MouseEvent>)=>{
    event.stopPropagation()
    if(event.instanceId==null)return
    const car=runtime.current.cars[lod.map[event.instanceId]]
    if(car)onSelect(car.driver.number)
  }
  return <group>
    {lods.map((lod,i)=><group key={i}>
      {[...BODY,...WHEEL].map(name=><primitive key={name} object={lod.meshes[name]} onClick={name==='paint'?select(lod):undefined}/>)}
    </group>)}
    <primitive object={contact}/>
  </group>
}
const LIGHT_ON=new Color(6,.05,.05),LIGHT_OFF=new Color('#2a0405')
