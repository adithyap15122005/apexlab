import { useEffect, useRef, useState, type ReactNode } from 'react'
import { STADIUM, stadiumPath, stadiumPoint, TYRES, type Tyre } from '../../school/schoolModel'

/** A Pirelli-style tyre roundel: coloured ring, compound letter. */
export function TyreBadge({tyre,size=44,worn=0}:{tyre:Tyre;size?:number;worn?:number}){
  const t=TYRES[tyre]
  return <svg className="sc-tyre" width={size} height={size} viewBox="0 0 48 48" role="img" aria-label={`${t.name} tyre`}>
    <circle cx="24" cy="24" r="22" fill="#15181b"/>
    <circle cx="24" cy="24" r="17" fill="none" stroke={t.color} strokeWidth="4" strokeDasharray={worn>0?`${(1-worn)*107} 107`:undefined} transform="rotate(-90 24 24)"/>
    {(tyre==='inter'||tyre==='wet')&&Array.from({length:8},(_,i)=><line key={i} x1="24" y1="4" x2="24" y2={tyre==='wet'?10:8} stroke="#3a4046" strokeWidth="2" transform={`rotate(${i*45} 24 24)`}/>)}
    <circle cx="24" cy="24" r="11" fill="#2a2f34"/>
    <text x="24" y="28.5" textAnchor="middle" fontSize="13" fontWeight="800" fill={t.color} fontFamily="Inter, sans-serif">{t.letter}</text>
  </svg>
}

/** Top-down cartoon Formula car, nose pointing +x. */
export function CarSprite({x,y,angle,color,label,scale=1,glow=false,pit=false}:{x:number;y:number;angle:number;color:string;label?:string;scale?:number;glow?:boolean;pit?:boolean}){
  return <g transform={`translate(${x} ${y}) rotate(${angle*180/Math.PI}) scale(${scale})`}>
    {glow&&<ellipse rx="22" ry="12" fill={color} opacity=".25"/>}
    <rect x="-16" y="-9" width="6" height="18" rx="1.5" fill="#1a1d20"/>
    <rect x="-14" y="-12" width="7" height="5" rx="1.5" fill="#0d0f11"/><rect x="-14" y="7" width="7" height="5" rx="1.5" fill="#0d0f11"/>
    <rect x="8" y="-11" width="6" height="4.5" rx="1.5" fill="#0d0f11"/><rect x="8" y="6.5" width="6" height="4.5" rx="1.5" fill="#0d0f11"/>
    <path d="M-12 -5 L10 -3 L18 -1 L18 1 L10 3 L-12 5 Z" fill={color}/>
    <rect x="-8" y="-6.5" width="10" height="13" rx="3" fill={color}/>
    <circle cx="-1" cy="0" r="2.4" fill="#f5f5f0" stroke="#111" strokeWidth=".8"/>
    <rect x="17" y="-10" width="3" height="20" rx="1" fill="#1a1d20"/>
    {pit&&<text y="-15" textAnchor="middle" fontSize="8" fontWeight="800" fill="#5ec8f2" transform={`rotate(${-angle*180/Math.PI})`}>PIT</text>}
    {label&&<g transform={`rotate(${-angle*180/Math.PI})`}><rect x="-14" y="13" width="28" height="11" rx="3" fill="#0b1418e6"/><text y="21.5" textAnchor="middle" fontSize="8" fontWeight="700" fill="#fff" fontFamily="Inter, sans-serif">{label}</text></g>}
  </g>
}

/** The stadium track used by every lesson animation, with kerbs, start line and pit lane. */
export function StadiumTrack({children,pitLane=true,wet=0,label}:{children?:ReactNode;pitLane?:boolean;wet?:number;label?:string}){
  const {cx,cy,straight,radius}=STADIUM
  return <svg className="sc-track" viewBox="0 0 620 320" role="img" aria-label={label??'Race track'}>
    <rect width="620" height="320" rx="18" fill="#1d3a26"/>
    <path d={stadiumPath(0)} fill="none" stroke="#e9e9e2" strokeWidth="46" strokeDasharray="10 10" opacity=".9"/>
    <path d={stadiumPath(0)} fill="none" stroke="#3a3f44" strokeWidth="40"/>
    <path d={stadiumPath(0)} fill="none" stroke="#2f3438" strokeWidth="14" opacity=".55"/>
    {wet>0&&<path d={stadiumPath(0)} fill="none" stroke="#7fb6ff" strokeWidth="40" opacity={wet*.35}/>}
    {pitLane&&<><path d={`M${cx+straight/2-10} ${cy+radius-22} H${cx-straight/2+10}`} stroke="#4a5056" strokeWidth="14" strokeLinecap="round"/><text x={cx} y={cy+radius-34} textAnchor="middle" fontSize="10" fontWeight="700" fill="#9fb3a9" letterSpacing="2">PIT LANE</text>
      {Array.from({length:6},(_,i)=><rect key={i} x={cx-120+i*44} y={cy+radius-62} width="30" height="12" rx="2" fill="#2c3237"/>)}</>}
    <rect x={cx-2} y={cy+radius-21} width="5" height="42" fill="url(#sc-chequer)"/>
    <defs><pattern id="sc-chequer" width="5" height="6" patternUnits="userSpaceOnUse"><rect width="5" height="6" fill="#fff"/><rect width="2.5" height="3" fill="#111"/><rect x="2.5" y="3" width="2.5" height="3" fill="#111"/></pattern></defs>
    {children}
  </svg>
}
export const trackPoint=(fraction:number,lane=0)=>stadiumPoint(fraction,lane)

/** Cartoon pit crew member seen from above: helmet, shoulders, team colour. */
export function CrewMember({x,y,color,angle=0}:{x:number;y:number;color:string;angle?:number}){
  return <g transform={`translate(${x} ${y}) rotate(${angle})`}><ellipse rx="7" ry="5" fill={color}/><circle r="3.6" fill="#f2f2ee" stroke="#111" strokeWidth=".8"/></g>
}

export function GripBar({value,color,label}:{value:number;color:string;label?:string}){
  return <div className="sc-grip" aria-label={`${label??'Grip'} ${value}%`}><span style={{width:`${Math.max(0,Math.min(100,value))}%`,background:value<20?'#ff453a':color}}/>{label&&<small>{label}</small>}</div>
}

/** requestAnimationFrame clock in seconds; restarts when `key` changes. Respects reduced motion. */
export function useClock(playing:boolean,speed=1,key:unknown=0){
  const [elapsed,setElapsed]=useState(0),last=useRef<number|null>(null)
  useEffect(()=>{setElapsed(0);last.current=null},[key])
  useEffect(()=>{
    if(!playing){last.current=null;return}
    let frame=0
    const tick=(now:number)=>{if(last.current!=null)setElapsed(e=>e+(now-last.current!)/1000*speed);last.current=now;frame=requestAnimationFrame(tick)}
    frame=requestAnimationFrame(tick)
    return()=>cancelAnimationFrame(frame)
  },[playing,speed])
  return [elapsed,setElapsed] as const
}
export const reducedMotion=()=>typeof window!=='undefined'&&(window.matchMedia('(prefers-reduced-motion:reduce)').matches||document.documentElement.dataset.motion==='reduced')
