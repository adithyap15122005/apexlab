# British 2024 snapshot

Session: OpenF1 **9558**, meeting 1240, season 2024, round 12. Race start is the recorded `SESSION STARTED` message, **2024-07-07T14:03:12.540Z**. Replay times are seconds from that timestamp, not from the scheduled session start.

## Reproduce

```sh
node scripts/ingest-history.mjs --cache /absolute/path/outside-the-repository
npm test
npm run build
```

Without `--cache`, raw responses are stored in the sibling `historical-ingestion/raw/9558` directory outside this repository. A cold download takes several minutes. Cached JSON is reused. Requests use a custom User-Agent, at least 2.15 seconds between calls, and 429/5xx backoff, respecting OpenF1's documented 3 requests/second and 30/minute community limits. No credentials are needed for historical access. The script must finish successfully before treating a regenerated snapshot as complete.

The script writes `public/history/2024-british/race.json`, `telemetry-{number}.json`, and `provenance.json`. The manifest records raw source URLs, retrieval timestamps, SHA-256 digests, sample counts, and per-driver coverage. Do not commit raw caches or credentials. The raw-data license applies to the modified snapshots.

## Source and normalization

- [OpenF1 documentation](https://openf1.org/docs/): sessions, drivers, laps, position changes, intervals, pits, stints, weather, race control, session results, location and car data.
- [Jolpica official results](https://api.jolpi.ca/ergast/f1/2024/12/results.json?limit=100): starting grid, classification, completion status and official elapsed times.
- [Jolpica terms](https://github.com/jolpica/jolpica-f1/blob/main/TERMS.md): CC BY-NC-SA 4.0 and noncommercial usage.
- [OpenF1 homepage and terms](https://openf1.org/): attribution and community access terms, CC BY-NC-SA 4.0.
- The FIA media reference in `race.sources` supplies the factual 5.891-km circuit length; no publisher images or models are copied.

677,977 raw locations become 93,016 retained original samples, approximately one per second. Downsampling chooses actual samples nearest each whole replay second; it does not create coordinates. Location tuples are `[time, x, y, z]`, with raw X/Y as the horizontal plane. The renderer applies one uniform coordinate transform, flattens elevation for the illustrative road, and does not force cars onto the reference curve.

The road follows Hamilton's complete, dry, non-pit lap 8 (370 points). The indicative pit-lane trace follows his recorded lap-27 traversal (122 points). Road smoothing affects the visual surface only; it never supplies a car trajectory. Width, kerbs, buildings, scenery, and original instanced open-wheel cars are illustrative rather than surveyed or licensed team models.

Telemetry tuples are `[time, speed, throttle, brake, gear, rpm, drs]`. Invalid throttle/brake percentages outside 0–100 become null, not clamped readings. Other available signal values retain the source value. Charts use recorded elapsed lap time; no recorded distance channel is claimed. OpenF1's brake signal is binary 0/100; DRS codes are preserved, not converted into an invented continuous value.

## Clock, coverage and unavailable records

All 20 entrants are included, with 19 starters. Gasly did not start: his competitive locations and telemetry are empty. Russell's record ends at his last completed competitive lap (33); incomplete lap 34 has null duration/end. Retired and non-starting cars are hidden. Finished cars hold a valid last recorded point before their own completed race end, visibly labeled as finished.

Replay extends to **5,037.609 seconds**, the final competitive lap end of the last finisher. Hamilton's official classified result is **4,947.059 seconds**; his OpenF1 timestamp-derived lap end is **4,947.561 seconds**. These are different source measurements and remain separate.

All retained starter location streams have no gaps longer than three seconds. The player still handles such a gap by hiding that car. Linear interpolation only occurs between valid recorded brackets at most three seconds apart. The player never extrapolates. Data quality labels distinguish an exact recorded timestamp, an interpolated location, a gap/unavailable record, and a held finish point.

Missing lap starts, durations, sectors and unfinished lap ends remain null. Perez's first-lap start and duration are absent from OpenF1. The nearest available recorded lap start is used for a seek when the requested start is missing; timing is not fabricated. Provider positions and intervals retain their asynchronous update cadence and may lag car-location samples.

## Pit records

`HistoricalPit.duration` is **recorded time in the pit lane**, not stationary service time or net strategic time loss. For this race OpenF1 does not supply stationary duration; `stationary` remains null. OpenF1's timing-message date is not assumed to be exact entry time. Approximate entry is derived as message date minus lane duration and is labeled accordingly. Pit-lane highlighting and event jumps use this same approximation.

## Separate counterfactual model

The What-If model anchors to official classification time and applies local per-lap deltas. It supports full-distance finishers and a dry replacement stint, with the selected stop moved at most three laps. Unchanged settings reproduce the baseline exactly. Same inputs repeat exactly, and race records are never mutated.

The initial wear coefficient uses median changes in clean consecutive laps, bounded to 0–0.300 seconds per tyre-age lap. It contains fuel/track/driver effects and is therefore an assumption rather than a measured tyre-only quantity. Compound offsets use clean race-lap-matched medians across actual drivers, excluding pit/adjacent laps and first two stint laps. Sparse data and cross-driver differences limit causal interpretation.

The 22-second baseline net pit loss is an explicit assumption, independent of the recorded lane duration. Candidate pit loss and a one-time rejoin traffic penalty are editable. All other stops, historical variation, incidents, weather and rivals stay fixed. A moved wet-to-dry crossover assumes usable slick conditions and exposes an especially uncertain inferred window difference. It does not predict grip, aquaplaning, weather, overtakes or opponent reactions.

Hypothetical rank compares only full-distance finishers against fixed official rival times. Lapped, retired, and non-starting entries receive no invented finishing-time prediction. Wet replacement tyres and wet-phase strategy swaps produce explanatory unsupported results rather than fabricated estimates.

## Licensing

This is a noncommercial educational fan experience. OpenF1 and Jolpica data and modified snapshots are attributed under **Creative Commons Attribution-NonCommercial-ShareAlike 4.0 International**: https://creativecommons.org/licenses/by-nc-sa/4.0/. Redistribution must preserve attribution, noncommercial restrictions and share-alike terms. Source rights do not imply an official relationship with Formula 1, FIA, teams or drivers.

Original procedural visuals do not reproduce team liveries, track branding, downloaded commercial assets, or broadcast footage. The virtual onboard view is reconstructed from samples and is labeled accordingly.
