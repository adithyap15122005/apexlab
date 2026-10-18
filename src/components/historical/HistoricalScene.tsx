import { useEffect, useMemo, useRef, type MutableRefObject } from 'react'
import { RoundedBox } from '@react-three/drei'
import { useFrame, useThree, type ThreeEvent } from '@react-three/fiber'
import {
  BufferGeometry, CanvasTexture, CatmullRomCurve3, Color, Float32BufferAttribute,
  InstancedMesh, Matrix4, Object3D, Quaternion, Sprite, SRGBColorSpace, Vector3,
} from 'three'
import { getDriverState } from '../../history/replay'
import type { CameraMode, DriverRaceState, HistoricalDriver, HistoricalRace, ReplayClock } from '../../history/types'
import SceneFrame from '../three/SceneFrame'
import './HistoricalScene.css'

type HistoricalSceneProps = {
  race: HistoricalRace
  clockRef: MutableRefObject<ReplayClock>
  time: number
  selectedDriver: number
  cameraMode: CameraMode
  onSelectDriver: (number: number) => void
  playing: boolean
}
type TrackProjection = {
  centerX: number; centerY: number; scale: number; width: number; depth: number
  point: (x: number, y: number, height?: number) => Vector3
}
type RaceSnapshot = { time: number; states: DriverRaceState[] }
const OVERHEAD: [number, number, number] = [15.7, 19.1, 14.8]
const ORIGIN: [number, number, number] = [0, 0, 0]
const UP = new Vector3(0, 1, 0)
const HIDDEN_MATRIX = new Matrix4().makeScale(0, 0, 0)
const CAMERA_LABELS: Record<CameraMode, string> = {
  strategist: 'STRATEGIST / FREE ORBIT', helicopter: 'HELICOPTER / FOLLOW',
  trackside: 'TRACKSIDE / FOLLOW', onboard: 'RECONSTRUCTED ONBOARD',
}

function driverColor(driver: HistoricalDriver) {
  return /^#?[0-9a-f]{6}$/i.test(driver.color) ? `#${driver.color.replace('#', '')}` : '#c8d9ba'
}
function locationVisible(state: DriverRaceState) {
  return ['recorded', 'interpolated', 'finished'].includes(state.location.status)
    && Number.isFinite(state.location.x) && Number.isFinite(state.location.y)
}
function createProjection(race: HistoricalRace): TrackProjection {
  const points = race.track.points
  const minX = Math.min(...points.map(point => point[0]))
  const maxX = Math.max(...points.map(point => point[0]))
  const minY = Math.min(...points.map(point => point[1]))
  const maxY = Math.max(...points.map(point => point[1]))
  const scale = 16 / Math.max(maxX - minX, maxY - minY, 1)
  const centerX = (minX + maxX) / 2
  const centerY = (minY + maxY) / 2
  return {
    centerX, centerY, scale, width: (maxX - minX) * scale, depth: (maxY - minY) * scale,
    point: (x, y, height = .215) => new Vector3((x - centerX) * scale, height, -(y - centerY) * scale),
  }
}

function makeCurve(race: HistoricalRace, projection: TrackProjection) {
  // Smooth the rendering of the reference trace only. Drivers never use this curve.
  const stride = Math.max(1, Math.floor(race.track.points.length / 480))
  const points = race.track.points.filter((_, index) => index % stride === 0)
    .map(([x, y]) => projection.point(x, y))
  if (points.length > 2 && points[0].distanceTo(points[points.length - 1]) < .03) points.pop()
  return new CatmullRomCurve3(points, true, 'centripetal', .35)
}

function roadRibbon(curve: CatmullRomCurve3, inner: number, outer: number, kerbs = false) {
  const positions: number[] = [], indices: number[] = [], colors: number[] = []
  const segments = 1100
  for (let index = 0; index <= segments; index += 1) {
    const progress = index / segments
    const point = curve.getPointAt(progress)
    const tangent = curve.getTangentAt(progress)
    const normal = new Vector3(-tangent.z, 0, tangent.x).normalize()
    const color = new Color(Math.floor(index / 5) % 2 ? '#c2c6bb' : '#983f3a')
    for (const width of [inner, outer]) {
      const vertex = point.clone().addScaledVector(normal, width)
      positions.push(vertex.x, vertex.y, vertex.z)
      colors.push(color.r, color.g, color.b)
    }
    if (index < segments) {
      const offset = index * 2
      indices.push(offset, offset + 1, offset + 2, offset + 1, offset + 3, offset + 2)
    }
  }
  const geometry = new BufferGeometry()
  geometry.setAttribute('position', new Float32BufferAttribute(positions, 3))
  if (kerbs) geometry.setAttribute('color', new Float32BufferAttribute(colors, 3))
  geometry.setIndex(indices)
  geometry.computeVertexNormals()
  return geometry
}

type TextureLabelProps = {
  text: string; detail?: string; color?: string; selected?: boolean; width?: number
  position?: [number, number, number]; labelRef?: (sprite: Sprite | null) => void
  onClick?: () => void
}
function TextureLabel({ text, detail = '', color = '#d7ff43', selected = false, width = .52, position = [0, 0, 0], labelRef, onClick }: TextureLabelProps) {
  const texture = useMemo(() => {
    const canvas = document.createElement('canvas')
    canvas.width = detail ? 640 : 160
    canvas.height = 128
    const context = canvas.getContext('2d')!
    context.beginPath()
    context.roundRect(3, 3, canvas.width - 6, 122, 12)
    context.fillStyle = '#101a1eee'
    context.fill()
    context.lineWidth = selected ? 4 : 2
    context.strokeStyle = selected ? color : '#7d999174'
    context.stroke()
    context.fillStyle = color
    context.fillRect(3, 17, 6, 94)
    context.textBaseline = 'middle'
    context.textAlign = detail ? 'left' : 'center'
    context.font = '600 53px monospace'
    context.fillText(text, detail ? 27 : 82, 68)
    if (detail) {
      context.font = '500 30px monospace'
      context.fillStyle = '#c8d8c9'
      context.fillText(detail, 169, 67)
    }
    const value = new CanvasTexture(canvas)
    value.colorSpace = SRGBColorSpace
    return value
  }, [text, detail, color, selected])
  useEffect(() => () => texture.dispose(), [texture])
  const events = onClick ? {
    onClick: (event: ThreeEvent<MouseEvent>) => { event.stopPropagation(); onClick() },
    onPointerOver: () => { document.body.style.cursor = 'pointer' },
    onPointerOut: () => { document.body.style.cursor = '' },
  } : {}
  return <sprite ref={labelRef} position={position} scale={[width, width * 128 / (detail ? 640 : 160), 1]} renderOrder={15} {...events}><spriteMaterial map={texture} transparent depthTest={false} depthWrite={false} toneMapped={false} /></sprite>
}

function ReferenceCircuit({ race, projection }: { race: HistoricalRace; projection: TrackProjection }) {
  const curve = useMemo(() => makeCurve(race, projection), [race, projection])
  const geometries = useMemo(() => [
    roadRibbon(curve, -.33, .33), roadRibbon(curve, -.22, .22),
    roadRibbon(curve, -.275, -.225, true), roadRibbon(curve, .225, .275, true),
  ], [curve])
  const pitCurve = useMemo(() => {
    const points = (race.track.pitLane ?? []).map(([x, y]) => projection.point(x, y, .235))
    return points.length > 2 ? new CatmullRomCurve3(points, false, 'centripetal') : null
  }, [race, projection])
  useEffect(() => () => geometries.forEach(geometry => geometry.dispose()), [geometries])
  const start = curve.getPointAt(0)
  const heading = curve.getTangentAt(0)
  const slabWidth = projection.width + 2.6, slabDepth = projection.depth + 2.6
  return <group>
    <RoundedBox args={[slabWidth + .16, .14, slabDepth + .16]} radius={.15} smoothness={3} position={[0, -.27, 0]} receiveShadow><meshStandardMaterial color="#0b1214" metalness={.65} roughness={.4} /></RoundedBox>
    <RoundedBox args={[slabWidth, .38, slabDepth]} radius={.16} smoothness={3} position={[0, -.035, 0]} receiveShadow><meshStandardMaterial color="#253437" metalness={.2} roughness={.85} /></RoundedBox>
    <mesh geometry={geometries[0]} position={[0, -.008, 0]} receiveShadow><meshStandardMaterial color="#142320" roughness={.95} side={2} /></mesh>
    <mesh geometry={geometries[1]} receiveShadow><meshStandardMaterial color="#53605d" metalness={.15} roughness={.87} side={2} /></mesh>
    {[2, 3].map(index => <mesh key={index} geometry={geometries[index]} position={[0, .005, 0]} receiveShadow><meshStandardMaterial vertexColors roughness={.8} side={2} /></mesh>)}
    {pitCurve && <mesh><tubeGeometry args={[pitCurve, 220, .028, 5, false]} /><meshBasicMaterial color="#7ea69f" transparent opacity={.7} /></mesh>}
    <group position={[start.x, .234, start.z]} rotation={[0, Math.atan2(heading.x, heading.z), 0]}>
      {[0, 1, 2, 3, 4, 5].flatMap(x => [0, 1].map(z => <mesh key={`${x}-${z}`} position={[(x - 2.5) * .073, 0, (z - .5) * .065]}><boxGeometry args={[.073, .004, .065]} /><meshBasicMaterial color={(x + z) % 2 === 0 ? '#e8eadf' : '#162024'} /></mesh>))}
    </group>
    <TrackFurniture curve={curve} pitCurve={pitCurve} />
  </group>
}

// Context scenery is deliberately indicative; no building footprint is presented as surveyed.
function TrackFurniture({ curve, pitCurve }: { curve: CatmullRomCurve3; pitCurve: CatmullRomCurve3 | null }) {
  const pit = (pitCurve ?? curve).getPointAt(pitCurve ? .5 : .05)
  const pitTangent = (pitCurve ?? curve).getTangentAt(pitCurve ? .5 : .05)
  const side = new Vector3(-pitTangent.z, 0, pitTangent.x).normalize()
  if (side.dot(pit) < 0) side.negate()
  const building = pit.clone().addScaledVector(side, .65)
  const pitAngle = Math.atan2(pitTangent.x, pitTangent.z)
  return <group>
    <group position={[building.x, .175, building.z]} rotation={[0, pitAngle, 0]}>
      <RoundedBox args={[.48, .43, 2.5]} radius={.025} smoothness={2} position={[0, .215, 0]} castShadow><meshStandardMaterial color="#526263" metalness={.65} roughness={.45} /></RoundedBox>
      <mesh position={[0, .46, 0]} castShadow><boxGeometry args={[.58, .05, 2.6]} /><meshStandardMaterial color="#c0c8ba" metalness={.5} roughness={.5} /></mesh>
      {[-.96, -.58, -.2, .18, .56, .94].map(z => <group key={z}>
        <mesh position={[-.248, .18, z]}><boxGeometry args={[.013, .24, .28]} /><meshStandardMaterial color="#18262b" metalness={.5} roughness={.3} /></mesh>
        <mesh position={[-.261, .34, z]}><boxGeometry args={[.015, .035, .28]} /><meshBasicMaterial color="#b4ccad" /></mesh>
      </group>)}
      <TextureLabel text="PIT" detail="RECORDED LANE" color="#a5c5ba" position={[0, .85, 0]} width={2.3} />
      <group position={[.05, 0, -1.65]}>
        <RoundedBox args={[.6, .9, .55]} radius={.04} smoothness={2} position={[0, .45, 0]}><meshStandardMaterial color="#45575b" metalness={.7} roughness={.35} /></RoundedBox>
        <mesh position={[0, .88, 0]}><boxGeometry args={[.76, .23, .7]} /><meshStandardMaterial color="#809b9c" metalness={.9} roughness={.15} /></mesh>
        <mesh position={[0, 1.03, 0]}><boxGeometry args={[.8, .04, .75]} /><meshStandardMaterial color="#c1cbbc" metalness={.6} roughness={.35} /></mesh>
      </group>
    </group>
    {[.2, .48, .72].map((progress, index) => {
      const point = curve.getPointAt(progress)
      const tangent = curve.getTangentAt(progress)
      const outward = new Vector3(-tangent.z, 0, tangent.x).normalize()
      if (outward.dot(point) < 0) outward.negate()
      point.addScaledVector(outward, 1.0)
      return <group key={progress} position={[point.x, .17, point.z]} rotation={[0, Math.atan2(tangent.x, tangent.z), 0]}>
        {[0, 1, 2].map(row => <mesh key={row} position={[row * .13, .07 + row * .075, 0]}><boxGeometry args={[.16, .13 + row * .15, 1.55]} /><meshStandardMaterial color={row % 2 ? '#58716f' : '#3a5355'} metalness={.3} roughness={.7} /></mesh>)}
        <mesh position={[.1, .61, 0]} rotation={[0, 0, -.08]}><boxGeometry args={[.7, .04, 1.7]} /><meshStandardMaterial color={index === 1 ? '#a5b6a5' : '#849c95'} metalness={.5} roughness={.5} /></mesh>
      </group>
    })}
    {[.1, .32, .57, .86].flatMap(progress => {
      const point = curve.getPointAt(progress)
      const tangent = curve.getTangentAt(progress)
      const outward = new Vector3(-tangent.z, 0, tangent.x).normalize()
      if (outward.dot(point) < 0) outward.negate()
      return [0, 1, 2, 3].map(index => {
        const position = point.clone().addScaledVector(outward, .85 + index % 2 * .28).addScaledVector(tangent, (index - 1.5) * .32)
        return <group key={`${progress}-${index}`} position={[position.x, .17, position.z]}>
          <mesh position={[0, .15, 0]}><cylinderGeometry args={[.025, .035, .3, 5]} /><meshStandardMaterial color="#586750" /></mesh>
          <mesh position={[0, .42, 0]}><coneGeometry args={[.16 + index % 2 * .025, .55, 6]} /><meshStandardMaterial color={index % 2 ? '#3b5b43' : '#36553f'} roughness={1} /></mesh>
        </group>
      })
    })}
  </group>
}

function DriverFleet({ race, projection, snapshot, selectedDriver, onSelectDriver }: {
  race: HistoricalRace; projection: TrackProjection; snapshot: MutableRefObject<RaceSnapshot>
  selectedDriver: number; onSelectDriver: (number: number) => void
}) {
  const body = useRef<InstancedMesh>(null), nose = useRef<InstancedMesh>(null)
  const frontWing = useRef<InstancedMesh>(null), rearWing = useRef<InstancedMesh>(null)
  const cockpit = useRef<InstancedMesh>(null), wheels = useRef<InstancedMesh>(null)
  const labels = useRef<(Sprite | null)[]>([])
  const halo = useRef<import('three').Mesh>(null)
  const transform = useMemo(() => new Object3D(), [])
  const parentMatrix = useMemo(() => new Matrix4(), [])
  const partMatrix = useMemo(() => new Matrix4(), [])
  const rotation = useMemo(() => new Quaternion(), [])
  const parts = useMemo(() => [
    { ref: body, offset: new Vector3(0, .04, 0) },
    { ref: nose, offset: new Vector3(0, .027, .215) },
    { ref: frontWing, offset: new Vector3(0, .02, .29) },
    { ref: rearWing, offset: new Vector3(0, .12, -.22) },
    { ref: cockpit, offset: new Vector3(0, .085, -.025) },
  ], [])
  useEffect(() => {
    race.drivers.forEach((driver, index) => {
      const color = new Color(driverColor(driver))
      body.current?.setColorAt(index, color)
      nose.current?.setColorAt(index, color)
      rearWing.current?.setColorAt(index, color)
    })
    for (const part of [body, nose, rearWing]) if (part.current?.instanceColor) part.current.instanceColor.needsUpdate = true
  }, [race])
  useFrame(() => {
    let selectedVisible = false
    snapshot.current.states.forEach((state, index) => {
      const visible = locationVisible(state)
      const label = labels.current[index]
      if (label) label.visible = visible
      if (!visible) {
        parts.forEach(part => part.ref.current?.setMatrixAt(index, HIDDEN_MATRIX))
        for (let wheel = 0; wheel < 4; wheel += 1) wheels.current?.setMatrixAt(index * 4 + wheel, HIDDEN_MATRIX)
        return
      }
      const point = projection.point(state.location.x, state.location.y, .23)
      // Provider heading is atan2(raw dy, raw dx); raw y maps to negative scene z.
      const heading = state.location.heading + Math.PI / 2
      rotation.setFromAxisAngle(UP, heading)
      parentMatrix.compose(point, rotation, new Vector3(1, 1, 1))
      parts.forEach(part => {
        transform.position.copy(part.offset)
        transform.rotation.set(0, 0, 0)
        transform.scale.set(1, 1, 1)
        transform.updateMatrix()
        partMatrix.multiplyMatrices(parentMatrix, transform.matrix)
        part.ref.current?.setMatrixAt(index, partMatrix)
      })
      for (let wheel = 0; wheel < 4; wheel += 1) {
        transform.position.set(wheel % 2 ? .123 : -.123, .047, wheel < 2 ? -.14 : .14)
        transform.rotation.set(0, 0, Math.PI / 2)
        transform.updateMatrix()
        partMatrix.multiplyMatrices(parentMatrix, transform.matrix)
        wheels.current?.setMatrixAt(index * 4 + wheel, partMatrix)
      }
      if (label) label.position.set(point.x, point.y + (state.driver.number === selectedDriver ? .7 : .44), point.z)
      if (state.driver.number === selectedDriver && halo.current) {
        selectedVisible = true
        halo.current.position.set(point.x, .238, point.z)
      }
    })
    for (const part of [...parts.map(part => part.ref), wheels]) if (part.current) part.current.instanceMatrix.needsUpdate = true
    if (halo.current) halo.current.visible = selectedVisible
  }, -1)
  const select = (event: ThreeEvent<MouseEvent>, wheel = false) => {
    event.stopPropagation()
    if (event.instanceId === undefined) return
    const driver = race.drivers[wheel ? Math.floor(event.instanceId / 4) : event.instanceId]
    if (driver) onSelectDriver(driver.number)
  }
  const pointer = { onPointerOver: () => { document.body.style.cursor = 'pointer' }, onPointerOut: () => { document.body.style.cursor = '' } }
  const count = race.drivers.length
  const selected = race.drivers.find(driver => driver.number === selectedDriver)
  return <group>
    <instancedMesh ref={body} args={[undefined, undefined, count]} frustumCulled={false} onClick={event => select(event)} {...pointer}><boxGeometry args={[.14, .065, .35]} /><meshStandardMaterial metalness={.65} roughness={.3} /></instancedMesh>
    <instancedMesh ref={nose} args={[undefined, undefined, count]} frustumCulled={false} onClick={event => select(event)} {...pointer}><boxGeometry args={[.067, .035, .16]} /><meshStandardMaterial metalness={.6} roughness={.3} /></instancedMesh>
    <instancedMesh ref={frontWing} args={[undefined, undefined, count]} frustumCulled={false} onClick={event => select(event)} {...pointer}><boxGeometry args={[.3, .024, .055]} /><meshStandardMaterial color="#101a1f" metalness={.5} roughness={.4} /></instancedMesh>
    <instancedMesh ref={rearWing} args={[undefined, undefined, count]} frustumCulled={false} onClick={event => select(event)} {...pointer}><boxGeometry args={[.285, .03, .06]} /><meshStandardMaterial metalness={.5} roughness={.3} /></instancedMesh>
    <instancedMesh ref={cockpit} args={[undefined, undefined, count]} frustumCulled={false} onClick={event => select(event)} {...pointer}><boxGeometry args={[.075, .04, .105]} /><meshStandardMaterial color="#101a1f" roughness={.4} /></instancedMesh>
    <instancedMesh ref={wheels} args={[undefined, undefined, count * 4]} frustumCulled={false} onClick={event => select(event, true)} {...pointer}><cylinderGeometry args={[.061, .061, .046, 10]} /><meshStandardMaterial color="#0c1114" roughness={.95} /></instancedMesh>
    <mesh ref={halo} rotation={[-Math.PI / 2, 0, 0]}><ringGeometry args={[.29, .32, 48]} /><meshBasicMaterial color={selected ? driverColor(selected) : '#d7ff43'} transparent opacity={.9} depthWrite={false} /></mesh>
    {race.drivers.map((driver, index) => <TextureLabel key={driver.number} text={driver.number.toString().padStart(2, '0')} detail={driver.number === selectedDriver ? `${driver.code} / SELECTED` : ''} selected={driver.number === selectedDriver} color={driverColor(driver)} width={driver.number === selectedDriver ? 2.15 : .4} labelRef={sprite => { labels.current[index] = sprite }} onClick={() => onSelectDriver(driver.number)} />)}
  </group>
}

function CameraDirector({ mode, projection, selectedDriver, clockRef, snapshot, active, playing }: {
  mode: CameraMode; projection: TrackProjection; selectedDriver: number; clockRef: MutableRefObject<ReplayClock>
  snapshot: MutableRefObject<RaceSnapshot>; active: boolean; playing: boolean
}) {
  const { camera, invalidate } = useThree()
  const previous = useRef({ mode, selectedDriver, time: clockRef.current.current, initialized: false })
  const trackside = useRef<Vector3 | null>(null)
  const target = useMemo(() => new Vector3(), [])
  const wanted = useMemo(() => new Vector3(), [])
  const lastTarget = useMemo(() => new Vector3(), [])
  useEffect(() => { invalidate() }, [mode, selectedDriver, playing, invalidate])
  useFrame((_, delta) => {
    if (!active) return
    const state = snapshot.current.states.find(row => row.driver.number === selectedDriver)
    const now = snapshot.current.time
    const changed = previous.current.mode !== mode || previous.current.selectedDriver !== selectedDriver
    const seek = Math.abs(now - previous.current.time) > Math.max(1.25, clockRef.current.speed * .2)
    const snap = changed || seek || !previous.current.initialized
    previous.current = { mode, selectedDriver, time: now, initialized: true }
    if (mode === 'strategist') {
      if (snap) { camera.position.set(...OVERHEAD); camera.lookAt(0, 0, 0); invalidate() }
      trackside.current = null
      return
    }
    if (!state || !locationVisible(state)) return
    const point = projection.point(state.location.x, state.location.y, .23)
    const angle = state.location.heading + Math.PI / 2
    const forward = new Vector3(Math.sin(angle), 0, Math.cos(angle))
    const normal = new Vector3(forward.z, 0, -forward.x)
    target.copy(point)
    if (mode === 'helicopter') {
      wanted.copy(point).addScaledVector(forward, -2.7).addScaledVector(normal, 1.1)
      wanted.y = 4.5
      target.addScaledVector(forward, .6)
    } else if (mode === 'trackside') {
      if (snap || !trackside.current || trackside.current.distanceTo(point) > 4.5) {
        trackside.current = point.clone().addScaledVector(normal, 1.4).addScaledVector(forward, .55)
        trackside.current.y = .9
      }
      wanted.copy(trackside.current)
      target.y = .38
    } else {
      wanted.copy(point).addScaledVector(forward, -.035)
      wanted.y = .465
      target.addScaledVector(forward, 2.4)
      target.y = .42
    }
    const alpha = snap || mode === 'onboard' ? 1 : 1 - Math.exp(-Math.min(delta, .08) * 7)
    camera.position.lerp(wanted, alpha)
    if (snap || mode === 'onboard') lastTarget.copy(target)
    else lastTarget.lerp(target, alpha)
    camera.lookAt(lastTarget)
    // Camera settling can request another frame while a paused replay stays truthful.
    if (!playing && camera.position.distanceToSquared(wanted) > .0002) invalidate()
  })
  return null
}

function HistoricalWorld({ race, clockRef, selectedDriver, cameraMode, onSelectDriver, projection, active, playing, time }: HistoricalSceneProps & { projection: TrackProjection; active: boolean }) {
  const snapshot = useRef<RaceSnapshot>({ time, states: race.drivers.map(driver => getDriverState(race, driver.number, time)) })
  const invalidate = useThree(state => state.invalidate)
  useEffect(() => { invalidate() }, [time, selectedDriver, cameraMode, invalidate])
  useFrame(() => {
    const current = clockRef.current.current
    snapshot.current = { time: current, states: race.drivers.map(driver => getDriverState(race, driver.number, current)) }
  }, -2)
  return <group>
    <ReferenceCircuit race={race} projection={projection} />
    <DriverFleet race={race} projection={projection} snapshot={snapshot} selectedDriver={selectedDriver} onSelectDriver={onSelectDriver} />
    <CameraDirector mode={cameraMode} projection={projection} selectedDriver={selectedDriver} clockRef={clockRef} snapshot={snapshot} active={active} playing={playing} />
  </group>
}

function Historical2D({ race, time, selectedDriver, onSelectDriver, projection }: { race: HistoricalRace; time: number; selectedDriver: number; onSelectDriver: (number: number) => void; projection: TrackProjection }) {
  const padding = .9
  const width = projection.width + padding * 2, depth = projection.depth + padding * 2
  const project = (x: number, y: number) => {
    const point = projection.point(x, y)
    return { x: point.x + width / 2, y: point.z + depth / 2 }
  }
  const path = race.track.points.map(([x, y], index) => { const point = project(x, y); return `${index ? 'L' : 'M'}${point.x.toFixed(3)} ${point.y.toFixed(3)}` }).join(' ') + 'Z'
  const pit = (race.track.pitLane ?? []).map(([x, y], index) => { const point = project(x, y); return `${index ? 'L' : 'M'}${point.x.toFixed(3)} ${point.y.toFixed(3)}` }).join(' ')
  const rows = race.drivers.map(driver => getDriverState(race, driver.number, time))
  return <div className="historical-2d"><svg viewBox={`0 0 ${width} ${depth}`} role="img" aria-label="Silverstone recorded reference trace and driver locations">
    <path d={path} fill="none" stroke="#b0c7b41a" strokeWidth=".61" strokeLinejoin="round" />
    <path d={path} fill="none" stroke="#61776d" strokeWidth=".19" strokeLinejoin="round" />
    <path d={path} fill="none" stroke="#cad8ba" strokeWidth=".025" strokeLinejoin="round" />
    {pit && <path d={pit} fill="none" stroke="#86b5ad" strokeWidth=".045" />}
    {rows.filter(locationVisible).map(state => {
      const point = project(state.location.x, state.location.y)
      const selected = state.driver.number === selectedDriver
      const color = driverColor(state.driver)
      return <g key={state.driver.number} transform={`translate(${point.x} ${point.y})`} role="button" tabIndex={0} aria-label={`Follow ${state.driver.name}`} onClick={() => onSelectDriver(state.driver.number)} onKeyDown={event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); onSelectDriver(state.driver.number) } }} className="historical-2d-driver">
        <title>{state.driver.name} · {state.location.status}</title>
        {selected && <circle r=".27" fill="none" stroke={color} strokeWidth=".035" />}
        <circle r={selected ? '.14' : '.1'} fill={color} stroke="#101a1f" strokeWidth=".045" />
        {selected && <text x=".27" y="-.23" fill={color} fontSize=".25" fontFamily="monospace">{state.driver.code}</text>}
      </g>
    })}
  </svg></div>
}

export default function HistoricalScene(props: HistoricalSceneProps) {
  const { race, time, selectedDriver, cameraMode, playing } = props
  const projection = useMemo(() => createProjection(race), [race])
  const selected = getDriverState(race, selectedDriver, time)
  const status = selected.location.status
  const visible = locationVisible(selected)
  const missingCount = race.drivers.map(driver => getDriverState(race, driver.number, time)).filter(row => !locationVisible(row) && !row.retired && row.driver.classifiedLaps !== 0).length
  const gapMessage = selected.retired ? `${selected.driver.code} is retired. No car is drawn after the final competitive lap.`
    : status === 'gap' ? `Location gap for ${selected.driver.code}. Car hidden until the next valid recorded bracket.`
    : status === 'unavailable' ? `No recorded location for ${selected.driver.code} at this time. Car hidden.`
    : status === 'finished' ? `${selected.driver.code} finished. Marker holds the last recorded point before the finish.` : ''
  return <div className="historical-scene-shell">
    <div className="hs-scene-heading"><div><span className="hs-kicker">RECORDED RACE / 2024</span><h3>Silverstone, reconstructed.</h3></div><span className="hs-source-indicator"><i />OPENF1 LOCATION DATA</span></div>
    <div className="hs-scene-stage">
      <SceneFrame label="Historical Silverstone race reconstruction" className={`historical-race-scene camera-${cameraMode}`} camera={OVERHEAD} target={ORIGIN} animated={playing} explicitPlayback={playing} interactive={cameraMode === 'strategist'} motionControl={false} fallback={<Historical2D race={race} time={time} selectedDriver={selectedDriver} onSelectDriver={props.onSelectDriver} projection={projection} />}>
        {({ active }) => <HistoricalWorld {...props} projection={projection} active={active} />}
      </SceneFrame>
      <div className="hs-camera-readout"><span>{CAMERA_LABELS[cameraMode]}</span><b style={{ color: driverColor(selected.driver) }}>{selected.driver.code} <em>#{selectedDriver}</em></b></div>
      {cameraMode === 'onboard' && <div className="hs-onboard-note">VIRTUAL CAMERA · POSITION RECONSTRUCTION<br /><span>Sample interpolation; onboard video and lateral accuracy unavailable.</span></div>}
      {!visible && <div className="hs-location-notice" role="status"><span>LOCATION {selected.retired ? 'ENDED' : 'UNAVAILABLE'}</span><p>{gapMessage}</p>{cameraMode !== 'strategist' && <small>Camera holds its last valid view.</small>}</div>}
    </div>
    <div className="hs-data-strip"><span><i className={`hs-location-dot ${visible ? 'is-valid' : ''}`} />{status === 'interpolated' ? 'INTERPOLATED BETWEEN RECORDED SAMPLES' : status === 'recorded' ? 'RECORDED POSITION' : status === 'finished' ? 'LAST RECORDED FINISH POINT' : 'LOCATION COVERAGE GAP'}</span><span>{race.coverage.sampleInterval.toFixed(1)}s samples <i />{race.coverage.maxInterpolationGap}s maximum interpolation gap</span></div>
    <p className="hs-accuracy-note">Cars follow recorded x/y samples; missing positions are hidden.{missingCount > 0 ? ` ${missingCount} active driver${missingCount === 1 ? '' : 's'} currently lack location coverage.` : ''} Track width, kerbs and scenery are indicative. Road geometry is a smoothed reference-lap trace, with flat elevation.</p>
  </div>
}
