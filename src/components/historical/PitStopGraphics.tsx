import { useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { featuredPitStop, pitPhase, type PitStopPlan } from '../../history/pitStops'
import { getDriverState } from '../../history/replay'
import { historicalCompound, type HistoricalDriver, type HistoricalRace } from '../../history/types'
import DriverPortrait from './DriverPortrait'
import './PitStopGraphics.css'

const teamColour=(driver:HistoricalDriver)=>/^#?[0-9a-f]{6}$/i.test(driver.color)?`#${driver.color.replace('#','')}`:'#c8d9ba'
function TyreChip({compound,worn=false,size=30}:{compound:string;worn?:boolean;size?:number}){
  const c=historicalCompound(compound)
  return <span className={`pg-tyre ${worn?'is-worn':''}`} style={{'--tyre':c.color,width:size,height:size} as React.CSSProperties} role="img" aria-label={`${worn?'Used':'New'} ${c.name} tyre`}><b>{c.letter}</b></span>
}

/** Tyre age (laps) of the set coming off, from the recorded stint. */
function oldTyreAge(race:HistoricalRace,plan:PitStopPlan){
  const stint=race.stints.filter(s=>s.driver===plan.driver&&s.lapStart<=plan.lap).sort((a,b)=>a.lapStart-b.lapStart).at(-1)
  return stint&&stint.tyreAgeAtStart!=null?stint.tyreAgeAtStart+plan.lap-stint.lapStart+1:null
}

/** Full broadcast pit-stop panel for the followed driver. */
function PitStopPanel({race,plan,time,onboard}:{race:HistoricalRace;plan:PitStopPlan;time:number;onboard:boolean}){
  const driver=race.drivers.find(d=>d.number===plan.driver)!
  const phase=pitPhase(plan,time)?.phase??(time>plan.exit?'done':'release')
  const start=plan.stopAt-plan.service/2,elapsed=Math.max(0,Math.min(plan.service,time-start))
  const progress=plan.service>0?elapsed/plan.service:0
  const age=oldTyreAge(race,plan),from=historicalCompound(plan.from),to=historicalCompound(plan.to)
  // After the stop, show the live recorded position so the panel always agrees with the timing tower.
  const after=phase==='release'||phase==='done'?getDriverState(race,plan.driver,time).position:null
  const delta=plan.before!=null&&after!=null?after-plan.before:null
  const status=phase==='approach'?'PIT LANE · SPEED LIMIT':phase==='service'?'TYRE CHANGE':phase==='release'?'RELEASED!':`BACK ON TRACK${after?` · P${after}`:''}`
  const explain=phase==='approach'?`${driver.code} slows to the pit-lane speed limit. The crew waits in the box with new ${to.name} tyres.`
    :phase==='service'?`Around 20 mechanics work at once: jacks lift the car, wheel guns undo each nut, old tyres off, new ${to.name} tyres on.`
    :delta==null?`New ${to.name} tyres fitted. Fresh tyres grip better, so the next laps should be quicker.`
    :delta>0?`${driver.code} lost ${delta} place${delta>1?'s':''} by stopping — but fresh tyres should be faster than cars still on old ones.`
    :delta<0?`${driver.code} gained ${-delta} place${delta<-1?'s':''} through the stop. Great timing!`:`${driver.code} kept the same position through the stop.`
  return <motion.section className={`pg-panel is-${phase} ${onboard?'is-onboard':''}`} style={{'--team':teamColour(driver)} as React.CSSProperties} initial={{opacity:0,x:28}} animate={{opacity:1,x:0}} exit={{opacity:0,x:20}} transition={{duration:.35,ease:[.2,.8,.2,1]}} aria-label={`${driver.name} pit stop`}>
    <header><span className="pg-tag">PIT STOP</span><span>LAP {plan.lap}</span><span className="pg-status" aria-live="polite">{status}</span></header>
    <div className="pg-body">
      <div className="pg-driver"><DriverPortrait code={driver.code} name={driver.name} className="pg-portrait"/><div><b>{driver.code}</b><small>{driver.team}</small></div></div>
      <div className="pg-clock"><small>{plan.stationary!=null?'STATIONARY':'TYRE CHANGE'}</small><b>{(phase==='approach'?0:elapsed).toFixed(1)}<i>s</i></b><span>{plan.stationary!=null?'recorded time':'typical · not recorded'}</span></div>
      <div className="pg-wheels" aria-label="Four wheels being changed">
        {['FL','FR','RL','RR'].map((corner,i)=>{const done=phase==='done'||phase==='release'||(phase==='service'&&progress>.42+i*.05);return <div key={corner} className={done?'is-done':phase==='service'?'is-working':''}><TyreChip compound={done?plan.to:plan.from} worn={!done} size={26}/><small>{corner}</small></div>})}
      </div>
    </div>
    <div className="pg-progress"><span style={{width:`${phase==='approach'?0:phase==='service'?progress*100:100}%`}}/></div>
    <footer>
      <span className="pg-change"><TyreChip compound={plan.from} worn size={20}/><small>{from.name}{age!=null?` · ${age} laps old`:''}</small><i>→</i><TyreChip compound={plan.to} size={20}/><small>{to.name} · new</small></span>
      <span>PIT LANE <b>{plan.laneTime!=null?`${plan.laneTime.toFixed(1)} s`:'—'}</b></span>
      {plan.before!=null&&<span>POSITION <b>P{plan.before}</b>{after!=null&&<> → <b className={delta!=null&&delta>0?'is-loss':delta!=null&&delta<0?'is-gain':''}>P{after}</b></>}</span>}
      <p>{explain}</p>
    </footer>
  </motion.section>
}

type TickerItem={plan:PitStopPlan;shown:number}
/** Pit stops as broadcast graphics: a full panel for the followed driver and a ticker for everyone else. */
export default function PitStopGraphics({race,plans,time,selected,onSelect,onboard}:{race:HistoricalRace;plans:PitStopPlan[];time:number;selected:number;onSelect:(n:number)=>void;onboard:boolean}){
  const mine=featuredPitStop(plans,selected,time)
  const [ticker,setTicker]=useState<TickerItem[]>([])
  const previous=useRef(time)
  useEffect(()=>{setTicker([]);previous.current=time},[race,selected]) // eslint-disable-line react-hooks/exhaustive-deps
  // Other drivers' stops appear as the replay passes them; seeking skips them.
  useEffect(()=>{
    const from=previous.current;previous.current=time
    if(time<=from||time-from>6)return
    const fresh=plans.filter(p=>p.standard&&p.driver!==selected&&p.entry>from&&p.entry<=time)
    if(fresh.length)setTicker(items=>[...items,...fresh.map(plan=>({plan,shown:performance.now()}))].slice(-4))
  },[time,plans,selected])
  useEffect(()=>{if(!ticker.length)return;const id=setTimeout(()=>setTicker(items=>items.filter(i=>performance.now()-i.shown<8000)),800);return()=>clearTimeout(id)},[ticker])
  return <>
    <AnimatePresence>{mine&&<PitStopPanel key={`${mine.driver}-${mine.lap}`} race={race} plan={mine} time={time} onboard={onboard}/>}</AnimatePresence>
    <div className="pg-ticker" aria-live="polite">
      <AnimatePresence>{ticker.map(({plan})=>{const d=race.drivers.find(x=>x.number===plan.driver)!;return <motion.button key={`${plan.driver}-${plan.lap}`} className="pg-ticker-item" style={{'--team':teamColour(d)} as React.CSSProperties} onClick={()=>onSelect(plan.driver)} initial={{opacity:0,x:-24}} animate={{opacity:1,x:0}} exit={{opacity:0,x:-16}} transition={{duration:.3}} aria-label={`${d.name} pits on lap ${plan.lap}. Follow ${d.code}`}>
        <span className="pg-ticker-tag">PIT</span><b>{d.code}</b><TyreChip compound={plan.from} worn size={20}/><i>→</i><TyreChip compound={plan.to} size={20}/><small>L{plan.lap}{plan.stationary!=null?` · ${plan.stationary.toFixed(1)}s`:''}</small>
      </motion.button>})}</AnimatePresence>
    </div>
  </>
}
