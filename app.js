'use strict';
const $ = id => document.getElementById(id);
const names = {rule:'Rule', A_point:'A · Point MPC', B_scenario:'B · Scenario MPC', D_value_ridge:'D · Value-selected ridge'};
const colors = {rule:'#687b80', A_point:'#226b91', B_scenario:'#b96a19', D_value_ridge:'#267a62'};
const money = n => Number(n).toLocaleString('en-AU',{minimumFractionDigits:2,maximumFractionDigits:2});
const short = n => Number(n).toLocaleString('en-AU',{maximumFractionDigits:2});
let summary, replay, request = 0, timer = null;
const cache = new Map();
function comparison() {
  const rows = summary.comparisons.filter(r => r.window === $('period').value);
  const effect = $('measure').value === 'effect';
  const condition = $('condition').value;
  // The matched effect for disabled reserve is identically zero.
  const value = r => effect ? Number(r[condition]) - Number(r.off_value_aud) : Number(r[condition]);
  const max = Math.max(1,...rows.map(r => Math.abs(value(r))));
  $('resultChart').innerHTML = rows.map(r => `<div class="barrow"><span>${names[r.method]}</span><div class="bartrack"><div class="barfill" style="width:${Math.abs(value(r))/max*100}%;background:${effect && value(r)<0?'#ae4937':colors[r.method]}"></div></div><span class="barvalue">${value(r)<0?'−':''}${money(Math.abs(value(r)))}</span></div>`).join('');
  $('resultChart').setAttribute('aria-label',effect?'Matched enabled-minus-disabled operating value, AUD':'Inventory-adjusted operating value, AUD');
  $('resultCaption').textContent = effect ? 'AUD · Signed differences are printed at right; bar lengths show magnitude. Disabled compared with itself is zero.' : 'AUD · Inventory-adjusted gross operating value, including modeled wear. Bar lengths start at zero. C initialization equals A and is not counted separately.';
  $('resultTable').querySelector('tbody').innerHTML = rows.map(r=>`<tr><th scope="row">${names[r.method]}</th><td>${money(r.off_value_aud)}</td><td>${money(r.on_none_value_aud)}</td><td>${money(r.on_stress_value_aud)}</td></tr>`).join('');
}
function stop() { if(timer) clearInterval(timer); timer=null; $('play').textContent='Play'; $('play').setAttribute('aria-label','Play recorded dispatch'); }
async function loadReplay() {
  stop(); const id=++request; $('loading').textContent='Loading audited trajectory…';
  const entry=summary.cases.find(c=>c.window===$('replayPeriod').value&&c.method===$('controller').value&&c.case===$('replayCase').value);
  try {
    if(!cache.has(entry.file)) { const response=await fetch(`data/${entry.file}`); if(!response.ok) throw Error('Trajectory unavailable'); cache.set(entry.file,await response.json()); }
    if(id!==request)return;
    replay=cache.get(entry.file);
    const previous=Number($('day').value)||0;
    $('day').innerHTML=Array.from({length:replay.metrics.days},(_,d)=>`<option value="${d}">${replay.timestamps[d*288].slice(0,10)}</option>`).join('');
    $('day').value=Math.min(previous,replay.metrics.days-1); $('step').value=0;
    $('loading').textContent=`Recorded run · ${replay.rows.length.toLocaleString()} intervals · total cash AUD ${money(replay.metrics.cash_aud)} · inventory-adjusted value AUD ${money(replay.metrics.net_value_aud)}`;
    renderReplay();
  } catch(e) { if(id===request) { replay=null; $('loading').textContent='Could not load this trajectory. Check the server connection and change a selection to retry.'; $('charts').replaceChildren(); $('readout').replaceChildren(); } }
}
function renderReplay() {
  if(!replay)return;
  const day=Number($('day').value), step=Number($('step').value), start=day*288;
  const rows=replay.rows.slice(start,start+288), cols=summary.columns;
  const at=(r,k)=>r[cols.indexOf(k)];
  const charts=[
    {title:'Energy price · AUD/MWh',keys:['price'],colors:['#162c36'],labels:['Energy price']},
    {title:'Power · MW',keys:['solar_mw','discharge_mw','charge_mw','enabled_reserve_mw'],colors:['#b96a19','#226b91','#267a62','#944e79'],labels:['Solar','Discharge','Charge','Reserve']},
    {title:'Stored energy · MWh',keys:['energy_mwh'],colors:['#226b91'],labels:['Battery energy'],bounds:[0,20]},
    {title:'Reserve price · AUD/MW/h',keys:['reserve_price'],colors:['#944e79'],labels:['R6 price']}
  ];
  const W=1060,H=183,L=64,R=18,T=45,B=28,pw=W-L-R,ph=H-T-B;
  $('charts').innerHTML=charts.map(config=>{
    const vals=rows.flatMap(r=>config.keys.map(k=>at(r,k)));
    let min=config.bounds?config.bounds[0]:Math.min(0,...vals),max=config.bounds?config.bounds[1]:Math.max(1,...vals);
    if(max===min)max=min+1;
    const x=i=>L+i/287*pw,y=v=>T+(max-v)/(max-min)*ph;
    let svg=`<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${config.title}; exact selected values follow the charts"><title>${config.title}</title><text x="${L}" y="18" fill="#162c36" font-size="14" font-weight="600">${config.title}</text>`;
    config.labels.forEach((label,i)=>{svg+=`<text x="${L+360+i*135}" y="18" fill="${config.colors[i]}" font-size="12">${label}</text>`;});
    [min,(min+max)/2,max].forEach(v=>{svg+=`<line x1="${L}" x2="${W-R}" y1="${y(v)}" y2="${y(v)}" stroke="#d5d8d1"/><text x="${L-10}" y="${y(v)+4}" text-anchor="end" fill="#53666c" font-size="12">${short(v)}</text>`;});
    config.keys.forEach((k,j)=>{const points=rows.map((r,i)=>`${x(i).toFixed(2)},${y(at(r,k)).toFixed(2)}`).join(' ');svg+=`<polyline points="${points}" fill="none" stroke="${config.colors[j]}" stroke-width="1.8"/>`;});
    for(const i of [0,71,143,215,287])svg+=`<text x="${x(i)}" y="${H-6}" text-anchor="middle" fill="#53666c" font-size="12">${replay.timestamps[start+i].slice(11,16)}</text>`;
    svg+=`<line x1="${x(step)}" x2="${x(step)}" y1="${T}" y2="${H-B}" stroke="#ae4937" stroke-dasharray="4 3"/></svg>`;return svg;
  }).join('');
  const row=rows[step];
  $('clock').textContent=replay.timestamps[start+step].slice(0,16)+' UTC+10';
  const fields=[['Energy price','price','AUD/MWh'],['Solar','solar_mw','MW'],['Stored energy','energy_mwh','MWh'],['Discharge','discharge_mw','MW'],['Charge','charge_mw','MW'],['Enabled reserve','enabled_reserve_mw','MW'],['Activation energy','activation_energy_mwh','MWh'],['Interval cash less wear','reward_aud','AUD']];
  $('readout').innerHTML=fields.map(([label,key,unit])=>`<div><span>${label}</span><strong>${short(at(row,key))}</strong> <span>${unit}</span></div>`).join('');
}
async function init() {
  try { const response=await fetch('data/summary.json'); if(!response.ok)throw Error(); summary=await response.json(); comparison(); await loadReplay(); }
  catch(e) { $('resultChart').textContent='Results could not load. Serve this folder over HTTP (see the repository README).'; }
}
for(const id of ['period','condition','measure'])$(id).addEventListener('change',()=>summary&&comparison());
for(const id of ['replayPeriod','controller','replayCase'])$(id).addEventListener('change',()=>summary&&loadReplay());
$('day').addEventListener('change',()=>{stop();$('step').value=0;renderReplay();});
$('step').addEventListener('input',renderReplay);
$('play').addEventListener('click',()=>{if(!replay)return;if(timer){stop();return;}$('play').textContent='Pause';$('play').setAttribute('aria-label','Pause recorded dispatch');timer=setInterval(()=>{$('step').value=(Number($('step').value)+1)%288;renderReplay();},200);});
document.addEventListener('visibilitychange',()=>{if(document.hidden)stop();});
init();
