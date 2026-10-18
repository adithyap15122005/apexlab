import { BufferGeometry, CatmullRomCurve3, ExtrudeGeometry, Float32BufferAttribute, LatheGeometry, Matrix4, Shape, TubeGeometry, Vector2, Vector3 } from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'

/**
 * Original procedural geometry for a 2022-regulation-style Formula car.
 * Units are metres. +Z is forward, +Y up, +X is the car's left. The origin is on the
 * ground midway between the axles. Proportions follow the public technical envelope
 * (5.6 m long, 2.0 m wide, 3.6 m wheelbase, 18-inch wheels); the shapes themselves
 * are original and do not reproduce any constructor's CAD.
 */
export const CAR={
  wheelbase:3.6,frontAxle:1.8,rearAxle:-1.8,
  wheelRadius:.36,rimRadius:.229,frontTyreWidth:.305,rearTyreWidth:.405,
  frontTrack:.8,rearTrack:.775,
  eye:{x:0,y:.83,z:.36},helmet:{x:0,y:.845,z:.3},
  tcam:{x:0,y:1.03,z:-.12},drsPivot:{y:.976,z:-2.653},
} as const
export type CarDetail='high'|'low'
export type WheelSlot={x:number;z:number;width:number;front:boolean}
export type CarGeometrySet={
  paint:BufferGeometry;carbon:BufferGeometry;dark:BufferGeometry;metal:BufferGeometry
  flap:BufferGeometry;helmet:BufferGeometry;visor:BufferGeometry;tcam:BufferGeometry;light:BufferGeometry
  tyre:BufferGeometry;wheelFace:BufferGeometry
  wheels:WheelSlot[]
  dispose:()=>void
}

type Ring={z:number;cx?:number;hw:number;yb:number;yt:number;nTop?:number;nBot?:number;topScale?:number}
const signedPow=(v:number,p:number)=>Math.sign(v)*Math.abs(v)**p

/** Flip winding if the (closed or nearly closed) surface's signed volume is negative. */
function orientOutward(geometry:BufferGeometry){
  const p=geometry.getAttribute('position'),index=geometry.getIndex()
  const count=index?index.count:p.count,read=(i:number)=>index?index.getX(i):i
  let volume=0
  const a=new Vector3(),b=new Vector3(),c=new Vector3()
  for(let i=0;i<count;i+=3){a.fromBufferAttribute(p,read(i));b.fromBufferAttribute(p,read(i+1));c.fromBufferAttribute(p,read(i+2));volume+=a.dot(b.cross(c))}
  if(volume<0){
    if(index){const arr=index.array as Uint16Array|Uint32Array;for(let i=0;i<arr.length;i+=3){const t=arr[i+1];arr[i+1]=arr[i+2];arr[i+2]=t}index.needsUpdate=true}
    else{
      for(const name of Object.keys(geometry.attributes)){
        const attr=geometry.getAttribute(name),size=attr.itemSize,arr=attr.array as Float32Array
        for(let i=0;i<attr.count;i+=3)for(let k=0;k<size;k++){const t=arr[(i+1)*size+k];arr[(i+1)*size+k]=arr[(i+2)*size+k];arr[(i+2)*size+k]=t}
        attr.needsUpdate=true
      }
    }
  }
  geometry.computeVertexNormals()
  return geometry
}

/** Superellipse loft: rounded top, flatter bottom, optional cockpit opening. */
export function loft(rings:Ring[],segments:number,options:{open?:[number,number];caps?:boolean}={}){
  if(rings.length<2||rings.some(r=>![r.z,r.hw,r.yb,r.yt].every(Number.isFinite)||r.hw<=0||r.yt<=r.yb))throw new Error('A body loft needs finite, non-degenerate cross sections.')
  const positions:number[]=[],uvs:number[]=[],indices:number[]=[],stride=segments+1
  const zMax=Math.max(...rings.map(r=>r.z)),zMin=Math.min(...rings.map(r=>r.z))
  rings.forEach(r=>{
    const yc=(r.yb+r.yt)/2,hh=(r.yt-r.yb)/2,cx=r.cx??0
    for(let k=0;k<=segments;k++){
      const theta=-Math.PI/2+k/segments*Math.PI*2,c=Math.cos(theta),s=Math.sin(theta)
      const n=s>=0?r.nTop??2.5:r.nBot??5,scale=1+((r.topScale??1)-1)*Math.max(0,s)**1.4
      positions.push(cx+r.hw*scale*signedPow(c,2/n),yc+hh*signedPow(s,2/n),r.z)
      uvs.push(k/segments,(r.z-zMin)/Math.max(.01,zMax-zMin))
    }
  })
  for(let r=0;r<rings.length-1;r++)for(let k=0;k<segments;k++){
    if(options.open){
      const [lo,hi]=options.open,mid=Math.sin(-Math.PI/2+(k+.5)/segments*Math.PI*2)
      if(Math.min(rings[r].z,rings[r+1].z)>=lo-1e-6&&Math.max(rings[r].z,rings[r+1].z)<=hi+1e-6&&mid>.35)continue
    }
    const a=r*stride+k,b=a+1,c=a+stride,d=c+1
    indices.push(a,b,c,b,d,c)
  }
  if(options.caps!==false)for(const [ring,flip] of [[0,false],[rings.length-1,true]] as const){
    const r=rings[ring],center=positions.length/3
    positions.push(r.cx??0,(r.yb+r.yt)/2,r.z);uvs.push(.5,.5)
    for(let k=0;k<segments;k++){const a=ring*stride+k;if(flip)indices.push(center,a,a+1);else indices.push(center,a+1,a)}
  }
  const geometry=new BufferGeometry()
  geometry.setAttribute('position',new Float32BufferAttribute(positions,3))
  geometry.setAttribute('uv',new Float32BufferAttribute(uvs,2))
  geometry.setIndex(indices)
  return orientOutward(geometry)
}

type Station={x:number;y:number;z:number;chord:number;pitch:number;thickness?:number;camber?:number}
/** A cambered aerofoil swept through span stations. Positive pitch raises the trailing edge (downforce). */
export function wing(stations:Station[],profile=9){
  const loop:[number,number][]=[]
  const thicknessAt=(c:number,t:number)=>5*t*(.2969*Math.sqrt(c)-.126*c-.3516*c*c+.2843*c**3-.1036*c**4)
  for(let side=0;side<2;side++)for(let i=0;i<profile;i++){
    const f=side===0?i/(profile-1):1-i/(profile-1),c=(1-Math.cos(f*Math.PI))/2
    if(side===1&&(i===0||i===profile-1))continue
    loop.push([c,side===0?1:-1])
  }
  const positions:number[]=[],uvs:number[]=[],indices:number[]=[],m=loop.length
  stations.forEach((st,j)=>{
    const t=st.thickness??.1,camber=st.camber??-.05,dir=new Vector3(0,Math.sin(st.pitch),-Math.cos(st.pitch)),up=new Vector3(0,Math.cos(st.pitch),Math.sin(st.pitch))
    for(const [c,side] of loop){
      const h=camber*4*c*(1-c)+side*thicknessAt(c,t)
      positions.push(st.x,st.y+dir.y*c*st.chord+up.y*h*st.chord,st.z+dir.z*c*st.chord+up.z*h*st.chord)
      uvs.push(j/(stations.length-1),c)
    }
  })
  for(let j=0;j<stations.length-1;j++)for(let i=0;i<m;i++){
    const a=j*m+i,b=j*m+(i+1)%m,c=(j+1)*m+i,d=(j+1)*m+(i+1)%m
    indices.push(a,b,c,b,d,c)
  }
  for(const [j,flip] of [[0,false],[stations.length-1,true]] as const){
    for(let i=1;i<m-1;i++){const a=j*m,b=j*m+i,c=j*m+i+1;if(flip)indices.push(a,b,c);else indices.push(a,c,b)}
  }
  const geometry=new BufferGeometry()
  geometry.setAttribute('position',new Float32BufferAttribute(positions,3))
  geometry.setAttribute('uv',new Float32BufferAttribute(uvs,2))
  geometry.setIndex(indices)
  return orientOutward(geometry)
}

/** A flat plate from a 2D outline, extruded `thickness` along its normal. */
function plate(outline:[number,number][],thickness:number,transform:Matrix4,bevel=0){
  const shape=new Shape(outline.map(([a,b])=>new Vector2(a,b)))
  const geometry=new ExtrudeGeometry(shape,{depth:thickness,bevelEnabled:bevel>0,bevelThickness:bevel,bevelSize:bevel,bevelSegments:1,curveSegments:6})
  geometry.translate(0,0,-thickness/2)
  geometry.applyMatrix4(transform)
  return geometry
}
const yzPlane=(x:number)=>new Matrix4().makeBasis(new Vector3(0,0,1),new Vector3(0,1,0),new Vector3(-1,0,0)).setPosition(x,0,0)
const xzPlane=(y:number)=>new Matrix4().makeBasis(new Vector3(1,0,0),new Vector3(0,0,1),new Vector3(0,-1,0)).setPosition(0,y,0)

function tube(points:[number,number,number][],radius:number,radial:number,tubular=0,flatten=1){
  const curve=new CatmullRomCurve3(points.map(p=>new Vector3(...p)),false,'centripetal')
  const geometry=new TubeGeometry(curve,tubular||Math.max(4,points.length*6),radius,radial,false)
  if(flatten!==1){
    // Aerodynamic wishbone fairings: squash the round section in the vertical direction.
    const p=geometry.getAttribute('position'),centre=new Vector3(),v=new Vector3()
    const steps=(geometry.parameters.tubularSegments+1),ring=geometry.parameters.radialSegments+1
    for(let i=0;i<steps;i++){curve.getPointAt(i/(steps-1),centre);for(let k=0;k<ring;k++){const idx=i*ring+k;v.fromBufferAttribute(p,idx).sub(centre);p.setXYZ(idx,centre.x+v.x,centre.y+v.y*flatten,centre.z+v.z)}}
    geometry.computeVertexNormals()
  }
  return geometry
}
function ellipsoid(rx:number,ry:number,rz:number,cx:number,cy:number,cz:number,segments=16){
  const g=loft(Array.from({length:segments/2+1},(_,i)=>{const a=-Math.PI/2+i/(segments/2)*Math.PI,f=Math.max(.02,Math.cos(a));return {z:cz+rz*Math.sin(a),cx,hw:rx*f,yb:cy-ry*f,yt:cy+ry*f,nTop:2,nBot:2}}).reverse(),segments)
  return g
}

/** Box-projected UVs so a carbon weave keeps a consistent density on every part. */
function boxUv(geometry:BufferGeometry,scale:number){
  const p=geometry.getAttribute('position'),n=geometry.getAttribute('normal'),uv=new Float32Array(p.count*2)
  for(let i=0;i<p.count;i++){
    const ax=Math.abs(n.getX(i)),ay=Math.abs(n.getY(i)),az=Math.abs(n.getZ(i))
    const [u,v]=ax>=ay&&ax>=az?[p.getZ(i),p.getY(i)]:ay>=az?[p.getX(i),p.getZ(i)]:[p.getX(i),p.getY(i)]
    uv[i*2]=u*scale;uv[i*2+1]=v*scale
  }
  geometry.setAttribute('uv',new Float32BufferAttribute(uv,2))
  return geometry
}

function merge(parts:BufferGeometry[]){
  const ready=parts.map(part=>{
    const g=part.index?part.toNonIndexed():part
    if(!g.getAttribute('normal'))g.computeVertexNormals()
    if(!g.getAttribute('uv'))g.setAttribute('uv',new Float32BufferAttribute(new Float32Array(g.getAttribute('position').count*2),2))
    for(const name of Object.keys(g.attributes))if(!['position','normal','uv'].includes(name))g.deleteAttribute(name)
    return g
  })
  const merged=mergeGeometries(ready,false)
  parts.forEach(p=>p.dispose());ready.forEach(p=>p.dispose())
  if(!merged)throw new Error('Car geometry could not be merged.')
  merged.computeBoundingBox();merged.computeBoundingSphere()
  return merged
}

export function createF1CarGeometry(detail:CarDetail='high'):CarGeometrySet{
  const high=detail==='high',seg=high?32:16,ws=high?20:8,pf=high?9:5
  const paint:BufferGeometry[]=[],carbon:BufferGeometry[]=[],dark:BufferGeometry[]=[],metal:BufferGeometry[]=[]

  // Monocoque and long, low nose. The cockpit opening leaves the driver exposed.
  paint.push(loft([
    {z:2.87,hw:.05,yb:.2,yt:.27,nTop:2.2,nBot:2.2},
    {z:2.72,hw:.09,yb:.18,yt:.32,nTop:2.4,nBot:3},
    {z:2.4,hw:.125,yb:.16,yt:.39,nTop:2.5,nBot:4},
    {z:2.0,hw:.165,yb:.14,yt:.47,nTop:2.6,nBot:5},
    {z:1.6,hw:.215,yb:.12,yt:.55,nTop:2.7,nBot:6,topScale:.92},
    {z:1.25,hw:.27,yb:.105,yt:.61,nTop:2.8,nBot:6,topScale:.88},
    {z:.95,hw:.33,yb:.1,yt:.655,nTop:3,nBot:6,topScale:.86},
    {z:.6,hw:.38,yb:.1,yt:.675,nTop:3.2,nBot:6,topScale:.88},
    {z:.12,hw:.4,yb:.1,yt:.69,nTop:3.2,nBot:6,topScale:.88},
    {z:-.12,hw:.39,yb:.1,yt:.7,nTop:3,nBot:6,topScale:.88},
  ],seg,{open:[.12,.95]}))
  // Engine cover with airbox, tapering to a narrow coke-bottle rear.
  paint.push(loft([
    {z:.06,hw:.33,yb:.11,yt:.74,nTop:2.6,nBot:6,topScale:.62},
    {z:-.1,hw:.31,yb:.11,yt:.99,nTop:2.2,nBot:6,topScale:.34},
    {z:-.4,hw:.3,yb:.11,yt:.96,nTop:2.3,nBot:6,topScale:.38},
    {z:-.8,hw:.27,yb:.11,yt:.85,nTop:2.4,nBot:6,topScale:.45},
    {z:-1.2,hw:.21,yb:.11,yt:.7,nTop:2.5,nBot:6,topScale:.55},
    {z:-1.55,hw:.15,yb:.13,yt:.57,nTop:2.5,nBot:5,topScale:.6},
    {z:-1.9,hw:.1,yb:.17,yt:.47,nTop:2.5,nBot:4},
    {z:-2.18,hw:.065,yb:.24,yt:.41,nTop:2.4,nBot:3},
  ],seg))
  // Downwash sidepods with an undercut and letterbox inlets.
  for(const side of [1,-1]){
    const pod=loft([
      {z:.46,cx:side*.6,hw:.15,yb:.3,yt:.6,nTop:3.5,nBot:3},
      {z:.3,cx:side*.6,hw:.2,yb:.2,yt:.62,nTop:3.2,nBot:2.4},
      {z:-.05,cx:side*.56,hw:.22,yb:.15,yt:.59,nTop:3,nBot:2.2},
      {z:-.55,cx:side*.48,hw:.2,yb:.13,yt:.49,nTop:2.8,nBot:2.2},
      {z:-1.0,cx:side*.4,hw:.15,yb:.13,yt:.38,nTop:2.6,nBot:2.2},
      {z:-1.35,cx:side*.31,hw:.09,yb:.13,yt:.28,nTop:2.4,nBot:2.2},
      {z:-1.6,cx:side*.22,hw:.04,yb:.15,yt:.21,nTop:2.2,nBot:2.2},
    ],high?24:12)
    paint.push(pod)
    dark.push(plate([[-.14,.33],[.14,.33],[.16,.47],[.14,.58],[-.14,.58],[-.16,.47]],.01,new Matrix4().makeTranslation(side*.6,0,.463)))
  }
  // Shark fin, helmet surround and driver shoulders (team suit colour).
  paint.push(plate([[-.25,.985],[-1.55,.79],[-1.78,.71],[-1.78,.52],[-1.2,.67],[-.6,.86],[-.25,.93]],.012,yzPlane(0)))
  paint.push(ellipsoid(.2,.08,.16,0,.66,.24,high?16:8))

  // Floor, edge wings and diffuser.
  const floorHalf:[number,number][]=[[1.3,.25],[1.15,.58],[.75,.84],[.25,.96],[-.75,.98],[-1.25,.92],[-1.42,.6],[-1.52,.54],[-2.28,.52]]
  const floorOutline:[number,number][]=[...floorHalf.map(([z,x])=>[x,z] as [number,number]),...floorHalf.slice().reverse().map(([z,x])=>[-x,z] as [number,number])]
  carbon.push(plate(floorOutline,.022,xzPlane(.045)))
  for(const side of [1,-1]){
    carbon.push(plate([[.6,0],[.25,.06],[-.8,.07],[-1.2,.05],[-1.2,0]],.012,yzPlane(side*.97).multiply(new Matrix4().makeTranslation(0,.05,0))))
    if(high)carbon.push(plate([[1.25,0],[1.05,.09],[.85,.09],[.95,0]],.01,yzPlane(side*.42).multiply(new Matrix4().makeTranslation(0,.0,0))))
  }
  {
    // Diffuser roof: a plate ramped up from the floor to the rear crash structure.
    const ramp=Math.atan2(.27,.85),length=Math.hypot(.27,.85)
    const basis=new Matrix4().makeBasis(new Vector3(1,0,0),new Vector3(0,Math.sin(ramp),-Math.cos(ramp)),new Vector3(0,Math.cos(ramp),Math.sin(ramp))).setPosition(0,.06,-1.45)
    carbon.push(plate([[-.52,0],[.52,0],[.52,length],[-.52,length]],.012,basis))
  }
  for(const x of high?[-.5,-.26,0,.26,.5]:[-.5,.5])carbon.push(plate([[-1.45,.05],[-2.3,.05],[-2.3,.33],[-1.45,.07]],.01,yzPlane(x)))

  // Front wing: mainplane and three flaps sweep up towards curved endplates.
  const frontElements=[
    {le:2.98,chord:.27,y:.075,rise:.03,pitch:.1,inner:0},
    {le:2.74,chord:.17,y:.135,rise:.07,pitch:.36,inner:.13},
    {le:2.6,chord:.135,y:.19,rise:.1,pitch:.56,inner:.13},
    {le:2.49,chord:.11,y:.25,rise:.12,pitch:.76,inner:.13},
  ]
  for(const e of frontElements){
    const stations:Station[]=[]
    for(let i=0;i<=ws;i++){
      const f=i/ws,x=-.97+f*1.94,span=Math.abs(x),out=Math.max(0,(span-e.inner)/(.97-e.inner))
      if(span<e.inner&&e.inner>0)continue
      stations.push({x,y:e.y+e.rise*out**2.2,z:e.le-.12*out**1.5+(e.inner?0:.04*(1-out)),chord:e.chord*(1-.25*out),pitch:e.pitch+.15*out,thickness:.09})
    }
    if(e.inner>0){
      // Split each flap around the nose so it does not intersect the monocoque.
      const left=stations.filter(s=>s.x>0),right=stations.filter(s=>s.x<0)
      if(left.length>1)carbon.push(wing(left,pf));if(right.length>1)carbon.push(wing(right,pf))
    }else carbon.push(wing(stations,pf))
  }
  for(const side of [1,-1])paint.push(plate([[3.02,.04],[2.42,.04],[2.36,.2],[2.42,.37],[2.62,.42],[2.92,.3],[3.04,.12]],.012,yzPlane(side*.985),.004))
  // Rear wing: spoon-shaped mainplane, DRS flap, swan-neck pylon, beam wing.
  carbon.push(wing(Array.from({length:ws+1},(_,i)=>{const x=-.47+i/ws*.94,t=Math.abs(x)/.47;return {x,y:.79+.06*t**4,z:-2.3-.03*t**2,chord:.29,pitch:.24,thickness:.12,camber:-.07}}),pf))
  for(const side of [1,-1])paint.push(plate([[-2.15,.42],[-2.72,.42],[-2.8,.62],[-2.78,.98],[-2.62,1.02],[-2.3,.98],[-2.12,.8]],.014,yzPlane(side*.48),.004))
  carbon.push(plate([[-2.18,.36],[-2.34,.36],[-2.46,.8],[-2.36,.82],[-2.27,.6]],.016,yzPlane(0)))
  if(high)for(const [y,z,chord] of [[.36,-2.32,.16],[.44,-2.47,.13]] as const)carbon.push(wing(Array.from({length:9},(_,i)=>({x:-.4+i*.1,y,z,chord,pitch:.25,thickness:.11})),pf))
  carbon.push(loft([{z:-1.95,hw:.11,yb:.2,yt:.42,nTop:3,nBot:3},{z:-2.44,hw:.06,yb:.29,yt:.43,nTop:3,nBot:3}],high?12:8))

  // Halo with central pillar, mirrors on stalks, roll hoop inlet.
  const hoop=[[.355,.7,.02],[.36,.84,.16],[.33,.915,.46],[.18,.935,.74],[0,.94,.8],[-.18,.935,.74],[-.33,.915,.46],[-.36,.84,.16],[-.355,.7,.02]] as [number,number,number][]
  carbon.push(tube(hoop,.038,high?10:6,high?48:20))
  carbon.push(tube([[0,.64,.98],[0,.8,.9],[0,.93,.8]],.034,high?8:6,8))
  for(const side of [1,-1]){
    paint.push(ellipsoid(.105,.045,.035,side*.56,.72,.58,high?14:8))
    carbon.push(tube([[side*.33,.62,.6],[side*.45,.69,.59],[side*.53,.71,.58]],.012,5,6))
    metal.push(plate([[-.085,-.032],[.085,-.032],[.085,.032],[-.085,.032]],.004,new Matrix4().makeTranslation(side*.56,.72,.543)))
  }
  dark.push(ellipsoid(.075,.06,.02,0,.89,-.085,high?14:8))

  // Suspension: flattened wishbones, push/pull rods, track rods and driveshafts.
  if(high)for(const side of [1,-1]){
    const s=side
    for(const [a,b,c] of [
      [[s*.2,.55,2.05],[s*.66,.5,1.8],[s*.2,.52,1.5]],
      [[s*.16,.28,2.12],[s*.7,.22,1.82],[s*.16,.26,1.48]],
      [[s*.14,.5,-1.5],[s*.62,.53,-1.8],[s*.14,.48,-2.05]],
      [[s*.12,.22,-1.5],[s*.64,.2,-1.8],[s*.12,.22,-2.05]],
    ] as [number,number,number][][])carbon.push(tube([a,b],.016,6,2,.45),tube([c,b],.016,6,2,.45))
    carbon.push(tube([[s*.66,.48,1.79],[s*.22,.3,1.62]],.013,6,2),tube([[s*.2,.42,1.98],[s*.68,.4,1.92]],.011,6,2))
    carbon.push(tube([[s*.62,.22,-1.78],[s*.2,.48,-1.66]],.013,6,2))
    metal.push(tube([[s*.12,.3,-1.8],[s*.6,.36,-1.8]],.022,8,2))
    // Brake-duct drums sit inboard of each wheel.
    carbon.push(loft([{z:.055,cx:0,hw:.13,yb:-.13,yt:.13,nTop:2,nBot:2},{z:-.055,cx:0,hw:.13,yb:-.13,yt:.13,nTop:2,nBot:2}],12).applyMatrix4(new Matrix4().makeRotationY(Math.PI/2).setPosition(s*.57,.36,1.8)))
  }
  // Exhaust tailpipe.
  metal.push(loft([{z:-2.2,hw:.048,yb:.395,yt:.49,nTop:2,nBot:2},{z:-2.38,hw:.045,yb:.4,yt:.485,nTop:2,nBot:2}],high?16:8,{caps:false}))

  // DRS flap, modelled with its trailing-edge pivot at the origin so it can rotate.
  const flap=wing(Array.from({length:ws+1},(_,i)=>{const x=-.465+i/ws*.93,t=Math.abs(x)/.465;return {x,y:.86+.05*t**4-CAR.drsPivot.y,z:-2.49-CAR.drsPivot.z,chord:.2,pitch:.62,thickness:.1,camber:-.06}}),pf)
  boxUv(flap,3.2)

  // Helmet, visor, T-camera and rain light.
  const helmet=ellipsoid(.125,.13,.15,CAR.helmet.x,CAR.helmet.y,CAR.helmet.z,high?20:10)
  const visor=loft([{z:CAR.helmet.z+.155,hw:.08,yb:CAR.helmet.y-.005,yt:CAR.helmet.y+.05,nTop:2.2,nBot:2.2},{z:CAR.helmet.z+.11,hw:.122,yb:CAR.helmet.y-.025,yt:CAR.helmet.y+.065,nTop:2.2,nBot:2.2}],high?16:8)
  const tcam=loft([{z:CAR.tcam.z+.06,hw:.06,yb:CAR.tcam.y-.025,yt:CAR.tcam.y+.025,nTop:3,nBot:3},{z:CAR.tcam.z-.06,hw:.05,yb:CAR.tcam.y-.02,yt:CAR.tcam.y+.022,nTop:3,nBot:3}],8)
  const light=loft([{z:-2.43,hw:.075,yb:.335,yt:.385,nTop:4,nBot:4},{z:-2.45,hw:.075,yb:.335,yt:.385,nTop:4,nBot:4}],8)

  // Wheels: one unit-width tyre and wheel-face disc, scaled per axle.
  const tyreProfile:[number,number][]=[]
  {
    const R=CAR.wheelRadius,r=CAR.rimRadius+.004,shoulder=.075
    tyreProfile.push([r,-.47])
    for(let i=0;i<=6;i++){const a=i/6*Math.PI/2;tyreProfile.push([r+(R-shoulder-r)*Math.sin(a)*.98+.004,-.47-.03*Math.sin(a*2)])}
    for(let i=0;i<=6;i++){const a=i/6*Math.PI/2;tyreProfile.push([R-shoulder+shoulder*Math.sin(a),-.5+.11*(1-Math.cos(a))])}
    for(let i=0;i<=6;i++){const a=i/6*Math.PI/2;tyreProfile.push([R-shoulder*(1-Math.cos(a)),.39+.11*Math.sin(a)])}
    for(let i=0;i<=6;i++){const a=i/6*Math.PI/2;tyreProfile.push([R-shoulder-(R-shoulder-r)*Math.sin(a)*.98+.004,.47+.03*Math.sin(a*2)])}
    tyreProfile.push([r,.47])
  }
  const tyre=new LatheGeometry(tyreProfile.map(([x,y])=>new Vector2(x,y)),high?40:20)
  tyre.rotateZ(-Math.PI/2)
  orientOutward(tyre)
  const wheelFace=(()=>{
    // Polar-mapped discs on both faces (u = angle, v = radius) so markings rotate visibly.
    const rings=8,around=high?48:24,p:number[]=[],uv:number[]=[],idx:number[]=[]
    for(const side of [1,-1]){
      const base=p.length/3
      for(let r=0;r<=rings;r++)for(let a=0;a<=around;a++){
        const radius=.015+r/rings*(CAR.wheelRadius-.022),angle=a/around*Math.PI*2,dish=-.02*(1-radius/CAR.rimRadius)*(radius<CAR.rimRadius?1:0)
        // Run the angle the other way on the right-hand face so sidewall text reads correctly from outside.
        p.push(side*(.5+.004+dish),Math.sin(angle)*radius,Math.cos(angle)*radius);uv.push(side>0?a/around:1-a/around,radius/CAR.wheelRadius)
      }
      for(let r=0;r<rings;r++)for(let a=0;a<around;a++){const i=base+r*(around+1)+a,j=i+around+1;if(side>0)idx.push(i,i+1,j,i+1,j+1,j);else idx.push(i,j,i+1,i+1,j,j+1)}
    }
    const g=new BufferGeometry();g.setAttribute('position',new Float32BufferAttribute(p,3));g.setAttribute('uv',new Float32BufferAttribute(uv,2));g.setIndex(idx);g.computeVertexNormals();return g
  })()

  const carbonMerged=merge(carbon)
  boxUv(carbonMerged,3.2)
  const set:CarGeometrySet={
    paint:merge(paint),carbon:carbonMerged,dark:merge(dark),metal:merge(metal),
    flap,helmet,visor,tcam,light,tyre,wheelFace,
    wheels:[
      {x:CAR.frontTrack,z:CAR.frontAxle,width:CAR.frontTyreWidth,front:true},{x:-CAR.frontTrack,z:CAR.frontAxle,width:CAR.frontTyreWidth,front:true},
      {x:CAR.rearTrack,z:CAR.rearAxle,width:CAR.rearTyreWidth,front:false},{x:-CAR.rearTrack,z:CAR.rearAxle,width:CAR.rearTyreWidth,front:false},
    ],
    dispose:()=>{for(const g of [set.paint,set.carbon,set.dark,set.metal,set.flap,set.helmet,set.visor,set.tcam,set.light,set.tyre,set.wheelFace])g.dispose()},
  }
  return set
}
