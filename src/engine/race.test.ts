import test from 'node:test'
import assert from 'node:assert/strict'
import {
  BASE_STRATEGIES,
  COMPOUNDS,
  DRIVERS,
  PIT_LANE_LOSS,
  TOTAL_LAPS,
  formatDelta,
  formatTime,
  getLapStory,
  raceAtLap,
  simulateStrategy,
  type Strategy,
} from './race.ts'

test('identical inputs produce identical results and leave inputs unchanged', () => {
  const strategy = structuredClone(BASE_STRATEGIES[0])
  const before = structuredClone(strategy)
  const first = simulateStrategy(strategy)
  assert.deepEqual(first, simulateStrategy(strategy))
  assert.deepEqual(strategy, before)
  strategy.pitLaps[0] = 21
  assert.equal(first.strategy.pitLaps[0], 18)
})

test('all baseline strategies obey the dry-race compound rule and complete 46 laps', () => {
  for (const strategy of BASE_STRATEGIES) {
    const result = simulateStrategy(strategy)
    assert.equal(result.valid, true)
    assert.equal(result.laps.length, TOTAL_LAPS)
    assert.ok(result.laps.every((lap) => Number.isFinite(lap.lapTime) && lap.tyreLife >= 0 && lap.tyreLife <= 100))
    assert.equal(result.laps.filter((lap) => lap.pit).length, strategy.pitLaps.length)
  }
})

test('pit loss is included once and totals exactly equal the per-lap sum', () => {
  for (const strategy of BASE_STRATEGIES) {
    const result = simulateStrategy(strategy)
    assert.equal(result.totalTime, result.laps.reduce((sum, lap) => sum + lap.lapTime, 0))
    assert.equal(result.totalTime, result.laps.at(-1)?.elapsed)
    assert.equal(result.pitLoss, PIT_LANE_LOSS * strategy.pitLaps.length)
    assert.ok(Math.abs(result.totalTime - result.laps.reduce((sum, lap) => sum + lap.pace, 0) - result.pitLoss) < 1e-9)
    result.laps.forEach((lap, index) => {
      assert.equal(Math.round((lap.lapTime - lap.pace) * 1_000), lap.pitLoss * 1_000)
      if (index > 0) assert.ok(Math.abs(lap.elapsed - result.laps[index - 1].elapsed - lap.lapTime) < 1e-9)
    })
  }
})

test('a pit event changes the compound and resets tyre age on the following lap', () => {
  const result = simulateStrategy(BASE_STRATEGIES[0])
  assert.equal(result.laps[17].compound, 'medium')
  assert.equal(result.laps[17].tyreAge, 18)
  assert.equal(result.laps[17].pit, true)
  assert.equal(result.laps[18].compound, 'hard')
  assert.equal(result.laps[18].tyreAge, 1)
  assert.equal(result.laps[18].pit, false)
  assert.ok(result.laps[18].tyreLife > result.laps[17].tyreLife)
})

test('changing pit timing, compound or driver pace changes calculated outcomes', () => {
  const reference = simulateStrategy(BASE_STRATEGIES[0])
  const later = simulateStrategy({ ...BASE_STRATEGIES[0], pitLaps: [25] })
  const softer = simulateStrategy({ ...BASE_STRATEGIES[0], compounds: ['soft', 'hard'] })
  const slower = simulateStrategy(BASE_STRATEGIES[0], { ...DRIVERS[0], basePace: DRIVERS[0].basePace + 0.5 })
  assert.notEqual(later.totalTime, reference.totalTime)
  assert.notEqual(softer.totalTime, reference.totalTime)
  assert.ok(Math.abs(slower.totalTime - reference.totalTime - 23) < 1e-9)
  assert.deepEqual(later.laps.slice(0, 17), reference.laps.slice(0, 17))
})

test('safety car changes only its configured laps and reduces pit loss within the window', () => {
  const strategy = { ...BASE_STRATEGIES[0], pitLaps: [22] }
  const green = simulateStrategy(strategy)
  const safety = simulateStrategy(strategy, DRIVERS[0], true)
  assert.equal(green.pitLoss, 22)
  assert.equal(safety.pitLoss, 13.18)
  assert.ok(safety.laps[21].pace > green.laps[21].pace)
  assert.deepEqual(safety.laps.slice(0, 21), green.laps.slice(0, 21))
  assert.equal(safety.laps[24].lapTime, green.laps[24].lapTime)
  assert.equal(simulateStrategy(BASE_STRATEGIES[0], DRIVERS[0], true).pitLoss, 22)
})

test('invalid strategies return clear issues instead of partial or misleading races', () => {
  const badStrategies: Strategy[] = [
    { ...BASE_STRATEGIES[0], compounds: ['medium', 'medium'] },
    { ...BASE_STRATEGIES[0], compounds: ['medium'] },
    { ...BASE_STRATEGIES[1], pitLaps: [29, 13] },
    { ...BASE_STRATEGIES[1], pitLaps: [13, 13] },
    ...[0, 46, 18.5, NaN, Infinity].map((lap) => ({ ...BASE_STRATEGIES[0], pitLaps: [lap] })),
    { ...BASE_STRATEGIES[0], compounds: ['medium', 'wet' as 'hard'] },
  ]
  for (const strategy of badStrategies) {
    const result = simulateStrategy(strategy)
    assert.equal(result.valid, false)
    assert.ok(result.issues.length > 0)
    assert.deepEqual(result.laps, [])
    assert.equal(result.totalTime, Infinity)
  }
  assert.equal(simulateStrategy(BASE_STRATEGIES[0], { ...DRIVERS[0], basePace: NaN }).valid, false)
})

test('replay positions, gaps and lap states match the independent driver simulations', () => {
  for (const safetyCar of [false, true]) {
    for (let lap = 1; lap <= TOTAL_LAPS; lap++) {
      const field = raceAtLap(lap, safetyCar)
      assert.equal(field[0].gap, 0)
      field.forEach((entry, index) => {
        assert.equal(entry.position, index + 1)
        assert.deepEqual(entry.data, simulateStrategy(entry.driver.strategy, entry.driver, safetyCar).laps[lap - 1])
        assert.ok(Math.abs(entry.gap - (entry.data.elapsed - field[0].data.elapsed)) <= 0.0005)
        if (index > 0) assert.ok(entry.data.elapsed >= field[index - 1].data.elapsed)
      })
    }
  }
  assert.equal(raceAtLap(-5)[0].data.lap, 1)
  assert.equal(raceAtLap(500)[0].data.lap, TOTAL_LAPS)
})

test('tyre age and compound inputs explain the pace differences', () => {
  const result = simulateStrategy({ id: 'wear', name: 'Wear check', compounds: ['soft', 'hard'], pitLaps: [35] })
  assert.ok(COMPOUNDS.soft.degradation > COMPOUNDS.hard.degradation)
  assert.ok(result.laps[30].pace > result.laps[20].pace)
  assert.ok(result.laps[35].pace < result.laps[34].pace)
})

test('timing helpers round correctly at minute boundaries and safely display invalid values', () => {
  assert.equal(formatTime(92.84), '1:32.840')
  assert.equal(formatTime(59.9999), '1:00.000')
  assert.equal(formatTime(0), '0:00.000')
  assert.equal(formatTime(Infinity), '—')
  assert.equal(formatDelta(1.8), '+1.800s')
  assert.equal(formatDelta(-1.8), '−1.800s')
  assert.equal(formatDelta(-0.00001), '0.000s')
  assert.equal(formatDelta(NaN), '—')
})

test('contextual stories cover each lap and derive the finish from the model', () => {
  for (let lap = 1; lap <= TOTAL_LAPS; lap++) {
    const story = getLapStory(lap)
    assert.ok(story.title && story.what && story.why && story.impact)
  }
  const winner = raceAtLap(46)[0]
  assert.ok(getLapStory(46).what.includes(winner.driver.name))
  assert.ok(getLapStory(46).what.includes(formatTime(winner.data.elapsed)))
})
