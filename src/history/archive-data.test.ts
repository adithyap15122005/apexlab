import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {fileURLToPath} from 'node:url'
import {validateHistoricalRace} from './loader'
import {archiveRaceHas3D,loadRecordedReplay} from './archive'
import type {RaceArchive} from './archiveTypes'

// Verify the complete bundled dataset independently of browser/UI integration.
const historyRoot=new URL('../../public/history/',import.meta.url)
const archive=JSON.parse(readFileSync(new URL('archive.json',historyRoot),'utf8')) as RaceArchive

test('five completed seasons contain all 114 championship Grands Prix without duplicate routes',()=>{
  assert.deepEqual(archive.seasons,[2021,2022,2023,2024,2025])
  assert.equal(archive.races.length,114)
  assert.equal(new Set(archive.races.map(race=>race.id)).size,114)
  for(const [year,count] of [[2021,22],[2022,22],[2023,22],[2024,24],[2025,24]]){
    const races=archive.races.filter(race=>race.year===year).sort((a,b)=>a.round-b.round)
    assert.equal(races.length,count)
    assert.deepEqual(races.map(race=>race.round),Array.from({length:count},(_,index)=>index+1))
  }
})

test('every archive route has a valid real-race snapshot and accurate bundled 3D capability',()=>{
  for(const entry of archive.races){
    const race=validateHistoricalRace(JSON.parse(readFileSync(new URL(`${entry.id}/race.json`,historyRoot),'utf8')))
    assert.equal(race.meta.id,entry.id)
    assert.equal(race.meta.year,entry.year)
    assert.equal(race.meta.round,entry.round)
    assert.equal(race.meta.winner,entry.winner)
    assert.ok(race.drivers.length>=19&&race.drivers.length<=20,`${entry.id}: actual official classification roster`)
    assert.equal(race.drivers.find(driver=>driver.finishPosition===1)?.name,entry.winner)
    assert.equal(archiveRaceHas3D(race),entry.mode==='recorded-3d',entry.id)
    if(entry.mode==='timing')assert.ok(Object.values(race.locations).every(samples=>samples.length===0),`${entry.id}: no invented coordinates`)
    if(entry.year>=2023)assert.ok(entry.sessionKey&&race.meta.sessionKey===entry.sessionKey,`${entry.id}: matching recorded OpenF1 session`)
    for(const driver of race.drivers){
      if(/did not start|withdrawn/i.test(driver.status))assert.equal(race.locations[driver.number]?.length??0,0,`${entry.id}: DNS must not receive a racing trajectory`)
    }
  }
})

test('2021–2022 never pretend to have positional recordings',async()=>{
  const entry=archive.races.find(entry=>entry.year===2021)!
  const race=validateHistoricalRace(JSON.parse(readFileSync(new URL(`${entry.id}/race.json`,historyRoot),'utf8')))
  assert.equal(archiveRaceHas3D(race),false)
  await assert.rejects(loadRecordedReplay(race),/coordinates are unavailable/)
})

test('cancelling an on-demand recording rejects immediately before making any request',async()=>{
  const entry=archive.races.find(entry=>entry.year===2024)!
  const race=validateHistoricalRace(JSON.parse(readFileSync(new URL(`${entry.id}/race.json`,historyRoot),'utf8')))
  const controller=new AbortController();controller.abort()
  await assert.rejects(loadRecordedReplay(race,controller.signal),{name:'AbortError'})
})

test('archive data is kept under the served history directory',()=>{
  const root=fileURLToPath(historyRoot).replaceAll('\\','/').toLowerCase()
  for(const entry of archive.races){assert.match(entry.id,/^[a-z0-9-]+$/);assert.equal(entry.snapshotUrl,`/history/${entry.id}/race.json`);assert.ok(fileURLToPath(new URL(`${entry.id}/race.json`,historyRoot)).replaceAll('\\','/').toLowerCase().startsWith(root))}
})

test('bundled full-race recordings span their winner timeline rather than one ten-minute segment',()=>{
  for(const entry of archive.races.filter(entry=>entry.mode==='recorded-3d')){
    const race=validateHistoricalRace(JSON.parse(readFileSync(new URL(`${entry.id}/race.json`,historyRoot),'utf8')))
    const winner=race.drivers.find(driver=>driver.finishPosition===1)!
    const samples=race.locations[winner.number]??[]
    const end=Math.max(...race.laps[winner.number].filter(lap=>lap.lap<=(winner.recordedLaps??winner.classifiedLaps??0)).map(lap=>lap.end??0))
    assert.ok(samples.length>end*.7,`${entry.id}: retain samples across the entire recorded race`)
    assert.ok(samples.at(-1)![0]>=end-3,`${entry.id}: retain a valid final coordinate bracket`)
  }
})
