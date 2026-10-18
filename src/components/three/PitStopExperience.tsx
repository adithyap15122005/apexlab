import { useCallback, useEffect, useRef, useState } from 'react';
import type { CSSProperties, MutableRefObject } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { Vector3, type Group } from 'three';
import { COMPOUNDS, STATIONARY_STOP_TIME } from '../../engine/race';
import type { Compound } from '../../engine/race';
import RaceCar from './RaceCar';
import SceneFrame from './SceneFrame';
import './Labs3D.css';

type Phase = 'ready' | 'approach' | 'stop' | 'exit' | 'complete';
type PitStopProps = {
  compound: Compound;
  initialCompound: Compound;
  runId: number;
  pitLoss: number;
  stationaryTime?: number;
  motionEnabled?: boolean;
};

const APPROACH = 1.2;
const STOP_END = APPROACH + STATIONARY_STOP_TIME;
const END = STOP_END + 1.5;
const phaseAt = (time: number): Phase => time < APPROACH ? 'approach' : time < STOP_END ? 'stop' : time < END ? 'exit' : 'complete';
const phaseLabels: Record<Phase, string> = {
  ready: 'Pit box ready', approach: 'Approaching the box', stop: 'Changing the tyres', exit: 'Released. Rejoining.', complete: 'Back in the race',
};

function Box({ position, size, color, emissive = false }: { position: [number, number, number]; size: [number, number, number]; color: string; emissive?: boolean }) {
  return <mesh position={position} receiveShadow castShadow><boxGeometry args={size} /><meshStandardMaterial color={color} metalness={.35} roughness={.65} emissive={emissive ? color : '#000000'} emissiveIntensity={emissive ? .55 : 0} /></mesh>;
}

function Crew({ side, front, working }: { side: number; front: boolean; working: boolean }) {
  return <group position={[front ? 1.65 : -1.45, 0, side * (working ? 1.35 : 2.05)]} rotation={[0, side > 0 ? Math.PI : 0, 0]}>
    <mesh position={[0, .82, 0]} castShadow><capsuleGeometry args={[.16, .43, 3, 6]} /><meshStandardMaterial color="#303834" roughness={.9} /></mesh>
    <mesh position={[0, 1.3, 0]} castShadow><sphereGeometry args={[.2, 12, 10]} /><meshStandardMaterial color="#D7FF43" metalness={.35} roughness={.4} /></mesh>
    <Box position={[0, 1.31, .16]} size={[.27, .09, .08]} color="#090f12" />
    {[-.11, .11].map(x => <Box key={x} position={[x, .29, 0]} size={[.12, .51, .14]} color="#161e20" />)}
    <group rotation={[working ? -.8 : -.25, 0, 0]} position={[.2, .95, 0]}>
      <Box position={[0, -.19, 0]} size={[.13, .4, .13]} color="#303834" />
      <Box position={[0, -.4, .03]} size={[.18, .12, .2]} color="#a9b1ab" />
    </group>
  </group>;
}

function SpareTyre({ position, compound }: { position: [number, number, number]; compound: Compound }) {
  return <group position={position} rotation={[Math.PI / 2, 0, 0]}>
    <mesh><torusGeometry args={[.31, .14, 8, 20]} /><meshStandardMaterial color="#101315" roughness={.95} /></mesh>
    <mesh position={[0, 0, .125]}><torusGeometry args={[.32, .017, 4, 20]} /><meshStandardMaterial color={COMPOUNDS[compound].color} /></mesh>
  </group>;
}

function PitScene({ active, motion, running, elapsed, animationKey, initialCompound, compound, complete }: {
  active: boolean; motion: boolean; running: boolean; elapsed: MutableRefObject<number>; animationKey: string;
  initialCompound: Compound; compound: Compound; complete: () => void;
}) {
  const car = useRef<Group>(null);
  const oldCar = useRef<Group>(null);
  const newCar = useRef<Group>(null);
  const crews = useRef<Group>(null);
  const frameTime = useRef(0);
  const camera = useThree(state => state.camera);
  const cameraStart = useRef(new Vector3(8, 6, 9));
  const cameraClose = useRef(new Vector3(6.1, 4.3, 7.1));
  useEffect(() => { frameTime.current = 0; if (running) cameraStart.current.copy(camera.position); }, [animationKey, running, camera]);
  useEffect(() => { if (running && !motion) complete(); }, [motion, running, complete]);
  useFrame((_, delta) => {
    if (!car.current) return;
    if (active && motion && running) {
      frameTime.current += Math.min(delta, .05);
      if (frameTime.current < 1 / 30) return;
      elapsed.current = Math.min(END, elapsed.current + frameTime.current);
      frameTime.current = 0;
      if (elapsed.current >= END) complete();
    }
    const t = elapsed.current;
    let x = t >= END ? 9 : 0;
    if (running && t < APPROACH) { const progress = t / APPROACH; x = -8 * (1 - progress) ** 3; }
    else if (running && t >= STOP_END) x = 8 * ((t - STOP_END) / (END - STOP_END)) ** 2;
    car.current.position.x = x;
    car.current.position.y = t >= APPROACH && t < STOP_END && running ? .08 : 0;
    if (running && active && motion) {
      const closeness = t < APPROACH ? Math.min(1, t / APPROACH) : t < STOP_END ? 1 : Math.max(0, 1 - (t - STOP_END) / (END - STOP_END));
      const eased = closeness * closeness * (3 - 2 * closeness);
      camera.position.lerpVectors(cameraStart.current, cameraClose.current, eased);
      camera.lookAt(0, .3, 0);
    }
    if (oldCar.current) oldCar.current.visible = t < APPROACH + 1.2;
    if (newCar.current) newCar.current.visible = t >= APPROACH + 1.2;
    if (crews.current) crews.current.scale.z = running && t >= APPROACH && t < STOP_END ? .75 : 1;
  });
  return <group>
    <Box position={[0, -.17, 0]} size={[22, .3, 9]} color="#171e22" />
    <Box position={[0, -.005, -3.7]} size={[22, .035, .055]} color="#D7FF43" emissive />
    <Box position={[0, .005, 3.25]} size={[22, .03, .08]} color="#c2c8c0" />
    <Box position={[0, .035, -1.55]} size={[6.4, .025, .05]} color="#D7FF43" emissive />
    <Box position={[0, .035, 1.55]} size={[6.4, .025, .05]} color="#D7FF43" emissive />
    {[-3.2, 3.2].map(x => <Box key={x} position={[x, .035, 0]} size={[.05, .025, 3.15]} color="#D7FF43" emissive />)}
    {[-9, -7, -5, 5, 7, 9].map(x => <Box key={x} position={[x, .013, 2.5]} size={[.7, .025, .045]} color="#707b7c" />)}
    <Box position={[0, .2, -4.1]} size={[21, .45, .7]} color="#293234" />
    <Box position={[0, .44, -4.1]} size={[21, .06, .72]} color="#D7FF43" />
    <Box position={[-4.3, 1.8, -2.8]} size={[.17, 3.65, .17]} color="#515d60" />
    <Box position={[-4.3, 3.55, -.7]} size={[.18, .18, 4.3]} color="#515d60" />
    <Box position={[-4.3, 3.47, 1.34]} size={[.25, .42, .16]} color="#141b1c" />
    <mesh position={[-4.3, 3.46, 1.45]} rotation={[0, 0, Math.PI / 2]}><sphereGeometry args={[.075, 8, 6]} /><meshStandardMaterial color={running ? '#ff6559' : '#D7FF43'} emissive={running ? '#ff6559' : '#D7FF43'} emissiveIntensity={2} /></mesh>
    <Box position={[4.5, .5, -2.7]} size={[1.7, 1, .7]} color="#252f32" />
    <Box position={[4.5, 1.02, -2.7]} size={[1.8, .08, .8]} color="#84918b" />
    {[3.8, 4.6, 5.4].map((x, index) => <SpareTyre key={x} position={[x, .2, -1.8]} compound={index === 0 ? initialCompound : compound} />)}
    <group ref={crews}>{[-1, 1].flatMap(side => [false, true].map(front => <Crew key={`${side}-${front}`} side={side} front={front} working={false} />))}</group>
    <group ref={car}>
      <group ref={oldCar} visible={elapsed.current < APPROACH + 1.2}><RaceCar compound={initialCompound} /></group>
      <group ref={newCar} visible={elapsed.current >= APPROACH + 1.2}><RaceCar compound={compound} /></group>
    </group>
  </group>;
}

function PitSchematic({ compound, phase }: { compound: Compound; phase: Phase }) {
  return <div className="pit-schematic" style={{ '--pit-compound': COMPOUNDS[compound].color } as CSSProperties}>
    <svg viewBox="0 0 760 280" role="img" aria-label={`Overhead pit box schematic. ${phaseLabels[phase]}. ${COMPOUNDS[compound].name} tyres selected.`}>
      <defs><pattern id="pit-grid" width="38" height="38" patternUnits="userSpaceOnUse"><path d="M 38 0 L 0 0 0 38" fill="none" stroke="#fff" opacity=".035" /></pattern></defs>
      <rect width="760" height="280" fill="url(#pit-grid)" />
      <path d="M25 45H735M25 235H735" stroke="#8b989c" strokeWidth="2" strokeDasharray="20 16" />
      <rect x="228" y="75" width="304" height="131" fill="#d7ff4304" stroke="#d7ff43" strokeWidth="1.5" />
      <g transform="translate(380 140)">
        <path d="M-95-17H15L85-10L108 0L85 10L15 17H-95Z" fill="#333e43" stroke="#a4b3a4" />
        <path d="M-73-38V38M68-36V36" stroke="#d7ff43" strokeWidth="9" />
        <path d="M-80-35H-46M-80 35H-46M41-35H71M41 35H71" stroke="var(--pit-compound)" strokeWidth="18" />
        <ellipse rx="23" ry="13" cx="-4" fill="#0b1114" stroke="#d7ff43" />
        <path d="M-32 0H-79" stroke="#d7ff43" strokeWidth="4" />
      </g>
      {[260, 500].flatMap(x => [54, 225].map(y => <g key={`${x}-${y}`}><circle cx={x} cy={y} r="9" fill="#d7ff43" /><circle cx={x} cy={y} r="18" stroke="#d7ff4322" fill="none" /></g>))}
      <text x="32" y="32" fill="#819198" fontSize="10" fontFamily="monospace">APEX / SERVICE ZONE</text><text x="580" y="267" fill="#819198" fontSize="10" fontFamily="monospace">DIRECTION →</text>
    </svg>
    <span className="pit-schematic-note mono">OVERHEAD / ANALYTICAL VIEW</span>
  </div>;
}

export default function PitStopExperience({ compound, initialCompound, runId, pitLoss, stationaryTime = STATIONARY_STOP_TIME, motionEnabled = true }: PitStopProps) {
  const elapsed = useRef(0);
  const [replayId, setReplayId] = useState(0);
  const [running, setRunning] = useState(false);
  const [hasRun, setHasRun] = useState(runId > 0);
  const [readout, setReadout] = useState<{ phase: Phase; stationary: number }>({ phase: runId > 0 ? 'complete' : 'ready', stationary: runId > 0 ? stationaryTime : 0 });
  const presentation = useRef({ is3D: true, motion: true });
  const complete = useCallback(() => {
    elapsed.current = END;
    setRunning(false);
    setReadout({ phase: 'complete', stationary: stationaryTime });
  }, [stationaryTime]);
  const presentationChanged = useCallback((next: { is3D: boolean; motion: boolean }) => {
    presentation.current = next;
    if (!next.is3D || !next.motion) {
      if (hasRun) complete();
      else { elapsed.current = 0; setRunning(false); setReadout({ phase: 'ready', stationary: 0 }); }
    }
  }, [hasRun, complete]);
  useEffect(() => {
    if (runId < 1) { setHasRun(false); setRunning(false); setReadout({ phase: 'ready', stationary: 0 }); elapsed.current = 0; return; }
    setHasRun(true);
    if (!motionEnabled || !presentation.current.is3D || !presentation.current.motion) { complete(); return; }
    elapsed.current = 0;
    setReadout({ phase: 'approach', stationary: 0 });
    setRunning(true);
  }, [runId, replayId, motionEnabled, complete]);
  useEffect(() => {
    if (!running) { if (hasRun) setReadout({ phase: 'complete', stationary: stationaryTime }); return; }
    const timer = window.setInterval(() => {
      const nextPhase = phaseAt(elapsed.current);
      const stationary = Math.round(Math.min(stationaryTime, Math.max(0, elapsed.current - APPROACH)) * 5) / 5;
      setReadout(old => old.phase === nextPhase && old.stationary === stationary ? old : { phase: nextPhase, stationary });
    }, 200);
    return () => window.clearInterval(timer);
  }, [running, hasRun, stationaryTime]);
  return <section className="pit3d-lab" aria-label="Pit stop visualisation">
    <div className="lab3d-heading"><div><p className="eyebrow">THE ART OF THE STOP</p><h2>Every second has a job.</h2></div><span className={`lab3d-state mono ${running ? 'is-live' : ''}`} role="status" aria-live="polite"><i />{phaseLabels[readout.phase]}</span></div>
    <SceneFrame interactive={!running} motionControl={false} label="Interactive pit stop scene" className="pit-stop-experience" camera={[8, 6, 9]} target={[0, .3, 0]} animated={running} onPresentationChange={presentationChanged} fallback={<PitSchematic compound={hasRun ? compound : initialCompound} phase={readout.phase} />}>
      {({ active, motion, resetKey }) => <PitScene active={active} motion={motion} running={running} elapsed={elapsed} animationKey={`${runId}-${replayId}-${resetKey}`} compound={compound} initialCompound={initialCompound} complete={complete} />}
    </SceneFrame>
    <div className="pit3d-caption"><div><span className="eyebrow">STATIONARY / TYRE CHANGE</span><strong className="mono">{readout.stationary.toFixed(1)}<small> / {stationaryTime.toFixed(1)}s</small></strong></div><div><span className="eyebrow">TOTAL PIT-LANE LOSS</span><strong className="mono">{pitLoss.toFixed(3)}<small>s</small></strong></div><div className="pit3d-action">{running ? <button className="button button-ghost" onClick={complete}>Skip animation <span aria-hidden="true">↗</span></button> : <button className="button button-ghost" disabled={!hasRun} onClick={() => setReplayId(value => value + 1)}><span aria-hidden="true">↺</span> Replay pit stop</button>}</div></div>
    <div className="pit3d-progress" aria-hidden="true">{(['approach', 'stop', 'exit'] as const).map((phase, index) => <div key={phase} className={readout.phase === phase ? 'is-current' : hasRun && (readout.phase === 'complete' || index < ['approach', 'stop', 'exit'].indexOf(readout.phase)) ? 'is-done' : ''}><span>{String(index + 1).padStart(2, '0')}</span><b>{phase === 'approach' ? 'Pit entry' : phase === 'stop' ? `${stationaryTime.toFixed(1)}s stationary` : 'Release + rejoin'}</b></div>)}</div>
    <p className="pit3d-explanation muted" aria-live="polite">{!hasRun ? 'Run your strategy to see the crew in action. ' : 'Strategy results are calculated immediately. '}{stationaryTime.toFixed(1)}s is the stationary service time; {pitLoss.toFixed(3)}s is the modeled total pit-lane loss, including that service. The brief animation is illustrative and uses compressed travel time.</p>
  </section>;
}
