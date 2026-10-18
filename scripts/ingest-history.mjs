/** Download/cache the recorded 2024 British GP without API credentials.
 * Run from the repository: node scripts/ingest-history.mjs [--cache PATH]
 * Requests are sequential, cached, and spaced to respect OpenF1's
 * documented free limits of 3/s and 30/min. No browser API polling.
 */
import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createHash } from 'node:crypto'

const appRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const cacheFlag = process.argv.indexOf('--cache')
const cache = path.resolve(cacheFlag >= 0 ? process.argv[cacheFlag + 1] : path.join(appRoot, '..', 'historical-ingestion', 'raw', '9558'))
await fs.mkdir(cache, { recursive: true })
const SESSION = 9558
const BASE = 'https://api.openf1.org/v1/'
const headers = { 'User-Agent': 'ApexLabHistoricalIngestion/1.0 (educational noncommercial project)' }
const manifestPath = path.join(cache, 'sources.json')
let manifest
try { manifest = JSON.parse(await fs.readFile(manifestPath, 'utf8')) } catch { manifest = { session: SESSION, sources: [] } }
let lastRequestAt = 0
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms))
async function download(name, url, optional = false) {
  const destination = path.join(cache, `${name}.json`)
  if (optional && manifest.sources.some(source => source.name === name && source.available === false)) return null
  try {
    const cached = JSON.parse(await fs.readFile(destination, 'utf8'))
    console.log(JSON.stringify({ name, cached: true, records: Array.isArray(cached) ? cached.length : undefined }))
    return cached
  } catch { /* Missing/invalid cache is fetched again. */ }
  for (let attempt = 0; attempt < 5; attempt++) {
    await sleep(Math.max(0, 2150 - (Date.now() - lastRequestAt)))
    lastRequestAt = Date.now()
    const response = await fetch(url, { headers, signal: AbortSignal.timeout(120000) })
    if (response.status === 429 || response.status >= 500) {
      const retry = Number(response.headers.get('retry-after'))
      await sleep(Number.isFinite(retry) && retry > 0 ? retry * 1000 : 5000 * (attempt + 1))
      continue
    }
    if (optional && response.status === 404) {
      manifest.sources = manifest.sources.filter(source => source.name !== name)
      manifest.sources.push({ name, url, retrievedAt: new Date().toISOString(), status: 404, available: false })
      await fs.writeFile(manifestPath, JSON.stringify(manifest, null, 2))
      console.log(JSON.stringify({ name, status: 404, available: false }))
      return null
    }
    if (!response.ok) throw new Error(`${name}: HTTP ${response.status}`)
    const body = await response.text()
    const data = JSON.parse(body)
    await fs.writeFile(destination, body)
    manifest.sources = manifest.sources.filter(source => source.name !== name)
    manifest.sources.push({ name, url, retrievedAt: new Date().toISOString(), status: response.status, bytes: Buffer.byteLength(body), sha256: createHash('sha256').update(body).digest('hex'), records: Array.isArray(data) ? data.length : undefined })
    await fs.writeFile(manifestPath, JSON.stringify(manifest, null, 2))
    console.log(JSON.stringify({ name, records: Array.isArray(data) ? data.length : undefined, bytes: Buffer.byteLength(body) }))
    return data
  }
  throw new Error(`${name}: retries exhausted`)
}

for (const endpoint of ['sessions', 'drivers', 'laps', 'position', 'intervals', 'pit', 'stints', 'weather', 'race_control', 'session_result']) {
  await download(endpoint, `${BASE}${endpoint}?session_key=${SESSION}`)
}
await download('starting_grid', `${BASE}starting_grid?session_key=${SESSION}`, true)
await download('jolpica-results', 'https://api.jolpi.ca/ergast/f1/2024/12/results.json?limit=100')
await download('jolpica-first-lap', 'https://api.jolpi.ca/ergast/f1/2024/12/laps/1.json?limit=100')
const drivers = JSON.parse(await fs.readFile(path.join(cache, 'drivers.json'), 'utf8'))
for (const driver of drivers) {
  await download(`location-${driver.driver_number}`, `${BASE}location?session_key=${SESSION}&driver_number=${driver.driver_number}`)
}
{
  for (const driver of drivers) {
    await download(`car_data-${driver.driver_number}`, `${BASE}car_data?session_key=${SESSION}&driver_number=${driver.driver_number}`)
  }
}
// Fill provenance for files produced by the initial availability probes.
for (const filename of await fs.readdir(cache)) {
  if (!filename.endsWith('.json') || filename === 'sources.json') continue
  const name = filename.slice(0, -5)
  if (manifest.sources.some(source => source.name === name)) continue
  const body = await fs.readFile(path.join(cache, filename), 'utf8')
  const data = JSON.parse(body)
  const [endpoint, driverNumber] = name.split('-')
  const url = `${BASE}${endpoint}?session_key=${SESSION}${driverNumber ? `&driver_number=${driverNumber}` : ''}`
  manifest.sources.push({ name, url, retrievedAt: (await fs.stat(path.join(cache, filename))).mtime.toISOString(), status: 200, bytes: Buffer.byteLength(body), sha256: createHash('sha256').update(body).digest('hex'), records: Array.isArray(data) ? data.length : undefined })
}
await fs.writeFile(manifestPath, JSON.stringify(manifest, null, 2))
console.log('Raw source cache complete.')


export async function normalizeHistory(cache, output) {
  const read = async name => JSON.parse(await fs.readFile(path.join(cache, `${name}.json`), 'utf8'))
  const [sessionRows, rawDrivers, rawLaps, rawPositions, rawIntervals, rawPits, rawStints, rawWeather, rawControl, rawResults, jolpica] = await Promise.all(['sessions', 'drivers', 'laps', 'position', 'intervals', 'pit', 'stints', 'weather', 'race_control', 'session_result', 'jolpica-results'].map(read))
  const session = sessionRows[0]
  const started = rawControl.find(event => event.category === 'SessionStatus' && event.message === 'SESSION STARTED')
  if (!started) throw new Error('No recorded race-start event; refusing to invent a race origin.')
  const startEpochMs = Date.parse(started.date)
  const seconds = date => date == null ? null : Math.round((Date.parse(date) - startEpochMs) / 1000 * 1000) / 1000
  const round = value => Math.round(value * 1000) / 1000
  const nullable = value => typeof value === 'number' && Number.isFinite(value) ? value : null
  const percentage = value => typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 100 ? value : null
  const resultRows = jolpica.MRData.RaceTable.Races[0].Results
  const drivers = rawDrivers.map(driver => {
    const official = resultRows.find(result => Number(result.number) === driver.driver_number)
    const recorded = rawResults.find(result => result.driver_number === driver.driver_number)
    return {
      number: driver.driver_number, code: driver.name_acronym,
      name: `${driver.first_name} ${driver.last_name}`, team: driver.team_name,
      color: `#${driver.team_colour}`, grid: official ? Number(official.grid) : null,
      finishPosition: official ? Number(official.position) : nullable(recorded?.position),
      classifiedLaps: official ? Number(official.laps) : nullable(recorded?.number_of_laps),
      resultTime: official?.Time?.millis ? Number(official.Time.millis) / 1000 : nullable(recorded?.duration),
      status: official?.status ?? (recorded?.dns ? 'Did not start' : recorded?.dnf ? 'Retired' : 'Unknown'),
    }
  }).sort((a, b) => (a.grid ?? 99) - (b.grid ?? 99))
  const laps = {}, ends = {}
  for (const driver of drivers) {
    laps[driver.number] = rawLaps.filter(lap => lap.driver_number === driver.number).sort((a, b) => a.lap_number - b.lap_number).map(lap => {
      const start = seconds(lap.date_start), duration = nullable(lap.lap_duration)
      return { lap: lap.lap_number, start, end: start !== null && duration !== null ? round(start + duration) : null, duration, sector1: nullable(lap.duration_sector_1), sector2: nullable(lap.duration_sector_2), sector3: nullable(lap.duration_sector_3) }
    })
    ends[driver.number] = Math.max(0, ...laps[driver.number].filter(lap => lap.lap <= (driver.classifiedLaps ?? 0) && lap.end !== null).map(lap => lap.end))
  }
  const duration = Math.max(...Object.values(ends))
  const positions = {}, intervals = {}, locations = {}, telemetryFiles = {}, coverageByDriver = []

  // Keep source values and source timestamps: choose the nearest original
  // sample to each whole second, never create coordinates or telemetry values.
  function nearestSecond(rows, end, mapper) {
    if (!rows.length || end <= 0) return []
    const out = [], used = new Set()
    let index = 0
    const append = row => { if (row && !used.has(row.date)) { used.add(row.date); out.push(mapper(row)) } }
    for (let target = 0; target <= Math.ceil(end); target++) {
      while (index + 1 < rows.length && Math.abs(rows[index + 1].time - target) < Math.abs(rows[index].time - target)) index++
      if (Math.abs(rows[index].time - target) <= .8) append(rows[index])
    }
    append(rows.find(row => row.time >= end)) // Preserve the finish bracket.
    return out.sort((a, b) => a[0] - b[0])
  }
  function cropTimed(rows, end) {
    const sorted = rows.map(row => ({ ...row, time: seconds(row.date) })).filter(row => row.time !== null).sort((a, b) => a.time - b.time)
    const before = sorted.findLast(row => row.time < 0)
    return [...(before ? [before] : []), ...sorted.filter(row => row.time >= 0 && row.time <= end)]
  }
  await fs.mkdir(output, { recursive: true })
  let rawLocationTotal = 0, sampledLocationTotal = 0
  const rawLocationByDriver = {}
  for (const driver of drivers) {
    const number = driver.number, end = ends[number]
    const rawLocation = await read(`location-${number}`)
    rawLocationByDriver[number] = rawLocation
    rawLocationTotal += rawLocation.length
    const validLocations = rawLocation.filter(row => [row.x, row.y, row.z].every(Number.isFinite) && !(row.x === 0 && row.y === 0 && row.z === 0)).map(row => ({ ...row, time: seconds(row.date) })).filter(row => row.time >= -1 && row.time <= end + 1).sort((a, b) => a.time - b.time)
    locations[number] = nearestSecond(validLocations, end, row => [row.time, row.x, row.y, row.z])
    sampledLocationTotal += locations[number].length
    positions[number] = cropTimed(rawPositions.filter(row => row.driver_number === number), duration).map(row => [row.time, row.position])
    intervals[number] = cropTimed(rawIntervals.filter(row => row.driver_number === number), duration).map(row => ({ time: row.time, gap: row.gap_to_leader ?? null, interval: row.interval ?? null }))
    const rawCar = await read(`car_data-${number}`)
    const carRows = rawCar.map(row => ({ ...row, time: seconds(row.date) })).filter(row => row.time >= -1 && row.time <= end + 1).sort((a, b) => a.time - b.time)
    const telemetry = nearestSecond(carRows, end, row => [row.time, nullable(row.speed), percentage(row.throttle), percentage(row.brake), nullable(row.n_gear), nullable(row.rpm), nullable(row.drs)])
    const filename = `telemetry-${number}.json`
    await fs.writeFile(path.join(output, filename), JSON.stringify(telemetry))
    telemetryFiles[number] = `/history/2024-british/${filename}`
    const gaps = locations[number].slice(1).map((row, i) => round(row[0] - locations[number][i][0]))
    coverageByDriver.push({ driver: number, code: driver.code, status: driver.status, classifiedLaps: driver.classifiedLaps, competitiveEnd: end, rawLocationSamples: rawLocation.length, locationSamples: locations[number].length, telemetrySamples: telemetry.length, firstLocationTime: locations[number][0]?.[0] ?? null, lastLocationTime: locations[number].at(-1)?.[0] ?? null, gapsOverThreeSeconds: gaps.filter(gap => gap > 3).length, largestGapSeconds: Math.max(0, ...gaps) })
  }
  const stints = rawStints.map(row => ({ driver: row.driver_number, stint: row.stint_number, lapStart: row.lap_start, lapEnd: row.lap_end, compound: row.compound ?? 'UNKNOWN', tyreAgeAtStart: nullable(row.tyre_age_at_start) }))
  const pits = rawPits.map(row => ({ driver: row.driver_number, lap: row.lap_number, time: round(seconds(row.date) - (row.lane_duration ?? row.pit_duration ?? 0)), duration: nullable(row.lane_duration ?? row.pit_duration), stationary: nullable(row.stop_duration) })).sort((a, b) => a.time - b.time)
  const weather = cropTimed(rawWeather, duration).map(row => ({ time: row.time, airTemp: nullable(row.air_temperature), trackTemp: nullable(row.track_temperature), rainfall: nullable(row.rainfall) }))
  const events = rawControl.filter(row => seconds(row.date) >= 0 && seconds(row.date) <= duration).map((row, i) => ({
    id: `rc-${i}`, time: seconds(row.date), lap: nullable(row.lap_number), driver: nullable(row.driver_number),
    type: row.message === 'SESSION STARTED' ? 'start' : row.message === 'SESSION FINISHED' || row.flag === 'CHEQUERED' ? 'finish' : 'race-control',
    title: row.flag ? `${row.flag.replaceAll('_', ' ')} flag` : row.category === 'SessionStatus' ? row.message : 'Race control',
    message: row.message, ...(row.flag ? { flag: row.flag } : {}),
  }))
  pits.forEach((pit, index) => events.push({ id: `pit-${index}`, time: pit.time, lap: pit.lap, driver: pit.driver, type: 'pit', title: `${drivers.find(driver => driver.number === pit.driver)?.code ?? pit.driver} · pit stop`, message: `Lap ${pit.lap}: reported pit-lane duration ${pit.duration ?? 'unavailable'}s. Entry time inferred from the provider timing message minus lane duration. Stationary service time was not supplied for this event.` }))
  weather.forEach((row, i) => { if (i > 0 && row.rainfall !== weather[i - 1].rainfall) events.push({ id: `weather-${i}`, time: row.time, lap: null, driver: null, type: 'weather', title: row.rainfall ? 'Rain sensor active' : 'Rain sensor clear', message: `Recorded weather rainfall flag changed to ${row.rainfall}. This is a circuit weather observation, not a prediction of grip.` }) })
  events.sort((a, b) => a.time - b.time)

  // Hamilton's lap 8 is a complete pre-rain, non-pit lap. Retain the full
  // original location trace as the map reference, not a fictional circuit.
  const trackLap = laps[44].find(lap => lap.lap === 8)
  if (!trackLap?.start || !trackLap.end) throw new Error('Selected recorded track-reference lap unavailable.')
  const trackPoints = rawLocationByDriver[44].filter(row => { const time = seconds(row.date); return time >= trackLap.start && time <= trackLap.end && !(row.x === 0 && row.y === 0 && row.z === 0) }).map(row => [row.x, row.y, row.z])
  const pitExample = pits.find(pit => pit.driver === 44 && pit.lap === 27)
  const pitPoints = rawLocationByDriver[44].filter(row => { const time = seconds(row.date); return time >= pitExample.time - 2 && time <= pitExample.time + pitExample.duration + 2 }).map(row => [row.x, row.y, row.z])
  const notes = [
    'Recorded race origin: OpenF1 race_control SESSION STARTED at 2024-07-07T14:03:12.540Z; scheduled session start is not used as race start.',
    'All 20 entered drivers are included. Pierre Gasly did not start: his competitive locations and telemetry are empty. George Russell retired after 33 completed laps; the incomplete lap 34 is retained with null duration/end.',
    'Location and car-data values are original provider samples nearest each whole replay second. Ingestion performs no coordinate interpolation, invented laps, or generated telemetry. A finish-bracketing sample may be slightly after a completed lap end.',
    'OpenF1 location is approximate (~3.7 Hz upstream), arbitrary local Cartesian coordinates, and does not establish exact lateral placement. The compact snapshot is approximately 1 Hz. Do not interpolate a gap longer than 3 seconds.',
    'Playback extends to the final competitive lap end of the last finisher; the winner official classification time is separately stored in that driver resultTime. OpenF1 timestamp-derived lap ends can differ by fractions of a second from official classification totals.',
    'Unknown raw lap start, duration, sector times and uncompleted lap end remain null. Sergio Perez lap 1 start/duration are missing in OpenF1; no replacement timing was fabricated. Jolpica first-lap data is cached only for validation, not silently mixed into the OpenF1 lap timeline.',
    'Throttle/brake values outside 0–100 (including provider value 104) are invalid percentages and become null, never clamped to a fabricated reading. Other available numeric telemetry values retain the recorded source value.',
    'Pit time is an approximate inferred entry: OpenF1 timing-message timestamp minus recorded lane_duration. duration means time in the pit lane, not net time lost against a car on the circuit. British 2024 stationary stop durations are unavailable and remain null.',
    'The map reference is Hamilton recorded lap 8 (complete, pre-rain, no pit stop). The pit lane is Hamilton recorded traversal around lap 27, including a two-second entry/exit bracket. Both retain raw x/y/z coordinates, not survey-grade centerline geometry.',
    'Positions are provider position-change records; a pre-start record is retained for the starting order. Official starting grid, classification, and completion status come from Jolpica 2024 round 12.',
    'OpenF1 Community historical access: no authentication; 3 requests/second and 30/minute. Ingestion caches responses, spaces requests by at least 2.15 seconds, and backs off on HTTP 429/5xx.',
  ]
  const race = {
    schemaVersion: 1,
    meta: { id: '2024-british', year: 2024, round: 12, name: 'British Grand Prix', circuit: 'Silverstone', location: session.location, country: session.country_name, date: '2024-07-07', sessionKey: 9558, laps: 52, startEpochMs, duration, winner: 'Lewis Hamilton' },
    drivers, laps, locations, positions, intervals, stints, pits, events, weather,
    track: { points: trackPoints, pitLane: pitPoints, length: 5891, description: 'Recorded Hamilton lap 8 trace; pit lane from recorded lap 27 traversal. Coordinates preserve original provider x/y/z. Circuit reference length 5,891m (FIA 2024 media information), not measured from this approximate trace.' },
    telemetryFiles,
    sources: [
      { label: 'OpenF1 historical timing, location, telemetry, tyres, weather and race control', url: 'https://openf1.org/docs/', license: 'OpenF1 site/data terms: CC BY-NC-SA 4.0; educational and noncommercial fan analysis. No official F1 affiliation.' },
      { label: 'OpenF1 British 2024 race session (9558)', url: 'https://api.openf1.org/v1/sessions?session_key=9558', license: 'CC BY-NC-SA 4.0; provider terms apply.' },
      { label: 'Jolpica British 2024 results, grid and classification', url: 'https://api.jolpi.ca/ergast/f1/2024/12/results.json?limit=100', license: 'CC BY-NC-SA 4.0; https://github.com/jolpica/jolpica-f1/blob/main/TERMS.md' },
      { label: 'FIA 2024 media reference: Silverstone circuit length', url: 'https://api.fia.com/sites/default/files/spg2024_0060_f1_mediakit_2024_eng_a4_300dpi_240625_view_tisc_0.pdf', license: 'Factual circuit-length reference only; original document rights remain with its publisher.' },
    ],
    coverage: { sampleInterval: 1, maxInterpolationGap: 3, locationSamples: sampledLocationTotal, notes },
  }
  const body = JSON.stringify(race)
  await fs.writeFile(path.join(output, 'race.json'), body)
  let sources
  try { sources = JSON.parse(await fs.readFile(path.join(cache, 'sources.json'), 'utf8')) } catch { sources = null }
  const report = { generatedAt: new Date().toISOString(), raceId: race.meta.id, startEpochMs, duration, winnerOfficialTime: drivers.find(driver => driver.number === 44).resultTime, rawLocationSamples: rawLocationTotal, compactLocationSamples: sampledLocationTotal, raceBytes: Buffer.byteLength(body), raceSha256: createHash('sha256').update(body).digest('hex'), trackReferencePoints: trackPoints.length, pitReferencePoints: pitPoints.length, drivers: coverageByDriver, sources }
  await fs.writeFile(path.join(output, 'provenance.json'), JSON.stringify(report, null, 2))
  console.log(JSON.stringify({ output, ...report, sources: sources ? `${sources.sources.length} source responses` : null, drivers: coverageByDriver }))
  return race
}

await normalizeHistory(cache, path.join(appRoot, 'public', 'history', '2024-british'))
