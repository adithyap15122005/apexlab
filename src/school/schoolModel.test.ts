import test from 'node:test'
import assert from 'node:assert/strict'
import { bestPlan, evaluatePlan, fastestTyre, gameResult, grip, lapTime, newGame, pitPayback, progressAt, stadiumPoint, stepGame, undercutScenario, type Tyre } from './schoolModel'

test('tyres behave the way the lessons explain',()=>{
  assert.ok(lapTime('soft',0)<lapTime('medium',0)&&lapTime('medium',0)<lapTime('hard',0),'softer is faster when new')
  assert.ok(lapTime('soft',22)>lapTime('hard',22),'softer wears out sooner')
  for(const t of ['soft','medium','hard'] as Tyre[])for(let a=1;a<40;a++)assert.ok(lapTime(t,a)>=lapTime(t,a-1),'old tyres never get faster')
  assert.equal(grip('soft',0),100);assert.ok(grip('soft',10)<grip('hard',10));assert.equal(grip('soft',30),0)
  assert.equal(fastestTyre(0),'soft');assert.equal(fastestTyre(.45),'inter');assert.equal(fastestTyre(1),'wet')
})

test('a pit stop pays back only with enough laps left',()=>{
  assert.equal(pitPayback('medium',24,'medium',20).worth,true)
  assert.equal(pitPayback('medium',24,'medium',2).worth,false)
  assert.ok(pitPayback('medium',24,'medium',2).perLap>0,'fresh tyres are faster per lap')
})

test('the undercut works from close behind and fails from far behind',()=>{
  assert.equal(undercutScenario(.8).worked,true)
  assert.equal(undercutScenario(2.5).worked,false)
  const gaps=undercutScenario(1).gaps
  assert.ok(gaps[2]>15,'the pit lap costs about 20 seconds')
})

test('race plans follow the two-tyre rule and the optimiser finds the best one',()=>{
  assert.equal(evaluatePlan([{tyre:'soft',laps:30}],30).legal,false)
  assert.match(evaluatePlan([{tyre:'soft',laps:15},{tyre:'soft',laps:15}],30).issue!,/two different/)
  assert.match(evaluatePlan([{tyre:'soft',laps:10},{tyre:'hard',laps:10}],30).issue!,/30 laps/)
  const best=bestPlan(30)
  assert.equal(evaluatePlan(best.stints,30).legal,true)
  for(const plan of [[{tyre:'medium',laps:15},{tyre:'hard',laps:15}],[{tyre:'soft',laps:10},{tyre:'medium',laps:10},{tyre:'soft',laps:10}],[{tyre:'hard',laps:20},{tyre:'soft',laps:10}]] as {tyre:Tyre;laps:number}[][])
    assert.ok(best.time<=evaluatePlan(plan,30).time+1e-9)
})

test('the lesson track is a continuous closed loop',()=>{
  for(let f=0;f<1;f+=.002){const a=stadiumPoint(f),b=stadiumPoint(f+.002);assert.ok(Math.hypot(a.x-b.x,a.y-b.y)<4,`jump at ${f}`)}
  const start=stadiumPoint(0),end=stadiumPoint(1)
  assert.ok(Math.hypot(start.x-end.x,start.y-end.y)<1e-6)
  assert.equal(progressAt([90,90,90],135),1.5)
})

function play(start:Tyre,boxes:(state:ReturnType<typeof newGame>)=>Record<number,Tyre>,seed:number){
  let state=newGame(start,seed);const plan=boxes(state)
  for(let lap=1;lap<=state.laps;lap++)state=stepGame(state,plan[lap]??null)
  return {state,result:gameResult(state)}
}
test('the race-engineer game rewards good strategy and enforces the rules',()=>{
  for(const seed of [1,2,3,4,5,6]){
    const smart=play('medium',s=>({[s.safetyCar[0]]:'hard'}),seed)
    assert.equal(smart.result.position,1,'stopping under the safety car wins')
    assert.ok(smart.state.cars.find(c=>c.id==='you')!.stops[0].cheap)
    const lazy=play('medium',()=>({}),seed)
    assert.equal(lazy.result.legal,false);assert.equal(lazy.result.position,5,'one tyre type is classified last')
    assert.ok(lazy.result.tips.some(t=>/two different types/.test(t)))
  }
  const a=play('soft',()=>({10:'medium'}),42),b=play('soft',()=>({10:'medium'}),42)
  assert.deepEqual(a.result,b.result,'the same choices give the same result')
  const sc=newGame('soft',9).safetyCar
  assert.ok(sc[0]>=8&&sc[0]<=15&&sc[1]===sc[0]+1)
})
