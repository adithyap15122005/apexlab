import type { DriverRaceState, HistoricalEvent, HistoricalLap, HistoricalRace, LocationSample, RecordedPosition, TelemetrySample } from './types'

/** Index of the latest recorded value at or before time. Never selects a future record. */
function atOrBefore<T>(values:T[], time:number, timestamp:(value:T)=>number):number {
  let low=0,high=values.length-1,result=-1
  while(low<=high){const middle=(low+high)>>>1;if(timestamp(values[middle])<=time){result=middle;low=middle+1}else high=middle-1}
  return result
}
const missingPosition=(status:'gap'|'unavailable',sampleTime:number|null=null,gapSeconds:number|null=null):RecordedPosition=>({x:NaN,y:NaN,z:NaN,heading:0,status,sampleTime,gapSeconds})

function recordedHeading(samples:LocationSample[],index:number,maxGap:number):number {
  const current=samples[index]
  for(const otherIndex of [index+1,index-1]){
    const other=samples[otherIndex]
    if(!other||Math.abs(other[0]-current[0])>maxGap||other[0]===current[0])continue
    const first=otherIndex<index?other:current,second=otherIndex<index?current:other
    const dx=second[1]-first[1],dy=second[2]-first[2]
    if(dx!==0||dy!==0)return Math.atan2(dy,dx)
  }
  // Orientation is unavailable without a valid neighbouring trajectory sample.
  // Zero is an orientation default only; it never creates a position.
  return 0
}

/** Raw provider X/Y are the horizontal plane. Z remains the recorded vertical axis. */
export function sampleLocation(samples:LocationSample[],time:number,maxGap=3):RecordedPosition {
  if(!samples.length||!Number.isFinite(time)||!Number.isFinite(maxGap)||maxGap<0)return missingPosition('unavailable')
  const index=atOrBefore(samples,time,s=>s[0])
  if(index<0)return missingPosition('unavailable',samples[0][0],samples[0][0]-time)
  const left=samples[index]
  if(left[0]===time)return {x:left[1],y:left[2],z:left[3],heading:recordedHeading(samples,index,maxGap),status:'recorded',sampleTime:left[0],gapSeconds:0}
  const right=samples[index+1]
  if(!right)return missingPosition('unavailable',left[0],time-left[0])
  const span=right[0]-left[0]
  if(span<=0||span>maxGap)return missingPosition('gap',left[0],span)
  const fraction=(time-left[0])/span
  const dx=right[1]-left[1],dy=right[2]-left[2]
  return {x:left[1]+dx*fraction,y:left[2]+dy*fraction,z:left[3]+(right[3]-left[3])*fraction,heading:dx===0&&dy===0?recordedHeading(samples,index,maxGap):Math.atan2(dy,dx),status:'interpolated',sampleTime:left[0],gapSeconds:span}
}

export type RecordedTelemetry={time:number;speed:number|null;throttle:number|null;brake:number|null;gear:number|null;rpm:number|null;drs:number|null;sampleAge:number}
/** Nearest recorded sample, without synthesising speed, gear, brake or DRS values. */
export function sampleTelemetry(samples:TelemetrySample[],time:number):RecordedTelemetry|null {
  if(!samples.length||!Number.isFinite(time))return null
  const before=atOrBefore(samples,time,s=>s[0])
  let index=Math.max(0,before)
  if(before>=0&&samples[before+1]&&samples[before+1][0]-time<time-samples[before][0])index=before+1
  const [sampleTime,speed,throttle,brake,gear,rpm,drs]=samples[index]
  return {time:sampleTime,speed,throttle,brake,gear,rpm,drs,sampleAge:Math.abs(time-sampleTime)}
}

function competitiveLaps(race:HistoricalRace,number:number):HistoricalLap[] {
  const driver=race.drivers.find(driver=>driver.number===number)
  return (race.laps[number]??[]).filter(lap=>driver?.classifiedLaps==null||lap.lap<=driver.classifiedLaps)
}
const didNotStart=(status:string)=>/\bDNS\b|did not start|not started|withdrawn before/i.test(status)
const didRetire=(status:string)=>/\bDNF\b|retir|not finish|collision|accident|engine|mechanical|disqual|\bDSQ\b/i.test(status)

/** All classification, lap timing, interval and position values remain provider records. */
export function getDriverState(race:HistoricalRace,number:number,time:number):DriverRaceState {
  const driver=race.drivers.find(driver=>driver.number===number)
  if(!driver)throw new Error(`Driver ${number} is not in this recorded race.`)
  const clock=Number.isFinite(time)?Math.max(0,time):0
  const laps=competitiveLaps(race,number)
  const started=laps.filter(lap=>lap.start!=null&&lap.start<=clock)
  const completed=laps.filter(lap=>lap.end!=null&&lap.end<=clock&&lap.start!=null)
  const latest=started.at(-1)??null
  const finalEnd=laps.reduce<number|null>((last,lap)=>lap.end!=null&&lap.start!=null?Math.max(last??-Infinity,lap.end):last,null)
  const dns=didNotStart(driver.status)||driver.classifiedLaps===0
  const retirement=didRetire(driver.status)
  const reachedEnd=finalEnd!=null&&clock>=finalEnd
  const retired=!dns&&retirement&&reachedEnd
  const finished=!dns&&!retirement&&reachedEnd&&laps.length>0
  const currentLap=!dns&&!finished&&!retired&&latest&&(latest.end==null||clock<latest.end)?latest:null
  const completedLaps=dns?0:completed.reduce((largest,lap)=>Math.max(largest,lap.lap),0)
  const lap=dns?0:currentLap?.lap??latest?.lap??0
  const lastLap=completed.at(-1)??null
  const stint=race.stints.filter(stint=>stint.driver===number&&stint.lapStart<=Math.max(1,lap)&&stint.lapEnd>=Math.max(1,lap)).at(-1)
  const positions=race.positions[number]??[]
  const positionIndex=atOrBefore(positions,clock,entry=>entry[0])
  const intervals=race.intervals[number]??[]
  const intervalIndex=atOrBefore(intervals,clock,entry=>entry.time)
  const interval=intervals[intervalIndex]
  const pit=race.pits.find(pit=>pit.driver===number&&pit.duration!=null&&pit.time<=clock&&clock<pit.time+pit.duration)||null
  const locations=race.locations[number]??[]
  let location=sampleLocation(locations,clock,race.coverage.maxInterpolationGap)
  if(dns||retired)location=missingPosition('unavailable')
  else if(finished&&finalEnd!=null){
    const lastIndex=atOrBefore(locations,finalEnd,sample=>sample[0])
    if(lastIndex>=0&&finalEnd-locations[lastIndex][0]<=race.coverage.maxInterpolationGap){
      location={...sampleLocation(locations,locations[lastIndex][0],race.coverage.maxInterpolationGap),status:'finished'}
    }else location=missingPosition('unavailable',lastIndex>=0?locations[lastIndex][0]:null)
  }
  return {driver,lap,completedLaps,position:dns||positionIndex<0?null:positions[positionIndex][1],gap:interval?.gap??null,interval:interval?.interval??null,compound:stint?.compound??'UNKNOWN',tyreAge:stint&&stint.tyreAgeAtStart!=null&&!dns&&lap>=stint.lapStart?stint.tyreAgeAtStart+lap-stint.lapStart+1:null,lastLap,currentLap,pit:dns||retired||finished?null:pit,retired,finished,location}
}

export function getStandings(race:HistoricalRace,time:number):DriverRaceState[] {
  return race.drivers.map(driver=>getDriverState(race,driver.number,time)).sort((a,b)=>(a.position??Infinity)-(b.position??Infinity)||a.driver.number-b.driver.number)
}

function referenceDriver(race:HistoricalRace){return race.drivers.find(driver=>driver.finishPosition===1)??race.drivers[0]}
export function getRaceLap(race:HistoricalRace,time:number):number {
  const driver=referenceDriver(race)
  return driver?getDriverState(race,driver.number,time).lap:0
}

/** A seek timestamp, not a lap duration. Missing lap starts use the nearest recorded start. */
export function getLapTime(race:HistoricalRace,lap:number,driver?:number):number {
  const number=driver??referenceDriver(race)?.number
  const starts=(race.laps[number]??[]).filter((item):item is HistoricalLap&{start:number}=>item.start!=null&&Number.isFinite(item.start))
  if(!starts.length)return 0
  const requested=Number.isFinite(lap)?lap:1
  return starts.reduce((nearest,item)=>Math.abs(item.lap-requested)<Math.abs(nearest.lap-requested)?item:nearest,starts[0]).start
}

export function getActiveEvent(race:HistoricalRace,time:number):HistoricalEvent|null {
  if(!Number.isFinite(time))return null
  const index=atOrBefore(race.events,time,event=>event.time)
  return index<0?null:race.events[index]
}

export function formatRaceClock(seconds:number):string {
  if(!Number.isFinite(seconds))return '—'
  const whole=Math.floor(Math.max(0,seconds)),hours=Math.floor(whole/3600),minutes=Math.floor(whole%3600/60),remainder=whole%60
  return `${hours?`${hours}:`:''}${String(minutes).padStart(2,'0')}:${String(remainder).padStart(2,'0')}`
}
export function formatHistoricalGap(value:number|string|null|undefined):string {
  if(value==null||value==='')return '—'
  if(typeof value==='string')return value
  if(!Number.isFinite(value))return '—'
  return value===0?'LEADER':`${value>0?'+':'−'}${Math.abs(value).toFixed(3)}s`
}
