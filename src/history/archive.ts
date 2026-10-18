import { loadHistoricalRace } from './loader'
import type { HistoricalRace, LocationSample, TelemetrySample } from './types'
import type { RaceArchive, ArchiveProgressListener } from './archiveTypes'

let archivePromise: Promise<RaceArchive> | undefined
function withAbort<T>(promise: Promise<T>, signal?: AbortSignal): Promise<T> {
  if (!signal) return promise
  if (signal.aborted) return Promise.reject(new DOMException('Loading was cancelled.', 'AbortError'))
  return new Promise<T>((resolve, reject) => {
    const abort = () => { cleanup(); reject(new DOMException('Loading was cancelled.', 'AbortError')) }
    const cleanup = () => signal.removeEventListener('abort', abort)
    signal.addEventListener('abort', abort, {once: true})
    promise.then(value => { cleanup(); resolve(value) }, error => { cleanup(); reject(error) })
  })
}
export function loadRaceArchive(signal?: AbortSignal): Promise<RaceArchive> {
  if (!archivePromise) {
    const pending = fetch('/history/archive.json').then(async response => {
      if (!response.ok) throw new Error(`The race archive could not load (${response.status}). Please retry.`)
      const value = await response.json() as RaceArchive
      if (value.schemaVersion !== 1 || !Array.isArray(value.races) || !Array.isArray(value.seasons) || new Set(value.races.map(race => race.id)).size !== value.races.length) throw new Error('The historical race archive is invalid.')
      return value
    })
    archivePromise = pending
    void pending.catch(() => { if (archivePromise === pending) archivePromise = undefined })
  }
  return withAbort(archivePromise, signal)
}
/** Bundled snapshots require no API token, browser requests to providers, or polling. */
export async function loadArchiveRace(id: string, signal?: AbortSignal, progress?: ArchiveProgressListener): Promise<HistoricalRace> {
  const archive = await loadRaceArchive(signal)
  const entry = archive.races.find(race => race.id === id)
  if (!entry) throw new Error('This Grand Prix is not in the supported historical archive.')
  progress?.({stage: 'Loading recorded race snapshot', completed: 0, total: 1})
  const race = await loadHistoricalRace(entry.id, signal)
  progress?.({stage: 'Recorded race ready', completed: 1, total: 1})
  return race
}
export function archiveRaceHas3D(race: HistoricalRace): boolean {
  return race.coverage.locationSamples > 0 && race.track.points.length > 8 && race.drivers.some(driver => (race.locations[driver.number]?.length ?? 0) > 1)
}

type CacheRow = {key: string; updated: number; value: HistoricalRace | TelemetrySample[]}
const memory = new Map<string, CacheRow>()
let databasePromise: Promise<IDBDatabase | null> | undefined
/** Optional cache. Restricted/private browsing still works with the in-memory cache. */
function database(): Promise<IDBDatabase | null> {
  if (!databasePromise) databasePromise = new Promise(resolve => {
    if (typeof indexedDB === 'undefined') { resolve(null); return }
    const request = indexedDB.open('apexlab-recorded-history-v1', 1)
    request.onupgradeneeded = () => request.result.createObjectStore('recordings', {keyPath: 'key'})
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => resolve(null)
    request.onblocked = () => resolve(null)
  })
  return databasePromise
}
async function cacheRead<T extends HistoricalRace | TelemetrySample[]>(key: string): Promise<T | null> {
  const existing = memory.get(key)
  if (existing) return existing.value as T
  const db = await database()
  if (!db) return null
  try {
    return await new Promise<T | null>(resolve => {
      const transaction = db.transaction('recordings', 'readonly'), request = transaction.objectStore('recordings').get(key)
      request.onsuccess = () => { const row = request.result as CacheRow | undefined; if (row) memory.set(key, row); resolve(row?.value as T ?? null) }
      request.onerror = () => resolve(null)
    })
  } catch { return null }
}
async function cacheWrite(key: string, value: HistoricalRace | TelemetrySample[]): Promise<void> {
  const row: CacheRow = {key, updated: Date.now(), value}
  memory.set(key, row)
  const all = [...memory.values()].sort((a, b) => b.updated - a.updated)
  for (const expired of all.slice(16)) memory.delete(expired.key)
  const db = await database()
  if (!db) return
  try {
    await new Promise<void>(resolve => {
      const transaction = db.transaction('recordings', 'readwrite'), store = transaction.objectStore('recordings')
      store.put(row)
      const request = store.getAll()
      request.onsuccess = () => {
        const rows = (request.result as CacheRow[]).sort((a, b) => b.updated - a.updated)
        // Keep at most eight full-race coordinate caches and sixteen telemetry channels.
        const recordings = rows.filter(item => item.key.startsWith('race:'))
        const channels = rows.filter(item => !item.key.startsWith('race:'))
        for (const old of [...recordings.slice(8), ...channels.slice(16)]) store.delete(old.key)
      }
      transaction.oncomplete = () => resolve()
      transaction.onerror = () => resolve()
      transaction.onabort = () => resolve()
    })
  } catch { /* Storage quota does not prevent the recording from being viewed. */ }
}
export async function clearRecordedReplayCache(): Promise<void> {
  memory.clear()
  const db = await database()
  if (!db) return
  await new Promise<void>(resolve => { const transaction = db.transaction('recordings', 'readwrite'); transaction.objectStore('recordings').clear(); transaction.oncomplete = () => resolve(); transaction.onerror = () => resolve() })
}
const abortError = () => new DOMException('Loading was cancelled.', 'AbortError')
const checkAbort = (signal?: AbortSignal) => { if (signal?.aborted) throw abortError() }
function delay(milliseconds: number, signal?: AbortSignal): Promise<void> {
  checkAbort(signal)
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => { signal?.removeEventListener('abort', abort); resolve() }, milliseconds)
    const abort = () => { clearTimeout(timer); signal?.removeEventListener('abort', abort); reject(abortError()) }
    signal?.addEventListener('abort', abort, {once: true})
  })
}
// OpenF1's shared free quota is 30 requests/minute. All runtime recording and
// telemetry requests use this same queue and a minimum 2.2-second spacing.
let providerQueue: Promise<unknown> = Promise.resolve(), lastProviderRequest = 0
function openF1<T>(url: URL, signal?: AbortSignal): Promise<T[]> {
  const request = providerQueue.catch(() => {}).then(async () => {
    for (let attempt = 0; attempt < 4; attempt++) {
      checkAbort(signal)
      await delay(Math.max(0, 2200 - (Date.now() - lastProviderRequest)), signal)
      lastProviderRequest = Date.now()
      const controller = new AbortController(), timer = setTimeout(() => controller.abort(), 90000)
      const abort = () => controller.abort()
      signal?.addEventListener('abort', abort, {once: true})
      try {
        const response = await fetch(url, {signal: controller.signal})
        if (response.status === 429 || response.status >= 500) {
          if (attempt === 3) throw new Error('The recording provider is busy. Please retry later; no substitute movement has been generated.')
          const retry = Number(response.headers.get('retry-after'))
          await delay(Number.isFinite(retry) && retry > 0 ? Math.min(retry, 60) * 1000 : 6000 * (attempt + 1), signal)
          continue
        }
        if (!response.ok) throw new Error(`Recorded data is unavailable from OpenF1 (${response.status}). The verified timing archive remains available.`)
        const value: unknown = await response.json()
        if (!Array.isArray(value)) throw new Error('The recording provider returned an invalid data response.')
        return value as T[]
      } catch (error) {
        checkAbort(signal)
        if (error instanceof DOMException && error.name === 'AbortError') throw new Error('The recording provider timed out. Please retry.')
        throw error
      } finally { clearTimeout(timer); signal?.removeEventListener('abort', abort) }
    }
    throw new Error('Recorded data could not load.')
  })
  providerQueue = request
  return withAbort(request, signal)
}
const round = (value: number) => Math.round(value * 1000) / 1000
type RawLocation = {date: string; driver_number: number; x: number; y: number; z: number}
type RawCar = {date: string; driver_number: number; speed?: number; throttle?: number; brake?: number; n_gear?: number; rpm?: number; drs?: number}
function competitiveEnd(race: HistoricalRace, number: number): number {
  const driver = race.drivers.find(driver => driver.number === number)
  return Math.max(0, ...(race.laps[number] ?? []).filter(lap => lap.lap <= (driver?.recordedLaps ?? driver?.classifiedLaps ?? 0) && lap.end != null).map(lap => lap.end ?? 0))
}
function sampleSeconds<T extends {date: string}>(rows: T[], startEpoch: number, end: number, mapper: (row: T, time: number) => LocationSample | TelemetrySample): (LocationSample | TelemetrySample)[] {
  const sorted = rows.map(row => ({row, time: round((Date.parse(row.date) - startEpoch) / 1000)})).filter(sample => Number.isFinite(sample.time) && sample.time >= -1 && sample.time <= end + 1).sort((a,b) => a.time - b.time)
  if (!sorted.length || end <= 0) return []
  let index = 0
  const result: (LocationSample | TelemetrySample)[] = [], used = new Set<number>()
  const append = (sample: typeof sorted[number] | undefined) => { if (sample && !used.has(sample.time)) { used.add(sample.time); result.push(mapper(sample.row, sample.time)) } }
  for (let second = 0; second <= Math.ceil(end); second++) { while (index + 1 < sorted.length && (sorted[index + 1].time === sorted[index].time || Math.abs(sorted[index + 1].time - second) < Math.abs(sorted[index].time - second))) index++; if (Math.abs(sorted[index].time - second) <= .8) append(sorted[index]) }
  append(sorted.find(sample => sample.time >= end))
  return result.sort((a,b) => a[0] - b[0])
}
/** Load actual coordinates for any supported 2023–2025 session. Never uses lap
 * timing to invent a trajectory. Cancelled/failed loads leave the timing intact.
 */
export async function loadRecordedReplay(race: HistoricalRace, signal?: AbortSignal, progress?: ArchiveProgressListener): Promise<HistoricalRace> {
  checkAbort(signal)
  if (archiveRaceHas3D(race)) return race
  if (race.meta.year < 2023 || !race.meta.sessionKey) throw new Error('Recorded coordinates are unavailable for this race. Its real historical timing archive remains available.')
  if (!race.events.some(event => event.type === 'start') || !race.drivers.some(driver => competitiveEnd(race, driver.number) > 0)) throw new Error('A verified recorded start and lap timeline are required before coordinates can be loaded.')
  const key = `race:${race.meta.id}:${race.meta.sessionKey}`
  const cached = await cacheRead<HistoricalRace>(key)
  checkAbort(signal)
  if (cached && archiveRaceHas3D(cached)) { progress?.({stage:'Loaded cached recording',completed:1,total:1}); return cached }
  const total = Math.ceil((race.meta.duration + 2) / 600), all = new Map<number, RawLocation[]>()
  for (let index = 0; index < total; index++) {
    const from = -1 + index * 600, until = Math.min(from + 600, race.meta.duration + 1)
    progress?.({stage:`Loading recorded positions · segment ${index + 1} of ${total}`,completed:index,total})
    const url = new URL('https://api.openf1.org/v1/location')
    url.searchParams.set('session_key', String(race.meta.sessionKey))
    url.searchParams.set('date>', new Date(race.meta.startEpochMs + from * 1000 - 1).toISOString().replace('Z',''))
    url.searchParams.set('date<', new Date(race.meta.startEpochMs + until * 1000).toISOString().replace('Z',''))
    const rows = await openF1<RawLocation>(url, signal)
    for (const row of rows) {
      if (![row.x,row.y,row.z].every(Number.isFinite) || (row.x === 0 && row.y === 0 && row.z === 0) || !Number.isInteger(row.driver_number)) continue
      let values = all.get(row.driver_number)
      if (!values) { values = []; all.set(row.driver_number, values) }
      values.push(row)
    }
  }
  checkAbort(signal)
  const recording = structuredClone(race)
  for (const driver of race.drivers) recording.locations[driver.number] = sampleSeconds(all.get(driver.number) ?? [],race.meta.startEpochMs,competitiveEnd(race,driver.number),(row,time) => [time,row.x,row.y,row.z]) as LocationSample[]
  const winner = race.drivers.find(driver => driver.finishPosition === 1) ?? race.drivers[0]
  const pitLaps = new Set(race.pits.filter(pit => pit.driver === winner.number).map(pit => pit.lap))
  const reference = (race.laps[winner.number] ?? []).filter(lap => lap.start != null && lap.end != null && lap.lap >= 5 && lap.lap <= (winner.classifiedLaps ?? 0) && lap.duration != null && !pitLaps.has(lap.lap) && !pitLaps.has(lap.lap - 1)).sort((a,b) => (a.duration ?? Infinity) - (b.duration ?? Infinity))[0]
  if (!reference) throw new Error('A complete recorded reference lap is unavailable. No substitute circuit has been generated.')
  const winnerRows = (all.get(winner.number) ?? []).map(row => ({...row,time:(Date.parse(row.date)-race.meta.startEpochMs)/1000})).sort((a,b) => a.time-b.time)
  recording.track.points = winnerRows.filter(row => row.time >= reference.start! && row.time <= reference.end!).map(row => [row.x,row.y,row.z])
  if (recording.track.points.length < 20) throw new Error('This provider recording does not contain enough valid coordinates for a 3D circuit. Timing remains available.')
  const pit = race.pits.find(pit => pit.driver === winner.number && pit.duration != null)
  recording.track.pitLane = pit ? winnerRows.filter(row => row.time >= pit.time-2 && row.time <= pit.time+(pit.duration ?? 0)+2).map(row => [row.x,row.y,row.z]) : []
  recording.track.description = `Recorded ${winner.code} lap ${reference.lap} trace. Approximate provider coordinates; visual road width and cockpit geometry are illustrative.`
  recording.coverage.locationSamples = Object.values(recording.locations).reduce((sum,rows) => sum+rows.length,0)
  recording.coverage.sampleInterval = 1
  recording.coverage.maxInterpolationGap = 3
  recording.coverage.notes = recording.coverage.notes.filter(note => !note.startsWith('No coordinates or car telemetry'))
  recording.coverage.notes.push('Recorded OpenF1 coordinates were downloaded on demand in ten-minute segments and sampled near each whole second without inventing values. Interpolation is limited to adjacent samples no more than three seconds apart. This device caches up to eight full-race recordings.','Circuit road width, surroundings, car bodywork and cockpit views are original illustrative reconstructions. Provider position coordinates cannot establish exact lateral placement. Car telemetry channels load separately when requested.')
  recording.sources.push({label:`OpenF1 recorded location, session ${race.meta.sessionKey}`,url:`https://api.openf1.org/v1/location?session_key=${race.meta.sessionKey}`,license:'CC BY-NC-SA 4.0; noncommercial educational fan analysis. Original provider coordinates sampled to approximately 1 Hz.'})
  await cacheWrite(key, recording)
  checkAbort(signal)
  progress?.({stage:'Recorded 3D replay ready',completed:total,total})
  return recording
}
const nullable = (value: unknown): number | null => typeof value === 'number' && Number.isFinite(value) ? value : null
const percentage = (value: unknown): number | null => typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 100 ? value : null
/** Selected-driver telemetry uses the same rate-limit queue as coordinate loading. */
export async function loadRecordedTelemetry(race: HistoricalRace, driver: number, signal?: AbortSignal): Promise<TelemetrySample[]> {
  checkAbort(signal)
  if (!race.meta.sessionKey || race.meta.year < 2023 || !race.drivers.some(item => item.number === driver)) throw new Error('Recorded telemetry is unavailable for this driver and race.')
  const key = `telemetry:${race.meta.id}:${driver}`, cached = await cacheRead<TelemetrySample[]>(key)
  checkAbort(signal)
  if (cached) return cached
  const end = competitiveEnd(race, driver)
  if (end <= 0) return []
  const url = new URL('https://api.openf1.org/v1/car_data')
  url.searchParams.set('session_key', String(race.meta.sessionKey)); url.searchParams.set('driver_number', String(driver))
  url.searchParams.set('date>', new Date(race.meta.startEpochMs-1001).toISOString().replace('Z','')); url.searchParams.set('date<', new Date(race.meta.startEpochMs+(end+1)*1000).toISOString().replace('Z',''))
  const rows = await openF1<RawCar>(url, signal)
  const samples = sampleSeconds(rows,race.meta.startEpochMs,end,(row,time) => [time,nullable(row.speed),percentage(row.throttle),percentage(row.brake),nullable(row.n_gear),nullable(row.rpm),nullable(row.drs)]) as TelemetrySample[]
  await cacheWrite(key,samples)
  checkAbort(signal)
  return samples
}
