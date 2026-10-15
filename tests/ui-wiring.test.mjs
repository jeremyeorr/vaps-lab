import fs from 'node:fs';
import assert from 'node:assert/strict';
import {targets,defaults} from '../dist/model.mjs';
const html=fs.readFileSync(new URL('../dist/index.html',import.meta.url),'utf8'),els=new Map();
class Element{constructor(id='',tag=''){this.id=id;this.tag=tag;this.value='';this.clientWidth=900;this.clientHeight=147;this.handlers={};this.children=[];this.labels=[{textContent:id}];this.classList={toggle(){}};}addEventListener(k,f){this.handlers[k]=f;}setAttribute(k,v){(this.attrs??={})[k]=v;if(/NaN|Infinity/.test(String(v)))throw Error(`${this.id} ${k}: ${v}`);}append(...els){this.children.push(...els);}replaceChildren(){this.children=[];}checkValidity(){if(!this.setting)return true;const v=Number(this.value),step=Number(this.step||1),n=(v-Number(this.min))/step;return this.value!==''&&Number.isFinite(v)&&v>=Number(this.min)&&v<=Number(this.max)&&(this.step==='any'||Math.abs(n-Math.round(n))<1e-7);}}
Object.defineProperty(Element.prototype,'value',{get(){return this._value??'';},set(v){this._value=String(v);}});
for(const m of html.matchAll(/<([a-z]+)\b([^>]*\bid="([^"]+)"[^>]*)>/g)){const e=new Element(m[3],m[1]);for(const a of ['value','min','max','type','step'])e[a]=m[2].match(new RegExp(a+'="([^"]*)"'))?.[1]||'';e.setting=m[2].includes('data-setting');els.set(e.id,e);}
els.get('time-window').value='30';els.get('playback').value='1';els.get('intelligent').value='false';
const radios=['vt','va'].map(v=>{const e=new Element();e.value=v;return e;});let frame;
globalThis.document={getElementById:id=>{if(!els.has(id))throw Error('Missing '+id);return els.get(id);},querySelectorAll:s=>s==='[data-setting]'?[...els.values()].filter(e=>e.setting):radios,createElementNS:(ns,tag)=>new Element('',tag),addEventListener(){}};
globalThis.window={addEventListener(){}};globalThis.matchMedia=()=>({matches:true});globalThis.ResizeObserver=class{observe(){}};globalThis.requestAnimationFrame=f=>{frame=f;};
await import('../dist/app.mjs');
assert.equal(els.get('bur').value,'15');assert.equal(els.has('restingRate'),false);assert.equal(els.get('demand').value,'5.7');assert.equal(els.get('calc-va').textContent,'5.70');assert.match(els.get('drive-status').textContent,/patient rhythm 16.0\/min · reference CO₂ 40/);
els.get('defaults').handlers.click();assert.equal(els.get('demand-output').textContent,'5.7 L/min');
assert.equal(els.get('calc-vt-kg').textContent,'7.1 cc/kg IBW');
els.get('ibw-sex').value='female';els.get('ibw-sex').handlers.change();
assert.equal(els.get('calc-vt-kg').textContent,'7.6 cc/kg IBW');
els.get('height').value='160';els.get('height').handlers.change();
assert.equal(els.get('calc-vt-kg').textContent,'9.5 cc/kg IBW');
radios[1].checked=true;radios[1].handlers.change();els.get('vaTarget').value='6';els.get('vaTarget').handlers.change();els.get('bur').value='20';els.get('bur').handlers.change();
assert.equal(els.get('calc-vt-kg').textContent,targets({...defaults,ibwSex:'female',height:160,targetMode:'va',vaTarget:6,bur:20}).vtPerKg.toFixed(1)+' cc/kg IBW');
els.get('defaults').handlers.click();assert.equal(els.get('ibw-sex').value,'male');assert.equal(els.get('calc-vt-kg').textContent,'7.1 cc/kg IBW');
console.log('IBW UI checks passed: both formulas, height change, Va/BUR changes, restore defaults.');
for(let i=0;i<35;i++)els.get('step').handlers.click();
const flatten=e=>[e,...e.children.flatMap(flatten)];
const trendPaths=()=>['ps-trend','va-trend','vt-rr-trend'].map(id=>flatten(els.get(id)).filter(e=>e.tag==='path').map(e=>e.attrs.d));
const retainedPaths=trendPaths();assert.ok(retainedPaths.every(paths=>paths.some(d=>d.includes('L'))));assert.equal(retainedPaths[2].length,2);
for(const value of ['15','60','120','30']){els.get('time-window').value=value;els.get('time-window').handlers.change();assert.deepEqual(trendPaths(),retainedPaths);}
for(const id of ['ps-trend','va-trend','vt-rr-trend']){const ticks=flatten(els.get(id)).filter(e=>e.tag==='text'&&e.attrs.y===142);assert.equal(ticks[0].textContent,0);assert.ok(Number(ticks.at(-1).textContent)>=120);}
console.log('Full-run trend checks passed: zero origin, retained early data, independent waveform windows, and two VT/RR traces.');
els.get('apnea').checked=true;els.get('apnea').handlers.change();els.get('step').handlers.click();els.get('reset').handlers.click();els.get('playback').value='2';els.get('run').handlers.click();for(let i=0;i<20;i++)frame(i*20+1);
console.log('DOM wiring smoke passed: initialization, steps, all windows, apnea, reset, 2x animation; finite SVG coordinates.');

els.get('defaults').handlers.click();if(els.get('run').textContent.includes('Pause'))els.get('run').handlers.click();
for(let i=0;i<8;i++)els.get('step').handlers.click();
const beforeTime=els.get('clock').textContent;
for(const [id,field,value] of [['resistance','resistance','6.5'],['compliance','compliance','35'],['demand','demand','7.41'],['effort','apnea',true],['early','cyclePercent','50'],['late','cyclePercent','10']]){
 const original=field==='apnea'?els.get(field).checked:els.get(field).value;
 els.get('scenario-'+id).handlers.click();
 assert.equal(field==='apnea'?els.get(field).checked:els.get(field).value,value);
 assert.equal(els.get('clock').textContent,beforeTime);
 assert.equal(els.get('scenario-undo').disabled,false);
 assert.match(els.get('event-log').textContent,/→/);
 const log=els.get('event-log').textContent;els.get('scenario-'+id).handlers.click();if(['resistance','compliance','demand'].includes(id)){assert.equal(els.get(field).value,({resistance:'8.45',compliance:'24.5',demand:'9.63'})[id]);assert.notEqual(els.get('event-log').textContent,log);assert.equal(els.get(field).checkValidity(),true);els.get('scenario-undo').handlers.click();assert.equal(els.get(field).value,value);}else assert.equal(els.get('event-log').textContent,log);
 els.get('scenario-undo').handlers.click();
 assert.equal(field==='apnea'?els.get(field).checked:els.get(field).value,original);
 assert.equal(els.get('clock').textContent,beforeTime);
 assert.equal(els.get('scenario-undo').disabled,true);
}
els.get('scenario-resistance').handlers.click();els.get('scenario-compliance').handlers.click();
els.get('scenario-undo').handlers.click();assert.equal(els.get('compliance').value,'50');assert.equal(els.get('resistance').value,'6.5');
els.get('scenario-undo').handlers.click();assert.equal(els.get('resistance').value,'5');
els.get('tiMin').value='1.5';els.get('tiMax').value='1';els.get('tiMin').handlers.change();
assert.equal(els.get('run').disabled,true);assert.match(els.get('settings-error').textContent,/Ti min/);
els.get('reset').handlers.click();assert.equal(els.get('run').disabled,false);assert.equal(els.get('tiMin').value,'0.3');assert.equal(els.get('scenario-undo').disabled,true);
console.log('Scenario UI checks passed: all six steps, compounding percentages, valid fractional controls, no-op clicks, LIFO restore, retained time, and invalid Ti-window recovery.');

els.get('timed-cycling').value='flow';els.get('timed-cycling').handlers.change();assert.equal(els.get('ti').disabled,true);
els.get('resistance').value='1';els.get('resistance').handlers.input();assert.equal(els.get('run').disabled,false);
els.get('scenario-resistance').handlers.click();assert.equal(els.get('resistance').value,'1.3');
els.get('scenario-defaults').handlers.click();assert.equal(els.get('resistance').value,'5');assert.equal(els.get('timed-cycling').value,'fixed');assert.equal(els.get('ti').disabled,false);assert.equal(els.get('clock').textContent,'0:00.0');assert.equal(els.get('scenario-undo').disabled,true);
console.log('Timed-cycling selector, resistance minimum, and starting-settings restore passed.');

// A custom run must restore its own starting settings, not factory defaults.
els.get('resistance').value='8';els.get('resistance').handlers.input();
els.get('demand').value='6.2';els.get('demand').handlers.input();
els.get('timed-cycling').value='flow';els.get('timed-cycling').handlers.change();
els.get('reset').handlers.click();
for(let i=0;i<8;i++)els.get('step').handlers.click();
els.get('scenario-resistance').handlers.click();els.get('scenario-demand').handlers.click();
els.get('scenario-effort').handlers.click();
const restoreTime=els.get('clock').textContent,restoreTraces=trendPaths(),restoreDrive=els.get('drive-status').textContent,restorePS=els.get('live-ps').textContent;
els.get('run').handlers.click();const playbackState=els.get('run').textContent;
// Restoration should also recover controls containing invalid, unapplied input.
els.get('resistance').value='';
els.get('scenario-defaults').handlers.click();
assert.equal(els.get('resistance').value,'8');assert.equal(els.get('demand').value,'6.2');assert.equal(els.get('apnea').checked,false);
assert.equal(els.get('timed-cycling').value,'flow');assert.equal(els.get('ti').disabled,true);
assert.equal(els.get('clock').textContent,restoreTime);assert.deepEqual(trendPaths(),restoreTraces);
assert.equal(els.get('live-ps').textContent,restorePS);assert.equal(els.get('run').textContent,playbackState);assert.equal(els.get('step').disabled,true);
assert.match(els.get('event-log').textContent,/Starting settings restored/);assert.match(els.get('event-log').textContent,/Higher demand/);
assert.equal(els.get('scenario-undo').disabled,true);assert.equal(els.get('settings-error').hidden,true);
frame(1000);frame(1200);assert.notEqual(els.get('clock').textContent,restoreTime);
els.get('run').handlers.click();els.get('scenario-resistance').handlers.click();els.get('scenario-defaults').handlers.click();
assert.match(els.get('run').textContent,/Run/);assert.equal(els.get('resistance').value,'8');
console.log('Starting-settings regression passed: custom baseline, preserved time/trends/PS/events, continued animation, paused-state preservation, and invalid-input recovery.');
els.get('defaults').handlers.click();

assert.deepEqual(trendPaths()[2],['','']);assert.deepEqual(trendPaths()[1].at(-1),'');

for(let i=0;i<100;i++)els.get('step').handlers.click();
for(const id of ['ps-trend','va-trend','vt-rr-trend']){const ticks=flatten(els.get(id)).filter(e=>e.tag==='text'&&e.attrs.y===142).map(e=>Number(e.textContent));assert.ok(ticks[0]>0);assert.ok(ticks.at(-1)-ticks[0]<=300);}
const fiveMinutePaths=trendPaths();els.get('time-window').value='15';els.get('time-window').handlers.change();assert.deepEqual(trendPaths(),fiveMinutePaths);
console.log('Five-minute cap passed: trends roll after 300 seconds and remain independent of waveform window.');

els.get('defaults').handlers.click();assert.equal(els.get('riseTime').value,'150');assert.equal(els.get('triggerFlow').value,'2');
els.get('riseTime').value='500';els.get('riseTime').handlers.change();els.get('triggerFlow').value='3.5';els.get('triggerFlow').handlers.change();
els.get('reset').handlers.click();for(let i=0;i<5;i++)els.get('step').handlers.click();
const advancedTime=els.get('clock').textContent;
els.get('riseTime').value='50';els.get('riseTime').handlers.change();els.get('triggerFlow').value='0.5';els.get('triggerFlow').handlers.change();
assert.match(els.get('event-log').textContent,/Rise time changed/);assert.match(els.get('event-log').textContent,/Flow-trigger sensitivity changed/);
els.get('scenario-defaults').handlers.click();assert.equal(els.get('riseTime').value,'500');assert.equal(els.get('triggerFlow').value,'3.5');assert.equal(els.get('clock').textContent,advancedTime);
els.get('defaults').handlers.click();assert.equal(els.get('riseTime').value,'150');assert.equal(els.get('triggerFlow').value,'2');
console.log('Rise-time and trigger controls: valid edits, event markers, custom baseline restoration, default reset.');

els.get('vco2').value='300';els.get('vco2').handlers.change();assert.equal(els.get('demand').value,'6.47');
els.get('referenceCO2').value='50';els.get('referenceCO2').handlers.change();assert.equal(els.get('vco2').value,'300');assert.equal(els.get('demand').value,'5.18');
const calibration=els.get('calibrated-pmus').textContent;
els.get('demand').value='7';els.get('demand').handlers.input();assert.equal(els.get('vco2').value,Number((7*50/.863).toFixed(2)).toString());assert.equal(els.get('calibrated-pmus').textContent,calibration);
els.get('pmusGain').value='0';els.get('pmusGain').handlers.change();assert.match(els.get('physiology-summary').textContent,/none/);
els.get('reset').handlers.click();assert.notEqual(els.get('calibrated-pmus').textContent,calibration);assert.match(els.get('drive-status').textContent,/Model CO₂ 50.0/);
els.get('defaults').handlers.click();assert.equal(els.get('vco2').value,'264.2');assert.equal(els.get('storageTau').value,'60');assert.equal(els.get('chemoDelay').value,'5');
console.log('Advanced physiology UI: linked inputs, gain zero, fixed step-change calibration, and reset recalibration.');
