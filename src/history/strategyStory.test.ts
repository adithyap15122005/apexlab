import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { validateHistoricalRace } from './loader'
import { coachMessage, raceStoryEvents, strategyBattles, strategyStory } from './strategyStory'

const load=(id:string)=>validateHistoricalRace(JSON.parse(readFileSync(new URL(`../../public/history/${id}/race.json`,import.meta.url),'utf8')))
const british=load('2024-british')

test('the winner’s strategy story follows the recorded stints in plain language',()=>{
  const story=strategyStory(british,44)
  assert.match(story.headline,/Lewis Hamilton used 3 sets of tyres \(2 changes\) and finished P1/)
  assert.deepEqual(story.steps.map(s=>s.stint.compound),['MEDIUM','INTERMEDIATE','SOFT'])
  assert.match(story.steps[1].text,/lap 27 for Intermediate tyres because the track was wet/)
  assert.match(strategyStory(british,10).headline,/did not take part/,'a non-starter gets no invented story')
  const monaco=strategyStory(load('2024-monaco'),16)
  assert.ok(monaco.steps.every(s=>!/lap 0/.test(s.text)),'a red-flag tyre change is not called a lap-0 stop')
  assert.ok(monaco.steps.some(s=>/red flag/.test(s.text)))
})

test('real undercuts are found from recorded pits and positions',()=>{
  const battles=strategyBattles(british)
  const undercut=battles.find(b=>b.kind==='undercut'&&b.first===44&&b.second===4)
  assert.ok(undercut,'Hamilton’s switch to slicks a lap before Norris is detected')
  assert.equal(undercut!.firstLap,38);assert.equal(undercut!.secondLap,39)
  assert.ok(undercut!.before[0]>undercut!.before[1]&&undercut!.after[0]<undercut!.after[1],'behind before the stops, ahead after')
  for(const b of battles){
    assert.ok(b.secondLap-b.firstLap>=1&&b.secondLap-b.firstLap<=4)
    assert.equal(Math.abs(b.before[0]-b.before[1]),1,'only adjacent cars count as a duel')
  }
  assert.ok(battles.some(b=>b.kind==='weather'),'rain-tyre switches are labelled as weather calls')
})

test('broadcast moments come only from recorded data, in time order',()=>{
  const events=raceStoryEvents(british,44)
  for(let i=1;i<events.length;i++)assert.ok(events[i].time>=events[i-1].time)
  assert.equal(events.filter(e=>e.kind==='pit').length,british.pits.filter(p=>p.driver===44).length)
  assert.ok(events.some(e=>e.kind==='pit'&&/Medium → Intermediate/.test(e.title)))
  const fastest=events.filter(e=>e.kind==='fastest')
  for(let i=1;i<fastest.length;i++)assert.ok(fastest[i].time>fastest[i-1].time)
  assert.ok(events.some(e=>e.kind==='finish'&&/Lewis Hamilton wins/.test(e.title)))
  assert.ok(events.some(e=>e.kind==='final'))
})

test('the race coach explains the most important thing in simple words',()=>{
  const pitting=british.pits.find(p=>p.driver===44)!
  assert.equal(coachMessage(british,44,pitting.time+5,{status:'green',drs:null}).topic,'PIT STOP')
  assert.equal(coachMessage(british,44,1000,{status:'sc',drs:null}).topic,'SAFETY CAR')
  assert.equal(coachMessage(british,44,1000,{status:'red',drs:null}).topic,'RED FLAG')
  assert.equal(coachMessage(british,44,2000,{status:'green',drs:null}).topic,'RAIN')
  assert.equal(coachMessage(british,44,500,{status:'green',drs:12}).topic,'DRS OPEN')
  assert.equal(coachMessage(british,63,4500,{status:'green',drs:null}).topic,'OUT OF THE RACE')
  for(const time of [100,900,3000,4900]){
    const message=coachMessage(british,44,time,{status:'green',drs:null})
    assert.ok(message.text.length<320,'messages stay short enough for a beginner')
  }
})
