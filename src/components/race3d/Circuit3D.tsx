import { useEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { BoxGeometry, BufferGeometry, Color, ConeGeometry, CylinderGeometry, DoubleSide, Float32BufferAttribute, IcosahedronGeometry, InstancedMesh, MeshBasicMaterial, MeshStandardMaterial, Object3D, PlaneGeometry, Vector2, type Material, type Texture } from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import type { CircuitLayout, Placement } from './circuitBuilder'
import type { RaceRuntime, TrackStatus } from './raceRuntime'
import { armcoTexture, asphaltTextures, concreteTexture, crowdTexture, facadeTexture, fenceTexture, grassTexture, gravelTexture, hoardingTexture, sandTexture, tecproTexture } from './textures'
import type { Venue } from './venues'

type Shader={uniforms:Record<string,{value:unknown}>;vertexShader:string;fragmentShader:string}
type SurfaceUniforms={uWet:{value:number}}

function roadMaterial(halfWidth:number,length:number,poleSide:number,gridCount:number,wet:SurfaceUniforms,pit=false){
  const tex=asphaltTextures()
  const material=new MeshStandardMaterial({map:tex.map,normalMap:tex.normal,normalScale:new Vector2(.55,.55),roughnessMap:tex.rough,roughness:1,metalness:0,color:pit?'#c9cbcd':'#ffffff',polygonOffset:true,polygonOffsetFactor:-1})
  material.onBeforeCompile=(shader:Shader)=>{
    Object.assign(shader.uniforms,{uHalfWidth:{value:halfWidth},uLength:{value:length},uPole:{value:poleSide},uGrid:{value:pit?0:gridCount},uWet:wet.uWet,uPit:{value:pit?1:0}})
    shader.vertexShader='attribute vec4 road;\nvarying vec4 vRoad;\n'+shader.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\nvRoad=road;')
    shader.fragmentShader='uniform float uHalfWidth;uniform float uLength;uniform float uPole;uniform float uGrid;uniform float uWet;uniform float uPit;\nvarying vec4 vRoad;\n'+shader.fragmentShader
      .replace('#include <map_fragment>',`#include <map_fragment>
      float apexW=vRoad.x,apexS=vRoad.y,apexLap=mod(apexS,uLength);
      // Large-scale resurfacing patches break up texture tiling.
      float apexPatch=texture2D(map,vMapUv*.045).r;
      diffuseColor.rgb*=.82+apexPatch*.55;
      // A darker, polished rubber line where the cars run, and braking streaks before corners.
      float apexRubber=(1.-smoothstep(.5,2.4,abs(apexW-vRoad.z)))*(1.-uPit);
      float apexStreak=smoothstep(.22,.42,texture2D(map,vec2(apexW*.31,apexS*.011)).r);
      float apexMarks=vRoad.w*apexStreak*(1.-smoothstep(.3,2.8,abs(apexW-vRoad.z)));
      diffuseColor.rgb*=1.-.3*apexRubber-.38*apexMarks;
      // White track-limit lines (and pit-lane lines).
      float apexEdge=step(uHalfWidth-.24,abs(apexW))*(1.-step(uHalfWidth-.03,abs(apexW)));
      float apexPaint=apexEdge;
      // Chequered timing line and the starting grid.
      if(uPit<.5){
        float apexChq=step(apexLap,1.2)*mod(floor(apexW/.6)+floor(apexLap/.6),2.);
        float apexLine=step(apexLap,1.2);
        float behind=uLength-apexLap;
        float apexGrid=0.;
        if(behind<14.+8.*uGrid){
          for(int k=0;k<24;k++){
            if(float(k)>=uGrid)break;
            float b=10.+8.*float(k),c=uPole*(mod(float(k),2.)<.5?1.:-1.)*uHalfWidth*.45;
            float bar=step(abs(behind-b),.08)*step(abs(apexW-c),1.45);
            float side=step(abs(abs(apexW-c)-1.4),.07)*step(b-.05,behind)*step(behind,b+1.3);
            apexGrid=max(apexGrid,max(bar,side));
          }
        }
        apexPaint=max(apexPaint,apexGrid);
        diffuseColor.rgb=mix(diffuseColor.rgb,vec3(.86),apexPaint);
        diffuseColor.rgb=mix(diffuseColor.rgb,mix(vec3(.85),vec3(.03),apexChq),apexLine);
        apexPaint=max(apexPaint,apexLine);
      }else{
        float apexCentre=step(abs(apexW),.07);
        diffuseColor.rgb=mix(diffuseColor.rgb,vec3(.86),max(apexEdge,apexCentre));
        apexPaint=max(apexEdge,apexCentre);
      }
      diffuseColor.rgb*=mix(1.,.5,uWet*(1.-apexPaint*.5));`)
      .replace('#include <roughnessmap_fragment>',`#include <roughnessmap_fragment>
      roughnessFactor=mix(roughnessFactor,roughnessFactor*.78,apexRubber);
      roughnessFactor=mix(roughnessFactor,.55,apexPaint);
      roughnessFactor=mix(roughnessFactor,.06+.1*apexPatch,uWet);`)
  }
  material.customProgramCacheKey=()=>`apex-road-${pit}`
  return material
}

function kerbMaterial(colors:[string,string],wet:SurfaceUniforms){
  const material=new MeshStandardMaterial({roughness:.5,metalness:0,polygonOffset:true,polygonOffsetFactor:-2})
  const a=new Color(colors[0]),b=new Color(colors[1])
  material.onBeforeCompile=(shader:Shader)=>{
    Object.assign(shader.uniforms,{uA:{value:a},uB:{value:b},uWet:wet.uWet})
    shader.vertexShader='varying vec2 vKerb;\n'+shader.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\nvKerb=uv;')
    shader.fragmentShader='uniform vec3 uA;uniform vec3 uB;uniform float uWet;varying vec2 vKerb;\n'+shader.fragmentShader
      .replace('#include <color_fragment>',`#include <color_fragment>
      float apexStripe=step(.5,fract(vKerb.y/2.2));
      diffuseColor.rgb=mix(uA,uB,apexStripe)*(1.-.28*smoothstep(.82,1.,vKerb.x))*mix(1.,.62,uWet);`)
      .replace('#include <roughnessmap_fragment>','#include <roughnessmap_fragment>\nroughnessFactor=mix(roughnessFactor,.1,uWet);')
  }
  material.customProgramCacheKey=()=>'apex-kerb'
  return material
}

function vergeMaterial(venue:Venue,wet:SurfaceUniforms){
  const ground=venue.ground==='desert'?sandTexture():grassTexture()
  const material=new MeshStandardMaterial({map:ground,roughness:.95,metalness:0})
  material.onBeforeCompile=(shader:Shader)=>{
    Object.assign(shader.uniforms,{uGravel:{value:gravelTexture()},uTarmac:{value:asphaltTextures().map},uWet:wet.uWet})
    shader.vertexShader='attribute vec3 surface;attribute vec2 track;varying vec3 vSurface;varying vec2 vTrack;\n'+shader.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\nvSurface=surface;vTrack=track;')
    shader.fragmentShader='uniform sampler2D uGravel;uniform sampler2D uTarmac;uniform float uWet;varying vec3 vSurface;varying vec2 vTrack;\n'+shader.fragmentShader
      .replace('#include <map_fragment>',`
      vec3 apexGrass=texture2D(map,vMapUv).rgb*mix(.9,1.08,step(.5,fract(vTrack.y/14.)));
      vec3 apexGravel=texture2D(uGravel,vMapUv*2.4).rgb;
      vec3 apexTarmac=texture2D(uTarmac,vMapUv*2.).rgb*vec3(1.18,1.24,1.36)*(.95+.1*step(.5,fract(vTrack.y/30.)));
      vec3 apexW=vSurface/max(.001,vSurface.x+vSurface.y+vSurface.z);
      diffuseColor.rgb*=apexGrass*apexW.x+apexGravel*apexW.y+apexTarmac*apexW.z;
      diffuseColor.rgb*=mix(1.,.6,uWet*apexW.z);`)
      .replace('#include <roughnessmap_fragment>','#include <roughnessmap_fragment>\nroughnessFactor=mix(roughnessFactor,mix(.85,.12,uWet),apexW.z);')
  }
  material.customProgramCacheKey=()=>'apex-verge'
  return material
}

/** Concrete wall with sponsor hoardings on the track-facing side only (v ≤ 1). */
function wallMaterial(hoarding:Texture){
  const material=new MeshStandardMaterial({map:hoarding,roughness:.6,side:DoubleSide})
  material.onBeforeCompile=(shader:Shader)=>{
    shader.fragmentShader=shader.fragmentShader.replace('#include <map_fragment>',`#include <map_fragment>
      if(vMapUv.y>1.02)diffuseColor.rgb=vec3(.42,.43,.44);`)
  }
  material.customProgramCacheKey=()=>'apex-wall'
  return material
}

/** Buildings: world-space facade mapping so one instanced box serves every size. */
function facadeMaterial(night:boolean){
  const material=new MeshStandardMaterial({map:facadeTexture(false),roughness:.6,metalness:.25,emissiveMap:night?facadeTexture(true):null,emissive:night?'#ffd9a0':'#000000',emissiveIntensity:night?1.6:0})
  material.onBeforeCompile=(shader:Shader)=>{
    shader.vertexShader='varying vec3 vApexWorld;varying vec3 vApexNormal;\n'+shader.vertexShader.replace('#include <begin_vertex>',`#include <begin_vertex>
      vApexWorld=(modelMatrix*instanceMatrix*vec4(position,1.)).xyz;vApexNormal=normalize(mat3(modelMatrix*instanceMatrix)*normal);`)
    const uv=`vec2 apexUv=abs(vApexNormal.x)>abs(vApexNormal.z)?vec2(vApexWorld.z,vApexWorld.y):vec2(vApexWorld.x,vApexWorld.y);apexUv=apexUv/vec2(32.,64.);float apexRoof=step(.6,vApexNormal.y);`
    shader.fragmentShader='varying vec3 vApexWorld;varying vec3 vApexNormal;\n'+shader.fragmentShader
      .replace('#include <map_fragment>',`${uv}
      diffuseColor.rgb*=mix(texture2D(map,apexUv).rgb,vec3(.32),apexRoof);`)
      .replace('#include <emissivemap_fragment>',`#ifdef USE_EMISSIVEMAP
      totalEmissiveRadiance*=texture2D(emissiveMap,apexUv).rgb*(1.-apexRoof);
      #endif`)
  }
  material.customProgramCacheKey=()=>`apex-facade-${night}`
  return material
}

function mergeColored(parts:[BufferGeometry,string][]){
  const geometries=parts.map(([g,color])=>{
    const c=new Color(color),flat=g.index?g.toNonIndexed():g,count=flat.getAttribute('position').count,colors=new Float32Array(count*3)
    for(let i=0;i<count;i++){colors[i*3]=c.r;colors[i*3+1]=c.g;colors[i*3+2]=c.b}
    flat.setAttribute('color',new Float32BufferAttribute(colors,3))
    if(!flat.getAttribute('uv'))flat.setAttribute('uv',new Float32BufferAttribute(new Float32Array(count*2),2))
    flat.computeVertexNormals()
    return flat
  })
  return mergeGeometries(geometries,false)!
}
function treeGeometries(){
  const t=(g:BufferGeometry,x:number,y:number,z:number)=>{g.translate(x,y,z);return g}
  const conifer=mergeColored([[t(new CylinderGeometry(.22,.32,3,5),0,1.5,0),'#5a4632'],[t(new ConeGeometry(2.7,5,7),0,4.6,0),'#2f4d2c'],[t(new ConeGeometry(2.1,4.4,7),0,7.2,0),'#355531'],[t(new ConeGeometry(1.3,3.6,7),0,9.6,0),'#3b5c35']])
  const broadleaf=mergeColored([[t(new CylinderGeometry(.25,.38,3.6,5),0,1.8,0),'#5d4a36'],[t(new IcosahedronGeometry(3.1,1),0,5.6,0),'#4b6b35'],[t(new IcosahedronGeometry(2.3,0),1.6,6.8,.8),'#567a3c'],[t(new IcosahedronGeometry(2.1,0),-1.5,6.4,-.9),'#46652f']])
  const fronds:[BufferGeometry,string][]=[]
  for(let k=0;k<8;k++){const f=new PlaneGeometry(4.2,.9,3,1);f.translate(2.1,0,0);f.rotateX(Math.PI/2);f.rotateZ(-.45);f.rotateY(k/8*Math.PI*2);f.translate(0,9,0);fronds.push([f,'#4f7a32'])}
  const palm=mergeColored([[t(new CylinderGeometry(.18,.3,9,6),0,4.5,0),'#8a7354'],...fronds])
  return [conifer,broadleaf,palm]
}
function standGeometries(){
  // Local +Z faces the track. 14 m wide; seating rises away from the circuit.
  const slope=new PlaneGeometry(14,13.5,1,1);slope.rotateX(-Math.PI/2+.62);slope.translate(0,5.4,-1)
  const uv=slope.getAttribute('uv');for(let i=0;i<uv.count;i++)uv.setXY(i,uv.getX(i)*3,uv.getY(i)*4)
  const structure=mergeColored([
    [new BoxGeometry(14,1.4,.4).translate(0,.7,5.2),'#d8dadc'],[new BoxGeometry(.5,11,12).translate(-6.9,5.2,-1),'#b9bdc0'],[new BoxGeometry(.5,11,12).translate(6.9,5.2,-1),'#b9bdc0'],
    [new BoxGeometry(14,11,.4).translate(0,5.4,-6.8),'#a3a8ab'],[new BoxGeometry(.4,13,.4).translate(-6,6.5,-6.4),'#7d858a'],[new BoxGeometry(.4,13,.4).translate(6,6.5,-6.4),'#7d858a'],
  ])
  const roof=new BoxGeometry(15,.35,13).translate(0,13.2,-.3).rotateX(-.08)
  return {slope,structure,roof}
}
function garageGeometries(){
  const structure=mergeColored([
    [new BoxGeometry(13,3.2,22).translate(0,9.4,-11),'#e4e6e8'],[new BoxGeometry(1.2,8,22).translate(-6.1,4,-11),'#d5d8da'],
    [new BoxGeometry(13,.5,22).translate(0,11.2,-11),'#9aa1a6'],[new BoxGeometry(13,1.1,.3).translate(0,7.6,.05),'#1b2a3a'],
  ])
  const glass=new BoxGeometry(12.6,2.6,.2).translate(0,9.4,.12)
  const interior=mergeColored([[new BoxGeometry(11.6,7,.2).translate(0,3.5,-14),'#2a2f35'],[new BoxGeometry(11.6,.2,14).translate(0,.05,-7),'#3d4248'],[new BoxGeometry(.2,7,14).translate(5.7,3.5,-7),'#30353b']])
  const lamp=new BoxGeometry(10,.15,.8).translate(0,6.9,-4)
  return {structure,glass,interior,lamp}
}

function Instances({geometry,material,items,matrix,castShadow=false,colors}:{geometry:BufferGeometry;material:Material;items:unknown[];matrix:(item:never,o:Object3D)=>void;castShadow?:boolean;colors?:(item:never,c:Color)=>void}){
  const mesh=useMemo(()=>{
    const m=new InstancedMesh(geometry,material,Math.max(1,items.length)),o=new Object3D(),c=new Color()
    items.forEach((item,i)=>{o.position.set(0,0,0);o.rotation.set(0,0,0);o.scale.set(1,1,1);matrix(item as never,o);o.updateMatrix();m.setMatrixAt(i,o.matrix);if(colors){colors(item as never,c);m.setColorAt(i,c)}})
    m.count=items.length;m.castShadow=castShadow;m.receiveShadow=true;m.computeBoundingSphere();return m
  },[geometry,material,items,matrix,castShadow,colors])
  useEffect(()=>()=>mesh.dispose(),[mesh])
  return <primitive object={mesh}/>
}

export function CircuitSurface({layout,venue,wet,length,halfWidth,gridCount}:{layout:CircuitLayout;venue:Venue;wet:number;length:number;halfWidth:number;gridCount:number}){
  const uniforms=useMemo<SurfaceUniforms>(()=>({uWet:{value:0}}),[])
  uniforms.uWet.value=wet
  const materials=useMemo(()=>{
    const hoarding=hoardingTexture().clone();hoarding.repeat.set(.2,1);hoarding.needsUpdate=true
    const concrete=concreteTexture()
    return {
      road:roadMaterial(halfWidth,length,layout.polesSide,gridCount,uniforms),
      pit:roadMaterial(5.6,1e9,0,0,uniforms,true),
      kerb:kerbMaterial(venue.kerb,uniforms),verge:vergeMaterial(venue,uniforms),
      terrain:new MeshStandardMaterial({map:venue.ground==='desert'?sandTexture():venue.ground==='urban'?concrete:grassTexture(),vertexColors:true,roughness:1,color:venue.ground==='urban'?'#9a9d97':'#ffffff'}),
      armco:new MeshStandardMaterial({map:armcoTexture(),metalness:.65,roughness:.38,side:DoubleSide}),
      tecpro:new MeshStandardMaterial({map:tecproTexture(),roughness:.7,side:DoubleSide}),
      wall:wallMaterial(hoarding),
      pitwall:wallMaterial(hoarding),
      fence:new MeshStandardMaterial({map:fenceTexture(),alphaTest:.45,side:DoubleSide,metalness:.6,roughness:.45}),
      hoarding,
    }
  },[halfWidth,length,layout.polesSide,gridCount,uniforms,venue])
  useEffect(()=>()=>{Object.values(materials).forEach(m=>(m as {dispose:()=>void}).dispose())},[materials])
  return <group>
    <mesh geometry={layout.terrain} material={materials.terrain} receiveShadow/>
    <mesh geometry={layout.verge} material={materials.verge} receiveShadow/>
    <mesh geometry={layout.road} material={materials.road} receiveShadow/>
    {layout.pitRoad&&<mesh geometry={layout.pitRoad} material={materials.pit} receiveShadow/>}
    <mesh geometry={layout.kerbs} material={materials.kerb} receiveShadow/>
    {(Object.entries(layout.barriers) as [keyof typeof materials,BufferGeometry][]).map(([kind,geometry])=><mesh key={kind} geometry={geometry} material={materials[kind] as Material} castShadow receiveShadow/>)}
    {layout.fence&&<mesh geometry={layout.fence} material={materials.fence}/>}
  </group>
}

const STATUS_COLOR:Record<TrackStatus,[number,number,number]>={green:[0,0,0],yellow:[3.2,2.1,0],sc:[3.2,2.1,0],vsc:[3.2,2.1,0],red:[3.6,.1,.08],chequered:[0,0,0]}

export function CircuitScenery({layout,venue,runtime,lapStart}:{layout:CircuitLayout;venue:Venue;runtime:{current:RaceRuntime};lapStart:number}){
  const night=venue.lighting!=='day'
  const assets=useMemo(()=>{
    const trees=treeGeometries(),stand=standGeometries(),garage=garageGeometries()
    const treeMaterial=new MeshStandardMaterial({vertexColors:true,roughness:.92,flatShading:true,side:DoubleSide})
    const structure=new MeshStandardMaterial({vertexColors:true,roughness:.7,metalness:.15})
    return {
      trees,stand,garage,treeMaterial,structure,
      crowd:new MeshStandardMaterial({map:crowdTexture(),roughness:.95}),
      roof:new MeshStandardMaterial({color:'#e8eaec',metalness:.5,roughness:.35}),
      glass:new MeshStandardMaterial({color:'#1d3346',metalness:.9,roughness:.08}),
      lamp:new MeshBasicMaterial({color:new Color(3.2,3,2.6),toneMapped:false}),
      facade:facadeMaterial(night),
      pole:new MeshStandardMaterial({color:'#5f676d',metalness:.7,roughness:.4}),
      head:new MeshBasicMaterial({color:night?new Color(6,6,5.5):new Color('#c9d2d8'),toneMapped:false}),
      panel:new MeshBasicMaterial({color:'#ffffff',toneMapped:false}),
      box:new BoxGeometry(1,1,1).translate(0,.5,0),poleGeometry:new CylinderGeometry(.18,.28,24,6).translate(0,12,0),headGeometry:new BoxGeometry(3.4,1.2,.5).translate(0,24,0),
      panelGeometry:mergeGeometries([new BoxGeometry(1.4,.9,.12).translate(0,2.6,0)],false)!,postGeometry:new CylinderGeometry(.06,.06,2.2,5).translate(0,1.1,0),
    }
  },[night])
  useEffect(()=>()=>{for(const v of Object.values(assets)){if(Array.isArray(v))v.forEach(g=>g.dispose());else if(v&&typeof v==='object'&&'dispose' in v)(v as {dispose:()=>void}).dispose();else if(v&&typeof v==='object')Object.values(v).forEach(g=>(g as BufferGeometry).dispose?.())}},[assets])
  const byKind=useMemo(()=>[0,1,2].map(k=>layout.trees.filter(t=>t.kind===k)),[layout])
  const treeMatrix=useMemo(()=>(t:{x:number;y:number;z:number;scale:number;tint:number},o:Object3D)=>{o.position.set(t.x,t.y-.2,t.z);o.rotation.y=t.tint*20;o.scale.setScalar(t.scale)},[])
  const treeColor=useMemo(()=>(t:{tint:number},c:Color)=>{c.setHSL(.27+(t.tint-.5)*.08,.25+t.tint*.25,.38+t.tint*.25);c.multiplyScalar(2.1)},[])
  const placed=useMemo(()=>(p:Placement,o:Object3D)=>{o.position.set(p.x,p.y,p.z);o.rotation.y=p.yaw},[])
  const standMatrix=useMemo(()=>(b:{x:number;y:number;z:number;yaw:number;h:number},o:Object3D)=>{o.position.set(b.x,b.y,b.z);o.rotation.y=b.yaw;o.scale.set(1,b.h/11,1)},[])
  const buildingMatrix=useMemo(()=>(b:{x:number;y:number;z:number;yaw:number;w:number;d:number;h:number},o:Object3D)=>{o.position.set(b.x,b.y,b.z);o.rotation.y=b.yaw;o.scale.set(b.w,b.h,b.d)},[])
  const buildingColor=useMemo(()=>{
    // Broad regional palettes: Mediterranean pastels, glass towers, warm desert stone.
    const palette=venue.cityHeight[1]>120?['#a9c4d8','#8fa9bf','#c9d3db','#7f97ab','#b8c6cf']:venue.ground==='desert'?['#d8c4a4','#cdb48e','#e3d5bb','#bfa57f']:venue.cityHeight[1]<50&&venue.hills>20?['#f1d9b5','#e8c39e','#f3e6cf','#e6b98f','#d9a98a','#f4efe2']:['#c9c6bf','#b7b2a8','#d6d1c6','#a9b0b4','#c2b6a6']
    return (b:{x:number;z:number},c:Color)=>{const k=Math.abs(Math.floor(b.x*7.31+b.z*3.17))%palette.length;c.set(palette[k]).multiplyScalar(1.15)}
  },[venue])
  const lights=useMemo(()=>night?layout.lights:[],[layout,night])
  const panels=useRef<InstancedMesh>(null)

  // Gantry with five pairs of start lights.
  const gantry=layout.gantry
  const lampMaterials=useMemo(()=>Array.from({length:5},()=>new MeshBasicMaterial({color:'#2a0606',toneMapped:false})),[])
  useEffect(()=>()=>lampMaterials.forEach(m=>m.dispose()),[lampMaterials])
  useFrame(()=>{
    const time=runtime.current.time,status=runtime.current.status
    // Lights come on one pair per second and all go out together at the recorded lap-one start.
    const lit=time>=lapStart-5&&time<lapStart?Math.min(5,Math.floor(time-(lapStart-5))+1):0
    lampMaterials.forEach((m,i)=>m.color.setRGB(i<lit?7:.16,i<lit?.08:.02,i<lit?.06:.02))
    if(panels.current){
      const [r,g,b]=STATUS_COLOR[status],flash=status==='yellow'||status==='sc'||status==='vsc'?(Math.sin(performance.now()/180)>0?1:.12):1
      const color=new Color(r*flash,g*flash,b*flash);if(status==='green'||status==='chequered')color.setRGB(.03,.12,.05)
      for(let i=0;i<panels.current.count;i++)panels.current.setColorAt(i,color)
      if(panels.current.instanceColor)panels.current.instanceColor.needsUpdate=true
    }
  })
  const hoarding=useMemo(()=>new MeshStandardMaterial({map:hoardingTexture(),roughness:.55}),[])
  useEffect(()=>()=>hoarding.dispose(),[hoarding])
  const darkMetal=useMemo(()=>new MeshStandardMaterial({color:'#2b3035',metalness:.7,roughness:.4}),[])
  useEffect(()=>()=>darkMetal.dispose(),[darkMetal])

  return <group>
    {byKind.map((items,k)=>items.length>0&&<Instances key={k} geometry={assets.trees[k]} material={assets.treeMaterial} items={items} matrix={treeMatrix} colors={treeColor} />)}
    {layout.grandstands.length>0&&<>
      <Instances geometry={assets.stand.slope} material={assets.crowd} items={layout.grandstands} matrix={standMatrix}/>
      <Instances geometry={assets.stand.structure} material={assets.structure} items={layout.grandstands} matrix={standMatrix} castShadow/>
      <Instances geometry={assets.stand.roof} material={assets.roof} items={layout.grandstands} matrix={standMatrix} castShadow/>
    </>}
    {layout.garages.length>0&&<>
      <Instances geometry={assets.garage.structure} material={assets.structure} items={layout.garages} matrix={placed} castShadow/>
      <Instances geometry={assets.garage.glass} material={assets.glass} items={layout.garages} matrix={placed}/>
      <Instances geometry={assets.garage.interior} material={assets.structure} items={layout.garages} matrix={placed}/>
      <Instances geometry={assets.garage.lamp} material={assets.lamp} items={layout.garages} matrix={placed}/>
    </>}
    {layout.buildings.length>0&&<Instances geometry={assets.box} material={assets.facade} items={layout.buildings} matrix={buildingMatrix} colors={buildingColor}/>}
    {lights.length>0&&<>
      <Instances geometry={assets.poleGeometry} material={assets.pole} items={lights} matrix={placed}/>
      <Instances geometry={assets.headGeometry} material={assets.head} items={lights} matrix={placed}/>
    </>}
    {layout.marshals.length>0&&<>
      <Instances geometry={assets.postGeometry} material={assets.pole} items={layout.marshals} matrix={placed}/>
      <MarshalPanels refObject={panels} geometry={assets.panelGeometry} material={assets.panel} items={layout.marshals}/>
    </>}
    <group position={[gantry.x,gantry.y,gantry.z]} rotation={[0,gantry.yaw,0]}>
      {[-1,1].map(side=><mesh key={side} position={[side*gantry.span/2,3.6,0]} castShadow material={darkMetal}><boxGeometry args={[.7,7.2,.7]}/></mesh>)}
      <mesh position={[0,6.9,0]} castShadow material={darkMetal}><boxGeometry args={[gantry.span+.7,.9,1.1]}/></mesh>
      <mesh position={[0,6.9,.56]} material={hoarding}><planeGeometry args={[gantry.span,.8]}/></mesh>
      <mesh position={[0,6.9,-.56]} rotation={[0,Math.PI,0]} material={hoarding}><planeGeometry args={[gantry.span,.8]}/></mesh>
      <mesh position={[0,5.9,-.62]} material={darkMetal}><boxGeometry args={[3.2,1.1,.12]}/></mesh>
      {Array.from({length:5},(_,i)=>[0,1].map(row=><mesh key={`${i}-${row}`} position={[(i-2)*.62,6.18-row*.46,-.7]} material={lampMaterials[i]}><sphereGeometry args={[.17,12,8]}/></mesh>))}
    </group>
    {layout.bridges.map((b,i)=><group key={i} position={[b.x,b.y,b.z]} rotation={[0,b.yaw,0]}>
      {[-1,1].map(side=><mesh key={side} position={[side*b.span/2,4,0]} castShadow material={darkMetal}><boxGeometry args={[.9,8,.9]}/></mesh>)}
      <mesh position={[0,8.2,0]} castShadow material={darkMetal}><boxGeometry args={[b.span+1,1.6,1.4]}/></mesh>
      <mesh position={[0,8.2,.71]} material={hoarding}><planeGeometry args={[b.span,1.5]}/></mesh>
      <mesh position={[0,8.2,-.71]} rotation={[0,Math.PI,0]} material={hoarding}><planeGeometry args={[b.span,1.5]}/></mesh>
    </group>)}
  </group>
}
function MarshalPanels({refObject,geometry,material,items}:{refObject:React.RefObject<InstancedMesh|null>;geometry:BufferGeometry;material:Material;items:Placement[]}){
  const mesh=useMemo(()=>{const m=new InstancedMesh(geometry,material,items.length),o=new Object3D();items.forEach((p,i)=>{o.position.set(p.x,p.y,p.z);o.rotation.set(0,p.yaw,0);o.updateMatrix();m.setMatrixAt(i,o.matrix);m.setColorAt(i,new Color('#0a1a0d'))});return m},[geometry,material,items])
  useEffect(()=>{(refObject as {current:InstancedMesh|null}).current=mesh;return()=>{mesh.dispose()}},[mesh,refObject])
  return <primitive object={mesh}/>
}

/** Distant terrain silhouettes beyond the modelled area, softened by fog. */
export function Horizon({venue,radius,baseY}:{venue:Venue;radius:number;baseY:number}){
  const geometry=useMemo(()=>{
    const segments=180,p:number[]=[],idx:number[]=[],amp=venue.ground==='urban'?0:Math.max(12,venue.hills*1.6)
    for(let i=0;i<=segments;i++){
      const a=i/segments*Math.PI*2,h=amp*(.45+.35*Math.sin(a*3.1+1)+.2*Math.sin(a*7.7+2)+.12*Math.sin(a*17.3))
      for(const [r,y] of [[radius,baseY-40],[radius,baseY+Math.max(4,h)]])p.push(Math.cos(a)*r,y,Math.sin(a)*r)
      if(i<segments){const k=i*2;idx.push(k,k+1,k+2,k+1,k+3,k+2)}
    }
    const g=new BufferGeometry();g.setAttribute('position',new Float32BufferAttribute(p,3));g.setIndex(idx);g.computeVertexNormals();return g
  },[venue,radius,baseY])
  useEffect(()=>()=>geometry.dispose(),[geometry])
  const color=venue.ground==='desert'?'#9c8668':venue.lighting==='night'?'#0c1118':'#4f6553'
  return <mesh geometry={geometry}><meshStandardMaterial color={color} roughness={1} side={DoubleSide}/></mesh>
}
export function GroundPlane({venue,y}:{venue:Venue;y:number}){
  const map=useMemo(()=>{const t=(venue.ground==='desert'?sandTexture():venue.ground==='urban'?concreteTexture():grassTexture()).clone();t.repeat.set(900,900);t.needsUpdate=true;return t as Texture},[venue])
  useEffect(()=>()=>map.dispose(),[map])
  return <mesh rotation={[-Math.PI/2,0,0]} position={[0,y,0]} receiveShadow><circleGeometry args={[30000,48]}/><meshStandardMaterial map={map} color={venue.ground==='urban'?'#8d918b':'#d9dccf'} roughness={1}/></mesh>
}
