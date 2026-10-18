import { historicalLighting } from '../historical/FormulaCarModel'

/**
 * Illustrative venue character used to dress each reconstructed circuit. These are
 * broad descriptions (street or permanent, desert or parkland, night or day), not
 * surveyed scenery.
 */
export type Venue={
  lighting:'day'|'night'|'twilight'
  street:boolean
  ground:'grass'|'desert'|'urban'
  runoff:'gravel'|'asphalt'|'mixed'
  trees:number
  forest:boolean
  palms:boolean
  city:number
  cityHeight:[number,number]
  hills:number
  sunAzimuth:number
  sunElevation:number
  kerb:[string,string]
  haze:number
}

const base:Venue={lighting:'day',street:false,ground:'grass',runoff:'mixed',trees:1,forest:false,palms:false,city:0,cityHeight:[8,30],hills:6,sunAzimuth:.7,sunElevation:.75,kerb:['#c8202a','#f2f1ea'],haze:1}

export function venueFor(circuit:string,raceName=''):Venue{
  const v=`${circuit} ${raceName}`.toLowerCase(),lighting=historicalLighting(circuit,raceName)
  const venue=(over:Partial<Venue>):Venue=>({...base,lighting,...over})
  if(/monaco/.test(v))return venue({street:true,ground:'urban',runoff:'asphalt',trees:.15,city:1,cityHeight:[14,46],hills:30,sunElevation:.9})
  if(/marina bay|singapore/.test(v))return venue({street:true,ground:'urban',runoff:'asphalt',trees:.35,palms:true,city:1.2,cityHeight:[25,190],hills:0})
  if(/baku|azerbaijan/.test(v))return venue({street:true,ground:'urban',runoff:'asphalt',trees:.1,city:.9,cityHeight:[12,55],hills:4})
  if(/las vegas/.test(v))return venue({street:true,ground:'urban',runoff:'asphalt',trees:.05,palms:true,city:1.1,cityHeight:[30,170],hills:0})
  if(/jeddah|corniche|saudi/.test(v))return venue({street:true,ground:'desert',runoff:'asphalt',trees:.1,palms:true,city:.35,cityHeight:[10,40],hills:0})
  if(/miami/.test(v))return venue({street:true,ground:'urban',runoff:'asphalt',trees:.45,palms:true,city:.35,cityHeight:[12,40],hills:0})
  if(/albert park|melbourne|australia/.test(v))return venue({street:true,ground:'grass',runoff:'gravel',trees:1.1,city:.25,cityHeight:[20,120],hills:0})
  if(/villeneuve|montr|canad/.test(v))return venue({street:true,ground:'grass',runoff:'asphalt',trees:1.2,forest:true,hills:0})
  if(/bahrain|sakhir/.test(v))return venue({ground:'desert',runoff:'asphalt',trees:.08,palms:true,hills:3,haze:1.4})
  if(/yas marina|abu dhabi/.test(v))return venue({ground:'desert',runoff:'asphalt',trees:.12,palms:true,city:.2,cityHeight:[15,45],hills:0,sunElevation:.12,sunAzimuth:2.4})
  if(/lusail|qatar|losail/.test(v))return venue({ground:'desert',runoff:'asphalt',trees:.04,palms:true,hills:0,haze:1.3})
  if(/suzuka|japan/.test(v))return venue({runoff:'gravel',trees:1.5,forest:true,hills:28})
  if(/spa|belgi/.test(v))return venue({runoff:'asphalt',trees:1.9,forest:true,hills:55,haze:1.2})
  if(/monza|ital/.test(v))return venue({runoff:'gravel',trees:1.8,forest:true,hills:2})
  if(/red bull ring|spielberg|austria/.test(v))return venue({runoff:'asphalt',trees:1.2,forest:true,hills:70})
  if(/zandvoort|dutch/.test(v))return venue({ground:'grass',runoff:'gravel',trees:.4,hills:12})
  if(/hungaroring|hungar/.test(v))return venue({runoff:'gravel',trees:.9,hills:24})
  if(/imola|enzo|emilia/.test(v))return venue({runoff:'gravel',trees:1.6,forest:true,hills:18})
  if(/silverstone|british/.test(v))return venue({runoff:'mixed',trees:.7,hills:3,haze:1.1})
  if(/catalunya|barcelona|spain|spanish/.test(v))return venue({runoff:'mixed',trees:.6,hills:16})
  if(/americas|austin|united states/.test(v))return venue({runoff:'asphalt',trees:.5,hills:12})
  if(/rodr[ií]guez|mexico/.test(v))return venue({ground:'urban',runoff:'asphalt',trees:.6,city:.6,cityHeight:[10,40],hills:6})
  if(/interlagos|carlos pace|s[aã]o paulo|brazil/.test(v))return venue({runoff:'asphalt',trees:.8,city:.8,cityHeight:[15,70],hills:20})
  if(/shanghai|china|chinese/.test(v))return venue({runoff:'asphalt',trees:.4,hills:0})
  return venue({})
}
