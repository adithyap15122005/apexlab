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

## Azure deployment

Live site: **[apexlab on Azure](https://ambitious-glacier-0b1dc7200.2.azurestaticapps.net)**.

Hosted on Azure Static Web Apps **Free**, in **East Asia**, using the `apexlab-adithya` app in resource group `apexlab-rg`. Pushes to `main` run the test suite, build the latest code and deploy through [the Azure workflow](.github/workflows/azure-static-web-apps.yml). The workflow can also be run manually in GitHub Actions. Its deployment token is kept in the encrypted repository secret `AZURE_STATIC_WEB_APPS_API_TOKEN`.

`public/staticwebapp.config.json` provides SPA refresh routing, long-lived caching for hashed assets, and separate caching for race data. Missing assets and historical JSON return 404 instead of the app HTML. Vite serves assets from the domain root. No application backend, database, or paid App Service plan is required.

Choose **Choose your race**, pick a highlighted recorded race, select a driver, and choose **Enter this cockpit**. The driver's-seat camera supports drag or arrow-key look-around, recenter, full screen, driver switching, playback, lap selection, scrubbing and speed controls. Eleven views share the same clock: **Director** (automatic broadcast cuts), Cockpit, T-cam, Nose cam, Rear cam, Chase, driver-following Top view, north-up Whole circuit, Helicopter, Trackside TV and Free orbit. **Engine sound** and a **Graphics** preset (Ultra / High / Medium / Low) sit beside the scene; the fullscreen player includes its own camera and graphics selectors.

## Strategy School — F1 strategy for beginners and kids

**Strategy School** (landing page, top navigation, race-archive header and the in-replay coach all link to it) explains race strategy simply enough for an 8-year-old:

- Seven animated lessons: *Tyres are like shoes* (a live three-tyre race with draining grip bars), *The pit stop trade* (an animated pit crew changing four tyres, then a balance scale showing when a stop pays back), *The undercut* (two cars play out an undercut lap by lap; a slider shows when it works or fails), *Safety car = cheap stop*, *DRS & slipstream* (the rear-wing flap opens), *Rain changes everything* (a wetness slider picks the right tyre) and *Build a race plan* (the two-tyre rule, a strategy builder and the engineer's optimal plan).
- A quick question after each lesson, stars and ranks from Spectator to Race Engineer and Champion, a picture glossary of racing words, and a link into real races.
- **Be the Race Engineer**: a real-time mini race against four rival teams. Pick a starting tyre, watch the grip bar, shout **BOX BOX** and choose new tyres. A random safety car rewards a smart stop, the two-tyre rule is enforced, and an engineer explains the result.
- Lessons and the game share one deliberately simple, deterministic teaching model (`src/school/schoolModel.ts`), separate from historical data.

In real races, every **Tyre strategies** page now opens with a plain-language strategy story: how the winner won and how your driver raced, drawn as tyre timelines, plus *moments that decided the race* — real undercuts, overcuts and weather calls detected from recorded pit stops and positions, each with a *Watch it in 3D* button.

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
- **Broadcast graphics.** An animated race-title card that draws the circuit, a live mini track map, and toasts for overtakes, lead changes, pit stops (with the tyre change), fastest laps, the final lap and the chequered flag — all from recorded data.
- **Race Coach.** A beginner panel explains, in one or two simple sentences, what matters for your driver right now: a pit stop, fresh tyres, rain, a safety car or red flag, DRS, a battle within a second, or worn-out tyres.
- **People.** Grandstands full of spectators doing a Mexican wave (cheering at the start and finish), marshals who wave flags whenever race control shows yellow, safety car or red, and crews waiting in front of every garage.
- **Live pit stops.** Every recorded pit stop is played out in the pit lane. The car slows into its team's painted box. A 19-person crew in team colours steps in: three mechanics per wheel (gun, off, on), front and rear jacks, stabilisers, wing men and the release operator. The car rises on the jacks, the old tyres are carried away and the new compound goes on, then the crew celebrates as the car is released. Teammates who stop back to back share one box and one crew. Trackside, Chase and Director switch to a raised pit-wall view for the followed driver's stop.
- **Pit-stop graphics.** A broadcast panel for the followed driver shows a stopwatch, each wheel flipping from the old tyre to the new one, the compounds with the old set's age, recorded pit-lane time and the position before and after, with a simple sentence explaining what is happening. The race coach steps aside while it is on screen. A ticker announces every other driver's stop; click it to follow that driver.

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

Pit stops use the recorded pit-lane entry, lane time, lap and tyre stints. The stationary time is recorded for most 2025 races and is labelled as recorded. Where the provider has none, the animation uses a typical 2.5 s change and says so. The box position is estimated from where the car's recorded positions moved least. Holding the car in its box, the jacks, the crew and the tyre swap are display-only and never change timing or positions. Red-flag pit-lane parking is not animated as a tyre stop.

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
- `src/history/strategyStory.ts`: broadcast moments, the race coach, strategy stories and undercut/overcut detection from recorded data.
- `src/history/pitStops.ts`, `src/components/race3d/PitStopCrew.tsx`, `src/components/historical/PitStopGraphics.tsx`: pit-stop timing, the choreographed 3D crew and the broadcast pit-stop panel and ticker.
- `src/school/` and `src/components/school/`: the Strategy School teaching model, lessons, visuals and the race-engineer game.

The test suite verifies race counts and every snapshot route, all entrants' portrait/constructor identity, recorded duration coverage, DNS/retirement/disqualification behavior, interpolation limits, actual telemetry, What-If determinism and baseline identity, car geometry, cockpit sight lines, team paint and venue lighting. It also checks that track-guided motion follows corner geometry where straight chords cut inside it, keeps recorded lap progress, never reverses, and hides gaps and teleports; that real British GP motion stays on the road at plausible speeds; the 2022-style car's proportions and the driver's sight lines; suspension and steering directions; that barriers and scenery stay off the racing surface; that rendered cars never intersect; and race-control status parsing. Strategy tests check the winner's story, real undercut detection (Hamilton's switch to slicks a lap before Norris at Silverstone 2024), coach topics and broadcast moments; pit-stop tests check recorded stationary times (Japan 2025), the typical-time fallback inside the recorded pit-lane window, compounds from stints, that red-flag parking is not animated, and that a pitting car stands still in its box, rises on the jacks and leaves on the new compound; school tests check tyre behaviour, pit payback, when the undercut works, the two-tyre rule and plan optimiser, and that the game rewards a safety-car stop and classifies a one-tyre race last. Production builds run strict TypeScript checks. Desktop and mobile browser checks cover the showroom, archive, cockpit and replay controls.

Public source: [github.com/adithyap15122005/apexlab](https://github.com/adithyap15122005/apexlab).
