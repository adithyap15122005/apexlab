import { getDriverState, isNonStarter } from './replay'
import { historicalCompound, type DriverRaceState, type HistoricalRace, type HistoricalStint } from './types'

/**
 * Plain-language strategy stories built only from recorded race data: broadcast-style
 * moments, a beginner "race coach", per-driver tyre stories and real undercut/overcut
 * battles. Wording is written for first-time fans, including children.
 */
export type StoryEvent={time:number;kind:'overtake'|'lost'|'lead'|'pit'|'fastest'|'final'|'finish';driver:number;tag:string;title:string;detail?:string}

const DRY=new Set(['SOFT','MEDIUM','HARD'])
const tyreName=(compound:string)=>historicalCompound(compound).name
const code=(race:HistoricalRace,n:number)=>race.drivers.find(d=>d.number===n)?.code??String(n)
export const lapClock=(seconds:number)=>`${Math.floor(seconds/60)}:${(seconds%60).toFixed(3).padStart(6,'0')}`
const stintsOf=(race:HistoricalRace,n:number)=>race.stints.filter(s=>s.driver===n).sort((a,b)=>a.lapStart-b.lapStart)
const raceStart=(race:HistoricalRace)=>{const winner=race.drivers.find(d=>d.finishPosition===1)??race.drivers[0];return race.laps[winner.number]?.find(l=>l.lap===1)?.start??0}

/** Recorded moments worth a broadcast graphic, for the followed driver and the whole race. */
export function raceStoryEvents(race:HistoricalRace,selected:number):StoryEvent[]{
  const events:StoryEvent[]=[],start=raceStart(race)+3,me=code(race,selected)
  // Followed driver's pit stops with the tyre change they made.
  const stints=stintsOf(race,selected)
  for(const pit of race.pits.filter(p=>p.driver===selected)){
    const before=stints.filter(s=>s.lapStart<=pit.lap).at(-1),after=stints.find(s=>s.lapStart>pit.lap)
    const change=before&&after?`${tyreName(before.compound)} → ${tyreName(after.compound)} tyres`:'tyre change'
    events.push({time:pit.time,kind:'pit',driver:selected,tag:'PIT STOP',title:`${me} pits · ${change}`,detail:`Lap ${pit.lap}${pit.duration!=null?` · ${pit.duration.toFixed(1)} s in the pit lane`:''}`})
  }
  // Position changes for the followed driver, and every change of leader.
  const holder=(position:number,time:number)=>race.drivers.find(d=>d.number!==selected&&getDriverState(race,d.number,time).position===position)
  const records=race.positions[selected]??[]
  for(let i=1;i<records.length;i++){
    const [time,position]=records[i],[,previous]=records[i-1]
    if(time<start||position===previous)continue
    if(position<previous){const passed=holder(previous,time+.5);events.push({time,kind:'overtake',driver:selected,tag:'POSITION GAINED',title:`${me} ▲ P${position}`,detail:passed?`moves ahead of ${passed.code}`:undefined})}
    else events.push({time,kind:'lost',driver:selected,tag:'POSITION LOST',title:`${me} ▼ P${position}`})
  }
  let leader:number|null=null
  const leads:[number,number][]=[]
  for(const d of race.drivers)for(const [time,position] of race.positions[d.number]??[])if(position===1)leads.push([time,d.number])
  leads.sort((a,b)=>a[0]-b[0])
  for(const [time,n] of leads){if(n!==leader&&leader!=null&&time>=start)events.push({time,kind:'lead',driver:n,tag:'NEW LEADER',title:`${code(race,n)} takes the lead`});leader=n}
  // Each new fastest lap of the race (from lap 3, to skip the opening scramble).
  const laps=race.drivers.flatMap(d=>(race.laps[d.number]??[]).filter(l=>l.lap>=3&&l.duration!=null&&l.end!=null).map(l=>({driver:d.number,end:l.end!,duration:l.duration!})))
  laps.sort((a,b)=>a.end-b.end)
  let best=Infinity
  for(const lap of laps)if(lap.duration<best-.0005){best=lap.duration;events.push({time:lap.end,kind:'fastest',driver:lap.driver,tag:'FASTEST LAP',title:`${code(race,lap.driver)} · ${lapClock(lap.duration)}`,detail:'Quickest lap of the race so far'})}
  const winner=race.drivers.find(d=>d.finishPosition===1)
  const finalLap=winner?race.laps[winner.number]?.find(l=>l.lap===race.meta.laps)?.start:null
  if(finalLap!=null)events.push({time:finalLap,kind:'final',driver:winner!.number,tag:'FINAL LAP',title:'Last lap!',detail:`${winner!.code} leads onto the final lap`})
  const chequered=race.events.find(e=>e.flag==='CHEQUERED')
  if(chequered&&winner)events.push({time:chequered.time,kind:'finish',driver:winner.number,tag:'CHEQUERED FLAG',title:`${winner.name} wins!`,detail:race.meta.name})
  return events.sort((a,b)=>a.time-b.time)
}

/** Typical working life used only for beginner hints, in laps. */
const TYPICAL_LIFE:Record<string,number>={SOFT:20,MEDIUM:30,HARD:40,INTERMEDIATE:30,WET:30}
export type CoachMessage={id:string;icon:string;topic:string;text:string;lesson?:string}
type CoachContext={status:string;drs:number|null;state?:DriverRaceState}

/** One short, friendly explanation of what matters most for the followed driver right now. */
export function coachMessage(race:HistoricalRace,selected:number,time:number,context:CoachContext):CoachMessage{
  const state=context.state??getDriverState(race,selected,time),me=state.driver.code,tyre=tyreName(state.compound)
  const rain=race.weather.filter(w=>w.time<=time).at(-1)?.rainfall===1
  const stints=stintsOf(race,selected),current=stints.find(s=>s.lapStart<=Math.max(1,state.lap)&&s.lapEnd>=Math.max(1,state.lap))
  if(state.retired)return {id:'retired',icon:'🛑',topic:'OUT OF THE RACE',text:`${me} has retired. Cars stop when something breaks or after a crash. Pick another driver to keep following the race!`}
  if(state.finished)return {id:'finished',icon:'🏁',topic:'FINISHED',text:`${me} has crossed the finish line in P${state.position??'—'}. Every lap of strategy led to this result.`}
  if(context.status==='red')return {id:'red',icon:'🟥',topic:'RED FLAG',text:'Red flag! The race is stopped because it is not safe to continue. Cars wait in the pit lane, and teams can change tyres for free.',lesson:'safety'}
  if(context.status==='sc')return {id:'sc',icon:'🚨',topic:'SAFETY CAR',text:'Safety car! Everyone must drive slowly behind it and nobody may overtake. Because the whole field is slow, a pit stop costs much less time now — watch who dives into the pits!',lesson:'safety'}
  if(context.status==='vsc')return {id:'vsc',icon:'🐢',topic:'VIRTUAL SAFETY CAR',text:'Virtual safety car: every driver must slow down to a set speed. A pit stop now loses less time than usual.',lesson:'safety'}
  if(state.pit)return {id:`pit-${state.pit.lap}`,icon:'🔧',topic:'PIT STOP',text:`${me} is in the pit lane! The crew changes all four tyres in about 2–3 seconds, but driving slowly through the pit lane costs around 20 seconds. Fresh tyres will make the next laps faster.`,lesson:'pit'}
  if(current&&stints.indexOf(current)>0&&state.lap-current.lapStart<2)return {id:`fresh-${current.stint}`,icon:'🆕',topic:'FRESH TYRES',text:`New ${tyre} tyres for ${me}! Fresh tyres grip better, so ${me} should now lap faster than cars on old, worn tyres.`,lesson:'undercut'}
  if(rain)return {id:'rain',icon:'🌧️',topic:'RAIN',text:state.compound==='INTERMEDIATE'||state.compound==='WET'?`It's wet, and ${me} is on grooved ${tyre} tyres — the grooves push water away like the tread on rain boots.`:`It's raining! Smooth "slick" tyres can't push water away, so they slide. Teams switch to green-striped Intermediate tyres when the track gets wet.`,lesson:'rain'}
  if(context.drs!=null&&context.drs>=10)return {id:'drs',icon:'💨',topic:'DRS OPEN',text:`DRS is open! A flap on ${me}'s rear wing lifts up to cut air resistance, so the car is faster on the straight. It's allowed only when you are within 1 second of the car ahead.`,lesson:'drs'}
  const interval=typeof state.interval==='number'?state.interval:null
  if(interval!=null&&state.position&&state.position>1&&interval<1){
    const ahead=race.drivers.find(d=>getDriverState(race,d.number,time).position===state.position!-1)
    return {id:'battle',icon:'⚔️',topic:'BATTLE',text:`Battle! ${me} is only ${interval.toFixed(1)} s behind ${ahead?.code??'the car ahead'}. Within 1 second, ${me} can use DRS to attack on the straights.`,lesson:'drs'}
  }
  if(state.tyreAge!=null&&DRY.has(state.compound)&&state.tyreAge>=(TYPICAL_LIFE[state.compound]??30))return {id:'worn',icon:'🧽',topic:'OLD TYRES',text:`${me}'s ${tyre} tyres are ${state.tyreAge} laps old. Like worn-out shoes, they have less grip now, so each lap gets a little slower. A pit stop may be coming soon.`,lesson:'tyres'}
  if(state.position===1)return {id:'leading',icon:'🏆',topic:'LEADING',text:`${me} is leading the race! Having no car in front means clean air: the car's wings work better and the tyres stay cooler.`}
  return {id:`default-${state.compound}`,icon:'🛞',topic:'TYRES',text:`${me} is P${state.position??'—'} on ${tyre} tyres${state.tyreAge!=null?` that are ${state.tyreAge} laps old`:''}. Softs are fast but wear out quickly; Hards are slower but last much longer.`,lesson:'tyres'}
}

/** The followed driver's race told as a short tyre story. */
export function strategyStory(race:HistoricalRace,driver:number){
  const d=race.drivers.find(x=>x.number===driver)
  const stints=stintsOf(race,driver)
  if(!d||isNonStarter(d.status)||!stints.length)return {headline:`${d?.name??'This driver'} did not take part in the race.`,steps:[] as {stint:HistoricalStint;text:string}[]}
  const stops=stints.length-1,redFlag=race.events.some(e=>e.flag==='RED')
  const steps=stints.map((stint,i)=>{
    const laps=stint.lapEnd-stint.lapStart+1,name=tyreName(stint.compound),lapsText=`${laps} lap${laps===1?'':'s'}`
    const why=!DRY.has(stint.compound)?' because the track was wet':i===0?'':stint.compound==='SOFT'&&laps<15?' for a short, fast finish':stint.compound==='HARD'?' to make it to the end without another stop':''
    const text=i===0?`Started on ${name} tyres and ran ${lapsText}.`:stint.lapStart<=2&&redFlag?`Swapped to ${name} tyres while the race was stopped by a red flag, then ran ${lapsText}.`:`Stopped on lap ${stint.lapStart-1} for ${name} tyres${why}, then ran ${lapsText}.`
    return {stint,text}
  })
  const result=d.finishPosition?`finished P${d.finishPosition}`:`did not finish (${d.status})`
  return {headline:`${d.name} used ${stints.length} set${stints.length===1?'':'s'} of tyres (${stops} change${stops===1?'':'s'}) and ${result}.`,steps}
}

export type StrategyBattle={kind:'undercut'|'overcut'|'weather';first:number;second:number;firstLap:number;secondLap:number;time:number;before:[number,number];after:[number,number];text:string}
/**
 * Real undercut and overcut battles: two adjacent cars that pitted within four laps of
 * each other, and how their order changed once both stops had cycled through.
 */
export function strategyBattles(race:HistoricalRace,limit=6):StrategyBattle[]{
  const battles:StrategyBattle[]=[]
  const pos=(n:number,t:number)=>getDriverState(race,n,t).position
  for(const a of race.pits)for(const b of race.pits){
    if(a.driver===b.driver||b.lap-a.lap<1||b.lap-a.lap>4||a.duration==null||b.duration==null)continue
    const before=a.time-6,after=b.time+b.duration+75
    const pa=pos(a.driver,before),pb=pos(b.driver,before),qa=pos(a.driver,after),qb=pos(b.driver,after)
    if(pa==null||pb==null||qa==null||qb==null||Math.abs(pa-pb)!==1)continue
    if(getDriverState(race,a.driver,after).retired||getDriverState(race,b.driver,after).retired)continue
    // A rain call is a different story from a dry-tyre pit duel.
    const changeTo=(n:number,lap:number)=>stintsOf(race,n).find(s=>s.lapStart>lap)?.compound??''
    const weather=!DRY.has(changeTo(a.driver,a.lap))||!DRY.has(changeTo(b.driver,b.lap))
    const A=code(race,a.driver),B=code(race,b.driver)
    let kind:StrategyBattle['kind']|null=null,text=''
    if(pa>pb&&qa<qb){kind=weather?'weather':'undercut';text=weather?`${A} switched tyres for the changing weather ${b.lap-a.lap} lap${b.lap-a.lap>1?'s':''} before ${B} and jumped ahead.`:`${A} was behind ${B}, pitted ${b.lap-a.lap} lap${b.lap-a.lap>1?'s':''} earlier, used the fresh tyres to go faster — and came out ahead. The undercut worked!`}
    else if(pa<pb&&qa>qb){kind=weather?'weather':'overcut';text=weather?`${B} waited longer to change tyres in the changing weather and moved ahead of ${A}.`:`${B} stayed out ${b.lap-a.lap} lap${b.lap-a.lap>1?'s':''} longer than ${A}, kept pushing on older tyres, and came out ahead. The overcut worked!`}
    if(kind)battles.push({kind,first:a.driver,second:b.driver,firstLap:a.lap,secondLap:b.lap,time:a.time-20,before:[pa,pb],after:[qa,qb],text})
  }
  const seen=new Set<string>()
  return battles.sort((x,y)=>Math.min(...x.before)-Math.min(...y.before)||x.time-y.time).filter(b=>{const key=[b.first,b.second].sort().join('-');if(seen.has(key))return false;seen.add(key);return true}).slice(0,limit)
}
