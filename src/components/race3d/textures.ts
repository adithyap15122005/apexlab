import { CanvasTexture, DataTexture, LinearMipmapLinearFilter, NoColorSpace, RepeatWrapping, RGBAFormat, SRGBColorSpace, type Texture } from 'three'

/**
 * Procedural textures generated in the browser: no downloads, no licensed imagery.
 * Everything is cached for the lifetime of the page.
 */
const cache=new Map<string,Texture>()
function cached<T extends Texture>(key:string,make:()=>T):T{
  const hit=cache.get(key)
  if(hit)return hit as T
  const texture=make();cache.set(key,texture);return texture
}
function canvas(width:number,height=width){const c=document.createElement('canvas');c.width=width;c.height=height;return {c,g:c.getContext('2d',{willReadFrequently:true})!}}
function rng(seed:number){let s=seed>>>0||1;return()=>{s=(s*1664525+1013904223)>>>0;return s/4294967296}}
/** Tileable value noise (bilinear, wraps) with several octaves. */
function noiseField(size:number,seed:number,octaves:number[],persistence=.5){
  const out=new Float32Array(size*size),random=rng(seed)
  let amplitude=1,total=0
  for(const cells of octaves){
    const grid=new Float32Array(cells*cells).map(()=>random())
    for(let y=0;y<size;y++)for(let x=0;x<size;x++){
      const fx=x/size*cells,fy=y/size*cells,ix=Math.floor(fx),iy=Math.floor(fy),tx=fx-ix,ty=fy-iy
      const sx=tx*tx*(3-2*tx),sy=ty*ty*(3-2*ty),a=grid[iy%cells*cells+ix%cells],b=grid[iy%cells*cells+(ix+1)%cells],c=grid[(iy+1)%cells*cells+ix%cells],d=grid[(iy+1)%cells*cells+(ix+1)%cells]
      out[y*size+x]+=((a*(1-sx)+b*sx)*(1-sy)+(c*(1-sx)+d*sx)*sy)*amplitude
    }
    total+=amplitude;amplitude*=persistence
  }
  for(let i=0;i<out.length;i++)out[i]/=total
  return out
}
function dataTexture(data:Uint8Array,width:number,height:number,srgb:boolean,repeat=true){
  const t=new DataTexture(data,width,height,RGBAFormat)
  t.colorSpace=srgb?SRGBColorSpace:NoColorSpace
  if(repeat)t.wrapS=t.wrapT=RepeatWrapping
  t.generateMipmaps=true;t.minFilter=LinearMipmapLinearFilter;t.anisotropy=8;t.needsUpdate=true
  return t
}
function normalFromHeight(height:Float32Array,size:number,strength:number){
  const data=new Uint8Array(size*size*4)
  for(let y=0;y<size;y++)for(let x=0;x<size;x++){
    const h=(dx:number,dy:number)=>height[((y+dy+size)%size)*size+(x+dx+size)%size]
    const nx=(h(-1,0)-h(1,0))*strength,ny=(h(0,-1)-h(0,1))*strength,l=Math.hypot(nx,ny,1),i=(y*size+x)*4
    data[i]=(nx/l*.5+.5)*255;data[i+1]=(ny/l*.5+.5)*255;data[i+2]=(1/l*.5+.5)*255;data[i+3]=255
  }
  return data
}

/** Race asphalt: aggregate speckle albedo, roughness and a normal map. Tiles every few metres. */
export function asphaltTextures(){
  return {
    map:cached('asphalt-map',()=>{
      const size=512,coarse=noiseField(size,7,[8,32,128],.55),grain=noiseField(size,11,[256],.5),random=rng(3),data=new Uint8Array(size*size*4)
      for(let i=0;i<size*size;i++){
        const speck=random(),stone=speck>.985?28:speck<.02?-22:0
        const v=58+coarse[i]*26+grain[i]*24+stone
        data[i*4]=v;data[i*4+1]=v+1.5;data[i*4+2]=v+4;data[i*4+3]=255
      }
      return dataTexture(data,size,size,true)
    }),
    normal:cached('asphalt-normal',()=>{const size=512,h=noiseField(size,19,[64,256],.7);return dataTexture(normalFromHeight(h,size,5.5),size,size,false)}),
    rough:cached('asphalt-rough',()=>{
      const size=256,n=noiseField(size,23,[16,64],.6),data=new Uint8Array(size*size*4)
      for(let i=0;i<size*size;i++){const r=200+n[i]*45;data[i*4]=255;data[i*4+1]=r;data[i*4+2]=0;data[i*4+3]=255}
      return dataTexture(data,size,size,false)
    }),
  }
}

export function grassTexture(){
  return cached('grass',()=>{
    const size=512,n=noiseField(size,31,[6,24,96,256],.55),fine=noiseField(size,37,[256],.5),data=new Uint8Array(size*size*4)
    for(let i=0;i<size*size;i++){
      const v=n[i]*.8+fine[i]*.35
      data[i*4]=58+v*38;data[i*4+1]=96+v*52;data[i*4+2]=38+v*20;data[i*4+3]=255
    }
    return dataTexture(data,size,size,true)
  })
}
export function gravelTexture(){
  return cached('gravel',()=>{
    const size=256,n=noiseField(size,41,[32,128],.6),random=rng(43),data=new Uint8Array(size*size*4)
    for(let i=0;i<size*size;i++){const r=random(),v=150+n[i]*50+(r>.9?30:r<.08?-35:0);data[i*4]=v+18;data[i*4+1]=v+6;data[i*4+2]=v-24;data[i*4+3]=255}
    return dataTexture(data,size,size,true)
  })
}
export function sandTexture(){
  return cached('sand',()=>{
    const size=512,n=noiseField(size,47,[4,16,64,256],.55),data=new Uint8Array(size*size*4)
    for(let i=0;i<size*size;i++){const v=n[i];data[i*4]=172+v*50;data[i*4+1]=140+v*44;data[i*4+2]=98+v*36;data[i*4+3]=255}
    return dataTexture(data,size,size,true)
  })
}
export function concreteTexture(){
  return cached('concrete',()=>{
    const size=256,n=noiseField(size,53,[8,32,128],.6),data=new Uint8Array(size*size*4)
    for(let i=0;i<size*size;i++){const v=150+n[i]*45;data[i*4]=v;data[i*4+1]=v;data[i*4+2]=v+3;data[i*4+3]=255}
    return dataTexture(data,size,size,true)
  })
}

/** Twill carbon weave. */
export function carbonTexture(){
  return cached('carbon',()=>{
    const {c,g}=canvas(256)
    g.fillStyle='#1b1f23';g.fillRect(0,0,256,256)
    const cell=8
    for(let y=0;y<256;y+=cell)for(let x=0;x<256;x+=cell){
      const twill=((x/cell)+(y/cell))%4<2
      const grad=g.createLinearGradient(x,y,twill?x+cell:x,twill?y:y+cell)
      grad.addColorStop(0,twill?'#2c3238':'#20252a');grad.addColorStop(.5,twill?'#3c444b':'#2a3036');grad.addColorStop(1,twill?'#2a3036':'#1d2227')
      g.fillStyle=grad;g.fillRect(x+.3,y+.3,cell-.6,cell-.6)
    }
    const t=new CanvasTexture(c);t.colorSpace=SRGBColorSpace;t.wrapS=t.wrapT=RepeatWrapping;t.anisotropy=8;return t
  })
}

/**
 * Polar-mapped wheel face (u = angle, v = radius / tyre radius): wheel cover, rim lip
 * and tyre sidewall with lettering. Alpha is a mask (not transparency) marking where the
 * compound colour is applied, so one texture serves every compound.
 */
export function wheelFaceTextures(){
  const width=1024,height=256
  const build=()=>{
    const color=canvas(width,height),mask=canvas(width,height),R=(v:number)=>v*height
    const g=color.g,m=mask.g
    g.fillStyle='#16181a';g.fillRect(0,0,width,height);m.fillStyle='#000';m.fillRect(0,0,width,height)
    // Hub nut and wheel cover.
    g.fillStyle='#a9b0b5';g.fillRect(0,0,width,R(.1))
    const cover=g.createLinearGradient(0,R(.1),0,R(.6));cover.addColorStop(0,'#2b3035');cover.addColorStop(1,'#1c2024')
    g.fillStyle=cover;g.fillRect(0,R(.1),width,R(.5))
    for(let k=0;k<6;k++){g.fillStyle='#262a2e';g.fillRect(k*width/6,R(.12),18,R(.46))}
    // A painted stripe on the cover makes rotation readable; it takes the compound colour.
    g.fillStyle='#ffffff';g.fillRect(0,R(.42),width*.18,R(.07));m.fillStyle='#fff';m.fillRect(0,R(.42),width*.18,R(.07))
    // Rim lip.
    g.fillStyle='#c8ced2';g.fillRect(0,R(.6),width,R(.035));g.fillStyle='#08090a';g.fillRect(0,R(.635),width,R(.02))
    // Sidewall: compound band, lettering, shoulder.
    g.fillStyle='#141516';g.fillRect(0,R(.655),width,R(.345))
    for(const target of [g,m]){target.fillStyle='#fff';target.fillRect(0,R(.88),width,R(.035))}
    for(const target of [g,m]){
      target.save();target.fillStyle='#fff';target.font=`bold ${R(.1)}px Arial, sans-serif`;target.textBaseline='middle'
      for(const x of [width*.06,width*.56]){target.fillText('APEX  RACING  SLICK',x,R(.78))}
      target.font=`${R(.05)}px Arial, sans-serif`
      for(const x of [width*.36,width*.86])target.fillText('18 • DRY',x,R(.78))
      target.restore()
    }
    const pixels=g.getImageData(0,0,width,height).data,maskPixels=m.getImageData(0,0,width,height).data,data=new Uint8Array(width*height*4)
    // Canvas row 0 (drawn as the hub) becomes texture row 0, i.e. v = 0 at the hub.
    for(let y=0;y<height;y++)for(let x=0;x<width;x++){
      const src=(y*width+x)*4,dst=src
      data[dst]=pixels[src];data[dst+1]=pixels[src+1];data[dst+2]=pixels[src+2];data[dst+3]=maskPixels[src]
    }
    const t=dataTexture(data,width,height,true);t.wrapT=RepeatWrapping;t.flipY=false;return t
  }
  return cached('wheel-face',build)
}

/** Window grid for buildings: day and lit-night variants share the same layout. */
export function facadeTexture(night:boolean){
  return cached(`facade-${night}`,()=>{
    const {c,g}=canvas(256),random=rng(night?71:73)
    g.fillStyle=night?'#0d1118':'#8b9298';g.fillRect(0,0,256,256)
    for(let y=0;y<16;y++)for(let x=0;x<8;x++){
      const lit=random()
      g.fillStyle=night?(lit>.45?`hsl(${38+random()*20},${60+random()*30}%,${55+random()*25}%)`:'#121822'):(lit>.5?'#5c6f7d':'#4a5a66')
      g.fillRect(x*32+5,y*16+3,22,10)
    }
    const t=new CanvasTexture(c);t.colorSpace=SRGBColorSpace;t.wrapS=t.wrapT=RepeatWrapping;t.anisotropy=4;return t
  })
}

/** Grandstand crowd: dense, colourful speckle on stepped seating. */
export function crowdTexture(){
  return cached('crowd',()=>{
    const {c,g}=canvas(256),random=rng(83)
    g.fillStyle='#3b4148';g.fillRect(0,0,256,256)
    for(let row=0;row<32;row++){
      g.fillStyle='#2a2e33';g.fillRect(0,row*8+6,256,2)
      for(let x=0;x<256;x+=3){if(random()<.82){g.fillStyle=`hsl(${random()*360},${30+random()*60}%,${35+random()*45}%)`;g.fillRect(x,row*8+1,2.4,4.6)}}
    }
    const t=new CanvasTexture(c);t.colorSpace=SRGBColorSpace;t.wrapS=t.wrapT=RepeatWrapping;return t
  })
}

/** Fictional trackside hoardings (no real sponsors). */
export function hoardingTexture(){
  return cached('hoarding',()=>{
    const {c,g}=canvas(1024,128)
    const boards=[['#d8ff3d','#0b0d10','APEXLAB'],['#0e1b2c','#ffffff','REPLAY · RECORDED DATA'],['#ffffff','#c8102e','VELOCITY'],['#121418','#27f4d2','HISTORIC 2021–2025'],['#e10600','#ffffff','RACE · FROM WITHIN'],['#1d2a3a','#f2dc5c','PIT WALL']]
    const w=1024/boards.length
    boards.forEach(([bg,fg,text],i)=>{g.fillStyle=bg;g.fillRect(i*w,0,w,128);g.fillStyle=fg;g.font='bold 54px Arial, sans-serif';g.textAlign='center';g.textBaseline='middle';g.fillText(text,i*w+w/2,66,w-20)})
    const t=new CanvasTexture(c);t.colorSpace=SRGBColorSpace;t.wrapS=RepeatWrapping;t.anisotropy=8;return t
  })
}
/** Diamond-mesh debris fence; alpha-tested. */
export function fenceTexture(){
  return cached('fence',()=>{
    const {c,g}=canvas(128)
    g.clearRect(0,0,128,128);g.strokeStyle='rgba(205,212,216,0.95)';g.lineWidth=2.2
    for(let k=-128;k<256;k+=16){g.beginPath();g.moveTo(k,0);g.lineTo(k+128,128);g.stroke();g.beginPath();g.moveTo(k,128);g.lineTo(k+128,0);g.stroke()}
    g.fillStyle='rgba(120,128,134,1)';g.fillRect(0,0,128,5)
    const t=new CanvasTexture(c);t.colorSpace=SRGBColorSpace;t.wrapS=t.wrapT=RepeatWrapping;t.anisotropy=8;return t
  })
}
/** Steel guard rail (Armco): bright galvanised beams on darker posts. */
export function armcoTexture(){
  return cached('armco',()=>{
    const {c,g}=canvas(256,128)
    g.fillStyle='#4b5257';g.fillRect(0,0,256,128)
    for(const y of [18,58]){const grad=g.createLinearGradient(0,y,0,y+34);grad.addColorStop(0,'#e6eaec');grad.addColorStop(.5,'#9aa3a8');grad.addColorStop(1,'#d5dadd');g.fillStyle=grad;g.fillRect(0,y,256,34)}
    g.fillStyle='#2c3135';for(let x=0;x<256;x+=128)g.fillRect(x,0,10,128)
    const t=new CanvasTexture(c);t.colorSpace=SRGBColorSpace;t.wrapS=t.wrapT=RepeatWrapping;t.anisotropy=8;return t
  })
}
/** Tyre-wall / energy-absorbing barrier blocks with a red/white/blue skin. */
export function tecproTexture(){
  return cached('tecpro',()=>{
    const {c,g}=canvas(256,128),colors=['#d31f2c','#f2f2f0','#1f4fa8','#f2f2f0']
    colors.forEach((color,i)=>{g.fillStyle=color;g.fillRect(i*64,0,62,128);g.fillStyle='rgba(0,0,0,.18)';g.fillRect(i*64,60,62,4);g.fillRect(i*64+60,0,4,128)})
    const t=new CanvasTexture(c);t.colorSpace=SRGBColorSpace;t.wrapS=t.wrapT=RepeatWrapping;t.anisotropy=8;return t
  })
}
/** Radial falloff for soft contact shadows and glows. */
export function radialTexture(){
  return cached('radial',()=>{
    const {c,g}=canvas(128),grad=g.createRadialGradient(64,64,0,64,64,64)
    grad.addColorStop(0,'rgba(255,255,255,1)');grad.addColorStop(.45,'rgba(255,255,255,.55)');grad.addColorStop(1,'rgba(255,255,255,0)')
    g.fillStyle=grad;g.fillRect(0,0,128,128)
    return new CanvasTexture(c)
  })
}
