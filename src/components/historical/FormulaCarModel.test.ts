import assert from 'node:assert/strict'
import { test } from 'node:test'
import { Box3, Color, Group, Mesh, MeshBasicMaterial, Raycaster, Triangle, Vector3 } from 'three'
import { bodyGeometry, cockpitCameraPose, createFormulaCarParts, formulaTeamLivery, historicalLighting, FORMULA_DRIVER_EYE } from './FormulaCarModel'
import {circuitOverviewHeight,cockpitRivalVisibility,footprintSeparation,REPLAY_CAMERAS,sceneryClearsRoad} from './replayPresentation'
import type {RecordedPosition} from '../../history/types'
import {readFileSync} from 'node:fs'
import {validateHistoricalRace} from '../../history/loader'
import {getDriverState} from '../../history/replay'

const epsilon=1e-6

const location=(x:number,y:number,heading=0):RecordedPosition=>({x,y,z:0,heading,status:'recorded',sampleTime:0,gapSeconds:0})
test('cockpit visibility suppresses intersecting rival bodies before they reach driver eyes',()=>{
  const own=location(0,0),overlap=location(2,0),sideOverlap=location(0,1),clear=location(12,0)
  const before=JSON.stringify([own,overlap,sideOverlap,clear])
  assert.equal(cockpitRivalVisibility(own,overlap,1),0)
  assert.equal(cockpitRivalVisibility(own,sideOverlap,1),0)
  assert.equal(cockpitRivalVisibility(own,clear,1),1)
  const transition=cockpitRivalVisibility(own,location(6.8,0),1)
  assert.ok(transition>0&&transition<1,'model fades before the bodies meet')
  assert.equal(cockpitRivalVisibility(location(0,0),location(68,0),10),transition)
  assert.equal(cockpitRivalVisibility({...own,status:'unavailable'},clear,1),1)
  assert.equal(JSON.stringify([own,overlap,sideOverlap,clear]),before,'visibility cannot rewrite source coordinates')
})

test('crossing and side-by-side car footprints use both cars’ orientations',()=>{
  const a={x:0,z:0,heading:0},crossed={x:1,z:1,heading:Math.PI/2},outside={x:0,z:6,heading:0}
  assert.ok(footprintSeparation(a,crossed)<0)
  assert.equal(footprintSeparation(a,crossed),footprintSeparation(crossed,a))
  assert.ok(footprintSeparation(a,outside)>0)
  assert.equal(footprintSeparation({...a,x:NaN},crossed),Infinity)
})

test('British race-start overlapping source locations are suppressed without moving cars',()=>{
  const race=validateHistoricalRace(JSON.parse(readFileSync(new URL('../../../public/history/2024-british/race.json',import.meta.url),'utf8')))
  let rawLength=0;for(let i=1;i<race.track.points.length;i++)rawLength+=Math.hypot(race.track.points[i][0]-race.track.points[i-1][0],race.track.points[i][1]-race.track.points[i-1][1])
  let suppressed=0
  for(let time=0;time<=10;time+=.5){const own=getDriverState(race,44,time);for(const driver of race.drivers.filter(d=>d.number!==44)){const rival=getDriverState(race,driver.number,time);if(cockpitRivalVisibility(own.location,rival.location,rawLength/race.track.length)===0)suppressed++}}
  assert.ok(suppressed>0,'the actual reported race-start overlap must exercise the visibility guard')
})

test('north-up whole-circuit camera fits wide and tall tracks on desktop and mobile',()=>{
  for(const [width,depth] of [[16,4],[4,16],[16,16]])for(const aspect of [.46,1,1.8]){
    const height=circuitOverviewHeight(width,depth,aspect),verticalSpan=2*height*Math.tan(42*Math.PI/360)
    assert.ok(verticalSpan>depth&&verticalSpan*aspect>width)
  }
  assert.equal(REPLAY_CAMERAS.length,8)
  assert.equal(new Set(REPLAY_CAMERAS.map(view=>view.id)).size,8)
  for(const id of ['top','overview','onboard','tcam','chase','helicopter','trackside','strategist'])assert.ok(REPLAY_CAMERAS.some(view=>view.id===id))
})

test('illustrative structures cannot cover a recorded road segment, including rotated buildings',()=>{
  const road=[{x:0,z:0},{x:0,z:40},{x:0,z:80}]
  assert.equal(sceneryClearsRoad(road,{x:12,z:40},0,10,73,1),false)
  assert.equal(sceneryClearsRoad(road,{x:40,z:40},0,10,73,1),true)
  assert.equal(sceneryClearsRoad(road,{x:40,z:40},Math.PI/2,10,73,1),false)
})

test('venue lighting preserves recognizable night races and normal daytime circuits',()=>{
  for(const venue of ['Marina Bay Street Circuit','Singapore','Bahrain International Circuit','Jeddah Corniche Circuit','Las Vegas Strip Circuit','Lusail'])assert.equal(historicalLighting(venue),'night')
  assert.equal(historicalLighting('Yas Marina Circuit'),'twilight')
  for(const venue of ['Monaco','Monza','Silverstone','Albert Park','Spa-Francorchamps'])assert.equal(historicalLighting(venue),'day')
})

test('constructor body paint stays distinct from timing accents, with restrained trim coverage',()=>{
  const mercedes=formulaTeamLivery('Mercedes','#00ffff'),differentTiming=formulaTeamLivery('Mercedes','#ff00ff')
  assert.equal(mercedes.primary,differentTiming.primary,'timing overlay colours must not repaint real team-inspired bodywork')
  assert.notEqual(mercedes.primary,mercedes.accent)
  assert.notEqual(mercedes.halo,mercedes.accent,'the interior halo must remain carbon, not a solid timing colour')
  const ferrari=new Color(formulaTeamLivery('Ferrari').primary),redBull=new Color(formulaTeamLivery('Red Bull Racing').primary)
  assert.ok(ferrari.r>ferrari.b*2&&redBull.b>redBull.r*2)
  const parts=createFormulaCarParts(),triangle=new Triangle(),a=new Vector3(),b=new Vector3(),c=new Vector3()
  let accentArea=0,totalPaintArea=0
  try{
    for(const part of parts.filter(part=>part.paint)){
      const positions=part.geometry.getAttribute('position'),indices=part.geometry.getIndex()
      let area=0;for(let i=0;i<(indices?.count??positions.count);i+=3){a.fromBufferAttribute(positions,indices?indices.getX(i):i);b.fromBufferAttribute(positions,indices?indices.getX(i+1):i+1);c.fromBufferAttribute(positions,indices?indices.getX(i+2):i+2);area+=triangle.set(a,b,c).getArea()}
      totalPaintArea+=area;if(part.paint==='accent')accentArea+=area
    }
    assert.ok(accentArea>0&&accentArea/totalPaintArea<.06,'bright trim should occupy a small fraction of painted surface')
  }finally{parts.forEach(part=>part.geometry.dispose())}
})

test('original fleet geometry is finite, physically proportioned and rests on its tyres',()=>{
  const parts=createFormulaCarParts(),group=new Group(),material=new MeshBasicMaterial()
  try{
    for(const part of parts){
      assert.ok(Array.from(part.geometry.getAttribute('position').array).every(Number.isFinite),'a vertex must never poison a world matrix')
      assert.ok(Array.from(part.geometry.getAttribute('normal').array).every(Number.isFinite),'surface normals must remain finite')
      const mesh=new Mesh(part.geometry,material);mesh.position.set(...part.offset);mesh.rotation.set(...(part.rotation??[0,0,0]));group.add(mesh)
    }
    group.updateMatrixWorld(true)
    const bounds=new Box3().setFromObject(group),size=bounds.getSize(new Vector3())
    assert.ok(size.x>1.8&&size.x<2.2,`Formula-style width should be about 2 m, got ${size.x}`)
    assert.ok(size.z>4.5&&size.z<6,`body and aero must have car proportions, got ${size.z}`)
    assert.ok(size.y>.9&&size.y<1.3)
    assert.ok(Math.abs(bounds.min.y)<epsilon,'tyres must touch the modeled track surface')
  }finally{parts.forEach(part=>part.geometry.dispose());material.dispose()}
})

test('loft faces point outward and remain visible to external cameras',()=>{
  const geometry=bodyGeometry([[-1,.5,0,1],[1,.5,0,1]]),material=new MeshBasicMaterial(),mesh=new Mesh(geometry,material)
  try{
    mesh.updateMatrixWorld(true)
    for(const [origin,direction] of [[new Vector3(0,3,0),new Vector3(0,-1,0)],[new Vector3(3,.5,0),new Vector3(-1,0,0)],[new Vector3(0,.5,3),new Vector3(0,0,-1)],[new Vector3(0,.5,-3),new Vector3(0,0,1)]]){
      assert.ok(new Raycaster(origin,direction).intersectObject(mesh).length>0,'front-sided bodywork must be visible from outside')
    }
  }finally{geometry.dispose();material.dispose()}
})

test('driver eyes have unobstructed sight lines to dashboard and seat through the open tub',()=>{
  const parts=createFormulaCarParts(),material=new MeshBasicMaterial(),group=new Group()
  try{
    for(const part of parts.filter(part=>!part.helmet&&!part.hideInside)){const mesh=new Mesh(part.geometry,material);mesh.position.set(...part.offset);mesh.rotation.set(...(part.rotation??[0,0,0]));group.add(mesh)}
    group.updateMatrixWorld(true)
    const eye=new Vector3(0,FORMULA_DRIVER_EYE.height,FORMULA_DRIVER_EYE.forwardOffset)
    for(const target of [new Vector3(0,.72,.19),new Vector3(0,.38,-.09),new Vector3(.18,.93,2)]){
      const distance=target.distanceTo(eye),ray=new Raycaster(eye,target.clone().sub(eye).normalize(),.025,distance-.01)
      assert.equal(ray.intersectObject(group,true).length,0,'external bodywork must not cover the interior or road view')
    }
  }finally{parts.forEach(part=>part.geometry.dispose());material.dispose()}
})

test('recorded horizontal headings produce matching cockpit direction at any world scale',()=>{
  const origin=new Vector3(7,.215,-4)
  for(const scale of [.003,.009,.02])for(const heading of [0,Math.PI/2,Math.PI,-Math.PI/2]){
    const pose=cockpitCameraPose(origin,heading,scale,{yaw:0,pitch:0})
    const direction=pose.target.clone().sub(pose.position).normalize(),expected=new Vector3(Math.cos(heading),0,-Math.sin(heading))
    assert.ok(direction.distanceTo(expected)<epsilon)
    assert.ok(Math.abs(pose.position.y-origin.y-FORMULA_DRIVER_EYE.height*scale)<epsilon)
    assert.ok(Math.abs(pose.position.clone().sub(origin).dot(expected)-FORMULA_DRIVER_EYE.forwardOffset*scale)<epsilon)
  }
})

test('look left/right and up/down remain intuitive without changing recorded world position',()=>{
  const origin=new Vector3(2,.215,-3),straight=cockpitCameraPose(origin,0,.009,{yaw:0,pitch:0})
  for(const yaw of [-.5,.5]){
    const pose=cockpitCameraPose(origin,0,.009,{yaw,pitch:0}),direction=pose.target.clone().sub(pose.position).normalize()
    assert.ok(pose.position.distanceTo(straight.position)<epsilon)
    // Facing world +X: screen left is -Z, which a positive yaw must produce.
    assert.equal(Math.sign(direction.z),Math.sign(-yaw))
  }
  for(const pitch of [-.5,.5]){const pose=cockpitCameraPose(origin,0,.009,{yaw:0,pitch});assert.equal(Math.sign(pose.target.y-pose.position.y),Math.sign(pitch))}
  assert.throws(()=>cockpitCameraPose(origin,0,0,{yaw:0,pitch:0}))
  assert.throws(()=>cockpitCameraPose(new Vector3(NaN,0,0),0,.009,{yaw:0,pitch:0}))
  assert.throws(()=>bodyGeometry([[-1,.5,0,1],[1,NaN,0,1]]))
})
