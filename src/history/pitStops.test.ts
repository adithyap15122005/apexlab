import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { validateHistoricalRace } from './loader'
import { boxWeight, featuredPitStop, pitPhase, planPitStops, TYPICAL_SERVICE, type PitStopPlan } from './pitStops'

const load=(id:string)=>validateHistoricalRace(JSON.parse(readFileSync(new URL(`../../public/history/${id}/race.json`,import.meta.url),'utf8')))

test('2025 stops animate the recorded stationary time',()=>{
  const plans=planPitStops(load('2025-japanese'))
  assert.equal(plans.length,21)
  for(const p of plans){assert.ok(p.standard);assert.notEqual(p.stationary,null);assert.equal(p.service,p.stationary)}
  const verstappen=plans.find(p=>p.driver===1)!
  assert.equal(verstappen.lap,21);assert.equal(verstappen.stationary,3.3)
  assert.deepEqual([verstappen.from,verstappen.to],['MEDIUM','HARD'])
})

test('older races fall back to a typical tyre change inside the recorded pit-lane window',()=>{
  const british=load('2024-british'),plans=planPitStops(british)
  assert.ok(plans.every((p,i)=>i===0||plans[i-1].entry<=p.entry),'stops are in race order')
  for(const p of plans.filter(p=>p.standard)){
    assert.equal(p.stationary,null);assert.equal(p.service,TYPICAL_SERVICE)
    assert.ok(p.stopAt-p.service/2>p.entry&&p.stopAt+p.service/2<p.exit,`${p.driver} lap ${p.lap} stops inside the lane`)
  }
  // Hamilton's winning strategy: medium → intermediate on lap 27, intermediate → soft on lap 38.
  const hamilton=plans.filter(p=>p.driver===44)
  assert.deepEqual(hamilton.map(p=>[p.lap,p.from,p.to]),[[27,'MEDIUM','INTERMEDIATE'],[38,'INTERMEDIATE','SOFT']])
  assert.ok(hamilton.every(p=>p.before!=null&&p.after!=null))
})

test('red-flag pit-lane parking is not animated as a tyre stop',()=>{
  const plans=planPitStops(load('2024-monaco')),parked=plans.filter(p=>p.lap===1)
  assert.ok(parked.length>10)
  for(const p of parked){assert.equal(p.standard,false);assert.equal(pitPhase(p,p.stopAt),null);assert.equal(boxWeight(p,p.stopAt),0);assert.equal(featuredPitStop(plans,p.driver,p.stopAt)?.lap===1,false)}
})

test('a stop moves through approach, service and release, and the car eases in and out of its box',()=>{
  const plan:PitStopPlan={driver:1,lap:10,entry:100,exit:124,laneTime:24,stationary:null,service:2.5,stopAt:112,from:'MEDIUM',to:'HARD',standard:true,before:3,after:6}
  assert.equal(pitPhase(plan,98.5),null)
  assert.equal(pitPhase(plan,99.5)?.phase,'approach')
  assert.deepEqual(pitPhase(plan,112),{phase:'service',progress:.5})
  assert.equal(pitPhase(plan,114)?.phase,'release')
  assert.equal(pitPhase(plan,125.5),null)
  assert.equal(boxWeight(plan,108),0)
  assert.ok(Math.abs(boxWeight(plan,110.75-.6)-.5)<1e-9,'halfway into the box at the midpoint of the ease')
  assert.equal(boxWeight(plan,110.75),1);assert.equal(boxWeight(plan,113.25),1)
  assert.equal(boxWeight(plan,116),0)
  assert.equal(featuredPitStop([plan],1,98.9),null)
  assert.equal(featuredPitStop([plan],1,99),plan);assert.equal(featuredPitStop([plan],1,130),plan)
  assert.equal(featuredPitStop([plan],1,130.5),null);assert.equal(featuredPitStop([plan],2,112),null)
})
