import { BufferGeometry, Float32BufferAttribute } from 'three'
import { pathFrame, projectToPath, wrap, type TrackGuide } from '../../history/trackGuide'
import type { Venue } from './venues'

/**
 * Builds an original, illustrative circuit around the recorded reference line: road
 * surface, kerbs, run-off, barriers, terrain and scenery placements. Road width,
 * kerbs and scenery are reconstructions; only the centre line and its elevation come
 * from the recorded data.
 */
export type BarrierKind='armco'|'tecpro'|'wall'|'pitwall'
export type Placement={x:number;y:number;z:number;yaw:number}
export type TreePlacement={x:number;y:number;z:number;scale:number;kind:0|1|2;tint:number}
export type Box={x:number;y:number;z:number;yaw:number;w:number;d:number;h:number}
export type CircuitLayout={
  road:BufferGeometry;kerbs:BufferGeometry;verge:BufferGeometry;pitRoad:BufferGeometry|null
  barriers:Partial<Record<BarrierKind,BufferGeometry>>;fence:BufferGeometry|null
  terrain:BufferGeometry;terrainSize:number;baseY:number;center:{x:number;z:number}
  trees:TreePlacement[];grandstands:Box[];garages:Placement[];lights:Placement[];marshals:Placement[];buildings:Box[];bridges:(Placement&{span:number})[]
  gantry:Placement&{span:number};polesSide:number;gridFirst:number
  heightAt:(x:number,z:number)=>number
  dispose:()=>void
}
export type Quality={trees:number;buildings:number}

const smoothstep=(a:number,b:number,v:number)=>{const t=Math.max(0,Math.min(1,(v-a)/(b-a)));return t*t*(3-2*t)}
function rng(seed:number){let s=seed>>>0||1;return()=>{s=(s*1664525+1013904223)>>>0;return s/4294967296}}
function valueNoise(seed:number){
  const random=rng(seed),table=new Float32Array(256).map(()=>random()),perm=Array.from({length:256},(_,i)=>i).sort(()=>random()-.5)
  const at=(x:number,y:number)=>table[(perm[(x&255)]+y&255)&255]
  return (x:number,y:number)=>{const ix=Math.floor(x),iy=Math.floor(y),fx=x-ix,fy=y-iy,sx=fx*fx*(3-2*fx),sy=fy*fy*(3-2*fy);return (at(ix,iy)*(1-sx)+at(ix+1,iy)*sx)*(1-sy)+(at(ix,iy+1)*(1-sx)+at(ix+1,iy+1)*sx)*sy}
}
function runningMax(values:Float32Array,radius:number,closed:boolean){
  const n=values.length,out=new Float32Array(n)
  for(let i=0;i<n;i++){let m=-Infinity;for(let k=-radius;k<=radius;k++){let j=i+k;if(closed)j=(j%n+n)%n;else if(j<0||j>=n)continue;m=Math.max(m,values[j])}out[i]=m}
  return out
}
function runningMin(values:Float32Array,radius:number,closed:boolean){
  const negated=values.map(v=>-v);return runningMax(negated,radius,closed).map(v=>-v)
}
function blur(values:Float32Array,radius:number,closed:boolean){
  const n=values.length,out=new Float32Array(n)
  for(let i=0;i<n;i++){let sum=0,total=0;for(let k=-radius;k<=radius;k++){let j=i+k;if(closed)j=(j%n+n)%n;else if(j<0||j>=n)continue;const w=radius+1-Math.abs(k);sum+=values[j]*w;total+=w}out[i]=sum/total}
  return out
}

/** Grid of track samples for fast "how far is the nearest road" queries. */
class RoadIndex{
  cells=new Map<number,number[]>();xs:number[]=[];zs:number[]=[];ys:number[]=[];hw:number[]=[];size=30
  add(x:number,z:number,y:number,hw:number){const i=this.xs.length;this.xs.push(x);this.zs.push(z);this.ys.push(y);this.hw.push(hw);const key=this.key(Math.floor(x/this.size),Math.floor(z/this.size));const list=this.cells.get(key);if(list)list.push(i);else this.cells.set(key,[i])}
  key(cx:number,cz:number){return (cx+32768)*65536+(cz+32768)}
  /** Distance to the nearest road edge (negative inside a road), with that point's elevation. */
  nearest(x:number,z:number,maxRadius=600){
    const cx=Math.floor(x/this.size),cz=Math.floor(z/this.size)
    let best=Infinity,y=0
    for(let ring=0;ring*this.size<=maxRadius+this.size;ring++){
      for(let ix=cx-ring;ix<=cx+ring;ix++)for(let iz=cz-ring;iz<=cz+ring;iz++){
        if(Math.max(Math.abs(ix-cx),Math.abs(iz-cz))!==ring)continue
        const list=this.cells.get(this.key(ix,iz));if(!list)continue
        for(const i of list){const d=Math.hypot(this.xs[i]-x,this.zs[i]-z)-this.hw[i];if(d<best){best=d;y=this.ys[i]}}
      }
      if(best<(ring-1)*this.size)break
    }
    return {distance:best,y}
  }
}

/** Uniform grid of indexed points for radius queries. */
class PointIndex{
  cells=new Map<number,number[]>();xs:number[]=[];zs:number[]=[];ids:number[]=[];size:number
  constructor(size=30){this.size=size}
  private key(cx:number,cz:number){return (cx+32768)*65536+(cz+32768)}
  add(x:number,z:number,id:number){const k=this.key(Math.floor(x/this.size),Math.floor(z/this.size)),i=this.xs.length;this.xs.push(x);this.zs.push(z);this.ids.push(id);const l=this.cells.get(k);if(l)l.push(i);else this.cells.set(k,[i])}
  query(x:number,z:number,radius:number,visit:(id:number,x:number,z:number)=>void){
    const r=Math.ceil(radius/this.size),cx=Math.floor(x/this.size),cz=Math.floor(z/this.size)
    for(let ix=cx-r;ix<=cx+r;ix++)for(let iz=cz-r;iz<=cz+r;iz++){const l=this.cells.get(this.key(ix,iz));if(l)for(const i of l)visit(this.ids[i],this.xs[i],this.zs[i])}
  }
}

type GridBuild={positions:number[];normals?:number[];uvs:number[];extra:Record<string,{size:number;data:number[]}>;indices:number[]}
const newBuild=():GridBuild=>({positions:[],uvs:[],extra:{},indices:[]})
function pushExtra(build:GridBuild,name:string,size:number,...values:number[]){(build.extra[name]??={size,data:[]}).data.push(...values)}
/** Connect `rows` × `cols` vertices (row = along the track, col = left-increasing lateral) with upward faces. */
function stitch(build:GridBuild,base:number,rows:number,cols:number){
  for(let r=0;r<rows-1;r++)for(let c=0;c<cols-1;c++){
    const a=base+r*cols+c,b=a+1,c2=a+cols,d=c2+1
    build.indices.push(a,c2,b,b,c2,d)
  }
}
function finish(build:GridBuild,computeNormals=true){
  const g=new BufferGeometry()
  g.setAttribute('position',new Float32BufferAttribute(build.positions,3))
  g.setAttribute('uv',new Float32BufferAttribute(build.uvs,2))
  for(const [name,{size,data}] of Object.entries(build.extra))g.setAttribute(name,new Float32BufferAttribute(data,size))
  g.setIndex(build.indices)
  if(build.normals)g.setAttribute('normal',new Float32BufferAttribute(build.normals,3))
  else if(computeNormals)g.computeVertexNormals()
  g.computeBoundingSphere()
  return g
}

export function buildCircuit(guide:TrackGuide,venue:Venue,quality:Quality,seed=1):CircuitLayout{
  const path=guide.track,n=path.count,hw=path.halfWidth,step=path.step,L=path.length
  const random=rng(seed*977+n)
  const nx=(i:number)=>path.tz[i],nz=(i:number)=>-path.tx[i]
  const kAbs=path.curvature.map(Math.abs)
  // Corner masks. A left turn (κ > 0) has its inside on the left (+1) side.
  const corner=runningMax(kAbs.map(k=>smoothstep(1/420,1/170,k)),Math.round(14/step),true)
  const insideLeft=new Float32Array(n),insideRight=new Float32Array(n)
  for(let i=0;i<n;i++){const left=path.curvature[i]>0?1:0;insideLeft[i]=corner[i]*left;insideRight[i]=corner[i]*(1-left)}
  const shift=Math.round(18/step)
  const kerbLeft=new Uint8Array(n),kerbRight=new Uint8Array(n)
  for(let i=0;i<n;i++){
    const ahead=(i-shift+n)%n
    // Inside kerbs at the apex, outside kerbs on the exit (a little further round).
    kerbLeft[i]=insideLeft[i]>.5||insideRight[ahead]>.5?1:0
    kerbRight[i]=insideRight[i]>.5||insideLeft[ahead]>.5?1:0
  }

  // Barrier offsets: generous run-off on the outside of corners, walls close on street circuits,
  // and never past the midpoint to another section of track or the pit lane.
  const centres=new PointIndex(30),pits=new PointIndex(30)
  for(let i=0;i<n;i+=2)centres.add(path.x[i]+nx(i)*path.offset[i],path.z[i]+nz(i)*path.offset[i],i)
  if(guide.pit)for(let i=0;i<guide.pit.count;i+=2)pits.add(guide.pit.x[i],guide.pit.z[i],i)
  const barrier=[new Float32Array(n),new Float32Array(n)],limit=[new Float32Array(n),new Float32Array(n)],pitSide=[new Uint8Array(n),new Uint8Array(n)]
  for(const [sideIndex,side] of [[0,1],[1,-1]] as const){
    for(let i=0;i<n;i++){
      const inside=side>0?insideLeft[i]:insideRight[i],outside=corner[i]-inside
      let want=venue.street?hw+1.4+outside*5:hw+(venue.runoff==='asphalt'?11:9)+outside*(18+24*smoothstep(1/300,1/90,kAbs[i]))+inside*2
      if(Math.abs(wrap(i*step,L))<220)want=Math.max(want,hw+(venue.street?2.5:13))
      barrier[sideIndex][i]=want;limit[sideIndex][i]=Infinity
    }
    for(let i=0;i<n;i+=2){
      const off=path.offset[i],cap=barrier[sideIndex][i]+12,cx=path.x[i]+nx(i)*off,cz=path.z[i]+nz(i)*off
      let trackFree=Infinity,pitFree=Infinity
      centres.query(cx,cz,cap+hw+4,(j,x,z)=>{
        if(Math.abs(wrap((j-i)*step,L))<=70)return
        const dx=x-cx,dz=z-cz,along=dx*path.tx[i]+dz*path.tz[i],lat=(dx*nx(i)+dz*nz(i))*side
        if(lat>0&&Math.abs(along)<hw+5)trackFree=Math.min(trackFree,lat-2*hw)
      })
      if(guide.pit){const p=guide.pit;pits.query(cx,cz,cap+p.halfWidth+4,(_j,x,z)=>{
        const dx=x-cx,dz=z-cz,along=dx*path.tx[i]+dz*path.tz[i],lat=(dx*nx(i)+dz*nz(i))*side
        if(lat>0&&Math.abs(along)<p.halfWidth+5)pitFree=Math.min(pitFree,lat-hw-p.halfWidth)
      })}
      if(pitFree<trackFree&&pitFree<cap-hw){limit[sideIndex][i]=hw+Math.max(1.2,pitFree/2);pitSide[sideIndex][i]=1}
      else if(trackFree<cap-hw)limit[sideIndex][i]=hw+Math.max(.9,trackFree/2)
      if(i+1<n){limit[sideIndex][i+1]=limit[sideIndex][i];pitSide[sideIndex][i+1]=pitSide[sideIndex][i]}
    }
    const hard=runningMin(limit[sideIndex],Math.round(10/step),true),soft=blur(barrier[sideIndex],Math.round(16/step),true)
    for(let i=0;i<n;i++)barrier[sideIndex][i]=Math.min(soft[i],hard[i])
    barrier[sideIndex].set(blur(barrier[sideIndex],2,true))
    pitSide[sideIndex].set(runningMax(Float32Array.from(pitSide[sideIndex]),Math.round(6/step),true).map(v=>v>0?1:0))
  }
  const kindAt=(sideIndex:number,i:number):BarrierKind=>{
    if(pitSide[sideIndex][i])return 'pitwall'
    if(venue.street)return 'wall'
    const inside=sideIndex===0?insideLeft[i]:insideRight[i]
    return corner[i]-inside>.4?'tecpro':'armco'
  }

  // Road: cambered asphalt with lateral coordinate (w), lap distance (s) and racing-line data.
  const road=newBuild(),lateral=[-1,-.96,-.66,-.33,0,.33,.66,.96,1]
  const brakeZone=new Float32Array(n)
  for(let i=0;i<n;i++){let m=0;for(let a=20;a<=150;a+=10){const j=(i+Math.round(a/step))%n;m=Math.max(m,smoothstep(1/250,1/60,kAbs[j])*(1-a/170))}brakeZone[i]=m}
  for(let r=0;r<=n;r++){
    const i=r%n,s=r*step,off=path.offset[i]
    for(const f of lateral){
      const w=f*hw,x=path.x[i]+nx(i)*(off+w),z=path.z[i]+nz(i)*(off+w),y=path.y[i]+.035*(1-f*f)
      road.positions.push(x,y,z);road.uvs.push(w/4.2,s/4.2)
      pushExtra(road,'road',4,w,s,-off,brakeZone[i])
    }
  }
  stitch(road,0,n+1,lateral.length)

  // Kerbs: raised, striped strips beyond the road edge.
  const kerbs=newBuild(),profile:[number,number][]=[[-.08,.0],[.12,.04],[.5,.058],[.9,.04],[1.25,.006]]
  for(const [side,flags] of [[1,kerbLeft],[-1,kerbRight]] as const){
    for(let start=0;start<n;){
      if(!flags[start]){start++;continue}
      let end=start;while(end<n&&flags[end])end++
      const base=kerbs.positions.length/3,rows=end-start+1
      for(let r=0;r<rows;r++){
        const i=(start+r)%n,taper=Math.min(1,r/2,(rows-1-r)/2),off=path.offset[i]
        const cols=side>0?profile:[...profile].reverse()
        for(const [o,h] of cols){
          const w=off+side*(hw+o),x=path.x[i]+nx(i)*w,z=path.z[i]+nz(i)*w
          kerbs.positions.push(x,path.y[i]+h*taper+.004,z);kerbs.uvs.push(o/1.25,(start+r)*step)
        }
      }
      stitch(kerbs,base,rows,profile.length)
      start=end
    }
  }

  // Verge and run-off on both sides: asphalt shoulder, then grass, gravel or tarmac run-off.
  const verge=newBuild()
  for(const [sideIndex,side] of [[0,1],[1,-1]] as const){
    const base=verge.positions.length/3
    for(let r=0;r<=n;r++){
      const i=r%n,off=path.offset[i],B=barrier[sideIndex][i],inside=sideIndex===0?insideLeft[i]:insideRight[i],outside=Math.max(0,corner[i]-inside)
      const runoff=venue.street?2:venue.runoff==='asphalt'?2:venue.runoff==='gravel'?(outside>.35?1:0):(outside>.35?(kAbs[i]>1/120?1:2):0)
      // A doubled column at the shoulder edge keeps the asphalt/grass boundary crisp.
      const offsets=[hw-.02,hw+1.55,hw+1.65,hw+1.65+(B-hw-1.65)*.5,B+.6]
      const cols=side>0?offsets:[...offsets].reverse()
      for(const o of cols){
        const w=off+side*o,x=path.x[i]+nx(i)*w,z=path.z[i]+nz(i)*w,shoulder=o<hw+1.6
        verge.positions.push(x,path.y[i]-.02-(o>hw+2?.03:0),z);verge.uvs.push(x/9,z/9)
        const surface=shoulder?2:runoff
        pushExtra(verge,'surface',3,surface===0?1:0,surface===1?1:0,surface===2?1:0)
        pushExtra(verge,'track',2,o-hw,r*step)
      }
    }
    stitch(verge,base,n+1,5)
  }

  // Barriers: three-sided ribbons, grouped by kind.
  const height:Record<BarrierKind,number>={armco:.95,tecpro:1.05,wall:1.15,pitwall:1.25}
  const thickness:Record<BarrierKind,number>={armco:.3,tecpro:1.0,wall:.55,pitwall:.5}
  const barrierBuilds:Partial<Record<BarrierKind,GridBuild>>={},fence=newBuild()
  for(const [sideIndex,side] of [[0,1],[1,-1]] as const){
    for(let start=0;start<n;){
      const kind=kindAt(sideIndex,start)
      let end=start;while(end<n&&kindAt(sideIndex,end)===kind)end++
      const build=barrierBuilds[kind]??=newBuild(),base=build.positions.length/3,rows=Math.min(n,end+1)-start+(end>=n?1:0)
      let along=0,px=0,pz=0
      for(let r=0;r<rows;r++){
        const i=(start+r)%n,off=path.offset[i],B=barrier[sideIndex][i],y=path.y[i]-.05
        const inner=off+side*B,outer=off+side*(B+thickness[kind]),xi=path.x[i]+nx(i)*inner,zi=path.z[i]+nz(i)*inner,xo=path.x[i]+nx(i)*outer,zo=path.z[i]+nz(i)*outer
        if(r)along+=Math.hypot(xi-px,zi-pz);px=xi;pz=zi
        const h=height[kind]
        // Columns: inner foot, inner top, outer top, outer foot.
        const cols:[number,number,number,number][]=[[xi,y,zi,0],[xi,y+h,zi,1],[xo,y+h,zo,1.15],[xo,y,zo,2.15]]
        for(const [x,yy,z,v] of side>0?cols.slice().reverse():cols){build.positions.push(x,yy,z);build.uvs.push(side*along/(kind==='tecpro'?4:kind==='armco'?4:8),v)}
      }
      stitch(build,base,rows,4)
      if(kind==='wall'||kind==='pitwall'||(kind==='armco'&&Math.abs(wrap(start*step,L))<260)){
        const fb=fence.positions.length/3;let a2=0,qx=0,qz=0
        for(let r=0;r<rows;r++){
          const i=(start+r)%n,off=path.offset[i],B=barrier[sideIndex][i]+thickness[kind]*.5,w=off+side*B,x=path.x[i]+nx(i)*w,z=path.z[i]+nz(i)*w,y=path.y[i]+height[kind]-.05
          if(r)a2+=Math.hypot(x-qx,z-qz);qx=x;qz=z
          for(const [yy,v] of side>0?[[y+3.4,1],[y,0]]:[[y,0],[y+3.4,1]])fence.positions.push(x,yy,z),fence.uvs.push(a2/1.4,v*2.4)
        }
        stitch(fence,fb,rows,2)
      }
      start=end
    }
  }

  // Pit lane road.
  let pitRoad:BufferGeometry|null=null
  if(guide.pit){
    const p=guide.pit,build=newBuild(),cols=[-1,-.4,.4,1]
    for(let i=0;i<p.count;i++){
      for(const f of cols){const w=f*(p.halfWidth+.6),x=p.x[i]+p.tz[i]*w,z=p.z[i]-p.tx[i]*w;build.positions.push(x,p.y[i]+.02,z);build.uvs.push(w/4.2,i*p.step/4.2);pushExtra(build,'road',4,w,i*p.step,0,0)}
    }
    stitch(build,0,p.count,cols.length)
    pitRoad=finish(build)
  }

  // Terrain: follows recorded elevation near the track, rolls into venue-scale hills further out.
  const index=new RoadIndex()
  for(let i=0;i<n;i+=3)index.add(path.x[i]+nx(i)*path.offset[i],path.z[i]+nz(i)*path.offset[i],path.y[i],Math.max(barrier[0][i],barrier[1][i])+.8)
  if(guide.pit)for(let i=0;i<guide.pit.count;i+=3)index.add(guide.pit.x[i],guide.pit.z[i],guide.pit.y[i],guide.pit.halfWidth+3)
  let minX=Infinity,maxX=-Infinity,minZ=Infinity,maxZ=-Infinity,meanY=0,minY=Infinity
  for(let i=0;i<n;i++){minX=Math.min(minX,path.x[i]);maxX=Math.max(maxX,path.x[i]);minZ=Math.min(minZ,path.z[i]);maxZ=Math.max(maxZ,path.z[i]);meanY+=path.y[i]/n;minY=Math.min(minY,path.y[i])}
  // The surrounding ground plane must sit below the lowest part of hilly circuits (Monaco, Spa, Suzuka).
  const baseY=minY-4
  const extent=Math.max(maxX-minX,maxZ-minZ)/2+900,centerX=(minX+maxX)/2,centerZ=(minZ+maxZ)/2
  const res=Math.min(240,Math.max(110,Math.round(extent*2/15))),cell=extent*2/res,hills=valueNoise(seed+5),side1=res+1
  // Distance field to the nearest road/barrier zone (chamfer transform), carrying its elevation.
  const field=new Float32Array(side1*side1).fill(1e9),fieldY=new Float32Array(side1*side1).fill(meanY)
  const x0=centerX-extent,z0=centerZ-extent
  for(let k=0;k<index.xs.length;k++){
    const px=index.xs[k],pz=index.zs[k],reach=index.hw[k]+cell*2,gx0=Math.max(0,Math.floor((px-reach-x0)/cell)),gx1=Math.min(res,Math.ceil((px+reach-x0)/cell)),gz0=Math.max(0,Math.floor((pz-reach-z0)/cell)),gz1=Math.min(res,Math.ceil((pz+reach-z0)/cell))
    for(let gz=gz0;gz<=gz1;gz++)for(let gx=gx0;gx<=gx1;gx++){const d=Math.hypot(x0+gx*cell-px,z0+gz*cell-pz)-index.hw[k],c=gz*side1+gx;if(d<field[c]){field[c]=d;fieldY[c]=index.ys[k]}}
  }
  const diagonal=cell*Math.SQRT2
  for(const [from,to,dir] of [[0,side1,1],[side1-1,-1,-1]] as const){
    for(let gz=from;gz!==to;gz+=dir)for(let gx=from;gx!==to;gx+=dir){
      const c=gz*side1+gx
      for(const [ox,oz,w] of [[-dir,0,cell],[0,-dir,cell],[-dir,-dir,diagonal],[dir,-dir,diagonal]] as const){
        const ax=gx+ox,az=gz+oz;if(ax<0||az<0||ax>res||az>res)continue
        const o=az*side1+ax;if(field[o]+w<field[c]){field[c]=field[o]+w;fieldY[c]=fieldY[o]}
      }
    }
  }
  const distanceAt=(x:number,z:number)=>{const gx=Math.round((x-x0)/cell),gz=Math.round((z-z0)/cell);return gx<0||gz<0||gx>res||gz>res?1e9:field[gz*side1+gx]}
  const terrainHeights=new Float32Array(side1*side1)
  const terrain=newBuild(),colors:number[]=[]
  for(let gz=0;gz<=res;gz++)for(let gx=0;gx<=res;gx++){
    const x=x0+gx*cell,z=z0+gz*cell,c=gz*side1+gx,distance=field[c],nearY=fieldY[c]
    const far=meanY+venue.hills*((hills(x/420,z/420)-.45)*1.4+(hills(x/170+9,z/170+3)-.5)*.35)*smoothstep(150,900,distance)
    const blend=smoothstep(8,320,distance)
    const edge=Math.min(gx,gz,res-gx,res-gz)*cell,toPlane=smoothstep(220,0,edge)
    const y=(distance<4?nearY-.35:(nearY-.35)*(1-blend)+far*blend)*(1-toPlane)+baseY*toPlane
    terrainHeights[c]=y
    terrain.positions.push(x,y,z);terrain.uvs.push(x/14,z/14)
    const tone=.82+hills(x/60+40,z/60-11)*.32
    colors.push(tone,tone,tone)
  }
  for(let gz=0;gz<res;gz++)for(let gx=0;gx<res;gx++){const a=gz*side1+gx,b=a+1,c=a+side1,d=c+1;terrain.indices.push(a,c,b,b,c,d)}
  terrain.extra.color={size:3,data:colors}
  const terrainGeometry=finish(terrain)
  const heightAt=(x:number,z:number)=>{
    const fx=Math.max(0,Math.min(res-1e-3,(x-x0)/cell)),fz=Math.max(0,Math.min(res-1e-3,(z-z0)/cell)),ix=Math.floor(fx),iz=Math.floor(fz),tx=fx-ix,tz=fz-iz
    const h=(a:number,b:number)=>terrainHeights[b*side1+a]
    return (h(ix,iz)*(1-tx)+h(ix+1,iz)*tx)*(1-tz)+(h(ix,iz+1)*(1-tx)+h(ix+1,iz+1)*tx)*tz
  }
  const clearOfRoads=(x:number,z:number,radius:number)=>index.nearest(x,z,radius+40).distance>radius

  // Start/finish gantry and grid orientation (pole on the inside of the first corner).
  let firstTurn=0;for(let i=0;i<Math.round(700/step);i++)firstTurn+=path.curvature[i%n]
  const g0=pathFrame(path,0)
  const gantry={x:g0.x+g0.tz*g0.offset,y:g0.y,z:g0.z-g0.tx*g0.offset,yaw:Math.atan2(g0.tx,g0.tz),span:hw*2+5}

  // Grandstands along the main straight (away from the pit lane) and at the slowest corners.
  const grandstands:Box[]=[],placeStand=(i:number,sideIndex:0|1,depthExtra:number)=>{
    const side=sideIndex===0?1:-1,off=path.offset[i],w=off+side*(barrier[sideIndex][i]+depthExtra+8),x=path.x[i]+nx(i)*w,z=path.z[i]+nz(i)*w
    const yaw=Math.atan2(path.tx[i],path.tz[i])+(side>0?-Math.PI/2:Math.PI/2)
    if(!clearOfRoads(x,z,9))return
    grandstands.push({x,y:heightAt(x,z),z,yaw,w:14,d:14,h:9+random()*5})
  }
  const mainSide:0|1=pitSide[0][0]?1:pitSide[1][0]?0:1
  for(let s=-300;s<=300;s+=14)placeStand(((Math.round(s/step))%n+n)%n,mainSide,venue.street?3:4)
  const corners:{i:number;k:number}[]=[]
  for(let i=0;i<n;i++)if(kAbs[i]>1/120&&kAbs[i]>=kAbs[(i+1)%n]&&kAbs[i]>=kAbs[(i-1+n)%n])corners.push({i,k:kAbs[i]})
  corners.sort((a,b)=>b.k-a.k)
  const used:number[]=[]
  for(const c of corners){
    if(used.length>=5)break
    if(used.some(u=>Math.abs(wrap((u-c.i)*step,L))<400)||Math.abs(wrap(c.i*step,L))<350)continue
    used.push(c.i)
    const outsideIndex:0|1=path.curvature[c.i]>0?1:0
    for(let k=-3;k<=3;k++)placeStand(((c.i+Math.round(k*14/step))%n+n)%n,outsideIndex,2)
  }

  // Pit garages on the far side of the pit lane.
  const garages:Placement[]=[]
  if(guide.pit){
    const p=guide.pit
    for(let s=60;s<p.length-60;s+=13){
      const f=pathFrame(p,s)
      if(Math.abs(f.curvature)>1/300)continue
      const near=projectToPath(path,f.x,f.z,f.y,80),side=near?Math.sign(((f.x-path.x[Math.floor(near.s/step)%n])*f.tz-(f.z-path.z[Math.floor(near.s/step)%n])*f.tx))||1:1
      const w=side*(p.halfWidth+9),x=f.x+f.tz*w,z=f.z-f.tx*w
      if(!clearOfRoads(x,z,2))continue
      garages.push({x,y:f.y,z,yaw:Math.atan2(f.tx,f.tz)+(side>0?-Math.PI/2:Math.PI/2)})
    }
  }

  // Advertising bridges over the two longest straights.
  const bridges:(Placement&{span:number})[]=[]
  {
    const runs:{start:number;length:number}[]=[]
    for(let i=0;i<n;){if(kAbs[i]<1/900){let j=i;while(j<n&&kAbs[j]<1/900)j++;runs.push({start:i,length:j-i});i=j}else i++}
    runs.sort((a,b)=>b.length-a.length)
    for(const run of runs.slice(0,3)){
      if(run.length*step<380||bridges.length>=2)continue
      const i=run.start+Math.floor(run.length*.62)
      if(Math.abs(wrap(i*step,L))<300)continue
      const f=pathFrame(path,i*step)
      bridges.push({x:f.x+f.tz*f.offset,y:f.y,z:f.z-f.tx*f.offset,yaw:Math.atan2(f.tx,f.tz),span:hw*2+10})
    }
  }

  // Floodlight towers (night) and marshal posts.
  const lights:Placement[]=[],marshals:Placement[]=[]
  for(let i=0,k=0;i<n;i+=Math.round(42/step),k++){
    const sideIndex=(k%2) as 0|1,side=sideIndex===0?1:-1,w=path.offset[i]+side*(barrier[sideIndex][i]+3.2),x=path.x[i]+nx(i)*w,z=path.z[i]+nz(i)*w
    if(clearOfRoads(x,z,1.5))lights.push({x,y:path.y[i],z,yaw:Math.atan2(path.tx[i],path.tz[i])+(side>0?-Math.PI/2:Math.PI/2)})
  }
  for(let i=0,k=0;i<n;i+=Math.round(260/step),k++){
    const sideIndex=(k%2) as 0|1,side=sideIndex===0?1:-1,w=path.offset[i]+side*(barrier[sideIndex][i]+1.3),x=path.x[i]+nx(i)*w,z=path.z[i]+nz(i)*w
    marshals.push({x,y:path.y[i],z,yaw:Math.atan2(path.tx[i],path.tz[i])+(side>0?-Math.PI/2:Math.PI/2)})
  }

  // Trees (forest clusters), palms and city blocks.
  const trees:TreePlacement[]=[],forest=valueNoise(seed+17),maxTrees=Math.round(9000*quality.trees*Math.min(1.6,venue.trees))
  const spacing=venue.forest?10:15
  for(let z=centerZ-extent+40;z<centerZ+extent-40&&trees.length<maxTrees;z+=spacing)for(let x=centerX-extent+40;x<centerX+extent-40&&trees.length<maxTrees;x+=spacing){
    const jx=x+(random()-.5)*spacing*.9,jz=z+(random()-.5)*spacing*.9
    const density=venue.trees*(venue.forest?smoothstep(.35,.62,forest(jx/180,jz/180))*1.25:smoothstep(.5,.75,forest(jx/140,jz/140)))
    if(random()>density)continue
    const distance=distanceAt(jx,jz)
    if(distance<18||distance>950)continue
    const kind:0|1|2=venue.palms&&random()<.75?2:venue.forest&&random()<.6?0:random()<.35?0:1
    trees.push({x:jx,y:heightAt(jx,jz),z:jz,scale:.75+random()*.7,kind,tint:random()})
  }
  // A rough line of trees fringing the circuit adds depth even at sparse venues.
  if(venue.trees>.2)for(let i=0;i<n&&trees.length<maxTrees;i+=Math.round(24/step)){
    for(const [sideIndex,side] of [[0,1],[1,-1]] as const){
      if(random()>Math.min(1,venue.trees*.7))continue
      const w=path.offset[i]+side*(barrier[sideIndex][i]+14+random()*30),x=path.x[i]+nx(i)*w,z=path.z[i]+nz(i)*w
      if(!clearOfRoads(x,z,10))continue
      trees.push({x,y:heightAt(x,z),z,scale:.7+random()*.6,kind:venue.palms?2:random()<.5?0:1,tint:random()})
    }
  }
  const buildings:Box[]=[]
  if(venue.city>0){
    const maxBuildings=Math.round(900*quality.buildings*venue.city)
    for(let z=centerZ-extent+60;z<centerZ+extent-60&&buildings.length<maxBuildings;z+=34)for(let x=centerX-extent+60;x<centerX+extent-60&&buildings.length<maxBuildings;x+=34){
      const jx=x+(random()-.5)*14,jz=z+(random()-.5)*14,distance=distanceAt(jx,jz)
      if(distance<26||distance>620||random()>venue.city*.8)continue
      const w=12+random()*20,d=12+random()*20
      if(distance<Math.hypot(w,d)/2+8)continue
      const [lo,hi]=venue.cityHeight,distanceFactor=smoothstep(30,450,distance)
      // Tall towers stand back from the circuit; low blocks line the walls.
      const h=Math.min(lo+(hi-lo)*Math.pow(random(),2.2)*(.35+.65*distanceFactor),18+distance*.55)
      buildings.push({x:jx,y:heightAt(jx,jz)-.5,z:jz,yaw:Math.round(random()*4)*Math.PI/2+(random()-.5)*.2,w,d,h})
    }
  }

  const geometries={road:finish(road),kerbs:finish(kerbs),verge:finish(verge),fence:fence.positions.length?finish(fence):null}
  const barrierGeometries:Partial<Record<BarrierKind,BufferGeometry>>={}
  for(const [kind,build] of Object.entries(barrierBuilds) as [BarrierKind,GridBuild][])barrierGeometries[kind]=finish(build)
  return {
    ...geometries,pitRoad,barriers:barrierGeometries,terrain:terrainGeometry,terrainSize:extent,baseY,center:{x:centerX,z:centerZ},
    trees,grandstands,garages,lights,marshals,buildings,bridges,gantry,polesSide:firstTurn>0?1:-1,gridFirst:-10,heightAt,
    dispose:()=>{[geometries.road,geometries.kerbs,geometries.verge,geometries.fence,pitRoad,terrainGeometry,...Object.values(barrierGeometries)].forEach(g=>g?.dispose())},
  }
}
