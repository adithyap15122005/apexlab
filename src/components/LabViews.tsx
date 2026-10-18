import { lazy, Suspense, useEffect, useId, useMemo, useRef, useState } from 'react';
import type { CSSProperties, KeyboardEvent, PointerEvent } from 'react';
import { BASE_STRATEGIES, COMPOUNDS, DRIVERS, PIT_LANE_LOSS, STATIONARY_STOP_TIME, TOTAL_LAPS, formatDelta, formatTime, simulateStrategy } from '../engine/race';
import type { Compound, Strategy } from '../engine/race';
import './LabViews.css';

const TyreLab = lazy(()=>import('./three/TyreLab'));
const StrategyDepth = lazy(()=>import('./three/StrategyDepth'));

type LabProps = {
  lap: number;
  setLap: (lap: number) => void;
  driverId: string;
  analyst: boolean;
  safetyCar: boolean;
  onNavigate: (view: string) => void;
};
const compoundNames: Compound[] = ['soft', 'medium', 'hard'];
const copyStrategies = () => BASE_STRATEGIES.slice(0, 3).map(strategy => ({ ...strategy, compounds: [...strategy.compounds], pitLaps: [...strategy.pitLaps] }));
const clampLap = (lap: number) => Math.max(1, Math.min(TOTAL_LAPS, lap));
const compoundStyle = (compound: Compound) => ({ '--tyre-color': COMPOUNDS[compound].color }) as CSSProperties;

function ViewHeading({ eyebrow, title, description, children }: { eyebrow: string; title: string; description: string; children?: React.ReactNode }) {
  return <header className="lab-view-heading"><div><p className="eyebrow">{eyebrow}</p><h1>{title}</h1><p className="muted">{description}</p></div>{children}</header>;
}

function CompoundLabel({ compound }: { compound: Compound }) {
  return <span className="lab-compound" style={compoundStyle(compound)}><span>{COMPOUNDS[compound].letter}</span>{COMPOUNDS[compound].name}</span>;
}

export function StrategyView({ lap, setLap, driverId, analyst, safetyCar, onNavigate }: LabProps) {
  const [strategies, setStrategies] = useState<Strategy[]>(copyStrategies);
  const [resourceOpen, setResourceOpen] = useState(false);
  const driver = DRIVERS.find(item => item.id === driverId) ?? DRIVERS[0];
  const results = useMemo(() => strategies.map(strategy => simulateStrategy(strategy, driver, safetyCar)), [strategies, driver, safetyCar]);
  const fastest = results.reduce((best, result, index) => result.valid && (best === -1 || result.totalTime < results[best].totalTime) ? index : best, -1);
  const slowest = Math.max(...results.filter(result => result.valid).map(result => result.totalTime));
  const gain = fastest === -1 ? 0 : slowest - results[fastest].totalTime;
  const update = (index: number, changes: Partial<Strategy>) => setStrategies(current => current.map((strategy, row) => row === index ? { ...strategy, ...changes } : strategy));
  const setStops = (index: number, stops: number) => {
    const strategy = strategies[index];
    update(index, { compounds: stops === 1 ? [strategy.compounds[0], strategy.compounds[1] ?? 'hard'] : [strategy.compounds[0], strategy.compounds[1] ?? 'medium', strategy.compounds[2] ?? 'hard'], pitLaps: stops === 1 ? [Math.min(strategy.pitLaps[0] ?? 23, 44)] : [Math.min(strategy.pitLaps[0] ?? 15, 30), 32] });
  };
  const download = () => {
    const url = URL.createObjectURL(new Blob([JSON.stringify({ race: 'Apex Grand Prix', laps: TOTAL_LAPS, driver: driver.id, safetyCar, strategies }, null, 2)], { type: 'application/json' }));
    const anchor = document.createElement('a'); anchor.href = url; anchor.download = 'apexlab-strategies.json'; anchor.click(); URL.revokeObjectURL(url);
  };
  return <section className="strategy-view lab-view">
    <ViewHeading eyebrow="02 / STRATEGY COMPARE" title="Same race. Different decisions." description="Move a stop. Change a compound. Watch the race add up.">
      <button className="button button-ghost" onClick={() => setStrategies(copyStrategies())}><span aria-hidden="true">↺</span> Reset strategies</button>
    </ViewHeading>
    <div className="strategy-context"><span className="tag">{driver.name}</span><span className="muted">46 laps · dry race · {safetyCar ? 'safety car enabled' : 'green-flag conditions'}</span><div className="strategy-legend">{compoundNames.map(compound => <CompoundLabel key={compound} compound={compound} />)}</div></div>
    <Suspense fallback={null}><StrategyDepth strategies={strategies} results={results} lap={lap} setLap={setLap}/></Suspense>
    <div className="strategy-ruler"><span>STRATEGY / TYRE STINTS</span><div>{[1, 10, 20, 30, 40, 46].map(value => <span key={value} style={{ left: `${(value - 1) / 45 * 100}%` }}>{value}</span>)}</div><span>RACE ESTIMATE</span></div>
    <div className="strategy-rows">
      {strategies.map((strategy, index) => {
        const result = results[index];
        const current = result.laps[clampLap(lap) - 1];
        const boundaries = [0, ...strategy.pitLaps, TOTAL_LAPS];
        return <article className={`strategy-row ${index === fastest && result.valid ? 'is-fastest' : ''}`} key={strategy.id}>
          <div className="strategy-row-heading"><span className="strategy-letter mono">{String.fromCharCode(65 + index)}</span><div><h2>{strategy.name}</h2><p className="muted">{strategy.pitLaps.length} {strategy.pitLaps.length === 1 ? 'stop' : 'stops'} · {index === fastest && result.valid ? 'Quickest valid strategy' : 'Alternative approach'}</p></div></div>
          <div className="stint-timeline" aria-label={`${strategy.name} stint timeline. Selected lap ${lap}`}>
            {strategy.compounds.map((compound, stint) => {
              const length = boundaries[stint + 1] - boundaries[stint];
              return <button key={stint} className={`stint-segment stint-${compound}`} style={{ ...compoundStyle(compound), flex: length }} onClick={() => setLap(boundaries[stint] + Math.ceil(length / 2))} aria-label={`${COMPOUNDS[compound].name} stint, laps ${boundaries[stint] + 1} to ${boundaries[stint + 1]}. Inspect midpoint.`}><strong>{COMPOUNDS[compound].letter}</strong><span>{length} laps</span>{stint < strategy.pitLaps.length && <i className="stint-pit" aria-hidden="true">P</i>}</button>;
            })}
            <div className="stint-cursor" style={{ left: `${(lap - .5) / TOTAL_LAPS * 100}%` }} aria-hidden="true"><span>{lap}</span></div>
          </div>
          <div className="strategy-estimate"><strong className="mono">{formatTime(result.totalTime)}</strong><span className={`mono ${index === fastest ? 'lime-text' : 'muted'}`}>{!result.valid ? 'CHOOSE TWO COMPOUNDS' : index === fastest ? 'REFERENCE' : `${formatDelta(result.totalTime - results[fastest].totalTime)} to best`}</span></div>
          <details className="strategy-editor"><summary>Edit strategy <span aria-hidden="true">＋</span></summary><div className="strategy-editor-content">
            <label>Number of stops<select value={strategy.pitLaps.length} onChange={event => setStops(index, Number(event.target.value))}><option value="1">One stop · 2 sets</option><option value="2">Two stops · 3 sets</option></select></label>
            {strategy.compounds.map((compound, stint) => <label key={stint}>Stint {stint + 1}<select value={compound} onChange={event => update(index, { compounds: strategy.compounds.map((old, n) => n === stint ? event.target.value as Compound : old) })}>{compoundNames.map(name => <option value={name} key={name}>{COMPOUNDS[name].name}</option>)}</select></label>)}
            {strategy.pitLaps.map((pitLap, stop) => <label key={stop} className="pit-lap-control">Stop {stop + 1} after lap <output className="mono">{pitLap}</output><input type="range" aria-label={`Strategy ${String.fromCharCode(65 + index)} stop ${stop + 1} pit lap`} min={(strategy.pitLaps[stop - 1] ?? 0) + 1} max={(strategy.pitLaps[stop + 1] ?? TOTAL_LAPS) - 1} value={pitLap} onChange={event => update(index, { pitLaps: strategy.pitLaps.map((old, n) => n === stop ? Number(event.target.value) : old) })} /></label>)}
          </div></details>
          {!result.valid && <p className="strategy-validation" role="status">{result.issues.join(' ')} Use at least two different compounds for a valid dry-race strategy.</p>}
          {current && <div className="strategy-lap-note"><span className="mono">LAP {lap}</span><CompoundLabel compound={current.compound} /><span>{current.tyreAge} laps old</span><span className="mono">{formatTime(current.lapTime)}</span>{analyst && <span>{current.tyreLife.toFixed(0)}% estimated life · {result.pitLoss.toFixed(1)}s total pit loss</span>}</div>}
        </article>;
      })}
    </div>
    <div className="strategy-insight"><div className="insight-symbol" aria-hidden="true">↗</div><div><p className="eyebrow">THE TIME BETWEEN THE LINES</p><h2>{fastest === -1 ? 'Choose two compounds to put a valid strategy on the board.' : `${strategies[fastest].name} gains ${gain.toFixed(2)} seconds over the slowest valid option.`}</h2><p className="muted">{fastest === -1 ? 'This dry-race scenario requires at least two different tyre compounds in each strategy. Update a stint or reset the baseline.' : strategies[fastest].pitLaps.length === 1 ? 'One stop limits the time spent in the pit lane. The remaining balance comes from compound pace and tyre age.' : 'The extra stop trades pit-lane time for fresher tyres. The total above includes both sides of that trade.'} All estimates use {driver.name}'s same baseline pace.</p></div><button className="button button-primary" onClick={() => onNavigate('pitwall')}>Make the call <span aria-hidden="true">↗</span></button></div>
    <Suspense fallback={null}><TyreLab lap={lap} driverId={driverId} safetyCar={safetyCar}/></Suspense><div className="resource-panel"><button className="resource-toggle" aria-expanded={resourceOpen} onClick={() => setResourceOpen(!resourceOpen)}><span><span className="eyebrow">A WIDER PERSPECTIVE</span><strong>Performance has a resource side.</strong></span><span aria-hidden="true">{resourceOpen ? '−' : '+'}</span></button>{resourceOpen && <div className="resource-content"><div className="resource-table-wrap"><table><caption className="sr-only">Tyre resources used by each strategy</caption><thead><tr><th>Strategy</th><th>Tyre sets</th><th>Pit stops</th><th>Stint lengths</th><th>Average set use</th></tr></thead><tbody>{strategies.map(strategy => { const bounds = [0, ...strategy.pitLaps, TOTAL_LAPS]; return <tr key={strategy.id}><th>{strategy.name}</th><td className="mono">{strategy.compounds.length}</td><td className="mono">{strategy.pitLaps.length}</td><td className="mono">{strategy.compounds.map((_, n) => `${bounds[n + 1] - bounds[n]}L`).join(' / ')}</td><td className="mono">{(TOTAL_LAPS / strategy.compounds.length).toFixed(1)} laps</td></tr>; })}</tbody></table></div><p className="muted">Fresher tyres may improve pace while requiring another set and stop. This comparison shows resource use; it does not assign an environmental benefit to a racing strategy.</p><button className="button button-ghost" onClick={download}>↓ Download scenario settings</button></div>}</div>
  </section>;
}

type ChartSeries = { name: string; color: string; values: number[]; dashed?: boolean };
type LineChartProps = { title: string; question: string; series: ChartSeries[]; selected: number; onSelect: (index: number) => void; xLabels: number[]; unit: string; xUnit?: string; format?: (value: number) => string; description: string };
function LineChart({ title, question, series, selected, onSelect, xLabels, unit, xUnit = 'LAP', format, description }: LineChartProps) {
  const id = useId();
  const values = series.flatMap(line => line.values);
  const range = Math.max(...values) - Math.min(...values);
  const low = Math.min(...values) - Math.max(range * .13, .25);
  const high = Math.max(...values) + Math.max(range * .13, .25);
  const width = 640, height = 226, left = 54, right = 20, top = 19, bottom = 36;
  const count = series[0]?.values.length ?? 1;
  const x = (i: number) => left + i / Math.max(1, count - 1) * (width - left - right);
  const y = (value: number) => top + (high - value) / (high - low) * (height - top - bottom);
  const index = Math.min(count - 1, Math.max(0, selected));
  const choose = (event: PointerEvent<SVGSVGElement>) => {
    const bounds = event.currentTarget.getBoundingClientRect();
    const relativeX = (event.clientX - bounds.left) / bounds.width * width;
    onSelect(Math.min(count - 1, Math.max(0, Math.round((relativeX - left) / (width - left - right) * (count - 1)))));
  };
  const key = (event: KeyboardEvent<SVGSVGElement>) => {
    if (['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) {
      event.preventDefault();
      onSelect(event.key === 'Home' ? 0 : event.key === 'End' ? count - 1 : Math.min(count - 1, Math.max(0, index + (event.key === 'ArrowLeft' ? -1 : 1))));
    }
  };
  const label = format ?? ((value: number) => value.toFixed(1));
  return <article className="telemetry-chart"><div className="chart-heading"><div><p className="eyebrow">{title}</p><h2>{question}</h2></div><span className="chart-unit mono">{unit}</span></div>
    <svg viewBox={`0 0 ${width} ${height}`} className="line-chart" role="img" aria-labelledby={`${id}-title ${id}-desc`} tabIndex={0} onPointerMove={choose} onClick={choose} onKeyDown={key}>
      <title id={`${id}-title`}>{title}. {xUnit} {xLabels[index]} selected.</title><desc id={`${id}-desc`}>{description} Use left and right arrow keys to inspect, or use the lap slider above. {series.map(line => `${line.name}: ${label(line.values[index])} ${unit}`).join('. ')}.</desc>
      {[0, 1, 2, 3].map(tick => { const value = low + (high - low) / 3 * tick; return <g key={tick}><line x1={left} x2={width - right} y1={y(value)} y2={y(value)} className="chart-gridline" /><text x={left - 10} y={y(value) + 4} textAnchor="end" className="chart-axis">{label(value)}</text></g>; })}
      {[0, Math.round((count - 1) / 4), Math.round((count - 1) / 2), Math.round((count - 1) * .75), count - 1].filter((value, pos, all) => all.indexOf(value) === pos).map(tick => <text key={tick} x={x(tick)} y={height - 12} textAnchor="middle" className="chart-axis">{xLabels[tick]}</text>)}
      <text x={width - right} y={height - 1} textAnchor="end" className="chart-axis chart-x-unit">{xUnit}</text>
      {low < 0 && high > 0 && <line x1={left} x2={width - right} y1={y(0)} y2={y(0)} stroke="#9199a5" strokeDasharray="3 5" opacity=".5" />}
      {series.map(line => <path key={line.name} d={line.values.map((value, n) => `${n === 0 ? 'M' : 'L'}${x(n).toFixed(2)},${y(value).toFixed(2)}`).join(' ')} fill="none" stroke={line.color} strokeWidth="2.3" strokeDasharray={line.dashed ? '5 5' : undefined} vectorEffect="non-scaling-stroke" />)}
      <line x1={x(index)} x2={x(index)} y1={top} y2={height - bottom} className="chart-selection" />
      {series.map(line => <circle key={line.name} cx={x(index)} cy={y(line.values[index])} r="4" fill="#090b0f" stroke={line.color} strokeWidth="2" />)}
    </svg>
    <div className="chart-readout">{series.map(line => <span key={line.name}><i style={{ background: line.color }} aria-hidden="true" />{line.name}<strong className="mono">{label(line.values[index])}<small> {unit}</small></strong></span>)}</div>
    <p className="chart-description muted">{description}</p>
  </article>;
}

export function TelemetryView({ lap, setLap, driverId, analyst, safetyCar }: LabProps) {
  const driver = DRIVERS.find(item => item.id === driverId) ?? DRIVERS[0];
  const [rivalId, setRivalId] = useState(DRIVERS.find(item => item.id !== driver.id)!.id);
  const rival = DRIVERS.find(item => item.id === rivalId && item.id !== driver.id) ?? DRIVERS.find(item => item.id !== driver.id)!;
  const [speedSample, setSpeedSample] = useState(7);
  const result = useMemo(() => simulateStrategy(driver.strategy, driver, safetyCar), [driver, safetyCar]);
  const comparison = useMemo(() => simulateStrategy(rival.strategy, rival, safetyCar), [rival, safetyCar]);
  const data = result.laps[clampLap(lap) - 1];
  const rivalData = comparison.laps[clampLap(lap) - 1];
  const stintStart = lap - data.tyreAge;
  const stintEnd = driver.strategy.pitLaps.find(pitLap => pitLap >= lap) ?? TOTAL_LAPS;
  const stintLaps = result.laps.slice(stintStart, stintEnd);
  const trackProfile = [265, 303, 321, 271, 158, 112, 167, 228, 284, 296, 213, 126, 95, 151, 238, 291, 238, 164, 207, 252, 265];
  const speed = (pace: number) => trackProfile.map(value => Math.min(340, value * driver.basePace / pace));
  const gap = result.laps.map((value, index) => value.elapsed - comparison.laps[index].elapsed);
  const selectedGap = data.elapsed - rivalData.elapsed;
  const freshLap = result.laps[stintStart];
  const paceChange = data.pace - freshLap.pace;
  return <section className="telemetry-view lab-view">
    <ViewHeading eyebrow="03 / TELEMETRY STUDIO" title="See the data. Feel the difference." description="Four perspectives on one race. Every chart follows your selected lap."><label className="rival-picker">Compare with<select value={rival.id} onChange={event => setRivalId(event.target.value)}>{DRIVERS.filter(item => item.id !== driver.id).map(item => <option value={item.id} key={item.id}>{item.name}</option>)}</select></label></ViewHeading>
    <div className="telemetry-controller"><div><span className="eyebrow">LINKED INSPECTION</span><strong className="mono">LAP {String(lap).padStart(2, '0')}<small> / 46</small></strong></div><label className="telemetry-lap-slider"><span className="sr-only">Selected telemetry lap</span><input type="range" min="1" max={TOTAL_LAPS} value={lap} onChange={event => setLap(Number(event.target.value))} /><span className="mono">01 <span>← Drag to inspect the whole race →</span> 46</span></label><div className="telemetry-current"><CompoundLabel compound={data.compound} /><span className="muted">{data.tyreAge} laps old · {data.tyreLife.toFixed(0)}% life</span></div><div className="telemetry-lap-time mono">{formatTime(data.lapTime)}<span>MODELED LAP TIME</span></div></div>
    <div className="telemetry-grid">
      <LineChart title="01 / LAP TIME" question="Where does the race change?" series={[{ name: driver.short, color: '#d7ff43', values: result.laps.map(item => item.lapTime) }, { name: rival.short, color: '#64d9e8', values: comparison.laps.map(item => item.lapTime), dashed: true }]} selected={lap - 1} onSelect={index => setLap(index + 1)} xLabels={result.laps.map(item => item.lap)} unit="s" description="Spikes include the full pit-lane loss. Compare a stop with the faster laps that follow it." />
      <LineChart title="02 / STINT PERFORMANCE" question="How is this set holding up?" series={[{ name: `${COMPOUNDS[data.compound].name} · current stint`, color: COMPOUNDS[data.compound].color, values: stintLaps.map(item => item.pace) }]} selected={data.tyreAge - 1} onSelect={index => setLap(stintStart + index + 1)} xLabels={stintLaps.map(item => item.tyreAge)} unit="s" xUnit="TYRE AGE / LAPS" description="Modeled running pace in this stint, excluding pit-lane loss. Fuel, traffic and safety-car effects can also change pace." />
      <LineChart title="03 / RELATIVE GAP" question="Who is gaining on whom?" series={[{ name: `${driver.short} to ${rival.short}`, color: '#64d9e8', values: gap }]} selected={lap - 1} onSelect={index => setLap(index + 1)} xLabels={result.laps.map(item => item.lap)} unit="s" format={value => `${value >= 0 ? '+' : ''}${value.toFixed(1)}`} description={`Positive means ${driver.short} is behind ${rival.short}; negative means ahead. Pit stops temporarily change the gap.`} />
      <LineChart title={`04 / REPRESENTATIVE SPEED · LAP ${lap}`} question="Where does the car slow down?" series={[{ name: driver.short, color: '#d7ff43', values: speed(data.pace) }, { name: rival.short, color: '#64d9e8', values: speed(rivalData.pace), dashed: true }]} selected={speedSample} onSelect={setSpeedSample} xLabels={trackProfile.map((_, index) => index * 5)} unit="km/h" xUnit="TRACK DISTANCE / %" format={value => value.toFixed(0)} description="Illustrative speed samples, not measured telemetry. A fixed corner profile is scaled by each driver's modeled running pace." />
    </div>
    <div className="telemetry-interpretation"><span className="insight-symbol" aria-hidden="true">⌁</span><div><p className="eyebrow">WHAT YOU'RE SEEING / LAP {lap}</p><h2>{data.pit ? 'A stop costs time now. Fresh tyres change what comes next.' : `At this point, ${driver.short} is ${Math.abs(selectedGap).toFixed(2)}s ${selectedGap > 0 ? 'behind' : 'ahead of'} ${rival.short}.`}</h2><p className="muted">{data.pit ? `This lap includes ${data.pitLoss.toFixed(2)}s of pit-lane loss. Inspect the next lap to see the new compound begin its stint.` : `This ${COMPOUNDS[data.compound].name.toLowerCase()} set has completed ${data.tyreAge} laps. Running pace is ${Math.abs(paceChange).toFixed(2)}s ${paceChange >= 0 ? 'slower' : 'quicker'} than its first lap, with tyre wear, fuel and traffic all included.`}{analyst && ` Baseline: ${driver.basePace.toFixed(2)}s. Current running pace: ${data.pace.toFixed(3)}s. Accumulated time: ${formatTime(data.elapsed)}.`}</p></div></div>
  </section>;
}

const lessons = [
  { number: '01', title: 'The undercut', time: '45 SEC', description: 'Fresh tyres. An earlier move.' },
  { number: '02', title: 'Tyre degradation', time: '30 SEC', description: 'Why fast tyres do not stay fast.' },
  { number: '03', title: 'The pit window', time: '30 SEC', description: 'Timing is a moving target.' },
  { number: '04', title: 'The safety car', time: '30 SEC', description: 'A slower race changes the cost.' },
  { number: '05', title: 'Reading telemetry', time: '30 SEC', description: 'Turn a line into an explanation.' },
  { number: '06', title: 'Staying out', time: '30 SEC', description: 'Sometimes patience is the move.' },
];
const glossary = [
  ['Undercut', 'Stopping before a rival to use fresh-tyre pace while they remain on older tyres. It only works if the time gained is enough.'],
  ['Degradation', 'The loss of tyre performance as a set ages. In this model, each compound has a defined age-related pace penalty.'],
  ['Pit loss', 'The total time lost travelling through the pit lane and changing tyres, compared with staying on track. It is more than stationary service time.'],
  ['Dirty air', 'Disturbed air behind another car, which can reduce grip. This model uses an assumed rejoining traffic penalty; it does not calculate aerodynamics or actual following gaps.'],
  ['Out-lap', 'The first lap after a pit stop. The model includes an adjustment while the fresh set comes up to temperature.'],
  ['Stint', 'The continuous part of a race driven on one set of tyres. A stop ends one stint and starts another.'],
];
const questions = [
  { question: 'Your rival stops early. What makes an undercut work?', options: ['Fresh-tyre pace gains enough time before you stop.', 'A pit stop always makes a car faster overall.', 'The first driver to stop automatically takes the lead.'], answer: 0, explanation: 'An earlier stop creates an opportunity. The fresh-tyre gain must outweigh pit loss, the out-lap and any traffic. It is a tradeoff, not a guaranteed pass.' },
  { question: 'Why can a two-stop race be slower despite fresher tyres?', options: ['More stops always mean a slower race.', 'The additional pit loss can exceed the pace gained.', 'Fresh tyres have no effect on lap time.'], answer: 1, explanation: 'Add up the whole race. A second stop is worthwhile only when the faster running laps recover more time than that extra stop costs.' },
  { question: 'What does a positive gap to your rival mean here?', options: ['You are travelling faster right now.', 'You have better tyres.', 'Your accumulated race time is greater, so you are behind.'], answer: 2, explanation: 'A gap compares accumulated time. It tells you the current race situation; the slope of the gap chart helps show who is gaining.' },
];

export function LearnView({ lap, setLap, driverId, safetyCar, onNavigate }: LabProps) {
  const [lesson, setLesson] = useState(0);
  const [quiz, setQuiz] = useState(false);
  const [question, setQuestion] = useState(0);
  const [answers, setAnswers] = useState<(number | null)[]>([null, null, null]);
  const [finished, setFinished] = useState(false);
  const driver = DRIVERS.find(item => item.id === driverId) ?? DRIVERS[0];
  const early: Strategy = { id: 'learn-early', name: 'Early stop', compounds: ['medium', 'hard'], pitLaps: [18] };
  const late: Strategy = { ...early, id: 'learn-late', name: 'Later stop', pitLaps: [20] };
  const earlyResult = simulateStrategy(early, driver, safetyCar);
  const lateResult = simulateStrategy(late, driver, safetyCar);
  const demoLap = Math.max(17, Math.min(23, lap));
  const earlyGap = earlyResult.laps[demoLap - 1].elapsed - lateResult.laps[demoLap - 1].elapsed;
  const race = simulateStrategy(driver.strategy, driver, safetyCar);
  const data = race.laps[clampLap(lap) - 1];
  const safetyExample = { ...early, pitLaps: [23] };
  const green = simulateStrategy(safetyExample, driver, false);
  const sc = simulateStrategy(safetyExample, driver, true);
  const chooseLesson = (index: number) => { setLesson(index); setQuiz(false); };
  return <section className="learn-view lab-view">
    <ViewHeading eyebrow="05 / THE LEARNING LINE" title="From first-time fan to race strategist." description="Small lessons. Real decisions. A little more understanding with every lap."><button className="button button-ghost" onClick={() => { setQuiz(true); setFinished(false); setQuestion(0); setAnswers([null, null, null]); }}>Take the 3-question check <span aria-hidden="true">↗</span></button></ViewHeading>
    <div className="learn-layout"><aside className="lesson-nav" aria-label="Racing lessons"><p className="eyebrow">NEW TO RACING? START HERE.</p>{lessons.map((item, index) => <button key={item.number} onClick={() => chooseLesson(index)} className={lesson === index && !quiz ? 'is-active' : ''} aria-pressed={lesson === index && !quiz}><span className="mono lesson-number">{item.number}</span><span><strong>{item.title}</strong><small>{item.description}</small></span><span className="mono lesson-duration">{item.time}</span></button>)}<div className="learn-route"><span aria-hidden="true">↗</span><p>You have the theory.<br /><strong>Now make the call.</strong></p><button className="button button-primary" onClick={() => onNavigate('pitwall')}>Enter the Pit Wall</button></div></aside>
      <div className="lesson-stage">
        {quiz ? <div className="knowledge-check"><p className="eyebrow">PUT YOUR INTUITION TO WORK</p>{finished ? <><div className="quiz-complete-icon" aria-hidden="true">✓</div><h2>{answers.filter((answer, index) => answer === questions[index].answer).length} / 3 ideas in the bag.</h2><p className="muted">Strategy is about weighing tradeoffs. Keep experimenting: identical inputs give identical results, so you can change one decision and see its effect.</p><button className="button button-primary" onClick={() => onNavigate('pitwall')}>Try it at the Pit Wall ↗</button><button className="button button-ghost" onClick={() => { setAnswers([null, null, null]); setQuestion(0); setFinished(false); }}>Try the questions again</button></> : <><p className="quiz-progress mono">QUESTION {question + 1} / 3</p><h2>{questions[question].question}</h2><div className="quiz-options">{questions[question].options.map((option, index) => <button key={option} className={answers[question] === index ? 'is-selected' : ''} aria-pressed={answers[question] === index} onClick={() => setAnswers(current => current.map((answer, n) => n === question ? index : answer))}><span className="mono">{String.fromCharCode(65 + index)}</span>{option}</button>)}</div>{answers[question] !== null && <div className="quiz-feedback" role="status"><strong>{answers[question] === questions[question].answer ? 'You have the idea.' : 'Here is the useful distinction.'}</strong><p>{questions[question].explanation}</p><button className="button button-primary" onClick={() => question === 2 ? setFinished(true) : setQuestion(question + 1)}>{question === 2 ? 'See your takeaway' : 'Next question'} →</button></div>}</>}</div> : <>
          <div className="lesson-topline"><span className="eyebrow">LESSON {lessons[lesson].number} / {lessons[lesson].time}</span><span className="tag">INTERACTIVE EXPLAINER</span></div>
          {lesson === 0 && <><h2>Sometimes, the fastest way<br />past is through the pits.</h2><p className="lesson-intro">Stop before a rival. Use your fresh tyres while they are still on worn rubber. That is the <strong>undercut</strong>.</p><div className="undercut-demo"><div className="undercut-top"><span className="eyebrow">SAME DRIVER. TWO DECISIONS.</span><strong className="mono">LAP {demoLap}</strong></div>{[{ label: 'STOP EARLY', result: earlyResult, strategy: early }, { label: 'STAY OUT', result: lateResult, strategy: late }].map((item, index) => <div className="undercut-lane" key={item.label}><span className="mono">{item.label}</span><div><div className="undercut-track" /><span className="undercut-pit" style={{ left: `${(item.strategy.pitLaps[0] - 16) / 8 * 100}%` }}>PIT L{item.strategy.pitLaps[0]}</span><span className="undercut-car" style={{ left: `${Math.min(96, Math.max(4, (demoLap - 16) / 8 * 100 - (index === 0 ? earlyGap : 0) * .9))}%`, background: index === 0 ? '#d7ff43' : '#64d9e8' }} /><small>{COMPOUNDS[item.result.laps[demoLap - 1].compound].name} · {item.result.laps[demoLap - 1].tyreAge} laps old</small></div><strong className="mono">{formatTime(item.result.laps[demoLap - 1].elapsed)}</strong></div>)}<label className="undercut-slider">Move through the decision<input type="range" min="17" max="23" value={demoLap} onChange={event => setLap(Number(event.target.value))} /><span className="mono">L17 <span>BEFORE → PIT CYCLE → AFTER</span> L23</span></label><div className="undercut-outcome" aria-live="polite"><strong>{Math.abs(earlyGap).toFixed(2)}s {earlyGap > 0 ? 'behind' : 'ahead'}</strong><span>for the earlier stop at lap {demoLap}. {demoLap < 21 ? 'Keep moving until both drivers have stopped for a fair comparison.' : 'Both stops are complete. This is the modeled effect of changing the stop timing.'}</span></div></div><p className="lesson-takeaway"><span>THE TAKEAWAY</span>An early stop creates an opportunity. The fresh-tyre gain still has to cover the pit loss and the out-lap.</p></>}
          {lesson === 1 && <><h2>Grip is a resource.<br />Spend it carefully.</h2><p className="lesson-intro">Soft tyres start quickly, but lose performance faster. Hard tyres give up initial speed for a longer working life.</p><div className="compound-lessons">{compoundNames.map(compound => <div key={compound} style={compoundStyle(compound)}><span className="compound-big">{COMPOUNDS[compound].letter}</span><h3>{COMPOUNDS[compound].name}</h3><p>{compound === 'soft' ? 'More early pace. Higher wear.' : compound === 'medium' ? 'A balance of pace and endurance.' : 'Less early pace. Lower wear.'}</p><span className="mono">{COMPOUNDS[compound].life} lap reference life</span></div>)}</div><div className="learn-live-callout"><p className="eyebrow">YOUR SELECTED RACE LAP / {lap}</p><h3>{driver.short}'s {COMPOUNDS[data.compound].name.toLowerCase()} set is {data.tyreAge} laps old.</h3><div className="tyre-life-rail"><span style={{ width: `${data.tyreLife}%`, background: COMPOUNDS[data.compound].color }} /></div><p>{data.tyreLife.toFixed(0)}% estimated life remains. This is a model indicator, not a measured tyre condition.</p></div><button className="button button-ghost" onClick={() => onNavigate('telemetry')}>See the pace change in Telemetry ↗</button></>}
          {lesson === 2 && <><h2>A good stop has<br />a window of opportunity.</h2><p className="lesson-intro">The pit window is the range of laps where a stop could make sense. It changes with your tyre age, remaining distance, traffic and rivals.</p><div className="window-visual"><span>OLD SET</span><div><i /><strong>PIT WINDOW</strong><i /></div><span>FRESH SET</span></div><div className="lesson-facts"><div><strong className="mono">{TOTAL_LAPS - lap}</strong><span>laps remain at your selected lap</span></div><div><strong className="mono">{data.tyreAge}</strong><span>laps on the current set</span></div><div><strong className="mono">{race.pitLoss.toFixed(1)}s</strong><span>total pit loss in this strategy</span></div></div><p className="lesson-takeaway"><span>TRY IT</span>Move a pit stop in Strategy Compare. An earlier stop shortens the first stint but asks the next set to last longer.</p><button className="button button-primary" onClick={() => onNavigate('strategy')}>Explore the pit window ↗</button></>}
          {lesson === 3 && <><h2>When the race slows,<br />the tradeoff changes.</h2><p className="lesson-intro">The predefined safety car slows laps 22–24. A stop loses less time relative to that slower field.</p><div className="safety-comparison"><div><span className="eyebrow">GREEN-FLAG STOP</span><strong className="mono">{green.pitLoss.toFixed(2)}<small>s</small></strong><p>Total pit-lane loss · stop on lap 23</p></div><span aria-hidden="true">→</span><div><span className="eyebrow">SAFETY-CAR SCENARIO</span><strong className="mono lime-text">{sc.pitLoss.toFixed(2)}<small>s</small></strong><p>Total pit-lane loss · same stop</p></div></div><p className="lesson-takeaway"><span>THE TRADEOFF</span>The stop saves {(green.pitLoss - sc.pitLoss).toFixed(2)}s in pit-lane loss under these assumptions. That does not guarantee a better finish: timing and the remaining stint still matter.</p><button className="button button-primary" onClick={() => onNavigate('pitwall')}>Test the safety-car switch ↗</button></>}
          {lesson === 4 && <><h2>Every line should<br />answer a question.</h2><p className="lesson-intro">Read the axes first. Then the trend. Finally, ask what happened on track to explain the change.</p><div className="telemetry-lesson-lines">{[['01', 'Lap time', 'Where did the race change? A spike often marks a stop.'], ['02', 'Stint pace', 'How is this set holding up as its age increases?'], ['03', 'Relative gap', 'Who is gaining? An upward line means our driver is losing time.'], ['04', 'Speed profile', 'Where do cars brake and accelerate? These are illustrative samples.']].map(([n, title, text]) => <div key={n}><span className="mono">{n}</span><div><h3>{title}</h3><p>{text}</p></div><span aria-hidden="true">↗</span></div>)}</div><button className="button button-primary" onClick={() => onNavigate('telemetry')}>Inspect a lap ↗</button></>}
          {lesson === 5 && <><h2>A fresh set is only useful<br />if it repays the stop.</h2><p className="lesson-intro">Staying out protects track position and reduces the distance your next set must cover. The cost is spending more time on older tyres now.</p><div className="stay-out-comparison"><p className="eyebrow">SAME DRIVER / MEDIUM → HARD / {safetyCar ? 'SAFETY CAR ON' : 'GREEN FLAG'}</p><div><span>Pit lap 18</span><strong className="mono">{formatTime(earlyResult.totalTime)}</strong></div><div><span>Pit lap 20</span><strong className="mono">{formatTime(lateResult.totalTime)}</strong></div><p className="mono lime-text">{Math.abs(earlyResult.totalTime - lateResult.totalTime).toFixed(2)}s separates these decisions.</p></div><p className="lesson-takeaway"><span>WHAT THE MODEL SAYS</span>Here, stopping on lap {earlyResult.totalTime < lateResult.totalTime ? '18' : '20'} produces the lower total. Change the compounds or enable the safety car and test whether the tradeoff changes.</p><button className="button button-primary" onClick={() => onNavigate('strategy')}>Compare your own decisions ↗</button></>}
          <div className="lesson-footer"><span className="muted">Fictional race · deterministic model · no racing experience needed</span><button className="text-link" onClick={() => lesson === 5 ? setQuiz(true) : chooseLesson(lesson + 1)}>{lesson === 5 ? 'Check your understanding' : 'Next lesson'} →</button></div>
        </>}
      </div></div>
    <section className="glossary-section"><div><p className="eyebrow">THE LANGUAGE OF RACING</p><h2>A few words.<br />A clearer picture.</h2></div><div className="glossary-list">{glossary.map(([term, definition]) => <details key={term}><summary>{term}<span aria-hidden="true">＋</span></summary><p className="muted">{definition}</p></details>)}</div></section>
  </section>;
}

export function MethodologyModal({ onClose }: { onClose: () => void }) {
  const container = useRef<HTMLDivElement>(null);
  const close = useRef<HTMLButtonElement>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  const headingId = useId();
  useEffect(() => {
    const previousFocus = document.activeElement as HTMLElement | null;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    close.current?.focus();
    const keyboard = (event: globalThis.KeyboardEvent) => {
      if (event.key === 'Escape') onCloseRef.current();
      if (event.key === 'Tab') {
        const elements = container.current?.querySelectorAll<HTMLElement>('button, a[href], input, select, textarea, [tabindex="0"]');
        if (!elements?.length) return;
        const first = elements[0], last = elements[elements.length - 1];
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
      }
    };
    document.addEventListener('keydown', keyboard);
    return () => { document.body.style.overflow = overflow; document.removeEventListener('keydown', keyboard); previousFocus?.focus(); };
  }, []);
  return <div className="methodology-backdrop" onClick={event => { if (event.target === event.currentTarget) onClose(); }}>
    <div className="methodology-modal" role="dialog" aria-modal="true" aria-labelledby={headingId} ref={container}>
      <div className="methodology-header"><p className="eyebrow">TRANSPARENT BY DESIGN</p><button className="methodology-close" ref={close} onClick={onClose} aria-label="Close simulation methodology">×</button></div>
      <h2 id={headingId}>How this<br />simulation works.</h2>
      <p className="methodology-lead">A fictional race. An explainable model. Space to experiment.</p>
      <span className="tag">DEMO SIMULATION · NOT REAL-WORLD TELEMETRY</span>
      <div className="methodology-content">
        <section>
          <h3>01 / Every lap adds up</h3>
          <p>Each driver has a baseline lap pace. The engine applies compound pace, tyre age, fuel load, traffic, an out-lap adjustment and the optional predefined safety car. Pit-lane loss is added exactly once to the pit lap.</p>
          <div className="model-formula mono">LAP TIME = BASE PACE<br />+ COMPOUND & AGE<br />+ FUEL, TRAFFIC & OUT-LAP<br />+ PIT LOSS / SAFETY CAR</div>
          <p>Race time is the sum of all 46 lap times. Identical inputs produce identical results. Fuel adds 1.8s on lap 1, falling linearly to zero by lap 46. Replacement tyres have a first-lap warm-up adjustment, and an assumed rejoining traffic cost fades over three laps.</p>
        </section>
        <section>
          <h3>02 / Tyres trade pace for endurance</h3>
          <p>Wear adds (age − 1) × the compound's degradation rate to running time. Beyond reference life, a further 0.055 × excess age² seconds is added. Tyre life is a visual estimate derived from stint age, rather than a measurement of physical tyre condition.</p>
          <table><caption>Assumed compound reference values</caption><thead><tr><th>Compound</th><th>Pace adjustment</th><th>Wear / age lap</th><th>Reference life</th></tr></thead><tbody>{compoundNames.map(compound => <tr key={compound}><th><CompoundLabel compound={compound} /></th><td className="mono">{formatDelta(COMPOUNDS[compound].pace)}</td><td className="mono">{COMPOUNDS[compound].degradation.toFixed(3)}s</td><td className="mono">{COMPOUNDS[compound].life} laps</td></tr>)}</tbody></table>
          <p>The dry-race convention requires at least two different compounds. Invalid choices remain editable and are clearly flagged.</p>
        </section>
        <section>
          <h3>03 / What a stop costs</h3>
          <p>A green-flag stop costs {PIT_LANE_LOSS.toFixed(1)}s in total, including {STATIONARY_STOP_TIME.toFixed(1)}s stationary. This is the time lost relative to continuing on track. A stop at the end of a lap changes the compound for the following lap.</p>
          <p>The optional safety car runs on laps 22–24. It slows running pace and reduces the moving portion of pit loss to 55% of its green-flag cost. The resulting total pit loss is {(STATIONARY_STOP_TIME + (PIT_LANE_LOSS - STATIONARY_STOP_TIME) * .55).toFixed(2)}s. It does not model field bunching.</p>
        </section>
        <section>
          <h3>04 / What this model leaves out</h3>
          <p>No live feeds, weather prediction, mechanical failures, driver errors, full vehicle physics or probabilistic overtaking. The speed chart uses representative samples, scaled by modeled pace, rather than measured telemetry.</p>
          <p>Finishing positions rank calculated race times. They are estimates under these assumptions, not a guarantee of real track position.</p>
        </section>
        <section>
          <h3>05 / Built to stay lightweight</h3>
          <p>The race runs locally without an account or a continuously running backend. SVG charts, original circuit graphics and reusable local data keep the experience lightweight. Motion respects your reduced-motion setting.</p>
          <p>The resource perspective counts tyre sets and stint lengths. We do not invent carbon or energy savings.</p>
        </section>
      </div>
      <button className="button button-primary" onClick={onClose}>Back to the race <span aria-hidden="true">↗</span></button>
    </div>
  </div>;
}
