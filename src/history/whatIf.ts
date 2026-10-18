import type { HistoricalCompound, HistoricalLap, HistoricalPit, HistoricalRace, HistoricalStint, WhatIfResult, WhatIfSettings } from './types'

const DRY=new Set(['SOFT','MEDIUM','HARD'])
const BASE_PIT_LOSS=22
const round=(number:number)=>Math.round(number*1000)/1000
const median=(values:number[])=>{if(!values.length)return null;const sorted=[...values].sort((a,b)=>a-b),middle=sorted.length>>>1;return sorted.length%2?sorted[middle]:(sorted[middle-1]+sorted[middle])/2}
const driverPits=(race:HistoricalRace,driver:number)=>race.pits.filter(pit=>pit.driver===driver).sort((a,b)=>a.time-b.time)
const stintAt=(race:HistoricalRace,driver:number,lap:number)=>race.stints.find(stint=>stint.driver===driver&&stint.lapStart<=lap&&lap<=stint.lapEnd)
const nextStint=(race:HistoricalRace,pit:HistoricalPit)=>race.stints.filter(stint=>stint.driver===pit.driver&&stint.lapStart>pit.lap).sort((a,b)=>a.lapStart-b.lapStart)[0]
const validDuration=(lap:HistoricalLap):lap is HistoricalLap&{duration:number}=>lap.duration!=null&&Number.isFinite(lap.duration)&&lap.duration>0
function isClean(race:HistoricalRace,driver:number,lap:HistoricalLap,stint?:HistoricalStint){
  return validDuration(lap)&&!!stint&&lap.lap>stint.lapStart+1&&!driverPits(race,driver).some(pit=>Math.abs(pit.lap-lap.lap)<=1)
}

function calibrate(race:HistoricalRace,driver:number,pit:HistoricalPit){
  const after=nextStint(race,pit)
  const compound=after?.compound??'UNKNOWN'
  const laps=race.laps[driver]??[]
  const slopes:number[]=[]
  for(let index=1;index<laps.length;index++){
    const previous=laps[index-1],current=laps[index]
    if(after&&previous.lap>=after.lapStart&&current.lap<=after.lapEnd&&current.lap===previous.lap+1&&isClean(race,driver,previous,after)&&isClean(race,driver,current,after)&&validDuration(previous)&&validDuration(current))slopes.push(current.duration-previous.duration)
  }
  // The observed slope also contains fuel, weather and race-management effects.
  // Negative slopes are clamped to zero; this is an editable scenario assumption.
  const slope=round(Math.max(0,Math.min(.3,median(slopes)??.05)))
  const offsets:Record<string,number>={}
  const counts:Record<string,number>={}
  for(const name of DRY){
    const nearby:number[]=[],all:number[]=[]
    for(let lap=1;lap<=race.meta.laps;lap++){
      const observations=race.drivers.flatMap(item=>{
        const sample=(race.laps[item.number]??[]).find(sample=>sample.lap===lap)
        const stint=stintAt(race,item.number,lap)
        return sample&&stint&&DRY.has(stint.compound)&&isClean(race,item.number,sample,stint)&&validDuration(sample)?[{compound:stint.compound,time:sample.duration}]:[]
      })
      if(new Set(observations.map(item=>item.compound)).size<2)continue
      const common=median(observations.map(item=>item.time))!
      const selected=median(observations.filter(item=>item.compound===name).map(item=>item.time))
      if(selected==null)continue
      all.push(selected-common)
      if(after&&lap>=after.lapStart+2&&lap<=after.lapEnd)nearby.push(selected-common)
    }
    const used=nearby.length>=3?nearby:all
    const value=median(used)
    if(value!=null){offsets[name]=value;counts[name]=used.length}
  }
  const baseOffset=offsets[compound]??0
  for(const name of Object.keys(offsets))offsets[name]-=baseOffset
  offsets[compound]=0
  const before=stintAt(race,driver,pit.lap)
  const wetTimes=laps.filter(lap=>lap.lap>=pit.lap-4&&lap.lap<=pit.lap-1&&validDuration(lap)).map(lap=>lap.duration!)
  const dryTimes=laps.filter(lap=>after&&lap.lap>=after.lapStart+2&&lap.lap<=after.lapStart+5&&validDuration(lap)).map(lap=>lap.duration!)
  const transitionCost=median(wetTimes)!=null&&median(dryTimes)!=null?Math.max(0,median(wetTimes)!-median(dryTimes)!):0
  if(before&&!DRY.has(before.compound))offsets[before.compound]=transitionCost
  return {after,before,slope,offsets,counts,slopeSamples:slopes.length,transitionCost}
}

/** 0-based pit index within this driver's chronological recorded stops. */
export function defaultWhatIfSettings(race:HistoricalRace,driver:number,pitIndex?:number):WhatIfSettings {
  const pits=driverPits(race,driver)
  const lastDry=pits.map((pit,index)=>({pit,index})).filter(({pit})=>DRY.has(nextStint(race,pit)?.compound??'')).at(-1)?.index
  const index=pitIndex??lastDry??Math.max(0,pits.length-1)
  const pit=pits[index]
  if(!pit)return {driver,pitIndex:index,pitLap:1,compound:'MEDIUM',degradation:.05,pitLoss:BASE_PIT_LOSS,traffic:0}
  const fit=calibrate(race,driver,pit)
  return {driver,pitIndex:index,pitLap:pit.lap,compound:fit.after?.compound??'MEDIUM',degradation:fit.slope,pitLoss:BASE_PIT_LOSS,traffic:0}
}

export function simulateHistoricalWhatIf(race:HistoricalRace,settings:WhatIfSettings):WhatIfResult {
  const driver=race.drivers.find(driver=>driver.number===settings.driver)
  const pits=driverPits(race,settings.driver)
  const historicalPit=pits[settings.pitIndex]??null
  const issues:string[]=[]
  if(!driver)issues.push('Select a driver from this recorded race.')
  if(!Number.isInteger(settings.pitIndex)||!historicalPit)issues.push('Select one of this driver’s recorded pit stops.')
  if(driver&&(driver.classifiedLaps!==race.meta.laps||driver.resultTime==null||/retir|DNF|DNS|disqual|DSQ/i.test(driver.status)))issues.push('A finish-time estimate is available only for recorded full-distance finishers; lapped, retired and non-starting drivers are not assigned a hypothetical finish position.')
  if(!DRY.has(settings.compound))issues.push('This local model supports soft, medium and hard slicks only. It cannot predict intermediate or wet-tyre performance.')
  if(!Number.isFinite(settings.degradation)||settings.degradation<0||settings.degradation>1)issues.push('Wear cost must be between 0 and 1 second per tyre-age lap.')
  if(!Number.isFinite(settings.pitLoss)||settings.pitLoss<0||settings.pitLoss>120)issues.push('Assumed net pit loss must be between 0 and 120 seconds.')
  if(!Number.isFinite(settings.traffic)||settings.traffic<0||settings.traffic>30)issues.push('Assumed rejoin traffic must be between 0 and 30 seconds.')
  if(historicalPit){
    const previous=pits[settings.pitIndex-1]?.lap??0,next=pits[settings.pitIndex+1]?.lap??race.meta.laps
    if(!Number.isInteger(settings.pitLap)||Math.abs(settings.pitLap-historicalPit.lap)>3||settings.pitLap<=previous||settings.pitLap>=next)issues.push('Move this stop by at most three laps and keep it strictly between the neighbouring stops or race boundaries.')
  }
  const empty:WhatIfResult={valid:false,issues,actualTime:driver?.resultTime??null,hypotheticalTime:null,delta:0,pitDelta:0,paceDelta:0,position:null,actualPosition:driver?.finishPosition??null,historicalPit,lapDeltas:[],explanation:issues.join(' '),assumptions:[]}
  if(issues.length||!driver||!historicalPit)return empty
  const fit=calibrate(race,driver.number,historicalPit)
  if(!fit.after||!DRY.has(fit.after.compound))return {...empty,issues:['Choose a recorded stop whose following stint uses dry tyres. Wet-phase tyre swaps are outside this model.']}
  if(fit.offsets[settings.compound]==null)return {...empty,issues:[`The snapshot does not contain enough clean, lap-matched ${settings.compound.toLowerCase()} observations to calibrate this compound.`]}
  const nextPit=pits[settings.pitIndex+1]?.lap??race.meta.laps
  const startLap=Math.min(settings.pitLap,historicalPit.lap)+1
  const oldPitLap=(race.laps[driver.number]??[]).find(lap=>lap.lap===historicalPit.lap)
  const laneDuration=historicalPit.duration
  const inlapShare=laneDuration!=null&&laneDuration>0&&oldPitLap?.end!=null?Math.max(0,Math.min(1,(oldPitLap.end-historicalPit.time)/laneDuration)):1
  const pitCostAt=(lap:number,pitLap:number,cost:number)=>lap===pitLap?cost*inlapShare:lap===pitLap+1?cost*(1-inlapShare):0
  const lapDeltas=(race.laps[driver.number]??[]).filter(lap=>lap.lap<=race.meta.laps).map(lap=>{
    let paceDelta=0
    if(lap.lap>=startLap&&lap.lap<=nextPit){
      const baseline=stintAt(race,driver.number,lap.lap)
      let hypothetical:HistoricalCompound,age:number
      if(lap.lap>settings.pitLap){hypothetical=settings.compound;age=lap.lap-settings.pitLap}
      else {hypothetical=fit.before?.compound??baseline?.compound??fit.after!.compound;age=(fit.before?.tyreAgeAtStart??0)+lap.lap-(fit.before?.lapStart??1)+1}
      const actualAge=baseline?(baseline.tyreAgeAtStart??0)+lap.lap-baseline.lapStart+1:1
      const baseCompound=baseline?.compound??fit.after!.compound
      const actualWear=DRY.has(baseCompound)?fit.slope*Math.max(0,actualAge-1):0
      const candidateWear=DRY.has(hypothetical)?(lap.lap>settings.pitLap?settings.degradation:fit.slope)*Math.max(0,age-1):0
      paceDelta=(fit.offsets[hypothetical]??0)+candidateWear-(fit.offsets[baseCompound]??0)-actualWear
    }
    const pitDelta=pitCostAt(lap.lap,settings.pitLap,settings.pitLoss)-pitCostAt(lap.lap,historicalPit.lap,BASE_PIT_LOSS)
    const traffic=lap.lap===settings.pitLap+1?settings.traffic:0
    const delta=round(paceDelta+pitDelta+traffic)
    return {lap:lap.lap,delta,actual:lap.duration,hypothetical:lap.duration==null?null:round(lap.duration+delta)}
  })
  const delta=round(lapDeltas.reduce((total,lap)=>total+lap.delta,0))
  const pitDelta=round(settings.pitLoss-BASE_PIT_LOSS)
  const paceDelta=round(delta-pitDelta)
  const hypotheticalTime=round(driver.resultTime!+delta)
  const fixedRivals=race.drivers.filter(item=>item.number!==driver.number&&item.classifiedLaps===race.meta.laps&&item.resultTime!=null&&!/retir|DNF|DNS|disqual|DSQ/i.test(item.status))
  const position=1+fixedRivals.filter(item=>item.resultTime!<hypotheticalTime).length
  const changedTransition=fit.before&&!DRY.has(fit.before.compound)&&settings.pitLap!==historicalPit.lap
  const assumptions=[
    'This is a deterministic local counterfactual, not a reconstruction of an unrun race. The recorded replay, laps and results remain unchanged.',
    `The total is anchored to the official classification time (${driver.resultTime!.toFixed(3)}s). Timestamp-derived OpenF1 lap ends and lap sums can differ from that official total.`,
    `Baseline net pit loss is an explicit ${BASE_PIT_LOSS.toFixed(1)}s assumption; the candidate uses ${settings.pitLoss.toFixed(1)}s. Recorded lane duration (${historicalPit.duration?.toFixed(1)??'unknown'}s) is not net time lost, and stationary service time is unavailable.`,
    `Initial wear cost ${fit.slope.toFixed(3)}s per tyre-age lap uses the median of ${fit.slopeSamples} clean consecutive observed lap changes, clamped to 0–0.300. It also contains fuel, track evolution and driver effects; the candidate wear setting is ${settings.degradation.toFixed(3)}s.`,
    `Compound offsets use medians of clean observations matched by race lap (${settings.compound}: ${fit.counts[settings.compound]??0} matched laps), preferring the selected dry stint's phase and falling back to other recorded dry laps. Driver differences remain a calibration limitation. Pit laps, adjacent laps and first two stint laps are excluded.`,
    'Other pit stops, race conditions, rivals, incidents and historical lap-to-lap variation stay fixed. Rejoin traffic is a user-assumed total penalty applied once after the selected stop.',
    'The comparison rank uses only recorded full-distance finishers with fixed actual classification times. It does not simulate overtaking, defend track position, reclassify lapped cars, or predict a real finishing position.',
    'Stop-cost deltas are split between the pit lap and following lap using recorded lane overlap; this is an accounting assumption, not measured on-track time loss.',
  ]
  if(changedTransition)assumptions.push(`Moving this wet-to-dry crossover assumes slick-usable conditions on the moved laps. A ${fit.transitionCost.toFixed(3)}s wet/dry-window difference is inferred from nearby observed laps; it includes changing track conditions and is especially uncertain. No weather, grip or aquaplaning prediction is made.`)
  if(fit.slopeSamples<2)assumptions.push('Too few clean consecutive laps were available to fit wear; the initial 0.050s wear coefficient is an explicit fallback assumption.')
  return {valid:true,issues:[],actualTime:driver.resultTime,hypotheticalTime,delta,pitDelta,paceDelta,position,actualPosition:driver.finishPosition,historicalPit,lapDeltas,explanation:`Moving the recorded lap-${historicalPit.lap} stop to lap ${settings.pitLap} on ${settings.compound.toLowerCase()} changes the anchored total by ${delta>=0?'+':''}${delta.toFixed(3)}s: ${pitDelta>=0?'+':''}${pitDelta.toFixed(3)}s assumed pit loss and ${paceDelta>=0?'+':''}${paceDelta.toFixed(3)}s running-pace and traffic effects. ${delta===0?'The original settings reproduce the actual baseline.':'Historical rivals retain their actual race times.'}${changedTransition?' This crossover timing requires the stated dry-track assumption.':''}`,assumptions}
}
