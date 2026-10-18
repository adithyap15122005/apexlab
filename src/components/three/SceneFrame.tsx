import { Component, Suspense, useEffect, useRef, useState, type ReactNode } from 'react'
import { Canvas, useThree } from '@react-three/fiber'
import { Environment, Lightformer, OrbitControls } from '@react-three/drei'
import { Vector3 } from 'three'
import { Box, Expand, Minus, Pause, Play, Plus, RotateCcw, RotateCw, View } from 'lucide-react'
import './Three.css'

export type SceneState = { active: boolean; motion: boolean; resetKey: number }
type SceneFrameProps = {
  label: string; className?: string; fallback: ReactNode;
  camera?: [number, number, number]; target?: [number, number, number];
  animated?: boolean; children: (state: SceneState) => ReactNode;
  onPresentationChange?: (state:{is3D:boolean;motion:boolean})=>void;
  motionControl?:boolean;
  interactive?:boolean;
}
class SceneBoundary extends Component<{children:ReactNode;fallback:ReactNode;onError:()=>void},{failed:boolean}>{
  state={failed:false}
  static getDerivedStateFromError(){return {failed:true}}
  componentDidCatch(){this.props.onError()}
  render(){return this.state.failed?this.props.fallback:this.props.children}
}
function FrameClock({running}:{running:boolean}){
  const invalidate=useThree(s=>s.invalidate)
  useEffect(()=>{invalidate();if(!running)return;const id=setInterval(invalidate,1000/30);return()=>clearInterval(id)},[running,invalidate])
  return null
}
function ContextMonitor({onLost}:{onLost:()=>void}){
  const gl=useThree(s=>s.gl)
  useEffect(()=>{const canvas=gl.domElement;canvas.addEventListener('webglcontextlost',onLost);return()=>canvas.removeEventListener('webglcontextlost',onLost)},[gl,onLost])
  return null
}
function CameraBridge({rotation,zoom,target}:{rotation:number;zoom:number;target:[number,number,number]}){
  const {camera,invalidate}=useThree()
  const previous=useRef({rotation:0,zoom:0})
  useEffect(()=>{
    const center=new Vector3(...target)
    const offset=camera.position.clone().sub(center)
    offset.applyAxisAngle(new Vector3(0,1,0),rotation-previous.current.rotation)
    offset.multiplyScalar(Math.pow(.84,zoom-previous.current.zoom))
    if(offset.length()>3.5&&offset.length()<30)camera.position.copy(center.add(offset))
    camera.lookAt(...target);camera.updateProjectionMatrix();invalidate()
    previous.current={rotation,zoom}
  },[rotation,zoom,camera,invalidate,target])
  return null
}
export default function SceneFrame({label,className='',fallback,camera=[8,4.3,7],target=[0,.4,0],animated=true,children,onPresentationChange,motionControl=true,interactive=true}:SceneFrameProps){
  const container=useRef<HTMLDivElement>(null)
  const [visible,setVisible]=useState(false)
  const [mounted,setMounted]=useState(false)
  const [documentVisible,setDocumentVisible]=useState(!document.hidden)
  const [enabled,setEnabled]=useState(()=>{try{return localStorage.getItem('apexlab-3d')!=='off'}catch{return true}})
  const [supported,setSupported]=useState(true)
  const [paused,setPaused]=useState(false)
  const [lowMotion,setLowMotion]=useState(()=>window.matchMedia('(prefers-reduced-motion:reduce)').matches||document.documentElement.dataset.motion==='reduced')
  const [resetKey,setResetKey]=useState(0)
  const [rotation,setRotation]=useState(0)
  const [zoom,setZoom]=useState(0)
  const active=visible&&documentVisible&&enabled
  const motion=!lowMotion&&!paused
  useEffect(()=>{if(visible)setMounted(true)},[visible])
  useEffect(()=>{
    const node=container.current;if(!node)return
    const observer=new IntersectionObserver(entries=>setVisible(entries[0].isIntersecting),{rootMargin:'100px'})
    observer.observe(node)
    const visibility=()=>setDocumentVisible(!document.hidden)
    document.addEventListener('visibilitychange',visibility)
    const media=window.matchMedia('(prefers-reduced-motion:reduce)')
    const update=()=>setLowMotion(media.matches||document.documentElement.dataset.motion==='reduced')
    media.addEventListener('change',update)
    const attributes=new MutationObserver(update);attributes.observe(document.documentElement,{attributes:true,attributeFilter:['data-motion']})
    return()=>{observer.disconnect();attributes.disconnect();media.removeEventListener('change',update);document.removeEventListener('visibilitychange',visibility)}
  },[])
  useEffect(()=>{try{localStorage.setItem('apexlab-3d',enabled?'on':'off')}catch{/* Optional preference. */}},[enabled])
  const reset=()=>{setRotation(0);setZoom(0);setResetKey(k=>k+1)}
  const show3d=enabled&&supported
  useEffect(()=>{onPresentationChange?.({is3D:show3d,motion})},[show3d,motion,onPresentationChange])
  return <div ref={container} className={`scene-frame ${className} ${show3d?'is-3d':'is-2d'}`} aria-label={label}>
    <div className="scene-toolbar"><span className="scene-label mono"><span className="tiny-dot"/>{show3d?'LIVE 3D STUDIO':'ANALYTICAL 2D'}</span><div className="scene-mode-switch" role="group" aria-label={`${label} display mode`}><button aria-pressed={show3d} disabled={!supported} onClick={()=>setEnabled(true)}><Box size={12}/>3D</button><button aria-pressed={!show3d} onClick={()=>setEnabled(false)}><View size={12}/>2D</button></div></div>
    <div className="scene-viewport" role="img" aria-label={`${label}. ${show3d?'Drag to orbit, pinch to zoom. Equivalent controls below.':'Two-dimensional alternative.'}`}>
      {show3d&&mounted?<SceneBoundary fallback={fallback} onError={()=>setSupported(false)}><Suspense fallback={<div className="scene-loading"><span className="scene-loading-orbit"/><span className="mono">COMPOSING THE STUDIO</span></div>}><Canvas key={resetKey} camera={{position:camera,fov:37,near:.1,far:150}} dpr={[1,1.5]} frameloop="demand" gl={{antialias:true,alpha:true,powerPreference:'low-power'}} fallback={fallback} onCreated={({gl})=>{gl.domElement.setAttribute('aria-label',label)}}>
        <ContextMonitor onLost={()=>setSupported(false)}/><ambientLight intensity={.65}/><hemisphereLight args={['#e9f1ff','#111810',1.2]}/><directionalLight position={[4,8,5]} intensity={3.2} color="#f1f4ff"/><directionalLight position={[-5,4,-4]} intensity={2} color="#d7ff99"/>
        <Environment resolution={128} frames={1}><Lightformer intensity={3} position={[0,6,0]} scale={[10,4,1]} rotation-x={Math.PI/2}/><Lightformer intensity={2} position={[-5,2,2]} scale={[3,6,1]} rotation-y={Math.PI/2}/><Lightformer intensity={1} color="#d7ff87" position={[4,1,-4]} scale={[6,2,1]}/></Environment>
        {children({active,motion,resetKey})}<OrbitControls makeDefault enabled={interactive} target={target} enablePan={false} enableDamping={false} minDistance={3.5} maxDistance={30} minPolarAngle={.15} maxPolarAngle={1.48} rotateSpeed={.65} zoomSpeed={.6}/><CameraBridge rotation={rotation} zoom={zoom} target={target}/><FrameClock running={active&&motion&&animated}/>
      </Canvas></Suspense></SceneBoundary>:fallback}
    </div>
    <div className="scene-controls"><span className="scene-instruction">{!supported?'3D unavailable · all tools work in 2D':show3d?(interactive?'DRAG TO ORBIT · PINCH TO ZOOM':'CINEMATIC CAMERA · SKIP TO EXPLORE'):'ALL DATA & CONTROLS AVAILABLE'}</span>{show3d&&<div><button disabled={!interactive} onClick={()=>setRotation(r=>r-.3)} aria-label={`${label}: rotate left`}><RotateCcw size={13}/></button><button disabled={!interactive} onClick={()=>setRotation(r=>r+.3)} aria-label={`${label}: rotate right`}><RotateCw size={13}/></button><button disabled={!interactive} onClick={()=>setZoom(z=>z+1)} aria-label={`${label}: zoom in`}><Plus size={14}/></button><button disabled={!interactive} onClick={()=>setZoom(z=>z-1)} aria-label={`${label}: zoom out`}><Minus size={14}/></button>{animated&&motionControl&&<button onClick={()=>setPaused(!paused)} aria-pressed={paused} aria-label={paused?'Resume scene motion':'Pause scene motion'}>{paused?<Play size={12}/>:<Pause size={12}/>}</button>}<button disabled={!interactive} onClick={reset} aria-label={`${label}: reset view`}><Expand size={13}/></button></div>}</div>
  </div>
}
