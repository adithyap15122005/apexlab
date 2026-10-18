import { DoubleSide, MeshBasicMaterial, MeshPhysicalMaterial, MeshStandardMaterial, type Material } from 'three'
import { carbonTexture, wheelFaceTextures } from './textures'

type Shader={vertexShader:string;fragmentShader:string}
const BAYER=`
float apexBayer(vec2 p){
  ivec2 i=ivec2(mod(p,4.0));
  float m[16]=float[16](0.,8.,2.,10.,12.,4.,14.,6.,3.,11.,1.,9.,15.,7.,13.,5.);
  return (m[i.x+i.y*4]+.5)/16.;
}`

/**
 * Adds an instanced `fade` attribute rendered as screen-door (dithered) transparency.
 * Dithering needs no depth sorting, so faded instanced cars stay stable in motion.
 */
function withFade<T extends Material>(material:T,key:string,extra?:(shader:Shader)=>void):T{
  material.onBeforeCompile=shader=>{
    shader.vertexShader='attribute float fade;\nvarying float vFade;\n'+shader.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\nvFade=fade;')
    shader.fragmentShader='varying float vFade;\n'+BAYER+'\n'+shader.fragmentShader.replace('void main() {','void main() {\n  if(vFade<.999&&vFade<=apexBayer(gl_FragCoord.xy))discard;')
    extra?.(shader)
  }
  material.customProgramCacheKey=()=>`apex-car-${key}`
  return material
}

/** Livery: three per-instance team colours painted procedurally in car space. */
function liveryShader(shader:Shader){
  shader.vertexShader='attribute vec3 liveryA;\nattribute vec3 liveryB;\nattribute vec3 liveryC;\nvarying vec3 vLivA;\nvarying vec3 vLivB;\nvarying vec3 vLivC;\nvarying vec3 vCarPos;\n'+shader.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\nvLivA=liveryA;vLivB=liveryB;vLivC=liveryC;vCarPos=position;')
  shader.fragmentShader='varying vec3 vLivA;\nvarying vec3 vLivB;\nvarying vec3 vLivC;\nvarying vec3 vCarPos;\n'+shader.fragmentShader.replace('#include <color_fragment>',`#include <color_fragment>
  {
    vec3 p=vCarPos;
    // A sweeping two-tone split that rises towards the nose, with a fine pinstripe.
    float line=.31+.12*smoothstep(-1.4,2.7,p.z)+.05*smoothstep(-.4,-2.,p.z);
    float lower=1.-smoothstep(line-.005,line+.005,p.y);
    float stripe=1.-smoothstep(.004,.008,abs(p.y-line-.03));
    float plates=clamp(step(.94,abs(p.x))*step(2.,p.z)+step(.45,abs(p.x))*step(p.z,-2.05),0.,1.);
    float spine=(1.-smoothstep(.016,.024,abs(p.x)))*step(.72,p.y)*step(p.z,-.3);
    float tip=smoothstep(2.76,2.8,p.z);
    vec3 col=mix(vLivA,vLivB,lower);
    col=mix(col,vLivB,plates);
    col=mix(col,vLivC,clamp(stripe*(1.-plates)+spine+tip,0.,1.));
    diffuseColor.rgb=col;
  }`)
}

/** Wheel face: rotational motion blur along the polar texture plus a compound-colour mask. */
function wheelShader(shader:Shader){
  shader.vertexShader='attribute float blur;\nvarying float vBlur;\n'+shader.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\nvBlur=blur;')
  shader.fragmentShader='varying float vBlur;\n'+shader.fragmentShader
    .replace('#include <map_fragment>',`#ifdef USE_MAP
    vec4 texel=vec4(0.);
    for(int i=0;i<9;i++){float o=(float(i)/8.-.5)*vBlur;texel+=texture2D(map,vec2(vMapUv.x+o,vMapUv.y));}
    texel/=9.;
    diffuseColor.rgb*=mix(texel.rgb,texel.rgb*vColor.rgb,texel.a);
  #endif`)
    .replace('#include <color_fragment>','')
    .replace('#include <roughnessmap_fragment>','float roughnessFactor=vMapUv.y<.655?.32:.86;')
    .replace('#include <metalnessmap_fragment>','float metalnessFactor=vMapUv.y<.655?.7:0.;')
}

export type CarMaterials=ReturnType<typeof createCarMaterials>
export function createCarMaterials(){
  const carbon=carbonTexture()
  const materials={
    paint:withFade(new MeshPhysicalMaterial({color:'#ffffff',roughness:.5,metalness:.06,clearcoat:.35,clearcoatRoughness:.2,envMapIntensity:.5,side:DoubleSide}),'paint',liveryShader),
    carbon:withFade(new MeshPhysicalMaterial({color:'#9aa3aa',map:carbon,roughness:.42,metalness:.25,clearcoat:.5,clearcoatRoughness:.25,envMapIntensity:.6}),'carbon'),
    dark:withFade(new MeshStandardMaterial({color:'#060708',roughness:.85,side:DoubleSide}),'dark'),
    metal:withFade(new MeshStandardMaterial({color:'#a7afb5',metalness:1,roughness:.2}),'metal'),
    helmet:withFade(new MeshPhysicalMaterial({color:'#ffffff',roughness:.25,metalness:.1,clearcoat:1,clearcoatRoughness:.04}),'helmet'),
    visor:withFade(new MeshPhysicalMaterial({color:'#0d1218',roughness:.05,metalness:.9,clearcoat:1,iridescence:.6,iridescenceIOR:1.6}),'visor'),
    tcam:withFade(new MeshStandardMaterial({color:'#ffffff',roughness:.45,metalness:.2}),'tcam'),
    light:withFade(new MeshBasicMaterial({color:'#ffffff',toneMapped:false}),'light'),
    tyre:withFade(new MeshStandardMaterial({color:'#1a1b1c',roughness:.9,metalness:0}),'tyre'),
    wheelFace:withFade(new MeshStandardMaterial({color:'#ffffff',map:wheelFaceTextures(),roughness:.6,metalness:.3}),'wheel',wheelShader),
  }
  return {...materials,dispose:()=>Object.values(materials).forEach(m=>m.dispose())}
}
