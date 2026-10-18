import photographs from './people-data.json'

export type DriverPortrait = {url:string;alt:string;credit:string;license:string;licenseUrl:string;source:string;description:string;photoDate:string;changes:string}
const portraits:Record<string,DriverPortrait> = photographs
const aliases:Record<string,string>={SCH:'MSC',ZHO:'ZHO',ZHOUGUANYU:'ZHO',GAB:'BOR',KIM:'ANT',KIMI:'ANT'}

/** Licensed, credited portraits identify a person; they do not claim race-day photography. */
export function getDriverPortrait(code:string,name?:string):DriverPortrait|null {
 const key=code.toUpperCase().trim()
 if(portraits[aliases[key]??key])return portraits[aliases[key]??key]
 if(name){const clean=(value:string)=>value.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z]/g,'');const term=clean(name);return Object.values(portraits).find(p=>clean(p.alt)===term||clean(p.alt).endsWith(term))??null}
 return null
}

export type TeamIdentity={name:string;color:string;url:string;initials:string}
const teams:TeamIdentity[]=[
 {name:'Mercedes',color:'#27f4d2',url:'https://www.mercedesamgf1.com/',initials:'AMG'},
 {name:'Ferrari',color:'#e80020',url:'https://www.ferrari.com/en-EN/formula1',initials:'SF'},
 {name:'McLaren',color:'#ff8000',url:'https://www.mclaren.com/racing/',initials:'MCL'},
 {name:'Red Bull Racing',color:'#3671c6',url:'https://www.redbullracing.com/',initials:'RBR'},
 {name:'Aston Martin',color:'#229971',url:'https://www.astonmartinf1.com/',initials:'AM'},
 {name:'Alpine',color:'#0093cc',url:'https://www.alpinef1.com/',initials:'ALP'},
 {name:'Williams',color:'#64c4ff',url:'https://www.williamsf1.com/',initials:'W'},
 {name:'Haas F1 Team',color:'#b6babd',url:'https://www.haasf1team.com/',initials:'H'},
 {name:'Sauber',color:'#52e252',url:'https://www.sauber-group.com/',initials:'S'},
 {name:'Racing Bulls',color:'#6692ff',url:'https://www.visacashapprb.com/',initials:'RB'},
]

/** Return the identity for the historical team string supplied by race data. */
export function getTeamIdentity(team:string):TeamIdentity|null {
 const t=team.toLowerCase()
 if(!t.trim())return null
 if(/alpha.?tauri|toro.?rosso/.test(t))return {...teams[9],name:team,color:'#2b4562',initials:/toro/.test(t)?'STR':'AT'}
 if(/alfa romeo/.test(t))return {...teams[8],name:team,color:'#9a1c2e',initials:'AR'}
 if(/^rb$|racing bulls|rb f1/.test(t))return {...teams[9],name:team}
 if(/kick|sauber/.test(t))return {...teams[8],name:team}
 if(/renault/.test(t))return {...teams[5],name:team,color:'#ffd800',initials:'R'}
 if(/racing point/.test(t))return {...teams[4],name:team,color:'#f596c8',initials:'RP'}
 // Constructor names can include an engine supplier, e.g. "McLaren Mercedes".
 // Pick the first named constructor in the label, not the array's first match.
 const tokens=[/mercedes/,/ferrari/,/mclaren/,/red\s?bull/,/aston\s?martin/,/alpine/,/williams/,/haas/,/sauber/,/racing\s?bulls/]
 const matches=tokens.map((pattern,index)=>({team:teams[index],offset:t.search(pattern)})).filter(match=>match.offset>=0)
 matches.sort((a,b)=>a.offset-b.offset)
 return matches[0]?.team??null
}

export const PORTRAIT_NOTES='Photographs are hosted by Wikimedia Commons, with individual photographer and license links. Some photos were taken outside the selected season; team affiliation always comes from the selected race data. The site displays a portrait crop of each source photograph.'
export const DRIVER_PHOTOGRAPH_COUNT=Object.keys(portraits).length
