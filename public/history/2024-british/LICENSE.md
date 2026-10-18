# Historical data attribution

The normalized data in this directory is adapted from [OpenF1](https://openf1.org/docs/) and [Jolpica-F1](https://github.com/jolpica/jolpica-f1). OpenF1 supplies historical timing, location, car signals, tyres, weather and race control. Jolpica supplies official grid and classification for the 2024 British Grand Prix. Source URLs, retrieval timestamps, hashes and transformations are documented in `provenance.json` and the repository's `HISTORICAL_DATA.md`.

Source data and these modified snapshots are provided under **Creative Commons Attribution-NonCommercial-ShareAlike 4.0 International (CC BY-NC-SA 4.0)**. See the full license: https://creativecommons.org/licenses/by-nc-sa/4.0/legalcode.en

Adaptations include filtering to the competitive race, retaining approximately one original sample per second, relative timestamps, normalized fields and unavailable-value markers. No source coordinate interpolation is performed during ingestion. Runtime interpolation is separately labeled in the application. This is an independent, noncommercial educational fan project, with no official Formula 1 affiliation.
