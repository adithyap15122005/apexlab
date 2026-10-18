/** Enrich all available 2023–2025 archive races with recorded coordinates.
 * Can run beside ingest-archive: it waits until each timing origin is available.
 * node scripts/ingest-all-positions.mjs
 */
import fs from 'node:fs/promises'
import path from 'node:path'
import {fileURLToPath} from 'node:url'
import {spawn} from 'node:child_process'
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),archivePath=path.join(root,'public','history','archive.json')
const priority=['2025-italian','2023-singapore','2024-monaco']
const attempted=new Map()
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms))
let waits=0
while(true){
  const archive=JSON.parse(await fs.readFile(archivePath,'utf8'))
  const pending=archive.races.filter(entry=>entry.sessionKey&&entry.mode!=='recorded-3d'&&(attempted.get(entry.id)??0)<3).sort((a,b)=>{const ai=priority.indexOf(a.id),bi=priority.indexOf(b.id);return(ai<0?100:ai)-(bi<0?100:bi)})
  if(!pending.length)break
  let candidate
  for(const entry of pending){const race=JSON.parse(await fs.readFile(path.join(root,'public','history',entry.id,'race.json'),'utf8'));if(race.events.some(event=>event.type==='start')&&Object.values(race.laps).some(rows=>rows.some(lap=>lap.start!==null&&lap.end!==null))){candidate=entry;break}}
  if(!candidate){if(++waits>180)throw new Error('Timed out waiting for recorded race metadata. Run ingest-archive first.');await sleep(5000);continue}
  waits=0;attempted.set(candidate.id,(attempted.get(candidate.id)??0)+1)
  const featured=priority.includes(candidate.id)
  console.log(JSON.stringify({processing:candidate.id,mode:featured?'location and car telemetry':'locations only',remaining:pending.length}))
  const code=await new Promise(resolve=>{const child=spawn(process.execPath,['--max-old-space-size=4096',path.join(root,'scripts','ingest-recorded-race.mjs'),candidate.id,...featured?[]:['--locations-only']],{cwd:root,stdio:'inherit'});child.on('exit',resolve)})
  if(code!==0)console.log(JSON.stringify({failed:candidate.id,code,attempt:attempted.get(candidate.id)}))
  await sleep(3000)
}
const archive=JSON.parse(await fs.readFile(archivePath,'utf8'))
console.log(JSON.stringify({complete:true,races:archive.races.length,recorded3D:archive.races.filter(entry=>entry.mode==='recorded-3d').length,failed:[...attempted].filter(([,count])=>count>=3)}))
