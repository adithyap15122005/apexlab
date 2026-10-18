import type { HistoricalRace } from './types'

export type ArchiveReplayMode = 'recorded-3d' | 'timing'
/** Every entry describes one real Grand Prix; mode is its bundled data capability. */
export type ArchiveRace = {
  id: string
  year: number
  round: number
  name: string
  circuit: string
  location: string
  country: string
  date: string
  laps: number
  winner: string
  winnerCode: string
  sessionKey: number | null
  mode: ArchiveReplayMode
  snapshotUrl: string
  notes: string[]
}
export type RaceArchive = {
  schemaVersion: 1
  seasons: number[]
  races: ArchiveRace[]
  generatedAt: string
  sources: {label: string; url: string; license: string}[]
}
export type ArchiveLoadProgress = {stage: string; completed: number; total: number}
export type ArchiveProgressListener = (progress: ArchiveLoadProgress) => void
export type ArchiveHistoricalRace = HistoricalRace & {meta: HistoricalRace['meta'] & {replayMode?: ArchiveReplayMode}}
