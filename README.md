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

Choose **Choose your race**, pick a highlighted recorded race, select a driver, and choose **Enter this cockpit**. The driver's-seat camera supports drag or arrow-key look-around, recenter, full screen, driver switching, playback, lap selection, scrubbing and speed controls. Eleven views share the same clock: **Director** (automatic broadcast cuts), Cockpit, T-cam, Nose cam, Rear cam, Chase, driver-following Top view, north-up Whole circuit, Helicopter, Trackside TV and Free orbit. **Engine sound** and a **Graphics** preset (Ultra / High / Medium / Low) sit beside the scene; the fullscreen player includes its own camera and graphics selectors.

## The 3D race engine

The replay is a purpose-built real-time renderer (`src/components/race3d/`, `src/history/trackGuide.ts`):

- **Track-guided motion.** OpenF1 positions arrive about once a second, up to ~85 m apart at speed. Every recorded sample is projected onto the circuit's recorded reference lap (progress + lateral offset). Between samples each car advances *along the circuit* with a robust, monotone cubic fit of its lap progress, so cars follow real corner curvature instead of cutting straight chords, and accelerate and brake smoothly. Provider timestamp jitter, stale repeats and teleport glitches are filtered; brackets longer than three seconds or physically impossible jumps stay hidden.
- **Vehicle dynamics (render-only).** Each car has damped suspension that dives under braking, squats under traction and rolls with lateral load, aero squat at speed, kerb vibration, front-wheel steering lock from path curvature (bicycle model) and wheels that roll at road speed with rotational motion blur on the sidewalls. The cockpit steering wheel turns with the corner and the helmet camera leans against g-forces.
- **Close racing without clipping.** The source cannot resolve which side of a rival a car is on, so overlapping bodies are eased apart across the road. Lap progress, gaps and positions are unchanged; a dithered visibility guard remains for any residual overlap in cockpit view.
- **2022-regulation-style cars.** Original procedural geometry at real proportions (5.6 m long, 2.0 m wide, 3.6 m wheelbase, 18-inch wheels): lofted monocoque and nose, undercut sidepods, four-element front wing, rear wing with a DRS flap that opens from recorded telemetry, beam wing, diffuser, halo, suspension, mirrors, T-camera (fluorescent for the second team car) and rain light. Team colours are painted per instance by a livery shader; tyres carry compound-coloured sidewalls. Two levels of detail keep a full grid fast.
- **Circuits from the recorded lap.** Cambered asphalt that follows recorded elevation, a rubbered racing line, braking marks, painted grid boxes and timing line; kerbs at the apex and exit of each corner; grass, gravel or tarmac run-off; Armco, TecPro, concrete walls with debris fences and a pit wall, placed so barriers never cross another section of track; pit lane with garages; grandstands; a start gantry whose five lights go out at the recorded lap-one start; advertising bridges; marshal light panels that follow recorded race-control status (yellow, safety car, VSC, red); terrain, trees, palms and city blocks by venue.
- **Atmosphere.** Physical sky with sun shadows that follow the action, image-based reflections, fog, floodlit night races and twilight, and recorded rain with a wet track, rain streaks and spray plumes behind every car.
- **Cockpit.** Steering wheel with a live recorded-telemetry display and RPM shift lights, gloved hands, and real-time rear-view mirrors.
- **Post-processing.** ACES tone mapping, bloom for floodlights and lamps, vignette and a radial speed blur in onboard and chase cameras. Rendering runs at the display refresh rate while playing.
- **Engine sound.** A synthesized hybrid V6 (three firings per revolution) driven by recorded RPM and throttle, attenuated by camera distance.
- **Live HUD.** Position, recorded speed, gear, throttle/brake, DRS, tyre and gap, plus a track-status banner.

Production builds held about 45–60 fps at the High preset on Intel integrated graphics in headless Chrome across the cameras tested (cockpit with live mirrors is the heaviest). Medium and Low trade shadows, trees, mirrors and post-processing for speed.

## Explore

- Four original team-inspired showroom cars built from the same 2022-style geometry as the replay fleet: Mercedes, Ferrari, McLaren and Red Bull. Inspect the exterior, enter the modeled cockpit, examine aero details and follow official team links.
- All 114 Grand Prix race records, searchable by season, event, circuit, country or winner. Sprints and cancelled races are excluded.
- Nine bundled full-race positional replays: British 2024, Monaco 2024, Singapore 2023, and Australian, Chinese, Japanese, Bahrain, Saudi Arabian and Italian 2025.
- Other supported 2023–2025 races can download recorded positions from OpenF1, subject to provider coverage and availability. Progress, cancellation and an optional device cache are included. Initial downloads can take several minutes and tens of megabytes.
- Real lap timing, tyre stints, pit events, position changes, weather and race control where supplied. Driver speed, gear, RPM, brake, throttle and raw DRS signals load when recorded telemetry is available.
- 37 licensed driver portraits, source/photographer/license credits, historical race-specific teams and constructor links. Archive photographs can show clothing from another season.
- A separate What-If Lab for supported full-distance finishers and dry stints. Hypothetical pit choices never alter historical trajectories or classification. Original inputs reproduce the official time; alternative assumptions produce explained model deltas.
- An independent fictional practice studio remains available through **Practice demo**, visibly labeled as simulation. See [DEMO_MODEL.md](DEMO_MODEL.md).

## Accuracy and visual scope

Bundled and downloaded trajectories retain actual source timestamps and coordinates, sampled near one second. Only valid brackets at most three seconds apart are interpolated, and longer gaps are hidden. No timing-based fictional trajectory substitutes for missing coordinates. The 3D view joins recorded samples along the circuit's recorded reference lap with a smoothed fit of each car's lap progress (provider timestamps jitter by a few tenths of a second, so raw one-second steps alternate between implausibly short and long). OpenF1 positions are approximate and cannot reliably resolve lateral placement, so lateral placement is smoothed, kept on the modelled road, and cars that would overlap are eased apart for display. None of this changes timing, positions, gaps or classification, and the analytical 2D view still plots the recorded coordinates. Suspension, steering and wheel motion are animated from the reconstructed path, not measured.

2021–2022 use historical results and timing rather than positional 3D. Coverage is visible per race. Recorded positions, interpolated positions, cumulative timing-derived clocks and hypothetical What-If results are distinguished.

Car meshes, cockpit interiors, road width, kerbs, run-off, terrain, barriers, scenery, hoardings (fictional brands only) and lighting are original visual reconstructions. They are not licensed manufacturer CAD, surveyed circuits or authentic onboard footage. Night venues and recorded rain adjust appearance only; they do not change recorded vehicle motion. Dashboards, the HUD and the DRS flap show available recorded signals and leave missing or stale values unavailable; the engine sound is synthesized, and falls back to an estimated RPM curve when no telemetry is recorded.

## Sources and licensing

[OpenF1](https://openf1.org/docs/) and [Jolpica](https://github.com/jolpica/jolpica-f1) supply the historical records under **CC BY-NC-SA 4.0**. Modified bundled data retains those terms. Wikimedia Commons portraits retain their individual credited licenses in `src/history/people-data.json` and the in-app photo credits. This is an independent noncommercial educational fan project with no official Formula 1 or team affiliation.

See [docs/historical-archive.md](docs/historical-archive.md) for archive ingestion, coverage, data limitations and runtime cache behavior; [HISTORICAL_DATA.md](HISTORICAL_DATA.md) describes the original British snapshot in detail. Per-race source notes remain in the UI and data files.

## Architecture and validation

- `scripts/ingest-archive.mjs`, `ingest-recorded-race.mjs`, `ingest-all-positions.mjs`: rate-limited, reproducible archive preprocessing.
- `public/history/`: catalogue and per-race normalized snapshots, optional telemetry and provenance.
- `src/history/`: validation, cached loaders, interpolation, track-guided motion (`trackGuide.ts`), live archive downloads, replay state and separate counterfactual model.
- `src/components/race3d/`: the real-time race engine: car geometry and materials, vehicle dynamics, per-frame race runtime, circuit builder and scenery, atmosphere, cameras, cockpit, spray, post-processing and engine audio.
- `src/components/historical/`: calendar, lineup, replay scene and HUD, synchronized charts and What-If workspace.
- `src/components/showroom/`: interactive four-team garage using the race engine's car.

The test suite verifies race counts and every snapshot route, all entrants' portrait/constructor identity, recorded duration coverage, DNS/retirement/disqualification behavior, interpolation limits, actual telemetry, What-If determinism and baseline identity, car geometry, cockpit sight lines, team paint and venue lighting. It also checks that track-guided motion follows corner geometry where straight chords cut inside it, keeps recorded lap progress, never reverses, and hides gaps and teleports; that real British GP motion stays on the road at plausible speeds; the 2022-style car's proportions and the driver's sight lines; suspension and steering directions; that barriers and scenery stay off the racing surface; that rendered cars never intersect; and race-control status parsing. Production builds run strict TypeScript checks. Desktop and mobile browser checks cover the showroom, archive, cockpit and replay controls.

Public source: [github.com/adithyap15122005/apexlab](https://github.com/adithyap15122005/apexlab).
