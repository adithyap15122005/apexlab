import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {getDriverPortrait,getTeamIdentity,DRIVER_PHOTOGRAPH_COUNT} from './people'
import {getDriverState,isNonStarter} from './replay'
import {validateHistoricalRace} from './loader'
import type {RaceArchive} from './archiveTypes'

const root=new URL('../../public/history/',import.meta.url)
const archive=JSON.parse(readFileSync(new URL('archive.json',root),'utf8')) as RaceArchive
const load=(id:string)=>validateHistoricalRace(JSON.parse(readFileSync(new URL(`${id}/race.json`,root),'utf8')))

test('every historical entrant has a licensed portrait and a constructor identity',()=>{
  const people=new Set<string>()
  for(const entry of archive.races)for(const driver of load(entry.id).drivers){
    const portrait=getDriverPortrait(driver.code,driver.name)
    assert.ok(portrait,`${entry.id}: ${driver.name}`)
    assert.match(portrait.url,/^https:\/\/(upload|thumb)\.wikimedia\.org\//)
    assert.ok(portrait.credit&&portrait.license&&portrait.licenseUrl&&portrait.source)
    assert.ok(getTeamIdentity(driver.team),`${entry.id}: ${driver.team}`)
    people.add(driver.name)
  }
  assert.equal(people.size,37)
  assert.equal(DRIVER_PHOTOGRAPH_COUNT,37)
})

test('constructor labels with engine suppliers resolve to the actual constructor',()=>{
  for(const [label,name] of [['McLaren Mercedes','McLaren'],['Williams Mercedes','Williams'],['Aston Martin Aramco Mercedes','Aston Martin'],['Haas Ferrari','Haas F1 Team'],['Red Bull Racing Honda RBPT','Red Bull Racing'],['Mercedes','Mercedes']])assert.equal(getTeamIdentity(label)?.name,name)
  assert.equal(getTeamIdentity('Alfa Romeo Ferrari')?.name,'Alfa Romeo Ferrari')
  assert.equal(getTeamIdentity('AlphaTauri Honda RBPT')?.name,'AlphaTauri Honda RBPT')
})

test('a first-lap collision is not a DNS and does not get a fabricated trajectory',()=>{
  const race=load('2024-british'),driver=race.drivers.find(d=>d.number===44)!
  const firstLapCollision={...race,drivers:race.drivers.map(d=>d===driver?{...d,status:'Collision',classifiedLaps:0}:d),locations:{...race.locations,44:[]}}
  const state=getDriverState(firstLapCollision,44,0)
  assert.equal(isNonStarter(state.driver.status),false)
  assert.equal(state.location.status,'unavailable')
  assert.equal(state.finished,false)
  assert.equal(state.driver.status,'Collision')
  assert.equal(isNonStarter('Did not start'),true)
  assert.equal(isNonStarter('Withdrew'),true)
})

test('actual recorded movement survives a later disqualification without changing classification',()=>{
  const race=load('2024-british')
  const dsq={...race,drivers:race.drivers.map(d=>d.number===44?{...d,status:'Disqualified',classifiedLaps:0,recordedLaps:52}:d)}
  const middle=getDriverState(dsq,44,1000)
  assert.ok(['recorded','interpolated'].includes(middle.location.status))
  assert.ok(middle.completedLaps>0)
  assert.equal(middle.driver.classifiedLaps,0)
  assert.equal(middle.retired,false)
  const end=getDriverState(dsq,44,dsq.meta.duration)
  assert.equal(end.finished,true)
  assert.equal(end.completedLaps,52)
  assert.equal(end.driver.status,'Disqualified')
})

test('provider retirement causes end the recorded competitive replay',()=>{
  const race=load('2024-british')
  for(const status of ['Collision','Engine','Accident','Damage','Gearbox','Retired']){
    const changed={...race,drivers:race.drivers.map(d=>d.number===63?{...d,status}:d)}
    const end=getDriverState(changed,63,race.meta.duration)
    assert.equal(end.retired,true,status)
    assert.equal(end.location.status,'unavailable',status)
  }
})

test('a race leader with no position change retains its actual pre-start provider update',()=>{
  const race=load('2023-singapore')
  for(const time of [0,1000,4000])assert.equal(getDriverState(race,55,time).position,1)
  assert.ok(race.positions[55][0][0]<0)
})

test('earlier seasons retain available full-field lap durations with explicit derived-clock coverage',()=>{
  let total=0
  for(const entry of archive.races.filter(e=>e.year<2023)){
    const race=load(entry.id)
    total+=Object.values(race.laps).reduce((sum,rows)=>sum+rows.length,0)
    assert.ok(race.coverage.notes.some(note=>note.includes('cumulative durations')))
    for(const driver of race.drivers.filter(d=>(d.classifiedLaps??0)>1))assert.ok((race.laps[driver.number]?.length??0)>0,`${entry.id}: ${driver.code}`)
  }
  assert.equal(total,47217)
})
