/** Historical provider samples. All times are seconds from the recorded race start. */
export type HistoricalCompound = 'SOFT'|'MEDIUM'|'HARD'|'INTERMEDIATE'|'WET'|'UNKNOWN'|string
export type LocationSample = [time:number,x:number,y:number,z:number]
export type TelemetrySample = [time:number,speed:number|null,throttle:number|null,brake:number|null,gear:number|null,rpm:number|null,drs:number|null]
export type HistoricalDriver = {number:number;code:string;name:string;team:string;color:string;grid:number|null;finishPosition:number|null;classifiedLaps:number|null;recordedLaps?:number;resultTime:number|null;status:string}
export type HistoricalLap = {lap:number;start:number|null;end:number|null;duration:number|null;sector1:number|null;sector2:number|null;sector3:number|null}
export type HistoricalStint = {driver:number;stint:number;lapStart:number;lapEnd:number;compound:HistoricalCompound;tyreAgeAtStart:number|null}
export type HistoricalPit = {driver:number;lap:number;time:number;duration:number|null;stationary:number|null}
export type HistoricalEvent = {id:string;time:number;lap:number|null;driver:number|null;type:'pit'|'race-control'|'start'|'finish'|'weather';title:string;message:string;flag?:string}
export type HistoricalInterval = {time:number;gap:number|string|null;interval:number|string|null}
export type HistoricalRace = {
  schemaVersion:1
  meta:{id:string;year:number;round:number;name:string;circuit:string;location:string;country:string;date:string;sessionKey:number;laps:number;startEpochMs:number;duration:number;winner:string}
  drivers:HistoricalDriver[]
  laps:Record<number,HistoricalLap[]>
  locations:Record<number,LocationSample[]>
  positions:Record<number,[time:number,position:number][]>
  intervals:Record<number,HistoricalInterval[]>
  stints:HistoricalStint[]
  pits:HistoricalPit[]
  events:HistoricalEvent[]
  weather:{time:number;airTemp:number|null;trackTemp:number|null;rainfall:number|null}[]
  track:{points:[x:number,y:number,z:number][];pitLane?:[x:number,y:number,z:number][];length:number;description:string}
  telemetryFiles:Record<number,string>
  sources:{label:string;url:string;license:string}[]
  coverage:{sampleInterval:number;maxInterpolationGap:number;locationSamples:number;notes:string[]}
}
export type RecordedPosition = {x:number;y:number;z:number;heading:number;status:'recorded'|'interpolated'|'gap'|'unavailable'|'finished';sampleTime:number|null;gapSeconds:number|null}
export type DriverRaceState = {driver:HistoricalDriver;lap:number;completedLaps:number;position:number|null;gap:number|string|null;interval:number|string|null;compound:HistoricalCompound;tyreAge:number|null;lastLap:HistoricalLap|null;currentLap:HistoricalLap|null;pit:HistoricalPit|null;retired:boolean;finished:boolean;location:RecordedPosition}
export type CameraMode='helicopter'|'trackside'|'strategist'|'onboard'|'tcam'|'chase'|'top'|'overview'
export type ReplayClock={current:number;playing:boolean;speed:number}
export type WhatIfSettings={driver:number;pitIndex:number;pitLap:number;compound:HistoricalCompound;degradation:number;pitLoss:number;traffic:number}
export type WhatIfResult={valid:boolean;issues:string[];actualTime:number|null;hypotheticalTime:number|null;delta:number;pitDelta:number;paceDelta:number;position:number|null;actualPosition:number|null;historicalPit:HistoricalPit|null;lapDeltas:{lap:number;delta:number;actual:number|null;hypothetical:number|null}[];explanation:string;assumptions:string[]}
export const HISTORICAL_COMPOUNDS:Record<string,{letter:string;color:string;name:string}>={SOFT:{letter:'S',color:'#ff6559',name:'Soft'},MEDIUM:{letter:'M',color:'#f2dc5c',name:'Medium'},HARD:{letter:'H',color:'#f2f1ec',name:'Hard'},INTERMEDIATE:{letter:'I',color:'#72d28b',name:'Intermediate'},WET:{letter:'W',color:'#6da9ff',name:'Wet'},UNKNOWN:{letter:'?',color:'#9199a5',name:'Unknown'}}
export function historicalCompound(compound:string){return HISTORICAL_COMPOUNDS[compound.toUpperCase()]??HISTORICAL_COMPOUNDS.UNKNOWN}
