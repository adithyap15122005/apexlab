# APEXLAB 3.0 — Historical Racing, Reconstructed

**Every race. Every decision. Every second.**

A working historical Formula 1 replay of the **2024 British Grand Prix**, built with React, TypeScript, Three.js, React Three Fiber, and Drei. Its complete cached snapshot contains all 20 entered drivers, 19 starters, real timing, stints, pit records, weather, race control, telemetry, and 93,016 retained timestamped location samples.

The previous fictional three-driver learning studio remains available through **Practice demo**, visibly labeled as a simulation. It is independent of the historical replay. See [DEMO_MODEL.md](DEMO_MODEL.md) for its assumptions.

## Run

Node.js 22.12+ and npm:

```sh
npm install
npm run dev
```

Open the printed local URL, choose **Explore historical races**, then **Enter the 3D race**. Visitors need no API key, sign-in, Python environment, or live data service. The snapshot and fonts are served from the same host.

```sh
npm test
npm run build
npm run preview
```

## What works

- Complete replay from recorded lights-out to the last finisher: Play, Pause, Restart, continuous scrubbing, lap selection, and 1× / 4× / 16× / 32× speeds.
- Multiple moving original open-wheel car models, team colors, driver-number labels, and an illustrative Silverstone environment following a recorded reference lap.
- Select a driver from the timing tower, accessible selector, or car marker. Helicopter, trackside, free-orbit strategist, and reconstructed onboard-inspired cameras follow the shared replay clock.
- Synchronized provider positions, gaps, lap counts, last laps, tyre compound/age, pit-lane windows, weather readings, and historical race-control messages.
- Real stint timelines and recorded lap-time comparisons. Stints seek directly into the replay; pit events open the What-If Lab at that actual decision.
- Two-driver recorded speed, throttle, brake, gear, RPM and raw DRS-code comparison, aligned by elapsed lap time with a shared cursor. Telemetry files load on demand.
- A separate deterministic What-If model for supported full-distance finishers and dry stints: change the selected historical stop by up to three laps, replacement slick compound, wear assumption, net pit loss, and rejoin traffic. Original settings reproduce the official time; changes produce an explained hypothetical delta and fixed-rival rank estimate.
- 2D alternative, keyboard controls, visible focus, responsive layouts, reduced automatic motion, render-on-demand scenes, and hidden-tab playback pause.

Only **one historical race** is currently supported. Archive selectors deliberately expose that verified coverage. There is no fictional fallback for an unsupported race or missing trajectory.

## A 90-second demonstration

1. Open the archive and enter British 2024. Press Play at 16× and change the followed driver.
2. Switch between strategist, helicopter, trackside, and onboard-inspired views; pause and select lap 27.
3. Inspect the actual timing tower, intermediate tyres, weather update, and pit events. Jump to Hamilton's lap-38 stop.
4. Open its **What if** button. Run unchanged settings to reproduce his official 4,947.059-second classified time.
5. Move the stop one lap, or choose Medium instead of Soft. Run again and inspect the separate modeled delta, assumptions, and per-lap differences.
6. Compare real stints and lap-40 telemetry, then inspect **Data & learning** for coverage and provenance.

## Historical accuracy and source license

[OpenF1](https://openf1.org/docs/) supplies timing, location, car signals, tyres, pit-lane durations, weather, and race control. [Jolpica](https://api.jolpi.ca/ergast/f1/2024/12/results.json?limit=100) supplies grid and official classification. Both data sources use **CC BY-NC-SA 4.0**, with attribution and noncommercial restrictions. Modified bundled data retains those terms; this is an independent educational fan project with no official Formula 1 affiliation.

Positions between valid recorded samples are explicitly **interpolated**. Gaps longer than three seconds are hidden, without extrapolation or a generated racing-line substitute. OpenF1 location is approximate and does not resolve reliable lateral separation. Track width, flat terrain, scenery, and car bodies are illustrative original geometry. Cars may overlap where the data cannot separate them.

Pit entry is an approximate derived timestamp. Lane duration is recorded; stationary service duration is unavailable for British 2024. A What-If net pit-loss assumption is distinct from both. Official classification totals and timestamp-derived lap ends are kept separate. Missing Perez first-lap timing stays missing. Gasly did not start; Russell's displayed competitive record ends after 33 completed laps.

See [HISTORICAL_DATA.md](HISTORICAL_DATA.md), the in-app **Data & learning** page, and [provenance.json](public/history/2024-british/provenance.json) for exact processing and source hashes.

## Architecture

- `scripts/ingest-history.mjs`: reproducible, cached, rate-limited server-side preprocessing.
- `public/history/2024-british/`: normalized race snapshot, per-driver telemetry and provenance.
- `src/history/`: typed schema, validation/cached loaders, binary-search sampling, race state and counterfactual model.
- `src/components/historical/`: archive, synchronized workspace, instanced 3D fleet, camera director, charts, What-If and sources.
- `src/components/three/SceneFrame.tsx`: WebGL boundary, local lighting, visibility-aware rendering and 2D preference.
- `src/engine/`: independent fictional practice model, never used to generate historical car positions.

The first complete race uses preprocessed static JSON instead of a permanently running backend. This keeps full-session records reliable on a static host and avoids visitor-triggered API calls. The ingestion script is the data processing layer; the typed snapshot contract can be served by a backend when the archive expands.

## Validation

`npm test` checks both engines, actual lineup/winner, complete starter coverage, absence of long positional gaps, retirement/DNS behavior, recorded lap seeking, all telemetry files, no trajectory extrapolation, baseline identity, changed-input effects, invalid scenarios, determinism and data immutability. Production builds include strict TypeScript validation. Browser automation was blocked by the tool URL policy during this upgrade; interactive visual verification remains outstanding.

## Public repository

[github.com/adithyap15122005/apexlab](https://github.com/adithyap15122005/apexlab)