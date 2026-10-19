import { useEffect, useMemo, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { Pause, Play, RotateCcw } from 'lucide-react'
import { DRY_TYRES, gameResult, gameRivals, grip, newGame, progressAt, stepGame, TYRES, type GameState, type Tyre } from '../../school/schoolModel'
import { CarSprite, GripBar, StadiumTrack, trackPoint, TyreBadge } from './visuals'

const LAP_SECONDS=2.6,REFERENCE_LAP=91
type Phase='setup'|'racing'|'finished'
const CAR_INFO:Record<string,{name:string;color:string}>={you:{name:'YOU',color:'#0a84ff'},...Object.fromEntries(gameRivals().map(r=>[r.id,{name:r.name,color:r.color}]))}
const PLACE=['🥇','🥈','🥉','4th','5th']

/**
 * "Be the Race Engineer": choose a starting tyre, then shout BOX BOX at the right moment.
 * Laps are simulated one at a time as the leader starts them, so the cars animate
 * continuously from each car's own recorded lap times.
 */
export default function RaceEngineerGame({onWin}:{onWin?:()=>void}){
  const [phase,setPhase]=useState<Phase>('setup')
  const [start,setStart]=useState<Tyre>('medium')
  const [seed,setSeed]=useState(()=>Math.floor(Math.random()*1000))
  const [game,setGame]=useState<GameState|null>(null)
  const [raceTime,setRaceTime]=useState(0)
  const [paused,setPaused]=useState(false)
  const [choosing,setChoosing]=useState(false)
  const [speed,setSpeed]=useState(1)
  const box=useRef<Tyre|null>(null),[pending,setPending]=useState<Tyre|null>(null)
  const gameRef=useRef<GameState|null>(null)
  const clock=useRef(0)
  const offsets=useMemo(()=>Object.fromEntries(newGame(start,seed).cars.map(c=>[c.id,c.time])),[start,seed])

  const begin=(withSeed=seed)=>{const g=stepGame(newGame(start,withSeed),null);setSeed(withSeed);gameRef.current=g;setGame(g);clock.current=0;setRaceTime(0);setPhase('racing');setPaused(false);setChoosing(false);box.current=null;setPending(null)}
  // The race clock; a new lap is simulated whenever the leader reaches the end of the known laps.
  useEffect(()=>{
    if(phase!=='racing'||paused||choosing)return
    let frame=0,last:number|null=null
    const tick=(now:number)=>{
      if(last!=null){
        const dt=Math.min(.1,(now-last)/1000)*speed,g=gameRef.current
        clock.current+=dt/LAP_SECONDS*REFERENCE_LAP
        if(g){
          const leaderEnd=Math.min(...g.cars.map(c=>c.time))
          if(clock.current>=leaderEnd&&g.lap<g.laps){const stepped=stepGame(g,box.current);box.current=null;setPending(null);gameRef.current=stepped;setGame(stepped)}
          else if(g.lap>=g.laps&&clock.current>=Math.max(...g.cars.map(c=>c.time))+4)setPhase('finished')
        }
        setRaceTime(clock.current)
      }
      last=now;frame=requestAnimationFrame(tick)
    }
    frame=requestAnimationFrame(tick)
    return()=>cancelAnimationFrame(frame)
  },[phase,paused,choosing,speed])

  const result=useMemo(()=>phase==='finished'&&game?gameResult(game):null,[phase,game])
  useEffect(()=>{if(result?.position===1&&result.legal)onWin?.()},[result,onWin])

  if(phase==='setup')return <div className="sc-game sc-game-setup">
    <h3>Pick your starting tyres</h3>
    <p>The race is <b>24 laps</b>. You're racing four rival teams. Watch your tyres' grip — and shout <b>BOX BOX</b> when it's time to change them. Remember: you must use <b>two different tyre types</b>!</p>
    <div className="sc-start-tyres">{DRY_TYRES.map(t=><button key={t} aria-pressed={start===t} onClick={()=>setStart(t)}><TyreBadge tyre={t} size={64}/><b>{TYRES[t].name}</b><small>{TYRES[t].kid}</small></button>)}</div>
    <button className="sc-cta" onClick={()=>begin()}>🏁 Start the race</button>
  </div>

  if(!game)return null
  const cars=game.cars.map(c=>({...c,progress:Math.min(game.laps,progressAt(c.lapTimes,raceTime-(offsets[c.id]??0)))}))
  const order=[...cars].sort((a,b)=>b.progress-a.progress)
  const me=cars.find(c=>c.id==='you')!
  const myGrip=grip(me.tyre,me.age),scNow=game.safetyCar.includes(Math.floor(order[0].progress)+1)
  const lapNow=Math.min(game.laps,Math.floor(me.progress)+1)
  const hint=scNow?'🚨 SAFETY CAR! A pit stop is cheap right now — only 10 seconds!':myGrip<20?'⚠️ Your tyres are almost worn out! They are getting very slow. Box now?':me.used.size<2&&lapNow>=game.laps-4?'📏 Don’t forget the rule: you must use two different tyre types!':game.log.at(-1)??'Watch your grip bar. When it gets low, it’s time to box!'

  if(phase==='finished'&&result)return <div className="sc-game sc-game-result">
    <motion.div className="sc-podium" initial={{scale:.9,opacity:0}} animate={{scale:1,opacity:1}}>
      <span className="sc-place">{result.legal?PLACE[result.position-1]:'⚠️'}</span>
      <h3>{!result.legal?'Disqualified to last!':result.position===1?'You WON the race!':result.position<=3?`Podium! You finished P${result.position}`:`You finished P${result.position}`}</h3>
      <ol className="sc-final-order">{result.order.map((id,i)=><li key={id} className={id==='you'?'is-you':''}><span>{i+1}</span><i style={{background:CAR_INFO[id].color}}/>{CAR_INFO[id].name}<small>{(()=>{const car=game.cars.find(c=>c.id===id)!;return [car.stops[0]?.from??car.tyre,...car.stops.map(s=>s.to)].map(t=>TYRES[t].letter).join(' → ')})()}</small></li>)}</ol>
    </motion.div>
    <div className="sc-coach-tips"><b>🎧 Your race engineer says:</b><ul>{result.tips.map((t,i)=><li key={i}>{t}</li>)}</ul></div>
    <div className="sc-controls"><button className="sc-cta" onClick={()=>begin(seed+1)}><RotateCcw size={16}/>Race again</button><button className="sc-ghost" onClick={()=>setPhase('setup')}>Choose different tyres</button></div>
  </div>

  return <div className="sc-game">
    <div className="sc-game-top"><span className="sc-lap">LAP {lapNow} / {game.laps}</span>{scNow&&<span className="sc-sc-flag">🚨 SAFETY CAR</span>}<div className="sc-segmented" role="group" aria-label="Game speed">{[1,2].map(s=><button key={s} aria-pressed={speed===s} onClick={()=>setSpeed(s)}>{s}×</button>)}</div><button className="sc-ghost" onClick={()=>setPaused(p=>!p)}>{paused?<Play size={14}/>:<Pause size={14}/>}{paused?'Resume':'Pause'}</button></div>
    <div className="sc-game-main">
      <StadiumTrack label="Race in progress">
        {scNow&&(()=>{const p=trackPoint(order[0].progress+.03);return <CarSprite x={p.x} y={p.y} angle={p.angle} color="#f6c445" label="SC" glow/>})()}
        {order.slice().reverse().map((c,i)=>{const frac=c.progress%1,inPit=c.stops.some(s=>s.lap===Math.floor(c.progress)+1)&&frac>.82,p=trackPoint(c.progress,inPit?-22:((i%3)-1)*7);return <CarSprite key={c.id} x={p.x} y={p.y} angle={p.angle} color={CAR_INFO[c.id].color} label={c.id==='you'?'YOU':undefined} glow={c.id==='you'} pit={inPit}/>})}
      </StadiumTrack>
      <aside className="sc-tower">{order.map((c,i)=><div key={c.id} className={c.id==='you'?'is-you':''}><span>{i+1}</span><i style={{background:CAR_INFO[c.id].color}}/><b>{CAR_INFO[c.id].name}</b><TyreBadge tyre={c.tyre} size={22}/></div>)}</aside>
    </div>
    <div className="sc-game-dash">
      <div className="sc-my-tyre"><TyreBadge tyre={me.tyre} size={52} worn={1-myGrip/100}/><div><b>{TYRES[me.tyre].name} · {me.age} laps old</b><GripBar value={myGrip} color={TYRES[me.tyre].color} label={`grip ${myGrip}%`}/><small>Tyres used: {[...me.used].map(t=>TYRES[t].letter).join(' + ')}</small></div></div>
      <AnimatePresence mode="wait"><motion.p key={hint} className="sc-hint" initial={{opacity:0,y:6}} animate={{opacity:1,y:0}} exit={{opacity:0}}>{hint}</motion.p></AnimatePresence>
      <div className="sc-box-area">{pending?<div className="sc-boxed">📻 Boxing this lap for <TyreBadge tyre={pending} size={24}/></div>:<button className="sc-box" disabled={game.lap>=game.laps} onClick={()=>setChoosing(true)}>BOX BOX!</button>}</div>
    </div>
    <AnimatePresence>{choosing&&<motion.div className="sc-choose" initial={{opacity:0}} animate={{opacity:1}} exit={{opacity:0}}>
      <div><h4>Which tyres should the crew fit?</h4><div className="sc-start-tyres">{DRY_TYRES.map(t=><button key={t} onClick={()=>{box.current=t;setPending(t);setChoosing(false)}}><TyreBadge tyre={t} size={56}/><b>{TYRES[t].name}</b><small>{t==='soft'?'Fastest, short life':t==='medium'?'Balanced':'Slowest, lasts longest'}</small></button>)}</div><button className="sc-ghost" onClick={()=>setChoosing(false)}>Cancel — stay out</button></div>
    </motion.div>}</AnimatePresence>
  </div>
}
