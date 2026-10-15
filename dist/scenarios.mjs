export const scenarios=Object.freeze([
 {id:'resistance',title:'Higher resistance (+30%)',scale:{resistance:1.3},watch:'Watch flow decay, cycling time and residual volume, then PS adaptation.'},
 {id:'compliance',title:'Lower compliance (−30%)',scale:{compliance:.7},watch:'Watch the immediate VT and flow changes, then PS and delayed patient drive.'},
 {id:'demand',title:'Higher demand (+30%)',scale:{demand:1.3},watch:'Watch model CO₂, then Pmus amplitude and patient rhythm increase.'},
 {id:'effort',title:'Pause patient effort',changes:{apnea:true},watch:'Watch transition to timed backup. Compare fixed and intelligent BUR.'},
 {id:'early',title:'Earlier cycling',changes:{cyclePercent:50},watch:'Watch support end relative to Pmus. Ti min can prevent earlier cycling.'},
 {id:'late',title:'Later cycling',changes:{cyclePercent:10},watch:'Watch longer support and possible Ti-max termination; expiration may shorten.'}
]);
const names={resistance:'R',compliance:'C',demand:'Required Va',apnea:'Effort paused',cyclePercent:'Cycle threshold'};
const units={resistance:' cmH₂O/(L/s)',compliance:' mL/cmH₂O',demand:' L/min',cyclePercent:'%'};
const format=(key,v)=>typeof v==='boolean'?(v?'yes':'no'):String(v)+(units[key]||'');
const limits={resistance:[1,25],compliance:[15,100],demand:[1,15]};
export function scenarioChange(p,scenario){
 const before={},after={},details=[],changes={...scenario.changes},capped=new Set();
 for(const [key,factor]of Object.entries(scenario.scale||{})){
  const raw=p[key]*factor,[min,max]=limits[key];
  changes[key]=Number(Math.max(min,Math.min(max,raw)).toFixed(2));
  if(raw<min||raw>max)capped.add(key);
 }
 for(const [key,value]of Object.entries(changes)){
  if(p[key]===value)continue;
  before[key]=p[key];after[key]=value;
  details.push(`${names[key]||key}: ${format(key,p[key])} → ${format(key,value)}${capped.has(key)?' (setting limit)':''}`);
 }
 return {before,after,label:`${scenario.title} · ${details.join('; ')}`};
}
