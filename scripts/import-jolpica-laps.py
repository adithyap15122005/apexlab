"""Import all available 2021–2022 driver laps from the public delayed CSV dump.

Run node scripts/download-jolpica-dump.mjs first. Uses only Python's standard
library. Checks the publisher's manifest hash before reading any source rows.
"""
import csv
import hashlib
import io
import json
from pathlib import Path
import zipfile

root = Path(__file__).resolve().parents[1]
cache = root.parent / 'historical-ingestion' / 'archive'
manifest = json.loads((cache / 'jolpica-dump-manifest.json').read_text(encoding='utf-8'))
body = (cache / 'jolpica-delayed.zip').read_bytes()
assert hashlib.sha256(body).hexdigest() == manifest['sha256'], 'CSV dump checksum mismatch'
archive = json.loads((root / 'public/history/archive.json').read_text(encoding='utf-8'))
targets = {(r['year'], r['round']): r for r in archive['races'] if r['year'] in (2021, 2022)}

with zipfile.ZipFile(io.BytesIO(body)) as source:
    def rows(table):
        return csv.DictReader(io.TextIOWrapper(source.open(f'formula_one_{table}.csv'), encoding='utf-8-sig'))

    seasons = {r['id']: int(r['year']) for r in rows('season') if r['year'] in ('2021', '2022')}
    rounds = {r['id']: targets[(seasons[r['season_id']], int(r['number']))] for r in rows('round')
              if r['season_id'] in seasons and r['is_cancelled'] != 't' and (seasons[r['season_id']], int(r['number'])) in targets}
    sessions = {r['id']: rounds[r['round_id']] for r in rows('session') if r['round_id'] in rounds and r['type'] == 'R'}
    entries = {r['id']: r for r in rows('roundentry') if r['round_id'] in rounds}
    session_entries = {r['id']: (sessions[r['session_id']], int(entries[r['round_entry_id']]['car_number']))
                       for r in rows('sessionentry') if r['session_id'] in sessions and r['round_entry_id'] in entries}
    laps = {}
    for r in rows('lap'):
        if r['session_entry_id'] not in session_entries or not r['number'] or not r['time']:
            continue
        race, number = session_entries[r['session_entry_id']]
        parts = [float(v) for v in r['time'].split(':')]
        duration = round(sum(v * 60 ** i for i, v in enumerate(reversed(parts))), 3)
        if duration <= 0:
            continue
        laps.setdefault((race['id'], number), {})[int(r['number'])] = duration

    total = 0
    for entry in targets.values():
        filename = root / 'public/history' / entry['id'] / 'race.json'
        race = json.loads(filename.read_text(encoding='utf-8'))
        for driver in race['drivers']:
            values = laps.get((entry['id'], driver['number']), {})
            cumulative = 0
            normalized = []
            clock_known = True
            previous = 0
            for lap, duration in sorted(values.items()):
                if lap != previous + 1:
                    clock_known = False
                start = cumulative if clock_known else None
                cumulative = round(cumulative + duration, 3)
                normalized.append(dict(lap=lap, start=start, end=cumulative if clock_known else None,
                                       duration=duration, sector1=None, sector2=None, sector3=None))
                previous = lap
            race['laps'][str(driver['number'])] = normalized
            total += len(normalized)
        race['coverage']['notes'] = [note for note in race['coverage']['notes']
                                    if not ('Recorded ' in note and 'lap durations are bundled from Jolpica' in note)]
        note = ('All available driver lap durations use the public Jolpica CSV export. '
                'Elapsed start/end clocks are derived cumulative durations, not original timestamped telemetry. '
                'Missing lap records leave subsequent elapsed clocks unavailable. Sectors, tyre compounds and coordinates remain unavailable. '
                'Red-flag suspensions can prevent cumulative lap clocks from matching official elapsed classification time.')
        if note not in race['coverage']['notes']:
            race['coverage']['notes'].append(note)
        if not any(s['url'] == manifest['source'] for s in race['sources']):
            race['sources'].append(dict(label='Jolpica public delayed CSV export · all available driver lap durations',
                                       url=manifest['source'], license='CC BY-NC-SA 4.0'))
        filename.write_text(json.dumps(race, separators=(',', ':'), ensure_ascii=False), encoding='utf-8')
    (root / 'public/history/jolpica-laps-provenance.json').write_text(json.dumps(dict(
        **manifest, processing='All available 2021–2022 race-session lap durations; cumulative clocks only while lap sequence is complete.',
        races=len(targets), laps=total), indent=2), encoding='utf-8')
    print(json.dumps(dict(races=len(targets), laps=total, sourceSha256=manifest['sha256'])))
