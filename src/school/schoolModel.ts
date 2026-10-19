/**
 * Strategy School: a deliberately simple, deterministic race model for teaching.
 * Numbers are rounded, illustrative and consistent across every lesson and the game,
 * so a child can change one thing and see exactly what it does. It is not a model of
 * any real car or race.
 */
export type Tyre='soft'|'medium'|'hard'|'inter'|'wet'
export type TyreInfo={name:string;letter:string;color:string;pace:number;wear:number;life:number;kid:string;shoe:string}
export const TYRES:Record<Tyre,TyreInfo>={
  soft:{name:'Soft',letter:'S',color:'#ff3b30',pace:0,wear:.1,life:14,kid:'Super grippy and fast — but wears out quickly.',shoe:'Sprint spikes'},
  medium:{name:'Medium',letter:'M',color:'#ffd60a',pace:.5,wear:.06,life:24,kid:'A bit of both: quite fast, lasts a while.',shoe:'Running trainers'},
  hard:{name:'Hard',letter:'H',color:'#f4f4f0',pace:1,wear:.035,life:36,kid:'Slower at first, but lasts a very long time.',shoe:'Hiking boots'},
  inter:{name:'Intermediate',letter:'I',color:'#34c759',pace:4,wear:.05,life:30,kid:'Shallow grooves push away a little water.',shoe:'Wellies'},
  wet:{name:'Wet',letter:'W',color:'#0a84ff',pace:7,wear:.04,life:30,kid:'Deep grooves for heavy rain.',shoe:'Diving fins'},
}
export const DRY_TYRES:Tyre[]=['soft','medium','hard']
export const BASE_LAP=90
export const PIT_LOSS=20
export const SAFETY_CAR_PIT_LOSS=10
export const SAFETY_CAR_LAP=110

/** Lap time in seconds on a tyre of a given age (laps) at a track wetness from 0 (dry) to 1 (soaked). */
export function lapTime(tyre:Tyre,age:number,wetness=0){
  const t=TYRES[tyre],over=Math.max(0,age-t.life)
  let time=BASE_LAP+t.pace+t.wear*age+.28*over**1.22
  if(DRY_TYRES.includes(tyre))time+=wetness*16
  else if(tyre==='inter')time+=Math.abs(wetness-.45)*9-.4*(1-Math.abs(wetness-.45))
  else time+=(1-wetness)*10-wetness*2.5
  return Math.round(time*1000)/1000
}
/** Remaining grip as a percentage for kid-friendly bars: 100 when new, 0 at the "cliff". */
export function grip(tyre:Tyre,age:number){
  const t=TYRES[tyre]
  return Math.max(0,Math.round(100-age/t.life*75-Math.max(0,age-t.life)*6))
}
export const fastestTyre=(wetness:number):Tyre=>(['soft','medium','hard','inter','wet'] as Tyre[]).reduce((best,t)=>lapTime(t,0,wetness)<lapTime(best,0,wetness)?t:best,'soft')

/** Lesson: does a pit stop pay for itself? */
export function pitPayback(oldTyre:Tyre,oldAge:number,newTyre:Tyre,lapsLeft:number,pitLoss=PIT_LOSS){
  let stay=0,stop=pitLoss
  for(let k=0;k<lapsLeft;k++){stay+=lapTime(oldTyre,oldAge+k);stop+=lapTime(newTyre,k)}
  const gained=stay-(stop-pitLoss)
  return {gained:Math.round(gained*10)/10,lost:pitLoss,worth:gained>pitLoss,perLap:Math.round((lapTime(oldTyre,oldAge)-lapTime(newTyre,0))*10)/10}
}

/**
 * Lesson: the undercut. You start `gapBefore` seconds behind a rival; both are on old
 * mediums. You pit one lap earlier. Returns the gap after each lap (positive = behind).
 */
export function undercutScenario(gapBefore:number,tyreAge=20,pitLap=3,laps=7){
  const you:number[]=[],rival:number[]=[],gaps:number[]=[]
  let a=gapBefore,b=0
  for(let lap=1;lap<=laps;lap++){
    const youFresh=lap>pitLap,rivalFresh=lap>pitLap+1
    a+=youFresh?lapTime('medium',lap-pitLap-1):lapTime('medium',tyreAge+lap)
    b+=rivalFresh?lapTime('medium',lap-pitLap-2):lapTime('medium',tyreAge+lap)
    if(lap===pitLap)a+=PIT_LOSS
    if(lap===pitLap+1)b+=PIT_LOSS
    you.push(a);rival.push(b);gaps.push(Math.round((a-b)*100)/100)
  }
  return {gaps,worked:gaps.at(-1)!<0,you,rival}
}

export type Stint={tyre:Tyre;laps:number}
export type PlanResult={time:number;legal:boolean;issue:string|null;stops:number;laps:{lap:number;tyre:Tyre;age:number;time:number}[]}
/** Lesson: build a race plan. Dry races need at least two different dry tyres. */
export function evaluatePlan(stints:Stint[],raceLaps:number):PlanResult{
  const laps:PlanResult['laps']=[]
  let time=0
  stints.forEach((stint,i)=>{
    if(i>0)time+=PIT_LOSS
    for(let age=0;age<stint.laps;age++){const t=lapTime(stint.tyre,age);time+=t;laps.push({lap:laps.length+1,tyre:stint.tyre,age,time:t})}
  })
  const total=stints.reduce((n,s)=>n+s.laps,0),kinds=new Set(stints.map(s=>s.tyre))
  const issue=total!==raceLaps?`Your plan covers ${total} laps, but the race is ${raceLaps} laps.`:kinds.size<2?'Rule: in a dry race you must use at least two different tyre types.':null
  return {time:Math.round(time*1000)/1000,legal:!issue,issue,stops:stints.length-1,laps}
}
/** The best legal one- or two-stop plan, found by trying every option (stints of 3+ laps). */
export function bestPlan(raceLaps:number){
  let best:{stints:Stint[];time:number}|null=null
  const consider=(stints:Stint[])=>{const r=evaluatePlan(stints,raceLaps);if(r.legal&&(!best||r.time<best.time))best={stints,time:r.time}}
  for(const a of DRY_TYRES)for(const b of DRY_TYRES){
    for(let x=3;x<=raceLaps-3;x++)consider([{tyre:a,laps:x},{tyre:b,laps:raceLaps-x}])
    for(const c of DRY_TYRES)for(let x=3;x<=raceLaps-6;x+=1)for(let y=3;x+y<=raceLaps-3;y+=1)consider([{tyre:a,laps:x},{tyre:b,laps:y},{tyre:c,laps:raceLaps-x-y}])
  }
  return best!
}

/** Stadium-shaped track used by the lesson animations: point and heading at a fraction of the lap. */
export const STADIUM={cx:310,cy:160,straight:360,radius:108}
export function stadiumPoint(fraction:number,offset=0){
  const {cx,cy,straight,radius}=STADIUM,r=radius+offset,arc=Math.PI*r,perimeter=2*straight+2*arc
  let s=((fraction%1)+1)%1*perimeter
  // Lap starts mid-way along the bottom (main) straight, running right-to-left, clockwise on screen.
  const half=straight/2
  if(s<half)return {x:cx-s,y:cy+r,angle:Math.PI}
  s-=half
  if(s<arc){const a=Math.PI/2+s/r;return {x:cx-half+Math.cos(a)*r,y:cy+Math.sin(a)*r,angle:a+Math.PI/2}}
  s-=arc
  if(s<straight)return {x:cx-half+s,y:cy-r,angle:0}
  s-=straight
  if(s<arc){const a=-Math.PI/2+s/r;return {x:cx+half+Math.cos(a)*r,y:cy+Math.sin(a)*r,angle:a+Math.PI/2}}
  s-=arc
  return {x:cx+half-s,y:cy+r,angle:Math.PI}
}
export function stadiumPath(offset=0){
  const {cx,cy,straight,radius}=STADIUM,r=radius+offset,half=straight/2
  return `M${cx-half} ${cy-r}H${cx+half}A${r} ${r} 0 0 1 ${cx+half} ${cy+r}H${cx-half}A${r} ${r} 0 0 1 ${cx-half} ${cy-r}Z`
}

/** Where a car is during an animated race: completed laps plus the fraction of the current lap. */
export function progressAt(lapTimes:number[],elapsed:number){
  let t=0
  for(let i=0;i<lapTimes.length;i++){if(t+lapTimes[i]>elapsed)return i+(elapsed-t)/lapTimes[i];t+=lapTimes[i]}
  return lapTimes.length
}

// ————— "Be the Race Engineer" game —————
export type GameCar={id:string;name:string;color:string;player?:boolean;plan:{lap:number;tyre:Tyre}[];start:Tyre;skill:number;reactsToSafetyCar:boolean}
export type GameState={lap:number;laps:number;cars:{id:string;tyre:Tyre;age:number;time:number;lapTimes:number[];stops:{lap:number;from:Tyre;to:Tyre;cheap:boolean}[];used:Set<Tyre>;cliffLaps:number}[];safetyCar:number[];log:string[]}
export const GAME_LAPS=24
/** Rivals with sensible, different strategies. */
export function gameRivals():GameCar[]{
  return [
    {id:'vel',name:'Velocity',color:'#64d2ff',start:'medium',plan:[{lap:13,tyre:'hard'}],skill:.12,reactsToSafetyCar:true},
    {id:'nor',name:'Northwind',color:'#ff9f0a',start:'soft',plan:[{lap:8,tyre:'medium'},{lap:17,tyre:'soft'}],skill:.16,reactsToSafetyCar:false},
    {id:'car',name:'Carbonix',color:'#bf5af2',start:'hard',plan:[{lap:16,tyre:'soft'}],skill:.22,reactsToSafetyCar:false},
    {id:'zen',name:'Zenith',color:'#30d158',start:'medium',plan:[{lap:10,tyre:'hard'}],skill:.26,reactsToSafetyCar:true},
  ]
}
/** A seeded safety car spell, two laps long, somewhere in the middle of the race. */
export function gameSafetyCar(seed:number){const lap=8+Math.abs(Math.floor(Math.sin(seed*12.9898)*43758.5453))%8;return [lap,lap+1]}

export function newGame(playerStart:Tyre,seed:number):GameState{
  const cars=[{id:'you',start:playerStart},...gameRivals()].map(c=>({id:c.id,tyre:c.start,age:0,time:0,lapTimes:[] as number[],stops:[] as GameState['cars'][number]['stops'],used:new Set<Tyre>([c.start]),cliffLaps:0}))
  // Grid gaps: the player starts in the middle of the pack.
  const grid=[.9,0,.3,1.4,.6]
  cars.forEach((c,i)=>{c.time=grid[i]})
  return {lap:0,laps:GAME_LAPS,cars,safetyCar:gameSafetyCar(seed),log:[]}
}
/** Advance one lap. `playerBox` is the tyre the player asked for at the end of this lap, if any. */
export function stepGame(state:GameState,playerBox:Tyre|null):GameState{
  const lap=state.lap+1,sc=state.safetyCar.includes(lap),rivals=gameRivals()
  const log=[...state.log]
  const cars=state.cars.map(car=>{
    const rival=rivals.find(r=>r.id===car.id)
    let tyre=car.tyre,age=car.age
    const base=sc?SAFETY_CAR_LAP:lapTime(tyre,age)+(rival?.skill??0)
    let lapTimeValue=base
    const cliff=!sc&&age>TYRES[tyre].life
    // Pit at the end of the lap: rivals follow their plan, and also stop under a safety car if due within 4 laps.
    let next:Tyre|null=null
    if(car.id==='you')next=playerBox
    else if(rival){
      // The plan advances by stops made, so an early safety-car stop replaces the planned one.
      const due=rival.plan[car.stops.length]
      if(due&&(due.lap===lap||(sc&&rival.reactsToSafetyCar&&due.lap>lap&&due.lap-lap<=4)))next=due.tyre
    }
    const stops=[...car.stops]
    if(next&&lap<state.laps){
      lapTimeValue+=sc?SAFETY_CAR_PIT_LOSS:PIT_LOSS
      stops.push({lap,from:tyre,to:next,cheap:sc});tyre=next;age=-1
      if(car.id==='you')log.push(sc?`Lap ${lap}: You boxed under the safety car — the stop cost only ${SAFETY_CAR_PIT_LOSS} s!`:`Lap ${lap}: You boxed for ${TYRES[next].name} tyres (−${PIT_LOSS} s in the pit lane).`)
    }
    const used=new Set(car.used);used.add(tyre)
    return {...car,tyre,age:age+1,time:car.time+lapTimeValue,lapTimes:[...car.lapTimes,lapTimeValue],stops,used,cliffLaps:car.cliffLaps+(cliff?1:0)}
  })
  // Behind the safety car the field bunches up: gaps shrink to about a second.
  if(sc){
    const order=[...cars].sort((a,b)=>a.time-b.time)
    // Keep each car's lap times consistent with its total so animations show the bunching.
    order.forEach((c,i)=>{if(i>0){const closed=Math.min(c.time,order[i-1].time+1);c.lapTimes[c.lapTimes.length-1]-=c.time-closed;c.time=closed}})
    if(!state.safetyCar.includes(lap-1))log.push(`Lap ${lap}: 🚨 Safety car! Everyone slows down and the gaps close up.`)
  }
  return {...state,lap,cars,log}
}
export type GameResult={position:number;legal:boolean;order:string[];tips:string[]}
export function gameResult(state:GameState):GameResult{
  // A car that never used two different dry tyres is classified last.
  const ranked=[...state.cars].sort((a,b)=>{const la=a.used.size>=2,lb=b.used.size>=2;return la===lb?a.time-b.time:la?-1:1})
  const me=state.cars.find(c=>c.id==='you')!,legal=me.used.size>=2,tips:string[]=[]
  if(!legal)tips.push('You only used one type of tyre. The rules say you must use two different types in a dry race, so you were moved to last.')
  if(me.cliffLaps>0)tips.push(`Your tyres were worn out ("off the cliff") for ${me.cliffLaps} lap${me.cliffLaps>1?'s':''}. Worn tyres are much slower — try stopping a little earlier.`)
  if(me.stops.some(s=>s.cheap))tips.push('Great call: you pitted under the safety car, when a stop costs half as much time.')
  else if(state.safetyCar[0]<=state.laps&&me.stops.length)tips.push(`A safety car came out on lap ${state.safetyCar[0]}. Pitting then would have cost only ${SAFETY_CAR_PIT_LOSS} s instead of ${PIT_LOSS} s.`)
  if(me.stops.length>2)tips.push('Each stop costs time in the pit lane. More than two stops is usually too many in a short race.')
  if(legal&&!me.cliffLaps&&me.stops.length<=2&&!tips.length)tips.push('Clean race: legal tyres, no worn-out laps. That is how race engineers think!')
  return {position:ranked.findIndex(c=>c.id==='you')+1,legal,order:ranked.map(c=>c.id),tips}
}
