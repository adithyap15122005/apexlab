import { useEffect, useMemo, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { GraduationCap, X } from 'lucide-react'
import { getDriverState, getStandings, sampleTelemetry } from '../../history/replay'
import type { HistoricalDriver, HistoricalRace, TelemetrySample } from '../../history/types'
import { trackStatus } from '../race3d/raceRuntime'
import { coachMessage, raceStoryEvents, type StoryEvent } from '../../history/strategyStory'
import { featuredPitStop, planPitStops } from '../../history/pitStops'
import PitStopGraphics from './PitStopGraphics'
import './BroadcastOverlay.css'

const colourOf=(driver:HistoricalDriver)=>/^#?[0-9a-f]{6}$/i.test(driver.color)?`#${driver.color.replace('#','')}`:'#c8d9ba'

/** Broadcast-style opening title with the circuit drawn on. */
function RaceIntro({race,onDone}:{race:HistoricalRace;onDone:()=>void}){
  const path=useMemo(()=>{
    const p=race.track.points,minX=Math.min(...p.map(q=>q[0])),maxX=Math.max(...p.map(q=>q[0])),minY=Math.min(...p.map(q=>q[1])),maxY=Math.max(...p.map(q=>q[1])),scale=180/Math.max(maxX-minX,maxY-minY,1)
    return p.map(([x,y],i)=>`${i?'L':'M'}${((x-minX)*scale+10).toFixed(1)} ${((maxY-y)*scale+10).toFixed(1)}`).join(' ')+'Z'
  },[race])
  // The parent re-renders with every clock tick; keep one timer for the whole intro.
  const done=useRef(onDone);done.current=onDone
  useEffect(()=>{const id=setTimeout(()=>done.current(),4200);return()=>clearTimeout(id)},[])
  return <motion.button className="bo-intro" onClick={onDone} aria-label="Close race introduction" initial={{opacity:0}} animate={{opacity:1}} exit={{opacity:0,transition:{duration:.5}}}>
    <motion.div className="bo-intro-card" initial={{y:24,opacity:0}} animate={{y:0,opacity:1}} transition={{delay:.15,duration:.6,ease:[.2,.8,.2,1]}}>
      <svg viewBox="0 0 200 200" aria-hidden="true"><motion.path d={path} fill="none" stroke="#d7ff43" strokeWidth="3" strokeLinejoin="round" initial={{pathLength:0}} animate={{pathLength:1}} transition={{duration:2.2,ease:'easeInOut'}}/></svg>
      <div>
        <span className="bo-intro-kicker">ROUND {race.meta.round} · {race.meta.year} FORMULA 1 SEASON</span>
        <h2>{race.meta.name.toUpperCase()}</h2>
        <p>{race.meta.circuit} · {race.meta.country}</p>
        <div className="bo-intro-facts"><span><b>{race.meta.laps}</b>LAPS</span><span><b>{(race.track.length/1000).toFixed(3)}</b>KM LAP</span><span><b>{race.drivers.length}</b>DRIVERS</span></div>
      </div>
    </motion.div>
  </motion.button>
}

/** Live 2D map of every car on track, from recorded positions. */
function MiniMap({race,time,selected,onSelect}:{race:HistoricalRace;time:number;selected:number;onSelect:(n:number)=>void}){
  const frame=useMemo(()=>{
    const p=race.track.points,minX=Math.min(...p.map(q=>q[0])),maxX=Math.max(...p.map(q=>q[0])),minY=Math.min(...p.map(q=>q[1])),maxY=Math.max(...p.map(q=>q[1])),scale=150/Math.max(maxX-minX,maxY-minY,1)
    const project=(x:number,y:number)=>({x:(x-minX)*scale+8,y:(maxY-y)*scale+8})
    const d=p.map(([x,y],i)=>{const q=project(x,y);return `${i?'L':'M'}${q.x.toFixed(1)} ${q.y.toFixed(1)}`}).join(' ')+'Z'
    return {project,d,width:(maxX-minX)*scale+16,height:(maxY-minY)*scale+16}
  },[race])
  const standings=getStandings(race,time)
  return <div className="bo-map" aria-label="Live track map">
    <svg viewBox={`0 0 ${frame.width} ${frame.height}`}>
      <path d={frame.d} fill="none" stroke="#ffffff22" strokeWidth="7" strokeLinejoin="round"/>
      <path d={frame.d} fill="none" stroke="#c9d6cf" strokeWidth="1.6" strokeLinejoin="round"/>
      {standings.slice().reverse().map(s=>{
        if(!['recorded','interpolated','finished'].includes(s.location.status)||!Number.isFinite(s.location.x))return null
        const q=frame.project(s.location.x,s.location.y),mine=s.driver.number===selected
        return <g key={s.driver.number} transform={`translate(${q.x} ${q.y})`} onClick={()=>onSelect(s.driver.number)} role="button" aria-label={`Follow ${s.driver.name}`}>
          {mine&&<circle r="7.5" fill="none" stroke="#d7ff43" strokeWidth="1.6"/>}
          <circle r={mine?4.6:3.4} fill={colourOf(s.driver)} stroke="#0b1418" strokeWidth="1.2"/>
          {(mine||s.position===1)&&<text x="7" y="-6" fill={mine?'#d7ff43':'#ffffff'}>{s.position===1&&!mine?'P1 ':''}{s.driver.code}</text>}
        </g>
      })}
    </svg>
  </div>
}

type Toast={id:string;event:StoryEvent;shown:number}
const TOAST_STYLE:Record<StoryEvent['kind'],string>={overtake:'is-gain',lost:'is-loss',lead:'is-lead',pit:'is-pit',fastest:'is-fastest',final:'is-final',finish:'is-finish'}

export default function BroadcastOverlay({race,time,selected,telemetry,onSelect,onLearn,onboard}:{race:HistoricalRace;time:number;selected:number;telemetry:TelemetrySample[];onSelect:(n:number)=>void;onLearn?:()=>void;onboard:boolean}){
  const [intro,setIntro]=useState(true)
  const [coach,setCoach]=useState(()=>{try{return localStorage.getItem('apexlab-coach')!=='off'}catch{return true}})
  const [toasts,setToasts]=useState<Toast[]>([])
  const plans=useMemo(()=>planPitStops(race),[race])
  // The pit-stop panel covers the followed driver's normal stops, so they get no separate toast.
  const events=useMemo(()=>raceStoryEvents(race,selected).filter(e=>e.kind!=='pit'||!plans.some(p=>p.standard&&p.driver===selected&&p.entry===e.time)),[race,selected,plans])
  const pitStop=featuredPitStop(plans,selected,time)
  const previous=useRef(time)
  useEffect(()=>{try{localStorage.setItem('apexlab-coach',coach?'on':'off')}catch{/* Optional preference. */}},[coach])
  useEffect(()=>{setToasts([]);previous.current=time},[selected,race]) // eslint-disable-line react-hooks/exhaustive-deps
  // Broadcast graphics fire as the replay passes each moment; seeking skips them.
  useEffect(()=>{
    const from=previous.current;previous.current=time
    if(time<=from||time-from>6)return
    const fresh=events.filter(e=>e.time>from&&e.time<=time)
    if(fresh.length)setToasts(current=>[...current,...fresh.map(event=>({id:`${event.kind}-${event.time}-${event.driver}`,event,shown:performance.now()}))].slice(-3))
  },[time,events])
  useEffect(()=>{if(!toasts.length)return;const id=setTimeout(()=>setToasts(current=>current.filter(t=>performance.now()-t.shown<4600)),600);return()=>clearTimeout(id)},[toasts])
  const state=getDriverState(race,selected,time),sample=telemetry.length?sampleTelemetry(telemetry,time):null
  const message=coach?coachMessage(race,selected,time,{status:trackStatus(race,time),drs:sample&&sample.sampleAge<=2?sample.drs:null,state}):null
  return <>
    <AnimatePresence>{intro&&<RaceIntro race={race} onDone={()=>setIntro(false)}/>}</AnimatePresence>
    <div className="bo-toasts" aria-live="polite">
      <AnimatePresence>{toasts.map(t=><motion.div key={t.id} className={`bo-toast ${TOAST_STYLE[t.event.kind]}`} initial={{opacity:0,y:-14,scale:.96}} animate={{opacity:1,y:0,scale:1}} exit={{opacity:0,x:40}} transition={{duration:.32,ease:[.2,.8,.2,1]}}>
        <span className="bo-toast-tag">{t.event.tag}</span><b>{t.event.title}</b>{t.event.detail&&<small>{t.event.detail}</small>}
      </motion.div>)}</AnimatePresence>
    </div>
    <MiniMap race={race} time={time} selected={selected} onSelect={onSelect}/>
    <PitStopGraphics race={race} plans={plans} time={time} selected={selected} onSelect={onSelect} onboard={onboard}/>
    {/* The coach steps aside while the pit-stop panel explains the stop. */}
    {!pitStop&&<AnimatePresence mode="wait">{message?<motion.aside key={message.id} className={`bo-coach ${onboard?'is-onboard':''}`} initial={{opacity:0,y:10}} animate={{opacity:1,y:0}} exit={{opacity:0,y:6}} transition={{duration:.25}} aria-live="polite">
      <div className="bo-coach-head"><span className="bo-coach-avatar" aria-hidden="true">{message.icon}</span><b>RACE COACH</b><span className="bo-coach-topic">{message.topic}</span><button onClick={()=>setCoach(false)} aria-label="Hide the race coach"><X size={13}/></button></div>
      <p>{message.text}</p>
      {onLearn&&message.lesson&&<button className="bo-coach-learn" onClick={onLearn}><GraduationCap size={13}/>Learn it in Strategy School</button>}
    </motion.aside>:<button key="coach-off" className="bo-coach-toggle" onClick={()=>setCoach(true)}><GraduationCap size={14}/>Race coach</button>}</AnimatePresence>}
  </>
}
