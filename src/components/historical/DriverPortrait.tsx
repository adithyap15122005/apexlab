import { useState } from 'react'
import { getDriverPortrait } from '../../history/people'

export default function DriverPortrait({code,name,className='',credit=false}:{code:string;name:string;className?:string;credit?:boolean}){
  const photo=getDriverPortrait(code,name)
  const [failedUrl,setFailedUrl]=useState<string|null>(null)
  return <figure className={`driver-portrait ${className}`}><div className="driver-portrait-image">{photo&&failedUrl!==photo.url?<img src={photo.url} alt={photo.alt} loading="lazy" decoding="async" referrerPolicy="no-referrer" onError={()=>setFailedUrl(photo.url)}/>:<span aria-label={`${name}, portrait unavailable`}>{code}</span>}</div>{credit&&photo&&<figcaption><a href={photo.source} target="_blank" rel="noreferrer">{photo.credit} · {photo.license}</a><small>Archive portrait; photograph date and clothing may differ from this race.</small></figcaption>}</figure>
}
