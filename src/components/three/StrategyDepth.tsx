import { useState } from 'react'
import { motion } from 'framer-motion'
import { Box, View } from 'lucide-react'
import { COMPOUNDS, formatTime, type RaceResult, type Strategy } from '../../engine/race'
import './Three.css'

export default function StrategyDepth({strategies,results,lap,setLap}:{strategies:Strategy[];results:RaceResult[];lap:number;setLap:(v:number)=>void}){
  const [flat,setFlat]=useState(false)
  return <section className="strategy-depth" aria-label="Layered strategy trajectories"><div className="strategy-depth-header"><span className="eyebrow">ONE RACE. THREE RACING LINES.</span><button className="strategy-depth-toggle" aria-pressed={flat} onClick={()=>setFlat(!flat)}>{flat?<Box size={13}/>:<View size={13}/>} {flat?'Show depth':'Flatten view'}</button></div><div className={`strategy-trajectories ${flat?'is-flat':''}`}>{strategies.map((strategy,index)=>{
    const stopSet=new Set(strategy.pitLaps)
    const points=Array.from({length:47},(_,i)=>`${i/46*600},${stopSet.has(i)?26:12}`)
    const d=`M${points.join(' L')}`
    return <div className="strategy-trajectory" key={strategy.id}><b>{String.fromCharCode(65+index)}</b><div className="trajectory-route"><svg viewBox="0 0 600 32" preserveAspectRatio="none" role="img" aria-label={`${strategy.name}. Pit after laps ${strategy.pitLaps.join(' and ')}. ${results[index].valid?formatTime(results[index].totalTime):'Invalid compounds'}. Full controls in timeline below.`}><motion.path initial={false} animate={{d}} transition={{duration:.3}} fill="none" stroke={COMPOUNDS[strategy.compounds[0]].color} strokeWidth="2"/>{strategy.pitLaps.map(n=><circle key={n} cx={n/46*600} cy="26" r="4" className="trajectory-marker"/>)}<path d={`M${lap/46*600} 0v32`} stroke="#f2f1ec" strokeWidth="1" strokeDasharray="3 3"/></svg></div><span className="trajectory-time">{formatTime(results[index].totalTime)}</span></div>
  })}</div><label className="trajectory-lap-label" htmlFor="depth-lap">INSPECT LAP <b>{String(lap).padStart(2,'0')} / 46</b></label><input id="depth-lap" className="trajectory-lap-slider" type="range" min="1" max="46" value={lap} onChange={e=>setLap(+e.target.value)}/><p className="strategy-depth-note">Each dip is a pit stop. Depth separates the strategies; the timelines below preserve precise lap lengths, compounds, and calculated times.</p></section>
}
