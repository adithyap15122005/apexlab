import { useEffect, useRef, useState } from 'react'
import { DRIVERS, raceAtLap, TOTAL_LAPS } from '../engine/race'

const TRACK = 'M156 265 C112 265 97 241 111 208 L147 128 Q160 100 191 104 L277 120 Q294 122 304 103 L322 66 Q334 43 357 54 L404 77 Q424 89 416 112 L398 159 Q391 178 410 188 L508 237 Q535 250 521 273 L484 329 Q472 346 452 334 L388 298 Q370 288 355 308 L320 355 Q302 379 281 357 L233 307 Q219 291 199 284 Z'

export default function Circuit({ lap = 18, hero = false, driverId = DRIVERS[0].id, safetyCar = false, onSelect }: {lap?:number;hero?:boolean;driverId?:string;safetyCar?:boolean;onSelect?:(id:string)=>void}) {
  const pathRef = useRef<SVGPathElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const [paused, setPaused] = useState(false)
  const [visible, setVisible] = useState(true)
  const [points, setPoints] = useState<{x:number;y:number}[]>([])
  const standings = raceAtLap(lap, safetyCar)
  useEffect(() => {
    const path = pathRef.current
    if (!path) return
    const length = path.getTotalLength()
    setPoints(DRIVERS.map((driver) => {
      const row = standings.find(r => r.driver.id === driver.id)!
      const p = path.getPointAtLength(((0.21 + lap / TOTAL_LAPS * 0.64 - row.gap / 100) % 1 + 1) % 1 * length)
      return { x:p.x,y:p.y }
    }))
  // standings derive completely from lap and safetyCar.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lap, safetyCar])
  useEffect(()=>{
    const node=containerRef.current
    if(!hero||!node)return
    const observer=new IntersectionObserver(entries=>setVisible(entries[0].isIntersecting))
    const visibility=()=>setVisible(!document.hidden)
    observer.observe(node);document.addEventListener('visibilitychange',visibility)
    return()=>{observer.disconnect();document.removeEventListener('visibilitychange',visibility)}
  },[hero])
  return <div ref={containerRef} className={`circuit ${hero ? 'circuit-hero' : ''}`}>
    <svg viewBox="0 0 640 420" role="img" aria-label={hero?`Original Apex Circuit, animated race illustration with end-of-lap ${lap} timing`:`Original Apex Circuit, schematic driver positions at the end of lap ${lap}`}>
      <defs>
        <pattern id={hero?'hero-grid':'race-grid'} width="28" height="28" patternUnits="userSpaceOnUse"><path d="M28 0H0V28" fill="none" stroke="#fff" strokeOpacity=".028" /></pattern>
        <linearGradient id={hero?'hero-line':'race-line'} x1="0" y1="1" x2="1" y2="0"><stop stopColor="#d7ff43" stopOpacity=".25"/><stop offset=".6" stopColor="#d7ff43"/><stop offset="1" stopColor="#e7ff9a"/></linearGradient>
      </defs>
      <rect width="640" height="420" fill={`url(#${hero?'hero-grid':'race-grid'})`}/>
      <g className="circuit-contours" fill="none" stroke="#46513c" strokeOpacity=".14"><path d={TRACK} strokeWidth="90"/><path d={TRACK} strokeWidth="62"/><path d={TRACK} strokeWidth="120" strokeDasharray="1 9"/></g>
      <path d={TRACK} fill="none" stroke="#22282d" strokeWidth="17" strokeLinejoin="round"/>
      <path d={TRACK} fill="none" stroke="#3b4336" strokeWidth="19" strokeDasharray="2 8" strokeOpacity=".6"/>
      <path ref={pathRef} id={hero?'hero-track':'race-track'} d={TRACK} fill="none" stroke={`url(#${hero?'hero-line':'race-line'})`} strokeWidth="3" className="racing-line"/>
      <path d="M156 265 Q174 244 194 257 L239 293" fill="none" stroke="#768070" strokeWidth="2" strokeDasharray="3 5"/>
      <g transform="translate(169 255) rotate(20)"><rect width="12" height="5" fill="#e8ece1"/><path d="M0 0h3v2H0zm6 0h3v2H6zm-3 2h3v3H3zm6 0h3v3H9z" fill="#111"/></g>
      <g className="track-labels" fill="#6c756e" fontSize="9"><text x="197" y="94">SECTOR 01</text><text x="468" y="204">SECTOR 02</text><text x="207" y="340">SECTOR 03</text><text x="128" y="298">START / FINISH</text><text x="434" y="115">T07</text><text x="331" y="401">T12</text></g>
      <g transform="translate(260 205)" className="circuit-center"><text textAnchor="middle" fill="#7d8777" fontSize="8" letterSpacing="3">APEX CIRCUIT</text><text textAnchor="middle" y="22" fill="#c5cbbf" fontSize="15" fontWeight="500">5.24 <tspan fill="#737d6c" fontSize="9">KM</tspan></text></g>
      {DRIVERS.map((driver,i)=><g key={driver.id} className={hero?'hero-driver':''} style={hero?{offsetPath:`path('${TRACK}')`,offsetDistance:`${26-i*7}%`,animationDelay:`${-i*2.3}s`,animationPlayState:paused||!visible?'paused':'running'}:undefined} transform={hero?undefined:`translate(${points[i]?.x??156} ${points[i]?.y??265})`}>
        <g role={onSelect?'button':undefined} tabIndex={onSelect?0:undefined} aria-label={`Select ${driver.name}`} onClick={()=>onSelect?.(driver.id)} onKeyDown={e=>{if(e.key==='Enter'||e.key===' ')onSelect?.(driver.id)}} style={{cursor:onSelect?'pointer':undefined}}>
          <circle r="17" fill={driver.color} opacity={driver.id===driverId?.toString()?'.1':'.04'}/><circle r="7" fill={driver.color} stroke="#10150d" strokeWidth="3"/><circle r="2" fill="#fff"/>
          {!hero&&<text x="13" y="-13" fill={driver.color} fontSize="10">{driver.short}</text>}
        </g>
      </g>)}
      <g transform="translate(577 332)" stroke="#75806b" fill="none"><path d="M0 29V0m-4 6 4-6 4 6"/><text y="-9" x="-3" fill="#75806b" stroke="none" fontSize="9">N</text></g>
    </svg>
    {hero&&<><button className="circuit-motion-control" onClick={()=>setPaused(!paused)} aria-pressed={paused}>{paused?'Resume motion':'Pause motion'}</button><div className="track-callout callout-one" aria-label={`Kai Sato, position ${standings.find(r=>r.driver.id===DRIVERS[0].id)!.position}, ${standings.find(r=>r.driver.id===DRIVERS[0].id)!.gap.toFixed(3)} seconds behind the leader`}><span className="tiny-dot"/> KSA <b>+{standings.find(r=>r.driver.id===DRIVERS[0].id)!.gap.toFixed(3)}</b><span className="callout-line"/></div><div className="track-callout callout-two"><span className="tiny-dot cyan"/> LMO <b>UNDERCUT THREAT</b></div><div className="track-coordinate mono">APEX CIRCUIT / ORIGINAL FICTIONAL TRACK</div></>}
  </div>
}
