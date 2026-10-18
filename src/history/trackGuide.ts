import type { HistoricalRace, LocationSample } from './types'

/**
 * Track-guided motion for the 3D replay.
 *
 * OpenF1 positions arrive at roughly one sample per second, i.e. up to ~85 m apart at
 * racing speed. Joining them with straight chords makes cars cut every corner and snap
 * their heading once a second. Here every recorded sample is projected onto the
 * circuit's recorded reference line (progress `s` + lateral offset `d`). Between two
 * recorded samples the car advances along that line with a monotone cubic in time, so
 * it follows the real track curvature and accelerates smoothly. Recorded progress is
 * preserved exactly at every sample time; lateral placement (which the source cannot
 * resolve reliably) is lightly smoothed and kept on the road. This is presentation
 * only: timing, classification and the raw records are never changed.
 */

/** Raw provider x/y/z (decimetres in OpenF1) → world metres. X east, Z −north, Y up. */
export type TrackFrame={unitsPerMeter:number;cx:number;cy:number;z0:number}
export type GuidePath={
  closed:boolean;length:number;step:number;count:number;halfWidth:number
  x:Float32Array;y:Float32Array;z:Float32Array
  /** Horizontal unit tangent. The left normal is (tz, −tx). */
  tx:Float32Array;tz:Float32Array
  /** Signed horizontal curvature, 1/m. Positive turns left. */
  curvature:Float32Array
  /** Road centre relative to the reference line, metres, positive left. */
  offset:Float32Array
  cells:Map<number,number[]>
}
export type TrackGuide={frame:TrackFrame;track:GuidePath;pit:GuidePath|null}
export type DriverMotion={
  t:Float64Array
  /** 0 = free (Cartesian), 1 = circuit, 2 = pit lane. */
  mode:Uint8Array
  S:Float64Array;D:Float32Array
  /** Presentation position of each sample: guided where matched, otherwise the recorded point. */
  wx:Float32Array;wy:Float32Array;wz:Float32Array
  /** 1 where the bracket i→i+1 implies an impossible speed (a provider glitch). */
  invalid:Uint8Array
}
export type MotionPose={
  x:number;y:number;z:number
  /** Rotation about world Y that maps a +Z-forward model onto the direction of travel. */
  yaw:number
  grade:number;speed:number;accel:number;yawRate:number;latAccel:number
  s:number;d:number;mode:number;curvature:number;roadOffset:number;halfWidth:number
}

const CELL=16

export function emptyPose():MotionPose{
  return {x:0,y:0,z:0,yaw:0,grade:0,speed:0,accel:0,yawRate:0,latAccel:0,s:0,d:0,mode:0,curvature:0,roadOffset:0,halfWidth:7}
}

export function createTrackFrame(race:HistoricalRace):TrackFrame{
  const points=race.track.points
  let minX=Infinity,maxX=-Infinity,minY=Infinity,maxY=-Infinity,minZ=Infinity,trace=0
  points.forEach(([x,y,z],i)=>{
    minX=Math.min(minX,x);maxX=Math.max(maxX,x);minY=Math.min(minY,y);maxY=Math.max(maxY,y);minZ=Math.min(minZ,z)
    if(i)trace+=Math.hypot(x-points[i-1][0],y-points[i-1][1])
  })
  // The reference lap is closed: count the short segment back to its first point too.
  if(points.length>2){const closing=Math.hypot(points[0][0]-points.at(-1)![0],points[0][1]-points.at(-1)![1]);if(closing<trace*.05)trace+=closing}
  // OpenF1 uses decimetres; derive the ratio from the data and keep it plausible.
  const measured=trace/Math.max(race.track.length,1)
  const unitsPerMeter=Number.isFinite(measured)&&measured>6&&measured<16?measured:10
  return {unitsPerMeter,cx:Number.isFinite(minX)?(minX+maxX)/2:0,cy:Number.isFinite(minY)?(minY+maxY)/2:0,z0:Number.isFinite(minZ)?minZ:0}
}
export const toWorld=(frame:TrackFrame,x:number,y:number,z:number)=>({x:(x-frame.cx)/frame.unitsPerMeter,y:(z-frame.z0)/frame.unitsPerMeter,z:-(y-frame.cy)/frame.unitsPerMeter})

/** Approximate racing surface half-width by venue. Street circuits are narrower. */
export function trackHalfWidth(circuit:string):number{
  if(/monaco/i.test(circuit))return 4.8
  if(/marina bay|singapore|baku|azerbaijan/i.test(circuit))return 5.6
  if(/jeddah|corniche|las vegas|villeneuve|montr/i.test(circuit))return 6.2
  if(/hungaroring|zandvoort|imola|enzo/i.test(circuit))return 6.4
  return 7
}

function gaussian(values:Float32Array,sigmaSamples:number,closed:boolean):Float32Array{
  if(sigmaSamples<.5)return values.slice()
  const radius=Math.ceil(sigmaSamples*2.5),weights:number[]=[]
  for(let k=-radius;k<=radius;k++)weights.push(Math.exp(-k*k/(2*sigmaSamples*sigmaSamples)))
  const n=values.length,out=new Float32Array(n)
  for(let i=0;i<n;i++){
    let sum=0,total=0
    for(let k=-radius;k<=radius;k++){
      let j=i+k
      if(closed)j=(j%n+n)%n
      else if(j<0||j>=n)continue
      sum+=values[j]*weights[k+radius];total+=weights[k+radius]
    }
    out[i]=sum/total
  }
  return out
}

/** Centripetal Catmull-Rom densification, then uniform arc-length resampling. */
function resample(px:number[],py:number[],pz:number[],closed:boolean,step:number){
  const n=px.length,dx:number[]=[],dy:number[]=[],dz:number[]=[]
  const at=(i:number)=>closed?(i%n+n)%n:Math.max(0,Math.min(n-1,i))
  const segments=closed?n:n-1
  for(let i=0;i<segments;i++){
    const i0=at(i-1),i1=at(i),i2=at(i+1),i3=at(i+2)
    const pts=[i0,i1,i2,i3].map(k=>[px[k],py[k],pz[k]])
    const knot=(a:number[],b:number[])=>Math.max(1e-3,Math.sqrt(Math.hypot(b[0]-a[0],b[2]-a[2])))
    const t1=knot(pts[0],pts[1]),t2=t1+knot(pts[1],pts[2]),t3=t2+knot(pts[2],pts[3])
    const sub=8
    for(let k=0;k<sub;k++){
      const t=t1+(t2-t1)*k/sub,value=[0,0,0]
      for(let c=0;c<3;c++){
        const p0=pts[0][c],p1=pts[1][c],p2=pts[2][c],p3=pts[3][c]
        const a1=(t1-t)/t1*p0+t/t1*p1,a2=(t2-t)/(t2-t1)*p1+(t-t1)/(t2-t1)*p2,a3=(t3-t)/(t3-t2)*p2+(t-t2)/(t3-t2)*p3
        const b1=(t2-t)/t2*a1+t/t2*a2,b2=(t3-t)/(t3-t1)*a2+(t-t1)/(t3-t1)*a3
        value[c]=(t2-t)/(t2-t1)*b1+(t-t1)/(t2-t1)*b2
      }
      dx.push(value[0]);dy.push(value[1]);dz.push(value[2])
    }
  }
  if(!closed){dx.push(px[n-1]);dy.push(py[n-1]);dz.push(pz[n-1])}
  return uniform(dx,dy,dz,closed,step)
}
function uniform(dx:ArrayLike<number>,dy:ArrayLike<number>,dz:ArrayLike<number>,closed:boolean,step:number){
  const n=dx.length,cumulative=new Float64Array(n+1)
  for(let i=1;i<=n;i++){
    if(i===n&&!closed){cumulative[i]=cumulative[i-1];break}
    const a=i-1,b=i%n
    cumulative[i]=cumulative[i-1]+Math.hypot(dx[b]-dx[a],dz[b]-dz[a])
  }
  const length=closed?cumulative[n]:cumulative[n-1]
  const count=Math.max(4,Math.round(length/step)+(closed?0:1)),spacing=closed?length/count:length/(count-1)
  const x=new Float32Array(count),y=new Float32Array(count),z=new Float32Array(count)
  let j=0
  for(let i=0;i<count;i++){
    const s=i*spacing
    while(j<n-1&&cumulative[j+1]<s)j++
    const a=j,b=closed?(j+1)%n:Math.min(n-1,j+1),span=cumulative[j+1]-cumulative[j],f=span>0?(s-cumulative[j])/span:0
    x[i]=dx[a]+(dx[b]-dx[a])*f;y[i]=dy[a]+(dy[b]-dy[a])*f;z[i]=dz[a]+(dz[b]-dz[a])*f
  }
  return {x,y,z,length,count,step:spacing}
}

const cellKey=(cx:number,cz:number)=>(cx+32768)*65536+(cz+32768)
export function buildGuidePath(points:{x:number;y:number;z:number}[],closed:boolean,halfWidth:number,options:{racingOffset?:boolean}={}):GuidePath|null{
  const px:number[]=[],py:number[]=[],pz:number[]=[]
  for(const p of points){
    if(![p.x,p.y,p.z].every(Number.isFinite))continue
    const last=px.length-1
    if(last>=0&&Math.hypot(p.x-px[last],p.z-pz[last])<.75)continue
    px.push(p.x);py.push(p.y);pz.push(p.z)
  }
  if(px.length<4)return null
  if(closed&&Math.hypot(px[0]-px.at(-1)!,pz[0]-pz.at(-1)!)<.75){px.pop();py.pop();pz.pop()}
  const first=resample(px,py,pz,closed,2)
  const step=first.step
  // Remove provider jitter without flattening real corners; elevation is smoothed harder.
  const smooth=uniform(gaussian(first.x,2.2/step,closed),gaussian(first.y,22/step,closed),gaussian(first.z,2.2/step,closed),closed,2)
  const {x,y,z,count,length}=smooth,spacing=smooth.step
  const tx=new Float32Array(count),tz=new Float32Array(count),raw=new Float32Array(count)
  const index=(i:number)=>closed?(i%count+count)%count:Math.max(0,Math.min(count-1,i))
  for(let i=0;i<count;i++){
    const a=index(i-1),b=index(i+1),vx=x[b]-x[a],vz=z[b]-z[a],l=Math.hypot(vx,vz)||1
    tx[i]=vx/l;tz[i]=vz/l
  }
  for(let i=0;i<count;i++){
    const a=index(i-1),b=index(i+1),span=(b-a+count)%count||2
    raw[i]=((tx[b]-tx[a])*tz[i]-(tz[b]-tz[a])*tx[i])/(span*spacing)
  }
  const curvature=gaussian(raw,6/spacing,closed)
  const offset=new Float32Array(count)
  if(options.racingOffset){
    // The reference line is a real racing lap: it clips the inside of each corner. Shift
    // the modelled road outward there so apexes sit near the inside kerb, as in reality.
    const broad=gaussian(raw,28/spacing,closed),limit=Math.max(0,halfWidth-1.8)
    for(let i=0;i<count;i++)offset[i]=-Math.sign(broad[i])*Math.min(limit,Math.abs(broad[i])*520)
    offset.set(gaussian(offset,30/spacing,closed))
  }
  const cells=new Map<number,number[]>()
  for(let i=0;i<(closed?count:count-1);i++){
    const j=index(i+1),minX=Math.floor(Math.min(x[i],x[j])/CELL),maxX=Math.floor(Math.max(x[i],x[j])/CELL),minZ=Math.floor(Math.min(z[i],z[j])/CELL),maxZ=Math.floor(Math.max(z[i],z[j])/CELL)
    for(let cx=minX;cx<=maxX;cx++)for(let cz=minZ;cz<=maxZ;cz++){const key=cellKey(cx,cz);const list=cells.get(key);if(list)list.push(i);else cells.set(key,[i])}
  }
  return {closed,length,step:spacing,count,halfWidth,x,y,z,tx,tz,curvature,offset,cells}
}

export function createTrackGuide(race:HistoricalRace):TrackGuide|null{
  if(race.track.points.length<8)return null
  const frame=createTrackFrame(race),halfWidth=trackHalfWidth(race.meta.circuit)
  const track=buildGuidePath(race.track.points.map(([x,y,z])=>toWorld(frame,x,y,z)),true,halfWidth,{racingOffset:true})
  if(!track)return null
  let pit:GuidePath|null=null
  const lane=race.track.pitLane??[]
  if(lane.length>=6){
    const candidate=buildGuidePath(lane.map(([x,y,z])=>toWorld(frame,x,y,z)),false,5.6)
    // A recorded pit traversal is a few hundred metres; anything else is not a pit lane.
    if(candidate&&candidate.length>120&&candidate.length<Math.min(1600,track.length*.4))pit=candidate
  }
  return {frame,track,pit}
}

type Projection={s:number;d:number;distance:number;y:number}
const visited=new WeakMap<GuidePath,{stamp:Int32Array;id:number}>()
/** Nearest point on a guide path within `radius` metres, preferring continuity with `expected`. */
export function projectToPath(path:GuidePath,x:number,z:number,y:number,radius:number,expected:number|null=null):Projection|null{
  const cx=Math.floor(x/CELL),cz=Math.floor(z/CELL),reach=Math.ceil(radius/CELL)
  let marks=visited.get(path)
  if(!marks){marks={stamp:new Int32Array(path.count),id:0};visited.set(path,marks)}
  const id=++marks.id,stamp=marks.stamp
  let bestCost=Infinity,bestS=0,bestD=0,bestDistance=0,bestY=0
  for(let ix=cx-reach;ix<=cx+reach;ix++)for(let iz=cz-reach;iz<=cz+reach;iz++){
    const list=path.cells.get(cellKey(ix,iz));if(!list)continue
    for(let k=0;k<list.length;k++){
      const i=list[k]
      if(stamp[i]===id)continue;stamp[i]=id
      const j=path.closed?(i+1)%path.count:Math.min(path.count-1,i+1)
      const ax=path.x[i],az=path.z[i],vx=path.x[j]-ax,vz=path.z[j]-az,l2=vx*vx+vz*vz||1
      const u=Math.max(0,Math.min(1,((x-ax)*vx+(z-az)*vz)/l2)),fx=ax+vx*u,fz=az+vz*u
      const distance=Math.hypot(x-fx,z-fz)
      if(distance>radius)continue
      const s=(i+u)*path.step,pathY=path.y[i]+(path.y[j]-path.y[i])*u
      let cost=distance+Math.abs(y-pathY)*1.2
      if(expected!=null&&Math.abs(path.closed?wrap(s-expected,path.length):s-expected)>120)cost+=45
      if(cost<bestCost){
        const l=Math.sqrt(l2)
        bestCost=cost;bestS=s;bestD=((x-fx)*vz-(z-fz)*vx)/l;bestDistance=distance;bestY=pathY
      }
    }
  }
  return bestCost<Infinity?{s:bestS,d:bestD,distance:bestDistance,y:bestY}:null
}
export const wrap=(value:number,length:number)=>{let v=value%length;if(v>length/2)v-=length;if(v<-length/2)v+=length;return v}

/**
 * Robust local-quadratic smoothing in time (LOWESS-style). Provider timestamps jitter
 * against positions, so raw one-second progress steps alternate between implausibly
 * short and long. This recovers a physically smooth progress curve.
 */
function smoothProgress(t:Float64Array,values:Float64Array,start:number,end:number,window:number){
  const n=end-start
  if(n<4)return
  const source=values.slice(start,end),robust=new Float64Array(n).fill(1),fitted=new Float64Array(n)
  // A position repeated while the car is clearly moving is a stale provider update.
  for(let i=1;i<n-1;i++)if(Math.abs(source[i]-source[i-1])<.05&&source[i+1]-source[i]>6)robust[i]=0
  for(let pass=0;pass<2;pass++){
    let lo=0
    for(let i=0;i<n;i++){
      const ti=t[start+i]
      while(t[start+lo]<ti-window)lo++
      let s0=0,s1=0,s2=0,s3=0,s4=0,y0=0,y1=0,y2=0
      for(let j=lo;j<n&&t[start+j]<=ti+window;j++){
        const dt=t[start+j]-ti,q=Math.abs(dt)/window,w=(1-q*q*q)**3*robust[j]
        if(w<=0)continue
        const d2=dt*dt,y=source[j]-source[i]
        s0+=w;s1+=w*dt;s2+=w*d2;s3+=w*d2*dt;s4+=w*d2*d2;y0+=w*y;y1+=w*y*dt;y2+=w*y*d2
      }
      // Solve the 3×3 weighted normal equations; fall back to a weighted mean.
      const det=s0*(s2*s4-s3*s3)-s1*(s1*s4-s3*s2)+s2*(s1*s3-s2*s2)
      fitted[i]=source[i]+(Math.abs(det)>1e-9?(y0*(s2*s4-s3*s3)-s1*(y1*s4-s3*y2)+s2*(y1*s3-s2*y2))/det:(s0>0?y0/s0:0))
    }
    if(pass===0){
      const residuals=Array.from(fitted,(f,i)=>Math.abs(f-source[i])).sort((a,b)=>a-b)
      const scale=Math.max(1.5,6*residuals[residuals.length>>1])
      for(let i=0;i<n;i++){const r=Math.abs(fitted[i]-source[i])/scale;robust[i]=r<1?(1-r*r)**2:0}
    }
  }
  // Cars never reverse on a racing surface; keep progress monotone.
  for(let i=0;i<n;i++)values[start+i]=i?Math.max(values[start+i-1],fitted[i]):fitted[i]
}

export function createDriverMotion(guide:TrackGuide|null,samples:LocationSample[],maxGap=3):DriverMotion{
  const n=samples.length,t=new Float64Array(n),mode=new Uint8Array(n),S=new Float64Array(n),D=new Float32Array(n),wx=new Float32Array(n),wy=new Float32Array(n),wz=new Float32Array(n),invalid=new Uint8Array(n)
  const frame=guide?.frame??{unitsPerMeter:10,cx:0,cy:0,z0:0}
  let expected:number|null=null,velocity=0
  for(let i=0;i<n;i++){
    const [time,rx,ry,rz]=samples[i],w=toWorld(frame,rx,ry,rz)
    t[i]=time;wx[i]=w.x;wy[i]=w.y;wz[i]=w.z
    if(!guide)continue
    const dt=i?time-t[i-1]:Infinity,continuing=i>0&&dt<=maxGap&&mode[i-1]===1,hint=continuing?expected:null,half=guide.track.halfWidth
    let onTrack=projectToPath(guide.track,w.x,w.z,w.y,half+3,hint),inPit=null
    if(!onTrack){
      inPit=guide.pit?projectToPath(guide.pit,w.x,w.z,w.y,16):null
      if(!inPit)onTrack=projectToPath(guide.track,w.x,w.z,w.y,half+11,hint)
    }
    if(inPit){mode[i]=2;S[i]=inPit.s;D[i]=inPit.d;expected=null;velocity=0}
    else if(onTrack){
      mode[i]=1;S[i]=onTrack.s;D[i]=onTrack.d
      velocity=continuing?Math.max(0,Math.min(100,wrap(onTrack.s-S[i-1],guide.track.length)/Math.max(dt,1e-3))):0
      expected=onTrack.s+velocity*Math.min(1.2,Math.max(dt,0))
    }else{mode[i]=0;expected=null;velocity=0}
  }
  const linked=(i:number)=>i>0&&mode[i]!==0&&mode[i]===mode[i-1]&&t[i]-t[i-1]<=maxGap
  if(guide){
    // Unwrap lap progress within continuous runs, then smooth each run in time.
    for(let i=1;i<n;i++)if(linked(i)&&mode[i]===1)S[i]=S[i-1]+wrap(S[i]-(S[i-1]%guide.track.length+guide.track.length)%guide.track.length,guide.track.length)
    for(let start=0;start<n;){
      let end=start+1
      while(end<n&&linked(end))end++
      if(mode[start]!==0)smoothProgress(t,S,start,end,3.5)
      start=end
    }
  }
  // Smooth lateral placement and world elevation inside each run; keep cars on the road.
  const smoothRun=(values:Float32Array,same:(a:number,b:number)=>boolean)=>{
    const copy=values.slice()
    for(let i=0;i<n;i++){
      let sum=copy[i]*3,total=3
      for(const [k,w] of [[-2,1],[-1,2],[1,2],[2,1]] as const){const j=i+k;if(j<0||j>=n||!same(i,j))continue;sum+=copy[j]*w;total+=w}
      values[i]=sum/total
    }
  }
  const sameRun=(a:number,b:number)=>{const lo=Math.min(a,b),hi=Math.max(a,b);for(let k=lo;k<hi;k++)if(mode[k+1]!==mode[a]||t[k+1]-t[k]>maxGap)return false;return true}
  if(guide){
    smoothRun(D,(a,b)=>mode[a]!==0&&sameRun(a,b))
    for(let i=0;i<n;i++){
      if(mode[i]===1){const o=pathValue(guide.track,guide.track.offset,S[i]),limit=guide.track.halfWidth-.95;D[i]=Math.max(o-limit,Math.min(o+limit,D[i]))}
      else if(mode[i]===2)D[i]=Math.max(-4.2,Math.min(4.2,D[i]))
    }
  }
  smoothRun(wy,(a,b)=>sameRun(a,b))
  if(guide)for(let i=0;i<n;i++){
    if(mode[i]===0||(mode[i]===2&&!guide.pit))continue
    const f=pathFrame(mode[i]===1?guide.track:guide.pit!,S[i])
    wx[i]=f.x+f.tz*D[i];wz[i]=f.z-f.tx*D[i];wy[i]=f.y
  }
  // A bracket that would require more than ~450 km/h is a provider position glitch.
  for(let i=0;i<n-1;i++){
    const dt=t[i+1]-t[i],distance=mode[i]===1&&mode[i+1]===1?S[i+1]-S[i]:Math.hypot(wx[i+1]-wx[i],wz[i+1]-wz[i])
    if(dt>0&&distance/dt>125)invalid[i]=1
  }
  return {t,mode,S,D,wx,wy,wz,invalid}
}

function pathValue(path:GuidePath,values:Float32Array,s:number):number{
  const f=path.closed?((s%path.length)+path.length)%path.length/path.step:Math.max(0,Math.min(path.count-1,s/path.step))
  const i=Math.floor(f),j=path.closed?(i+1)%path.count:Math.min(path.count-1,i+1),a=f-i
  return values[i%path.count]*(1-a)+values[j]*a
}
/** Interpolated centre-line frame at progress s. */
export function pathFrame(path:GuidePath,s:number){
  const f=path.closed?((s%path.length)+path.length)%path.length/path.step:Math.max(0,Math.min(path.count-1,s/path.step))
  const i=Math.floor(f)%path.count,j=path.closed?(i+1)%path.count:Math.min(path.count-1,i+1),a=f-Math.floor(f)
  let tx=path.tx[i]*(1-a)+path.tx[j]*a,tz=path.tz[i]*(1-a)+path.tz[j]*a
  const l=Math.hypot(tx,tz)||1;tx/=l;tz/=l
  const k=Math.max(0,i-1),m=path.closed?(j+1)%path.count:Math.min(path.count-1,j+1)
  return {
    x:path.x[i]*(1-a)+path.x[j]*a,y:path.y[i]*(1-a)+path.y[j]*a,z:path.z[i]*(1-a)+path.z[j]*a,tx,tz,
    curvature:path.curvature[i]*(1-a)+path.curvature[j]*a,offset:path.offset[i]*(1-a)+path.offset[j]*a,
    grade:(path.y[m]-path.y[k])/(((m-k+path.count)%path.count||1)*path.step),
  }
}

function atOrBefore(t:Float64Array,time:number){
  let low=0,high=t.length-1,result=-1
  while(low<=high){const middle=(low+high)>>>1;if(t[middle]<=time){result=middle;low=middle+1}else high=middle-1}
  return result
}

type Hermite={value:number;velocity:number;acceleration:number}
/** Cubic Hermite through samples a→b with time-aware tangents; `monotone` uses Fritsch–Carlson limiting. */
function hermite(values:ArrayLike<number>,t:Float64Array,a:number,b:number,time:number,prev:boolean,next:boolean,monotone:boolean):Hermite{
  const h=t[b]-t[a],delta=(values[b]-values[a])/h
  let ma=delta,mb=delta
  if(prev){const hp=t[a]-t[a-1],dp=(values[a]-values[a-1])/hp;ma=(hp*delta+h*dp)/(hp+h)}
  if(next){const hn=t[b+1]-t[b],dn=(values[b+1]-values[b])/hn;mb=(hn*delta+h*dn)/(hn+h)}
  if(monotone){
    if(Math.abs(delta)<1e-9){ma=0;mb=0}
    else{
      const alpha=ma/delta,beta=mb/delta
      if(alpha<0)ma=0;if(beta<0)mb=0
      const r=alpha*alpha+beta*beta
      if(r>9){const tau=3/Math.sqrt(r);ma=tau*alpha*delta;mb=tau*beta*delta}
    }
  }
  const u=(time-t[a])/h,u2=u*u,u3=u2*u,p0=values[a],p1=values[b]
  return {
    value:(2*u3-3*u2+1)*p0+(u3-2*u2+u)*h*ma+(-2*u3+3*u2)*p1+(u3-u2)*h*mb,
    velocity:((6*u2-6*u)*p0+(3*u2-4*u+1)*h*ma+(-6*u2+6*u)*p1+(3*u2-2*u)*h*mb)/h,
    acceleration:((12*u-6)*p0+(6*u-4)*h*ma+(-12*u+6)*p1+(6*u-2)*h*mb)/(h*h),
  }
}

/**
 * Presentation pose at `time`, or null when the recorded bracket is missing or longer
 * than `maxGap` (the same rule the data layer uses to hide cars).
 */
export function sampleMotion(guide:TrackGuide|null,motion:DriverMotion,time:number,maxGap:number,out:MotionPose=emptyPose()):MotionPose|null{
  const {t,mode}=motion,n=t.length
  if(!n||!Number.isFinite(time))return null
  let a=atOrBefore(t,time)
  if(a<0)return null
  if(a===n-1){if(time>t[a]||n<2)return null;a=n-2;time=t[n-1]}
  const b=a+1
  if(t[b]-t[a]>maxGap||t[b]<=t[a]||motion.invalid[a])return null
  const linked=(i:number,j:number)=>i>=0&&j<n&&mode[i]===mode[a]&&mode[j]===mode[a]&&t[j]-t[i]<=maxGap&&t[j]>t[i]
  const guided=!!guide&&mode[a]!==0&&mode[a]===mode[b]&&(mode[a]===1||!!guide.pit)
  if(guided){
    const path=mode[a]===1?guide!.track:guide!.pit!
    const S=hermite(motion.S,t,a,b,time,linked(a-1,a),linked(b,b+1),true)
    const D=hermite(motion.D,t,a,b,time,linked(a-1,a),linked(b,b+1),false)
    const f=pathFrame(path,S.value),nx=f.tz,nz=-f.tx
    const scale=Math.max(.2,1-f.curvature*D.value),along=Math.max(0,S.velocity)*scale
    const vx=f.tx*along+nx*D.velocity,vz=f.tz*along+nz*D.velocity
    out.x=f.x+nx*D.value;out.z=f.z+nz*D.value;out.y=f.y
    out.speed=Math.hypot(vx,vz)
    out.yaw=out.speed>.5?Math.atan2(vx,vz):Math.atan2(f.tx,f.tz)
    const pathCurvature=f.curvature/scale
    out.accel=S.acceleration;out.yawRate=pathCurvature*out.speed;out.latAccel=pathCurvature*out.speed*out.speed
    out.grade=f.grade;out.s=path.closed?((S.value%path.length)+path.length)%path.length:S.value;out.d=D.value;out.mode=mode[a];out.curvature=pathCurvature
    out.roadOffset=mode[a]===1?f.offset:0;out.halfWidth=path.halfWidth
    return out
  }
  const prev=a>0&&t[a]-t[a-1]<=maxGap,next=b+1<n&&t[b+1]-t[b]<=maxGap
  const X=hermite(motion.wx,t,a,b,time,prev,next,false),Z=hermite(motion.wz,t,a,b,time,prev,next,false),Y=hermite(motion.wy,t,a,b,time,prev,next,false)
  const speed=Math.hypot(X.velocity,Z.velocity)
  out.x=X.value;out.y=Y.value;out.z=Z.value;out.speed=speed
  out.yaw=speed>.5?Math.atan2(X.velocity,Z.velocity):out.yaw
  out.accel=speed>.5?(X.acceleration*X.velocity+Z.acceleration*Z.velocity)/speed:0
  // Left-positive lateral acceleration: a · leftNormal, where leftNormal = (vz, −vx)/|v|.
  out.latAccel=speed>.5?(X.acceleration*Z.velocity-Z.acceleration*X.velocity)/speed:0
  out.yawRate=speed>.5?out.latAccel/speed:0
  out.curvature=speed>.5?out.latAccel/(speed*speed):0
  out.grade=speed>.5?Y.velocity/speed:0
  out.s=0;out.d=0;out.mode=0;out.roadOffset=0;out.halfWidth=guide?.track.halfWidth??7
  return out
}
