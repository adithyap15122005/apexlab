import { useEffect, useId, useMemo, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import { useFrame } from '@react-three/fiber';
import { Color, Group } from 'three';
import { COMPOUNDS, DRIVERS, TOTAL_LAPS, formatDelta, formatTime, simulateStrategy } from '../../engine/race';
import type { Compound, Strategy } from '../../engine/race';
import SceneFrame from './SceneFrame';
import './Labs3D.css';

const compoundNames: Compound[] = ['soft', 'medium', 'hard'];
const AGE_LIMIT = 44;
const fuelAt = (lap: number) => 1.8 * (TOTAL_LAPS - lap) / (TOTAL_LAPS - 1);

function TyreModel({ compound, age, active, motion }: { compound: Compound; age: number; active: boolean; motion: boolean }) {
  const group = useRef<Group>(null);
  const wear = Math.min(1, (age - 1) / COMPOUNDS[compound].life);
  const rubber = useMemo(() => new Color('#111619').lerp(new Color('#3c4038'), wear * .6), [wear]);
  useFrame((_, delta) => {
    if (group.current && active && motion) group.current.rotation.z -= Math.min(delta, .05) * .12;
  });
  return <group position={[0, 1.53, 0]} rotation={[0, -.2, -.12]}>
    <group ref={group}>
      <mesh castShadow><torusGeometry args={[1.05, .4, 20, 64]} /><meshStandardMaterial color={rubber} roughness={.56 + wear * .4} metalness={.05} /></mesh>
      <mesh rotation={[Math.PI / 2, 0, 0]}><cylinderGeometry args={[.75, .75, .74, 32]} /><meshStandardMaterial color="#252e32" metalness={.75} roughness={.35} /></mesh>
      {[-1, 1].map(side => <group key={side} position={[0, 0, side * .365]}>
        <mesh><torusGeometry args={[1.07, .027, 6, 64]} /><meshStandardMaterial color={COMPOUNDS[compound].color} roughness={.65} emissive={COMPOUNDS[compound].color} emissiveIntensity={.15} /></mesh>
        <mesh><torusGeometry args={[.73, .035, 8, 40]} /><meshStandardMaterial color="#9ba7a5" metalness={.85} roughness={.3} /></mesh>
        {Array.from({ length: 10 }, (_, index) => <group key={index} rotation={[0, 0, index / 10 * Math.PI * 2]}>
          <mesh position={[.4, 0, 0]} rotation={[0, 0, -.2]}><boxGeometry args={[.59, .065, .045]} /><meshStandardMaterial color="#71817f" metalness={.8} roughness={.3} /></mesh>
          <mesh position={[1.245, 0, 0]} rotation={[0, 0, -.25]}><boxGeometry args={[.065, .027, .011]} /><meshStandardMaterial color={COMPOUNDS[compound].color} roughness={.8} transparent opacity={.35} /></mesh>
        </group>)}
        <mesh rotation={[Math.PI / 2, 0, 0]}><cylinderGeometry args={[.16, .16, .075, 12]} /><meshStandardMaterial color="#D7FF43" metalness={.8} roughness={.35} /></mesh>
      </group>)}
      {[-.15, .15].map(z => <mesh key={z} position={[0, 0, z]}><torusGeometry args={[1.43, .007, 4, 64]} /><meshStandardMaterial color="#090c0d" transparent opacity={.25 + wear * .6} /></mesh>)}
      {Array.from({ length: 16 }, (_, index) => <mesh key={index} position={[Math.cos(index * Math.PI / 8) * 1.445, Math.sin(index * Math.PI / 8) * 1.445, .02]} rotation={[0, 0, index * Math.PI / 8 + .4]}><boxGeometry args={[.009, .1 + (index % 3) * .03, .1]} /><meshStandardMaterial color="#848d80" transparent opacity={wear * .23} /></mesh>)}
    </group>
    <mesh position={[0, -1.45, 0]} receiveShadow rotation={[-Math.PI / 2, 0, 0]}><circleGeometry args={[3.5, 64]} /><meshStandardMaterial color="#131b20" roughness={.85} metalness={.15} /></mesh>
    <mesh position={[0, -1.442, 0]} rotation={[-Math.PI / 2, 0, 0]}><ringGeometry args={[2.4, 2.415, 64]} /><meshStandardMaterial color="#D7FF43" emissive="#D7FF43" emissiveIntensity={.5} transparent opacity={.5} /></mesh>
  </group>;
}

function TyreSchematic({ compound, age }: { compound: Compound; age: number }) {
  return <div className="tyre-schematic" style={{ '--tyre-ink': COMPOUNDS[compound].color, '--tyre-wear': Math.min(.65, age / COMPOUNDS[compound].life * .45) } as CSSProperties}>
    <div className="tyre-schematic-ring"><span className="tyre-schematic-text mono">APEX / {COMPOUNDS[compound].letter}</span><div className="tyre-schematic-rim"><i /><i /><i /><i /><i /><b /></div></div>
    <span className="mono">{COMPOUNDS[compound].name.toUpperCase()} / {age} LAP{age === 1 ? '' : 'S'} OLD</span>
  </div>;
}

export default function TyreLab({ lap, driverId, safetyCar }: { lap: number; driverId: string; safetyCar: boolean }) {
  const driver = DRIVERS.find(item => item.id === driverId) ?? DRIVERS[0];
  const replayLap = Math.max(1, Math.min(TOTAL_LAPS, lap));
  const current = useMemo(() => simulateStrategy(driver.strategy, driver, safetyCar).laps[replayLap - 1], [driver, safetyCar, replayLap]);
  const [compound, setCompound] = useState<Compound>(current.compound);
  const [age, setAge] = useState(current.tyreAge);
  const [following, setFollowing] = useState(true);
  const id = useId();
  useEffect(() => { if (following) { setCompound(current.compound); setAge(current.tyreAge); } }, [following, current.compound, current.tyreAge]);
  const curves = useMemo(() => compoundNames.map(name => {
    const alternate: Compound = name === 'hard' ? 'medium' : 'hard';
    const strategy: Strategy = { id: `tyre-study-${name}`, name: `${COMPOUNDS[name].name} age study`, compounds: [name, alternate], pitLaps: [45] };
    // A valid two-compound engine run provides the first 44 laps of age data.
    // Remove the engine's changing fuel cost and apply the selected replay lap's
    // fuel load, isolating compound and age. The sampled stint has no out-lap or
    // rejoin-traffic penalty. SC is deliberately disabled for a green-pace study.
    const result = simulateStrategy(strategy, driver, false);
    return { compound: name, values: result.laps.slice(0, AGE_LIMIT).map(data => data.pace - fuelAt(data.lap) + fuelAt(replayLap)) };
  }), [driver, replayLap]);
  const selected = curves.find(curve => curve.compound === compound)!;
  const pace = selected.values[age - 1];
  const lost = pace - selected.values[0];
  const low = Math.floor(Math.min(...curves.flatMap(curve => curve.values)) * 2) / 2 - .3;
  const high = Math.ceil(Math.max(...curves.flatMap(curve => curve.values)) * 2) / 2 + .3;
  const x = (index: number) => 47 + index / (AGE_LIMIT - 1) * 453;
  const y = (value: number) => 174 - (value - low) / (high - low) * 148;
  const chooseCompound = (name: Compound) => { setFollowing(false); setCompound(name); };
  const chooseAge = (value: number) => { setFollowing(false); setAge(value); };
  const remaining = Math.max(0, (1 - age / COMPOUNDS[compound].life) * 100);
  return <section className="tyre3d-lab" aria-labelledby={`${id}-title`}>
    <div className="lab3d-heading"><div><p className="eyebrow">TYRE LAB / MATERIAL TO MARGIN</p><h2 id={`${id}-title`}>Find the crossover.</h2><p className="muted">Inspect the rubber. Understand the trade.</p></div><button className={`tyre-sync mono ${following ? 'is-following' : ''}`} aria-pressed={following} onClick={() => setFollowing(value => !value)}><i />{following ? `Following replay · L${replayLap}` : 'Sync to replay'}</button></div>
    <div className="tyre3d-grid"><div className="tyre3d-viewer">
      <SceneFrame label={`${COMPOUNDS[compound].name} tyre, ${age} laps old. Drag to inspect.`} className="tyre-lab-scene" camera={[3.6, 3.1, 5]} target={[0, 1.35, 0]} fallback={<TyreSchematic compound={compound} age={age} />}>
        {({ active, motion }) => <TyreModel compound={compound} age={age} active={active} motion={motion} />}
      </SceneFrame>
      <div className="tyre3d-badge" style={{ '--tyre-ink': COMPOUNDS[compound].color } as CSSProperties}><span>{COMPOUNDS[compound].letter}</span><div><b>{COMPOUNDS[compound].name} compound</b><small>ILLUSTRATIVE WEAR / {age} LAPS</small></div></div>
    </div><div className="tyre3d-analysis">
      <div className="tyre3d-compounds" role="group" aria-label="Tyre laboratory compound">{compoundNames.map(name => <button key={name} className={name === compound ? 'is-selected' : ''} style={{ '--tyre-ink': COMPOUNDS[name].color } as CSSProperties} onClick={() => chooseCompound(name)} aria-pressed={name === compound}><i>{COMPOUNDS[name].letter}</i><span>{COMPOUNDS[name].name}</span></button>)}</div>
      <div className="tyre3d-metrics"><div><span className="eyebrow">PREDICTED RUNNING PACE</span><b className="mono">{formatTime(pace)}</b></div><div><span className="eyebrow">AGE COST / VS FRESH</span><b className="mono" style={{ color: COMPOUNDS[compound].color }}>{formatDelta(lost)}</b></div></div>
      <div className="tyre3d-graph-heading"><span className="eyebrow">COMPOUND × AGE</span><span className="mono">LAP TIME / SECONDS</span></div>
      <svg className="tyre3d-graph" viewBox="0 0 520 205" role="img" aria-labelledby={`${id}-graph-title ${id}-graph-desc`}>
        <title id={`${id}-graph-title`}>Modeled running pace by tyre age. {COMPOUNDS[compound].name} at age {age}: {pace.toFixed(3)} seconds.</title><desc id={`${id}-graph-desc`}>Three compound curves use the race engine, with {driver.name}'s baseline and fuel held at replay lap {replayLap}. Lower is faster. Use the compound buttons and tyre age slider to inspect values.</desc>
        {[0, 1, 2, 3].map(tick => { const value = low + (high - low) * tick / 3; return <g key={tick}><line x1="47" x2="500" y1={y(value)} y2={y(value)} stroke="#ffffff0b" /><text x="37" y={y(value) + 3} textAnchor="end">{value.toFixed(1)}</text></g>; })}
        {[1, 10, 20, 30, 44].map(value => <text key={value} x={x(value - 1)} y="194" textAnchor="middle">{value}</text>)}
        {curves.map(curve => <path key={curve.compound} d={curve.values.map((value, index) => `${index ? 'L' : 'M'}${x(index).toFixed(2)} ${y(value).toFixed(2)}`).join(' ')} stroke={COMPOUNDS[curve.compound].color} strokeWidth={curve.compound === compound ? 2.7 : 1.3} opacity={curve.compound === compound ? 1 : .3} fill="none" />)}
        <line x1={x(age - 1)} x2={x(age - 1)} y1="18" y2="177" stroke={COMPOUNDS[compound].color} strokeDasharray="3 4" opacity=".5" />
        <circle cx={x(age - 1)} cy={y(pace)} r="5" stroke={COMPOUNDS[compound].color} strokeWidth="2" fill="#0e1419" />
      </svg>
      <label className="tyre3d-age" htmlFor={`${id}-age`}><span>Tyre age <output className="mono">{age} lap{age === 1 ? '' : 's'}</output></span><input id={`${id}-age`} aria-label="Tyre laboratory age" type="range" min="1" max={AGE_LIMIT} value={age} onChange={event => chooseAge(Number(event.target.value))} /><span className="tyre3d-age-limits mono"><span>FRESH / 1</span><span>44 / EXTENDED STINT</span></span></label>
      <p className="tyre3d-explanation muted">{compound === 'soft' ? 'Soft starts fastest and loses pace most quickly. An early advantage can disappear as the stint grows.' : compound === 'medium' ? 'Medium balances initial pace against wear. Its crossover with softer rubber depends on stint age.' : 'Hard trades initial pace for slower degradation. A long stint can recover the time given away early.'} Nominal life: {COMPOUNDS[compound].life} laps; {remaining.toFixed(0)}% modeled life remains at this age.</p>
    </div></div>
    <div className="tyre3d-footnote"><span className="mono">ENGINE CONNECTED</span><p>{driver.name} · fuel fixed at lap {replayLap} · green-flag running pace · no pit loss, warm-up or rejoin traffic. {safetyCar ? 'The replay safety car is excluded to isolate tyre performance. ' : ''}Rubber tint and surface marks illustrate wear; they are not a physically precise wear or grip simulation.</p></div>
  </section>;
}
