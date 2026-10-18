/** Enrich a bundled timing archive entry with full-race recorded coordinates and car telemetry.
 * node --max-old-space-size=4096 scripts/ingest-recorded-race.mjs 2025-italian
 * OpenF1 session-wide requests avoid issuing one HTTP request per driver. Original
 * source responses are cached outside the checkout, with SHA-256 provenance.
 */
import fs from 'node:fs/promises'
import path from 'node:path'
import {fileURLToPath} from 'node:url'
import {createHash} from 'node:crypto'
import {providerSlot} from './history-provider.mjs'
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..')
const id=process.argv[2]
const locationsOnly=process.argv.includes('--locations-only')
if(!id||!/^[a-z0-9-]+$/.test(id))throw new Error('Specify an archive race ID, for example 2025-italian.')
const output=path.join(root,'public','history',id),race=JSON.parse(await fs.readFile(path.join(output,'race.json'),'utf8'))
if(!race.events.some(event=>event.type==='start'))throw new Error('Run ingest-archive first: a recorded race-start origin is required.')
const key=race.meta.sessionKey,cache=path.join(root,'..','historical-ingestion','archive')
const sources=[]
let last=0
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms))
async function download(endpoint){
  const file=path.join(cache,`${endpoint}-${key}-all.json`),url=`https://api.openf1.org/v1/${endpoint}?session_key=${key}`
  try{const body=await fs.readFile(file,'utf8');sources.push({url,bytes:Buffer.byteLength(body),sha256:createHash('sha256').update(body).digest('hex'),cached:true});return JSON.parse(body)}catch{}
  if(endpoint==='location'||endpoint==='car_data'){
    const all=[]
    for(let start=-1,index=0;start<race.meta.duration+1;start+=600,index++){
      const end=Math.min(start+600,race.meta.duration+1),chunkFile=path.join(cache,`${endpoint}-${key}-chunk-${index}.json`),chunkUrl=new URL(url)
      chunkUrl.searchParams.set('date>',new Date(race.meta.startEpochMs+start*1000-1).toISOString().replace('Z',''))
      chunkUrl.searchParams.set('date<',new Date(race.meta.startEpochMs+end*1000).toISOString().replace('Z',''))
      let body
      try{body=await fs.readFile(chunkFile,'utf8')}catch{}
      if(!body){
        for(let attempt=0;attempt<8;attempt++){
          await sleep(Math.max(0,2500-(Date.now()-last)));last=Date.now()
          await providerSlot('openf1')
          try{const response=await fetch(chunkUrl,{headers:{'User-Agent':'ApexLabArchive/2.0 (noncommercial educational reconstruction)'},signal:AbortSignal.timeout(180000)});if(response.status===429||response.status>=500){await sleep(12000*(attempt+1));continue}if(!response.ok)throw new Error(`${endpoint} chunk${index}: HTTP${response.status}`);body=await response.text();JSON.parse(body);await fs.writeFile(chunkFile,body);break}catch(error){if(attempt===7)throw error;await sleep(5000*(attempt+1))}
        }
      }
      if(!body)throw new Error(`${endpoint}: chunk${index} unavailable`)
      const rows=JSON.parse(body)
      sources.push({url:String(chunkUrl),retrievedAt:new Date().toISOString(),bytes:Buffer.byteLength(body),sha256:createHash('sha256').update(body).digest('hex')})
      for(const row of rows)all.push(row)
      console.log(JSON.stringify({downloaded:endpoint,chunk:index,rows:rows.length,progress:Math.round(end/race.meta.duration*100)}))
    }
    return all
  }
  for(let attempt=0;attempt<8;attempt++){
    await sleep(Math.max(0,2500-(Date.now()-last)));last=Date.now()
    await providerSlot('openf1')
    try{
      const response=await fetch(url,{headers:{'User-Agent':'ApexLabArchive/2.0 (noncommercial educational reconstruction)'},signal:AbortSignal.timeout(300000)})
      if(response.status===429||response.status>=500){console.log(JSON.stringify({endpoint,status:response.status,attempt}));await sleep(10000*(attempt+1));continue}
      if(!response.ok)throw new Error(`${endpoint}: HTTP${response.status}`)
      const body=await response.text(),rows=JSON.parse(body)
      await fs.writeFile(file,body)
      sources.push({url,retrievedAt:new Date().toISOString(),bytes:Buffer.byteLength(body),sha256:createHash('sha256').update(body).digest('hex')})
      console.log(JSON.stringify({downloaded:endpoint,rows:rows.length,bytes:Buffer.byteLength(body)}));return rows
    }catch(error){if(attempt===7)throw error;console.log(JSON.stringify({endpoint,error:String(error),attempt}));await sleep(5000*(attempt+1))}
  }
  throw new Error(`${endpoint}: retry limit exhausted`)
}
const nullable=value=>typeof value==='number'&&Number.isFinite(value)?value:null
const percentage=value=>typeof value==='number'&&Number.isFinite(value)&&value>=0&&value<=100?value:null
const round=value=>Math.round(value*1000)/1000
const seconds=date=>round((Date.parse(date)-race.meta.startEpochMs)/1000)
function nearestSecond(rows,end,mapper){
  if(!rows.length||end<=0)return []
  const out=[],used=new Set();let index=0
  const append=row=>{if(row&&!used.has(row.date)){used.add(row.date);out.push(mapper(row))}}
  for(let target=0;target<=Math.ceil(end);target++){while(index+1<rows.length&&(rows[index+1].time===rows[index].time||Math.abs(rows[index+1].time-target)<Math.abs(rows[index].time-target)))index++;if(Math.abs(rows[index].time-target)<=.8)append(rows[index])}
  append(rows.find(row=>row.time>=end));return out.sort((a,b)=>a[0]-b[0])
}
const ends={}
for(const driver of race.drivers)ends[driver.number]=Math.max(0,...(race.laps[driver.number]??[]).filter(lap=>lap.lap<=(driver.recordedLaps??driver.classifiedLaps??0)&&lap.end!==null).map(lap=>lap.end))
const locationRows=await download('location'),byDriver=new Map()
for(const row of locationRows){if(![row.x,row.y,row.z].every(Number.isFinite)||(row.x===0&&row.y===0&&row.z===0))continue;let rows=byDriver.get(row.driver_number);if(!rows){rows=[];byDriver.set(row.driver_number,rows)}const time=seconds(row.date);if(time>=-1&&time<=ends[row.driver_number]+1)rows.push({...row,time})}
const coverage=[]
for(const driver of race.drivers){const rows=(byDriver.get(driver.number)??[]).sort((a,b)=>a.time-b.time);race.locations[driver.number]=nearestSecond(rows,ends[driver.number],row=>[row.time,row.x,row.y,row.z]);coverage.push({number:driver.number,code:driver.code,locations:race.locations[driver.number].length,end:ends[driver.number]})}
const winner=race.drivers.find(driver=>driver.finishPosition===1)??race.drivers[0]
const pitLaps=new Set(race.pits.filter(pit=>pit.driver===winner.number).map(pit=>pit.lap))
const reference=(race.laps[winner.number]??[]).filter(lap=>lap.start!=null&&lap.end!=null&&lap.duration>0&&lap.lap>=5&&lap.lap<=(winner.classifiedLaps??0)&&!pitLaps.has(lap.lap)&&!pitLaps.has(lap.lap-1)).sort((a,b)=>a.duration-b.duration)[0]
if(!reference)throw new Error('No complete recorded lap is available to construct the track reference.')
const winnerLocations=byDriver.get(winner.number)??[]
race.track.points=winnerLocations.filter(row=>row.time>=reference.start&&row.time<=reference.end).map(row=>[row.x,row.y,row.z])
if(race.track.points.length<20)throw new Error('Insufficient recorded coordinate coverage for the circuit reference.')
const pit=race.pits.find(pit=>pit.driver===winner.number&&pit.duration!=null)
race.track.pitLane=pit?winnerLocations.filter(row=>row.time>=pit.time-2&&row.time<=pit.time+pit.duration+2).map(row=>[row.x,row.y,row.z]):[]
const circuitLengths={'bahrain':5412,'saudi-arabian':6174,'australian':5278,'azerbaijan':6003,'miami':5412,'monaco':3337,'spanish':4657,'canadian':4361,'austrian':4318,'british':5891,'hungarian':4381,'belgian':7004,'dutch':4259,'italian':5793,'singapore':4940,'japanese':5807,'qatar':5419,'united-states':5513,'mexican':4304,'sao-paulo':4309,'brazilian':4309,'las-vegas':6201,'abu-dhabi':5281,'chinese':5451,'emilia-romagna':4909}
race.track.length=circuitLengths[id.replace(/^\d{4}-/,'')]??0
race.track.description=`Recorded ${winner.code} lap ${reference.lap} trace; pit lane uses an actual recorded traversal where available. Provider coordinates are approximate, not a survey of road edges or exact lateral placement. Circuit reference length ${race.track.length||'unavailable'}m.`
// Release the bulky full location response before parsing the car-data source.
locationRows.length=0
if(!locationsOnly){
  const carRows=await download('car_data'),carsByDriver=new Map()
  for(const row of carRows){let rows=carsByDriver.get(row.driver_number);if(!rows){rows=[];carsByDriver.set(row.driver_number,rows)}const time=seconds(row.date);if(time>=-1&&time<=ends[row.driver_number]+1)rows.push({...row,time})}
  for(const driver of race.drivers){
    const rows=(carsByDriver.get(driver.number)??[]).sort((a,b)=>a.time-b.time)
    const samples=nearestSecond(rows,ends[driver.number],row=>[row.time,nullable(row.speed),percentage(row.throttle),percentage(row.brake),nullable(row.n_gear),nullable(row.rpm),nullable(row.drs)])
    const filename=`telemetry-${driver.number}.json`;await fs.writeFile(path.join(output,filename),JSON.stringify(samples));race.telemetryFiles[driver.number]=`/history/${id}/${filename}`
    coverage.find(row=>row.number===driver.number).telemetry=samples.length
  }
  carRows.length=0
}
race.coverage.locationSamples=Object.values(race.locations).reduce((sum,rows)=>sum+rows.length,0)
race.coverage.sampleInterval=1
race.coverage.maxInterpolationGap=3
race.meta.replayMode='recorded-3d'
race.coverage.notes=race.coverage.notes.filter(note=>!note.startsWith('No coordinates or car telemetry')&&!note.startsWith('Verified entry list'))
race.coverage.notes.push(`Full-session recorded location${locationsOnly?'':' and car telemetry'} values are sampled near each whole replay second. Each tuple retains its original provider timestamp and values. No trajectory is generated from lap times. The browser interpolates only valid adjacent location samples separated by at most three seconds.`,...locationsOnly?['Car telemetry channels are not bundled for this race; speed, throttle, brake, RPM, gear and DRS must display unavailable.']:[],'Cars are hidden before a valid first coordinate and across unsupported gaps; DNS and retired entries do not receive invented movement. Finished cars hold a valid final recorded coordinate. Model geometry and cockpit views are original illustrative reconstructions, not scans or onboard footage.',`Track visual reference comes from ${winner.code} lap ${reference.lap}; the actual car coordinates are never snapped to this path. Provider coordinates do not establish exact track elevation or lateral car placement.`,`Recorded race start ${new Date(race.meta.startEpochMs).toISOString()}. Each driver's replay coverage ends at its final completed competitive lap. Official classification totals remain separately available.`)
race.sources.push({label:`OpenF1 ${race.meta.year} ${race.meta.name}: full recorded session ${key}`,url:`https://api.openf1.org/v1/sessions?session_key=${key}`,license:'CC BY-NC-SA 4.0; educational, noncommercial fan analysis.'})
const body=JSON.stringify(race)
await fs.writeFile(path.join(output,'race.json'),body)
await fs.writeFile(path.join(output,'provenance.json'),JSON.stringify({generatedAt:new Date().toISOString(),raceId:id,sessionKey:key,origin:new Date(race.meta.startEpochMs).toISOString(),raceSha256:createHash('sha256').update(body).digest('hex'),raceBytes:Buffer.byteLength(body),drivers:coverage,sources},null,2))
const archivePath=path.join(root,'public','history','archive.json'),archive=JSON.parse(await fs.readFile(archivePath,'utf8')),entry=archive.races.find(entry=>entry.id===id)
entry.mode='recorded-3d';entry.notes=['Full recorded-location 3D replay, actual lineup, historical lap timing, tyres and pit events. Approximate provider coordinates; inspect data notes.']
await fs.writeFile(archivePath,JSON.stringify(archive))
console.log(JSON.stringify({completed:id,locationSamples:race.coverage.locationSamples,bytes:Buffer.byteLength(body),referenceLap:reference.lap,drivers:coverage}))
