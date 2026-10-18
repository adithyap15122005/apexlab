/** Reproducible, rate-limited 2021–2025 Grand Prix archive.
 * node scripts/ingest-archive.mjs [--metadata-only] [--year 2024]
 * Raw provider responses stay outside the Git checkout. No invented trajectories.
 */
import fs from 'node:fs/promises'
import path from 'node:path'
import {fileURLToPath} from 'node:url'
import {createHash} from 'node:crypto'
import {providerSlot} from './history-provider.mjs'

const appRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const publicRoot = path.join(appRoot, 'public', 'history')
const cacheRoot = path.join(appRoot, '..', 'historical-ingestion', 'archive')
await fs.mkdir(cacheRoot, {recursive: true})
await fs.mkdir(publicRoot, {recursive: true})
const years = [2021, 2022, 2023, 2024, 2025]
const selectedYear = Number(process.argv[process.argv.indexOf('--year') + 1])
const metadataOnly = process.argv.includes('--metadata-only')
const lastRequest = {jolpica: 0, openf1: 0, f1: 0}
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms))
const sources = []
const headers = {'User-Agent': 'ApexLabArchive/2.0 (noncommercial educational historical analysis)'}
const sourceFile = path.join(cacheRoot, 'sources.json')
try { sources.push(...JSON.parse(await fs.readFile(sourceFile, 'utf8'))) } catch {}
async function download(name, url, optional = false) {
  const destination = path.join(cacheRoot, `${name}.json`)
  try { return JSON.parse(await fs.readFile(destination, 'utf8')) } catch {}
  const provider = url.includes('jolpi.ca') ? 'jolpica' : url.includes('openf1.org') ? 'openf1' : 'f1'
  const spacing = provider === 'openf1' ? 2200 : provider === 'jolpica' ? 400 : 500
  for (let attempt = 0; attempt < 7; attempt++) {
    await sleep(Math.max(0, spacing - (Date.now() - lastRequest[provider])))
    await providerSlot(provider)
    lastRequest[provider] = Date.now()
    try {
      const response = await fetch(url, {headers, signal: AbortSignal.timeout(180000)})
      if (response.status === 429 || response.status >= 500) {
        const retry = Number(response.headers.get('retry-after'))
        console.log(JSON.stringify({retry: name, status: response.status, attempt}))
        await sleep(Number.isFinite(retry) && retry > 0 ? retry * 1000 : 6000 * (attempt + 1))
        continue
      }
      if (!response.ok) { if (optional) return null; throw new Error(`${name}: HTTP ${response.status}`) }
      const body = await response.text(), data = JSON.parse(body)
      await fs.writeFile(destination, body)
      const source = {name, url, retrievedAt: new Date().toISOString(), bytes: Buffer.byteLength(body), sha256: createHash('sha256').update(body).digest('hex')}
      const existing = sources.findIndex(row => row.name === name)
      if (existing >= 0) sources.splice(existing, 1)
      sources.push(source)
      await fs.writeFile(sourceFile, JSON.stringify(sources, null, 2))
      console.log(JSON.stringify({downloaded: name, bytes: source.bytes}))
      return data
    } catch (error) { if (attempt === 6) { if (optional) return null; throw error } await sleep(2000 * (attempt + 1)) }
  }
  if (optional) return null
  throw new Error(`${name}: provider retries exhausted`)
}
const num = value => value == null || value === '' || !Number.isFinite(Number(value)) ? null : Number(value)
const round = value => Math.round(value * 1000) / 1000
const slug = value => value.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/ grand prix$/, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
const teamColors = {red_bull:'#3671c6',mercedes:'#27f4d2',ferrari:'#e8002d',mclaren:'#ff8000',aston_martin:'#229971',alpine:'#ff87bc',alphatauri:'#5e8faa',rb:'#6692ff',williams:'#64c4ff',haas:'#b6babd',alfa:'#9b2226',sauber:'#52e252',racing_point:'#f596c8',renault:'#fff500'}
const dataSources = [
  {label:'Jolpica: historical race calendar, results, grid and classification',url:'https://github.com/jolpica/jolpica-f1',license:'CC BY-NC-SA 4.0; https://github.com/jolpica/jolpica-f1/blob/main/TERMS.md'},
  {label:'OpenF1: recorded 2023–2025 timing, tyres, pits and race control where available',url:'https://openf1.org/docs/',license:'CC BY-NC-SA 4.0; educational, noncommercial analysis. Provider availability applies.'},
]
const officialRaces = []
for (const year of years) {
  const collected = new Map()
  let offset = 0, total = Infinity
  while (offset < total) {
    const data = await download(`results-${year}-${offset}`, `https://api.jolpi.ca/ergast/f1/${year}/results.json?limit=100&offset=${offset}`)
    total = Number(data.MRData.total)
    for (const race of data.MRData.RaceTable.Races) {
      const existing = collected.get(race.round)
      if (existing) existing.Results.push(...race.Results)
      else collected.set(race.round, race)
    }
    offset += Number(data.MRData.limit)
  }
  officialRaces.push(...collected.values())
}
const sessionRows = []
for (const year of [2023, 2024, 2025]) sessionRows.push(...await download(`sessions-${year}`, `https://api.openf1.org/v1/sessions?year=${year}&session_name=Race`))
const snapshots = new Map(), entries = []
for (const official of officialRaces) {
  const year = Number(official.season), raceRound = Number(official.round), id = `${year}-${slug(official.raceName)}`
  const session = sessionRows.find(row => row.date_start.slice(0, 10) === official.date && !row.is_cancelled) ?? sessionRows.filter(row=>row.year===year&&!row.is_cancelled&&Math.abs(Date.parse(row.date_start)-Date.parse(`${official.date}T${official.time??'00:00:00Z'}`))<36*3600000).sort((a,b)=>Math.abs(Date.parse(a.date_start)-Date.parse(official.date))-Math.abs(Date.parse(b.date_start)-Date.parse(official.date)))[0]
  const winner = official.Results.find(result => result.position === '1') ?? official.Results[0]
  const startEpochMs = Date.parse(`${official.date}T${official.time ?? '00:00:00Z'}`)
  const winnerTime = num(winner?.Time?.millis) == null ? null : num(winner.Time.millis) / 1000
  const drivers = official.Results.map(result => ({
    number: Number(result.number), code: result.Driver.code ?? result.Driver.familyName.slice(0, 3).toUpperCase(),
    name: `${result.Driver.givenName} ${result.Driver.familyName}`, team: result.Constructor.name,
    color: teamColors[result.Constructor.constructorId] ?? '#a2adba', grid: num(result.grid), finishPosition: num(result.position),
    classifiedLaps: num(result.laps), resultTime: num(result.Time?.millis) == null ? null : num(result.Time.millis) / 1000,
    status: result.status, driverId: result.Driver.driverId, constructorId: result.Constructor.constructorId,
  }))
  const laps = Math.max(...drivers.map(driver => driver.classifiedLaps ?? 0), 1)
  const duration = Math.max(winnerTime ?? 0, ...drivers.map(driver => driver.resultTime ?? 0), 1)
  const locations = {}, lapRows = {}, positions = {}, intervals = {}
  drivers.forEach(driver => { locations[driver.number] = []; lapRows[driver.number] = []; intervals[driver.number] = []; positions[driver.number] = [...(driver.grid && driver.grid <= drivers.length ? [[0, driver.grid]] : []), [duration, driver.finishPosition]] })
  const entry = {id, year, round:raceRound, name:official.raceName,circuit:official.Circuit.circuitName,location:official.Circuit.Location.locality,country:official.Circuit.Location.country,date:official.date,laps,winner:winner ? `${winner.Driver.givenName} ${winner.Driver.familyName}` : 'Unavailable',winnerCode:winner?.Driver.code ?? '',sessionKey:session?.session_key ?? null,mode:'timing',snapshotUrl:`/history/${id}/race.json`,notes:['Verified entry list, grid and final classification. Location-based 3D is only enabled when an actual recorded positional snapshot is bundled.']}
  const snapshot = {schemaVersion:1,meta:{id,year,round:raceRound,name:entry.name,circuit:entry.circuit,location:entry.location,country:entry.country,date:entry.date,sessionKey:entry.sessionKey ?? 0,laps,startEpochMs,duration,winner:entry.winner,replayMode:'timing'},drivers,laps:lapRows,locations,positions,intervals,stints:[],pits:[],events:[],weather:[],track:{points:[],length:0,description:'No recorded positional circuit trace bundled for this archive entry. No substitute driving trajectory is generated.'},telemetryFiles:{},sources:[...dataSources,{label:`Jolpica ${year} round ${raceRound}: complete results`,url:`https://api.jolpi.ca/ergast/f1/${year}/${raceRound}/results.json?limit=100`,license:'CC BY-NC-SA 4.0; provider terms apply.'}],coverage:{sampleInterval:1,maxInterpolationGap:3,locationSamples:0,notes:[...entry.notes,'Calendar race time is scheduled UTC; a replay origin is only established when a recorded session-start record is available. Final classification is distinct from live position updates.','Lap times, compounds, intervals and positional telemetry are shown only when separately available. Results are never converted into invented car trajectories.']}}
  entries.push(entry); snapshots.set(id, snapshot)
}
async function writeArchive() {
  for (const entry of entries) {
    const destination = path.join(publicRoot, entry.id, 'race.json')
    // Never overwrite a richer positional snapshot during catalog regeneration.
    let existing
    try { existing = JSON.parse(await fs.readFile(destination, 'utf8')) } catch {}
    if (existing?.coverage?.locationSamples > 0) {
      entry.mode = 'recorded-3d'; entry.notes = ['Full recorded-location 3D replay, historical timing and real race events. Approximate provider coordinates; see source notes.']
      try{const provenancePath=path.join(path.dirname(destination),'provenance.json'),provenance=JSON.parse(await fs.readFile(provenancePath,'utf8')),body=await fs.readFile(destination,'utf8');provenance.raceSha256=createHash('sha256').update(body).digest('hex');provenance.raceBytes=Buffer.byteLength(body);provenance.archiveMetadataManifest='/history/archive-provenance.json';await fs.writeFile(provenancePath,JSON.stringify(provenance,null,2))}catch{}
      continue
    }
    const score=value=>(value?.events?.length??0)+(value?.pits?.length??0)+Object.values(value?.laps??{}).reduce((sum,rows)=>sum+rows.length,0)
    if(existing&&score(existing)>score(snapshots.get(entry.id))){if(existing.meta.sessionKey!==(entry.sessionKey??0)){existing.meta.sessionKey=entry.sessionKey??0;await fs.writeFile(destination,JSON.stringify(existing))}snapshots.set(entry.id,existing);continue}
    await fs.mkdir(path.dirname(destination), {recursive:true})
    await fs.writeFile(destination, JSON.stringify(snapshots.get(entry.id)))
  }
  const archive = {schemaVersion:1,seasons:years,races:entries.sort((a,b)=>b.year-a.year||a.round-b.round),generatedAt:new Date().toISOString(),sources:dataSources}
  await fs.writeFile(path.join(publicRoot,'archive.json'),JSON.stringify(archive))
  await fs.writeFile(path.join(publicRoot,'archive-provenance.json'),JSON.stringify({generatedAt:new Date().toISOString(),raceCount:entries.length,sourceResponses:sources},null,2))
  console.log(JSON.stringify({archive:entries.length,recorded3D:entries.filter(entry=>entry.mode==='recorded-3d').length,years}))
}
await writeArchive()
if (!metadataOnly) {
  const priority = ['2025-italian', '2023-singapore', '2024-monaco']
  const orderedEntries = entries.filter(entry => !selectedYear || entry.year === selectedYear).sort((a,b) => {const ai=priority.indexOf(a.id),bi=priority.indexOf(b.id);return (ai<0?100:ai)-(bi<0?100:bi)})
  for (const entry of orderedEntries) {
    if (entry.mode === 'recorded-3d') {
      const file=path.join(publicRoot,entry.id,'race.json'),recording=JSON.parse(await fs.readFile(file,'utf8'))
      if(entry.sessionKey&&!Object.values(recording.intervals).some(rows=>rows.length)){
        const raw=await download(`intervals-${entry.sessionKey}`,`https://api.openf1.org/v1/intervals?session_key=${entry.sessionKey}`,true)
        const seconds=date=>round((Date.parse(date)-recording.meta.startEpochMs)/1000)
        for(const driver of recording.drivers)recording.intervals[driver.number]=(raw??[]).filter(row=>row.driver_number===driver.number&&seconds(row.date)>=-60&&seconds(row.date)<=recording.meta.duration).sort((a,b)=>seconds(a.date)-seconds(b.date)).map(row=>({time:seconds(row.date),gap:row.gap_to_leader??null,interval:row.interval??null}))
        await fs.writeFile(file,JSON.stringify(recording))
      }
      continue
    }
    const race = snapshots.get(entry.id)
    if (entry.sessionKey) {
      const key = entry.sessionKey
      const rawLaps = await download(`laps-${key}`,`https://api.openf1.org/v1/laps?session_key=${key}`,true)
      const control = await download(`race_control-${key}`,`https://api.openf1.org/v1/race_control?session_key=${key}`,true)
      const origin = control?.find(row => row.message === 'SESSION STARTED')
      if (origin) {
        race.meta.startEpochMs = Date.parse(origin.date)
        const seconds = date => date == null ? null : round((Date.parse(date)-race.meta.startEpochMs)/1000)
        for (const driver of race.drivers) race.laps[driver.number] = (rawLaps ?? []).filter(row=>row.driver_number===driver.number).sort((a,b)=>a.lap_number-b.lap_number).map(row => { const start=seconds(row.date_start),duration=num(row.lap_duration);return {lap:row.lap_number,start,end:start!==null&&duration!==null?round(start+duration):null,duration,sector1:num(row.duration_sector_1),sector2:num(row.duration_sector_2),sector3:num(row.duration_sector_3)} })
        for(const driver of race.drivers)if(/disqual/i.test(driver.status)&&driver.classifiedLaps===0)driver.recordedLaps=Math.max(0,...race.laps[driver.number].filter(lap=>lap.lap<=race.meta.laps&&lap.end!==null).map(lap=>lap.lap))
        race.meta.duration = Math.max(race.meta.duration,...race.drivers.flatMap(driver=>(race.laps[driver.number]??[]).filter(lap=>lap.lap<=(driver.recordedLaps??driver.classifiedLaps??0)).map(lap=>lap.end??0)))
        race.events = (control??[]).filter(row=>seconds(row.date)>=0&&seconds(row.date)<=race.meta.duration).map((row,i)=>({id:`rc-${i}`,time:seconds(row.date),lap:num(row.lap_number),driver:num(row.driver_number),type:row.message==='SESSION STARTED'?'start':row.flag==='CHEQUERED'||row.message==='SESSION FINISHED'?'finish':'race-control',title:row.flag?`${row.flag.replaceAll('_',' ')} flag`:'Race control',message:row.message,...(row.flag?{flag:row.flag}:{})}))
        const rawPits = await download(`pit-${key}`,`https://api.openf1.org/v1/pit?session_key=${key}`,true)
        const rawStints = await download(`stints-${key}`,`https://api.openf1.org/v1/stints?session_key=${key}`,true)
        const rawPositions = await download(`position-${key}`,`https://api.openf1.org/v1/position?session_key=${key}`,true)
        const rawIntervals = await download(`intervals-${key}`,`https://api.openf1.org/v1/intervals?session_key=${key}`,true)
        race.stints = (rawStints??[]).map(row=>({driver:row.driver_number,stint:row.stint_number,lapStart:row.lap_start,lapEnd:row.lap_end,compound:row.compound??'UNKNOWN',tyreAgeAtStart:num(row.tyre_age_at_start)}))
        race.pits = (rawPits??[]).map(row=>({driver:row.driver_number,lap:row.lap_number,time:round(seconds(row.date)-(row.lane_duration??row.pit_duration??0)),duration:num(row.lane_duration??row.pit_duration),stationary:num(row.stop_duration)})).sort((a,b)=>a.time-b.time)
        if(!race.pits.length){
          const fallback=await download(`pits-${entry.year}-${entry.round}`,`https://api.jolpi.ca/ergast/f1/${entry.year}/${entry.round}/pitstops.json?limit=100`,true)
          const rows=fallback?.MRData?.RaceTable?.Races?.[0]?.PitStops??[]
          const origin=new Date(race.meta.startEpochMs),midnight=Date.UTC(origin.getUTCFullYear(),origin.getUTCMonth(),origin.getUTCDate())
          race.pits=rows.flatMap(row=>{const driver=race.drivers.find(driver=>driver.driverId===row.driverId);if(!driver)return [];const [hour,minute,second]=row.time.split(':').map(Number);return [{driver:driver.number,lap:Number(row.lap),time:Math.max(0,round((midnight+(hour*3600+minute*60+second)*1000-race.meta.startEpochMs)/1000)),duration:num(row.duration),stationary:null}]}).sort((a,b)=>a.time-b.time)
          if(rows.length)race.coverage.notes.push('OpenF1 did not supply pit rows for this session. Pit lap, UTC timing message and reported duration use Jolpica instead, aligned to the recorded OpenF1 race origin. The pit clock has whole-second precision; stationary service time remains unavailable.')
        }
        for (const driver of race.drivers) race.positions[driver.number]=(rawPositions??[]).filter(row=>row.driver_number===driver.number&&seconds(row.date)<=race.meta.duration).sort((a,b)=>seconds(a.date)-seconds(b.date)).map(row=>[seconds(row.date),row.position])
        for (const driver of race.drivers) race.intervals[driver.number]=(rawIntervals??[]).filter(row=>row.driver_number===driver.number&&seconds(row.date)>=-60&&seconds(row.date)<=race.meta.duration).sort((a,b)=>seconds(a.date)-seconds(b.date)).map(row=>({time:seconds(row.date),gap:row.gap_to_leader??null,interval:row.interval??null}))
        const incomplete=race.drivers.filter(driver=>(race.laps[driver.number]??[]).filter(lap=>lap.lap<=(driver.classifiedLaps??0)&&lap.duration!==null).length<(driver.classifiedLaps??0))
        race.coverage.notes.push('Lap start/duration/sectors, position updates, stints, pits and race control are recorded OpenF1 data. Pit entry time is inferred as message timestamp minus recorded pit-lane duration, not an exact crossing time. Stationary service duration remains null when the provider did not supply it.','No coordinates or car telemetry are bundled for this timing-only entry. Replay cameras require a separate full recorded-location snapshot.',...incomplete.length?[`Some lap timing rows are missing for ${incomplete.map(driver=>driver.code).join(', ')}. Missing lap starts/durations/sectors are unavailable; recorded positions and classification remain separate sources.`]:[])
        for (let i=0;i<race.pits.length;i++) {const pit=race.pits[i];race.events.push({id:`pit-${i}`,time:pit.time,lap:pit.lap,driver:pit.driver,type:'pit',title:`${race.drivers.find(driver=>driver.number===pit.driver)?.code??pit.driver} · pit stop`,message:`Lap ${pit.lap}. Reported lane duration ${pit.duration??'unavailable'}s. Entry timestamp inferred from the provider message; stationary duration ${pit.stationary??'unavailable'}.`})}
        race.events.sort((a,b)=>a.time-b.time)
      }
    } else {
      const data=await download(`pits-${entry.year}-${entry.round}`,`https://api.jolpi.ca/ergast/f1/${entry.year}/${entry.round}/pitstops.json?limit=100`,true)
      const rows=data?.MRData?.RaceTable?.Races?.[0]?.PitStops??[]
      const origin=new Date(race.meta.startEpochMs),midnight=Date.UTC(origin.getUTCFullYear(),origin.getUTCMonth(),origin.getUTCDate())
      race.pits=rows.flatMap(row=>{const driver=race.drivers.find(driver=>driver.driverId===row.driverId);if(!driver)return [];const [hour,minute,second]=row.time.split(':').map(Number);return [{driver:driver.number,lap:Number(row.lap),time:Math.max(0,round((midnight+(hour*3600+minute*60+second)*1000-race.meta.startEpochMs)/1000)),duration:num(row.duration),stationary:null}]})
      race.coverage.notes.push('Jolpica pit-stop lap and reported duration are available. The displayed pit clock uses its reported UTC message against the scheduled start, so delayed/restarted races do not have an exact replay clock. No lap trajectories, tyre compounds or stationary stop times are invented.')
      race.events=race.pits.map((pit,i)=>({id:`pit-${i}`,time:pit.time,lap:pit.lap,driver:pit.driver,type:'pit',title:`${race.drivers.find(driver=>driver.number===pit.driver)?.code??pit.driver} · pit stop`,message:`Recorded lap ${pit.lap}, reported pit duration ${pit.duration??'unavailable'}s. Clock relative to scheduled start; exact race clock and stationary duration unavailable.`})).sort((a,b)=>a.time-b.time)
      const winner=race.drivers.find(driver=>driver.finishPosition===1)
      if(winner){
        const lapData=await download(`winner-laps-${entry.year}-${entry.round}`,`https://api.jolpi.ca/ergast/f1/${entry.year}/${entry.round}/drivers/${winner.driverId}/laps.json?limit=100`,true)
        const rows=lapData?.MRData?.RaceTable?.Races?.[0]?.Laps??[]
        let cumulative=0
        race.laps[winner.number]=rows.flatMap(row=>{const timing=row.Timings?.find(timing=>timing.driverId===winner.driverId);if(!timing?.time)return [];const parts=timing.time.split(':').map(Number),duration=parts.length===2?parts[0]*60+parts[1]:parts[0];if(!Number.isFinite(duration))return [];const start=cumulative;cumulative=round(cumulative+duration);return [{lap:Number(row.number),start,end:cumulative,duration,sector1:null,sector2:null,sector3:null}]})
        race.coverage.notes.push(`Recorded ${winner.code} lap durations are bundled from Jolpica. Their elapsed start/end clocks are derived cumulative lap durations, not original timestamped telemetry; only this driver's lap chart is supported for this entry. Other driver lap series and tyre compounds remain unavailable. Red-flag suspension and missing lap records may prevent this derived clock from matching official elapsed classification time.`)
      }
    }
    await fs.writeFile(path.join(publicRoot,entry.id,'race.json'),JSON.stringify(race))
    console.log(JSON.stringify({normalized:entry.id,laps:Object.values(race.laps).reduce((sum,rows)=>sum+rows.length,0),pits:race.pits.length}))
  }
  await writeArchive()
}
