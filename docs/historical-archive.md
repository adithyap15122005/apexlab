# Historical archive: 2021–2025

The archive contains every completed championship Grand Prix in the five completed seasons 2021–2025: **114 races** (22, 22, 22, 24 and 24). Cancelled meetings are excluded. Sprint sessions are separate competitions and are not counted as Grand Prix races.

Every entry includes its actual entrants, constructor, grid, final classification, completed laps and reported result status from Jolpica. A race card's capability is explicit: `recorded-3d` means coordinates are bundled; `timing` means the initial local snapshot has timing/results but no bundled car trajectory. A timing entry never receives a decorative or fictional racing path.

## Data availability

- **2023–2025:** recorded OpenF1 lap timing, sectors, position changes, stints, pit messages and race control are cached where available. Missing source records remain missing. Some sessions have incomplete lap timing even when their positional recording spans the race.
- **Recorded 3D:** featured sessions include bundled full-race coordinates and selected sessions include car telemetry. Other supported 2023–2025 races can load their actual coordinates from OpenF1 on demand. The UI reports loading progress and supports cancellation. A failed provider request leaves the verified timing archive intact.
- **2021–2022:** actual results, pit records and 47,217 available driver lap durations are bundled from Jolpica's public delayed CSV export. Lap start/end clocks are explicitly derived cumulative sums, rather than original telemetry timestamps. Missing lap sequences leave subsequent elapsed clocks unavailable. Tyre compounds, sectors and recorded car coordinates remain unavailable. Public F1 historical live-timing endpoints returned HTTP 401 in this environment; no access restrictions are bypassed.
- An actual pit's lane duration is distinct from its stationary service time and from net time lost relative to a car continuing on track. Stationary duration remains unavailable unless the provider supplied it.

OpenF1's original coordinate observations are approximate Cartesian positions, not a surveyed racing line or exact lateral placement. The approximately 1 Hz snapshot retains source timestamps and values nearest whole seconds. Playback interpolates only between actual bracketing samples separated by at most three seconds. Gaps have no invented coordinates. Track road width, terrain, cockpit geometry and original car meshes are illustrative visual reconstructions, not official scans or authentic onboard footage.

## Runtime loading and cache

`src/history/archive.ts` exports `loadRaceArchive`, `loadArchiveRace`, `archiveRaceHas3D`, `loadRecordedReplay`, `loadRecordedTelemetry` and `clearRecordedReplayCache`.

On-demand position loading divides the actual recorded race interval into ten-minute API requests. Large unfiltered session-wide location queries return HTTP 422 from OpenF1; bounded requests avoid that provider limit. All runtime coordinate and telemetry requests share a queue spaced at least 2.2 seconds apart, with four attempts maximum for rate limits/server failures. Cancelling stops pending requests. No API credentials are required.

This device's IndexedDB cache retains at most eight coordinate recordings and sixteen selected-driver telemetry channels. A memory cache supports environments that disable IndexedDB. Cache failure never prevents an already downloaded recording from being viewed.

## Reproducing the bundled archive

From the project directory:

```powershell
node scripts/ingest-archive.mjs
node scripts/ingest-all-positions.mjs
node scripts/download-jolpica-dump.mjs
python scripts/import-jolpica-laps.py
```

For one additional complete positional session:

```powershell
node --max-old-space-size=4096 scripts/ingest-recorded-race.mjs 2025-italian
```

Add `--locations-only` to skip car-data channels. The all-positions script can run beside the metadata ingestor; it waits for recorded timing origins before reconstructing a circuit. Requests cache raw provider responses outside the Git checkout in `../historical-ingestion/archive`. Snapshot `provenance.json` files contain source URLs, SHA-256 checksums and per-driver coverage. All downloaded values can be reproduced; an existing richer positional snapshot is preserved when the catalog is regenerated.

## Sources and attribution

- [OpenF1 documentation](https://openf1.org/docs/): timing, approximate location, car telemetry, race control, stints and pit records. CC BY-NC-SA 4.0; educational and noncommercial fan analysis. Current documented anonymous limits: 3 requests/second and 30 requests/minute.
- [Jolpica documentation](https://github.com/jolpica/jolpica-f1/blob/main/docs/README.md): calendar, complete race results, grid, classification, winner lap durations and historical pit records. [Terms](https://github.com/jolpica/jolpica-f1/blob/main/TERMS.md): CC BY-NC-SA 4.0. The Node ingestor uses a custom application User-Agent, paginates at the documented maximum 100 records and caches responses. [Anonymous rate limits](https://github.com/jolpica/jolpica-f1/blob/main/docs/rate_limits.md): 4 requests/second and 500/hour.

Provider data licensing and third-party portrait licensing are separate from the application's original code and car geometry. ApexLab is an independent educational project with no official Formula 1, driver or constructor affiliation.
