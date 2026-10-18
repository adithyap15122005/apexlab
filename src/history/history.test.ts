import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { validateHistoricalRace, validateTelemetry } from './loader'
import { getDriverState, getLapTime, sampleLocation, sampleTelemetry } from './replay'
import { defaultWhatIfSettings, simulateHistoricalWhatIf } from './whatIf'
const race=validateHistoricalRace(JSON.parse(readFileSync(new URL('../../public/history/2024-british/race.json',import.meta.url),'utf8')))

test('interpolation uses only valid recorded brackets',()=>{
  assert.equal(sampleLocation([[0,0,10,0],[2,20,30,4]],1).status,'interpolated')
  assert.deepEqual(sampleLocation([[0,0,10,0],[2,20,30,4]],1).x,10)
  assert.equal(sampleLocation([[0,0,10,0],[2,20,30,4]],2).status,'recorded')
  assert.equal(sampleLocation([[0,0,0,0],[10,100,0,0]],5).status,'gap')
  assert.ok(Number.isNaN(sampleLocation([[0,0,0,0],[10,100,0,0]],5).x))
  assert.equal(sampleLocation([[0,0,0,0],[1,100,0,0]],2).status,'unavailable')
  assert.equal(sampleLocation([[0,0,0,0],[1,100,0,0]],-1).status,'unavailable')
})
test('telemetry returns actual discrete samples and exposes staleness',()=>{
  const s=sampleTelemetry([[0,100,30,0,3,8000,8],[2,150,100,100,4,11000,12]],1.2)!
  assert.equal(s.time,2);assert.equal(s.gear,4);assert.equal(s.drs,12)
  assert.equal(s.sampleAge,.8)
  assert.equal(sampleTelemetry([],3),null)
  assert.ok(sampleTelemetry([[0,100,30,0,3,8000,8]],10)!.sampleAge>3)
})
test('snapshot has real lineup, actual winner and a complete race clock',()=>{
  assert.equal(race.drivers.length,20)
  assert.equal(race.drivers.find(d=>d.finishPosition===1)?.name,'Lewis Hamilton')
  assert.equal(race.drivers.find(d=>d.number===44)?.resultTime,4947.059)
  assert.equal(race.meta.laps,52);assert.ok(race.meta.duration>5037)
  assert.ok(race.coverage.locationSamples>90000)
  assert.equal(race.drivers.filter(d=>d.classifiedLaps===0).length,1)
})
test('all starters have valid sampled motion across their competitive race',()=>{
  for(const d of race.drivers.filter(d=>d.classifiedLaps!==0)){
    const locations=race.locations[d.number]
    assert.ok(locations.length>3000,`${d.code} has full records`)
    for(let i=1;i<locations.length;i++)assert.ok(locations[i][0]-locations[i-1][0]<=3,`${d.code} location gap`)
    for(const f of [.02,.25,.5,.75,.99]){
      const t=locations[0][0]+(locations.at(-1)![0]-locations[0][0])*f
      const p=sampleLocation(locations,t,3)
      assert.ok(['recorded','interpolated'].includes(p.status),`${d.code} at ${t}`)
    }
  }
})
test('DNS has no invented motion and retirement ends competitive location',()=>{
  for(const time of [0,1000,4000,race.meta.duration]){
    const gas=getDriverState(race,10,time)
    assert.equal(gas.location.status,'unavailable');assert.equal(gas.lap,0)
  }
  const russell=getDriverState(race,63,4000)
  assert.equal(russell.retired,true);assert.equal(russell.location.status,'unavailable')
  assert.equal(getDriverState(race,44,race.meta.duration).finished,true)
})
test('lap selection seeks actual recorded starts',()=>{
  for(const lap of [1,10,27,38,52])assert.equal(getLapTime(race,lap,44),race.laps[44].find(l=>l.lap===lap)!.start)
})
test('unknown tyre age stays unknown instead of assuming a new set',()=>{
  const unknown={...race,stints:race.stints.map(s=>({...s,tyreAgeAtStart:null}))}
  assert.equal(getDriverState(unknown,44,1000).tyreAge,null)
})
test('all historical pits retain lane duration and unavailable stationary duration',()=>{
  assert.ok(race.pits.length>=40)
  assert.ok(race.pits.every(p=>p.stationary==null))
  assert.ok(race.pits.some(p=>p.driver===44&&p.lap===38))
  assert.ok(race.stints.some(s=>s.driver===44&&s.compound==='INTERMEDIATE'))
})
test('each telemetry file validates with finite ordered tuples',()=>{
  for(const d of race.drivers){
    const path=race.telemetryFiles[d.number].split('/').at(-1)!
    const samples=validateTelemetry(JSON.parse(readFileSync(new URL(`../../public/history/2024-british/${path}`,import.meta.url),'utf8')))
    assert.equal(samples.length===0,d.classifiedLaps===0)
  }
})
test('unchanged historical What-If settings reproduce baseline, deterministically',()=>{
  const before=JSON.stringify(race),s=defaultWhatIfSettings(race,44)
  assert.equal(s.pitLap,38);assert.equal(s.compound,'SOFT')
  const first=simulateHistoricalWhatIf(race,s)
  assert.equal(first.valid,true,first.issues.join(' '));assert.equal(first.delta,0)
  assert.equal(first.hypotheticalTime,4947.059);assert.equal(first.position,1)
  assert.deepEqual(first,simulateHistoricalWhatIf(race,s));assert.equal(JSON.stringify(race),before)
})
test('pit-loss, traffic, wear and lap edits produce independent hypothetical changes',()=>{
  const s=defaultWhatIfSettings(race,44)
  assert.equal(simulateHistoricalWhatIf(race,{...s,pitLoss:s.pitLoss+3}).delta,3)
  assert.equal(simulateHistoricalWhatIf(race,{...s,traffic:2}).delta,2)
  assert.notEqual(simulateHistoricalWhatIf(race,{...s,degradation:.2}).delta,0)
  assert.notEqual(simulateHistoricalWhatIf(race,{...s,pitLap:39}).delta,0)
  const compound=simulateHistoricalWhatIf(race,{...s,compound:'MEDIUM'})
  assert.equal(compound.valid,true);assert.notEqual(compound.delta,0)
})
test('unsupported wet, retired, nonstarter and invalid decisions do not invent a result',()=>{
  const s=defaultWhatIfSettings(race,44)
  for(const invalid of [{...s,compound:'WET'},{...s,pitLap:1},defaultWhatIfSettings(race,63),defaultWhatIfSettings(race,10)]){
    const result=simulateHistoricalWhatIf(race,invalid)
    assert.equal(result.valid,false);assert.equal(result.hypotheticalTime,null);assert.equal(result.position,null)
  }
})
test('malformed provider data fails validation rather than drawing invented motion',()=>{
  assert.throws(()=>validateTelemetry([[0,100,1,0,2,9000,8],[-1,100,1,0,2,9000,8]]))
  assert.throws(()=>validateHistoricalRace({...race,locations:{...race.locations,44:[[0,'bad',0,0]]}}))
})
