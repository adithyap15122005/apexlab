import { useEffect, useMemo } from 'react'
import { RoundedBox } from '@react-three/drei'
import { BufferGeometry, CatmullRomCurve3, DataTexture, DoubleSide, Float32BufferAttribute, Quaternion, RepeatWrapping, RGBAFormat, Vector3 } from 'three'
import { COMPOUNDS, type Compound } from '../../engine/race'

function Rod({from,to,radius=.025,color='#333b3c'}:{from:[number,number,number];to:[number,number,number];radius?:number;color?:string}){
  const {mid,length,quaternion}=useMemo(()=>{const a=new Vector3(...from),b=new Vector3(...to),v=b.clone().sub(a);return {mid:a.add(b).multiplyScalar(.5),length:v.length(),quaternion:new Quaternion().setFromUnitVectors(new Vector3(0,1,0),v.normalize())}},[from,to])
  return <mesh position={mid} quaternion={quaternion}><cylinderGeometry args={[radius,radius,length,6]}/><meshStandardMaterial color={color} metalness={.7} roughness={.3}/></mesh>
}
function BodyShell(){
  const geometry=useMemo(()=>{
    const sections=[[2.5,.14,.15,.43],[1.8,.2,.2,.47],[.9,.32,.28,.55],[.15,.41,.36,.61],[-.7,.46,.49,.65],[-1.3,.37,.53,.65],[-1.9,.2,.27,.58],[-2.25,.12,.17,.53]]
    const vertices:number[]=[],indices:number[]=[]
    sections.forEach(([x,w,h,center])=>{for(let j=0;j<12;j++){const angle=j/12*Math.PI*2;vertices.push(x,center+Math.cos(angle)*h,Math.sin(angle)*w)}})
    for(let i=0;i<sections.length-1;i++)for(let j=0;j<12;j++){const a=i*12+j,b=i*12+(j+1)%12,c=(i+1)*12+j,d=(i+1)*12+(j+1)%12;indices.push(a,c,b,b,c,d)}
    const g=new BufferGeometry();g.setAttribute('position',new Float32BufferAttribute(vertices,3));g.setIndex(indices);g.computeVertexNormals();return g
  },[])
  return <mesh geometry={geometry}><meshPhysicalMaterial color="#20292b" metalness={.78} roughness={.28} clearcoat={.65} clearcoatRoughness={.25} side={DoubleSide}/></mesh>
}
export function RacingWheel({compound='medium',wear=0,scale=1}:{compound?:Compound;wear?:number;scale?:number}){
  const color=COMPOUNDS[compound].color
  const rubber=wear>.7?'#353632':'#171b1c'
  return <group scale={scale}>
    <mesh rotation={[Math.PI/2,0,0]}><cylinderGeometry args={[.43,.43,.36,40]}/><meshStandardMaterial color={rubber} roughness={.62+wear*.3} metalness={.02}/></mesh>
    {[-1,1].map(side=><group key={side} position={[0,0,side*.184]}>
      <mesh><torusGeometry args={[.355,.014,8,40]}/><meshStandardMaterial color={color} roughness={.45}/></mesh>
      <mesh><torusGeometry args={[.405,.017,6,40]}/><meshStandardMaterial color="#282d2d" roughness={.8}/></mesh>
      <mesh rotation={[Math.PI/2,0,0]}><cylinderGeometry args={[.265,.265,.013,24]}/><meshStandardMaterial color="#11191a" roughness={.4} metalness={.8}/></mesh>
      <mesh><torusGeometry args={[.245,.025,8,24]}/><meshStandardMaterial color="#5b686a" roughness={.3} metalness={.9}/></mesh>
      {Array.from({length:8},(_,i)=><mesh key={i} position={[Math.cos(i*Math.PI/4)*.12,Math.sin(i*Math.PI/4)*.12,side*.015]} rotation={[0,0,i*Math.PI/4]}><boxGeometry args={[.23,.025,.025]}/><meshStandardMaterial color="#657274" metalness={.9} roughness={.3}/></mesh>)}
      <mesh rotation={[Math.PI/2,0,0]} position={[0,0,side*.025]}><cylinderGeometry args={[.065,.065,.055,12]}/><meshStandardMaterial color="#c1c9bf" metalness={.85} roughness={.25}/></mesh>
      <mesh position={[0,.32,side*.01]}><boxGeometry args={[.09,.018,.008]}/><meshBasicMaterial color={color}/></mesh>
    </group>)}
    {wear>.45&&Array.from({length:12},(_,i)=><mesh key={i} rotation={[0,0,i*Math.PI/6]} position={[Math.sin(i*Math.PI/6)*.432,Math.cos(i*Math.PI/6)*.432,0]}><boxGeometry args={[.035,.005,.25]}/><meshStandardMaterial color="#4d5049" roughness={1}/></mesh>)}
  </group>
}
export default function RaceCar({compound='medium',scale=1,wear=0,accent='#d7ff43'}:{compound?:Compound;scale?:number;wear?:number;accent?:string}){
  const carbon=useMemo(()=>{const pixels=new Uint8Array(8*8*4);for(let y=0;y<8;y++)for(let x=0;x<8;x++){const i=(y*8+x)*4;const v=(Math.floor(x/2)+Math.floor(y/2))%2===0?47:29;pixels[i]=v;pixels[i+1]=v+3;pixels[i+2]=v+4;pixels[i+3]=255}const tex=new DataTexture(pixels,8,8,RGBAFormat);tex.wrapS=tex.wrapT=RepeatWrapping;tex.repeat.set(24,10);tex.needsUpdate=true;return tex},[])
  const halo=useMemo(()=>new CatmullRomCurve3([new Vector3(.65,.98,0),new Vector3(.25,1.14,.35),new Vector3(-.35,1.12,.33),new Vector3(-.48,1.05,0),new Vector3(-.35,1.12,-.33),new Vector3(.25,1.14,-.35),new Vector3(.65,.98,0)]),[])
  useEffect(()=>()=>carbon.dispose(),[carbon])
  return <group scale={scale}>
    <BodyShell/>
    <RoundedBox args={[3.7,.13,1.42]} radius={.05} smoothness={2} position={[-.1,.16,0]}><meshStandardMaterial color="#151b1b" map={carbon} metalness={.55} roughness={.43}/></RoundedBox>
    {[-1,1].map(side=><group key={side}>
      <RoundedBox args={[1.8,.4,.48]} radius={.15} smoothness={3} position={[-.65,.48,side*.53]} rotation={[0,side*-.07,-.05]}><meshPhysicalMaterial color="#252f30" map={carbon} roughness={.36} metalness={.7} clearcoat={.5}/></RoundedBox>
      <RoundedBox args={[1.5,.025,.08]} radius={.012} smoothness={2} position={[-.5,.67,side*.68]} rotation={[0,side*-.07,-.05]}><meshStandardMaterial color={accent} roughness={.4} metalness={.35}/></RoundedBox>
      <mesh position={[.25,.56,side*.49]} rotation={[0,0,-.05]}><boxGeometry args={[.13,.16,.45]}/><meshStandardMaterial color="#060b0b" roughness={.85}/></mesh>
      <Rod from={[.5,.76,side*.26]} to={[.6,.84,side*.72]} radius={.018}/><RoundedBox args={[.24,.09,.16]} radius={.035} smoothness={2} position={[.6,.84,side*.73]}><meshStandardMaterial color={accent} roughness={.3} metalness={.4}/></RoundedBox>
      {[-1.6,1.63].map((x,i)=><group key={x}>
        <Rod from={[x+(i===1?-.4:.3),.35,side*.25]} to={[x,.41,side*.94]}/><Rod from={[x+(i===1?.15:-.2),.51,side*.22]} to={[x,.41,side*.94]} radius={.018}/>
        <group position={[x,.44,side*1.0]}><RacingWheel compound={compound} wear={wear}/></group>
      </group>)}
      <RoundedBox args={[.57,.47,.055]} radius={.025} smoothness={2} position={[-2.15,.97,side*.91]} rotation={[0,0,.08]}><meshStandardMaterial color="#20292a" map={carbon} roughness={.4} metalness={.65}/></RoundedBox>
      <mesh position={[-2.15,1.18,side*.945]}><boxGeometry args={[.5,.035,.01]}/><meshStandardMaterial color={accent}/></mesh>
      <RoundedBox args={[.72,.16,.05]} radius={.02} smoothness={2} position={[2.3,.29,side*1.05]}><meshStandardMaterial color="#253031" map={carbon} roughness={.4} metalness={.65}/></RoundedBox>
    </group>)}
    <mesh position={[.04,.87,0]} scale={[.57,.14,.33]}><sphereGeometry args={[1,24,16]}/><meshStandardMaterial color="#020606" roughness={.24} metalness={.1}/></mesh>
    <mesh geometry={undefined}><tubeGeometry args={[halo,48,.035,6,false]}/><meshStandardMaterial color="#5b6769" roughness={.28} metalness={.8}/></mesh>
    <Rod from={[.65,.98,0]} to={[.85,.64,0]} radius={.035} color="#697571"/>
    <mesh position={[-.3,.91,0]} scale={[.13,.12,.13]}><sphereGeometry args={[1,16,12]}/><meshStandardMaterial color={accent} roughness={.25} metalness={.3}/></mesh>
    <RoundedBox args={[.8,.36,.09]} radius={.035} smoothness={2} position={[-1.05,1.13,0]} rotation={[0,0,-.25]}><meshStandardMaterial color="#313d3d" map={carbon} roughness={.4} metalness={.65}/></RoundedBox>
    <mesh position={[-1.05,1.32,0]} rotation={[0,0,-.25]}><boxGeometry args={[.7,.025,.095]}/><meshStandardMaterial color={accent}/></mesh>
    {[0,1,2].map(i=><RoundedBox key={i} args={[.19,.055,2.12-i*.09]} radius={.02} smoothness={2} position={[2.56-i*.19,.22+i*.065,0]} rotation={[0,0,-.12]}><meshStandardMaterial color={i===2?accent:'#273234'} map={i===2?undefined:carbon} metalness={.6} roughness={.32}/></RoundedBox>)}
    {[0,1].map(i=><RoundedBox key={i} args={[.6,.08,1.8]} radius={.02} smoothness={2} position={[-2.16,1.08+i*.17,0]} rotation={[0,0,.1]}><meshStandardMaterial color="#202c2d" map={carbon} metalness={.6} roughness={.25}/></RoundedBox>)}
    <mesh position={[-1.86,1.28,0]} rotation={[0,0,.1]}><boxGeometry args={[.025,.025,1.78]}/><meshStandardMaterial color={accent}/></mesh>
    {[-.25,.25].map(z=><Rod key={z} from={[-1.9,.5,z]} to={[-2.1,1.03,z]} radius={.035}/>)}
    <mesh position={[1.8,.66,0]} rotation={[0,0,-.13]}><boxGeometry args={[.9,.018,.065]}/><meshStandardMaterial color={accent} roughness={.4}/></mesh>
    <mesh position={[-2.33,.5,0]}><boxGeometry args={[.035,.05,.13]}/><meshBasicMaterial color="#ff6559"/></mesh>
  </group>
}
