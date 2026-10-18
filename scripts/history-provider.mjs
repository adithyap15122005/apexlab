/** A cross-process provider slot: metadata and coordinate ingestors share quotas. */
import fs from 'node:fs/promises'
import path from 'node:path'
import {fileURLToPath} from 'node:url'
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..','..','historical-ingestion','archive','rate-limits')
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms))
export async function providerSlot(provider){
  await fs.mkdir(root,{recursive:true})
  const lock=path.join(root,`${provider}.lock`),stamp=path.join(root,`${provider}.timestamp`),spacing=provider==='openf1'?2250:provider==='jolpica'?400:500
  while(true){
    try{await fs.mkdir(lock);break}catch(error){
      if(error.code!=='EEXIST')throw error
      try{const stat=await fs.stat(lock);if(Date.now()-stat.mtimeMs>15000)await fs.rmdir(lock)}catch{}
      await sleep(100)
    }
  }
  try{
    let previous=0
    try{previous=Number(await fs.readFile(stamp,'utf8'))}catch{}
    await sleep(Math.max(0,spacing-(Date.now()-previous)))
    await fs.writeFile(stamp,String(Date.now()))
  }finally{await fs.rmdir(lock)}
}
