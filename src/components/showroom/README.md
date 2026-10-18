# ApexLab showroom assets

The four visible cars are original procedural reconstructions made for ApexLab. They contain no imported manufacturer CAD, extracted game models, copied sponsor graphics, or downloaded textures. Canvas lettering, carbon texture, car geometry, cockpit, wheel and tyre geometry are generated in source. Team names, driver numbers and broad 2024 colours identify historical competitors; geometry and cockpit controls are approximate and are labelled accordingly in the UI.

The car names and 2024 driver lineups were checked against the official team histories and launch articles:

- Mercedes W15: https://www.mercedesamgf1.com/car/2024
- Ferrari SF-24: https://www.ferrari.com/en-CA/formula1/year-2024
- McLaren MCL38: https://www.mclaren.com/racing/formula-1/2024/mclaren-formula-1-team-reveals-the-mcl38/
- Red Bull RB20: https://www.redbullracing.com/int-en/cars/rb20

The driver photographs are remote Wikimedia Commons thumbnails. `src/history/people-data.json` records the source image page, exact license and license URL, photographer credit, original photo date, description, and a notice about the displayed portrait crop for every image. This metadata was obtained from the Commons MediaWiki `imageinfo/extmetadata` API. The app preserves individual attribution links through the showroom credits and driver portrait component. Photographs may have been taken outside the selected season; historical team affiliations must always come from race data, never a photo's clothing.

`TeamShowroom` renders one detailed car at a time, on demand, and releases generated textures on unmount. The four team selection cards use lightweight original SVG illustrations. Driver-eye and cockpit-detail views support pointer drag and labelled directional controls; mobile camera changes bring the studio back into view. The 2D fallback provides the same team and driver selectors with a clear WebGL requirement for the interior view.
