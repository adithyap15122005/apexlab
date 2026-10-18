import type { Vector3 } from 'three'
import { sampleTelemetry } from '../../history/replay'
import type { CameraMode, ReplayClock, TelemetrySample } from '../../history/types'
import type { CarRuntime } from './raceRuntime'

/**
 * Synthesized engine sound for the followed car. A 1.6-litre V6 four-stroke fires three
 * times per crank revolution, so the fundamental is rpm / 60 × 3. Recorded RPM and
 * throttle drive it when telemetry is available; otherwise an estimated gear/RPM curve
 * from the reconstructed speed is used. No recorded audio is involved.
 */
const GEAR_TOP=[85,125,160,195,232,268,302,360]
export function estimatedRpm(kmh:number){
  let low=0
  for(const top of GEAR_TOP){if(kmh<top)return 10200+Math.max(0,(kmh-low)/(top-low))*1600;low=top}
  return 11800
}

export class EngineAudio{
  private context:AudioContext
  private master:GainNode
  private engine:GainNode
  private filter:BiquadFilterNode
  private oscillators:OscillatorNode[]
  private whine:OscillatorNode
  private whineGain:GainNode
  private noiseGain:GainNode
  private noiseFilter:BiquadFilterNode
  private telemetry:TelemetrySample[]=[]
  private playing=false
  constructor(){
    const Context=window.AudioContext??(window as unknown as {webkitAudioContext:typeof AudioContext}).webkitAudioContext
    const ctx=this.context=new Context()
    const compressor=ctx.createDynamicsCompressor();compressor.threshold.value=-18;compressor.ratio.value=4
    this.master=ctx.createGain();this.master.gain.value=0
    this.master.connect(compressor);compressor.connect(ctx.destination)
    // Soft clipping gives the harmonically rich, raspy hybrid-V6 tone.
    const shaper=ctx.createWaveShaper(),curve=new Float32Array(1024)
    for(let i=0;i<1024;i++){const x=i/511.5-1;curve[i]=Math.tanh(x*2.4)}
    shaper.curve=curve
    this.filter=ctx.createBiquadFilter();this.filter.type='lowpass';this.filter.frequency.value=2400;this.filter.Q.value=.9
    this.engine=ctx.createGain();this.engine.gain.value=.5
    shaper.connect(this.filter);this.filter.connect(this.engine);this.engine.connect(this.master)
    this.oscillators=[['sawtooth',.42],['square',.22],['sawtooth',.2],['triangle',.09]].map(([type,level])=>{
      const osc=ctx.createOscillator(),gain=ctx.createGain();osc.type=type as OscillatorType;gain.gain.value=level as number
      osc.connect(gain);gain.connect(shaper);osc.start();return osc
    })
    this.whine=ctx.createOscillator();this.whine.type='sine';this.whineGain=ctx.createGain();this.whineGain.gain.value=0
    this.whine.connect(this.whineGain);this.whineGain.connect(this.master);this.whine.start()
    const noise=ctx.createBufferSource(),buffer=ctx.createBuffer(1,ctx.sampleRate*2,ctx.sampleRate),data=buffer.getChannelData(0)
    for(let i=0;i<data.length;i++)data[i]=Math.random()*2-1
    noise.buffer=buffer;noise.loop=true
    this.noiseFilter=ctx.createBiquadFilter();this.noiseFilter.type='bandpass';this.noiseFilter.frequency.value=1400;this.noiseFilter.Q.value=.7
    this.noiseGain=ctx.createGain();this.noiseGain.gain.value=0
    noise.connect(this.noiseFilter);this.noiseFilter.connect(this.noiseGain);this.noiseGain.connect(this.master);noise.start()
  }
  setTelemetry(samples:TelemetrySample[]){this.telemetry=samples}
  setPlaying(playing:boolean){
    this.playing=playing
    if(this.context.state==='suspended')void this.context.resume()
    if(!playing)this.master.gain.setTargetAtTime(0,this.context.currentTime,.15)
  }
  update(car:CarRuntime|undefined,camera:Vector3,mode:CameraMode,clock:ReplayClock){
    const now=this.context.currentTime
    if(!car||!car.visible||!this.playing||clock.speed>4){this.master.gain.setTargetAtTime(0,now,.12);return}
    const sample=this.telemetry.length?sampleTelemetry(this.telemetry,clock.current):null,live=sample&&sample.sampleAge<=2?sample:null
    const kmh=car.dynamics.speed*3.6
    const rpm=live?.rpm??(kmh<2?4200:estimatedRpm(kmh))
    const throttle=(live?.throttle??(car.dynamics.accel>-3?85:8))/100
    const f=Math.max(40,rpm/60*3)
    ;[1,.5,2,3].forEach((ratio,i)=>this.oscillators[i].frequency.setTargetAtTime(f*ratio,now,.03))
    this.whine.frequency.setTargetAtTime(f*7.3,now,.05)
    this.filter.frequency.setTargetAtTime(900+throttle*3600,now,.05)
    this.whineGain.gain.setTargetAtTime(.012+.02*throttle,now,.08)
    this.noiseGain.gain.setTargetAtTime(.03+.09*throttle,now,.06)
    this.engine.gain.setTargetAtTime(.25+.45*throttle,now,.05)
    const inside=mode==='onboard'||mode==='tcam'||mode==='nose'||mode==='rear'
    const distance=inside?0:Math.hypot(car.pose.x-camera.x,car.pose.y-camera.y,car.pose.z-camera.z)
    this.master.gain.setTargetAtTime(.32/(1+distance/25),now,.08)
  }
  dispose(){void this.context.close()}
}
