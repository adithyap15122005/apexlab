import type { HistoricalRace, TelemetrySample } from './types'

const races=new Map<string,Promise<HistoricalRace>>()
const telemetry=new Map<string,Promise<TelemetrySample[]>>()
const finite=(value:unknown):value is number=>typeof value==='number'&&Number.isFinite(value)
const record=(value:unknown):value is Record<string,unknown>=>!!value&&typeof value==='object'&&!Array.isArray(value)
const fail=(message:string):never=>{throw new Error(`Invalid recorded snapshot: ${message}`)}
function ordered<T>(values:T[],timestamp:(value:T)=>unknown,label:string){let previous=-Infinity;for(const value of values){const time=timestamp(value);if(!finite(time)||time<previous)fail(`${label} timestamps must be finite and ordered`);previous=time as number}}

export function validateHistoricalRace(value:unknown):HistoricalRace {
  if(!record(value)||value.schemaVersion!==1||!record(value.meta))fail('unsupported schema')
  const race=value as unknown as HistoricalRace
  if(!race.meta.id||!finite(race.meta.duration)||race.meta.duration<=0||!Number.isInteger(race.meta.laps)||race.meta.laps<1||!finite(race.meta.startEpochMs))fail('race clock metadata is missing')
  if(!Array.isArray(race.drivers)||!race.drivers.length||new Set(race.drivers.map(driver=>driver.number)).size!==race.drivers.length)fail('driver roster is missing or duplicated')
  for(const driver of race.drivers)if(!Number.isInteger(driver.number)||!driver.name||!driver.code||typeof driver.status!=='string')fail('invalid driver')
  for(const key of ['laps','locations','positions','intervals','telemetryFiles'] as const)if(!record(race[key]))fail(`missing ${key}`)
  for(const key of ['stints','pits','events','weather','sources'] as const)if(!Array.isArray(race[key]))fail(`missing ${key}`)
  if(!record(race.coverage)||!finite(race.coverage.maxInterpolationGap)||race.coverage.maxInterpolationGap<=0||!record(race.track)||!Array.isArray(race.track.points))fail('missing coverage or recorded track geometry')
  for(const driver of race.drivers){
    const locations=race.locations[driver.number]??[]
    if(!Array.isArray(locations)||locations.some(sample=>!Array.isArray(sample)||sample.length!==4||!sample.every(finite)))fail('location tuple must contain four finite numbers')
    ordered(locations,sample=>sample[0],`driver ${driver.number} location`)
    const positions=race.positions[driver.number]??[]
    if(!Array.isArray(positions)||positions.some(sample=>!Array.isArray(sample)||sample.length!==2||!Number.isInteger(sample[1])||sample[1]<1||sample[1]>race.drivers.length))fail('invalid recorded position')
    ordered(positions,sample=>sample[0],`driver ${driver.number} position`)
    const laps=race.laps[driver.number]??[]
    if(!Array.isArray(laps)||laps.some(lap=>!Number.isInteger(lap.lap)||lap.lap<1||![lap.start,lap.end,lap.duration].every(value=>value===null||finite(value))))fail('invalid recorded lap')
    ordered(laps,lap=>lap.lap,`driver ${driver.number} lap number`)
    const intervals=race.intervals[driver.number]??[]
    if(!Array.isArray(intervals))fail('invalid intervals')
    ordered(intervals,sample=>sample.time,`driver ${driver.number} interval`)
  }
  ordered(race.events,event=>event.time,'event')
  ordered(race.weather,sample=>sample.time,'weather')
  if(race.pits.some(pit=>!finite(pit.time)||![pit.duration,pit.stationary].every(value=>value===null||finite(value))))fail('invalid pit record')
  if(race.track.points.some(point=>!Array.isArray(point)||point.length!==3||!point.every(finite)))fail('invalid recorded track point')
  return race
}

export function validateTelemetry(value:unknown):TelemetrySample[] {
  if(!Array.isArray(value)||value.some(sample=>!Array.isArray(sample)||sample.length!==7||!finite(sample[0])||!sample.slice(1).every(value=>value===null||finite(value))))fail('telemetry needs recorded tuples [time,speed,throttle,brake,gear,rpm,drs]')
  const samples=value as TelemetrySample[]
  ordered(samples,sample=>sample[0],'telemetry')
  return samples
}

function withAbort<T>(promise:Promise<T>,signal?:AbortSignal):Promise<T>{
  if(!signal)return promise
  if(signal.aborted)return Promise.reject(new DOMException('Loading was cancelled.','AbortError'))
  return new Promise<T>((resolve,reject)=>{
    const abort=()=>{cleanup();reject(new DOMException('Loading was cancelled.','AbortError'))}
    const cleanup=()=>signal.removeEventListener('abort',abort)
    signal.addEventListener('abort',abort,{once:true})
    promise.then(value=>{cleanup();resolve(value)},error=>{cleanup();reject(error)})
  })
}
function cached<T>(cache:Map<string,Promise<T>>,key:string,load:()=>Promise<T>):Promise<T>{
  let promise=cache.get(key)
  if(!promise){promise=load();cache.set(key,promise);const pending=promise;void promise.catch(()=>{if(cache.get(key)===pending)cache.delete(key)})}
  return promise
}
async function json(url:string){const response=await fetch(url);if(!response.ok)throw new Error(`Could not load recorded data (${response.status}). Please retry.`);return response.json() as Promise<unknown>}

/** Caller cancellation does not abort or poison another view's shared snapshot request. */
export function loadHistoricalRace(id='2024-british',signal?:AbortSignal):Promise<HistoricalRace>{
  if(signal?.aborted)return Promise.reject(new DOMException('Loading was cancelled.','AbortError'))
  if(!/^[a-z0-9-]+$/i.test(id))return Promise.reject(new Error('Unknown recorded race identifier.'))
  return withAbort(cached(races,id,async()=>{const race=validateHistoricalRace(await json(`/history/${id}/race.json`));if(race.meta.id!==id)throw new Error('Recorded race identifier does not match its snapshot.');return race}),signal)
}
export function loadDriverTelemetry(race:HistoricalRace,driver:number,signal?:AbortSignal):Promise<TelemetrySample[]>{
  if(signal?.aborted)return Promise.reject(new DOMException('Loading was cancelled.','AbortError'))
  const file=race.telemetryFiles[driver]
  if(!file)return Promise.reject(new Error('No recorded telemetry file is available for this driver.'))
  const url=file.startsWith('/')?file:`/history/${race.meta.id}/${file}`
  if(!url.startsWith('/history/')||url.includes('..')||url.includes('://'))return Promise.reject(new Error('Telemetry must use the bundled recorded snapshot.'))
  return withAbort(cached(telemetry,url,async()=>validateTelemetry(await json(url))),signal)
}
