import { useEffect, useMemo } from 'react'
import { useFrame } from '@react-three/fiber'
import { Color, DynamicDrawUsage, InstancedBufferAttribute, InstancedBufferGeometry, Mesh, PlaneGeometry, ShaderMaterial, Vector3 } from 'three'
import type { RaceRuntime } from './raceRuntime'

const PUFFS=9

/** Wet-weather spray: soft billboards trailing each car's rear tyres, scaled by speed. */
export default function Spray({runtime,carCount}:{runtime:{current:RaceRuntime};carCount:number}){
  const mesh=useMemo(()=>{
    const base=new PlaneGeometry(1,1),geometry=new InstancedBufferGeometry()
    geometry.index=base.index;geometry.setAttribute('position',base.getAttribute('position'));geometry.setAttribute('uv',base.getAttribute('uv'))
    const count=carCount*PUFFS
    const puff=new InstancedBufferAttribute(new Float32Array(count*4),4).setUsage(DynamicDrawUsage),alpha=new InstancedBufferAttribute(new Float32Array(count),1).setUsage(DynamicDrawUsage)
    geometry.setAttribute('puff',puff);geometry.setAttribute('alpha',alpha);geometry.instanceCount=0
    const material=new ShaderMaterial({
      transparent:true,depthWrite:false,
      uniforms:{uColor:{value:new Color('#dfe6ea')},uTime:{value:0}},
      vertexShader:`#include <common>
        #include <logdepthbuf_pars_vertex>
        attribute vec4 puff;attribute float alpha;varying vec2 vUv;varying float vAlpha;varying float vSeed;
        void main(){
          vUv=uv;vAlpha=alpha;vSeed=fract(puff.x*.137+puff.z*.071);
          vec3 right=vec3(viewMatrix[0][0],viewMatrix[1][0],viewMatrix[2][0]),up=vec3(viewMatrix[0][1],viewMatrix[1][1],viewMatrix[2][1]);
          vec3 p=puff.xyz+(right*position.x+up*position.y)*puff.w;
          gl_Position=projectionMatrix*viewMatrix*vec4(p,1.);
          #include <logdepthbuf_vertex>
        }`,
      fragmentShader:`#include <common>
        #include <logdepthbuf_pars_fragment>
        uniform vec3 uColor;uniform float uTime;varying vec2 vUv;varying float vAlpha;varying float vSeed;
        void main(){
          #include <logdepthbuf_fragment>
          vec2 q=vUv-.5;float d=length(q)*2.;
          float wisps=.84+.16*sin(atan(q.y,q.x)*3.+uTime*2.+vSeed*20.)*sin(d*5.-uTime*3.);
          float a=smoothstep(1.,.15,d)*wisps*vAlpha;
          if(a<.004)discard;
          gl_FragColor=vec4(uColor,a);
        }`,
    })
    const m=new Mesh(geometry,material);m.frustumCulled=false;m.renderOrder=5;base.dispose()
    return m
  },[carCount])
  useEffect(()=>()=>{mesh.geometry.dispose();(mesh.material as ShaderMaterial).dispose()},[mesh])
  const v=useMemo(()=>new Vector3(),[])
  useFrame((state)=>{
    const rt=runtime.current,geometry=mesh.geometry as InstancedBufferGeometry
    const puff=geometry.getAttribute('puff') as InstancedBufferAttribute,alpha=geometry.getAttribute('alpha') as InstancedBufferAttribute
    ;(mesh.material as ShaderMaterial).uniforms.uTime.value=state.clock.elapsedTime
    let n=0
    if(rt.rain)for(const car of rt.cars){
      if(!car.visible||car.fade<.5)continue
      const speed=Math.min(1,Math.max(0,(car.dynamics.speed-8)/60))
      if(speed<=0)continue
      for(let k=0;k<PUFFS;k++){
        const f=k/(PUFFS-1),side=k%2?1:-1,t=state.clock.elapsedTime*3+k*1.7+car.index
        // From the rear tyres (z −1.9) back into a widening plume behind the diffuser.
        v.set(side*(.7-f*.55)+Math.sin(t)*.15,.35+f*1.1+Math.sin(t*1.3)*.08,-2.1-f*(4+speed*9))
        v.applyMatrix4(car.ground)
        puff.setXYZW(n,v.x,v.y,v.z,(1+f*3.6)*(.6+speed*.6))
        alpha.setX(n,speed*(1-f*.75)*.32)
        n++
      }
    }
    geometry.instanceCount=n
    puff.needsUpdate=true;alpha.needsUpdate=true
  })
  return <primitive object={mesh}/>
}
