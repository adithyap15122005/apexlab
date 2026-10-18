/** Download the publicly available, 14-day-delayed Jolpica CSV export.
 * Small ranged reads avoid long stalled S3 responses; no authentication or
 * paid/latest endpoint is used. Temporary signed redirect URLs are never logged.
 */
import fs from 'node:fs/promises'
import path from 'node:path'
import {fileURLToPath} from 'node:url'
import {createHash} from 'node:crypto'
const cache=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..','..','historical-ingestion','archive')
await fs.mkdir(cache,{recursive:true})
const headers={'User-Agent':'ApexLabArchive/2.0 (noncommercial historical education)'}
const overview=await(await fetch('https://api.jolpi.ca/data/dumps/download/',{headers})).json()
const info=overview.delayed_dumps.csv
const source='https://api.jolpi.ca/data/dumps/download/delayed/?dump_type=csv'
const redirect=await fetch(source,{headers,redirect:'manual'})
const destination=redirect.headers.get('location')
if(!destination)throw new Error('The public delayed CSV download did not return its download redirect.')
const size=info.file_size,chunk=1024*1024,count=Math.ceil(size/chunk),parts=[]
let next=0
async function worker(){
  while(next<count){
    const index=next++,start=index*chunk,end=Math.min(size-1,start+chunk-1),filename=path.join(cache,`jolpica-dump-part-${index}`)
    let buffer
    try{buffer=await fs.readFile(filename);if(buffer.length!==end-start+1)buffer=null}catch{}
    if(!buffer){
      for(let attempt=0;attempt<5;attempt++){
        try{const response=await fetch(destination,{headers:{Range:`bytes=${start}-${end}`},signal:AbortSignal.timeout(45000)});if(response.status!==206)throw new Error(`Public dump range: HTTP ${response.status}`);buffer=Buffer.from(await response.arrayBuffer());if(buffer.length!==end-start+1)throw new Error('Incomplete dump range');await fs.writeFile(filename,buffer);break}catch(error){if(attempt===4)throw error;await new Promise(resolve=>setTimeout(resolve,1000*(attempt+1)))}
      }
    }
    parts[index]=buffer
    console.log(JSON.stringify({downloadedPart:index+1,totalParts:count,bytes:buffer.length}))
  }
}
await Promise.all([worker(),worker(),worker(),worker()])
const body=Buffer.concat(parts),sha256=createHash('sha256').update(body).digest('hex')
if(sha256!==info.file_hash)throw new Error('The public CSV dump checksum did not match its publisher manifest.')
await fs.writeFile(path.join(cache,'jolpica-delayed.zip'),body)
await fs.writeFile(path.join(cache,'jolpica-dump-manifest.json'),JSON.stringify({source,uploadedAt:info.uploaded_at,retrievedAt:new Date().toISOString(),bytes:body.length,sha256},null,2))
console.log(JSON.stringify({complete:true,bytes:body.length,sha256}))
