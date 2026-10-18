import { useEffect, useMemo } from 'react'
import { RoundedBox } from '@react-three/drei'
import { BufferGeometry, CanvasTexture, CatmullRomCurve3, DataTexture, DoubleSide, Float32BufferAttribute, Quaternion, RepeatWrapping, RGBAFormat, SRGBColorSpace, Vector3 } from 'three'
import { COMPOUNDS, type Compound } from '../../engine/race'

export type CarVariant='apex'|'mercedes'|'ferrari'|'mclaren'|'redbull'
type Point=[number,number,number]
type Section=[x:number,width:number,height:number,center:number]
function Rod({from,to,radius=.025,color='#333b3c'}:{from:Point;to:Point;radius?:number;color?:string}){
 const {mid,length,quaternion}=useMemo(()=>{const a=new Vector3(...from),b=new Vector3(...to),v=b.clone().sub(a);return {mid:a.add(b).multiplyScalar(.5),length:v.length(),quaternion:new Quaternion().setFromUnitVectors(new Vector3(0,1,0),v.normalize())}},[from,to])
 return <mesh position={mid} quaternion={quaternion}><cylinderGeometry args={[radius,radius,length,8]}/><meshStandardMaterial color={color} metalness={.75} roughness={.3}/></mesh>
}
function Shell({sections,color}:{sections:Section[];color:string}){
 const geometry=useMemo(()=>{
  const vertices:number[]=[],indices:number[]=[]
  sections.forEach(([x,w,h,center])=>{for(let j=0;j<20;j++){const angle=j/20*Math.PI*2;vertices.push(x,center+Math.cos(angle)*h,Math.sin(angle)*w)}})
  for(let i=0;i<sections.length-1;i++)for(let j=0;j<20;j++){const a=i*20+j,b=i*20+(j+1)%20,c=(i+1)*20+j,d=(i+1)*20+(j+1)%20;indices.push(a,c,b,b,c,d)}
  const g=new BufferGeometry();g.setAttribute('position',new Float32BufferAttribute(vertices,3));g.setIndex(indices);g.computeVertexNormals();return g
 },[sections])
 useEffect(()=>()=>geometry.dispose(),[geometry])
 return <mesh geometry={geometry}><meshPhysicalMaterial color={color} metalness={.52} roughness={.27} clearcoat={1} clearcoatRoughness={.18} side={DoubleSide}/></mesh>
}
function Marking({text,color='#fff',width=.7,height=.19,position,rotation=[0,0,0]}:{text:string;color?:string;width?:number;height?:number;position:Point;rotation?:Point}){
 const map=useMemo(()=>{const canvas=document.createElement('canvas');canvas.width=512;canvas.height=128;const c=canvas.getContext('2d')!;c.clearRect(0,0,512,128);c.fillStyle=color;c.textAlign='center';c.textBaseline='middle';c.font='bold 74px Arial';c.fillText(text,256,66,490);const t=new CanvasTexture(canvas);t.colorSpace=SRGBColorSpace;return t},[text,color])
 useEffect(()=>()=>map.dispose(),[map])
 return <mesh position={position} rotation={rotation}><planeGeometry args={[width,height]}/><meshBasicMaterial map={map} transparent depthWrite={false} polygonOffset polygonOffsetFactor={-1}/></mesh>
}
export function RacingWheel({compound='medium',wear=0,scale=1}:{compound?:Compound;wear?:number;scale?:number}){
 const color=COMPOUNDS[compound].color
 return <group scale={scale}>
  <mesh rotation={[Math.PI/2,0,0]}><cylinderGeometry args={[.43,.43,.36,48]}/><meshStandardMaterial color={wear>.7?'#343633':'#111516'} roughness={.76+wear*.2} metalness={.02}/></mesh>
  {[-1,1].map(side=><group key={side} position={[0,0,side*.184]}>
   <mesh><torusGeometry args={[.355,.012,8,48]}/><meshStandardMaterial color={color} roughness={.45}/></mesh>
   <mesh><torusGeometry args={[.409,.012,8,48]}/><meshStandardMaterial color="#24292a" roughness={.8}/></mesh>
   <mesh rotation={[Math.PI/2,0,0]}><cylinderGeometry args={[.265,.265,.014,32]}/><meshStandardMaterial color="#0a1011" roughness={.38} metalness={.8}/></mesh>
   <mesh><torusGeometry args={[.245,.022,8,32]}/><meshStandardMaterial color="#72797b" roughness={.27} metalness={.9}/></mesh>
   {Array.from({length:10},(_,i)=><mesh key={i} position={[Math.cos(i*Math.PI/5)*.12,Math.sin(i*Math.PI/5)*.12,side*.015]} rotation={[0,0,i*Math.PI/5]}><boxGeometry args={[.24,.018,.022]}/><meshStandardMaterial color="#4c575a" metalness={.85} roughness={.3}/></mesh>)}
   <mesh rotation={[Math.PI/2,0,0]} position={[0,0,side*.025]}><cylinderGeometry args={[.066,.066,.055,12]}/><meshStandardMaterial color="#b9c2c3" metalness={.9} roughness={.2}/></mesh>
   <Marking text="RACING" color={color} width={.29} height={.055} position={[0,.325,side*.022]} rotation={[0,side<0?Math.PI:0,0]}/>
  </group>)}
  {wear>.45&&Array.from({length:12},(_,i)=><mesh key={i} rotation={[0,0,i*Math.PI/6]} position={[Math.sin(i*Math.PI/6)*.432,Math.cos(i*Math.PI/6)*.432,0]}><boxGeometry args={[.035,.005,.25]}/><meshStandardMaterial color="#4d5049" roughness={1}/></mesh>)}
 </group>
}

/** Original cockpit geometry, shared by the showroom and reconstructed camera views. */
export function RacingCockpit({accent='#27f4d2',bodyColor='#263135',display='N',showSeat=true}:{accent?:string;bodyColor?:string;display?:string;showSeat?:boolean}){
 const screen=useMemo(()=>{const canvas=document.createElement('canvas');canvas.width=384;canvas.height=220;const c=canvas.getContext('2d')!;c.fillStyle='#03100f';c.fillRect(0,0,384,220);c.fillStyle=accent;c.font='bold 28px monospace';c.fillText('APEX / DRIVER DISPLAY',15,36);c.fillStyle='#f4ffe6';c.textAlign='center';c.font='bold 118px monospace';c.fillText(display,192,151);c.font='18px monospace';c.fillStyle='#9ac2b3';c.fillText('RECONSTRUCTED COCKPIT',192,195);const t=new CanvasTexture(canvas);t.colorSpace=SRGBColorSpace;return t},[accent,display])
 useEffect(()=>()=>screen.dispose(),[screen])
 return <group>
  {[-1,1].map(side=><group key={side}>
   <RoundedBox args={[1.13,.17,.10]} radius={.045} smoothness={3} position={[-.02,.74,side*.32]}><meshPhysicalMaterial color={bodyColor} roughness={.35} metalness={.5} clearcoat={.7}/></RoundedBox>
   <RoundedBox args={[.72,.13,.06]} radius={.024} smoothness={2} position={[-.11,.68,side*.27]}><meshStandardMaterial color="#101618" roughness={.88}/></RoundedBox>
   <Rod from={[-.51,.78,side*.23]} to={[-.28,.43,side*.10]} radius={.034} color="#a9a9a0"/>
  </group>)}
  <RoundedBox args={[.13,.39,.62]} radius={.05} smoothness={3} position={[-.58,.65,0]}><meshStandardMaterial color="#111717" roughness={.95}/></RoundedBox>
  {showSeat&&<><RoundedBox args={[.28,.36,.40]} radius={.07} smoothness={3} position={[-.42,.53,0]} rotation={[0,0,-.25]}><meshStandardMaterial color="#111719" roughness={.94}/></RoundedBox><RoundedBox args={[.55,.08,.34]} radius={.04} smoothness={2} position={[-.18,.34,0]}><meshStandardMaterial color="#13191a" roughness={1}/></RoundedBox></>}
  <Rod from={[.57,.52,0]} to={[.37,.77,0]} radius={.025} color="#465153"/>
  <group position={[.35,.79,0]}>
   {[-1,1].map(side=><RoundedBox key={side} args={[.06,.21,.055]} radius={.025} smoothness={3} position={[0,0,side*.20]} rotation={[side*-.2,0,0]}><meshStandardMaterial color="#0b1011" roughness={.83}/></RoundedBox>)}
   <RoundedBox args={[.035,.14,.34]} radius={.008} smoothness={3}><meshStandardMaterial color="#172023" roughness={.5} metalness={.6}/></RoundedBox>
   <mesh position={[-.033,.017,0]} rotation={[0,-Math.PI/2,0]}><planeGeometry args={[.18,.105]}/><meshBasicMaterial map={screen} toneMapped={false}/></mesh>
   {[-1,1].map(side=>Array.from({length:3},(_,i)=><mesh key={`${side}-${i}`} position={[-.034,.045-i*.045,side*.143]} rotation={[0,0,Math.PI/2]}><cylinderGeometry args={[.012,.012,.01,10]}/><meshStandardMaterial color={['#e83c41','#52bcf0','#f4d645'][i]} roughness={.3}/></mesh>))}
   {Array.from({length:9},(_,i)=><mesh key={i} position={[-.025,.10,-.08+i*.02]}><boxGeometry args={[.008,.012,.012]}/><meshBasicMaterial color={i<3?'#46d677':i<6?'#f9d94b':'#e8586a'}/></mesh>)}
   {[-1,1].map(side=><mesh key={side} position={[.035,-.045,side*.17]} rotation={[0,0,.25]}><boxGeometry args={[.014,.11,.055]}/><meshStandardMaterial color="#728083" metalness={.9} roughness={.3}/></mesh>)}
  </group>
  <RoundedBox args={[.18,.15,.60]} radius={.04} smoothness={2} position={[.57,.69,0]}><meshStandardMaterial color="#161e20" roughness={.75}/></RoundedBox>
 </group>
}

export default function RaceCar({compound='medium',scale=1,wear=0,accent='#d7ff43',bodyColor='#263135',secondaryColor='#b8c1c2',driverNumber='01',teamName='APEXLAB',variant='apex',cockpit=true}:{compound?:Compound;scale?:number;wear?:number;accent?:string;bodyColor?:string;secondaryColor?:string;driverNumber?:string|number;teamName?:string;variant?:CarVariant;cockpit?:boolean}){
 const carbon=useMemo(()=>{const pixels=new Uint8Array(8*8*4);for(let y=0;y<8;y++)for(let x=0;x<8;x++){const i=(y*8+x)*4,v=(Math.floor(x/2)+Math.floor(y/2))%2===0?38:20;pixels[i]=v;pixels[i+1]=v+3;pixels[i+2]=v+4;pixels[i+3]=255}const tex=new DataTexture(pixels,8,8,RGBAFormat);tex.wrapS=tex.wrapT=RepeatWrapping;tex.repeat.set(24,10);tex.needsUpdate=true;return tex},[])
 const halo=useMemo(()=>new CatmullRomCurve3([new Vector3(.72,.92,0),new Vector3(.31,1.09,.31),new Vector3(-.42,1.06,.31),new Vector3(-.56,.97,0),new Vector3(-.42,1.06,-.31),new Vector3(.31,1.09,-.31),new Vector3(.72,.92,0)]),[])
 const nose=useMemo<Section[]>(()=>[[2.55,.07,.08,.34],[2.18,.14,.13,.42],[1.5,.18,.16,.48],[.9,.24,.19,.50],[.61,.31,.18,.49]],[variant])
 const engine=useMemo<Section[]>(()=>[[-.55,.28,.23,.66],[-.85,.31,.40,.70],[-1.10,.25,.44,.65],[-1.45,.20,.31,.59],[-1.90,.13,.15,.50],[-2.18,.08,.09,.48]],[variant])
 const profile=variant==='redbull'?[1.67,.29,.52,-.14]:variant==='ferrari'?[1.8,.37,.53,-.08]:variant==='mclaren'?[1.65,.32,.48,-.11]:[1.72,.31,.47,-.10]
 useEffect(()=>()=>carbon.dispose(),[carbon])
 return <group scale={scale}>
  <Shell sections={nose} color={variant==='redbull'?'#ffd238':bodyColor}/><Shell sections={engine} color={variant==='mclaren'?'#172125':bodyColor}/>
  <RoundedBox args={[3.82,.10,1.48]} radius={.04} smoothness={2} position={[-.12,.19,0]}><meshStandardMaterial color="#111719" map={carbon} metalness={.65} roughness={.42}/></RoundedBox>
  {[-1,1].map(side=><group key={side}>
   <RoundedBox args={[profile[0],profile[1],profile[2]]} radius={.13} smoothness={4} position={[-.71,.48,side*.54]} rotation={[0,side*.06,profile[3]]}><meshPhysicalMaterial color={bodyColor} roughness={.26} metalness={.5} clearcoat={1}/></RoundedBox>
   <mesh position={[-.45,.62,side*.64]} scale={[.88,.10,.26]} rotation={[0,side*.10,-.10]}><sphereGeometry args={[1,32,16]}/><meshPhysicalMaterial color={variant==='mercedes'?secondaryColor:variant==='mclaren'?secondaryColor:bodyColor} roughness={.23} metalness={.64} clearcoat={.7}/></mesh>
   <RoundedBox args={[.13,.16,.41]} radius={.04} smoothness={3} position={[.12,.59,side*.52]} rotation={[0,0,-.1]}><meshStandardMaterial color="#03090a" roughness={.9}/></RoundedBox>
   <RoundedBox args={[1.35,.028,.065]} radius={.013} smoothness={2} position={[-.55,.55,side*.78]} rotation={[0,side*.05,-.12]}><meshStandardMaterial color={accent} roughness={.28} metalness={.4}/></RoundedBox>
   <RoundedBox args={[1.9,.035,.13]} radius={.013} smoothness={2} position={[-.65,.25,side*.72]}><meshStandardMaterial color="#1e282a" map={carbon} metalness={.7} roughness={.4}/></RoundedBox>
   {Array.from({length:7},(_,i)=><mesh key={i} position={[-.67-i*.067,.78-i*.018,side*.27]} rotation={[0,side*.3,.18]}><boxGeometry args={[.025,.012,.17]}/><meshStandardMaterial color="#080e10" roughness={.8}/></mesh>)}
   <Marking text={teamName.toUpperCase()} color={variant==='mercedes'?'#e3e9e7':'#fff7eb'} width={.92} height={.16} position={[-.61,.49,side*.805]} rotation={[0,side<0?Math.PI:0,-.08]}/>
   <Rod from={[.42,.75,side*.27]} to={[.56,.84,side*.70]} radius={.017}/><RoundedBox args={[.23,.08,.15]} radius={.025} smoothness={3} position={[.56,.84,side*.71]}><meshPhysicalMaterial color={bodyColor} metalness={.6} roughness={.22} clearcoat={1}/></RoundedBox>
   <mesh position={[.56,.84,side*.79]}><boxGeometry args={[.18,.045,.005]}/><meshStandardMaterial color="#a5c7cc" metalness={1} roughness={.06}/></mesh>
   {[-1.61,1.64].map((x,i)=><group key={x}>
    <Rod from={[x+(i===1?-.47:.34),.35,side*.21]} to={[x,.41,side*.94]} radius={.025}/><Rod from={[x+(i===1?.12:-.22),.55,side*.21]} to={[x,.41,side*.94]} radius={.019}/><Rod from={[x+(i===1?-.24:.1),.65,side*.18]} to={[x,.42,side*.86]} radius={.018}/>
    <group position={[x,.44,side*1.0]}><RacingWheel compound={compound} wear={wear}/></group>
   </group>)}
   <RoundedBox args={[.64,.46,.04]} radius={.025} smoothness={2} position={[-2.10,.99,side*.91]} rotation={[0,0,.07]}><meshPhysicalMaterial color={bodyColor} map={variant==='apex'?carbon:undefined} roughness={.3} metalness={.55} clearcoat={.7}/></RoundedBox>
   <mesh position={[-2.11,1.20,side*.935]}><boxGeometry args={[.54,.023,.012]}/><meshStandardMaterial color={accent}/></mesh>
   <RoundedBox args={[.73,.18,.04]} radius={.025} smoothness={3} position={[2.32,.28,side*1.07]}><meshPhysicalMaterial color={bodyColor} roughness={.3} metalness={.5}/></RoundedBox>
   <RoundedBox args={[.50,.07,.08]} radius={.02} smoothness={2} position={[1.65,.91,side*.81]} rotation={[0,0,.15]}><meshStandardMaterial color="#151e20" map={carbon} roughness={.4} metalness={.6}/></RoundedBox>
  </group>)}
  {cockpit&&<RacingCockpit accent={accent} bodyColor={bodyColor}/>}
  <mesh><tubeGeometry args={[halo,64,.033,8,false]}/><meshPhysicalMaterial color={variant==='mercedes'?'#788588':variant==='mclaren'?'#172125':bodyColor} roughness={.27} metalness={.7} clearcoat={.6}/></mesh>
  <Rod from={[.72,.92,0]} to={[.87,.58,0]} radius={.028} color={bodyColor}/>
  <RoundedBox args={[.48,.20,.12]} radius={.05} smoothness={3} position={[-.85,1.15,0]} rotation={[0,0,-.20]}><meshPhysicalMaterial color={bodyColor} roughness={.23} metalness={.55} clearcoat={1}/></RoundedBox>
  <mesh position={[-.62,1.18,0]} rotation={[0,0,Math.PI/2]}><cylinderGeometry args={[.065,.065,.015,20]}/><meshStandardMaterial color="#050a0b" roughness={.8}/></mesh>
  <mesh position={[-.90,1.30,0]}><boxGeometry args={[.21,.025,.025]}/><meshStandardMaterial color={accent}/></mesh>
  {[0,1,2,3].map(i=><RoundedBox key={i} args={[.18,.035,2.10-i*.11]} radius={.014} smoothness={2} position={[2.54-i*.18,.22+i*.05,0]} rotation={[0,0,-.13]}><meshPhysicalMaterial color={i===3?accent:bodyColor} roughness={.3} metalness={.55} clearcoat={.7}/></RoundedBox>)}
  {[0,1].map(i=><RoundedBox key={i} args={[.59,.07,1.80]} radius={.017} smoothness={2} position={[-2.12,1.05+i*.16,0]} rotation={[0,0,.10]}><meshPhysicalMaterial color={i===1?bodyColor:'#1a2224'} metalness={.6} roughness={.26} clearcoat={.8}/></RoundedBox>)}
  <Marking text={teamName.toUpperCase()} width={1.30} height={.25} position={[-2.12,1.265,0]} rotation={[-Math.PI/2,0,Math.PI/2]}/>
  {[-.25,.25].map(z=><Rod key={z} from={[-1.82,.48,z]} to={[-2.1,1.04,z]} radius={.027}/>)}
  {Array.from({length:7},(_,i)=><mesh key={i} position={[-1.95,.26,-.55+i*.18]} rotation={[0,0,-.10]}><boxGeometry args={[.68,.12,.015]}/><meshStandardMaterial color="#152022" map={carbon} metalness={.6} roughness={.5}/></mesh>)}
  <Marking text={String(driverNumber)} color={accent} width={.28} height={.30} position={[1.45,.665,0]} rotation={[-Math.PI/2,0,-Math.PI/2]}/>
  <mesh position={[-2.28,.48,0]}><boxGeometry args={[.035,.065,.13]}/><meshBasicMaterial color="#ff443b"/></mesh>
  <mesh position={[-1.89,.66,0]} rotation={[0,0,Math.PI/2]}><cylinderGeometry args={[.06,.06,.35,20]}/><meshStandardMaterial color="#8d8b83" metalness={.95} roughness={.23}/></mesh>
 </group>
}
