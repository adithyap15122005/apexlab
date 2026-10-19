import { getDriverState } from './replay'
import type { HistoricalRace } from './types'

/**
 * Pit stops prepared for display. Entry time and pit-lane duration are recorded; the
 * stationary time is recorded for most 2025 races and otherwise unknown. The moment the
 * car stood in its box is estimated from where its recorded positions moved least.
 */
export type PitStopPlan={
  driver:number;lap:number
  /** Recorded (approximate) pit-lane entry and exit, race seconds. */
  entry:number;exit:number;laneTime:number|null
  /** Recorded stationary time, when the provider supplied one. */
  stationary:number|null
  /** Seconds used to animate the tyre change: recorded, or a typical 2.5 s. */
  service:number
  /** Estimated middle of the stationary period. */
  stopAt:number
  from:string;to:string
  /** False for red-flag stoppages and other non-service pit-lane visits. */
  standard:boolean
  before:number|null;after:number|null
}
export const TYPICAL_SERVICE=2.5

/** Index of the slowest recorded movement between entry and exit (where the car stood in its box). */
function stillestMoment(race:HistoricalRace,driver:number,entry:number,exit:number){
  const samples=(race.locations[driver]??[]).filter(s=>s[0]>=entry-1&&s[0]<=exit+1)
  let best:number|null=null,bestSpeed=Infinity
  for(let i=1;i<samples.length;i++){
    const dt=samples[i][0]-samples[i-1][0]
    if(dt<=0||dt>3)continue
    const speed=Math.hypot(samples[i][1]-samples[i-1][1],samples[i][2]-samples[i-1][2])/dt
    // Prefer the middle of the lane when several samples are equally still.
    const middle=(samples[i][0]+samples[i-1][0])/2,bias=Math.abs(middle-(entry+exit)/2)*.01
    if(speed+bias<bestSpeed){bestSpeed=speed+bias;best=middle}
  }
  return best
}

export function planPitStops(race:HistoricalRace):PitStopPlan[]{
  return race.pits.map(pit=>{
    const laneTime=pit.duration,exit=pit.time+(laneTime??25)
    const stints=race.stints.filter(s=>s.driver===pit.driver).sort((a,b)=>a.lapStart-b.lapStart)
    const from=stints.filter(s=>s.lapStart<=pit.lap).at(-1)?.compound??'UNKNOWN'
    const to=stints.find(s=>s.lapStart>pit.lap)?.compound??from
    // A normal stop spends well under a minute in the lane; red flags park cars for many minutes.
    const standard=laneTime!=null&&laneTime>5&&laneTime<80
    const service=pit.stationary!=null&&pit.stationary>0&&pit.stationary<60?pit.stationary:TYPICAL_SERVICE
    const still=standard?stillestMoment(race,pit.driver,pit.time,exit):null
    const stopAt=Math.min(exit-service/2-1,Math.max(pit.time+service/2+1,still??(pit.time+exit)/2))
    const before=getDriverState(race,pit.driver,pit.time-4).position,after=getDriverState(race,pit.driver,exit+6).position
    return {driver:pit.driver,lap:pit.lap,entry:pit.time,exit,laneTime,stationary:pit.stationary,service,stopAt,from,to,standard,before,after}
  }).sort((a,b)=>a.entry-b.entry)
}

/** The stop to feature for `driver` at `time`: from just before pit entry until a few seconds after rejoining. */
export function featuredPitStop(plans:PitStopPlan[],driver:number,time:number){
  return plans.find(p=>p.standard&&p.driver===driver&&time>=p.entry-1&&time<=p.exit+6)??null
}

export type PitPhase='approach'|'service'|'release'
/** Where a stop is at `time`: approaching the box, being serviced (progress 0–1), or released. */
export function pitPhase(plan:PitStopPlan,time:number):{phase:PitPhase;progress:number}|null{
  if(!plan.standard||time<plan.entry-1||time>plan.exit+1)return null
  const start=plan.stopAt-plan.service/2
  if(time<start)return {phase:'approach',progress:0}
  if(time<=start+plan.service)return {phase:'service',progress:(time-start)/plan.service}
  return {phase:'release',progress:1}
}
/** 1 while the car stands in its box, easing in and out over ~1.2 s either side. */
export function boxWeight(plan:PitStopPlan,time:number){
  if(!plan.standard)return 0
  const start=plan.stopAt-plan.service/2,end=start+plan.service,ease=1.2
  const smooth=(a:number,b:number,v:number)=>{const t=Math.max(0,Math.min(1,(v-a)/(b-a)));return t*t*(3-2*t)}
  return smooth(start-ease,start,time)*(1-smooth(end,end+ease,time))
}
