/**
 * The Apex Grand Prix is a fictional, dry, 46-lap teaching scenario.
 * Times are seconds. Pit events happen at the END of the named lap; the next
 * lap uses the replacement tyre. Every lapTime includes its own pitLoss once.
 */
export type Compound = 'soft' | 'medium' | 'hard'

export type Strategy = {
  id: string
  name: string
  compounds: Compound[]
  pitLaps: number[]
}

export type Driver = {
  id: string
  name: string
  short: string
  color: string
  basePace: number
  strategy: Strategy
}

export type LapData = {
  lap: number
  lapTime: number
  elapsed: number
  compound: Compound
  tyreAge: number
  tyreLife: number
  pit: boolean
  pitLoss: number
  /** Lap pace, including fuel, wear, out-lap, traffic and SC effects; no pit loss. */
  pace: number
}

export type RaceResult = {
  laps: LapData[]
  totalTime: number
  pitLoss: number
  valid: boolean
  issues: string[]
  strategy: Strategy
}

export const TOTAL_LAPS = 46
export const PIT_LANE_LOSS = 22
export const STATIONARY_STOP_TIME = 2.4
export const SAFETY_CAR_LAPS = [22, 23, 24] as const

export const COMPOUNDS: Record<Compound, {
  name: string
  letter: string
  color: string
  pace: number
  degradation: number
  life: number
}> = {
  soft: { name: 'Soft', letter: 'S', color: '#FF6559', pace: -0.65, degradation: 0.115, life: 20 },
  medium: { name: 'Medium', letter: 'M', color: '#D7FF43', pace: 0, degradation: 0.075, life: 32 },
  hard: { name: 'Hard', letter: 'H', color: '#F2F1EC', pace: 0.55, degradation: 0.045, life: 42 },
}

export const BASE_STRATEGIES: Strategy[] = [
  { id: 'a', name: 'The balanced one-stop', compounds: ['medium', 'hard'], pitLaps: [18] },
  { id: 'b', name: 'The attacking two-stop', compounds: ['soft', 'medium', 'medium'], pitLaps: [13, 29] },
  { id: 'c', name: 'The long game', compounds: ['hard', 'medium'], pitLaps: [27] },
]

export const DRIVERS: Driver[] = [
  { id: 'sato', name: 'Kai Sato', short: 'KSA', color: '#D7FF43', basePace: 89.35, strategy: { ...BASE_STRATEGIES[0], id: 'kai', name: 'Kai · balanced one-stop', compounds: ['medium', 'hard'], pitLaps: [18] } },
  { id: 'moretti', name: 'Luca Moretti', short: 'LMO', color: '#64D9E8', basePace: 89.4, strategy: { id: 'luca', name: 'Luca · early one-stop', compounds: ['medium', 'hard'], pitLaps: [17] } },
  { id: 'costa', name: 'Elena Costa', short: 'ECO', color: '#FF6559', basePace: 89.6, strategy: { ...BASE_STRATEGIES[2], id: 'elena', name: 'Elena · long first stint', compounds: ['hard', 'medium'], pitLaps: [27] } },
]

const milliseconds = (value: number) => Math.round(value * 1_000) / 1_000
const isCompound = (value: unknown): value is Compound => value === 'soft' || value === 'medium' || value === 'hard'
const boundedLap = (lap: number) => Math.max(1, Math.min(TOTAL_LAPS, Number.isFinite(lap) ? Math.floor(lap) : 1))
const isSafetyCarLap = (lap: number, enabled: boolean) => enabled && lap >= 22 && lap <= 24

function validate(strategy: Strategy, driver: Driver): string[] {
  const issues: string[] = []
  if (!strategy || !Array.isArray(strategy.compounds) || !Array.isArray(strategy.pitLaps)) {
    return ['Choose a tyre compound for every stint and supply a list of pit laps.']
  }
  if (strategy.compounds.length !== strategy.pitLaps.length + 1) {
    issues.push('Each pit stop needs one replacement tyre stint.')
  }
  if (strategy.compounds.some((compound) => !isCompound(compound))) {
    issues.push('Choose soft, medium or hard tyres for every stint.')
  }
  if (new Set(strategy.compounds.filter(isCompound)).size < 2) {
    issues.push('This dry demo requires at least two different tyre compounds.')
  }
  if (strategy.pitLaps.some((lap) => !Number.isInteger(lap) || lap < 1 || lap >= TOTAL_LAPS)) {
    issues.push(`Pit laps must be whole numbers from 1 to ${TOTAL_LAPS - 1}.`)
  }
  if (strategy.pitLaps.some((lap, index) => index > 0 && lap <= strategy.pitLaps[index - 1])) {
    issues.push('Pit laps must be different and in increasing order.')
  }
  if (!driver || !Number.isFinite(driver.basePace) || driver.basePace <= 0) {
    issues.push('The selected driver needs a positive baseline lap pace.')
  }
  return issues
}

/**
 * pace = baseline + compound + linear age wear + late-stint wear + fuel
 *        + out-lap + assumed rejoining traffic.
 *
 * Fuel adds 1.8 s on lap 1, falling linearly to zero on lap 46. Wear starts
 * at zero on fresh tyres; exceeding nominal life adds 0.055 × excessAge² s.
 * A replacement set adds a small first-lap warm-up cost. For three laps
 * after a stop, an assumed traffic penalty fades from 0.60 s (early stop)
 * or 0.24 s (late stop). This is an explicit teaching assumption, not an
 * overtaking or aerodynamic model. SC pace is 126 s plus 5% of green pace
 * above 89 s; wear continues and no field bunching or overtakes are modeled.
 */
export function simulateStrategy(
  strategy: Strategy,
  driver: Driver = DRIVERS[0],
  safetyCar = false,
): RaceResult {
  const issues = validate(strategy, driver)
  if (issues.length) return { laps: [], totalTime: Number.POSITIVE_INFINITY, pitLoss: 0, valid: false, issues, strategy }

  // Snapshot inputs so editing controls cannot mutate a previously displayed run.
  const snapshot = { ...strategy, compounds: [...strategy.compounds], pitLaps: [...strategy.pitLaps] }
  const laps: LapData[] = []
  let stint = 0
  let previousPit = 0
  let elapsed = 0
  let totalPitLoss = 0

  for (let lap = 1; lap <= TOTAL_LAPS; lap += 1) {
    const compound = snapshot.compounds[stint]
    const tyre = COMPOUNDS[compound]
    const tyreAge = lap - previousPit
    const wear = (tyreAge - 1) * tyre.degradation + 0.055 * Math.max(0, tyreAge - tyre.life) ** 2
    const fuel = 1.8 * (TOTAL_LAPS - lap) / (TOTAL_LAPS - 1)
    const outlap = previousPit > 0 && tyreAge === 1 ? (compound === 'hard' ? 0.48 : compound === 'medium' ? 0.3 : 0.16) : 0
    const traffic = previousPit > 0 && tyreAge <= 3 ? (previousPit <= 20 ? 0.6 : 0.24) * (4 - tyreAge) / 3 : 0
    const greenPace = driver.basePace + tyre.pace + wear + fuel + outlap + traffic
    const underSafetyCar = isSafetyCarLap(lap, safetyCar)
    const pace = milliseconds(underSafetyCar ? 126 + (greenPace - 89) * 0.05 : greenPace)
    const pit = snapshot.pitLaps[stint] === lap
    // 22 s total = 19.6 s moving loss + 2.4 s stationary, counted once.
    const pitLoss = pit ? milliseconds(underSafetyCar ? STATIONARY_STOP_TIME + (PIT_LANE_LOSS - STATIONARY_STOP_TIME) * 0.55 : PIT_LANE_LOSS) : 0
    const lapTime = milliseconds(pace + pitLoss)
    elapsed += lapTime
    totalPitLoss += pitLoss
    laps.push({
      lap,
      lapTime,
      elapsed,
      compound,
      tyreAge,
      tyreLife: milliseconds(Math.max(0, 100 * (1 - tyreAge / tyre.life))),
      pit,
      pitLoss,
      pace,
    })
    if (pit) {
      previousPit = lap
      stint += 1
    }
  }

  return { laps, totalTime: elapsed, pitLoss: totalPitLoss, valid: true, issues: [], strategy: snapshot }
}

export function raceAtLap(lap: number, safetyCar = false): Array<{ driver: Driver; data: LapData; position: number; gap: number }> {
  const index = boundedLap(lap) - 1
  const field = DRIVERS.map((driver) => ({ driver, data: simulateStrategy(driver.strategy, driver, safetyCar).laps[index] }))
    .sort((a, b) => a.data.elapsed - b.data.elapsed || a.driver.id.localeCompare(b.driver.id))
  const leaderTime = field[0].data.elapsed
  return field.map((entry, index) => ({ ...entry, position: index + 1, gap: milliseconds(entry.data.elapsed - leaderTime) }))
}

/** Formats both lap times and full race durations, without 59.1000 rollover. */
export function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds)) return '—'
  const negative = seconds < 0
  const totalMs = Math.round(Math.abs(seconds) * 1_000)
  const minutes = Math.floor(totalMs / 60_000)
  const secondsPart = Math.floor(totalMs % 60_000 / 1_000).toString().padStart(2, '0')
  const millisPart = (totalMs % 1_000).toString().padStart(3, '0')
  return `${negative ? '−' : ''}${minutes}:${secondsPart}.${millisPart}`
}

export function formatDelta(seconds: number): string {
  if (!Number.isFinite(seconds)) return '—'
  const rounded = milliseconds(seconds)
  return `${rounded > 0 ? '+' : rounded < 0 ? '−' : ''}${Math.abs(rounded).toFixed(3)}s`
}

/** Narratives use the same baseline results shown in replay (SC is optional there). */
export function getLapStory(selectedLap: number): { title: string; what: string; why: string; impact: string } {
  const lap = boundedLap(selectedLap)
  const kai = simulateStrategy(DRIVERS[0].strategy).laps[lap - 1]
  const rival = simulateStrategy(DRIVERS[1].strategy, DRIVERS[1]).laps[lap - 1]
  const field = raceAtLap(lap)
  if (lap === 1) return {
    title: 'Lights out. Decisions begin.',
    what: 'Three drivers begin the fictional Apex Grand Prix. Kai and Luca start on medium tyres; Elena chooses hard.',
    why: 'Mediums offer more initial pace, while hard tyres lose performance more slowly as they age.',
    impact: 'Follow the same 46 laps to see how those starting choices create different pit windows.',
  }
  if (lap === 17) return {
    title: 'Luca makes the first move.',
    what: 'Luca pits at the end of lap 17, taking hard tyres and a 22.000s total pit-lane loss.',
    why: 'An earlier stop trades track position for a fresh set. His new hard tyres begin working on lap 18.',
    impact: 'Kai now faces the undercut: can Luca recover that time on fresher tyres?',
  }
  if (lap === 18) {
    const advantage = milliseconds(kai.pace - rival.pace)
    return {
      title: 'The undercut threat.',
      what: 'Luca is on fresh hard tyres. Kai completes his 18th lap on mediums and pits at the end of this lap.',
      why: advantage > 0
        ? `Luca's modeled driving pace is ${formatDelta(advantage).replace('+', '')} quicker this lap, including his out-lap and traffic costs.`
        : `Fresh hard tyres need warming up: Luca's modeled pace is ${formatDelta(-advantage).replace('+', '')} slower this lap, including traffic.`,
      impact: 'Move the stop in Pit Wall to test how a later stop balances tyre life against time spent on worn tyres.',
    }
  }
  if (lap >= 22 && lap <= 24) return {
    title: 'A possible safety-car window.',
    what: 'The optional safety-car scenario slows laps 22–24. The baseline replay remains under green conditions unless you enable it.',
    why: 'At reduced racing speed, the moving portion of a pit stop costs less time relative to cars on track.',
    impact: 'Enable the scenario in Pit Wall, then compare a lap-22 stop against an earlier stop. The model reduces total pit loss to 13.180s.',
  }
  if (lap === 27) return {
    title: 'Elena ends the long first stint.',
    what: 'Elena pits after 27 laps on hard tyres. Her new mediums start on lap 28.',
    why: 'The slower-wearing hard compound allowed a longer opening stint, leaving fewer laps to complete on mediums.',
    impact: 'Compare her elapsed time and remaining tyre life against the earlier-stopping drivers.',
  }
  if (lap === TOTAL_LAPS) return {
    title: 'Every decision adds up.',
    what: `${field[0].driver.name} leads this three-driver sample at the finish in ${formatTime(field[0].data.elapsed)}.`,
    why: 'The result sums every predicted lap, with each pit stop included exactly once.',
    impact: 'Try changing a pit lap or tyre compound. An identical strategy always produces the same result.',
  }
  return {
    title: kai.tyreAge <= 3 && lap > 18 ? 'A new stint takes shape.' : 'Every lap has a cost.',
    what: `Kai completes lap ${lap} on ${COMPOUNDS[kai.compound].name.toLowerCase()} tyres aged ${kai.tyreAge} lap${kai.tyreAge === 1 ? '' : 's'}, with a modeled lap time of ${formatTime(kai.lapTime)}.`,
    why: 'Tyre wear increases the pace cost with age, while a lighter fuel load makes the car progressively quicker.',
    impact: `Kai's modeled driving pace is ${formatDelta(kai.pace - rival.pace)} relative to Luca on this lap. Pit-lane loss is displayed separately.`,
  }
}
