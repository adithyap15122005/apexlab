import { useEffect, useMemo } from 'react'
import { useFrame } from '@react-three/fiber'
import { BufferGeometry, CanvasTexture, Color, InstancedBufferAttribute, InstancedMesh, Matrix4, MeshBasicMaterial, MeshPhysicalMaterial, MeshStandardMaterial, SRGBColorSpace, Vector3, type Material } from 'three'
import { CAR, createF1CarGeometry } from './carGeometry'
import { createCarMaterials } from './carMaterials'
import { carbonTexture } from './textures'

type PartName='paint'|'carbon'|'dark'|'metal'|'flap'|'helmet'|'visor'|'tcam'|'light'
export type StudioLivery={primary:string;secondary:string;accent:string;helmet?:string}

/**
 * A single, static showroom car built from the same procedural geometry and materials
 * as the race replay fleet. Forward is +Z, like the fleet; callers place it.
 */
export default function StudioCar({livery,compound='#f2dc5c',driver=true,interior=false,number=1,label='APEXLAB',spin=0,steer=.12}:{livery:StudioLivery;compound?:string;driver?:boolean;interior?:boolean;number?:number;label?:string;spin?:number;steer?:number}){
  const parts=useMemo(()=>{
    const set=createF1CarGeometry('high'),materials=createCarMaterials()
    const one=(geometry:BufferGeometry,material:Material,count=1)=>{
      geometry.setAttribute('fade',new InstancedBufferAttribute(new Float32Array(count).fill(1),1))
      const mesh=new InstancedMesh(geometry,material,count);mesh.castShadow=true;mesh.receiveShadow=true;mesh.frustumCulled=false
      for(let i=0;i<count;i++)mesh.setMatrixAt(i,new Matrix4());return mesh
    }
    const body={} as Record<PartName,InstancedMesh>
    for(const name of ['paint','carbon','dark','metal','flap','helmet','visor','tcam','light'] as PartName[])body[name]=one(set[name],name==='flap'?materials.carbon:materials[name])
    for(const key of ['liveryA','liveryB','liveryC'])set.paint.setAttribute(key,new InstancedBufferAttribute(new Float32Array(3),3))
    set.wheelFace.setAttribute('blur',new InstancedBufferAttribute(new Float32Array(4),1))
    const tyre=one(set.tyre,materials.tyre,4),face=one(set.wheelFace,materials.wheelFace,4)
    return {set,materials,body,tyre,face}
  },[])
  useEffect(()=>()=>{parts.set.dispose();parts.materials.dispose()},[parts])
  useEffect(()=>{
    const {set,body}=parts,colors=[livery.primary,livery.secondary,livery.accent].map(c=>new Color(c))
    ;(['liveryA','liveryB','liveryC'] as const).forEach((key,i)=>{const a=set.paint.getAttribute(key) as InstancedBufferAttribute;a.setXYZ(0,colors[i].r,colors[i].g,colors[i].b);a.needsUpdate=true})
    body.helmet.setColorAt(0,new Color(livery.helmet??livery.accent));body.tcam.setColorAt(0,new Color('#101214'));body.light.setColorAt(0,new Color('#2a0405'))
    for(const m of [body.helmet,body.tcam,body.light])m.instanceColor!.needsUpdate=true
    body.helmet.visible=body.visor.visible=driver
    for(let i=0;i<4;i++)parts.face.setColorAt(i,new Color(compound))
    parts.face.instanceColor!.needsUpdate=true
  },[parts,livery,compound,driver])
  const wheel=useMemo(()=>({m:new Matrix4(),steer:new Matrix4(),s:new Vector3(),angle:0}),[])
  useFrame((_,delta)=>{
    wheel.angle+=spin*Math.min(delta,.1)
    const blur=parts.set.wheelFace.getAttribute('blur') as InstancedBufferAttribute
    parts.set.wheels.forEach((slot,i)=>{
      wheel.m.makeRotationX(wheel.angle).premultiply(wheel.steer.makeRotationY(slot.front?steer:0))
      wheel.m.scale(wheel.s.set(slot.width,1,1)).setPosition(slot.x,CAR.wheelRadius,slot.z)
      parts.tyre.setMatrixAt(i,wheel.m);parts.face.setMatrixAt(i,wheel.m);blur.setX(i,Math.min(.5,Math.abs(spin)/60/(Math.PI*2)))
    })
    parts.tyre.instanceMatrix.needsUpdate=true;parts.face.instanceMatrix.needsUpdate=true;blur.needsUpdate=true
  })
  return <group>
    {Object.values(parts.body).map((mesh,i)=><primitive key={i} object={mesh}/>)}
    <primitive object={parts.tyre}/><primitive object={parts.face}/>
    {interior&&<StudioCockpit livery={livery} number={number} label={label}/>}
  </group>
}

/** Static cockpit details for the showroom's driver views. */
function StudioCockpit({livery,number,label}:{livery:StudioLivery;number:number;label:string}){
  const assets=useMemo(()=>{
    const canvas=document.createElement('canvas');canvas.width=512;canvas.height=320;const c=canvas.getContext('2d')!
    c.fillStyle='#05090c';c.fillRect(0,0,512,320);c.fillStyle=livery.accent;c.fillRect(0,0,512,8)
    c.fillStyle='#d9ece6';c.font='bold 26px monospace';c.fillText(`${label.toUpperCase().slice(0,12)} ${String(number).padStart(2,'0')}`,20,46)
    c.textAlign='center';c.font='bold 150px monospace';c.fillStyle='#f2fff4';c.fillText('N',256,206);c.font='22px monospace';c.fillStyle='#86aaa5';c.fillText('GARAGE MODE · ORIGINAL RECONSTRUCTION',256,280)
    const screen=new CanvasTexture(canvas);screen.colorSpace=SRGBColorSpace
    return {
      screen,
      carbon:new MeshPhysicalMaterial({color:'#8d969d',map:carbonTexture(),roughness:.35,metalness:.3,clearcoat:.9,clearcoatRoughness:.2}),
      padding:new MeshStandardMaterial({color:'#0c0e10',roughness:.97}),
      rubber:new MeshStandardMaterial({color:'#17191a',roughness:.95}),
      display:new MeshBasicMaterial({map:screen,toneMapped:false}),
      accent:new MeshStandardMaterial({color:livery.accent,roughness:.4,metalness:.3}),
    }
  },[livery,number,label])
  useEffect(()=>()=>{Object.values(assets).forEach(a=>a.dispose())},[assets])
  return <group>
    {[-1,1].map(side=><mesh key={side} position={[side*.33,.46,.52]} material={assets.padding}><boxGeometry args={[.04,.34,.86]}/></mesh>)}
    <mesh position={[0,.18,.55]} material={assets.padding}><boxGeometry args={[.62,.04,.9]}/></mesh>
    <mesh position={[0,.5,.95]} rotation={[-.2,0,0]} material={assets.carbon}><boxGeometry args={[.6,.24,.06]}/></mesh>
    <mesh position={[0,.62,.08]} rotation={[-.35,0,0]} material={assets.padding}><boxGeometry args={[.5,.42,.06]}/></mesh>
    <group position={[0,.6,.665]} rotation={[.78,0,0]}>
      <mesh material={assets.carbon}><boxGeometry args={[.24,.13,.032]}/></mesh>
      <mesh position={[0,-.052,0]} material={assets.carbon}><boxGeometry args={[.14,.06,.028]}/></mesh>
      {[-1,1].map(side=><mesh key={side} position={[side*.135,-.012,0]} material={assets.rubber}><capsuleGeometry args={[.027,.09,4,10]}/></mesh>)}
      <mesh position={[0,.01,-.017]} rotation={[0,Math.PI,0]} material={assets.display}><planeGeometry args={[.1,.062]}/></mesh>
      <mesh position={[0,.058,-.017]} material={assets.accent}><boxGeometry args={[.14,.006,.004]}/></mesh>
    </group>
  </group>
}
