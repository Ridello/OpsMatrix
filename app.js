'use strict';
/* ═══════════════════════════════════════════════════
   OPSMATRIX · APPLICATION ENGINE
   ═══════════════════════════════════════════════════ */

// ── STATE ────────────────────────────────────────────
const State = {
  transactions: [],
  filter: 'all',
  search: '',
  page: 1,
  pageSize: 12,
  currentView: 'dashboard',
};

const kpiState = {
  volume: 342.7e9, success: 97.3, failed: 1284,
  pending: 48.2e6, fraud: 2.4, latency: 42,
};

const kpiSparkData = {};
let txCounter = 150000;
let trendChart, donutChart, barChart, riskTrendChart, riskDonutChart, fraudBarChart, apiLatencyChart;

// ── UTILITY ──────────────────────────────────────────
const rand    = (a, b) => a + Math.random() * (b - a);
const randInt = (a, b) => Math.floor(rand(a, b));
const pick    = arr => arr[randInt(0, arr.length)];

// ── SEED DATA ────────────────────────────────────────
const CUSTOMERS = [
  'Emeka Okafor','Fatima Al-Hassan','Chen Wei','Sofia Andrade','James Okonkwo',
  'Amara Diallo','Ravi Patel','Elena Volkov','Marcus Thompson','Aisha Kamara',
  'Luca Ferrari','Yuki Tanaka','Grace Mensah','Carlos Rivera','Hannah Schmidt',
  'Oluwaseun Adeyemi','Priya Sharma','David Chen','Nadia Osei','Alex Petrov',
];
const CHANNELS = [
  {name:'Visa Card',     dot:'#3B82F6'},
  {name:'Mastercard',    dot:'#EF4444'},
  {name:'Bank Transfer', dot:'#10B981'},
  {name:'Mobile Money',  dot:'#8B5CF6'},
  {name:'Crypto',        dot:'#F59E0B'},
  {name:'USSD',          dot:'#06B6D4'},
];
const STATUSES   = ['success','success','success','success','pending','pending','failed','flagged'];
const MERCHANTS  = ['Konga','Jumia Pay','Flutterwave','Paystack','PiggyVest','Cowrywise','OPay','PalmPay','Moniepoint'];
const REFUND_REASONS = ['Duplicate charge','Item not received','Customer dispute','Wrong amount','Fraud chargeback'];
const FRAUD_TYPES    = ['Velocity abuse','Card testing','Account takeover','Synthetic identity','Geo-mismatch'];
const RISK_TRIGGERS  = ['Velocity check','Geo anomaly','Device mismatch','Unusual pattern','High-value limit'];
const LOG_ACTORS = ['system','ops-user:AO','ops-user:BT','api-gateway','fraud-engine','settlement-svc'];
const LOG_MSGS = [
  {level:'info',    msg:'Settlement batch #SB-9182 initiated for ₦48.2M'},
  {level:'success', msg:'API key rotated for merchant ID 4421'},
  {level:'warning', msg:'Rate limit threshold reached: partner PayCo'},
  {level:'error',   msg:'Webhook delivery failed: TXN150234 → merchant callback'},
  {level:'info',    msg:'Reconciliation report generated for 2024-01-30'},
  {level:'success', msg:'Fraud rule updated: velocity_daily_limit → 50 → 35'},
  {level:'warning', msg:'Pending settlement age exceeded 24h threshold'},
  {level:'info',    msg:'New integration activated: Moniepoint v2'},
  {level:'error',   msg:'DB replication lag spike: 340ms'},
  {level:'success', msg:'Chargeback resolved: REF-CB9021 in favour of merchant'},
];

// ── DATA GENERATORS ──────────────────────────────────
function genTxId()   { return 'TXN' + (++txCounter); }
function genAmount() { const r=[[500,5000],[5000,50000],[50000,500000],[1000000,5000000]]; const [a,b]=pick(r); return randInt(a,b); }
function formatAmt(n){ if(n>=1e6) return '₦'+(n/1e6).toFixed(2)+'M'; if(n>=1000) return '₦'+(n/1000).toFixed(1)+'K'; return '₦'+n.toLocaleString(); }
function riskClass(r){ return r<30?'low':r<65?'med':'high'; }
function timeAgo(ts) { const d=(Date.now()-ts)/1000; if(d<60) return Math.floor(d)+'s ago'; if(d<3600) return Math.floor(d/60)+'m ago'; return Math.floor(d/3600)+'h ago'; }
function fmtDate(ts) { return new Date(ts).toLocaleString('en-GB',{day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit'}); }

function genTx(isNew=false){
  return { id:genTxId(), customer:pick(CUSTOMERS), channel:pick(CHANNELS),
    amount:genAmount(), status:pick(STATUSES), risk:randInt(1,100),
    ts: Date.now()-randInt(0, isNew?30000:86400000), isNew };
}

function buildInitialData(){
  State.transactions = Array.from({length:100}, ()=>genTx(false));
}

// ── TICKER ───────────────────────────────────────────
function buildTicker(){
  const items = Array.from({length:20}, ()=>genTx());
  const html = items.map(t=>`
    <span class="ticker-item">
      <span class="ti-sep">◆</span>
      <span class="ti-id">${t.id}</span>
      <span class="ti-amt">${formatAmt(t.amount)}</span>
      <span class="ti-s ${t.status==='success'?'ok':t.status==='pending'?'warn':'err'}">${t.status.toUpperCase()}</span>
      <span class="ti-sep">·</span><span>${t.channel.name}</span>
    </span>`).join('');
  const el = document.getElementById('tickerContent');
  if(el) el.innerHTML = html + html;
}

// ── KPI CARDS ────────────────────────────────────────
const KPI_CFG = [
  {key:'volume',  title:'TX VOLUME',      icon:'📊', ka:'#3B82F6', kib:'rgba(59,130,246,.15)',  fmt: v=>'₦'+(v/1e9).toFixed(2)+'B'},
  {key:'success', title:'SUCCESS RATE',   icon:'✓',  ka:'#10B981', kib:'rgba(16,185,129,.15)',  fmt: v=>v.toFixed(1)+'%'},
  {key:'failed',  title:'FAILED TXNs',    icon:'✕',  ka:'#EF4444', kib:'rgba(239,68,68,.15)',   fmt: v=>v.toLocaleString()},
  {key:'pending', title:'PENDING SETTLE', icon:'⏳',  ka:'#F59E0B', kib:'rgba(245,158,11,.15)',  fmt: v=>'₦'+(v/1e6).toFixed(1)+'M'},
  {key:'fraud',   title:'FRAUD SCORE',    icon:'🛡',  ka:'#8B5CF6', kib:'rgba(139,92,246,.15)',  fmt: v=>v.toFixed(1)},
  {key:'latency', title:'API LATENCY',    icon:'⚡',  ka:'#06B6D4', kib:'rgba(6,182,212,.15)',   fmt: v=>v+'ms'},
];

function renderSparkline(canvas, data, color){
  const ctx=canvas.getContext('2d'), w=canvas.width, h=canvas.height;
  ctx.clearRect(0,0,w,h);
  const min=Math.min(...data), max=Math.max(...data), range=max-min||1;
  const pts=data.map((v,i)=>({x:(i/(data.length-1))*w, y:h-((v-min)/range)*h*.75-h*.1}));
  ctx.beginPath(); ctx.moveTo(pts[0].x,h);
  pts.forEach(p=>ctx.lineTo(p.x,p.y));
  ctx.lineTo(pts[pts.length-1].x,h); ctx.closePath();
  ctx.fillStyle=color+'28'; ctx.fill();
  ctx.beginPath(); pts.forEach((p,i)=>i===0?ctx.moveTo(p.x,p.y):ctx.lineTo(p.x,p.y));
  ctx.strokeStyle=color; ctx.lineWidth=1.5; ctx.stroke();
}

function renderKpiGrid(){
  KPI_CFG.forEach(c=>{ kpiSparkData[c.key]=Array.from({length:12},()=>Math.random()); });
  const grid = document.getElementById('kpiGrid'); if(!grid) return;
  grid.innerHTML = KPI_CFG.map(c=>`
    <div class="kpi-card" style="--ka:${c.ka};--kib:${c.kib}">
      <div class="kpi-hdr"><span class="kpi-title">${c.title}</span><span class="kpi-icon">${c.icon}</span></div>
      <div class="kpi-val" id="kv-${c.key}">${c.fmt(kpiState[c.key])}</div>
      <div class="kpi-foot">
        <span class="kpi-delta ${Math.random()>.3?'up':'down'}" id="kd-${c.key}">${Math.random()>.3?'▲':'▼'} ${rand(.1,5).toFixed(1)}%</span>
        <canvas class="kpi-sparkline" id="ks-${c.key}" width="70" height="24"></canvas>
      </div>
    </div>`).join('');
  setTimeout(()=>KPI_CFG.forEach(c=>{
    const canvas=document.getElementById('ks-'+c.key);
    if(canvas) renderSparkline(canvas, kpiSparkData[c.key], c.ka);
  }), 50);
}

function updateKpis(){
  kpiState.volume  += (Math.random()-.3)*1e9;
  kpiState.success  = Math.max(94, Math.min(99.9, kpiState.success+(Math.random()-.45)*.2));
  kpiState.failed  += randInt(0,3);
  kpiState.pending += (Math.random()-.3)*1e6;
  kpiState.fraud    = Math.max(.5, Math.min(5, kpiState.fraud+(Math.random()-.5)*.15));
  kpiState.latency  = Math.max(18, Math.min(120, kpiState.latency+randInt(-5,5)));
  KPI_CFG.forEach(c=>{
    const v=document.getElementById('kv-'+c.key); if(v) v.textContent=c.fmt(kpiState[c.key]);
    kpiSparkData[c.key].shift(); kpiSparkData[c.key].push(Math.random());
    const canvas=document.getElementById('ks-'+c.key);
    if(canvas) renderSparkline(canvas, kpiSparkData[c.key], c.ka);
  });
  const hl=document.getElementById('headerLatency'); if(hl) hl.textContent=kpiState.latency+'ms';
}

// ── TRANSACTION TABLE ────────────────────────────────
function getFiltered(){
  return State.transactions.filter(tx=>{
    const mf = State.filter==='all' || tx.status===State.filter;
    const q  = State.search.toLowerCase();
    const ms = !q || tx.id.toLowerCase().includes(q) || tx.customer.toLowerCase().includes(q) || tx.channel.name.toLowerCase().includes(q);
    return mf && ms;
  });
}

function renderTxTable(){
  const filtered = getFiltered();
  const total = filtered.length;
  const pages = Math.max(1, Math.ceil(total/State.pageSize));
  State.page = Math.min(State.page, pages);
  const slice = filtered.slice((State.page-1)*State.pageSize, State.page*State.pageSize);

  const txCountEl=document.getElementById('txCount'); if(txCountEl) txCountEl.textContent=total.toLocaleString()+' transactions';
  const piEl=document.getElementById('pageInfo'); if(piEl) piEl.textContent=State.page+' / '+pages;
  const navEl=document.getElementById('navTxCount'); if(navEl) navEl.textContent=total;
  const prevEl=document.getElementById('prevPage'); if(prevEl) prevEl.disabled=State.page<=1;
  const nextEl=document.getElementById('nextPage'); if(nextEl) nextEl.disabled=State.page>=pages;

  const tbody = document.getElementById('txTableBody'); if(!tbody) return;
  tbody.innerHTML = slice.map(tx=>{
    const rc=riskClass(tx.risk);
    return `<tr data-id="${tx.id}" class="${tx.isNew?'new-row':''}">
      <td><span class="tx-id">${tx.id}</span></td>
      <td><span class="tx-customer">${tx.customer}</span></td>
      <td><span class="tx-channel"><span class="ch-dot" style="background:${tx.channel.dot}"></span>${tx.channel.name}</span></td>
      <td><span class="tx-amount">${formatAmt(tx.amount)}</span></td>
      <td><span class="status-badge ${tx.status}">${tx.status==='success'?'●':tx.status==='pending'?'◐':tx.status==='failed'?'✕':'⚑'} ${tx.status.charAt(0).toUpperCase()+tx.status.slice(1)}</span></td>
      <td><div class="risk-bar"><div class="risk-track"><div class="risk-fill ${rc}" style="width:${tx.risk}%"></div></div><span class="risk-num ${rc}">${tx.risk}</span></div></td>
      <td><span class="tx-time">${timeAgo(tx.ts)}</span></td>
      <td><button class="expand-btn" data-id="${tx.id}">↗</button></td>
    </tr>`;
  }).join('') || '<tr><td colspan="8" style="text-align:center;padding:30px;color:var(--t3)">No transactions match filters</td></tr>';
  setTimeout(()=>State.transactions.forEach(t=>t.isNew=false), 500);
}

function addNewTx(){
  const tx=genTx(true);
  State.transactions.unshift(tx);
  if(State.transactions.length>300) State.transactions.pop();
  if(State.currentView==='dashboard') renderTxTable();
  if(tx.status==='flagged') showToast('Flagged: '+tx.id+' · Risk '+tx.risk,'warning');
  else if(tx.status==='failed'&&tx.amount>500000) showToast('High-value fail: '+formatAmt(tx.amount),'error');
  else if(Math.random()>.92) showToast('New tx: '+tx.id+' — '+formatAmt(tx.amount),'info');
}

// ── RISK GAUGE ───────────────────────────────────────
function drawGauge(score){
  const canvas=document.getElementById('riskGaugeCanvas'); if(!canvas) return;
  const ctx=canvas.getContext('2d'), w=canvas.width, h=canvas.height;
  ctx.clearRect(0,0,w,h);
  const cx=w/2, cy=h-10, r=Math.min(cx,cy)-8;
  ctx.beginPath(); ctx.arc(cx,cy,r,Math.PI,0); ctx.strokeStyle='rgba(255,255,255,.06)'; ctx.lineWidth=10; ctx.lineCap='round'; ctx.stroke();
  let prev=Math.PI;
  [{to:.33,c:'#10B981'},{to:.66,c:'#F59E0B'},{to:1,c:'#EF4444'}].forEach(z=>{
    const end=Math.PI+(0-Math.PI)*z.to;
    ctx.beginPath(); ctx.arc(cx,cy,r,prev,end); ctx.strokeStyle=z.c+'50'; ctx.lineWidth=10; ctx.lineCap='butt'; ctx.stroke(); prev=end;
  });
  const norm=Math.min(score/10,1), ae=Math.PI+(0-Math.PI)*norm;
  const fc=score<3?'#10B981':score<6?'#F59E0B':'#EF4444';
  ctx.beginPath(); ctx.arc(cx,cy,r,Math.PI,ae); ctx.strokeStyle=fc; ctx.lineWidth=10; ctx.lineCap='round'; ctx.shadowColor=fc; ctx.shadowBlur=12; ctx.stroke(); ctx.shadowBlur=0;
  ctx.beginPath(); ctx.moveTo(cx,cy); ctx.lineTo(cx+(r-15)*Math.cos(ae),cy+(r-15)*Math.sin(ae));
  ctx.strokeStyle='#fff'; ctx.lineWidth=2; ctx.shadowColor='#fff'; ctx.shadowBlur=6; ctx.stroke(); ctx.shadowBlur=0;
  ctx.beginPath(); ctx.arc(cx,cy,5,0,Math.PI*2); ctx.fillStyle='#fff'; ctx.fill();
}

function renderHeatmap(){
  const c=document.getElementById('riskHeatmap'); if(!c) return;
  c.innerHTML=Array.from({length:24},(_,i)=>{
    const v=Math.random();
    const color=v<.3?`rgba(16,185,129,${.3+v})`:v<.6?`rgba(245,158,11,${.3+v*.7})`:`rgba(239,68,68,${.3+v*.7})`;
    return `<div class="hm-cell" style="background:${color}" title="Hour ${i}:00"></div>`;
  }).join('');
}

function renderFlaggedList(){
  const flagged=State.transactions.filter(t=>t.status==='flagged').slice(0,4);
  const fc=document.getElementById('flaggedCount'); if(fc) fc.textContent=flagged.length;
  const fs=document.getElementById('fraudScore'); if(fs) fs.textContent=kpiState.fraud.toFixed(1);
  drawGauge(kpiState.fraud);
  const fl=document.getElementById('flaggedList');
  if(fl) fl.innerHTML=flagged.map(t=>`
    <div class="flagged-item">
      <span class="fi-id">${t.id}</span>
      <span class="fi-desc">${t.customer} · ${t.channel.name}</span>
      <span class="fi-score">⚑ ${t.risk}</span>
    </div>`).join('') || '<div style="padding:8px;color:var(--t3);font-size:11px">No flagged transactions</div>';
}

// ── SYSTEM HEALTH ────────────────────────────────────
const HEALTH=[
  {label:'API Gateway',    color:'green', val:42,    fmt:v=>v+'ms',          norm:v=>Math.min(v/200,1)},
  {label:'Uptime (30D)',   color:'green', val:99.97, fmt:v=>v.toFixed(2)+'%',norm:v=>v/100},
  {label:'Webhook Success',color:'green', val:99.3,  fmt:v=>v.toFixed(1)+'%',norm:v=>v/100},
  {label:'Server Load',    color:'blue',  val:34,    fmt:v=>v.toFixed(0)+'%',norm:v=>v/100},
  {label:'Queue Backlog',  color:'amber', val:18,    fmt:v=>v+' jobs',       norm:v=>Math.min(v/100,1)},
  {label:'DB Connections', color:'blue',  val:61,    fmt:v=>v.toFixed(0)+'%',norm:v=>v/100},
];

function renderHealth(){
  const g=document.getElementById('healthGrid'); if(!g) return;
  g.innerHTML=HEALTH.map(m=>`
    <div class="health-item">
      <span class="hi-label">${m.label}</span>
      <div class="hi-bar"><div class="hi-fill ${m.color}" style="width:${m.norm(m.val)*100}%"></div></div>
      <span class="hi-val" style="color:var(--${m.color})">${m.fmt(m.val)}</span>
    </div>`).join('');
}

function updateHealth(){
  HEALTH[0].val=Math.max(18,Math.min(150,HEALTH[0].val+(Math.random()-.5)*12));
  HEALTH[3].val=Math.max(10,Math.min(90,HEALTH[3].val+(Math.random()-.5)*6));
  HEALTH[4].val=Math.max(0,Math.min(80,HEALTH[4].val+(Math.random()-.45)*5));
  HEALTH[5].val=Math.max(30,Math.min(95,HEALTH[5].val+(Math.random()-.5)*4));
  renderHealth();
}

// ── EXCEPTIONS ───────────────────────────────────────
const EXCEPTIONS=[
  {id:'EX-8821',sev:'critical',title:'Settlement Delay Detected',    meta:'₦48.2M pending · 6 merchants',   detail:'Settlement window exceeded 48h. Affecting First Bank, GTBank, Access Bank. Escalated to Treasury at 14:32.'},
  {id:'EX-8820',sev:'critical',title:'Fraud Review Pending',          meta:'TXN150234 · Risk score: 94',      detail:'Flagged by ML model: velocity pattern, unusual device fingerprint, IP geolocation mismatch. Requires manual review.'},
  {id:'EX-8819',sev:'high',    title:'Webhook Failure Streak',        meta:'POST /callbacks · 7 failures',    detail:'Merchant endpoint returning 503 since 13:15. Auto-retry exhausted. Contact: api-support@merchant.com'},
  {id:'EX-8818',sev:'high',    title:'Reconciliation Mismatch',       meta:'Daily batch · ₦2,340 variance',   detail:'EOD reconciliation shows ₦2,340 mismatch between GL and processor totals. Investigating 3 edge-case transactions.'},
  {id:'EX-8817',sev:'medium',  title:'Chargeback Request',            meta:'Visa · ₦185,000 · Ref #CB-9021', detail:'Customer initiated chargeback. Evidence required by 2024-02-15. Assigned to disputes team.'},
  {id:'EX-8816',sev:'medium',  title:'API Rate Limit Breach',         meta:'Partner: PayCo · /v2/transfer',   detail:'PayCo exceeded 500 req/min for 3 minutes. Throttling applied. Account flagged for review.'},
];

function renderExceptions(){
  const list=document.getElementById('exceptionList');
  const count=document.getElementById('exceptionCount');
  if(count) count.textContent=EXCEPTIONS.length+' items';
  if(!list) return;
  list.innerHTML=EXCEPTIONS.map(ex=>`
    <div class="exc-item sev-${ex.sev}" id="exc-${ex.id}">
      <div class="exc-main" onclick="toggleExc('${ex.id}')">
        <span class="exc-sev-dot"></span>
        <div class="exc-info"><div class="exc-title">${ex.title}</div><div class="exc-meta">${ex.id} · ${ex.meta}</div></div>
        <button class="exc-btn" onclick="event.stopPropagation();showToast('Reviewing ${ex.id}','info')">REVIEW</button>
      </div>
      <div class="exc-detail">${ex.detail}</div>
    </div>`).join('');
}

function toggleExc(id){ const el=document.getElementById('exc-'+id); if(el) el.classList.toggle('expanded'); }

// ── CHARTS DEFAULTS ──────────────────────────────────
const CDEFS = {
  responsive:true, maintainAspectRatio:false,
  plugins:{
    legend:{display:false},
    tooltip:{
      backgroundColor:'#0b1424',borderColor:'rgba(59,130,246,.3)',borderWidth:1,
      titleColor:'#F0F6FF',bodyColor:'#8AA0C0',padding:10,cornerRadius:6,
      titleFont:{family:"'Syne',sans-serif",weight:'700',size:12},
      bodyFont:{family:"'JetBrains Mono',monospace",size:11},
    },
  },
};

function buildTrendChart(){
  const ctx=document.getElementById('trendChart'); if(!ctx) return;
  const n=30;
  const labels=Array.from({length:n},(_,i)=>{const d=new Date();d.setDate(d.getDate()-(n-1-i));return d.toLocaleDateString('en-GB',{day:'2-digit',month:'short'});});
  const gr=ctx.getContext('2d').createLinearGradient(0,0,0,160);
  gr.addColorStop(0,'rgba(59,130,246,.4)'); gr.addColorStop(1,'rgba(59,130,246,0)');
  trendChart=new Chart(ctx,{type:'line',data:{labels,datasets:[{data:Array.from({length:n},()=>randInt(8000,12000)),borderColor:'#3B82F6',backgroundColor:gr,borderWidth:2,pointRadius:0,pointHoverRadius:5,tension:.4,fill:true}]},
    options:{...CDEFS,scales:{
      x:{grid:{color:'rgba(255,255,255,.04)'},ticks:{color:'#4A6080',font:{family:"'JetBrains Mono',monospace",size:9},maxTicksLimit:7,maxRotation:0}},
      y:{grid:{color:'rgba(255,255,255,.04)'},ticks:{color:'#4A6080',font:{family:"'JetBrains Mono',monospace",size:9},callback:v=>v>=1000?(v/1000).toFixed(0)+'K':v}},
    }}});
}

const CH_NAMES=['Visa Card','Mastercard','Bank Transfer','Mobile Money','Crypto','USSD'];
const CH_COLORS=['#3B82F6','#EF4444','#10B981','#8B5CF6','#F59E0B','#06B6D4'];
const CH_PCT=[38,22,18,12,6,4];

function buildDonutChart(){
  const ctx=document.getElementById('donutChart'); if(!ctx) return;
  donutChart=new Chart(ctx,{type:'doughnut',data:{labels:CH_NAMES,datasets:[{data:CH_PCT,backgroundColor:CH_COLORS.map(c=>c+'cc'),borderColor:CH_COLORS,borderWidth:1.5,hoverOffset:6}]},options:{...CDEFS,cutout:'70%'}});
  const leg=document.getElementById('donutLegend');
  if(leg) leg.innerHTML=CH_NAMES.map((n,i)=>`<div class="dl-item"><span class="dl-dot" style="background:${CH_COLORS[i]}"></span><span class="dl-name">${n}</span><span class="dl-val">${CH_PCT[i]}%</span></div>`).join('');
}

function buildBarChart(){
  const ctx=document.getElementById('barChart'); if(!ctx) return;
  barChart=new Chart(ctx,{type:'bar',data:{labels:['Visa','MC','Bank','MoMo','Crypto','USSD'],datasets:[{data:[98.2,96.8,99.1,97.4,93.2,99.7],backgroundColor:CH_COLORS.map(c=>c+'50'),borderColor:CH_COLORS,borderWidth:1.5,borderRadius:4,borderSkipped:false}]},
    options:{...CDEFS,scales:{
      x:{grid:{display:false},ticks:{color:'#4A6080',font:{family:"'JetBrains Mono',monospace",size:9}}},
      y:{min:88,max:100,grid:{color:'rgba(255,255,255,.04)'},ticks:{color:'#4A6080',font:{family:"'JetBrains Mono',monospace",size:9},callback:v=>v+'%'}},
    }}});
}

// ── VIEW: TRANSACTIONS ───────────────────────────────
function renderAllTx(){
  const body=document.getElementById('allTxBody'); if(!body) return;
  body.innerHTML=State.transactions.slice(0,50).map(tx=>{
    const rc=riskClass(tx.risk);
    return `<tr>
      <td><span class="tx-id">${tx.id}</span></td>
      <td style="color:var(--t1)">${tx.customer}</td>
      <td><span class="tx-channel"><span class="ch-dot" style="background:${tx.channel.dot}"></span>${tx.channel.name}</span></td>
      <td><span class="tx-amount">${formatAmt(tx.amount)}</span></td>
      <td><span class="status-badge ${tx.status}">${tx.status}</span></td>
      <td><span class="risk-num ${rc}">${tx.risk}</span></td>
      <td style="color:var(--t3)">${fmtDate(tx.ts)}</td>
    </tr>`;}).join('');
}

// ── VIEW: SETTLEMENTS ────────────────────────────────
function renderSettlements(){
  const stats=document.getElementById('settlementStats');
  if(stats) stats.innerHTML=[
    {label:'TOTAL PENDING',value:'₦48.2M',sub:'6 batches'},
    {label:'SETTLED TODAY',value:'₦1.24B',sub:'18 batches'},
    {label:'AVG CYCLE TIME',value:'2.4h',sub:'Within SLA'},
    {label:'FAILED BATCHES',value:'1',sub:'Under review'},
  ].map(s=>`<div class="stat-card"><div class="sc-label">${s.label}</div><div class="sc-value">${s.value}</div><div class="sc-sub">${s.sub}</div></div>`).join('');

  const body=document.getElementById('settlementBody'); if(!body) return;
  const SETTLED=['completed','completed','pending','pending','processing','failed'];
  body.innerHTML=Array.from({length:12},(_,i)=>{
    const status=SETTLED[i%SETTLED.length];
    const color=status==='completed'?'var(--green)':status==='pending'?'var(--amber)':status==='processing'?'var(--blue)':'var(--red)';
    return `<tr>
      <td><span class="tx-id">SB-${9180+i}</span></td>
      <td style="color:var(--t1)">${pick(MERCHANTS)}</td>
      <td><span class="tx-amount">${formatAmt(randInt(1e6,5e7))}</span></td>
      <td style="color:var(--t2)">${randInt(50,500)}</td>
      <td><span class="status-badge" style="background:${color}20;color:${color}">${status}</span></td>
      <td style="color:var(--t3)">${fmtDate(Date.now()-randInt(0,86400000))}</td>
    </tr>`;}).join('');
}

// ── VIEW: REFUNDS ────────────────────────────────────
function renderRefunds(){
  const stats=document.getElementById('refundStats');
  if(stats) stats.innerHTML=[
    {label:'PENDING APPROVAL',value:'12',sub:'₦3.2M total'},
    {label:'PROCESSED TODAY',value:'34',sub:'₦8.7M'},
    {label:'AVG RESOLUTION',value:'4.2h',sub:''},
    {label:'CHARGEBACK RATE',value:'0.8%',sub:'Below threshold'},
  ].map(s=>`<div class="stat-card"><div class="sc-label">${s.label}</div><div class="sc-value">${s.value}</div><div class="sc-sub">${s.sub}</div></div>`).join('');

  const body=document.getElementById('refundBody'); if(!body) return;
  const RSTATUSES=['pending','approved','processing','rejected','completed'];
  body.innerHTML=Array.from({length:12},(_,i)=>{
    const status=RSTATUSES[i%RSTATUSES.length];
    const color=status==='completed'||status==='approved'?'var(--green)':status==='pending'||status==='processing'?'var(--amber)':'var(--red)';
    return `<tr>
      <td><span class="tx-id">REF-${7200+i}</span></td>
      <td style="color:var(--t1)">${pick(CUSTOMERS)}</td>
      <td><span class="tx-id">TXN${150000+randInt(1,5000)}</span></td>
      <td><span class="tx-amount">${formatAmt(randInt(500,200000))}</span></td>
      <td style="color:var(--t2)">${pick(REFUND_REASONS)}</td>
      <td><span class="status-badge" style="background:${color}20;color:${color}">${status}</span></td>
    </tr>`;}).join('');
}

// ── VIEW: RISK ENGINE ────────────────────────────────
function renderRiskView(){
  const stats=document.getElementById('riskStats');
  if(stats) stats.innerHTML=[
    {label:'AVG RISK SCORE',value:'28.4',sub:'Low risk environment'},
    {label:'HIGH RISK TODAY',value:'47',sub:'Score > 70'},
    {label:'MODEL VERSION',value:'v3.8.1',sub:'Updated 3 days ago'},
    {label:'RULES ACTIVE',value:'142',sub:'12 ML, 130 rule-based'},
  ].map(s=>`<div class="stat-card"><div class="sc-label">${s.label}</div><div class="sc-value">${s.value}</div><div class="sc-sub">${s.sub}</div></div>`).join('');

  const rctx=document.getElementById('riskTrendChart');
  if(rctx&&!riskTrendChart){
    const labels=Array.from({length:30},(_,i)=>{const d=new Date();d.setDate(d.getDate()-(29-i));return d.toLocaleDateString('en-GB',{day:'2-digit',month:'short'});});
    riskTrendChart=new Chart(rctx,{type:'line',data:{labels,datasets:[
      {label:'Avg Score',data:Array.from({length:30},()=>rand(20,45)),borderColor:'#F59E0B',backgroundColor:'rgba(245,158,11,.1)',borderWidth:2,pointRadius:0,tension:.4,fill:true},
      {label:'Flagged',  data:Array.from({length:30},()=>randInt(2,15)),borderColor:'#EF4444',borderWidth:2,pointRadius:0,tension:.4,fill:false},
    ]},options:{...CDEFS,plugins:{...CDEFS.plugins,legend:{display:true,labels:{color:'#8AA0C0',font:{family:"'JetBrains Mono',monospace",size:10}}}},
      scales:{
        x:{grid:{color:'rgba(255,255,255,.04)'},ticks:{color:'#4A6080',font:{size:9},maxTicksLimit:7,maxRotation:0}},
        y:{grid:{color:'rgba(255,255,255,.04)'},ticks:{color:'#4A6080',font:{size:9}}},
      }}});
  }

  const rdctx=document.getElementById('riskDonutChart');
  if(rdctx&&!riskDonutChart){
    const RTYPES=['Velocity Abuse','Card Testing','Geo Anomaly','Device Spoof','Acct Takeover','Other'];
    const RCOLORS=['#EF4444','#F59E0B','#8B5CF6','#3B82F6','#06B6D4','#10B981'];
    riskDonutChart=new Chart(rdctx,{type:'doughnut',data:{labels:RTYPES,datasets:[{data:[32,24,18,12,9,5],backgroundColor:RCOLORS.map(c=>c+'bb'),borderColor:RCOLORS,borderWidth:1.5,hoverOffset:6}]},options:{...CDEFS,cutout:'68%'}});
    const leg=document.getElementById('riskDonutLegend');
    if(leg) leg.innerHTML=RTYPES.map((n,i)=>`<div class="dl-item"><span class="dl-dot" style="background:${RCOLORS[i]}"></span><span class="dl-name">${n}</span></div>`).join('');
  }

  const body=document.getElementById('riskTxBody'); if(!body) return;
  const highRisk=State.transactions.filter(t=>t.risk>70).slice(0,15);
  body.innerHTML=highRisk.map(tx=>`<tr>
    <td><span class="tx-id">${tx.id}</span></td>
    <td style="color:var(--t1)">${tx.customer}</td>
    <td><span class="tx-amount">${formatAmt(tx.amount)}</span></td>
    <td><span style="color:var(--red);font-weight:700">${tx.risk}</span></td>
    <td style="color:var(--t2)">${pick(RISK_TRIGGERS)}</td>
    <td><span class="status-badge ${tx.status}">${tx.status}</span></td>
  </tr>`).join('') || '<tr><td colspan="6" style="text-align:center;padding:24px;color:var(--t3)">No high-risk transactions currently</td></tr>';
}

// ── VIEW: FRAUD MONITORING ───────────────────────────
function renderFraudView(){
  const stats=document.getElementById('fraudStats');
  if(stats) stats.innerHTML=[
    {label:'ACTIVE ALERTS',value:'3',sub:'Requires immediate review'},
    {label:'BLOCKED TODAY',value:'₦2.4M',sub:'19 transactions'},
    {label:'FALSE POS. RATE',value:'1.2%',sub:'Within threshold'},
    {label:'DETECTION RATE',value:'99.1%',sub:'↑ 0.3% this week'},
  ].map(s=>`<div class="stat-card"><div class="sc-label">${s.label}</div><div class="sc-value">${s.value}</div><div class="sc-sub">${s.sub}</div></div>`).join('');

  const fctx=document.getElementById('fraudBarChart');
  if(fctx&&!fraudBarChart){
    const hours=Array.from({length:24},(_,i)=>i+':00');
    fraudBarChart=new Chart(fctx,{type:'bar',data:{labels:hours,datasets:[{label:'Fraud Attempts',data:Array.from({length:24},()=>randInt(0,12)),backgroundColor:'rgba(239,68,68,.5)',borderColor:'#EF4444',borderWidth:1,borderRadius:3}]},
      options:{...CDEFS,scales:{
        x:{grid:{display:false},ticks:{color:'#4A6080',font:{size:9},maxTicksLimit:12}},
        y:{grid:{color:'rgba(255,255,255,.04)'},ticks:{color:'#4A6080',font:{size:9}}},
      }}});
  }

  const body=document.getElementById('fraudAlertsBody'); if(!body) return;
  const flagged=State.transactions.filter(t=>t.status==='flagged').slice(0,12);
  body.innerHTML=flagged.map((tx,i)=>`<tr>
    <td><span class="tx-id">ALT-${8800+i}</span></td>
    <td><span class="tx-id">${tx.id}</span></td>
    <td style="color:var(--t1)">${tx.customer}</td>
    <td><span class="tx-amount">${formatAmt(tx.amount)}</span></td>
    <td style="color:var(--amber)">${pick(FRAUD_TYPES)}</td>
    <td><span style="color:var(--red);font-weight:700">${tx.risk}%</span></td>
    <td><button class="hdr-btn" style="padding:4px 10px;font-size:10px" onclick="showToast('Reviewing ALT-${8800+i}','info')">REVIEW</button></td>
  </tr>`).join('') || '<tr><td colspan="7" style="text-align:center;padding:24px;color:var(--t3)">No active fraud alerts</td></tr>';
}

// ── VIEW: AUDIT LOGS ─────────────────────────────────
function renderAuditLogs(){
  const list=document.getElementById('auditLogList'); if(!list) return;
  const logs=Array.from({length:30},(_,i)=>{
    const entry=LOG_MSGS[i%LOG_MSGS.length];
    return {ts:Date.now()-randInt(0,3600000), level:entry.level, msg:entry.msg, actor:pick(LOG_ACTORS)};
  }).sort((a,b)=>b.ts-a.ts);
  list.innerHTML=logs.map(l=>`
    <div class="log-item ${l.level}">
      <span class="log-time">${fmtDate(l.ts)}</span>
      <span class="log-level">${l.level.toUpperCase()}</span>
      <span class="log-msg">${l.msg}</span>
      <span class="log-actor">${l.actor}</span>
    </div>`).join('');
}

// ── VIEW: API STATUS ─────────────────────────────────
const API_ENDPOINTS=[
  {name:'/v2/payments',    status:'up',  latency:42,  uptime:'99.99%'},
  {name:'/v2/transfers',   status:'up',  latency:38,  uptime:'99.97%'},
  {name:'/v2/settlements', status:'up',  latency:55,  uptime:'99.95%'},
  {name:'/v2/refunds',     status:'up',  latency:61,  uptime:'99.94%'},
  {name:'/v2/webhooks',    status:'warn',latency:187, uptime:'98.20%'},
  {name:'/v2/fraud/score', status:'up',  latency:29,  uptime:'99.99%'},
  {name:'/v2/accounts',    status:'up',  latency:44,  uptime:'99.98%'},
  {name:'/v2/reports',     status:'up',  latency:112, uptime:'99.90%'},
  {name:'/v1/legacy/pay',  status:'up',  latency:220, uptime:'99.80%'},
];

function renderApiStatus(){
  const grid=document.getElementById('apiGrid'); if(!grid) return;
  grid.innerHTML=API_ENDPOINTS.map(ep=>`
    <div class="api-card">
      <div class="api-card-top">
        <span class="api-name">${ep.name}</span>
        <span class="api-status-dot ${ep.status}"></span>
      </div>
      <div class="api-latency">${ep.latency}<span style="font-size:12px;font-weight:400;color:var(--t3)">ms</span></div>
      <div class="api-uptime">Uptime: ${ep.uptime}</div>
    </div>`).join('');

  const actx=document.getElementById('apiLatencyChart');
  if(actx&&!apiLatencyChart){
    apiLatencyChart=new Chart(actx,{type:'line',data:{labels:Array.from({length:24},(_,i)=>i+':00'),datasets:[
      {label:'P50',data:Array.from({length:24},()=>rand(30,60)),  borderColor:'#10B981',borderWidth:1.5,pointRadius:0,tension:.4,fill:false},
      {label:'P95',data:Array.from({length:24},()=>rand(80,180)), borderColor:'#F59E0B',borderWidth:1.5,pointRadius:0,tension:.4,fill:false},
      {label:'P99',data:Array.from({length:24},()=>rand(200,400)),borderColor:'#EF4444',borderWidth:1.5,pointRadius:0,tension:.4,fill:false},
    ]},options:{...CDEFS,plugins:{...CDEFS.plugins,legend:{display:true,labels:{color:'#8AA0C0',font:{family:"'JetBrains Mono',monospace",size:10}}}},
      scales:{
        x:{grid:{color:'rgba(255,255,255,.04)'},ticks:{color:'#4A6080',font:{size:9},maxTicksLimit:12}},
        y:{grid:{color:'rgba(255,255,255,.04)'},ticks:{color:'#4A6080',font:{size:9},callback:v=>v+'ms'}},
      }}});
  }
}

// ── VIEW: INTEGRATIONS ───────────────────────────────
const INTEGRATIONS=[
  {name:'Flutterwave',    tag:'active',   desc:'Core payment gateway. Card and bank transfer routing.',     req:'42.1K/day',uptime:'99.98%'},
  {name:'Paystack',       tag:'active',   desc:'Secondary processor. Nigerian bank transfers and USSD.',    req:'18.4K/day',uptime:'99.95%'},
  {name:'Interswitch',    tag:'active',   desc:'Local switching network. ATM and POS transaction routing.', req:'9.2K/day', uptime:'99.91%'},
  {name:'Visa DPS',       tag:'active',   desc:'Card scheme. Real-time authorisation and clearing.',        req:'28.7K/day',uptime:'99.99%'},
  {name:'Mastercard MCG', tag:'active',   desc:'Mastercard gateway. International card processing.',        req:'14.3K/day',uptime:'99.97%'},
  {name:'MTN MoMo API',   tag:'active',   desc:'Mobile money. Airtel and MTN wallet support.',              req:'6.8K/day', uptime:'99.82%'},
  {name:'Stitch',         tag:'beta',     desc:'Open banking rails. Account-to-account payments.',          req:'1.1K/day', uptime:'98.40%'},
  {name:'Stripe Connect', tag:'inactive', desc:'Cross-border USD payouts. Pending compliance approval.',    req:'—',        uptime:'—'},
];

function renderIntegrations(){
  const grid=document.getElementById('integrationGrid'); if(!grid) return;
  grid.innerHTML=INTEGRATIONS.map(int=>`
    <div class="int-card">
      <div class="int-top"><span class="int-name">${int.name}</span><span class="int-tag ${int.tag}">${int.tag.toUpperCase()}</span></div>
      <div class="int-desc">${int.desc}</div>
      <div class="int-stats">
        <div class="int-stat"><div class="int-stat-label">REQUESTS</div><div class="int-stat-val">${int.req}</div></div>
        <div class="int-stat"><div class="int-stat-label">UPTIME</div><div class="int-stat-val">${int.uptime}</div></div>
      </div>
    </div>`).join('');
}

// ── NOTIFICATIONS ────────────────────────────────────
function renderNotifs(){
  const list=document.getElementById('notifList'); if(!list) return;
  const NOTIFS=[
    {icon:'⚠',type:'red',  title:'High-risk transaction',  desc:'TXN150234 flagged — Score: 94',time:'2 min ago'},
    {icon:'⚡',type:'amber',title:'API latency spike',      desc:'Gateway P99 hit 387ms',        time:'8 min ago'},
    {icon:'✓',type:'green',title:'Settlement completed',   desc:'₦1.2B settled — 1,842 txns',  time:'22 min ago'},
    {icon:'🔄',type:'blue', title:'Reconciliation started', desc:'Daily EOD batch processing',   time:'35 min ago'},
    {icon:'⚠',type:'red',  title:'Chargeback received',    desc:'Merchant #4421 · ₦185,000',   time:'1h ago'},
  ];
  list.innerHTML=NOTIFS.map(n=>`
    <div class="notif-item">
      <div class="ni-icon ${n.type}">${n.icon}</div>
      <div><div class="ni-title">${n.title}</div><div class="ni-desc">${n.desc}</div><div class="ni-time">${n.time}</div></div>
    </div>`).join('');
}

// ── TOAST ────────────────────────────────────────────
const TICONS={info:'ℹ',success:'✓',warning:'⚠',error:'✕'};
function showToast(msg,type='info',ms=4000){
  const c=document.getElementById('toastContainer'); if(!c) return;
  const t=document.createElement('div');
  t.className='toast '+type;
  t.innerHTML=`<span class="toast-icon">${TICONS[type]}</span><span class="toast-msg">${msg}</span><button class="toast-close" onclick="this.parentElement.remove()">✕</button>`;
  c.appendChild(t);
  if(ms>0) setTimeout(()=>{t.classList.add('removing');setTimeout(()=>t.remove(),300);},ms);
}

// ── TX DETAIL MODAL ──────────────────────────────────
function openTxModal(id){
  const tx=State.transactions.find(t=>t.id===id); if(!tx) return;
  const rc=riskClass(tx.risk);
  const rcColor=rc==='low'?'var(--green)':rc==='med'?'var(--amber)':'var(--red)';
  document.getElementById('modalBody').innerHTML=`
    <div class="modal-grid">
      <div class="modal-field"><span class="mf-label">TRANSACTION ID</span><span class="mf-val mono" style="color:var(--blue)">${tx.id}</span></div>
      <div class="modal-field"><span class="mf-label">STATUS</span><span class="status-badge ${tx.status}">${tx.status}</span></div>
      <div class="modal-field"><span class="mf-label">CUSTOMER</span><span class="mf-val">${tx.customer}</span></div>
      <div class="modal-field"><span class="mf-label">AMOUNT</span><span class="mf-val" style="font-size:18px;font-family:var(--disp);font-weight:800">${formatAmt(tx.amount)}</span></div>
      <div class="modal-field"><span class="mf-label">CHANNEL</span><span class="mf-val">${tx.channel.name}</span></div>
      <div class="modal-field"><span class="mf-label">RISK SCORE</span><span class="mf-val" style="color:${rcColor}">${tx.risk} / 100 · ${rc.toUpperCase()}</span></div>
      <div class="modal-field full"><span class="mf-label">TIMESTAMP</span><span class="mf-val mono">${new Date(tx.ts).toLocaleString()}</span></div>
      <div class="modal-field full"><span class="mf-label">REFERENCE</span><span class="mf-val mono" style="color:var(--t3)">REF-${Math.random().toString(36).substr(2,12).toUpperCase()}</span></div>
    </div>`;
  document.getElementById('txModal').classList.add('open');
}

// ── CSV EXPORT ───────────────────────────────────────
function exportCSV(){
  const rows=[['Transaction ID','Customer','Channel','Amount','Status','Risk','Timestamp'],
    ...getFiltered().map(t=>[t.id,t.customer,t.channel.name,t.amount,t.status,t.risk,new Date(t.ts).toISOString()])];
  const csv=rows.map(r=>r.map(v=>`"${v}"`).join(',')).join('\n');
  const a=document.createElement('a');
  a.href=URL.createObjectURL(new Blob([csv],{type:'text/csv'}));
  a.download='opsmatrix-'+Date.now()+'.csv'; a.click();
  showToast('Exported '+getFiltered().length+' transactions to CSV','success');
}

// ── VIEW SWITCHER ────────────────────────────────────
const VIEW_LABELS={
  dashboard:'Command Center', transactions:'Transactions', settlements:'Settlements',
  refunds:'Refunds', risk:'Risk Engine', fraud:'Fraud Monitoring',
  audit:'Audit Logs', api:'API Status', integrations:'Integrations',
};
const VIEW_RENDERERS={
  transactions:renderAllTx, settlements:renderSettlements, refunds:renderRefunds,
  risk:renderRiskView, fraud:renderFraudView, audit:renderAuditLogs,
  api:renderApiStatus, integrations:renderIntegrations,
};
const rendered=new Set(['dashboard']);

function switchView(view){
  if(State.currentView===view) return;
  document.getElementById('view-'+State.currentView)?.classList.remove('active');
  const target=document.getElementById('view-'+view);
  if(!target) return;
  target.classList.add('active');
  State.currentView=view;
  const lbl=document.getElementById('currentViewLabel'); if(lbl) lbl.textContent=VIEW_LABELS[view]||view;
  if(!rendered.has(view) && VIEW_RENDERERS[view]){ VIEW_RENDERERS[view](); rendered.add(view); }
  // Always refresh live views
  if(view==='transactions') renderAllTx();
  if(view==='audit') renderAuditLogs();
  document.querySelectorAll('.nav-item').forEach(n=>n.classList.toggle('active', n.dataset.view===view));
}

// ── EVENTS ───────────────────────────────────────────
function bindEvents(){
  // Nav items
  document.querySelectorAll('.nav-item').forEach(item=>{
    item.addEventListener('click',e=>{ e.preventDefault(); switchView(item.dataset.view); });
  });

  // Filter tabs
  const filterTabs=document.getElementById('filterTabs');
  if(filterTabs) filterTabs.addEventListener('click',e=>{
    const btn=e.target.closest('.ftab'); if(!btn) return;
    document.querySelectorAll('.ftab').forEach(b=>b.classList.remove('active'));
    btn.classList.add('active');
    State.filter=btn.dataset.filter; State.page=1; renderTxTable();
  });

  // Table search
  const txSearch=document.getElementById('txSearch');
  if(txSearch) txSearch.addEventListener('input',e=>{ State.search=e.target.value; State.page=1; renderTxTable(); });

  // Global search
  const gs=document.getElementById('globalSearch');
  if(gs) gs.addEventListener('input',e=>{
    State.search=e.target.value;
    if(State.currentView==='dashboard'){ State.filter='all'; State.page=1; renderTxTable(); }
  });

  // Pagination
  const prev=document.getElementById('prevPage');
  if(prev) prev.addEventListener('click',()=>{ if(State.page>1){State.page--;renderTxTable();} });
  const next=document.getElementById('nextPage');
  if(next) next.addEventListener('click',()=>{ const t=Math.ceil(getFiltered().length/State.pageSize); if(State.page<t){State.page++;renderTxTable();} });

  // Tx table click → modal
  const tbody=document.getElementById('txTableBody');
  if(tbody) tbody.addEventListener('click',e=>{
    const btn=e.target.closest('.expand-btn');
    if(btn){ openTxModal(btn.dataset.id); return; }
    const row=e.target.closest('tr');
    if(row&&row.dataset.id) openTxModal(row.dataset.id);
  });

  // Modal
  const mc=document.getElementById('modalClose');
  if(mc) mc.addEventListener('click',()=>document.getElementById('txModal').classList.remove('open'));
  const mo=document.getElementById('txModal');
  if(mo) mo.addEventListener('click',e=>{ if(e.target===e.currentTarget) mo.classList.remove('open'); });

  // Export
  const exp=document.getElementById('exportBtn');
  if(exp) exp.addEventListener('click',exportCSV);

  // Notifications
  const nb=document.getElementById('notifBtn');
  if(nb) nb.addEventListener('click',e=>{ e.stopPropagation(); document.getElementById('notifPanel').classList.toggle('open'); });
  const nc=document.getElementById('notifClear');
  if(nc) nc.addEventListener('click',()=>{
    const nl=document.getElementById('notifList');
    if(nl) nl.innerHTML='<div style="padding:20px;text-align:center;color:var(--t3);font-size:12px">No notifications</div>';
    const badge=document.getElementById('notifBadge'); if(badge) badge.textContent='0';
    document.getElementById('notifPanel').classList.remove('open');
  });
  document.addEventListener('click',e=>{
    if(!e.target.closest('#notifPanel')&&!e.target.closest('#notifBtn'))
      document.getElementById('notifPanel').classList.remove('open');
  });

  // Sidebar collapse
  const st=document.getElementById('sidebarToggle');
  if(st) st.addEventListener('click',()=>document.getElementById('sidebar').classList.toggle('collapsed'));

  // Chart period tabs
  document.querySelectorAll('.ptab').forEach(btn=>{
    btn.addEventListener('click',()=>{
      document.querySelectorAll('.ptab').forEach(b=>b.classList.remove('active')); btn.classList.add('active');
      if(trendChart){
        const n=parseInt(btn.dataset.period)||30;
        const labels=Array.from({length:n},(_,i)=>{const d=new Date();d.setDate(d.getDate()-(n-1-i));return d.toLocaleDateString('en-GB',{day:'2-digit',month:'short'});});
        trendChart.data.labels=labels;
        trendChart.data.datasets[0].data=Array.from({length:n},()=>randInt(5000,14000));
        trendChart.update();
      }
    });
  });

  // Keyboard shortcuts
  document.addEventListener('keydown',e=>{
    if((e.metaKey||e.ctrlKey)&&e.key==='k'){ e.preventDefault(); const gs=document.getElementById('globalSearch'); if(gs) gs.focus(); }
    if(e.key==='Escape'){
      document.getElementById('txModal').classList.remove('open');
      document.getElementById('notifPanel').classList.remove('open');
    }
  });
}

// ── LIVE UPDATES ────────────────────────────────────
function startLive(){
  (function loop(){ setTimeout(()=>{ addNewTx(); loop(); }, 2000+Math.random()*2500); })();
  setInterval(()=>{ updateKpis(); renderFlaggedList(); }, 3000);
  setInterval(updateHealth, 5000);
  setInterval(renderHeatmap, 15000);
  setInterval(()=>{
    if(Math.random()>.65){
      const msgs=[
        ['Settlement batch ready','success'],
        ['Fraud pattern: velocity abuse detected','warning'],
        ['API latency spike on /v2/transfers','error'],
        ['Reconciliation mismatch flagged','warning'],
        ['Partner webhook timeout (PayCo)','error'],
      ];
      const [m,t]=pick(msgs); showToast(m,t);
    }
  },14000);
}

// ── INIT ─────────────────────────────────────────────
function init(){
  buildInitialData();
  renderKpiGrid();
  renderTxTable();
  renderFlaggedList();
  renderHeatmap();
  renderHealth();
  renderExceptions();
  renderNotifs();
  buildTicker();
  buildTrendChart();
  buildDonutChart();
  buildBarChart();
  bindEvents();
  startLive();
  setTimeout(()=>showToast('OPSMATRIX online — All systems operational','success',5000),800);
  setTimeout(()=>showToast('3 flagged transactions require review','warning',5000),2500);
}

document.addEventListener('DOMContentLoaded', init);