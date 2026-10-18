import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { validateHistoricalRace } from './loader'
import { sampleLocation } from './replay'
import { createDriverMotion, createTrackGuide, projectToPath, sampleMotion, toWorld } from './trackGuide'
import type { HistoricalRace, LocationSample } from './types'

const R=300,UNITS=10
/** A circular reference lap in OpenF1-style decimetre coordinates. */
function circleRace(samples:LocationSample[]=[]):HistoricalRace{
  const points=Array.from({length:400},(_,i)=>{const a=i/400*Math.PI*2;return [Math.cos(a)*R*UNITS,Math.sin(a)*R*UNITS,0] as [number,number,number]})
  return {track:{points,length:2*Math.PI*R,description:''},meta:{circuit:'Test Ring',name:'Test'},locations:{1:samples},coverage:{maxInterpolationGap:3}} as unknown as HistoricalRace
}
/** A car circling anticlockwise at constant speed, sampled once per second. */
function circling(speed:number,seconds:number,jitter=0):LocationSample[]{
  return Array.from({length:seconds+1},(_,t)=>{const a=speed*t/R,r=R+(jitter?Math.sin(t*1.7)*jitter:0);return [t,Math.cos(a)*r*UNITS,Math.sin(a)*r*UNITS,0]})
}

test('track-guided motion follows the curve between samples instead of cutting chords',()=>{
  const samples=circling(60,40),race=circleRace(samples),guide=createTrackGuide(race)!,motion=createDriverMotion(guide,samples)
  assert.ok(Math.abs(guide.track.length-2*Math.PI*R)<4,'the reference lap keeps its length')
  let worstGuided=0,worstChord=0
  for(let t=5.5;t<35;t+=1){
    const pose=sampleMotion(guide,motion,t,3)!
    worstGuided=Math.max(worstGuided,Math.abs(Math.hypot(pose.x,pose.z)-R))
    const chord=sampleLocation(samples,t,3),w=toWorld(guide.frame,chord.x,chord.y,chord.z)
    worstChord=Math.max(worstChord,Math.abs(Math.hypot(w.x,w.z)-R))
    // Heading is tangent to the circle; speed and lateral load match v and v²/R.
    const tangent=Math.atan2(-pose.z,pose.x)
    const heading=Math.atan2(Math.sin(pose.yaw),Math.cos(pose.yaw)),expected=Math.atan2(Math.sin(tangent+Math.PI),Math.cos(tangent+Math.PI))
    assert.ok(Math.abs(Math.atan2(Math.sin(heading-expected),Math.cos(heading-expected)))<.035,`heading at ${t}`)
    assert.ok(Math.abs(pose.speed-60)<1.5,`speed ${pose.speed}`)
    assert.ok(Math.abs(Math.abs(pose.latAccel)-60*60/R)<1.2,`lateral ${pose.latAccel}`)
  }
  assert.ok(worstChord>1.2,'straight chords cut inside the corner')
  assert.ok(worstGuided<.6,`guided path stays on the line (${worstGuided.toFixed(2)} m)`)
})

test('recorded lap progress is kept and cars never reverse on noisy samples',()=>{
  const samples=circling(55,30,1.2),race=circleRace(samples),guide=createTrackGuide(race)!,motion=createDriverMotion(guide,samples)
  for(let i=1;i<motion.S.length;i++)assert.ok(motion.S[i]>=motion.S[i-1],'progress is monotone')
  for(let i=4;i<samples.length-4;i++){
    const recorded=toWorld(guide.frame,samples[i][1],samples[i][2],samples[i][3]),p=projectToPath(guide.track,recorded.x,recorded.z,recorded.y,20)!
    const along=Math.abs(((motion.S[i]%guide.track.length)-p.s+guide.track.length*1.5)%guide.track.length-guide.track.length/2)
    assert.ok(along<3,`sample ${i} progress within 3 m of the record (${along.toFixed(2)})`)
  }
  // A parked car stays parked.
  const parked:LocationSample[]=Array.from({length:12},(_,t)=>[t,R*UNITS+(t%2?3:-3),0,0])
  const still=createDriverMotion(guide,parked)
  for(let t=1;t<10;t+=.5)assert.ok(sampleMotion(guide,still,t,3)!.speed<.5)
})

test('gaps and impossible jumps stay hidden rather than drawn',()=>{
  const samples=circling(60,10),race=circleRace(samples),guide=createTrackGuide(race)!
  const gapped=[...samples.slice(0,5),...samples.slice(9).map(s=>[s[0],s[1],s[2],s[3]] as LocationSample)]
  assert.equal(sampleMotion(guide,createDriverMotion(guide,gapped),5.5,3),null)
  // A position far off the circuit implies ~300 m in one second: hidden, never animated.
  const offTrack=samples.map(s=>[...s] as LocationSample);offTrack[6]=[6,0,0,0]
  const motion=createDriverMotion(guide,offTrack)
  assert.equal(sampleMotion(guide,motion,5.5,3),null,'a teleport bracket is not animated')
  assert.ok(sampleMotion(guide,motion,2.5,3),'valid brackets still play')
  assert.equal(sampleMotion(guide,motion,-1,3),null)
  // A single sample snapped to the far side of the lap is rejected by the robust fit.
  const flipped=samples.map(s=>[...s] as LocationSample);flipped[6]=[6,-R*UNITS,0,0]
  const robust=createDriverMotion(guide,flipped)
  for(let t=4.5;t<8;t+=.25){
    const pose=sampleMotion(guide,robust,t,3);if(!pose)continue
    const a=60*t/R,trueX=Math.cos(a)*R,trueZ=-Math.sin(a)*R
    assert.ok(Math.hypot(pose.x-trueX,pose.z-trueZ)<15,`no teleport at ${t}`)
  }
})

test('British Grand Prix motion is matched to the circuit at plausible speeds',()=>{
  const race=validateHistoricalRace(JSON.parse(readFileSync(new URL('../../public/history/2024-british/race.json',import.meta.url),'utf8')))
  const guide=createTrackGuide(race)!
  assert.ok(Math.abs(guide.track.length-race.track.length)<race.track.length*.01)
  assert.ok(guide.pit&&guide.pit.length>200,'recorded pit lane is used')
  let matched=0,total=0
  const speeds:number[]=[]
  for(const driver of race.drivers.filter(d=>d.classifiedLaps)){
    const samples=race.locations[driver.number],motion=createDriverMotion(guide,samples,3)
    motion.mode.forEach(m=>{total++;if(m)matched++})
    for(let t=samples[0][0]+120;t<samples.at(-1)![0]-120;t+=4.3){
      const pose=sampleMotion(guide,motion,t,3)
      if(!pose)continue
      speeds.push(pose.speed*3.6)
      if(pose.mode===1)assert.ok(Math.abs(pose.d-pose.roadOffset)<=guide.track.halfWidth,'cars stay on the modelled road')
    }
  }
  speeds.sort((a,b)=>a-b)
  assert.ok(matched/total>.97,`${(matched/total*100).toFixed(1)}% of samples matched`)
  assert.ok(speeds[Math.floor(speeds.length*.999)]<355,`p99.9 speed ${speeds[Math.floor(speeds.length*.999)].toFixed(0)} km/h`)
  assert.ok(speeds[Math.floor(speeds.length*.5)]>150,'typical racing speed')
})
