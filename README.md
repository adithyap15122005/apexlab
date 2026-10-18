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

## A 75-second demonstration

| Time | Action | What the visitor learns |
| --- | --- | --- |
| 0–10s | Start at the circuit hero and enter the Strategy Lab. | The product makes race strategy understandable through decisions. |
| 10–25s | Scrub the replay around lap 18, then select an event. | Fresh tyres and pit timing change race pace; explanations follow the selected lap. |
| 25–40s | Open Strategy Compare and move a pit lap or change compound. | A faster stint can be outweighed by the time lost in the pit lane. |
| 40–60s | Open the Pit Wall, choose a stop and replacement tyre, then run the decision. | The model calculates a finishing time and comparison from the actual inputs. |
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

The experience uses local sample data, self-hosted fonts, SVG graphics, and lightweight charts. It has no autoplay video, analytics tracker, or external data polling. Optional strategy resource information counts stops and tyre sets; it does not invent carbon or energy savings.

## Technology

React, TypeScript, Vite, Tailwind CSS, Framer Motion, Lucide icons, and custom SVG data visualizations. Fonts: Space Grotesk, Inter, and IBM Plex Mono, served locally through Fontsource.

## Repository

[github.com/adithyap15122005/apexlab](https://github.com/adithyap15122005/apexlab)
