import { useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { useFrame } from '@react-three/fiber'
import { ArrowLeft, ArrowRight, ArrowUpRight, Check, Gamepad2, Star } from 'lucide-react'
import type { Group } from 'three'
import SceneFrame from '../three/SceneFrame'
import StudioCar from '../race3d/StudioCar'
import { LESSONS } from './Lessons'
import RaceEngineerGame from './RaceEngineerGame'
import { TyreBadge } from './visuals'
import './StrategySchool.css'

type Progress={done:string[];champion:boolean}
const readProgress=():Progress=>{try{const v=JSON.parse(localStorage.getItem('apexlab-school')??'{}');return {done:Array.isArray(v.done)?v.done:[],champion:!!v.champion}}catch{return {done:[],champion:false}}}
function rank(progress:Progress){
  const n=progress.done.length
  if(progress.champion&&n>=LESSONS.length)return {name:'Champion',icon:'🏆'}
  return n>=6?{name:'Race Engineer',icon:'🎧'}:n>=3?{name:'Strategist',icon:'🧠'}:n>=1?{name:'Rookie',icon:'🔰'}:{name:'Spectator',icon:'👀'}
}
const GLOSSARY:[string,string,string][]=[
  ['🔧','Pit stop','Driving into the pit lane so the crew can change your tyres.'],['🛣️','Pit lane','A slow road next to the track where the team garages are.'],
  ['📻','Box, box!','What engineers say on the radio to tell a driver to come in for a pit stop.'],['🛞','Compound','The type of tyre rubber: Soft, Medium, Hard, Intermediate or Wet.'],
  ['📏','Stint','The laps a driver does on one set of tyres, between pit stops.'],['📉','Degradation','Tyres slowly wearing out and getting slower, lap after lap.'],
  ['🧗','The cliff','When old tyres suddenly lose lots of grip and get much slower.'],['✂️','Undercut','Pitting before a rival to jump ahead using fresh tyres.'],
  ['⏳','Overcut','Staying out longer than a rival and coming out ahead.'],['🚨','Safety car','A car that leads the race slowly after a crash, so marshals can work safely.'],
  ['💨','DRS','A flap on the rear wing that opens to help overtaking on straights.'],['🌬️','Slipstream','Following closely so the car ahead blocks the air for you.'],
]

function HeroCar({active,motion}:{active:boolean;motion:boolean}){
  const group=useRef<Group>(null)
  useFrame((_,delta)=>{if(group.current&&active&&motion)group.current.rotation.y+=Math.min(delta,.05)*.35})
  return <group ref={group} rotation={[0,-.7,0]} scale={.92}><StudioCar livery={{primary:'#0b1418',secondary:'#1d2a2f',accent:'#d7ff43',helmet:'#d7ff43'}} compound="#ff3b30" spin={14} steer={.18}/></group>
}

export default function StrategySchool({onHome,onArchive,onPractice}:{onHome:()=>void;onArchive:()=>void;onPractice:()=>void}){
  const [progress,setProgress]=useState(readProgress)
  const [lesson,setLesson]=useState(0)
  const [answer,setAnswer]=useState<number|null>(null)
  const [celebrate,setCelebrate]=useState(false)
  const stage=useRef<HTMLElement>(null),gameRef=useRef<HTMLElement>(null)
  useEffect(()=>{try{localStorage.setItem('apexlab-school',JSON.stringify(progress))}catch{/* Progress is optional. */}},[progress])
  useEffect(()=>{setAnswer(null);setCelebrate(false)},[lesson])
  const current=LESSONS[lesson],Lesson=current.Component,me=rank(progress)
  const open=(i:number)=>{setLesson(i);stage.current?.scrollIntoView({behavior:'smooth',block:'start'})}
  const choose=(i:number)=>{
    setAnswer(i)
    if(i===current.quiz.answer&&!progress.done.includes(current.id)){setProgress(p=>({...p,done:[...p.done,current.id]}));setCelebrate(true)}
  }
  return <div className="sc-app">
    <header className="sc-header">
      <button className="sc-home" onClick={onHome} aria-label="ApexLab home"><span className="sc-logo">A</span>APEX<span>LAB</span></button>
      <span className="sc-header-title">Strategy School</span>
      <nav><button onClick={onArchive}>Real races <ArrowUpRight size={13}/></button><button onClick={onPractice}>Practice studio</button></nav>
      <div className="sc-rank" aria-label={`Your rank: ${me.name}, ${progress.done.length} of ${LESSONS.length} lessons`}><span>{me.icon}</span><div><b>{me.name}</b><span>{LESSONS.map(l=><Star key={l.id} size={11} fill={progress.done.includes(l.id)?'#ffd60a':'none'} color={progress.done.includes(l.id)?'#ffd60a':'#5d6e66'}/>)}</span></div></div>
    </header>

    <section className="sc-hero">
      <div className="sc-hero-copy">
        <span className="sc-pill">🏎️ FOR EVERYONE · AGES 8 AND UP</span>
        <h1>How do you <em>win</em> a Formula 1 race?</h1>
        <p>It's not only about driving fast. Teams win with clever <b>strategy</b>: which tyres to use, and when to stop for new ones. Learn the secrets in 7 short lessons — then be the race engineer yourself!</p>
        <div className="sc-hero-cta"><button className="sc-cta" onClick={()=>open(0)}>Start lesson 1 <ArrowRight size={18}/></button><button className="sc-ghost big" onClick={()=>gameRef.current?.scrollIntoView({behavior:'smooth'})}><Gamepad2 size={18}/>Play the game</button></div>
        <div className="sc-hero-tyres">{(['soft','medium','hard','inter','wet'] as const).map(t=><TyreBadge key={t} tyre={t} size={42}/>)}</div>
      </div>
      <div className="sc-hero-car"><SceneFrame label="Strategy School race car" className="sc-hero-scene" camera={[5.6,2.4,5.6]} target={[0,.45,0]} fallback={<div className="sc-hero-fallback">🏎️</div>}>{({active,motion})=><HeroCar active={active} motion={motion}/>}</SceneFrame></div>
    </section>

    <section className="sc-map" aria-label="Lessons">
      {LESSONS.map((l,i)=><button key={l.id} className={`sc-map-card ${i===lesson?'is-active':''} ${progress.done.includes(l.id)?'is-done':''}`} onClick={()=>open(i)}>
        <span className="sc-map-num">{progress.done.includes(l.id)?<Check size={14}/>:i+1}</span><span className="sc-map-emoji">{l.emoji}</span><b>{l.title}</b><small>{l.short}</small>
      </button>)}
      <button className="sc-map-card is-game" onClick={()=>gameRef.current?.scrollIntoView({behavior:'smooth'})}><span className="sc-map-num"><Gamepad2 size={14}/></span><span className="sc-map-emoji">🎮</span><b>Be the Race Engineer</b><small>Make the calls in a real-time race.</small></button>
    </section>

    <section className="sc-stage" ref={stage} aria-labelledby="sc-lesson-title">
      <div className="sc-stage-head"><span className="sc-pill">LESSON {lesson+1} OF {LESSONS.length}</span><h2 id="sc-lesson-title"><span>{current.emoji}</span>{current.title}</h2></div>
      <AnimatePresence mode="wait"><motion.div key={current.id} initial={{opacity:0,y:12}} animate={{opacity:1,y:0}} exit={{opacity:0,y:-8}} transition={{duration:.25}}><Lesson/></motion.div></AnimatePresence>
      <div className="sc-quiz">
        <span className="sc-pill">QUICK QUESTION</span><h3>{current.quiz.q}</h3>
        <div className="sc-quiz-options">{current.quiz.options.map((o,i)=><button key={o} className={answer===i?(i===current.quiz.answer?'is-right':'is-wrong'):''} onClick={()=>choose(i)}><span>{String.fromCharCode(65+i)}</span>{o}</button>)}</div>
        {answer!==null&&<p className={`sc-quiz-feedback ${answer===current.quiz.answer?'is-right':'is-wrong'}`}>{answer===current.quiz.answer?'⭐ Correct! ':'Not quite — '}{current.quiz.why}</p>}
        <AnimatePresence>{celebrate&&<motion.div className="sc-celebrate" initial={{scale:.6,opacity:0}} animate={{scale:1,opacity:1}} exit={{opacity:0}}>🎉 Star earned! You are now: <b>{rank(progress).icon} {rank(progress).name}</b></motion.div>}</AnimatePresence>
      </div>
      <div className="sc-stage-nav"><button className="sc-ghost" disabled={lesson===0} onClick={()=>open(lesson-1)}><ArrowLeft size={16}/>Previous</button>{lesson<LESSONS.length-1?<button className="sc-cta" onClick={()=>open(lesson+1)}>Next: {LESSONS[lesson+1].title} <ArrowRight size={16}/></button>:<button className="sc-cta" onClick={()=>gameRef.current?.scrollIntoView({behavior:'smooth'})}>Now play the game! <Gamepad2 size={16}/></button>}</div>
    </section>

    <section className="sc-game-section" ref={gameRef} aria-labelledby="sc-game-title">
      <div className="sc-stage-head"><span className="sc-pill">🎮 THE BIG TEST</span><h2 id="sc-game-title">Be the Race Engineer</h2><p>You are on the radio to your driver. Pick the tyres and press <b>BOX BOX</b> at the perfect moment. Can you beat four rival teams?</p></div>
      <RaceEngineerGame onWin={()=>setProgress(p=>p.champion?p:{...p,champion:true})}/>
    </section>

    <section className="sc-glossary" aria-labelledby="sc-words">
      <h2 id="sc-words">Words to know</h2>
      <div>{GLOSSARY.map(([icon,word,meaning])=><div key={word}><span>{icon}</span><b>{word}</b><p>{meaning}</p></div>)}</div>
    </section>

    <section className="sc-real">
      <div><span className="sc-pill">NOW SEE IT FOR REAL</span><h2>Spot an undercut in a real Grand Prix.</h2><p>Open any race in the archive. The <b>Tyre strategies</b> page tells the story of how it was won and finds real undercuts and overcuts — and the 3D replay has a <b>Race Coach</b> that explains every pit stop as it happens.</p></div>
      <button className="sc-cta" onClick={onArchive}>Explore real races <ArrowUpRight size={18}/></button>
    </section>
    <footer className="sc-footer">Strategy School uses a simple, made-up race model so the ideas are easy to see. Real F1 numbers change from track to track. Independent educational project — no official Formula 1 affiliation.</footer>
  </div>
}
