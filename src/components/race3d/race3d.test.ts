import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { Box3, Mesh, MeshBasicMaterial, Raycaster, Vector3, type BufferGeometry } from 'three'
import { validateHistoricalRace } from '../../history/loader'
import { createTrackGuide, projectToPath, wrap } from '../../history/trackGuide'
import { footprintSeparation } from '../historical/replayPresentation'
import { CAR, createF1CarGeometry } from './carGeometry'
import { buildCircuit } from './circuitBuilder'
import { estimatedRpm } from './engineAudio'
import { buildPendingMotion, createRuntime, trackStatus, updateRuntime } from './raceRuntime'
import { pitchForAccel, rollForLateral, spring, steerForCurvature } from './vehicleDynamics'
import { venueFor } from './venues'

const load=(id:string)=>validateHistoricalRace(JSON.parse(readFileSync(new URL(`../../../public/history/${id}/race.json`,import.meta.url),'utf8')))
const british=load('2024-british')

test('the 2022-style car has regulation-like proportions and rests on its tyres',()=>{
  for(const detail of ['high','low'] as const){
    const set=createF1CarGeometry(detail),bounds=new Box3()
    try{
      for(const key of ['paint','carbon','dark','metal','flap','helmet','visor','tcam','light'] as const){
        const g:BufferGeometry=set[key]
        assert.ok(Array.from(g.getAttribute('position').array).every(Number.isFinite),`${key} positions`)
        assert.ok(Array.from(g.getAttribute('normal').array).every(Number.isFinite),`${key} normals`)
        g.computeBoundingBox();if(key!=='flap')bounds.union(g.boundingBox!)
      }
      const size=bounds.getSize(new Vector3())
      assert.ok(size.x>1.9&&size.x<2.05,`width ${size.x}`)
      assert.ok(size.z>5.5&&size.z<5.95,`length ${size.z}`)
      assert.ok(bounds.max.y>.95&&bounds.max.y<1.1,`height ${bounds.max.y}`)
      assert.ok(bounds.min.y>=-1e-6,'no bodywork below the road')
      set.tyre.computeBoundingBox()
      assert.ok(Math.abs(set.tyre.boundingBox!.max.y-CAR.wheelRadius)<1e-3,'720 mm tyres')
      assert.equal(set.wheels.length,4)
      assert.ok(set.wheels.filter(w=>w.front).every(w=>w.z>1.7)&&set.wheels.filter(w=>!w.front).every(w=>w.z<-1.7),'3.6 m wheelbase')
    }finally{set.dispose()}
  }
})

test('the driver sees the road ahead over the nose, past the halo pillar',()=>{
  const set=createF1CarGeometry('high'),material=new MeshBasicMaterial(),meshes=(['paint','carbon','dark','metal'] as const).map(k=>new Mesh(set[k],material))
  try{
    meshes.forEach(m=>m.updateMatrixWorld(true))
    const eye=new Vector3(CAR.eye.x,CAR.eye.y,CAR.eye.z)
    // Either side of the halo's central pillar, as a driver's two eyes see the road.
    for(const target of [new Vector3(1.6,0,14),new Vector3(-1.6,0,14),new Vector3(3,0,10),new Vector3(-3,0,10)]){
      const ray=new Raycaster(eye,target.clone().sub(eye).normalize(),.02,target.distanceTo(eye))
      const hits=ray.intersectObjects(meshes,false)
      assert.equal(hits.length,0,`clear sight line towards ${target.toArray()}`)
    }
  }finally{set.dispose();material.dispose()}
})

test('vehicle dynamics lean, dive and steer the right way',()=>{
  assert.ok(steerForCurvature(1/20)>.15&&steerForCurvature(1/20)<.2,'hairpin lock ≈ 10°')
  assert.ok(steerForCurvature(-1/20)<0&&steerForCurvature(0)===0)
  assert.ok(Math.abs(steerForCurvature(10))<=.42,'lock is limited')
  assert.ok(pitchForAccel(-45)>0&&pitchForAccel(12)<0,'braking dives the nose; traction squats')
  assert.ok(pitchForAccel(-45)<.035,'pitch stays within about two degrees')
  assert.ok(rollForLateral(40)>0&&rollForLateral(-40)<0&&Math.abs(rollForLateral(60))<=.034)
  let value=0,velocity=0
  for(let i=0;i<120;i++)[value,velocity]=spring(value,velocity,1,10,.6,1/60)
  assert.ok(Math.abs(value-1)<.01,'springs settle on their target')
})

test('circuit dressing keeps barriers, scenery and stands off the racing surface',()=>{
  const guide=createTrackGuide(british)!,layout=buildCircuit(guide,venueFor(british.meta.circuit,british.meta.name),{trees:.4,buildings:.4})
  try{
    const path=guide.track,hw=path.halfWidth
    for(const [kind,geometry] of Object.entries(layout.barriers)){
      const p=geometry!.getAttribute('position')
      for(let i=0;i<p.count;i+=37){
        const hit=projectToPath(path,p.getX(i),p.getZ(i),p.getY(i),hw+2)
        if(!hit)continue
        const f=Math.floor(hit.s/path.step)%path.count
        assert.ok(Math.abs(hit.d-path.offset[f])>hw+.4,`${kind} barrier vertex intrudes on the road`)
      }
    }
    for(const item of [...layout.trees,...layout.grandstands,...layout.garages]){
      assert.equal(projectToPath(path,item.x,item.z,item.y,hw+4),null,'scenery stands clear of the circuit')
    }
    for(const geometry of [layout.road,layout.verge,layout.kerbs,layout.terrain])assert.ok(Array.from(geometry.getAttribute('position').array).every(Number.isFinite))
    assert.ok(layout.grandstands.length>10&&layout.garages.length>10&&layout.trees.length>100)
  }finally{layout.dispose()}
})

test('rendered cars never intersect after render-only lateral separation',()=>{
  const guide=createTrackGuide(british),runtime=createRuntime(british)
  while(!buildPendingMotion(runtime,british,guide,1e6));
  let checked=0
  for(const time of [2,4,6,8,12,600,2000]){
    updateRuntime(runtime,british,{guide,time,wallDt:1,selected:44,onboard:false,telemetry:[],camera:{x:0,y:0,z:0}})
    for(let k=0;k<30;k++)updateRuntime(runtime,british,{guide,time,wallDt:1/30,selected:44,onboard:false,telemetry:[],camera:{x:0,y:0,z:0}})
    const cars=runtime.cars.filter(c=>c.visible&&c.guided&&c.pose.mode===1)
    for(let i=0;i<cars.length;i++)for(let j=i+1;j<cars.length;j++){
      const a=cars[i],b=cars[j]
      if(Math.abs(wrap(a.pose.s-b.pose.s,guide!.track.length))>8)continue
      const foot=(c:typeof a)=>({x:c.pose.x+Math.cos(c.pose.yaw)*c.lateral,z:c.pose.z-Math.sin(c.pose.yaw)*c.lateral,heading:c.pose.yaw-Math.PI/2})
      // Footprints use the visibility guard's generous 5.8 × 2.3 m envelope.
      assert.ok(footprintSeparation(foot(a),foot(b))>-.6,`${a.driver.code}/${b.driver.code} overlap at ${time}s`)
      checked++
    }
  }
  assert.ok(checked>10,'the race start exercises close running')
})

test('track status follows recorded race-control messages',()=>{
  const singapore=load('2023-singapore'),bahrain=load('2025-bahrain')
  assert.equal(trackStatus(singapore,100),'green')
  assert.equal(trackStatus(singapore,2000),'sc')
  assert.equal(trackStatus(singapore,4500),'vsc')
  assert.equal(trackStatus(bahrain,3200),'sc')
  assert.equal(trackStatus(british,british.meta.duration),'chequered','a chequered flag is not a red flag')
  assert.equal(trackStatus(load('2024-monaco'),100),'red','Monaco 2024 was red-flagged on lap one')
})

test('estimated engine speed stays in a hybrid V6 race band and rises within each gear',()=>{
  for(let kmh=20;kmh<350;kmh+=7){const rpm=estimatedRpm(kmh);assert.ok(rpm>=10200&&rpm<=11800)}
  assert.ok(estimatedRpm(100)>estimatedRpm(90))
})
