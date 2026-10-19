import { useMemo } from 'react'
import { GraduationCap, Play } from 'lucide-react'
import { strategyBattles, strategyStory } from '../../history/strategyStory'
import { historicalCompound, type HistoricalRace } from '../../history/types'
import './StrategyStoryPanel.css'

const BATTLE_ICON={undercut:'✂️',overcut:'⏳',weather:'🌧️'} as const
const BATTLE_NAME={undercut:'UNDERCUT',overcut:'OVERCUT',weather:'WEATHER CALL'} as const

/** A driver's race drawn as tyre blocks along the lap count, with pit markers between them. */
function TyreTimeline({race,driver}:{race:HistoricalRace;driver:number}){
  const stints=race.stints.filter(s=>s.driver===driver).sort((a,b)=>a.lapStart-b.lapStart)
  return <div className="ss-timeline" aria-hidden="true">
    {stints.map((s,i)=>{const tyre=historicalCompound(s.compound);return <div key={s.stint} className="ss-stint" style={{flex:s.lapEnd-s.lapStart+1,'--tyre':tyre.color} as React.CSSProperties}>
      {i>0&&<span className="ss-pit">PIT</span>}
      <i>{tyre.letter}</i><span>{tyre.name}</span><small>{s.lapEnd-s.lapStart+1} laps</small>
    </div>})}
  </div>
}

export default function StrategyStoryPanel({race,driver,onSeek,onSchool}:{race:HistoricalRace;driver:number;onSeek:(time:number)=>void;onSchool?:()=>void}){
  const winner=race.drivers.find(d=>d.finishPosition===1)??race.drivers[0]
  const winnerStory=useMemo(()=>strategyStory(race,winner.number),[race,winner.number])
  const mine=useMemo(()=>strategyStory(race,driver),[race,driver])
  const battles=useMemo(()=>strategyBattles(race),[race])
  const name=(n:number)=>race.drivers.find(d=>d.number===n)
  const chip=(n:number)=>{const d=name(n);return <b className="ss-chip" style={{'--team':d?.color?`#${d.color.replace('#','')}`:'#9aa'} as React.CSSProperties}>{d?.code??n}</b>}
  return <section className="ss-panel" aria-labelledby="ss-title">
    <div className="ss-head">
      <div><span className="eyebrow">THE STRATEGY STORY · EXPLAINED SIMPLY</span><h2 id="ss-title">How this race was won — in tyres.</h2><p>Every car must change tyres during a race. When they stop, and which tyres they pick, is called <b>strategy</b>. Here is what really happened.</p></div>
      {onSchool&&<button className="ss-school" onClick={onSchool}><GraduationCap size={18}/>New to F1? Strategy School</button>}
    </div>
    <div className="ss-primer">
      <div><span>👟</span><b>Tyres are like shoes</b><p><em style={{color:historicalCompound('SOFT').color}}>Soft</em> = fast but wears out quickly. <em style={{color:historicalCompound('HARD').color}}>Hard</em> = slower but lasts.</p></div>
      <div><span>⏱️</span><b>A pit stop costs ~20 s</b><p>The tyre change takes 2–3 s, but driving slowly down the pit lane loses about 20 seconds.</p></div>
      <div><span>✂️</span><b>The undercut</b><p>Stop before your rival, go faster on fresh tyres, and be ahead when they stop.</p></div>
    </div>
    <div className="ss-stories">
      <article className="ss-story is-winner"><span className="ss-badge">🏆 THE WINNER</span><h3>{winnerStory.headline}</h3><TyreTimeline race={race} driver={winner.number}/><ol>{winnerStory.steps.map((s,i)=><li key={i}>{s.text}</li>)}</ol></article>
      {driver!==winner.number&&<article className="ss-story"><span className="ss-badge">🎯 YOUR DRIVER</span><h3>{mine.headline}</h3><TyreTimeline race={race} driver={driver}/><ol>{mine.steps.map((s,i)=><li key={i}>{s.text}</li>)}</ol></article>}
    </div>
    <div className="ss-battles">
      <div className="ss-battles-head"><span className="eyebrow">MOMENTS THAT DECIDED THE RACE</span><small>Found automatically in the recorded positions and pit stops</small></div>
      {battles.length?<div className="ss-battle-grid">{battles.map((b,i)=><article key={i} className={`ss-battle is-${b.kind}`}>
        <div className="ss-battle-top"><span className="ss-battle-icon">{BATTLE_ICON[b.kind]}</span><b>{BATTLE_NAME[b.kind]}</b><small>LAPS {b.firstLap}–{b.secondLap}</small></div>
        <div className="ss-order"><div><small>BEFORE THE STOPS</small><span>{b.before[0]<b.before[1]?<>{chip(b.first)}<i>ahead of</i>{chip(b.second)}</>:<>{chip(b.second)}<i>ahead of</i>{chip(b.first)}</>}</span></div><span className="ss-arrow">→</span><div><small>AFTER THE STOPS</small><span>{b.after[0]<b.after[1]?<>{chip(b.first)}<i>ahead of</i>{chip(b.second)}</>:<>{chip(b.second)}<i>ahead of</i>{chip(b.first)}</>}</span></div></div>
        <p>{b.text}</p>
        <button onClick={()=>onSeek(Math.max(0,b.time))}><Play size={13}/>Watch it in 3D</button>
      </article>)}</div>:<p className="ss-empty">No close pit-stop duels were found in this race's records — the order mostly held through the stops.</p>}
    </div>
    <p className="ss-note">Stories and duels are generated only from recorded stints, pit entries and position records. “Watch it in 3D” jumps to just before the first of the two stops.</p>
  </section>
}
