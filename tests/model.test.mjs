import test from 'node:test';
import assert from 'node:assert/strict';
import {Model,defaults,targets,deadspace,flowFromMotion,musclePressure,predictedBodyWeight,cycleReason,drive,patientRate,airwayPressure,requiredVa,calibrateEupnea,co2After,referenceMechanics,unassistedCycle} from '../dist/model.mjs';
import {scenarios,scenarioChange} from '../dist/scenarios.mjs';
const near=(a,b,t=1e-6)=>assert.ok(Math.abs(a-b)<t,`${a} != ${b}`);
const firstCycle=p=>{const m=new Model({...defaults,...p});m.step();while(m.current.endTime===null)m.advance(.005);return m;};
test('CO2 drives rate and effort with separate gains and no direct Va response',()=>{const m=new Model(),p=m.p,a=m.calibration.amplitude;near(patientRate(40,p),16);near(patientRate(44,p),17);near(patientRate(36,p),15);near(drive(44,p,a).amplitude,a+4);near(drive(40,p,a).amplitude,a);assert.equal(drive(40-a,p,a).rate,0);assert.equal(drive(40,{...p,apnea:true},a).rate,0);near(drive(45,{...p,pmusGain:0,rrGain:0},a).amplitude,a);near(drive(45,{...p,pmusGain:0,rrGain:0},a).rate,16);});
test('metabolic and mechanics steps preserve calibration, phase, CO2 and effort until feedback',()=>{const m=new Model();m.advance(20);const c=m.calibration,time=m.time,co2=m.co2,phase=m.neuralPhase,pulse=m.effortPulse,drive0=m.patientDrive;m.configure({demand:7.41,resistance:15});assert.equal(m.calibration,c);assert.equal(m.time,time);assert.equal(m.co2,co2);assert.equal(m.neuralPhase,phase);assert.equal(m.effortPulse,pulse);assert.deepEqual(m.patientDrive,drive0);near(m.p.vco2,7.41*40/.863);m.reset(m.p);assert.notEqual(m.calibration.amplitude,c.amplitude);});
test('high backup can still compete with an independent patient rhythm',()=>{const m=new Model({...defaults,bur:25});m.advance(60);assert.ok(m.breaths.some(b=>b.trigger==='timed'));assert.ok(m.breaths.some(b=>b.trigger==='spontaneous'));});
test('default backup takes over after effort is paused',()=>{const m=new Model();m.advance(60);m.configure({apnea:true});m.advance(30);const recent=m.breaths.filter(b=>b.start>65);assert.ok(recent.length>=4);assert.ok(recent.every(b=>b.trigger==='timed'));for(let i=1;i<recent.length;i++)near(recent[i].start-recent[i-1].start,4,.006);});
test('baseline uses resistance 5, compliance 50 and 0.8-second Pmus effort',()=>{assert.equal(defaults.resistance,5);assert.equal(defaults.compliance,50);assert.equal(defaults.neuralTi,.8);const m=new Model();m.advance(.5);assert.equal(m.effortPulse.duration,.8);assert.equal(defaults.ti,1.2);});
test('percentage scenarios compound current settings, respect limits and restore precisely',()=>{
 for(const [key,first,second,start,expected,limit] of [['resistance',6.5,8.45,12,15.6,25],['compliance',35,24.5,80,56,15],['demand',7.41,9.63,6,7.8,15]]){
  const scenario=scenarios.find(s=>s.id===key),m=new Model();
  const a=scenarioChange(m.p,scenario);assert.equal(a.after[key],first);m.configure(a.after);
  const b=scenarioChange(m.p,scenario);assert.equal(b.after[key],second);m.configure(b.after);
  m.configure(b.before);assert.equal(m.p[key],first);m.configure(a.before);assert.equal(m.p[key],defaults[key]);
  m.configure({[key]:start});assert.equal(scenarioChange(m.p,scenario).after[key],expected);
  let last;
  for(let i=0;i<30;i++){const change=scenarioChange(m.p,scenario);if(!Object.keys(change.after).length)break;m.configure(change.after);last=change;}
  assert.equal(m.p[key],limit);assert.match(last.label,/setting limit/);assert.deepEqual(scenarioChange(m.p,scenario).after,{});
 }
});
test('flow threshold cycles on the falling flow and respects Ti-min release',()=>{const b={start:0,endTime:null,trigger:'spontaneous',p:{...defaults,tiMin:.5,tiMax:2},peakFlow:0,heldByMin:false};assert.equal(cycleReason(b,.1,1),null);assert.equal(cycleReason(b,.3,.2),null);assert.equal(cycleReason(b,.5,.2),'min');const early=firstCycle({cyclePercent:50}),late=firstCycle({cyclePercent:10});assert.ok(early.current.ti<late.current.ti);assert.equal(late.current.cycleReason,'flow');assert.ok(late.sample.flow/60<=late.current.peakFlow*late.p.cyclePercent/100,'Flow is below the threshold after cycling starts pressure release');});
test('Ti max forces cycling; equal limits give fixed Ti; fixed timed breaths use Ti independently of the window',()=>{const max=firstCycle({tiMax:.4,cyclePercent:5});near(max.current.ti,.4,.006);assert.equal(max.current.cycleReason,'max');const equal=firstCycle({tiMin:.5,tiMax:.5});near(equal.current.ti,.5,.006);assert.equal(equal.current.cycleReason,'max');for(const ti of [.2,1.2,3]){const m=firstCycle({apnea:true,ti,tiMin:.5,tiMax:1.5});near(m.current.ti,ti,.006);assert.equal(m.current.cycleReason,'timed');}});
test('cycling settings queue until next breath and invalid windows are rejected atomically',()=>{const m=new Model();m.step();const b=m.current;m.configure({cyclePercent:80,tiMin:.5,tiMax:1});assert.equal(b.p.cyclePercent,25);m.step();assert.equal(m.current.p.cyclePercent,80);assert.throws(()=>m.configure({tiMin:1.5,tiMax:1}));assert.equal(m.p.tiMin,.5);assert.throws(()=>m.configure({cyclePercent:100}));});
test('sustained effort can double trigger after expiration without resetting volume',()=>{const m=new Model({...defaults,cyclePercent:80,neuralTi:2,compliance:20,resistance:5,psMin:4,psMax:4,demand:9});let found=false;for(let i=0;i<36000&&!found;i++){const previous=m.current,volume=m.volume;m.advance(.005);if(m.current!==previous&&m.current.doubleTriggered){found=true;assert.equal(m.current.effortId,previous.effortId);assert.equal(m.current.trigger,'spontaneous');assert.ok(m.current.start>=previous.endTime+.42-1e-8);assert.ok(m.sample.pmus<0);assert.ok(m.volume>0);assert.ok(Math.abs(m.volume-volume)<.02);}}assert.ok(found,'Expected a same-effort retrigger in the early-cycling high-drive example');});
test('absent effort does not create double triggers and cycles do not overlap',()=>{const m=new Model({...defaults,apnea:true,ti:3,tiMax:3,bur:30});m.advance(60);assert.ok(m.breaths.every(b=>!b.doubleTriggered&&b.trigger==='timed'));for(let i=1;i<m.breaths.length;i++)assert.ok(m.breaths[i].start>=m.breaths[i-1].endTime+.42-1e-8);});
test('scenario steps and restoration preserve time, state, history and unrelated settings',()=>{for(const scenario of scenarios){const m=new Model();m.advance(20);const time=m.time,volume=m.volume,co2=m.co2,history=m.history.length,b=m.current,change=scenarioChange(m.p,scenario);m.configure(change.after,change.label);assert.equal(m.time,time);assert.equal(m.volume,volume);assert.equal(m.co2,co2);assert.equal(m.history.length,history);assert.equal(m.current,b);assert.equal(m.events.at(-1).t,time);assert.match(m.events.at(-1).label,/→/);for(const [key,value]of Object.entries(change.after))assert.equal(m.p[key],value);if(!scenario.scale)assert.deepEqual(scenarioChange(m.p,scenario).after,{});m.configure({epap:8});m.configure(change.before);assert.equal(m.p.epap,8);for(const [key,value]of Object.entries(change.before))assert.equal(m.p[key],value);}});
test('target conversion uses height-derived dead space and actual rate',()=>{near(deadspace(175),120);near(targets(defaults,30).va,11.4);near(targets({...defaults,targetMode:'va'},30).vt,310);});
test('semi-sinusoidal muscle effort starts and ends at zero',()=>{const e={start:2,duration:1.2,amplitude:5};near(musclePressure(e,2),0);near(musclePressure(e,2.6),-5);near(musclePressure(e,3.2),0);near(musclePressure(e,4),0);});
test('equation of motion responds to driving pressure, resistance and elastic recoil',()=>{const p={...defaults,compliance:40,resistance:10};near(flowFromMotion(.4,10,0,p),0);near(flowFromMotion(.4,10,-2,p),.2);near(flowFromMotion(.4,0,0,p),-1);near(flowFromMotion(.4,10,-2,{...p,resistance:20}),.1);});
test('every recorded sample obeys the equation of motion',()=>{const m=new Model();m.advance(40);for(const s of m.samples){const q=flowFromMotion(s.volume/1000,s.pressure-defaults.epap,s.pmus,defaults);near(q*60,s.flow,1e-7);}assert.ok(m.history.at(-1).vt>0);});
test('passive expiration follows the analytic RC exponential and retains volume',()=>{const m=new Model({...defaults,apnea:true,resistance:25,compliance:100});m.step();m.advance(1.4);const v=m.volume;m.advance(.5);near(m.volume,v*Math.exp(-.5/2.5),1e-8);assert.ok(m.volume>0);near(m.sample.pmus,0);});
test('expired flow integral matches reported expired VT',()=>{const m=new Model();m.step();let volume=0,old=m.sample.flow,first=m.current;while(m.current===first){m.advance(.005);volume+=(Math.max(0,-old)+Math.max(0,-m.sample.flow))/2*.005/60;old=m.sample.flow;}near(m.history.at(-1).vt,volume*1000,.1);});
test('patient clock is independent of timed starts and device Ti',()=>{const m=new Model({...defaults,bur:30,neuralTi:1.8,ti:.6});m.advance(30);assert.ok(m.breaths.some(b=>b.trigger==='timed'));assert.ok(m.samples.some(s=>s.pmus<-.1&&s.pressure<defaults.epap+.01));});
test('metabolic steps change CO2 and delayed drive in the appropriate direction',()=>{const high=new Model(),low=new Model();high.configure({demand:9});low.configure({demand:2});high.advance(120);low.advance(120);assert.ok(high.co2>low.co2);assert.ok(high.patientDrive.amplitude>low.patientDrive.amplitude);assert.ok(high.patientDrive.rate>low.patientDrive.rate);});
test('default supported run remains finite with calibrated effort and physiological CO2 feedback',()=>{const m=new Model();assert.equal(defaults.bur,15);assert.equal(defaults.baselineRate,16);m.advance(600);const late=m.history.filter(b=>b.t>300);assert.ok(late.length>50);assert.ok(late.every(b=>b.ps>=4&&b.ps<=20&&b.vt>0&&Number.isFinite(b.co2)));assert.ok(m.co2>25&&m.co2<50);near(m.patientDrive.rate,patientRate(m.sensedCO2,m.p));assert.equal(defaults.speed,5);});
test('fixed step integration is invariant to animation speed/frame partition',()=>{const a=new Model(),b=new Model();for(let i=0;i<1000;i++)a.advance(.02);for(let i=0;i<500;i++)b.advance(.04);near(a.volume,b.volume);near(a.co2,b.co2);near(a.time,b.time);});
test('intelligent backup remains available above target and resets on patient triggering',()=>{const m=new Model({...defaults,apnea:true,intelligent:true,vaTarget:1,targetMode:'va'});m.advance(80);assert.ok(m.breaths.every(b=>b.trigger==='timed'));assert.ok(m.breaths[0].backup>10&&m.breaths[0].backup<15);assert.ok(m.backup<=15);m.configure({apnea:false,demand:15});m.advance(120);assert.ok(m.breaths.some(b=>b.trigger==='spontaneous'&&Math.abs(b.backup-10)<1e-6));});
test('extreme mechanics and demands remain finite and respect pressure limits',()=>{for(const compliance of [15,100])for(const resistance of [1,25])for(const demand of [1,15])for(const intelligent of [false,true]){const m=new Model({...defaults,compliance,resistance,demand,intelligent});m.advance(180);assert.ok(Number.isFinite(m.co2)&&m.co2>0);for(const s of m.samples){assert.ok(Object.values(s).every(Number.isFinite));assert.ok(s.volume>=-1e-6);}for(const b of m.breaths)assert.ok(b.ps>=b.p.psMin&&b.ps<=b.p.psMax);}});
test('settings validation is atomic and historical mechanics remain unchanged',()=>{const m=new Model();m.step();const first=m.current;assert.throws(()=>m.configure({psMin:25,psMax:10}));assert.equal(m.p.psMin,4);m.configure({compliance:20});assert.equal(first.p.compliance,defaults.compliance);m.step();assert.equal(m.active.compliance,20);});

test('IBW uses ARDSNet sex and height formulas and unrounded normalization',()=>{near(predictedBodyWeight(152.4,'male'),50);near(predictedBodyWeight(152.4,'female'),45.5);near(predictedBodyWeight(175,'male'),70.566);near(predictedBodyWeight(175,'female'),66.066);for(const ibwSex of ['male','female'])for(const height of [110,152.4,175,200,250])for(const targetMode of ['vt','va']){const p={...defaults,ibwSex,height,targetMode},t=targets(p);assert.ok(t.ibw>0);near(t.vtPerKg,t.vt/t.ibw);}near(targets({...defaults,vtTarget:600}).vtPerKg,600/70.566);near(targets({...defaults,targetMode:'va',bur:30}).vtPerKg,310/70.566);});
test('changing the IBW formula does not change ventilation or dynamics',()=>{const a=new Model(),b=new Model({...defaults,ibwSex:'female'});a.advance(20);b.advance(20);near(a.co2,b.co2);near(a.volume,b.volume);near(targets(a.p).va,targets(b.p).va);assert.notEqual(targets(a.p).vtPerKg,targets(b.p).vtPerKg);assert.throws(()=>a.configure({ibwSex:'invalid'}));assert.equal(a.p.ibwSex,'male');});

test('timed flow cycling obeys threshold, Ti min and Ti max without changing trigger source',()=>{
 for(const [settings,reason] of [[{tiMin:1,tiMax:2},'min'],[{tiMin:.2,tiMax:2,cyclePercent:10},'flow'],[{tiMin:.2,tiMax:.3,cyclePercent:5},'max']]){
  const m=firstCycle({apnea:true,timedCycling:'flow',...settings});
  assert.equal(m.current.trigger,'timed');assert.equal(m.current.cycleReason,reason);
  assert.ok(m.current.ti>=m.p.tiMin-.006&&m.current.ti<=m.p.tiMax+.006);
 }
 const m=new Model({...defaults,apnea:true});m.step();const first=m.current;
 m.configure({timedCycling:'flow'});assert.equal(first.p.timedCycling,'fixed');m.step();assert.equal(m.current.p.timedCycling,'flow');
 assert.throws(()=>m.configure({timedCycling:'invalid'}));assert.equal(m.p.timedCycling,'flow');
});

test('full-run history retains the first interval past 600 breaths and clears on reset',()=>{const m=new Model();m.step();m.step();const first=m.history[0];m.advance(2600);assert.ok(m.history.length>600);assert.equal(m.history[0],first);for(let i=0;i<105;i++)m.configure({demand:5.7});assert.equal(m.events[0].id,1);assert.equal(m.events.length,105);m.reset();assert.equal(m.history.length,0);assert.equal(m.events.length,0);});

test('rise time controls the ramp and early cycling produces a continuous falling pressure',()=>{
 for(const riseTime of [50,150,600]){
  const b={start:0,ps:12,endTime:null,p:{...defaults,riseTime}},tr=riseTime/1000;
  near(airwayPressure(b,0),0);near(airwayPressure(b,tr/2),6);near(airwayPressure(b,tr),12);
  b.endTime=tr/4;const peak=airwayPressure(b,b.endTime);let previous=peak;
  for(let i=1;i<=24;i++){const pressure=airwayPressure(b,b.endTime+i*.005);assert.ok(pressure<=previous+1e-10);previous=pressure;}
  near(previous,0);assert.ok(peak<12);
 }
 const fast=new Model({...defaults,apnea:true,riseTime:50}),slow=new Model({...defaults,apnea:true,riseTime:600});
 fast.step();slow.step();fast.advance(.05);slow.advance(.05);assert.ok(fast.sample.pressure>slow.sample.pressure);assert.ok(fast.volume>slow.volume);
});
test('trigger sensitivity changes patient trigger delay, while absent effort still uses backup',()=>{
 const low=new Model({...defaults,triggerFlow:.5}),high=new Model({...defaults,triggerFlow:9});low.step();high.step();
 assert.equal(low.current.trigger,'spontaneous');assert.equal(high.current.trigger,'spontaneous');assert.ok(high.current.start>low.current.start);
 for(const triggerFlow of [.5,9]){const m=new Model({...defaults,triggerFlow,apnea:true});m.step();assert.equal(m.current.trigger,'timed');near(m.current.start,4,.006);}
});
test('new settings preserve current breaths and state, validate atomically and restore baseline',()=>{
 const m=new Model();m.step();const b=m.current,time=m.time,volume=m.volume,ps=m.ps,phase=m.neuralPhase;
 m.configure({riseTime:600,triggerFlow:4});assert.equal(b.p.riseTime,150);assert.equal(m.time,time);assert.equal(m.volume,volume);assert.equal(m.ps,ps);assert.equal(m.neuralPhase,phase);
 m.step();assert.equal(m.current.p.riseTime,600);assert.equal(m.current.p.triggerFlow,4);
 for(const changes of [{riseTime:0},{riseTime:650},{riseTime:175},{triggerFlow:.6},{triggerFlow:0},{triggerFlow:11},{riseTime:NaN}])assert.throws(()=>m.configure(changes));
 assert.equal(m.p.riseTime,600);m.configure(m.initialSettings);assert.equal(m.p.riseTime,150);assert.equal(m.p.triggerFlow,2);
});

test('reference calibration matches analytic mechanics independently of actual patient R/C',()=>{
 for(const resistance of [1,5,25])for(const compliance of [15,50,100])for(const baselineRate of [8,16,30]){
  const p={...defaults,resistance,compliance,baselineRate},c=calibrateEupnea(p),T=60/baselineRate,Ti=Math.min(p.neuralTi,.6*T),k=1000/(100*2),w=Math.PI/Ti,A=c.amplitude;
  assert.deepEqual(c.mechanics,{compliance:100,resistance:2});
  const forced=t=>A/2*(k*Math.sin(w*t)-w*Math.cos(w*t)+w*Math.exp(-k*t))/(k*k+w*w);
  const residual=forced(Ti)*Math.exp(-k*(T-Ti))/(1-Math.exp(-k*T));let vmin=Infinity,vmax=-Infinity;
  for(let i=0;i<=10000;i++){const t=T*i/10000,v=t<=Ti?residual*Math.exp(-k*t)+forced(t):(residual*Math.exp(-k*Ti)+forced(Ti))*Math.exp(-k*(t-Ti));vmin=Math.min(vmin,v);vmax=Math.max(vmax,v);}
  near((vmax-vmin)*1000,c.vt,.03);near(c.vt,requiredVa(p)*1000/baselineRate+deadspace(p.height));
 }
});
test('CO2 storage follows analytic equilibrium and tau, with finite apnea accumulation',()=>{
 const va=5.7,vco2=va*40/.863;
 near(co2After(50,va,vco2,va,60,60),40+10/Math.E);
 near(co2After(40,0,vco2,va,60,60),80);
 near(co2After(50,2*va,2*vco2,va,60,30),40+10/Math.E);
 near(co2After(40,va,vco2,va,60,1000),40);
});
test('pure delay has no smoothing and retains history when delay increases',()=>{
 const m=new Model({...defaults,apnea:true});m.configure({vco2:400});m.advance(4);near(m.sensedCO2,40);assert.notEqual(m.co2,40);m.advance(6);
 m.configure({chemoDelay:0});m.advance(.005);near(m.sensedCO2,m.co2);
 m.configure({chemoDelay:8});m.advance(.005);const t=m.time-8,b=m.co2Buffer,i=b.findIndex(v=>v.t>t),a=b[i-1],z=b[i];near(m.sensedCO2,a.v+(z.v-a.v)*(t-a.t)/(z.t-a.t));
});
test('VCO2, reference and required Va remain linked and invalid edits are atomic',()=>{
 const m=new Model();m.configure({vco2:300});near(m.p.demand,6.47);m.configure({referenceCO2:50});near(m.p.vco2,300);near(m.p.demand,5.18);m.configure({demand:8});near(m.p.vco2,8*50/.863);
 const p=m.p;for(const changes of [{storageTau:0},{chemoDelay:61},{pmusGain:-1},{rrGain:-1},{baselineRate:0},{vco2:1100,referenceCO2:25}])assert.throws(()=>m.configure(changes));assert.equal(m.p,p);
 const c=m.calibration;m.configure(m.initialSettings);assert.equal(m.calibration,c);assert.equal(m.p.vco2,defaults.vco2);
});

 test('actual mechanics change ventilation but not reference effort, including on reset',()=>{
 const healthy=new Model({...defaults,...referenceMechanics}),loaded=new Model({...defaults,compliance:25,resistance:10});
 near(healthy.calibration.amplitude,loaded.calibration.amplitude);near(healthy.calibration.amplitude,5.8403,.0001);
 const a=loaded.calibration.amplitude;loaded.configure({compliance:15,resistance:25});loaded.reset(loaded.p);near(loaded.calibration.amplitude,a);
 const h=unassistedCycle(healthy.p,a),l=unassistedCycle(loaded.p,a);
 near(h.expired*1000,healthy.calibration.vt,.001);assert.ok(l.expired<h.expired*.5);
 assert.ok(flowFromMotion(0,0,-a,healthy.p)>flowFromMotion(0,0,-a,loaded.p));
 healthy.advance(20);loaded.advance(20);assert.ok(healthy.history.length>0&&loaded.history.length>0);assert.ok(healthy.history[0].vt>loaded.history[0].vt);
});
