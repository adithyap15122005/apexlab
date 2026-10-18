import { forwardRef, useMemo } from 'react'
import { useFrame } from '@react-three/fiber'
import { Bloom, EffectComposer, SMAA, ToneMapping, Vignette } from '@react-three/postprocessing'
import { BlendFunction, Effect, EffectAttribute, ToneMappingMode } from 'postprocessing'
import { Uniform, Vector2 } from 'three'
import type { CameraFx } from './CameraRig'
import type { SceneQuality } from './Atmosphere'

const SPEED_BLUR=`
uniform float strength;
uniform vec2 center;
void mainImage(const in vec4 inputColor,const in vec2 uv,out vec4 outputColor){
  if(strength<.001){outputColor=inputColor;return;}
  vec2 dir=uv-center;
  float amount=strength*smoothstep(.28,.85,length(dir))*.032;
  vec4 sum=inputColor;
  for(int i=1;i<9;i++){sum+=texture2D(inputBuffer,uv-dir*amount*float(i)/8.);}
  outputColor=sum/9.;
}`
/** Radial motion blur that streaks the periphery at speed, keeping the centre sharp. */
class SpeedBlurEffect extends Effect{
  constructor(){
    super('SpeedBlurEffect',SPEED_BLUR,{blendFunction:BlendFunction.NORMAL,attributes:EffectAttribute.CONVOLUTION,uniforms:new Map<string,Uniform>([['strength',new Uniform(0)],['center',new Uniform(new Vector2(.5,.55))]])})
  }
}
const SpeedBlur=forwardRef<SpeedBlurEffect,{fx:{current:CameraFx}}>(function SpeedBlur({fx},ref){
  const effect=useMemo(()=>new SpeedBlurEffect(),[])
  useFrame((_,delta)=>{
    const strength=effect.uniforms.get('strength')!,center=effect.uniforms.get('center')!
    strength.value+=(fx.current.speedBlur-strength.value)*(1-Math.exp(-Math.min(delta,.1)*6))
    ;(center.value as Vector2).set(...fx.current.center)
  })
  return <primitive ref={ref} object={effect} dispose={null}/>
})

export default function Effects({quality,fx,night}:{quality:SceneQuality;fx:{current:CameraFx};night:boolean}){
  if(!quality.post)return null
  return <EffectComposer multisampling={quality.msaa} enableNormalPass={false}>
    {quality.speedBlur?<SpeedBlur fx={fx}/>:<></>}
    {quality.bloom?<Bloom mipmapBlur intensity={night?.85:.3} luminanceThreshold={night?.8:1.25} luminanceSmoothing={.2} radius={.7}/>:<></>}
    <ToneMapping mode={ToneMappingMode.ACES_FILMIC}/>
    <Vignette offset={.3} darkness={.5}/>
    {quality.msaa===0?<SMAA/>:<></>}
  </EffectComposer>
}
