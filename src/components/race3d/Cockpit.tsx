import { useEffect, useMemo, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { CanvasTexture, Color, Group, InstancedMesh, Matrix4, Mesh, MeshBasicMaterial, MeshPhysicalMaterial, MeshStandardMaterial, Object3D, PerspectiveCamera, Quaternion, SRGBColorSpace, Vector3, WebGLRenderTarget } from 'three'
import { sampleTelemetry } from '../../history/replay'
import type { TelemetrySample } from '../../history/types'
import { formulaTeamLivery } from '../historical/FormulaCarModel'
import type { RaceRuntime } from './raceRuntime'
import { carbonTexture } from './textures'

const WHEEL_POS=new Vector3(0,.6,.665),WHEEL_TILT=.78,STEERING_RATIO=6.5
const GRIPS=[new Vector3(.135,-.012,-.026),new Vector3(-.135,-.012,-.026)]
const ELBOWS=[new Vector3(.25,.47,.3),new Vector3(-.25,.47,.3)]

function drawDisplay(context:CanvasRenderingContext2D,label:string,number:number,accent:string,sample:ReturnType<typeof sampleTelemetry>){
  const data=sample&&sample.sampleAge<=3?sample:null
  context.fillStyle='#05090c';context.fillRect(0,0,512,320)
  context.fillStyle=accent;context.fillRect(0,0,512,6)
  context.font='bold 22px monospace';context.fillStyle='#cfe3df';context.textAlign='left';context.fillText(`${label.slice(0,12)} ${String(number).padStart(2,'0')}`,18,38)
  context.textAlign='right';context.fillStyle=data?.drs!=null&&data.drs>=10?'#5dff8f':'#5f7a78';context.fillText(data?.drs==null?'DRS —':data.drs>=10?'DRS OPEN':'DRS',494,38)
  context.textAlign='center';context.fillStyle='#f2fff4';context.font='bold 150px monospace';context.fillText(data?.gear==null?'—':data.gear===0?'N':`${data.gear}`,256,192)
  context.font='bold 40px monospace';context.fillText(data?.speed==null?'— KM/H':`${data.speed.toFixed(0)} KM/H`,256,246)
  context.font='18px monospace';context.fillStyle='#86aaa5';context.fillText(data?'RECORDED TELEMETRY':'RECORDED DATA UNAVAILABLE',256,290)
  for(const [x,value,color] of [[22,data?.throttle,'#7ee36a'],[466,data?.brake,'#ff5d55']] as const){
    context.fillStyle='#17242a';context.fillRect(x,70,24,170)
    if(value!=null){const h=Math.max(0,Math.min(100,value))*1.7;context.fillStyle=color;context.fillRect(x,240-h,24,h)}
  }
}

/** Interior of the followed car, attached to its sprung chassis. */
export default function Cockpit({runtime,selected,team,color,telemetry,visible,mirrors}:{runtime:{current:RaceRuntime};selected:number;team:string;color:string;telemetry:TelemetrySample[];visible:boolean;mirrors:boolean}){
  const {gl,scene}=useThree()
  const root=useRef<Group>(null),wheel=useRef<Group>(null),arms=useRef<(Mesh|null)[]>([]),leds=useRef<InstancedMesh>(null)
  const palette=useMemo(()=>formulaTeamLivery(team,color),[team,color])
  const screen=useMemo(()=>{const canvas=document.createElement('canvas');canvas.width=512;canvas.height=320;const texture=new CanvasTexture(canvas);texture.colorSpace=SRGBColorSpace;return {canvas,texture}},[])
  const materials=useMemo(()=>({
    carbon:new MeshPhysicalMaterial({color:'#8d969d',map:carbonTexture(),roughness:.35,metalness:.3,clearcoat:.9,clearcoatRoughness:.2}),
    rubber:new MeshStandardMaterial({color:'#17191a',roughness:.95}),
    padding:new MeshStandardMaterial({color:'#0c0e10',roughness:.97}),
    glove:new MeshStandardMaterial({color:'#1c1f22',roughness:.85}),
    suit:new MeshStandardMaterial({color:palette.suit,roughness:.8}),
    screen:new MeshBasicMaterial({map:screen.texture,toneMapped:false}),
    led:new MeshBasicMaterial({color:'#ffffff',toneMapped:false}),
    accent:new MeshStandardMaterial({color:palette.accent,roughness:.4,metalness:.3}),
    metal:new MeshStandardMaterial({color:'#9aa3a9',metalness:.9,roughness:.25}),
  }),[palette,screen])
  useEffect(()=>()=>{Object.values(materials).forEach(m=>m.dispose());screen.texture.dispose()},[materials,screen])

  // Rear-view mirrors: a low-resolution backwards render shared by both glasses.
  const mirror=useMemo(()=>{
    if(!mirrors)return null
    const target=new WebGLRenderTarget(256,96),camera=new PerspectiveCamera(34,2.67,.3,1800)
    const material=new MeshBasicMaterial({map:target.texture,toneMapped:false})
    return {target,camera,material,frame:0}
  },[mirrors])
  useEffect(()=>()=>{mirror?.target.dispose();mirror?.material.dispose()},[mirror])

  const tmp=useMemo(()=>({m:new Matrix4(),w:new Matrix4(),q:new Quaternion(),v:new Vector3(),a:new Vector3(),up:new Vector3(0,1,0),o:new Object3D(),c:new Color()}),[])
  const updated=useRef(-Infinity)
  useEffect(()=>{updated.current=-Infinity},[selected,telemetry,palette])

  useFrame(()=>{
    const car=runtime.current.cars.find(c=>c.driver.number===selected),group=root.current
    if(!group)return
    group.visible=visible&&!!car?.visible
    if(!group.visible||!car)return
    group.matrix.copy(car.chassis);group.matrixWorldNeedsUpdate=true
    const angle=-Math.max(-2.3,Math.min(2.3,car.dynamics.steer*STEERING_RATIO))
    if(wheel.current)wheel.current.rotation.set(WHEEL_TILT,0,angle)
    // Forearms run from fixed elbows to the gloves on the turning wheel.
    tmp.w.makeRotationX(WHEEL_TILT).multiply(tmp.m.makeRotationZ(angle)).setPosition(WHEEL_POS)
    GRIPS.forEach((grip,i)=>{
      const arm=arms.current[i];if(!arm)return
      const hand=tmp.v.copy(grip).applyMatrix4(tmp.w),elbow=ELBOWS[i],dir=tmp.a.copy(hand).sub(elbow),length=dir.length()
      arm.position.copy(elbow).addScaledVector(dir,.5);arm.quaternion.setFromUnitVectors(tmp.up,dir.normalize());arm.scale.set(1,length/.3,1)
    })
    const time=runtime.current.time,sample=telemetry.length?sampleTelemetry(telemetry,time):null
    if(Math.abs(time-updated.current)>=.12){
      updated.current=time
      drawDisplay(screen.canvas.getContext('2d')!,palette.label,selected,palette.accent,sample)
      screen.texture.needsUpdate=true
      if(leds.current){
        const rpm=sample&&sample.sampleAge<=3?sample.rpm:null
        for(let i=0;i<15;i++){
          const on=rpm!=null&&i<(rpm-6000)/400
          tmp.c.set(on?(i<5?'#3dff6a':i<10?'#ff3b30':'#5b8cff'):'#141a1e');if(on)tmp.c.multiplyScalar(3)
          leds.current.setColorAt(i,tmp.c)
        }
        if(leds.current.instanceColor)leds.current.instanceColor.needsUpdate=true
      }
    }
    if(mirror&&car){
      mirror.frame++
      if(mirror.frame%3===0){
        const eye=tmp.v.set(0,1.0,-.1).applyMatrix4(car.chassis)
        mirror.camera.position.copy(eye)
        car.chassis.decompose(tmp.a,tmp.q,tmp.v.set(1,1,1))
        mirror.camera.quaternion.copy(tmp.q)
        mirror.camera.rotateX(-.06)
        mirror.camera.updateMatrixWorld()
        // Reuse this frame's shadow map; the mirror pass only needs colour.
        const previous=gl.getRenderTarget(),wasVisible=group.visible,shadows=gl.shadowMap.autoUpdate
        group.visible=false;gl.shadowMap.autoUpdate=false
        gl.setRenderTarget(mirror.target);gl.render(scene,mirror.camera);gl.setRenderTarget(previous)
        group.visible=wasVisible;gl.shadowMap.autoUpdate=shadows
      }
    }
  })
  return <group ref={root} matrixAutoUpdate={false}>
    {/* Padded tub lining, seat back and dashboard. */}
    {[-1,1].map(side=><mesh key={side} position={[side*.33,.46,.52]} material={materials.padding}><boxGeometry args={[.04,.34,.86]}/></mesh>)}
    <mesh position={[0,.18,.55]} material={materials.padding}><boxGeometry args={[.62,.04,.9]}/></mesh>
    <mesh position={[0,.5,.95]} rotation={[-.2,0,0]} material={materials.carbon}><boxGeometry args={[.6,.24,.06]}/></mesh>
    <mesh position={[0,.62,.08]} rotation={[-.35,0,0]} material={materials.padding}><boxGeometry args={[.5,.42,.06]}/></mesh>
    {/* Legs disappear under the nose; knees are just visible beyond the wheel. */}
    {[-1,1].map(side=><mesh key={side} position={[side*.11,.4,.95]} rotation={[Math.PI/2-.18,0,0]} material={materials.suit}><capsuleGeometry args={[.07,.45,4,10]}/></mesh>)}
    <group ref={wheel} position={WHEEL_POS.toArray()} rotation={[WHEEL_TILT,0,0]}>
      <mesh material={materials.carbon}><boxGeometry args={[.24,.13,.032]}/></mesh>
      <mesh position={[0,-.052,0]} material={materials.carbon}><boxGeometry args={[.14,.06,.028]}/></mesh>
      {[-1,1].map(side=><group key={side}>
        <mesh position={[side*.135,-.012,0]} material={materials.rubber}><capsuleGeometry args={[.027,.09,4,10]}/></mesh>
        <mesh position={[side*.137,-.012,-.026]} scale={[1.05,1.45,.9]} material={materials.glove}><sphereGeometry args={[.036,12,10]}/></mesh>
        <mesh position={[side*.1,.036,.028]} material={materials.carbon}><boxGeometry args={[.08,.1,.01]}/></mesh>
        {[0,1].map(row=><mesh key={row} position={[side*(.076-row*.011),-.032-row*.026,-.018]} rotation={[Math.PI/2,0,0]} material={materials.metal}><cylinderGeometry args={[.01,.01,.01,14]}/></mesh>)}
        {[0,1,2].map(row=><mesh key={`b${row}`} position={[side*.088,.036-row*.02,-.018]} rotation={[Math.PI/2,0,0]}><cylinderGeometry args={[.007,.007,.007,10]}/><meshStandardMaterial color={['#e04a3f','#3fb8c8','#e8c547'][row]} roughness={.4}/></mesh>)}
      </group>)}
      <mesh position={[0,.01,-.017]} rotation={[0,Math.PI,0]} material={materials.screen}><planeGeometry args={[.1,.062]}/></mesh>
      <instancedMesh ref={leds} args={[undefined,undefined,15]} material={materials.led} onUpdate={self=>{const o=new Object3D();for(let i=0;i<15;i++){o.position.set((i-7)*.0092,.058,-.017);o.updateMatrix();self.setMatrixAt(i,o.matrix);self.setColorAt(i,new Color('#141a1e'))}self.instanceMatrix.needsUpdate=true}}><boxGeometry args={[.008,.006,.004]}/></instancedMesh>
      <mesh position={[0,-.055,-.019]} material={materials.accent}><boxGeometry args={[.05,.008,.002]}/></mesh>
    </group>
    {[0,1].map(i=><mesh key={i} ref={m=>{arms.current[i]=m}} material={materials.suit}><capsuleGeometry args={[.034,.3,4,10]}/></mesh>)}
    {mirror&&[-1,1].map(side=><mesh key={side} position={[side*.56,.72,.541]} rotation={[0,Math.PI,0]} material={mirror.material}>
      <planeGeometry args={[.17,.062]} onUpdate={self=>{const uv=self.getAttribute('uv');for(let i=0;i<uv.count;i++){const u=uv.getX(i);uv.setX(i,side>0?.5+(1-u)*.5:(1-u)*.5)}uv.needsUpdate=true}}/>
    </mesh>)}
  </group>
}
