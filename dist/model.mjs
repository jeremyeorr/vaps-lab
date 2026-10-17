/* Single-compartment NIV teaching model. Coefficients are illustrative, not calibrated. */
export const clamp=(v,lo,hi)=>Math.max(lo,Math.min(hi,v));
export const defaults=Object.freeze({targetMode:'vt',vtTarget:500,vaTarget:5.7,height:175,ibwSex:'male',psMin:4,psMax:20,bur:15,intelligent:false,demand:5.7,vco2:264.2,referenceCO2:40,baselineRate:16,pmusGain:1,rrGain:.25,chemoDelay:5,storageTau:60,compliance:50,resistance:5,epap:5,ti:1.2,timedCycling:'fixed',tiMin:.3,tiMax:2,cyclePercent:25,riseTime:150,triggerFlow:2,neuralTi:.8,speed:5,apnea:false});
export const physiology=Object.freeze({dt:.005,maxDelay:60});
// Fixed teaching reference for baseline effort; actual patient R/C remain independent.
export const referenceMechanics=Object.freeze({compliance:100,resistance:2});
export const deadspace=height=>120*Math.pow(height/175,2.363);
// ARDSNet predicted body weight (PBW), used here as the IBW convention for VT normalization.
export function predictedBodyWeight(height,sex){if(!['male','female'].includes(sex))throw Error('Select a male or female IBW formula.');return (sex==='male'?50:45.5)+.91*(height-152.4);}
export function targets(p,rate=p.bur){const vd=deadspace(p.height),vt=p.targetMode==='vt'?p.vtTarget:p.vaTarget*1000/rate+vd,ibw=predictedBodyWeight(p.height,p.ibwSex);return {vt,va:Math.max(0,vt-vd)*rate/1000,ve:vt*rate/1000,vd,rate,ibw,vtPerKg:vt/ibw};}
export function validate(p){
 const limits={height:[110,250],vtTarget:[200,1000],vaTarget:[1,15],psMin:[0,25],psMax:[1,30],bur:[5,30],demand:[1,15],compliance:[15,100],resistance:[1,25],epap:[3,15],ti:[.2,3],tiMin:[.2,2],tiMax:[.2,3],cyclePercent:[5,80],riseTime:[50,600],triggerFlow:[.5,9],neuralTi:[.4,2],speed:[1,10],vco2:[25,1100],referenceCO2:[25,60],baselineRate:[6,30],pmusGain:[0,5],rrGain:[0,2],chemoDelay:[0,60],storageTau:[5,300]};
 for(const [key,[min,max]] of Object.entries(limits))if(!Number.isFinite(p[key])||p[key]<min||p[key]>max)throw Error(`${key} must be between ${min} and ${max}.`);
 if(p.riseTime%50!==0)throw Error('Rise time must use 50 ms increments.');
 if(!Number.isInteger(p.triggerFlow*2))throw Error('Flow trigger must use 0.5 L/min increments.');
 if(p.psMin>p.psMax)throw Error('Minimum PS must be at or below maximum PS.');
 if(p.tiMin>p.tiMax)throw Error('Ti min must be at or below Ti max.');
 if(!['fixed','flow'].includes(p.timedCycling))throw Error('Select fixed Ti or flow cycling for timed breaths.');
 if(!['male','female'].includes(p.ibwSex))throw Error('Select a male or female IBW formula.');
 if(!['vt','va'].includes(p.targetMode)||typeof p.intelligent!=='boolean'||typeof p.apnea!=='boolean')throw Error('Invalid mode or effort setting.');return p;
}
export function musclePressure(e,t){const u=(t-e.start)/e.duration;return u>0&&u<1?-e.amplitude*Math.sin(Math.PI*u):0;}
const smooth=x=>{x=clamp(x,0,1);return x*x*(3-2*x);};
export function airwayPressure(b,t){if(!b)return 0;const age=Math.min(t,b.endTime??t)-b.start;return b.ps*smooth(age/(b.p.riseTime/1000))*(b.endTime===null?1:1-smooth((t-b.endTime)/.12));}
export const cycleNames=Object.freeze({flow:'Flow threshold',min:'Ti-min release',max:'Ti-max limit',timed:'Fixed Ti'});
export function cycleReason(b,t,flow){
 if(b.endTime!==null)return null;
 const age=t-b.start;b.peakFlow=Math.max(b.peakFlow,flow);
 if(b.trigger==='timed'&&b.p.timedCycling==='fixed')return age>=b.timedTi-1e-9?'timed':null;
 if(age>=b.p.tiMax-1e-9)return 'max';
 const below=b.peakFlow>0&&flow<=b.peakFlow*b.p.cyclePercent/100;
 if(age<b.p.tiMin-1e-9){b.heldByMin=below;return null;}
 return below?(b.heldByMin&&age<=b.p.tiMin+.005+1e-9?'min':'flow'):null;
}
export function flowFromMotion(volume,ps,pmus,p){return (ps-pmus-volume/(p.compliance/1000))/p.resistance;}
export const requiredVa=p=>.863*p.vco2/p.referenceCO2;
function settings(base,changes){
 const p={...base,...changes};
 if(changes.vco2!==undefined&&changes.vco2!==base.vco2)p.demand=Number(requiredVa(p).toFixed(2));
 else if(changes.demand!==undefined&&changes.demand!==base.demand)p.vco2=p.demand*p.referenceCO2/.863;
 else p.demand=Number(requiredVa(p).toFixed(2));
 return validate(p);
}
// Periodic unassisted linear mechanics, integrated with RK4 at <=5 ms.
export function unassistedCycle(p,amplitude=1){
 const period=60/p.baselineRate,duration=Math.min(p.neuralTi,.6*period),n=Math.ceil(period/physiology.dt),dt=period/n;
 const q=(t,v)=>(amplitude*(t<duration?Math.sin(Math.PI*t/duration):0)-v/(p.compliance/1000))/p.resistance;
 function cycle(initial){let volume=initial,expired=0;for(let i=0;i<n;i++){const t=i*dt,k1=q(t,volume),k2=q(t+dt/2,volume+k1*dt/2),k3=q(t+dt/2,volume+k2*dt/2),k4=q(t+dt,volume+k3*dt);volume+=dt*(k1+2*k2+2*k3+k4)/6;expired+=dt*(Math.max(0,-k1)+2*Math.max(0,-k2)+2*Math.max(0,-k3)+Math.max(0,-k4))/6;}return {volume,expired};}
 const residual=cycle(0).volume/(1-Math.exp(-period/(p.resistance*p.compliance/1000)));
 return {...cycle(residual),residual,period,duration};
}
export function calibrateEupnea(p){const unit=unassistedCycle({...p,...referenceMechanics}),vt=requiredVa(p)/p.baselineRate+deadspace(p.height)/1000;return {amplitude:vt/unit.expired,vt:vt*1000,va:requiredVa(p),residual:unit.residual*vt/unit.expired,mechanics:{...referenceMechanics},settings:{...p}};}
export const patientRate=(sensed,p)=>clamp(p.baselineRate+p.rrGain*(sensed-p.referenceCO2),6,35);
export function drive(sensed,p,baselineAmplitude){const amplitude=p.apnea?0:clamp(baselineAmplitude+p.pmusGain*(sensed-p.referenceCO2),0,Math.max(30,3*baselineAmplitude));return {amplitude,rate:amplitude<=.05?0:patientRate(sensed,p)};}
// Fixed effective CO2 capacity: tau is defined at the run's initial required Va.
export function co2After(pco2,va,vco2,referenceVa,tau,dt){const capacity=referenceVa*tau,production=.863*vco2;if(va<=0)return pco2+production*dt/capacity;const steady=production/va;return pco2+(steady-pco2)*(-Math.expm1(-va*dt/capacity));}
export class Model{
 constructor(p=defaults){this.reset(p);}
 reset(p=defaults){
  this.p=settings(defaults,p);this.calibration=calibrateEupnea(this.p);this.active={...this.p};this.initialSettings={...this.p};this.time=0;this.volume=0;this.co2=this.p.referenceCO2;this.sensedCO2=this.p.referenceCO2;this.filteredVa=requiredVa(this.p);this.rateMeasurement=requiredVa(this.p);
  this.ibrFraction=2/3;this.ps=this.p.psMin;this.initialPS=this.ps;this.history=[];this.breaths=[];this.events=[];this.eventNumber=0;this.samples=[];this.co2Buffer=[{t:0,v:this.co2}];this.nextSample=0;this.neuralPhase=1;this.effortPulse={start:-100,duration:1,amplitude:0};this.current=null;this.lastBreath=0;this.pendingTime=0;this.sample={pressure:this.p.epap,volume:0,flow:0,pmus:0};this.record();
 }
 configure(changes,label='Settings changed'){this.p=settings(this.p,changes);this.events.push({id:++this.eventNumber,t:this.time,label});}
 get backup(){return this.p.bur*(this.p.intelligent?this.ibrFraction:1);}
 get patientDrive(){return drive(this.sensedCO2,this.p,this.calibration.amplitude);}
 startBreath(trigger){
  const previous=this.current,effortId=!this.p.apnea&&musclePressure(this.effortPulse,this.time)<0?this.effortPulse.start:null;
  const doubleTriggered=trigger==='spontaneous'&&previous!==null&&effortId!==null&&previous.effortId===effortId;
  if(this.current){const b=this.current;b.cycle=this.time-b.start;b.rate=60/b.cycle;b.vt=b.expired*1000;b.ve=b.vt*b.rate/1000;b.va=Math.max(0,b.vt-deadspace(b.p.height))*b.rate/1000;this.rateMeasurement=b.va;this.filteredVa=b.va;
   this.history.push({t:this.time,ps:b.ps,vt:b.vt,va:b.va,ve:b.ve,rate:b.rate,backup:b.backup,effort:b.effort,trigger:b.trigger,demand:b.p.demand,target:targets(b.p,b.rate),targetMode:b.p.targetMode,co2:this.co2,ti:b.ti,cycleReason:b.cycleReason,doubleTriggered:b.doubleTriggered});
   const error=this.p.targetMode==='vt'?this.p.vtTarget-b.vt:(this.p.vaTarget-b.va)*1000/b.rate;
   const change=(1-Math.exp(-b.cycle/20))*error/40,limit=this.p.speed*b.cycle/60;
   this.ps=clamp(this.ps+clamp(change,-limit,limit),this.p.psMin,this.p.psMax);
  }
  // Target-dependent acceleration is illustrative; backup is never disabled by high Va.
  if(!this.p.intelligent||trigger==='spontaneous')this.ibrFraction=2/3;
  else {const below=this.filteredVa<targets(this.p).va;this.ibrFraction=Math.min(1,this.ibrFraction+1/(3*(below?4:8)));}
  this.active={...this.p};this.ps=clamp(this.ps,this.p.psMin,this.p.psMax);
  const rate=this.history.at(-1)?.rate||Math.max(this.backup,this.patientDrive.rate),timedTi=this.p.ti;
  this.current={start:this.time,cycle:60/rate,ti:null,timedTi,endTime:null,cycleReason:null,peakFlow:0,heldByMin:false,rate,backup:this.backup,trigger,effort:effortId===null?0:this.effortPulse.amplitude,effortDuration:effortId===null?0:this.effortPulse.duration,effortId,doubleTriggered,ps:this.ps,vt:0,ve:0,va:0,expired:0,p:{...this.p}};
  this.breaths.push(this.current);if(this.breaths.length>300)this.breaths.shift();this.lastBreath=this.time;
 }
 integrate(dt){
  const d=this.patientDrive;this.neuralPhase+=d.rate*dt/60;
  if(d.rate>0&&this.neuralPhase>=1){this.neuralPhase%=1;this.effortPulse={start:this.time,duration:Math.min(this.p.neuralTi,.6*60/d.rate),amplitude:d.amplitude};}
  if(!d.rate)this.neuralPhase=1;
  const pmusAt=t=>this.p.apnea?0:musclePressure(this.effortPulse,t);
  let support=airwayPressure(this.current,this.time),flow=flowFromMotion(this.volume,support,pmusAt(this.time),this.active);
  if(this.current){const reason=cycleReason(this.current,this.time,flow);if(reason){this.current.endTime=this.time;this.current.ti=this.time-this.current.start;this.current.cycleReason=reason;}}
  const ready=!this.current||(this.current.endTime!==null&&this.time>=this.current.endTime+.12+.3-1e-9);
  const patient=ready&&pmusAt(this.time)<0&&flow>=this.p.triggerFlow/60;
  if(patient||(ready&&this.time-this.lastBreath>=60/this.backup))this.startBreath(patient?'spontaneous':'timed');
  const derivative=(t,v)=>flowFromMotion(v,airwayPressure(this.current,t),pmusAt(t),this.active);
  const t=this.time,v=this.volume,k1=derivative(t,v),k2=derivative(t+dt/2,v+k1*dt/2),k3=derivative(t+dt/2,v+k2*dt/2),k4=derivative(t+dt,v+k3*dt);
  this.volume=v+dt*(k1+2*k2+2*k3+k4)/6;
  let alveolar=0;
  if(this.current){const exhaled=dt*(Math.max(0,-k1)+2*Math.max(0,-k2)+2*Math.max(0,-k3)+Math.max(0,-k4))/6,b=this.current,vd=deadspace(b.p.height)/1000;
   alveolar=Math.max(0,b.expired+exhaled-vd)-Math.max(0,b.expired-vd);b.expired+=exhaled;
  }
  this.co2=co2After(this.co2,alveolar*60/dt,this.p.vco2,this.calibration.va,this.p.storageTau,dt);
  this.time+=dt;
  if(this.time>=this.nextSample){this.co2Buffer.push({t:this.time,v:this.co2});this.nextSample=this.time+.025;}
  while(this.co2Buffer.length>2&&this.co2Buffer[1].t<this.time-physiology.maxDelay)this.co2Buffer.shift();
  const past=this.time-this.p.chemoDelay,buffer=this.co2Buffer;
  if(past<=0)this.sensedCO2=this.initialSettings.referenceCO2;
  else if(this.p.chemoDelay===0)this.sensedCO2=this.co2;
  else {let lo=0,hi=buffer.length;while(lo<hi){const mid=(lo+hi)>>1;if(buffer[mid].t<=past)lo=mid+1;else hi=mid;}const a=buffer[Math.max(0,lo-1)],b=buffer[lo]||{t:this.time,v:this.co2};this.sensedCO2=a.v+(b.v-a.v)*clamp((past-a.t)/(b.t-a.t||1),0,1);}
  this.sample={pressure:this.active.epap+airwayPressure(this.current,this.time),volume:this.volume*1000,flow:derivative(this.time,this.volume)*60,pmus:pmusAt(this.time)};
  if(this.samples.at(-1).t<=this.time-.025+1e-9)this.record();
 }
 record(){this.samples.push({t:this.time,...this.sample});if(this.samples.length>7000)this.samples.splice(0,1000);}
 advance(dt){if(!Number.isFinite(dt)||dt<0)throw Error('Invalid time step');this.pendingTime+=dt;while(this.pendingTime>=physiology.dt-1e-10){this.integrate(physiology.dt);this.pendingTime-=physiology.dt;}}
 step(){const n=this.current,t=this.time;while(this.current===n&&this.time-t<20)this.advance(.005);}
}
