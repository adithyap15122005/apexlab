# APEXLAB — Historical racing, from within

An independent educational Formula 1 archive with **114 championship Grands Prix from the five completed seasons 2021–2025**, real driver lineups, historical constructors, results, timing and clearly stated data coverage. Built with React, TypeScript, Three.js, React Three Fiber and Drei.

## Run

Node.js 22.12+ and npm:

```sh
npm install
npm run dev
npm test
npm run build
npm run preview
```

Choose **Choose your race**, pick a highlighted recorded race, select a driver, and choose **Enter this cockpit**. The reconstructed driver's-seat camera supports drag or arrow-key look-around, recenter, full screen, driver switching, playback, lap selection, scrubbing and speed controls. Helicopter, trackside and free-orbit strategist views share the same recorded clock.

## Explore

- Four original team-inspired showroom cars: Mercedes, Ferrari, McLaren and Red Bull. Inspect the exterior, enter the modeled cockpit, examine aero details and follow official team links.
- All 114 Grand Prix race records, searchable by season, event, circuit, country or winner. Sprints and cancelled races are excluded.
- Nine bundled full-race positional replays: British 2024, Monaco 2024, Singapore 2023, and Australian, Chinese, Japanese, Bahrain, Saudi Arabian and Italian 2025.
- Other supported 2023–2025 races can download recorded positions from OpenF1, subject to provider coverage and availability. Progress, cancellation and an optional device cache are included. Initial downloads can take several minutes and tens of megabytes.
- Real lap timing, tyre stints, pit events, position changes, weather and race control where supplied. Driver speed, gear, RPM, brake, throttle and raw DRS signals load when recorded telemetry is available.
- 37 licensed driver portraits, source/photographer/license credits, historical race-specific teams and constructor links. Archive photographs can show clothing from another season.
- A separate What-If Lab for supported full-distance finishers and dry stints. Hypothetical pit choices never alter historical trajectories or classification. Original inputs reproduce the official time; alternative assumptions produce explained model deltas.
- An independent fictional practice studio remains available through **Practice demo**, visibly labeled as simulation. See [DEMO_MODEL.md](DEMO_MODEL.md).

## Accuracy and visual scope

Bundled and downloaded trajectories retain actual source timestamps and coordinates, sampled near one second. Only valid brackets at most three seconds apart are interpolated. Longer gaps are hidden. No timing-based fictional trajectory substitutes for missing coordinates. OpenF1 positions are approximate and cannot reliably resolve lateral placement; cars can overlap in the source data.

2021–2022 use historical results and timing rather than positional 3D. Coverage is visible per race. Recorded positions, interpolated positions, cumulative timing-derived clocks and hypothetical What-If results are distinguished.

Car meshes, cockpit interiors, road width, terrain, barriers, scenery and lighting are original visual reconstructions. They are not licensed manufacturer CAD, surveyed circuits or authentic onboard footage. Night venues and recorded rain adjust appearance only; they do not change recorded vehicle motion. Dashboards show available recorded signals and leave missing or stale values unavailable.

## Sources and licensing

[OpenF1](https://openf1.org/docs/) and [Jolpica](https://github.com/jolpica/jolpica-f1) supply the historical records under **CC BY-NC-SA 4.0**. Modified bundled data retains those terms. Wikimedia Commons portraits retain their individual credited licenses in `src/history/people-data.json` and the in-app photo credits. This is an independent noncommercial educational fan project with no official Formula 1 or team affiliation.

See [docs/historical-archive.md](docs/historical-archive.md) for archive ingestion, coverage, data limitations and runtime cache behavior; [HISTORICAL_DATA.md](HISTORICAL_DATA.md) describes the original British snapshot in detail. Per-race source notes remain in the UI and data files.

## Architecture and validation

- `scripts/ingest-archive.mjs`, `ingest-recorded-race.mjs`, `ingest-all-positions.mjs`: rate-limited, reproducible archive preprocessing.
- `public/history/`: catalogue and per-race normalized snapshots, optional telemetry and provenance.
- `src/history/`: validation, cached loaders, interpolation, live archive downloads, replay state and separate counterfactual model.
- `src/components/historical/`: calendar, lineup, instanced 3D fleet, cockpit/cameras, synchronized charts and What-If workspace.
- `src/components/showroom/`: interactive four-team garage and original detailed car geometry.

The test suite verifies race counts and every snapshot route, all entrants' portrait/constructor identity, recorded duration coverage, DNS/retirement/disqualification behavior, interpolation limits, actual telemetry, What-If determinism and baseline identity, car geometry, cockpit sight lines, team paint and venue lighting. Production builds run strict TypeScript checks. Desktop and mobile browser checks cover the showroom, archive, cockpit and replay controls.

Public source: [github.com/adithyap15122005/apexlab](https://github.com/adithyap15122005/apexlab).
