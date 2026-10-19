import { useEffect, useMemo, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { Environment, Lightformer, Sky } from '@react-three/drei'
import { AdditiveBlending, BackSide, BufferGeometry, Color, DirectionalLight, Float32BufferAttribute, FogExp2, LineSegments, LineBasicMaterial, Mesh, Object3D, ShaderMaterial, Vector3 } from 'three'
import type { Venue } from './venues'

export type SceneQuality={level:'ultra'|'high'|'medium'|'low';shadows:number;dpr:number;trees:number;buildings:number;crowd:number;post:boolean;msaa:number;bloom:boolean;speedBlur:boolean}
export const QUALITY:Record<SceneQuality['level'],SceneQuality>={
  ultra:{level:'ultra',shadows:4096,dpr:2,trees:1,buildings:1,crowd:1,post:true,msaa:4,bloom:true,speedBlur:true},
  high:{level:'high',shadows:2048,dpr:1.5,trees:.65,buildings:.8,crowd:.75,post:true,msaa:2,bloom:true,speedBlur:true},
  medium:{level:'medium',shadows:1024,dpr:1,trees:.35,buildings:.5,crowd:.45,post:true,msaa:0,bloom:true,speedBlur:false},
  low:{level:'low',shadows:0,dpr:.8,trees:.15,buildings:.3,crowd:0,post:false,msaa:0,bloom:false,speedBlur:false},
}

export function sunDirection(venue:Venue,rain:boolean){
  const elevation=venue.lighting==='night'?1.15:rain?.95:venue.sunElevation,azimuth=venue.sunAzimuth
  return new Vector3(Math.cos(elevation)*Math.sin(azimuth),Math.sin(elevation),Math.cos(elevation)*Math.cos(azimuth)).normalize()
}

/** Gradient night sky with a faint city glow on the horizon. */
function NightSky({glow}:{glow:string}){
  const material=useMemo(()=>new ShaderMaterial({
    side:BackSide,depthWrite:false,fog:false,
    uniforms:{uGlow:{value:new Color(glow)}},
    vertexShader:'varying vec3 vDir;void main(){vDir=normalize(position);gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
    fragmentShader:`uniform vec3 uGlow;varying vec3 vDir;
      float hash(vec3 p){return fract(sin(dot(p,vec3(12.9898,78.233,37.719)))*43758.5453);}
      void main(){float h=vDir.y;vec3 top=vec3(.006,.012,.03),mid=vec3(.02,.035,.07);
        vec3 c=mix(mid,top,smoothstep(0.,.6,h));c+=uGlow*pow(1.-clamp(h,0.,1.),8.)*.35;
        vec3 q=floor(vDir*420.);float s=step(.9975,hash(q))*smoothstep(.15,.5,h);c+=vec3(s*.8);
        gl_FragColor=vec4(c,1.);}`,
  }),[glow])
  useEffect(()=>()=>material.dispose(),[material])
  return <mesh material={material} scale={18000} renderOrder={-10}><sphereGeometry args={[1,32,16]}/></mesh>
}

/** Rain streaks that follow the camera. */
function Rain({intensity}:{intensity:number}){
  const {camera}=useThree(),ref=useRef<LineSegments>(null),count=2600
  const geometry=useMemo(()=>{
    const p=new Float32Array(count*6)
    for(let i=0;i<count;i++){const x=(Math.random()-.5)*80,y=Math.random()*40,z=(Math.random()-.5)*80;p.set([x,y,z,x+.05,y-.9,z+.05],i*6)}
    const g=new BufferGeometry();g.setAttribute('position',new Float32BufferAttribute(p,3));return g
  },[])
  const material=useMemo(()=>new LineBasicMaterial({color:'#b9c7d3',transparent:true,opacity:.35*intensity,blending:AdditiveBlending,depthWrite:false}),[intensity])
  useEffect(()=>()=>{geometry.dispose();material.dispose()},[geometry,material])
  useFrame((_,delta)=>{
    if(!ref.current)return
    const p=geometry.getAttribute('position') as Float32BufferAttribute,arr=p.array as Float32Array,fall=delta*26
    for(let i=0;i<count;i++){const o=i*6;arr[o+1]-=fall;arr[o+4]-=fall;if(arr[o+4]<-4){const y=36+Math.random()*6;arr[o+1]=y;arr[o+4]=y-.9}}
    p.needsUpdate=true
    ref.current.position.set(camera.position.x,camera.position.y-14,camera.position.z)
  })
  return <lineSegments ref={ref} geometry={geometry} material={material} frustumCulled={false}/>
}

/** The Preetham sky is physically bright; scale it so it sits under the scene's exposure. */
function tameSky(self:Object3D|null){
  if(!self)return
  const material=(self as Mesh).material as ShaderMaterial
  if(!material||material.userData.tamed)return
  material.userData.tamed=true
  material.fragmentShader=material.fragmentShader.replace('#include <tonemapping_fragment>','gl_FragColor.rgb*=.42;\n#include <tonemapping_fragment>')
  material.needsUpdate=true
}

export default function Atmosphere({venue,rain,quality,focus}:{venue:Venue;rain:boolean;quality:SceneQuality;focus:{current:Vector3}}){
  const {scene}=useThree(),sun=useRef<DirectionalLight>(null)
  const night=venue.lighting==='night',twilight=venue.lighting==='twilight'
  const direction=useMemo(()=>sunDirection(venue,rain),[venue,rain])
  const horizon=night?'#0d1522':twilight?'#c98f66':rain?'#7f8a93':venue.ground==='desert'?'#c9b89c':'#a9bfd0'
  useEffect(()=>{
    const previousFog=scene.fog,previousBackground=scene.background
    const density=(night?.00016:.00011)*venue.haze*(rain?2.6:1)
    const previousIntensity=scene.environmentIntensity
    scene.fog=new FogExp2(horizon,density)
    scene.background=new Color(horizon)
    scene.environmentIntensity=night?.9:rain?.55:.62
    return()=>{scene.fog=previousFog;scene.background=previousBackground;scene.environmentIntensity=previousIntensity}
  },[scene,horizon,night,venue,rain])
  useEffect(()=>{
    const light=sun.current;if(!light)return
    light.target.updateMatrixWorld()
    scene.add(light.target)
    return()=>{scene.remove(light.target)}
  },[scene])
  const shadowRange=quality.shadows>=4096?70:quality.shadows>=2048?60:45
  useFrame(()=>{
    const light=sun.current;if(!light)return
    // Keep the shadow frustum centred on the action; snap to texels to avoid shimmering.
    const texel=shadowRange*2/Math.max(512,quality.shadows||1024),f=focus.current
    const cx=Math.round(f.x/texel)*texel,cz=Math.round(f.z/texel)*texel
    light.position.set(cx+direction.x*400,f.y+direction.y*400,cz+direction.z*400)
    light.target.position.set(cx,f.y,cz);light.target.updateMatrixWorld()
  })
  const sunColor=night?'#e9f0ff':twilight?'#ffb27a':rain?'#cfd8e0':'#fff4e2'
  const sunIntensity=night?2.2:twilight?2.6:rain?1.4:3.6
  const sky=(distance:number)=><Sky ref={tameSky} distance={distance} sunPosition={direction.toArray()} turbidity={rain?18:twilight?8:venue.ground==='desert'?5.5:2.6} rayleigh={rain?.6:twilight?2.6:1.9} mieCoefficient={rain?.02:.0035} mieDirectionalG={.85}/>
  return <>
    {night?<NightSky glow={venue.ground==='urban'?'#ff9a4a':'#3d4c66'}/>:sky(16000)}
    <Environment frames={1} resolution={quality.level==='low'?64:192} background={false}>
      {night?<>
        <color attach="background" args={['#05070c']}/>
        {Array.from({length:8},(_,i)=><Lightformer key={i} form="rect" intensity={3.2} color="#eef3ff" position={[Math.cos(i/8*Math.PI*2)*14,7,Math.sin(i/8*Math.PI*2)*14]} scale={[6,1.4,1]} onUpdate={self=>self.lookAt(0,0,0)}/>)}
        <Lightformer form="rect" intensity={.4} color="#3a4658" position={[0,-6,0]} rotation-x={Math.PI/2} scale={[40,40,1]}/>
      </>:<>
        {sky(400)}
        <Lightformer form="rect" intensity={rain?.35:.6} color={venue.ground==='desert'?'#b8a27e':'#6f8158'} position={[0,-8,0]} rotation-x={Math.PI/2} scale={[60,60,1]}/>
        <Lightformer form="circle" intensity={rain?1.2:5} color="#fff6e5" position={direction.clone().multiplyScalar(30).toArray()} scale={[4,4,1]} onUpdate={self=>self.lookAt(0,0,0)}/>
      </>}
    </Environment>
    <hemisphereLight args={[night?'#9fb4d6':rain?'#c7d0d8':'#cfe3ff',night?'#1d2228':venue.ground==='desert'?'#8a7656':'#3f4f2f',night?.75:rain?.95:.45]}/>
    <directionalLight ref={sun} color={sunColor} intensity={sunIntensity} castShadow={quality.shadows>0}
      shadow-mapSize-width={quality.shadows||512} shadow-mapSize-height={quality.shadows||512}
      shadow-camera-left={-shadowRange} shadow-camera-right={shadowRange} shadow-camera-top={shadowRange} shadow-camera-bottom={-shadowRange}
      shadow-camera-near={10} shadow-camera-far={900} shadow-bias={-.00025} shadow-normalBias={.035}/>
    {night&&<directionalLight position={[-200,300,-120]} intensity={.9} color="#c8d6ff"/>}
    {rain&&<Rain intensity={1}/>}
  </>
}
