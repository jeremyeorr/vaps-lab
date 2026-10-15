import {Model,defaults,targets,deadspace,cycleNames,requiredVa} from './model.mjs';
import {scenarios,scenarioChange} from './scenarios.mjs';
const $=id=>document.getElementById(id),model=new Model();
let running=!matchMedia('(prefers-reduced-motion: reduce)').matches,lastFrame=0,lastCards=0,lastTrends=-1;
const ns='http://www.w3.org/2000/svg';
function node(tag,attrs={},text){const n=document.createElementNS(ns,tag);for(const [k,v]of Object.entries(attrs))n.setAttribute(k,v);if(text!==undefined)n.textContent=text;return n;}
let scenarioUndo=[];
$('scenario-toggle').addEventListener('click',()=>{const panel=$('scenario-panel');panel.hidden=!panel.hidden;$('scenario-toggle').setAttribute('aria-expanded',String(!panel.hidden));$('scenario-toggle').innerHTML=panel.hidden?'Step changes <span aria-hidden="true">＋</span>':'Step changes <span aria-hidden="true">−</span>';renderPlots();});
const fields=[...document.querySelectorAll('[data-setting]')];
function syncControls(){for(const f of fields)f.value=f.id==='vco2'?Number(model.p.vco2.toFixed(2)):model.p[f.id];for(const r of document.querySelectorAll('[name=targetMode]'))r.checked=r.value===model.p.targetMode;$('ibw-sex').value=model.p.ibwSex;$('intelligent').value=String(model.p.intelligent);$('timed-cycling').value=model.p.timedCycling;$('apnea').checked=model.p.apnea;renderTargets();}
function renderTargets(){const p=model.p,t=targets(p);$('ti').disabled=p.timedCycling==='flow';$('vt-field').hidden=p.targetMode!=='vt';$('va-field').hidden=p.targetMode!=='va';$('deadspace').textContent=t.vd.toFixed(0)+' mL';$('calc-ve').textContent=t.ve.toFixed(2);$('calc-va').textContent=t.va.toFixed(2);$('calc-vt').textContent=Math.round(t.vt);$('calc-vt-kg').textContent=t.vtPerKg.toFixed(1)+' cc/kg IBW';$('calc-ibw').textContent=`IBW ${t.ibw.toFixed(1)} kg · ${p.ibwSex} PBW`;$('ibw-height-note').hidden=p.height>=152.4;$('calculation-rate').textContent=`(at set ${p.intelligent?'target patient rate':'backup rate'})`;$('rate-assumption').textContent=`Assumes RR = ${p.bur}/min. Observed RR may differ from ${p.intelligent?'the target patient rate and active backup rate':'BUR'}; achieved ventilation below uses observed RR.`;$('bur-label').innerHTML=(p.intelligent?'Target patient rate':'Backup rate')+' <small>/min</small>';$('backup-help').textContent=p.intelligent?`Intelligent BUR: background ${(p.bur*2/3).toFixed(1)}/min → target ${p.bur}/min; faster escalation below target Va. Illustrative iBR approximation.`:`Fixed BUR schedules ${p.bur}/min. Patient triggers may be faster; a long inspiration or lockout can delay backup.`;$('demand-output').textContent=Number(p.demand.toFixed(2))+' L/min';$('compliance-output').textContent=p.compliance+' mL/cmH₂O';$('resistance-output').textContent=p.resistance+' cmH₂O/(L/s)';
 const c=model.calibration,threshold=p.pmusGain>0?p.referenceCO2-c.amplitude/p.pmusGain:null;
 $('calibrated-pmus').textContent=`${c.amplitude.toFixed(2)} cmH₂O peak · ${c.vt.toFixed(0)} mL unassisted VT at ${c.settings.baselineRate}/min`;
 $('physiology-summary').textContent=`Required Va ${requiredVa(p).toFixed(2)} L/min at reference CO₂ ${p.referenceCO2} mmHg · VCO₂ ${p.vco2.toFixed(2)} mL/min STPD. Zero-effort threshold: ${threshold===null?'none (Pmus gain = 0)':threshold.toFixed(1)+' mmHg sensed CO₂'}.`;
 $('calibration-note').textContent='Baseline Pmus is calibrated at each new run (Reset). Step changes preserve it; use Reset to define a new baseline patient.';
}
function configure(changes,label){try{const values={};for(const f of fields){if(f.disabled)continue;if(f.value.trim()===''||!f.checkValidity())throw Error(`Enter a valid ${f.labels[0].textContent.trim()} between ${f.min} and ${f.max}.`);values[f.id]=Number(f.value);}model.configure({...values,...changes,vco2:changes.vco2??model.p.vco2,demand:changes.demand??model.p.demand},label);syncControls();$('settings-error').hidden=true;$('run').disabled=false;$('step').disabled=running;renderTargets();lastTrends=-1;renderCards();renderPlots();return true;}catch(e){setRunning(false);$('settings-error').textContent=e.message;$('settings-error').hidden=false;$('run').disabled=true;$('step').disabled=true;return false;}}
for(const f of fields)f.addEventListener(f.type==='range'?'input':'change',()=>{if(f.value.trim()===''||!f.checkValidity()){setRunning(false);$('settings-error').hidden=false;$('settings-error').textContent=`Enter a valid ${f.labels[0].textContent.trim()} between ${f.min} and ${f.max}.`;$('run').disabled=true;$('step').disabled=true;return;}configure({[f.id]:Number(f.value)},f.id==='demand'?'Demand changed':f.id==='compliance'?'Compliance changed':f.id==='resistance'?'Resistance changed':f.id==='riseTime'?'Rise time changed':f.id==='triggerFlow'?'Flow-trigger sensitivity changed':['vco2','referenceCO2','baselineRate','pmusGain','rrGain','chemoDelay','storageTau','neuralTi'].includes(f.id)?'Patient physiology changed':'Device / target changed');});
for(const r of document.querySelectorAll('[name=targetMode]'))r.addEventListener('change',()=>{if(!r.checked)return;const t=targets(model.p);const changes={targetMode:r.value};if(r.value==='va')changes.vaTarget=Math.min(15,Math.max(1,Number(t.va.toFixed(2))));else changes.vtTarget=Math.min(1000,Math.max(200,Math.round(t.vt)));configure(changes,'Target mode changed');syncControls();});
$('ibw-sex').addEventListener('change',()=>configure({ibwSex:$('ibw-sex').value},'IBW formula changed'));
$('intelligent').addEventListener('change',()=>configure({intelligent:$('intelligent').value==='true'},'Backup mode changed'));
$('timed-cycling').addEventListener('change',()=>{if(configure({timedCycling:$('timed-cycling').value},'Timed-breath cycling changed'))syncControls();});
$('apnea').addEventListener('change',()=>configure({apnea:$('apnea').checked},$('apnea').checked?'Spontaneous effort paused':'Spontaneous effort resumed'));
function setRunning(value){running=value;lastFrame=0;$('run').textContent=running?'Ⅱ Pause':'▶ Run';$('step').disabled=running;$('sim-state').textContent=running?'● Running':'Ⅱ Paused';}
$('run').addEventListener('click',()=>setRunning(!running));$('step').addEventListener('click',()=>{model.step();renderCards();renderPlots();});
function reset(useDefaults=false){scenarioUndo=[];showScenarioNote('Apply a step change to the current run. Outcomes depend on the current patient and settings.');model.reset(useDefaults?defaults:model.p);syncControls();lastTrends=-1;lastFrame=0;$('settings-error').hidden=true;$('run').disabled=false;setRunning(running);renderCards();renderPlots();}
$('reset').addEventListener('click',()=>reset());$('defaults').addEventListener('click',()=>reset(true));$('scenario-defaults').addEventListener('click',()=>{
 model.configure({...model.initialSettings},'Starting settings restored');
 scenarioUndo=[];syncControls();$('settings-error').hidden=true;$('run').disabled=false;$('step').disabled=running;
 showScenarioNote(`At ${model.time.toFixed(1)} s · Starting settings restored. Time, history and patient/controller state are preserved.`);
 lastTrends=-1;renderCards();renderPlots();
});
function showScenarioNote(note){$('scenario-note').textContent=note;$('scenario-undo').disabled=scenarioUndo.length===0;}
for(const scenario of scenarios)$('scenario-'+scenario.id).addEventListener('click',()=>{
 const change=scenarioChange(model.p,scenario);
 if(!Object.keys(change.after).length){showScenarioNote(`${scenario.title}: ${scenario.scale?'already at the setting limit':'already at this setting'}. ${scenario.watch}`);return;}
 if(configure(change.after,change.label)){scenarioUndo.push({title:scenario.title,before:change.before});syncControls();showScenarioNote(`At ${model.time.toFixed(1)} s · ${change.label}. ${scenario.watch}`);}
});
$('scenario-undo').addEventListener('click',()=>{const last=scenarioUndo.at(-1);if(!last)return;const change=scenarioChange(model.p,{title:'Restore '+last.title,changes:last.before});if(configure(change.after,change.label)){scenarioUndo.pop();syncControls();showScenarioNote(`At ${model.time.toFixed(1)} s · ${change.label}. History is preserved.`);}});
function renderEventLog(){const recent=model.events.slice(-4);$('event-log').textContent=recent.length?recent.map(e=>`E${e.id} · ${e.t.toFixed(1)} s · ${e.label}`).join('\n'):'Step changes will be marked E1, E2… on the graphs.';}
function renderCards(){const p=model.p,b=model.current,v=model.history.at(-1),instant=model.sample,rate=v?.rate||Math.max(model.backup,model.patientDrive.rate);const mm=Math.floor(model.time/60),ss=(model.time%60).toFixed(1).padStart(4,'0');$('clock').textContent=`${mm}:${ss}`;
for(const key of ['vt','va','ve','rate'])$('live-'+key).textContent=v?(key==='vt'?Math.round(v[key]):v[key].toFixed(key==='rate'?1:2)):'—';
$('live-ps').textContent=(b?.ps||model.ps).toFixed(1);$('live-backup').textContent=`Active BUR ${model.backup.toFixed(1)}/min`;$('live-ipap').textContent=`IPAP ${((b?.ps||model.ps)+model.active.epap).toFixed(1)} · EPAP ${model.active.epap}`;
$('breath-type').textContent=b?(b.doubleTriggered?'Double trigger · same patient effort':b.trigger==='spontaneous'?'Patient-triggered':'Timed backup'):'Waiting for first trigger';
$('drive-status').textContent=`Model CO₂ ${model.co2.toFixed(1)} mmHg · sensed ${model.sensedCO2.toFixed(1)} · effort ${model.patientDrive.amplitude.toFixed(1)} cmH₂O · patient rhythm ${model.patientDrive.rate.toFixed(1)}/min · reference CO₂ ${p.referenceCO2} mmHg`;
const ended=b?.cycleReason?b:[...model.breaths].reverse().find(b=>b.cycleReason);
$('cycling-status').textContent=ended?`Last cycle: ${cycleNames[ended.cycleReason]} · device Ti ${ended.ti.toFixed(2)} s · effort at onset ${ended.effortDuration.toFixed(2)} s`:'Waiting for first cycle-off';
const count=model.breaths.filter(b=>b.doubleTriggered).length;$('double-status').textContent=`Same-effort retriggers: ${count} in retained breaths`;
const err=v?(p.targetMode==='vt'?p.vtTarget-v.vt:(p.vaTarget-v.va)*1000/rate):0;
let status=!v?'Awaiting completed breath':Math.abs(err)<10?'Near device target':err>0?'PS adapting upward':'PS adapting downward';let limit=false;if(v&&err>10&&model.ps>=p.psMax-.01){status='PS ceiling · target unmet';limit=true;}if(v&&err< -10&&model.ps<=p.psMin+.01){status='PS minimum · above target';limit=true;}$('control-status').textContent=status;$('control-status').classList.toggle('warning',limit);
const gap=v?v.va-p.demand:0;$('demand-status').textContent=v?`Va ${gap>=0?'+':''}${gap.toFixed(2)} L/min vs demand`:'Ventilation not yet measured';$('demand-status').classList.toggle('warning',!!v&&Math.abs(gap)>.6);
$('phase').textContent=b&&b.endTime===null?'Device inspiration':'Device expiration';$('instant-pmus').textContent=instant.pmus.toFixed(1);$('instant-pressure').textContent=instant.pressure.toFixed(1);$('instant-volume').textContent=Math.round(instant.volume);$('instant-flow').textContent=(instant.flow>0?'+':'')+instant.flow.toFixed(1);
$('pending-note').textContent='Patient drive and trigger sensitivity update immediately; mechanics, rise time, cycling and pressure settings apply at the next supported breath.';
}
function axes(svg,min,max,start,end,options={}){const w=Math.max(230,svg.clientWidth),h=svg.clientHeight,left=39,right=options.right??15,top=['pressure-plot','flow-plot','pmus-plot'].includes(svg.id)?31:13,bottom=22,pw=w-left-right,ph=h-top-bottom;svg.setAttribute('viewBox',`0 0 ${w} ${h}`);svg.replaceChildren();const x=t=>left+(t-start)/(end-start)*pw,y=v=>top+(max-v)/(max-min)*ph;const defs=node('defs'),clip=node('clipPath',{id:svg.id+'-clip'});clip.append(node('rect',{x:left,y:top,width:pw,height:ph}));defs.append(clip);svg.append(defs);const grid=node('g');for(let i=0;i<=4;i++){const v=min+(max-min)*i/4;grid.append(node('line',{x1:left,x2:w-right,y1:y(v),y2:y(v),class:'grid'}));grid.append(node('text',{x:left-6,y:y(v)+3,'text-anchor':'end'},Number(v.toFixed(1))));}svg.append(grid);const span=end-start,step=options.fullRun?trendTickStep(span,Math.max(2,Math.floor(pw/70))):span<=15?5:span<=30?(w<450?10:5):span<=60?(w<450?20:10):30;for(let t=Math.ceil(start/step)*step;t<=end;t+=step){svg.append(node('line',{x1:x(t),x2:x(t),y1:top,y2:h-bottom,class:'grid'}));svg.append(node('text',{x:x(t),y:h-5,'text-anchor':'middle'},Math.round(t)));}const lines=node('g',{'clip-path':`url(#${svg.id}-clip)`});svg.append(lines);return {x,y,lines,w,h,left,right,top,bottom,ph,pw};}
function path(points,key,x,y){return points.map((p,i)=>`${i?'L':'M'}${x(p.t).toFixed(2)},${y(p[key]).toFixed(2)}`).join(' ');}
function renderWaves(){const windowSeconds=Number($('time-window').value),end=Math.max(windowSeconds,model.time+1),start=end-windowSeconds;const breaths=model.breaths.filter(b=>b===model.current||b.start+b.cycle>=start),points=model.samples.filter(p=>p.t>=start);points.push({t:model.time,...model.sample});
 const scales={pressure:[0,Math.ceil(Math.max(model.p.epap+model.p.psMax,...breaths.map(b=>b.ps+b.p.epap),20)/5)*5],volume:[0,Math.ceil(Math.max(800,...points.map(p=>p.volume))/200)*200],flow:[-120,120],pmus:[-Math.ceil(Math.max(5,...points.map(p=>Math.abs(p.pmus)))/5)*5,0]};
 const flowMax=Math.ceil(Math.max(60,...points.map(p=>Math.abs(p.flow)))/30)*30;scales.flow=[-flowMax,flowMax];
 for(const key of ['pressure','volume','flow','pmus']){const svg=$(key+'-plot'),a=axes(svg,...scales[key],start,end),{x,y,lines,top,ph,left,w,right}=a;for(const b of breaths)lines.append(node('rect',{x:x(b.start),y:top,width:Math.max(0,x(Math.min(model.time,b.endTime??model.time))-x(b.start)),height:ph,fill:b.trigger==='timed'?'#fff5e4':'#eff7f5'}));
 const reference=key==='pressure'?model.active.epap:0;
 lines.append(node('line',{x1:left,x2:w-right,y1:y(reference),y2:y(reference),class:'reference'}));
 if(key==='pressure')lines.append(node('text',{x:w-right-3,y:y(reference)-4,'text-anchor':'end'},key==='pressure'?`EPAP ${reference}`:`Target ${Math.round(reference)} mL`));
 lines.append(node('path',{d:path(points,key,x,y),class:'trace'}));lines.append(node('line',{x1:x(model.time),x2:x(model.time),y1:top,y2:top+ph,stroke:'#98bcb7','stroke-width':1}));if(points.length){const last=points.at(-1);lines.append(node('circle',{cx:x(last.t),cy:y(last[key]),r:3.5,fill:key==='pmus'?'#8853aa':'#087d76'}));}
 if(key==='pressure')for(const b of breaths){if(b.start<start)continue;const timed=b.trigger==='timed',cx=x(b.start),label=b.doubleTriggered?'D':timed?'T':'P',color=b.doubleTriggered?'#b83c6d':timed?'#a66512':'#087d76',g=node('g',{'data-trigger':b.trigger,'data-double':String(b.doubleTriggered)});g.append(node('title',{},`${b.doubleTriggered?'Double trigger (same effort)':timed?'Timed backup':'Patient-triggered'} at ${b.start.toFixed(1)} s`));g.append(node(timed?'rect':'circle',timed?{x:cx-3,y:11,width:6,height:6,fill:color}:{cx,cy:14,r:3,fill:color}));if(x(b.start+b.cycle)-cx>=15)g.append(node('text',{x:cx,y:27,'text-anchor':'middle',style:`fill:${color};font-weight:700`},label));svg.append(g);}
 if(key==='flow')for(const b of breaths){
 if((b.trigger==='spontaneous'||b.p.timedCycling==='flow')&&b.peakFlow>0)lines.append(node('line',{x1:x(Math.max(start,b.start)),x2:x(Math.min(model.time,b.endTime??model.time)),y1:y(b.peakFlow*b.p.cyclePercent*.6),y2:y(b.peakFlow*b.p.cyclePercent*.6),class:'cycle-threshold'}));
 if(b.endTime===null||b.endTime<start)continue;
 const cx=x(b.endTime),label={flow:'F',min:'min',max:'max',timed:'Ti'}[b.cycleReason],g=node('g',{'data-cycle':b.cycleReason});
 g.append(node('title',{},`${cycleNames[b.cycleReason]} at ${b.endTime.toFixed(2)} s; device Ti ${b.ti.toFixed(2)} s; patient effort ${b.effortDuration.toFixed(2)} s`));
 g.append(node('path',{d:`M${cx-3},10 L${cx+3},10 L${cx},15 Z`,fill:'#a66512'}));
 if(x(b.start+b.cycle)-x(b.start)>=32)g.append(node('text',{x:cx,y:27,'text-anchor':'middle',class:'cycle-label'},label));svg.append(g);
 }
 let lastEventX=-100;
 for(const e of model.events.filter(e=>e.t>=start&&e.t<=model.time)){
 const line=node('line',{x1:x(e.t),x2:x(e.t),y1:top,y2:top+ph,stroke:'#bca4cf','stroke-width':1,'stroke-dasharray':'2 5'});line.append(node('title',{},`E${e.id}: ${e.label}`));lines.append(line);
 if(key==='pmus'&&x(e.t)-lastEventX>=35){const label=node('text',{x:x(e.t),y:18,'text-anchor':'middle',class:'event-label'},'E'+e.id);label.append(node('title',{},e.label));svg.append(label);lastEventX=x(e.t);}
 }
 }
}
// Trends grow from time zero, then retain a five-minute view independent of breath waveforms.
function trendTickStep(span,ticks){const rough=span/ticks,power=10**Math.floor(Math.log10(rough));return [1,2,5,10].find(n=>n*power>=rough)*power;}
function trendEvents(a){for(const e of model.events){if(e.t<Math.max(0,model.time-300)||e.t>model.time)continue;const line=node('line',{x1:a.x(e.t),x2:a.x(e.t),y1:a.top,y2:a.top+a.ph,stroke:'#c4afce','stroke-width':1,'stroke-dasharray':'2 4'});line.append(node('title',{},`E${e.id}: ${e.label}`));a.lines.append(line);}}
function renderTrends(){
 const end=Math.max(30,model.time),start=Math.max(0,end-300),first=model.history.findIndex(h=>h.t>=start),hist=model.history.slice(first<0?-1:Math.max(0,first-1)),initial=model.initialSettings;
 const maxima=hist.reduce((m,h)=>({ps:Math.max(m.ps,h.ps),va:Math.max(m.va,h.va,h.demand,h.target.va),vt:Math.max(m.vt,h.vt),rate:Math.max(m.rate,h.rate)}),{ps:Math.max(25,model.p.psMax,model.initialPS),va:Math.max(10,model.p.demand,targets(model.p).va,initial.demand,targets(initial).va),vt:800,rate:30});
 for(const key of ['ps','va']){
  const svg=$(key+'-trend'),max=key==='ps'?maxima.ps:Math.ceil(maxima.va/2)*2,a=axes(svg,0,max,start,end,{fullRun:true}),{x,y,lines,left,w,right}=a;
  if(key==='ps')lines.append(node('rect',{x:left,y:y(model.p.psMax),width:w-left-right,height:y(model.p.psMin)-y(model.p.psMax),fill:'#e9f1f2'}));
  else{const refs=[{t:0,demand:initial.demand,reference:targets(initial).va},...hist.map(h=>({t:h.t,demand:h.demand,reference:h.target.va}))];lines.append(node('path',{d:path(refs,'demand',x,y),class:'reference demand'}));lines.append(node('path',{d:path(refs,'reference',x,y),class:'reference'}));}
  const points=key==='ps'?[{t:0,ps:model.initialPS},...hist]:hist;
  lines.append(node('path',{d:path(points,key,x,y),class:'trace'}));trendEvents(a);
 }
 const svg=$('vt-rr-trend'),vtMax=Math.ceil(maxima.vt/200)*200,rrMax=Math.ceil(maxima.rate/10)*10,a=axes(svg,0,vtMax,start,end,{fullRun:true,right:43}),rrY=v=>a.top+(rrMax-v)/rrMax*a.ph;
 a.lines.append(node('path',{d:path(hist,'vt',a.x,a.y),class:'trace vt-trace'}));
 a.lines.append(node('path',{d:path(hist,'rate',a.x,rrY),class:'trace rate-trace'}));
 for(let i=0;i<=4;i++){const value=rrMax*i/4;svg.append(node('text',{x:a.w-a.right+7,y:rrY(value)+3,'text-anchor':'start',class:'rate-axis'},Number(value.toFixed(1))));}
 trendEvents(a);
}
function renderPlots(){renderWaves();renderTrends();renderEventLog();}
$('time-window').addEventListener('change',renderPlots);
function tick(now){if(running&&lastFrame){model.advance(Math.min((now-lastFrame)/1000,.1)*Number($('playback').value));renderWaves();if(now-lastCards>90){renderCards();lastCards=now;}if(model.history.length!==lastTrends||now-lastTrendsTime>500){renderTrends();lastTrends=model.history.length;lastTrendsTime=now;}}lastFrame=now;requestAnimationFrame(tick);}
let lastTrendsTime=0;document.addEventListener('visibilitychange',()=>{lastFrame=0;});new ResizeObserver(renderPlots).observe($('pressure-plot'));
// Read-only teaching state remains available to browser agents when supported.
const context=document.modelContext,lifecycle=new AbortController();if(context?.registerTool){try{Promise.resolve(context.registerTool({name:'read_vaps_teaching_model',title:'Read teaching simulation',description:'Read target, device, patient, actual breathing and animation state of the illustrative NIV model.',inputSchema:{type:'object',properties:{},additionalProperties:false},annotations:{readOnlyHint:true},execute(){return {paused:!running,seconds:model.time,playback:Number($('playback').value),settings:{...model.p},calculated:targets(model.p),current:structuredClone(model.current),co2:model.co2,sensedCO2:model.sensedCO2,patientDrive:model.patientDrive,calibration:structuredClone(model.calibration),lastCompleted:model.history.at(-1)||null};}},{signal:lifecycle.signal})).catch(()=>{});}catch{}window.addEventListener('pagehide',()=>lifecycle.abort(),{once:true});}
syncControls();setRunning(running);renderCards();renderPlots();requestAnimationFrame(tick);
