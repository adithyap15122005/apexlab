import { useEffect, useMemo, useRef, useState } from 'react'
import { RoundedBox } from '@react-three/drei'
import { useFrame, useThree, type ThreeEvent } from '@react-three/fiber'
import { BufferGeometry, CanvasTexture, CatmullRomCurve3, Color, Float32BufferAttribute, Group, MathUtils, SRGBColorSpace, Vector3 } from 'three'
import Circuit from '../Circuit'
import { COMPOUNDS, raceAtLap, TOTAL_LAPS, type Driver } from '../../engine/race'
import SceneFrame from './SceneFrame'
import './CircuitExplorer.css'

const SECTORS = [
  { number: 1, color: '#D7FF43', title: 'The opening move', label: 'Technical sequence', lap: 17, detail: 'Trace the slow corners into the first braking zone. Jump to Luca’s early stop on lap 17.' },
  { number: 2, color: '#64D9E8', title: 'The long game', label: 'High-speed sweep', lap: 27, detail: 'The circuit opens into a flowing right-hand sweep. Jump to Elena’s long first stint ending on lap 27.' },
  { number: 3, color: '#FF867B', title: 'Bring it home', label: 'Final sector', lap: 46, detail: 'A tight final complex returns to the pit straight. Jump to the finish to see every decision add up.' },
]

// An original fictional circuit, matched to the schematic used throughout ApexLab.
const TRACK_POINTS = [
  [-4.1, 1.375], [-4.94, 1.1], [-5.18, .6], [-5.03, -.05], [-4.33, -2.1],
  [-3.76, -2.63], [-3.22, -2.59], [-1.08, -2.25], [-.58, -2.57], [.05, -3.6],
  [.57, -3.93], [1.1, -3.8], [2.1, -3.2], [2.5, -2.8], [2.31, -2.13],
  [1.95, -1.27], [2.1, -.77], [3.6, -.02], [4.7, .55], [5.05, 1.15],
  [4.75, 1.73], [4.1, 2.72], [3.66, 3.03], [3.25, 2.86], [1.7, 2.04],
  [1.23, 2.05], [.15, 3.5], [-.4, 3.78], [-1.0, 3.47], [-2.17, 2.42],
  [-2.6, 2.02], [-3.02, 1.85],
]

const track = new CatmullRomCurve3(TRACK_POINTS.map(([x, z]) => new Vector3(x, .205, z)), true, 'catmullrom', .36)
const pitLane = new CatmullRomCurve3([
  new Vector3(-4.15, .224, 1.36), new Vector3(-3.7, .224, .98),
  new Vector3(-3.12, .224, 1.02), new Vector3(-2.55, .224, 1.48),
  new Vector3(-2.15, .224, 2.35),
])

function createRibbon(curve: CatmullRomCurve3, inner: number, outer: number, start = 0, end = 1, colored = false) {
  const positions: number[] = []
  const colors: number[] = []
  const indices: number[] = []
  const samples = Math.ceil((end - start) * 480)
  for (let i = 0; i <= samples; i += 1) {
    const progress = start + i / samples * (end - start)
    const point = curve.getPointAt(progress)
    const tangent = curve.getTangentAt(progress)
    const side = new Vector3(-tangent.z, 0, tangent.x).normalize()
    const sector = SECTORS[Math.min(2, Math.floor(progress * 3))]
    const color = new Color(i % 8 < 4 ? sector.color : '#303735')
    for (const width of [inner, outer]) {
      const vertex = point.clone().addScaledVector(side, width)
      positions.push(vertex.x, vertex.y, vertex.z)
      if (colored) colors.push(color.r, color.g, color.b)
    }
    if (i < samples) {
      const base = i * 2
      indices.push(base, base + 1, base + 2, base + 1, base + 3, base + 2)
    }
  }
  const geometry = new BufferGeometry()
  geometry.setAttribute('position', new Float32BufferAttribute(positions, 3))
  if (colored) geometry.setAttribute('color', new Float32BufferAttribute(colors, 3))
  geometry.setIndex(indices)
  geometry.computeVertexNormals()
  return geometry
}

function Line({ curve, width, color, opacity = 1 }: { curve: CatmullRomCurve3; width: number; color: string; opacity?: number }) {
  return <mesh><tubeGeometry args={[curve, 360, width, 5, curve.closed]} /><meshBasicMaterial color={color} transparent={opacity < 1} opacity={opacity} /></mesh>
}

type SceneLabelProps = {
  kind: 'driver' | 'pit' | 'sector' | 'infield'; text: string; secondary?: string;
  prefix?: string; selected?: boolean; color?: string; position: [number, number, number];
  scale: [number, number, number]; onClick?: () => void;
}

// Local canvas textures keep every label in the WebGL scene without nested DOM roots.
function SceneLabel({ kind, text, secondary = '', prefix = '', selected = false, color = '#d7ff43', position, scale, onClick }: SceneLabelProps) {
  const texture = useMemo(() => {
    const canvas = document.createElement('canvas')
    canvas.width = kind === 'sector' ? 160 : kind === 'driver' ? selected ? 560 : 245 : 640
    canvas.height = kind === 'sector' ? 160 : kind === 'infield' ? 280 : 110
    const context = canvas.getContext('2d')!
    const width = canvas.width
    const height = canvas.height
    context.textBaseline = 'middle'
    if (kind === 'infield') {
      context.textAlign = 'center'
      context.fillStyle = '#a7b6a9'
      context.font = '500 36px monospace'
      context.fillText(text, width / 2, 45)
      context.fillStyle = '#bbc8b5'
      context.font = '500 112px sans-serif'
      context.fillText(secondary, width / 2, 148)
      context.fillStyle = '#708479'
      context.font = '22px monospace'
      context.fillText('ORIGINAL / FICTIONAL', width / 2, 238)
    } else if (kind === 'sector') {
      context.beginPath()
      context.arc(80, 80, 70, 0, Math.PI * 2)
      context.fillStyle = '#111c1ef0'
      context.fill()
      context.lineWidth = 5
      context.strokeStyle = selected ? color : '#52675b'
      context.stroke()
      context.textAlign = 'center'
      context.fillStyle = selected ? color : '#a7b8ab'
      context.font = '500 53px monospace'
      context.fillText(text, 80, 83)
    } else {
      context.beginPath()
      context.roundRect(3, 3, width - 6, height - 6, 11)
      context.fillStyle = '#101a1ef0'
      context.fill()
      context.lineWidth = 3
      context.strokeStyle = selected ? color : '#6e8279'
      context.stroke()
      context.fillStyle = color
      context.fillRect(3, 13, 6, height - 26)
      if (kind === 'driver') {
        context.font = '500 33px monospace'
        context.fillStyle = '#baccc1'
        context.fillText(prefix, 28, height / 2 + 2)
        context.fillStyle = color
        context.font = '600 38px monospace'
        context.fillText(text, 96, height / 2 + 2)
        if (selected) {
          context.fillStyle = '#718578'
          context.fillRect(198, 31, 2, 48)
          context.fillStyle = '#c7d6ca'
          context.font = '500 31px monospace'
          context.fillText(secondary, 222, height / 2 + 2)
        }
      } else {
        context.font = '500 36px monospace'
        context.fillStyle = selected ? color : '#d2e3df'
        context.fillText(text, 27, height / 2 + 2)
        context.fillStyle = selected ? color : '#86a19b'
        context.font = '27px monospace'
        context.fillText(secondary, 270, height / 2 + 2)
      }
    }
    const result = new CanvasTexture(canvas)
    result.colorSpace = SRGBColorSpace
    result.anisotropy = 4
    return result
  }, [kind, text, secondary, prefix, selected, color])
  useEffect(() => () => texture.dispose(), [texture])
  const pointer = onClick ? {
    onClick: (event: ThreeEvent<MouseEvent>) => { event.stopPropagation(); onClick() },
    onPointerOver: (event: ThreeEvent<PointerEvent>) => { event.stopPropagation(); document.body.style.cursor = 'pointer' },
    onPointerOut: () => { document.body.style.cursor = '' },
  } : {}
  if (kind === 'infield') return <mesh position={position} scale={scale} rotation={[-Math.PI / 2, 0, 0]} renderOrder={4}><planeGeometry args={[1, 1]} /><meshBasicMaterial map={texture} transparent depthWrite={false} toneMapped={false} /></mesh>
  return <sprite position={position} scale={scale} renderOrder={20} {...pointer}><spriteMaterial map={texture} transparent depthTest={false} depthWrite={false} toneMapped={false} /></sprite>
}

function Grid() {
  const geometry = useMemo(() => {
    const points: number[] = []
    for (let x = -5.7; x <= 5.7; x += .6) points.push(x, .172, -4.45, x, .172, 4.45)
    for (let z = -4.2; z <= 4.2; z += .6) points.push(-5.7, .172, z, 5.7, .172, z)
    const result = new BufferGeometry()
    result.setAttribute('position', new Float32BufferAttribute(points, 3))
    return result
  }, [])
  useEffect(() => () => geometry.dispose(), [geometry])
  return <lineSegments geometry={geometry}><lineBasicMaterial color="#7b8a80" transparent opacity={.1} /></lineSegments>
}

function PitCampus({ highlighted }: { highlighted: boolean }) {
  return <group>
    <RoundedBox args={[2.15, .38, .5]} position={[-2.77, .365, .48]} radius={.035} smoothness={2} castShadow receiveShadow>
      <meshStandardMaterial color="#323e40" metalness={.65} roughness={.4} />
    </RoundedBox>
    <mesh position={[-2.77, .565, .48]} castShadow><boxGeometry args={[2.23, .045, .57]} /><meshStandardMaterial color={highlighted ? '#D7FF43' : '#a0a8a0'} metalness={.5} roughness={.5} /></mesh>
    {[-3.58, -3.18, -2.78, -2.38, -1.98].map((x, i) => <group key={x}>
      <mesh position={[x, .33, .738]}><boxGeometry args={[.3, .21, .014]} /><meshStandardMaterial color="#101a1d" metalness={.4} roughness={.3} /></mesh>
      <mesh position={[x, .48, .751]}><boxGeometry args={[.3, .028, .015]} /><meshBasicMaterial color={i === 1 && highlighted ? '#d7ff43' : '#64d9e8'} /></mesh>
      <mesh position={[x, .187, .84]}><boxGeometry args={[.014, .007, .2]} /><meshBasicMaterial color="#818d81" /></mesh>
    </group>)}
    <mesh position={[-1.9, .207, .97]}><boxGeometry args={[.3, .012, .07]} /><meshBasicMaterial color={highlighted ? '#d7ff43' : '#5a6359'} /></mesh>
    <RoundedBox args={[.48, 1.03, .48]} position={[-1.43, .69, -.03]} radius={.04} smoothness={2} castShadow>
      <meshStandardMaterial color="#3c494b" metalness={.65} roughness={.35} />
    </RoundedBox>
    <mesh position={[-1.43, 1.025, -.03]} castShadow><boxGeometry args={[.63, .25, .63]} /><meshStandardMaterial color="#86a2a6" metalness={.85} roughness={.13} /></mesh>
    <mesh position={[-1.43, 1.18, -.03]}><boxGeometry args={[.69, .045, .69]} /><meshStandardMaterial color="#c3d0c4" metalness={.65} roughness={.35} /></mesh>
    <mesh position={[-1.43, 1.38, -.03]}><cylinderGeometry args={[.012, .012, .38, 6]} /><meshStandardMaterial color="#9ea99e" /></mesh>
    <mesh position={[-1.32, 1.49, -.03]}><boxGeometry args={[.19, .1, .012]} /><meshBasicMaterial color="#d7ff43" /></mesh>
    <RoundedBox args={[1.4, .17, .53]} position={[.55, .265, -.2]} radius={.04} smoothness={2} castShadow receiveShadow><meshStandardMaterial color="#354448" metalness={.6} roughness={.4} /></RoundedBox>
    {[0, 1, 2, 3, 4].map(i => <mesh key={i} position={[.03 + i * .25, .36, -.2]} rotation={[-.08, 0, 0]}><boxGeometry args={[.22, .018, .42]} /><meshStandardMaterial color="#5d7777" metalness={.7} roughness={.3} /></mesh>)}
    <SceneLabel kind="pit" text="PIT LANE" secondary={highlighted ? 'STOP WINDOW' : '60 KM/H'} selected={highlighted} position={[-2.85, .7, .5]} scale={[2.5, .43, 1]} />
  </group>
}

function Grandstand() {
  return <group position={[3.6, .18, -.8]} rotation={[0, -.5, 0]}>
    {[0, 1, 2].map(i => <mesh key={i} position={[0, .08 + i * .09, -.12 + i * .15]} castShadow receiveShadow><boxGeometry args={[1.65, .15 + i * .18, .16]} /><meshStandardMaterial color={i % 2 ? '#40585c' : '#34464b'} metalness={.4} roughness={.65} /></mesh>)}
    <mesh position={[0, .68, .07]} rotation={[.06, 0, 0]} castShadow><boxGeometry args={[1.8, .045, .67]} /><meshStandardMaterial color="#8b9c97" metalness={.6} roughness={.4} /></mesh>
    {[-.78, .78].map(x => <mesh key={x} position={[x, .32, .23]}><cylinderGeometry args={[.015, .015, .62, 5]} /><meshStandardMaterial color="#84918a" /></mesh>)}
  </group>
}

function Trees() {
  return <group>{[[-4.4, -3.45], [-4.7, -3.2], [-5, -2.7], [4.7, -2.5], [5.2, -2.3], [4.6, -2], [-3.7, 3.6], [-4.1, 3.2], [1.3, .9], [1.65, .75]].map(([x, z], i) => <group key={`${x}-${z}`} position={[x, .16, z]}>
    <mesh position={[0, .16, 0]} castShadow><cylinderGeometry args={[.025, .034, .3, 5]} /><meshStandardMaterial color="#52604d" /></mesh>
    <mesh position={[0, .35, 0]} castShadow><coneGeometry args={[.14 + i % 3 * .025, .45, 6]} /><meshStandardMaterial color={i % 2 ? '#344d3b' : '#3d5b46'} roughness={1} /></mesh>
  </group>)}</group>
}

type Standing = ReturnType<typeof raceAtLap>[number]
function DriverMarker({ row, lap, selected, motion, active, pit }: { row: Standing; lap: number; selected: boolean; motion: boolean; active: boolean; pit: boolean }) {
  const root = useRef<Group>(null)
  const invalidate = useThree(state => state.invalidate)
  const targetProgress = ((.21 + lap / TOTAL_LAPS * .64 - row.gap / 100) % 1 + 1) % 1
  const progress = useRef(targetProgress)
  const target = useMemo(() => {
    // Pit cars are placed in the lane only on their modeled end-of-lap stop.
    const point = pit ? pitLane.getPointAt(.52) : track.getPointAt(targetProgress)
    const tangent = pit ? pitLane.getTangentAt(.52) : track.getTangentAt(targetProgress)
    return { point, angle: Math.atan2(tangent.x, tangent.z) }
  }, [targetProgress, pit])
  useEffect(() => {
    invalidate()
    if ((!motion || !active || pit) && root.current) {
      root.current.position.copy(target.point).add(new Vector3(0, .05, 0))
      root.current.rotation.y = target.angle
      progress.current = targetProgress
    }
  }, [target, targetProgress, motion, active, pit, invalidate])
  useFrame((_, delta) => {
    if (!root.current || !active || !motion || pit) return
    const diff = targetProgress - progress.current
    if (Math.abs(diff) < .0001) return
    progress.current = MathUtils.damp(progress.current, targetProgress, 5, Math.min(delta, .08))
    const point = track.getPointAt(progress.current)
    const tangent = track.getTangentAt(progress.current)
    root.current.position.set(point.x, point.y + .05, point.z)
    root.current.rotation.y = Math.atan2(tangent.x, tangent.z)
    invalidate()
  })
  return <group ref={root} position={[target.point.x, target.point.y + .05, target.point.z]} rotation={[0, target.angle, 0]}>
    {selected && <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -.012, 0]}><ringGeometry args={[.23, .26, 48]} /><meshBasicMaterial color={row.driver.color} transparent opacity={.9} depthWrite={false} /></mesh>}
    <mesh position={[0, .052, 0]} castShadow><boxGeometry args={[.11, .07, .3]} /><meshStandardMaterial color={row.driver.color} metalness={.65} roughness={.25} /></mesh>
    <mesh position={[0, .101, -.025]}><boxGeometry args={[.055, .045, .1]} /><meshStandardMaterial color="#101719" roughness={.4} /></mesh>
    <mesh position={[0, .04, .17]}><boxGeometry args={[.23, .025, .04]} /><meshStandardMaterial color={row.driver.color} metalness={.4} roughness={.3} /></mesh>
    <mesh position={[0, .1, -.15]}><boxGeometry args={[.22, .025, .04]} /><meshStandardMaterial color={row.driver.color} metalness={.4} roughness={.3} /></mesh>
    {[-.095, .095].flatMap(x => [-.1, .095].map(z => <mesh key={`${x}-${z}`} position={[x, .04, z]} rotation={[0, 0, Math.PI / 2]} castShadow><cylinderGeometry args={[.047, .047, .043, 8]} /><meshStandardMaterial color="#101214" roughness={.9} /></mesh>))}
    <SceneLabel kind="driver" text={row.driver.short} prefix={row.position.toString().padStart(2, '0')} secondary={row.gap === 0 ? 'LEADER' : `+${row.gap.toFixed(3)}s`} selected={selected} color={row.driver.color} position={[0, selected ? .63 : .4, 0]} scale={selected ? [2.12, .42, 1] : [.94, .42, 1]} />
  </group>
}

function TrackWorld({ lap, driverId, safetyCar, selectedSector, onSector, motion, active }: { lap: number; driverId: string; safetyCar: boolean; selectedSector: number; onSector: (index: number) => void; motion: boolean; active: boolean }) {
  const rows = useMemo(() => raceAtLap(lap, safetyCar), [lap, safetyCar])
  const pitActive = rows.some(row => row.data.pit)
  const road = useMemo(() => createRibbon(track, -.235, .235), [])
  const shoulder = useMemo(() => createRibbon(track, -.34, .34), [])
  const innerKerb = useMemo(() => createRibbon(track, -.31, -.242, 0, 1, true), [])
  const outerKerb = useMemo(() => createRibbon(track, .242, .31, 0, 1, true), [])
  const sectors = useMemo(() => SECTORS.map((_, index) => createRibbon(track, -.23, .23, index / 3, (index + 1) / 3)), [])
  const racingLine = useMemo(() => new CatmullRomCurve3(track.getSpacedPoints(240).slice(0, -1).map((point, index) => {
    const tangent = track.getTangentAt(index / 240)
    return point.clone().add(new Vector3(-tangent.z, 0, tangent.x).multiplyScalar(Math.sin(index / 240 * Math.PI * 12) * .065)).add(new Vector3(0, .024, 0))
  }), true, 'catmullrom', .4), [])
  const startPoint = track.getPointAt(.014)
  const startTangent = track.getTangentAt(.014)
  useEffect(() => () => [road, shoulder, innerKerb, outerKerb, ...sectors].forEach(geometry => geometry.dispose()), [road, shoulder, innerKerb, outerKerb, sectors])
  const chooseSector = (event: ThreeEvent<MouseEvent>, index: number) => { event.stopPropagation(); onSector(index) }
  return <group>
    <RoundedBox args={[12.6, .14, 10.1]} radius={.16} smoothness={4} position={[0, -.26, 0]} castShadow receiveShadow><meshStandardMaterial color="#0b1113" metalness={.75} roughness={.4} /></RoundedBox>
    <RoundedBox args={[12.4, .38, 9.9]} radius={.16} smoothness={4} position={[0, -.03, 0]} castShadow receiveShadow><meshStandardMaterial color="#1c272a" metalness={.4} roughness={.65} /></RoundedBox>
    <Grid />
    <mesh geometry={shoulder} position={[0, -.004, 0]} receiveShadow><meshStandardMaterial color="#10191a" metalness={.15} roughness={.95} side={2} /></mesh>
    <mesh geometry={road} receiveShadow><meshStandardMaterial color="#475151" metalness={.22} roughness={.82} side={2} /></mesh>
    <mesh geometry={innerKerb} position={[0, .006, 0]} receiveShadow><meshStandardMaterial vertexColors roughness={.8} side={2} /></mesh>
    <mesh geometry={outerKerb} position={[0, .006, 0]} receiveShadow><meshStandardMaterial vertexColors roughness={.8} side={2} /></mesh>
    {sectors.map((geometry, index) => <mesh key={index} geometry={geometry} position={[0, .01, 0]} onClick={event => chooseSector(event, index)} onPointerOver={event => { event.stopPropagation(); document.body.style.cursor = 'pointer' }} onPointerOut={() => { document.body.style.cursor = '' }}><meshBasicMaterial color={SECTORS[index].color} opacity={selectedSector === index ? .13 : 0} transparent depthWrite={false} side={2} /></mesh>)}
    <Line curve={racingLine} color={safetyCar && lap >= 22 && lap <= 24 ? '#ffd668' : '#d7ff43'} width={.012} opacity={.8} />
    <Line curve={pitLane} color={pitActive ? '#d7ff43' : '#7b9698'} width={pitActive ? .028 : .016} opacity={pitActive ? 1 : .6} />
    <group position={[startPoint.x, .234, startPoint.z]} rotation={[0, Math.atan2(startTangent.x, startTangent.z), 0]}>
      {[0, 1, 2, 3].flatMap(x => [0, 1].map(z => <mesh key={`${x}-${z}`} position={[(x - 1.5) * .115, 0, (z - .5) * .068]}><boxGeometry args={[.115, .004, .068]} /><meshBasicMaterial color={(x + z) % 2 === 0 ? '#eef2e7' : '#152023'} /></mesh>))}
    </group>
    <PitCampus highlighted={pitActive} /><Grandstand /><Trees />
    <SceneLabel kind="infield" text="APEX CIRCUIT" secondary="5.24 KM" position={[-.35, .19, -1.24]} scale={[2.1, .92, 1]} />
    {SECTORS.map((sector, index) => {
      const position = track.getPointAt(index / 3 + .16)
      const tangent = track.getTangentAt(index / 3 + .16)
      const side = new Vector3(-tangent.z, 0, tangent.x).normalize().multiplyScalar(.8)
      return <SceneLabel key={sector.number} kind="sector" text={`S${sector.number}`} color={sector.color} selected={selectedSector === index} position={[position.x + side.x, .32, position.z + side.z]} scale={[.5, .5, 1]} onClick={() => onSector(index)} />
    })}
    {rows.map(row => <DriverMarker key={row.driver.id} row={row} lap={lap} selected={row.driver.id === driverId} motion={motion} active={active} pit={row.data.pit} />)}
  </group>
}

export default function CircuitExplorer({ lap, driverId, safetyCar, onSelectLap }: { lap: number; driverId: string; safetyCar: boolean; onSelectLap?: (lap: number) => void }) {
  const [selectedSector, setSelectedSector] = useState(0)
  const selected = raceAtLap(lap, safetyCar).find(row => row.driver.id === driverId)!
  const pitDriver: Driver | undefined = raceAtLap(lap, safetyCar).find(row => row.data.pit)?.driver
  return <div className="circuit-explorer-shell">
    <div className="ce-topline"><span><i /> CIRCUIT EXPLORER</span><span className={pitDriver ? 'ce-pit-status' : ''}>{pitDriver ? `${pitDriver.short} / PIT STOP` : `LAP ${lap.toString().padStart(2, '0')} / ${TOTAL_LAPS}`}</span></div>
    <SceneFrame label="3D circuit explorer" className="circuit-explorer" camera={[9, 12, 13]} target={[0, 0, 0]} fallback={<Circuit lap={lap} driverId={driverId} safetyCar={safetyCar} />} animated={false}>
      {({ active, motion }) => <TrackWorld lap={lap} driverId={driverId} safetyCar={safetyCar} selectedSector={selectedSector} onSector={setSelectedSector} active={active} motion={motion} />}
    </SceneFrame>
    <div className="ce-sector-controls" role="group" aria-label="Explore track sectors">{SECTORS.map((sector, index) => <button key={sector.number} className={selectedSector === index ? 'is-active' : ''} style={{ '--sector-color': sector.color } as React.CSSProperties} onClick={() => setSelectedSector(index)} aria-pressed={selectedSector === index}><span>0{sector.number}</span><div><b>SECTOR {sector.number}</b><small>{sector.label}</small></div><i /></button>)}</div>
    <div className="ce-insight" aria-live="polite"><div><span className="ce-eyebrow">{pitDriver ? 'PIT LANE ACTIVE' : `SECTOR 0${selectedSector + 1}`}</span><h4>{pitDriver ? `${pitDriver.name} boxes this lap.` : SECTORS[selectedSector].title}</h4><p>{pitDriver ? 'The illuminated lane marks a modeled stop. New tyres begin working on the following lap.' : SECTORS[selectedSector].detail}</p></div>{onSelectLap && <button className="ce-event-jump" onClick={() => onSelectLap(SECTORS[selectedSector].lap)}>Jump to lap {SECTORS[selectedSector].lap} <span aria-hidden="true">↗</span></button>}</div>
    <div className="ce-timing"><span><i style={{ background: selected.driver.color }} />{selected.driver.short} <b>P{selected.position}</b><em>{COMPOUNDS[selected.data.compound].name} · {selected.data.tyreAge} laps</em></span><small>Illustrative positions · simulated timing</small></div>
  </div>
}
