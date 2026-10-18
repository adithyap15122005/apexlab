import { useEffect, useMemo, useRef, useState } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { DataTexture, Group, RGBAFormat, Vector3 } from 'three'
import SceneFrame, { type SceneState } from './SceneFrame'
import RaceCar from './RaceCar'

function HeroCar({active,motion,scroll}:{active:boolean;motion:boolean;scroll:number}){
  const model=useRef<Group>(null)
  const time=useRef(0)
  const previousScroll=useRef(scroll)
  const {camera,invalidate}=useThree()
  const shadow=useMemo(()=>{const pixels=new Uint8Array(64*64*4);for(let y=0;y<64;y++)for(let x=0;x<64;x++){const distance=Math.sqrt(((x-32)/32)**2+((y-32)/32)**2);pixels[(y*64+x)*4+3]=Math.max(0,1-distance)**1.8*150}const texture=new DataTexture(pixels,64,64,RGBAFormat);texture.needsUpdate=true;return texture},[])
  useEffect(()=>()=>shadow.dispose(),[shadow])
  useEffect(()=>{const movement=scroll-previousScroll.current;previousScroll.current=scroll;if(!active||!motion)return;camera.position.applyAxisAngle(new Vector3(0,1,0),movement*.3);camera.position.y+=movement*.6;camera.lookAt(0,.35,0);invalidate()},[scroll,active,motion,camera,invalidate])
  useFrame((_,delta)=>{if(!model.current)return;if(active&&motion)time.current+=Math.min(delta,.05);model.current.rotation.y=-.26+(motion?Math.sin(time.current*.22)*.035:0)})
  return <group ref={model} rotation={[0,-.26,0]}><RaceCar compound="medium"/><mesh position={[0,-.035,0]} rotation={[-Math.PI/2,0,0]}><planeGeometry args={[8,5]}/><meshBasicMaterial map={shadow} transparent depthWrite={false}/></mesh></group>
}
export function CarSchematic(){return <div className="car-schematic"><svg viewBox="0 0 600 400" role="img" aria-label="Original Apex-01 race car, overhead engineering illustration"><defs><pattern id="carbon-grid" width="24" height="24" patternUnits="userSpaceOnUse"><path d="M24 0H0V24" fill="none" stroke="#a9bd8a" strokeOpacity=".07"/></pattern></defs><rect width="600" height="400" fill="url(#carbon-grid)"/><g transform="translate(305 205) rotate(-25)"><ellipse rx="206" ry="91" fill="#1c2519"/><g fill="#0b1112" stroke="#44514c" strokeWidth="2"><rect x="-126" y="-84" width="45" height="45" rx="8"/><rect x="-126" y="39" width="45" height="45" rx="8"/><rect x="88" y="-84" width="40" height="45" rx="8"/><rect x="88" y="39" width="40" height="45" rx="8"/><path d="M-159-48h27v96h-27zM143-71h24V71h-24z"/></g><path d="M-137 0-103-28-40-35 10-23 139-11 151 0 139 11 10 23-40 35-103 28z" fill="#253235" stroke="#64746a"/><path d="M-109-39h90v14h-90zm0 64h90v14h-90z" fill="#d7ff43" opacity=".7"/><ellipse cx="-6" rx="27" ry="18" fill="#060b0b" stroke="#a0b09c" strokeWidth="3"/><path d="M34 0h104M-154-41v82M159-62V62" stroke="#d7ff43" strokeWidth="4"/><path d="M88-61 41-13m47 74L41 13M-88-61-45-20m-43 81-43-41" fill="none" stroke="#647369" strokeWidth="3"/></g><text x="45" y="360" fill="#a1b887" fontFamily="monospace" fontSize="9" letterSpacing="2">APEX-01 / ORIGINAL PROCEDURAL DESIGN</text></svg></div>}
export default function HeroExperience(){
  const [scroll,setScroll]=useState(0)
  useEffect(()=>{let request=0;const update=()=>{if(!request)request=requestAnimationFrame(()=>{setScroll(Math.min(1,window.scrollY/650));request=0})};window.addEventListener('scroll',update,{passive:true});return()=>{window.removeEventListener('scroll',update);cancelAnimationFrame(request)}},[])
  return <div className="hero-scene"><SceneFrame label="Apex-01 racing car" className="hero-car-viewer" camera={[7.3,4.1,7.8]} target={[0,.35,0]} fallback={<CarSchematic/>}>{({active,motion}:SceneState)=><HeroCar active={active} motion={motion} scroll={scroll}/>}</SceneFrame><div className="hero-car-label aero">01 / AERO, REIMAGINED<span>ORIGINAL APEX-01 CHASSIS</span></div><div className="hero-car-label power">CARBON. PRECISION. PURPOSE.<span>PROCEDURAL STUDIO EDITION</span></div><div className="hero-car-label strategy">46 LAPS. ENDLESS POSSIBILITIES.<span>ONE DECISION AT A TIME.</span></div><div className="hero-car-caption">APEX-01 · DRAG TO EXPLORE THE DETAILS</div></div>
}
