import { useMemo, useState, type FC } from 'react'
import { Pause, Play, RotateCcw } from 'lucide-react'
import { bestPlan, DRY_TYRES, evaluatePlan, grip, lapTime, PIT_LOSS, pitPayback, progressAt, SAFETY_CAR_PIT_LOSS, TYRES, undercutScenario, type Stint, type Tyre } from '../../school/schoolModel'
import { CarSprite, CrewMember, GripBar, StadiumTrack, trackPoint, TyreBadge, useClock } from './visuals'

const fmt=(s:number)=>`${Math.floor(s/60)}:${(s%60).toFixed(1).padStart(4,'0')}`
function PlayButton({playing,onToggle,onReset,label='Play'}:{playing:boolean;onToggle:()=>void;onReset?:()=>void;label?:string}){
  return <div className="sc-controls"><button className="sc-play" onClick={onToggle}>{playing?<Pause size={16}/>:<Play size={16}/>}{playing?'Pause':label}</button>{onReset&&<button className="sc-ghost" onClick={onReset}><RotateCcw size={14}/>Restart</button>}</div>
}

/* 1 — Tyres are like shoes */
function TyreRace(){
  const laps=26,secondsPerLap=1.1
  const cars=useMemo(()=>DRY_TYRES.map(t=>({tyre:t,times:Array.from({length:laps},(_,a)=>lapTime(t,a))})),[])
  const [playing,setPlaying]=useState(false),[run,setRun]=useState(0)
  const [elapsed]=useClock(playing,1,run)
  const raceTime=elapsed/secondsPerLap*90
  const states=cars.map(c=>{const p=Math.min(laps,progressAt(c.times,raceTime));return {...c,progress:p,age:Math.floor(p)}})
  const order=[...states].sort((a,b)=>b.progress-a.progress)
  const leadLap=Math.floor(order[0].progress)
  const story=leadLap<4?'All three cars start. Who will win a race with no pit stops?':leadLap<12?'The Soft tyre car is flying — the grippiest tyre is the fastest at first!':leadLap<20?'Uh-oh. The Soft tyres are wearing out. The car is slowing down…':leadLap<laps?'The Hard tyres just keep going. Slow and steady!':`Finished! On a long run with no stops, ${TYRES[order[0].tyre].name} tyres won.`
  return <div className="sc-lesson-visual">
    <StadiumTrack label="Three cars racing on different tyres">
      {states.map((c,i)=>{const p=trackPoint(c.progress,(i-1)*11);return <CarSprite key={c.tyre} x={p.x} y={p.y} angle={p.angle} color={TYRES[c.tyre].color} label={TYRES[c.tyre].letter}/>})}
    </StadiumTrack>
    <div className="sc-caption">{story}</div>
    <div className="sc-tyre-row">{states.map(c=><div key={c.tyre} className="sc-tyre-card"><TyreBadge tyre={c.tyre} size={40}/><div><b>{TYRES[c.tyre].name}</b><small>Lap {Math.min(laps,Math.floor(c.progress)+1)} · P{order.indexOf(c)+1}</small><GripBar value={grip(c.tyre,c.age)} color={TYRES[c.tyre].color} label="grip"/></div></div>)}</div>
    <PlayButton playing={playing&&leadLap<laps} onToggle={()=>{if(leadLap>=laps){setRun(r=>r+1);setPlaying(true)}else setPlaying(p=>!p)}} onReset={()=>{setRun(r=>r+1);setPlaying(false)}} label="Start the race"/>
  </div>
}
const TyresLesson:FC=()=><div className="sc-lesson-grid">
  <div className="sc-lesson-copy">
    <p className="sc-big">F1 tyres are like <b>shoes</b>. Different shoes for different jobs!</p>
    <div className="sc-shoes">{DRY_TYRES.map(t=><div key={t}><TyreBadge tyre={t} size={54}/><b>{TYRES[t].name}</b><span className="sc-shoe">{t==='soft'?'🏃 ':t==='medium'?'👟 ':'🥾 '}{TYRES[t].shoe}</span><p>{TYRES[t].kid}</p></div>)}</div>
    <p>Grippy tyres are made of softer rubber. Soft rubber sticks to the road — but it also <b>wears away</b> faster, like an eraser.</p>
  </div>
  <TyreRace/>
</div>

/* 2 — The pit stop */
function PitStopScene(){
  const [run,setRun]=useState(0),[playing,setPlaying]=useState(false)
  const [elapsed]=useClock(playing,1,run)
  const t=Math.min(elapsed,6)
  const arrive=Math.min(1,t/1.2),stop=Math.max(0,Math.min(2.4,t-1.2)),leave=Math.max(0,t-3.6)
  const carX=80+arrive*230+leave*200
  const crewIn=Math.min(1,Math.max(0,(t-1)/.5))*(1-Math.min(1,Math.max(0,(t-3.4)/.4)))
  const fresh=stop>1.4
  const spots:[number,number][]=[[-26,-30],[-14,-34],[-2,-30],[-26,30],[-14,34],[-2,30],[26,-30],[38,-34],[50,-30],[26,30],[38,34],[50,30],[68,0],[-46,0],[12,-40],[12,40]]
  return <div className="sc-pitstop">
    <svg viewBox="0 0 620 200" role="img" aria-label="Pit crew changing four tyres">
      <rect width="620" height="200" rx="16" fill="#23292e"/><rect x="0" y="130" width="620" height="70" fill="#2d3439"/>
      <rect x="250" y="40" width="120" height="120" rx="6" fill="none" stroke="#f6c445" strokeWidth="2" strokeDasharray="8 6"/>
      <text x="310" y="32" textAnchor="middle" fontSize="11" fontWeight="700" fill="#f6c445" letterSpacing="2">PIT BOX</text>
      {spots.map(([dx,dy],i)=>{const homeX=170+i*18,homeY=178,x=homeX+(310+dx-homeX)*crewIn,y=homeY+(100+dy-homeY)*crewIn;return <CrewMember key={i} x={x} y={y} color="#00b9ab" angle={dy<0?0:180}/>})}
      <g transform={`translate(${carX} 100) scale(3.2)`}>
        <CarSprite x={0} y={0} angle={0} color="#1f2a30"/>
        {[[-11,-10],[-11,10],[11,-9],[11,9]].map(([x,y],i)=><circle key={i} cx={x} cy={y} r="2.2" fill={fresh?TYRES.medium.color:'#666'}/>)}
      </g>
    </svg>
    <div className="sc-stopwatch"><span>⏱️ STATIONARY</span><b>{stop.toFixed(1)} s</b><small>{t<1.2?'Car driving into its pit box…':stop<2.4?'Wheel guns spin, old tyres off, new tyres on!':t<6?'Go go go! New tyres fitted.':'A perfect stop.'}</small></div>
    <PlayButton playing={playing&&t<6} onToggle={()=>{setRun(r=>r+1);setPlaying(true)}} label="Watch a pit stop"/>
  </div>
}
function PaybackScale(){
  const [age,setAge]=useState(20),[left,setLeft]=useState(12)
  const r=pitPayback('medium',age,'medium',left)
  const tilt=Math.max(-14,Math.min(14,(r.gained-r.lost)/3))
  return <div className="sc-scale">
    <svg viewBox="0 0 320 170" role="img" aria-label="Balance scale comparing time lost and time gained">
      <polygon points="160,150 145,166 175,166" fill="#5f6b70"/><rect x="157" y="60" width="6" height="92" fill="#5f6b70"/>
      <g transform={`rotate(${tilt} 160 60)`}>
        <rect x="40" y="57" width="240" height="6" rx="3" fill="#9fb3a9"/>
        <line x1="60" y1="60" x2="60" y2="92" stroke="#9fb3a9"/><line x1="260" y1="60" x2="260" y2="92" stroke="#9fb3a9"/>
        <path d="M20 92 h80 a40 14 0 0 1 -80 0z" fill="#ff6b5e" transform={`rotate(${-tilt} 60 92)`}/>
        <path d="M220 92 h80 a40 14 0 0 1 -80 0z" fill="#47d16c" transform={`rotate(${-tilt} 260 92)`}/>
        <text x="60" y="122" textAnchor="middle" fill="#ffd0cb" fontSize="12" fontWeight="800" transform={`rotate(${-tilt} 60 92)`}>−{r.lost} s</text>
        <text x="260" y="122" textAnchor="middle" fill="#c9f7d3" fontSize="12" fontWeight="800" transform={`rotate(${-tilt} 260 92)`}>+{r.gained.toFixed(0)} s</text>
      </g>
    </svg>
    <div className="sc-scale-copy">
      <label>Your tyres are <b>{age} laps old</b><input type="range" min={4} max={30} value={age} onChange={e=>setAge(+e.target.value)}/></label>
      <label><b>{left} laps</b> left in the race<input type="range" min={2} max={30} value={left} onChange={e=>setLeft(+e.target.value)}/></label>
      <p>🔴 Pit stop costs <b>{r.lost} seconds</b>.<br/>🟢 New tyres are <b>{r.perLap.toFixed(1)} s faster</b> on the first lap, and that adds up to <b>{r.gained.toFixed(0)} s</b> over {left} laps.</p>
      <div className={`sc-verdict ${r.worth?'is-yes':'is-no'}`}>{r.worth?'✅ Worth it — BOX, BOX!':'❌ Not worth it — stay out!'}</div>
    </div>
  </div>
}
const PitLesson:FC=()=><div className="sc-lesson-stack">
  <p className="sc-big">A pit stop is a <b>trade</b>: you lose time now to go faster later.</p>
  <PitStopScene/>
  <p>The crew changes all four tyres in about <b>2–3 seconds</b>. But the car has to drive slowly down the pit lane, so the whole stop costs about <b>{PIT_LOSS} seconds</b>. Use the scale to see when it's worth it.</p>
  <PaybackScale/>
</div>

/* 3 — The undercut */
function UndercutStory(){
  const [gap,setGap]=useState(1),[playing,setPlaying]=useState(false),[run,setRun]=useState(0)
  const scenario=useMemo(()=>undercutScenario(gap),[gap])
  const [elapsed]=useClock(playing,1,`${run}-${gap}`)
  const lapSeconds=2.2,raceTime=Math.min(7,elapsed/lapSeconds)
  const toLaps=(cumulative:number[],start:number)=>cumulative.map((c,i)=>c-(i?cumulative[i-1]:start))
  const youLaps=toLaps(scenario.you,gap),rivalLaps=toLaps(scenario.rival,0)
  const t=raceTime*90+gap
  const you=progressAt(youLaps,t-gap),rival=progressAt(rivalLaps,t)
  const lap=Math.min(7,Math.floor(raceTime)+1)
  const step=lap<=2?`You are ${gap.toFixed(1)} s behind the red car. Both cars have old, worn tyres.`:lap===3?'📣 BOX BOX! You pit first and lose about 20 seconds in the pit lane.':lap===4?'🆕 Your fresh tyres are about 2 seconds faster per lap! The red car pits now.':raceTime<7?(scenario.worked?'🎉 The red car comes out of the pit lane… BEHIND you! The undercut worked.':'😬 The red car comes out still ahead. You were too far behind for the undercut.'):(scenario.worked?`✅ Undercut success: you are now ${Math.abs(scenario.gaps.at(-1)!).toFixed(1)} s ahead.`:`❌ Undercut failed: still ${scenario.gaps.at(-1)!.toFixed(1)} s behind.`)
  const inPit=(laps:number,pitLap:number)=>laps>=pitLap-.25&&laps<pitLap+.05
  const pYou=trackPoint(you,inPit(you,3)?-22:-8),pRival=trackPoint(rival,inPit(rival,4)?-22:8)
  return <div className="sc-lesson-visual">
    <StadiumTrack label="Undercut demonstration with two cars">
      <CarSprite x={pRival.x} y={pRival.y} angle={pRival.angle} color="#ff453a" label="RIVAL" pit={inPit(rival,4)}/>
      <CarSprite x={pYou.x} y={pYou.y} angle={pYou.angle} color="#0a84ff" label="YOU" glow pit={inPit(you,3)}/>
    </StadiumTrack>
    <div className="sc-caption"><span className="sc-lap">LAP {lap}</span>{step}</div>
    <div className="sc-gapbars" aria-label="Gap after each lap">{scenario.gaps.map((g,i)=><div key={i} className={i<lap?'is-on':''}><span style={{height:`${Math.min(100,Math.abs(g)/22*100+6)}%`,background:i===2?'#5ec8f2':g<0?'#47d16c':'#ff6b5e'}}/><small>L{i+1}</small><b>{i===2?'PIT':g<0?`+${Math.abs(g).toFixed(1)}`:`−${g.toFixed(1)}`}</b></div>)}</div>
    <p className="sc-legend"><span style={{background:'#ff6b5e'}}/>behind the rival <span style={{background:'#47d16c'}}/>ahead of the rival <span style={{background:'#5ec8f2'}}/>pit stop lap</p>
    <label className="sc-slider">How far behind are you before the stops? <b>{gap.toFixed(1)} s</b><input type="range" min={.3} max={2.5} step={.1} value={gap} onChange={e=>{setGap(+e.target.value);setPlaying(false)}}/></label>
    <PlayButton playing={playing&&raceTime<7} onToggle={()=>{setRun(r=>r+1);setPlaying(true)}} label="Play the undercut"/>
  </div>
}
const UndercutLesson:FC=()=><div className="sc-lesson-grid">
  <div className="sc-lesson-copy">
    <p className="sc-big">The <b>undercut</b>: stop first, go faster, jump ahead.</p>
    <ol className="sc-steps"><li><span>1</span><div>You are just behind a rival. Overtaking on track is hard.</div></li><li><span>2</span><div>You pit <b>one lap before</b> them and get fresh, grippy tyres.</div></li><li><span>3</span><div>For one lap you are much faster than the rival on old tyres.</div></li><li><span>4</span><div>When they pit, they come out <b>behind you</b>!</div></li></ol>
    <p className="sc-tip">💡 Try the slider: if you are too far behind, the undercut doesn't work. The opposite trick — staying out longer — is called the <b>overcut</b>.</p>
  </div>
  <UndercutStory/>
</div>

/* 4 — Safety car */
function SafetyCarScene(){
  const [sc,setSc]=useState(false),[elapsed]=useClock(true,1,0)
  const cars=['#ff453a','#0a84ff','#ff9f0a','#30d158','#bf5af2']
  const base=elapsed*.08
  return <div className="sc-lesson-visual">
    <StadiumTrack label={sc?'Cars bunched behind the safety car':'Cars spread around the track'}>
      {sc&&(()=>{const p=trackPoint(base*.6+.04);return <CarSprite x={p.x} y={p.y} angle={p.angle} color="#f6c445" label="SC" glow/>})()}
      {cars.map((c,i)=>{const p=trackPoint(sc?base*.6-i*.025:base-i*.19);return <CarSprite key={c} x={p.x} y={p.y} angle={p.angle} color={c}/>})}
    </StadiumTrack>
    <button className={`sc-toggle ${sc?'is-on':''}`} onClick={()=>setSc(v=>!v)}>{sc?'🚨 Safety car is OUT — tap to bring it in':'Deploy the safety car 🚨'}</button>
    <div className="sc-bars">
      <div><span>Pit stop cost — normal racing</span><i style={{width:`${PIT_LOSS/PIT_LOSS*100}%`}}/><b>{PIT_LOSS} s</b></div>
      <div className={sc?'is-hot':''}><span>Pit stop cost — behind the safety car</span><i style={{width:`${SAFETY_CAR_PIT_LOSS/PIT_LOSS*100}%`}}/><b>{SAFETY_CAR_PIT_LOSS} s</b></div>
    </div>
  </div>
}
const SafetyLesson:FC=()=><div className="sc-lesson-grid">
  <div className="sc-lesson-copy">
    <p className="sc-big">A <b>safety car</b> makes pit stops <b>cheap</b>.</p>
    <p>After a crash, a safety car leads the race so marshals can clean up. Everyone must drive slowly and nobody can overtake.</p>
    <p>Because <b>everyone</b> is slow, the time you lose in the pit lane is much smaller — often half! That's why you'll see lots of cars dive into the pits when the safety car comes out.</p>
    <p className="sc-tip">🚥 The cars also bunch up behind the safety car, so big leads disappear.</p>
  </div>
  <SafetyCarScene/>
</div>

/* 5 — DRS and slipstream */
function DrsScene(){
  const [gap,setGap]=useState(.6),[open,setOpen]=useState(false),[run,setRun]=useState(0)
  const allowed=gap<=1
  const [elapsed]=useClock(open&&allowed,1,run)
  const t=Math.min(elapsed,3.2),boost=open&&allowed?t*34:0
  const rivalX=330+t*95,youX=330-gap*90+t*95+boost
  return <div className="sc-lesson-visual">
    <svg className="sc-drs" viewBox="0 0 620 230" role="img" aria-label="DRS overtake on a straight">
      <rect width="620" height="230" rx="16" fill="#1d3a26"/><rect y="120" width="620" height="78" fill="#3a3f44"/>
      <rect x="140" y="120" width="4" height="78" fill="#fff" opacity=".7"/><text x="146" y="114" fontSize="10" fontWeight="700" fill="#e9e9e2" letterSpacing="1">DRS ZONE ▶</text>
      {/* Side view of the rear wing: the top flap opens to let air through. */}
      <g transform="translate(70 30)"><rect x="0" y="40" width="70" height="10" rx="3" fill="#4a5258"/><rect x="0" y="0" width="8" height="54" fill="#2e3439"/><rect x="62" y="0" width="8" height="54" fill="#2e3439"/>
        <rect x="8" y="22" width="54" height="8" rx="3" fill="#0a84ff"/><rect x="8" y="10" width="54" height="7" rx="3" fill="#0a84ff" transform={`rotate(${open&&allowed?-28:0} 62 13)`}/>
        {open&&allowed&&[0,1,2].map(i=><path key={i} d={`M-10 ${14+i*4} C 20 ${12+i*4}, 40 ${14+i*4}, 90 ${12+i*4}`} stroke="#bfe6ff" strokeWidth="1.5" fill="none" opacity=".8"/>)}
        <text x="35" y="78" textAnchor="middle" fontSize="10" fontWeight="700" fill={open&&allowed?'#47d16c':'#9fb3a9'}>{open&&allowed?'FLAP OPEN':'FLAP CLOSED'}</text></g>
      <g transform="translate(0 159)"><CarSprite x={rivalX%700} y={-14} angle={0} color="#ff453a" scale={1.6} label="RIVAL"/><CarSprite x={youX%700} y={18} angle={0} color="#0a84ff" scale={1.6} label="YOU" glow={open&&allowed}/></g>
      {open&&allowed&&<text x="600" y="30" textAnchor="end" fontSize="16" fontWeight="800" fill="#47d16c">+12 km/h</text>}
    </svg>
    <label className="sc-slider">Gap to the car ahead <b>{gap.toFixed(1)} s</b> {allowed?<em className="is-yes">DRS allowed</em>:<em className="is-no">too far — no DRS</em>}<input type="range" min={.2} max={2} step={.1} value={gap} onChange={e=>{setGap(+e.target.value);setOpen(false)}}/></label>
    <div className="sc-controls"><button className="sc-play" disabled={!allowed} onClick={()=>{setRun(r=>r+1);setOpen(true)}}>💨 Open DRS</button><button className="sc-ghost" onClick={()=>{setOpen(false);setRun(r=>r+1)}}><RotateCcw size={14}/>Reset</button></div>
  </div>
}
const DrsLesson:FC=()=><div className="sc-lesson-grid">
  <div className="sc-lesson-copy">
    <p className="sc-big"><b>DRS</b> is an overtaking helper on the rear wing.</p>
    <p>Air pushes against a car and slows it down. DRS opens a flap in the rear wing so less air pushes back — the car goes about <b>10–12 km/h faster</b> on the straight.</p>
    <p>The rule: you can only use it in a <b>DRS zone</b>, and only if you are <b>less than 1 second</b> behind the car in front.</p>
    <p className="sc-tip">🌬️ Following closely also gives you a <b>slipstream</b> (or “tow”): the car ahead punches a hole in the air for you.</p>
  </div>
  <DrsScene/>
</div>

/* 6 — Rain */
function RainScene(){
  const [wet,setWet]=useState(.2)
  const tyres:Tyre[]=['soft','inter','wet']
  const times=tyres.map(t=>lapTime(t,0,wet)),slowest=Math.max(...times),fastest=Math.min(...times),best=tyres[times.indexOf(fastest)]
  return <div className="sc-lesson-visual">
    <div className="sc-rain" style={{'--wet':wet} as React.CSSProperties}><StadiumTrack wet={wet} pitLane={false} label="Track getting wetter"/><div className="sc-raindrops" aria-hidden="true"/></div>
    <label className="sc-slider">How wet is the track? <b>{wet<.1?'☀️ Dry':wet<.35?'🌦️ Damp':wet<.7?'🌧️ Wet':'⛈️ Soaked'}</b><input type="range" min={0} max={1} step={.05} value={wet} onChange={e=>setWet(+e.target.value)}/></label>
    <div className="sc-race-bars">{tyres.map((t,i)=><div key={t} className={best===t?'is-best':''}><TyreBadge tyre={t} size={36}/><span><b>{t==='soft'?'Slick':TYRES[t].name}</b><i style={{width:`${30+70*(1-(times[i]-fastest)/Math.max(1,slowest-fastest))}%`,background:TYRES[t].color}}/></span><em>{fmt(times[i])}</em></div>)}</div>
    <p className="sc-caption">Best tyre now: <b style={{color:TYRES[best].color}}>{best==='soft'?'Slicks':TYRES[best].name}</b></p>
  </div>
}
const RainLesson:FC=()=><div className="sc-lesson-grid">
  <div className="sc-lesson-copy">
    <p className="sc-big">Rain changes <b>everything</b>.</p>
    <p>Normal F1 tyres are smooth, called <b>slicks</b>. On a wet road they can't push water away, so the car slides — like trainers on ice.</p>
    <div className="sc-shoes"><div><TyreBadge tyre="inter" size={54}/><b>Intermediate</b><p>Shallow grooves for a damp track.</p></div><div><TyreBadge tyre="wet" size={54}/><b>Full Wet</b><p>Deep grooves for heavy rain.</p></div></div>
    <p className="sc-tip">🎯 Teams win and lose races by choosing the right lap to switch. Too early or too late costs lots of time!</p>
  </div>
  <RainScene/>
</div>

/* 7 — Build a plan (two-tyre rule) */
function PlanBuilder(){
  const race=30
  const [stints,setStints]=useState<Stint[]>([{tyre:'soft',laps:15},{tyre:'soft',laps:15}])
  const [showBest,setShowBest]=useState(false)
  const result=evaluatePlan(stints,race),best=useMemo(()=>bestPlan(race),[])
  const delta=result.time-best.time,medal=!result.legal?null:delta<.5?'🥇':delta<5?'🥈':delta<15?'🥉':null
  const setTyre=(i:number,tyre:Tyre)=>setStints(s=>s.map((x,k)=>k===i?{...x,tyre}:x))
  const setLaps=(i:number,laps:number)=>setStints(s=>{const next=s.map(x=>({...x}));next[i].laps=laps;const used=next.slice(0,-1).reduce((n,x)=>n+x.laps,0);next[next.length-1].laps=Math.max(1,race-used);return next})
  const setStops=(stops:number)=>setStints(s=>{const n=stops+1,each=Math.floor(race/n);return Array.from({length:n},(_,i)=>({tyre:s[i]?.tyre??'medium',laps:i===n-1?race-each*(n-1):each}))})
  return <div className="sc-planner">
    <div className="sc-plan-top"><span>Race length: <b>{race} laps</b></span><div className="sc-segmented" role="group" aria-label="Number of pit stops">{[1,2].map(n=><button key={n} aria-pressed={stints.length-1===n} onClick={()=>setStops(n)}>{n} stop{n>1?'s':''}</button>)}</div></div>
    <div className="sc-plan-bar">{stints.map((s,i)=><div key={i} style={{flex:Math.max(1,s.laps),'--tyre':TYRES[s.tyre].color} as React.CSSProperties}><TyreBadge tyre={s.tyre} size={26}/><b>{s.laps} laps</b>{i>0&&<span className="sc-plan-pit">PIT</span>}</div>)}</div>
    <div className="sc-stints">{stints.map((s,i)=><div key={i} className="sc-stint-editor"><small>STINT {i+1}</small><div className="sc-tyre-pick">{DRY_TYRES.map(t=><button key={t} aria-pressed={s.tyre===t} onClick={()=>setTyre(i,t)} aria-label={`${TYRES[t].name} tyre for stint ${i+1}`}><TyreBadge tyre={t} size={32}/></button>)}</div>{i<stints.length-1?<label>{s.laps} laps<input type="range" min={3} max={race-3*(stints.length-1)} value={s.laps} onChange={e=>setLaps(i,+e.target.value)}/></label>:<span className="sc-auto">{s.laps} laps (the rest)</span>}<small>Grip at end: {grip(s.tyre,s.laps-1)}%</small></div>)}</div>
    <div className={`sc-plan-result ${result.legal?'is-legal':'is-illegal'}`}>
      {result.legal?<><span className="sc-medal">{medal??'🏁'}</span><div><b>Race time {fmt(result.time)}</b><p>{delta<.5?'Perfect! That is the fastest plan an engineer could find.':`${delta.toFixed(1)} s slower than the best plan. ${medal?'Great job!':'Try a different mix of tyres or stop laps.'}`}</p></div></>:<><span className="sc-medal">⚠️</span><div><b>Not allowed!</b><p>{result.issue}</p></div></>}
      <button className="sc-ghost" onClick={()=>setShowBest(v=>!v)}>{showBest?'Hide':'Show'} the engineer's best plan</button>
    </div>
    {showBest&&<p className="sc-best">🧠 Best plan: {best.stints.map((s,i)=><span key={i}><TyreBadge tyre={s.tyre} size={20}/> {TYRES[s.tyre].name} for {s.laps} laps{i<best.stints.length-1?' → ':''}</span>)} · {fmt(best.time)}</p>}
  </div>
}
const PlanLesson:FC=()=><div className="sc-lesson-stack">
  <p className="sc-big">Your turn: <b>build a race plan</b>.</p>
  <p>There's one important rule: in a dry race every car must use <b>at least two different types</b> of tyre. So every driver has to stop at least once! Pick your tyres and when to stop, then see how fast your plan is.</p>
  <PlanBuilder/>
</div>

export type LessonInfo={id:string;emoji:string;title:string;short:string;Component:FC;quiz:{q:string;options:string[];answer:number;why:string}}
export const LESSONS:LessonInfo[]=[
  {id:'tyres',emoji:'👟',title:'Tyres are like shoes',short:'Soft, Medium and Hard — fast vs. long-lasting.',Component:TyresLesson,quiz:{q:'Which tyre is the fastest at the start but wears out the quickest?',options:['Hard','Soft','Medium'],answer:1,why:'Soft tyres are the grippiest, so they are fastest — but the soft rubber wears away quickly, like an eraser.'}},
  {id:'pit',emoji:'🔧',title:'The pit stop trade',short:'Lose 20 seconds now to go faster later.',Component:PitLesson,quiz:{q:'There are only 2 laps left and your tyres are a bit old. Should you pit?',options:['Yes, always pit for new tyres','No — 2 laps of faster driving can’t win back 20 seconds','Pit twice to be safe'],answer:1,why:'A stop costs about 20 seconds. New tyres only gain a couple of seconds per lap, so with 2 laps left you can’t win that time back.'}},
  {id:'undercut',emoji:'✂️',title:'The undercut',short:'Stop first and jump ahead of your rival.',Component:UndercutLesson,quiz:{q:'How does the undercut help you pass a rival?',options:['You pit before them and use fresh tyres to go faster','You drive into the back of them','You never stop at all'],answer:0,why:'Fresh tyres are faster, so stopping a lap earlier lets you build a gap while the rival is still on worn tyres.'}},
  {id:'safety',emoji:'🚨',title:'Safety car = cheap stop',short:'When everyone slows down, pit stops cost less.',Component:SafetyLesson,quiz:{q:'Why do lots of cars pit when the safety car comes out?',options:['The drivers are hungry','A pit stop costs less time because everyone is driving slowly','It is against the rules to stay out'],answer:1,why:'Behind the safety car the whole field is slow, so the time lost in the pit lane is much smaller — often half.'}},
  {id:'drs',emoji:'💨',title:'DRS & slipstream',short:'The overtaking helpers on the straights.',Component:DrsLesson,quiz:{q:'When can a driver use DRS?',options:['Anywhere, any time','In a DRS zone, when less than 1 second behind the car ahead','Only in the rain'],answer:1,why:'DRS only works in marked zones, and only for a car within 1 second of the one in front.'}},
  {id:'rain',emoji:'🌧️',title:'Rain changes everything',short:'Slicks, Intermediates and Wets.',Component:RainLesson,quiz:{q:'It starts to rain and the track gets wet. What tyres do teams switch to?',options:['Grooved Intermediate or Wet tyres','Even softer slick tyres','No tyres at all'],answer:0,why:'Grooved tyres push water out of the way so the tyre can still grip the road. Smooth slicks slide on water.'}},
  {id:'plan',emoji:'🧠',title:'Build a race plan',short:'The two-tyre rule and finding the fastest plan.',Component:PlanLesson,quiz:{q:'In a dry race, what must every car do?',options:['Use at least two different types of tyre','Use only Hard tyres','Stop exactly three times'],answer:0,why:'The rules make every car use at least two different dry tyres, so everyone has to make at least one pit stop.'}},
]
