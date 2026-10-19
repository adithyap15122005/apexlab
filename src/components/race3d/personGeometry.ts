import { BoxGeometry, BufferGeometry, Color, Float32BufferAttribute, IcosahedronGeometry, InstancedBufferAttribute, InstancedMesh, MeshStandardMaterial, Object3D } from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'

/**
 * Low-poly, instanced people: spectators, marshals and team crews. Each instance has a
 * shirt colour (instanceColor), a skin tone, a pose and an animation phase. Arms and the
 * body are animated on the GPU, so thousands of people cost one draw call per group.
 * Units are metres; feet at the origin, facing +Z.
 */
export const POSE={cheer:0,work:1,flag:2,idle:3} as const
type Part='legs'|'shirt'|'skin'|'helmet'

function piece(geometry:BufferGeometry,part:Part,arm:number,tint:string){
  const flat=geometry.index?geometry.toNonIndexed():geometry,count=flat.getAttribute('position').count,c=new Color(tint)
  flat.setAttribute('tint',new Float32BufferAttribute(new Float32Array(count*3).map((_,i)=>[c.r,c.g,c.b][i%3]),3))
  flat.setAttribute('part',new Float32BufferAttribute(new Float32Array(count).fill(part==='legs'?0:part==='shirt'?1:part==='skin'?2:3),1))
  flat.setAttribute('arm',new Float32BufferAttribute(new Float32Array(count).fill(arm),1))
  flat.deleteAttribute('uv');flat.computeVertexNormals()
  return flat
}
/** A standing person, ~1.75 m. `crew` adds a helmet and gloves; `simple` is a ~60-triangle spectator for crowds. */
export function personGeometry(crew=false,simple=false){
  if(simple){
    const parts=[
      piece(new BoxGeometry(.3,.82,.16).translate(0,.41,0),'legs',0,'#2d3440'),
      piece(new BoxGeometry(.38,.6,.22).translate(0,1.13,0),'shirt',0,'#ffffff'),
      piece(new BoxGeometry(.1,.62,.12).translate(-.25,1.12,0),'shirt',-1,'#ffffff'),
      piece(new BoxGeometry(.1,.62,.12).translate(.25,1.12,0),'shirt',1,'#ffffff'),
      piece(new IcosahedronGeometry(.12,0).translate(0,1.58,0),'skin',0,'#ffffff'),
    ]
    const merged=mergeGeometries(parts,false)!;parts.forEach(q=>q.dispose());return merged
  }
  const parts=[
    piece(new BoxGeometry(.13,.82,.16).translate(-.09,.41,0),'legs',0,crew?'#20262b':'#2d3440'),
    piece(new BoxGeometry(.13,.82,.16).translate(.09,.41,0),'legs',0,crew?'#20262b':'#2d3440'),
    piece(new BoxGeometry(.38,.6,.22).translate(0,1.13,0),'shirt',0,'#ffffff'),
    piece(new BoxGeometry(.1,.56,.12).translate(-.25,1.15,0),'shirt',-1,'#ffffff'),
    piece(new BoxGeometry(.1,.56,.12).translate(.25,1.15,0),'shirt',1,'#ffffff'),
    piece(new BoxGeometry(.09,.1,.1).translate(-.25,.82,0),crew?'legs':'skin',-1,'#1a1d20'),
    piece(new BoxGeometry(.09,.1,.1).translate(.25,.82,0),crew?'legs':'skin',1,'#1a1d20'),
    piece(new IcosahedronGeometry(.115,1).translate(0,1.58,0),crew?'helmet':'skin',0,'#ffffff'),
  ]
  if(crew)parts.push(piece(new BoxGeometry(.2,.06,.14).translate(0,1.58,.09),'legs',0,'#11161a'))
  const merged=mergeGeometries(parts,false)!
  parts.forEach(p=>p.dispose())
  return merged
}

export function peopleMaterial(){
  const material=new MeshStandardMaterial({roughness:.82,metalness:0})
  const uniforms={uTime:{value:0},uExcite:{value:0}}
  material.onBeforeCompile=shader=>{
    Object.assign(shader.uniforms,uniforms)
    shader.vertexShader=`attribute vec3 tint;attribute float part;attribute float arm;attribute vec3 person;
      uniform float uTime;uniform float uExcite;varying vec3 vTint;varying float vPart;varying float vSkin;
      `+shader.vertexShader
        .replace('#include <begin_vertex>',`#include <begin_vertex>
        vTint=tint;vPart=part;vSkin=person.x;
        float pose=person.y,phase=person.z;
        float raise=0.;
        if(pose<.5){
          // A Mexican wave travels around each stand; excitement adds random cheering.
          float wave=smoothstep(.55,1.,sin(uTime*1.6-phase));
          raise=max(wave*2.6,uExcite*smoothstep(.2,1.,sin(uTime*5.+phase*7.))*2.4);
          transformed.y+=wave*.12;
        }else if(pose<1.5){
          // Pit crew: arms forward, crouching rhythmically over the wheel.
          float bob=.5+.5*sin(uTime*9.+phase);
          if(arm!=0.){vec3 p=transformed-vec3(arm*.25,1.42,0.);float a=-1.2-.3*bob;transformed=vec3(arm*.25,1.42,0.)+vec3(p.x,p.y*cos(a)-p.z*sin(a),p.y*sin(a)+p.z*cos(a));}
          transformed.y-=.18*bob*step(.5,transformed.y);
        }else if(pose<2.5){
          // Marshal: the right arm waves a flag overhead.
          if(arm>.5)raise=2.5+.45*sin(uTime*7.+phase);
        }
        if(arm!=0.&&raise>0.){
          vec3 pivot=vec3(arm*.25,1.42,0.);vec3 p=transformed-pivot;float a=raise*arm;
          transformed=pivot+vec3(p.x*cos(a)-p.y*sin(a),p.x*sin(a)+p.y*cos(a),p.z);
        }`)
    shader.fragmentShader='varying vec3 vTint;varying float vPart;varying float vSkin;\n'+shader.fragmentShader
      .replace('#include <color_fragment>',`
        vec3 skin=mix(vec3(.93,.76,.62),vec3(.36,.24,.17),vSkin);
        vec3 apexShirt=vec3(.8);
        #if defined(USE_INSTANCING_COLOR)||defined(USE_COLOR)
        apexShirt=vColor.rgb;
        #endif
        vec3 apexColor=vPart<.5?vTint:vPart<1.5?apexShirt:vPart<2.5?skin:apexShirt*1.05;
        diffuseColor.rgb*=apexColor;`)
  }
  material.customProgramCacheKey=()=>'apex-people'
  return {material,uniforms}
}

export type Person={x:number;y:number;z:number;yaw:number;color:string|Color;skin:number;pose:number;phase:number;scale?:number}
/** Build or refill an instanced crowd. `person` packs skin tone, pose and phase. */
export function fillPeople(mesh:InstancedMesh,people:Person[]){
  const o=new Object3D(),color=new Color()
  // Create instance colours up front so every program compiles with the same defines.
  if(!mesh.instanceColor)mesh.setColorAt(0,color.set("#ffffff"))
  let attribute=mesh.geometry.getAttribute('person') as InstancedBufferAttribute|undefined
  if(!attribute||attribute.count<mesh.instanceMatrix.count){attribute=new InstancedBufferAttribute(new Float32Array(mesh.instanceMatrix.count*3),3);mesh.geometry.setAttribute('person',attribute)}
  const n=Math.min(people.length,mesh.instanceMatrix.count)
  for(let i=0;i<n;i++){
    const p=people[i]
    o.position.set(p.x,p.y,p.z);o.rotation.set(0,p.yaw,0);o.scale.setScalar(p.scale??1);o.updateMatrix()
    mesh.setMatrixAt(i,o.matrix);mesh.setColorAt(i,typeof p.color==='string'?color.set(p.color):p.color)
    attribute.setXYZ(i,p.skin,p.pose,p.phase)
  }
  mesh.count=n
  mesh.instanceMatrix.needsUpdate=true;if(mesh.instanceColor)mesh.instanceColor.needsUpdate=true;attribute.needsUpdate=true
  return mesh
}
