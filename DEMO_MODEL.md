# APEXLAB — The Race Strategy Studio

**Every second is a decision.**

ApexLab is an interactive motorsport learning studio built for HyperBloom October. Replay a fictional race, explore the relationship between tyre age and pace, and make a pit-wall decision with a repeatable, explainable result.

All competitors, the circuit, race data, speed traces, and outcomes are fictional simulations. This project has no official Formula 1 affiliation.

## Run locally

Use Node.js 22.12 or later and npm.

```sh
npm install
npm run dev
```

Open the local URL printed by Vite. The app runs entirely in the browser; it needs no API keys, account, database, or continuously running backend.

```sh
npm test          # Deterministic engine checks
npm run build    # TypeScript validation and production bundle
npm run preview  # Serve the built app locally
```

The production site is generated in `dist/`. It can be served by any static host. Pushing the source to GitHub does not itself publish a live website.

## Interactive 3D studio

The 3D experiences use original procedural geometry: no remote vehicle files, racing-team liveries, paid model downloads, or external asset servers are required. The visuals illustrate the same fictional race used by the strategy engine.

- **Apex-01 hero:** explore an original open-wheel racing car with graphite bodywork, a generated carbon-style texture, lime aerodynamic details, and local studio lighting. Drag or use the camera buttons to inspect it. Restrained idle motion and a scroll-linked change of angle connect the car to the landing page.
- **Circuit explorer:** orbit and zoom an elevated miniature circuit, explore its three sectors, and jump to representative race events. Driver markers, selected-driver timing, and highlighted pit stops follow the shared replay lap. The selected sector also has ordinary keyboard-accessible controls below the scene. Track positions are illustrative; timing comes from the model.
- **Pit-stop experience:** a short sequence shows pit entry, a tyre change, and the rejoin. The service clock distinguishes the 2.4-second stationary stop from the modeled total pit-lane loss. Results calculate immediately; watching the animation is optional. Use **Skip animation**, or replay the stop after a decision. Travel time in the sequence is compressed for illustration.
- **Tyre laboratory:** rotate a tyre, select Soft, Medium, or Hard, and change its age. A linked engine-derived chart compares running pace while holding fuel at the selected replay lap, so tyre differences are easier to understand. The laboratory follows the selected driver and lap until you experiment; **Sync to replay** restores that connection. Rubber tint and scuff marks illustrate wear, rather than simulating physical rubber or measured grip.

- **Layered strategy routes:** a perspective view separates each strategy's path through the same race. Pit-lap edits update the paths and calculated times; **Flatten view** removes depth, and the original compound timelines remain available for precise comparison.

Drag to orbit and pinch to zoom, or use the labeled rotate, zoom, and reset buttons. Each scene includes a **2D** switch. The 2D choice is stored as a local browser preference; if WebGL is unavailable or fails, a schematic alternative retains the strategy information and controls. Reduced-motion preferences suppress automatic scene motion. During the short pit sequence, the cinematic camera takes control; Skip restores direct camera interaction immediately.

Scenes render on demand, stop their animation clock while off-screen or in a hidden tab, and cap device pixel ratio at 1.5. Animated scenes use a 30-frame-per-second invalidation clock. Studio lighting is generated locally, with a small one-frame reflection environment rather than a downloaded HDR image.

## A 75-second demonstration

| Time | Action | What the visitor learns |
| --- | --- | --- |
| 0–10s | Orbit the Apex-01 hero and enter the Strategy Lab. | The product makes race strategy understandable through decisions. |
| 10–25s | Scrub the replay around lap 18 and inspect the 3D circuit or its 2D alternative. | Fresh tyres and pit timing change race pace; explanations follow the selected lap. |
| 25–40s | Open Strategy Compare and move a pit lap or change compound. | A faster stint can be outweighed by the time lost in the pit lane. |
| 40–60s | Open the Pit Wall, choose a stop and replacement tyre, then run the decision. Watch or skip the pit-stop sequence. | The model calculates a finishing time and comparison immediately from the actual inputs. |
| 60–70s | Retry with another decision or enable the safety-car scenario. | Identical inputs repeat; a changed assumption can change the outcome. |
| 70–75s | Open the learning/methodology information. | Results are transparent estimates, and the learning experience works without sign-in. |

## Model and methodology

The default Apex Grand Prix has 46 laps, dry conditions, an original fictional circuit, and three fictional competitors: Kai Sato, Luca Moretti, and Elena Costa. Lap 18 is the initial exploration point. One typed deterministic engine supplies the replay, strategy comparisons, telemetry, and pit-wall results.

Each predicted lap combines a driver's baseline pace with compound pace, tyre age and degradation, a fuel effect, traffic, an out-lap adjustment, and any applicable safety-car adjustment. The race total is the sum of those laps, with total pit-lane loss included once for each stop. Total pit-lane loss is different from the time a car is stationary while tyres are changed.

A pit stop changes the compound and resets stint age. Strategy changes therefore recalculate future lap times and total elapsed time. A dry-race strategy must use at least two compounds. This is an educational convention inspired by racing rules, not a claim to implement every sporting regulation.

### Default assumptions

| Input | Soft | Medium | Hard |
| --- | --- | --- | --- |
| Initial compound pace adjustment | −0.65s | 0.00s | +0.55s |
| Linear degradation per tyre-age lap | +0.115s | +0.075s | +0.045s |
| Nominal tyre life | 20 laps | 32 laps | 42 laps |
| Replacement-tyre first-lap adjustment | +0.16s | +0.30s | +0.48s |

Tyres beyond their nominal life receive an additional `0.055 × (age − nominal life)²` seconds per lap. Fuel contributes +1.8 seconds on lap 1 and decreases linearly to zero on lap 46. Rejoining traffic adds a penalty that fades over three laps, starting at +0.60 seconds for a stop on or before lap 20 and +0.24 seconds for a later stop.

The normal total pit-lane loss is 22 seconds, including a 2.4-second stationary stop. A stop takes place at the end of its named lap; replacement tyres are used from the following lap. The predefined safety car covers laps 22–24, uses a slower lap-time formula, and reduces total pit-lane loss to 13.18 seconds. Tyres continue to age during that period. The simplified scenario does not bunch the field or implement an overtaking restriction.

Pit laps must be whole numbers from 1 to 45 in strictly increasing order, with one more compound than stops and at least two distinct dry compounds. Lap predictions round to milliseconds, and elapsed time sums those per-lap values.

The model does not use random outcomes. Repeating the same inputs produces the same result. The safety-car option applies a predefined scenario; it does not predict an incident.

### Practical limitations

- Simulated gaps and finishing positions depend on the included fictional field and its strategies.
- Degradation, traffic, fuel, and tyre warm-up are simplified assumptions, not calibrated physical predictions.
- Speed traces illustrate representative track-position samples. They are not measured real-world telemetry.
- Weather changes, mechanical failures, driver errors, team execution variation, and a complete racing-rule system are outside the model.
- A quicker estimated race is an outcome under these assumptions, not a guaranteed real-world strategy recommendation.

The engine source is separate from the interface in `src/engine/`; its tests document numerical invariants and edge cases.

## Accessibility and resource-conscious design

The interface uses semantic controls, readable labels, visible keyboard focus, textual tyre labels, chart descriptions, and reduced-motion support. The race playback can be paused and the essential data remains available without animation. Responsive layouts support desktop, tablet, and mobile exploration. These are implementation choices, not a claim of independent WCAG certification.

The experience uses local sample data, self-hosted fonts, SVG graphics, procedural 3D geometry, and lightweight charts. It has no autoplay video, analytics tracker, or external data polling. Switching to 2D avoids the 3D renderer while preserving the learning tools. Optional strategy resource information counts stops and tyre sets; it does not invent carbon or energy savings.

## Technology

React, TypeScript, Vite, Tailwind CSS, Framer Motion, Lucide icons, custom SVG data visualizations, Three.js, React Three Fiber, and Drei. Fonts: Space Grotesk, Inter, and IBM Plex Mono, served locally through Fontsource. Shared 3D presentation, controls, fallback, and rendering policies live in `src/components/three/SceneFrame.tsx`.

## Repository

[github.com/adithyap15122005/apexlab](https://github.com/adithyap15122005/apexlab)
