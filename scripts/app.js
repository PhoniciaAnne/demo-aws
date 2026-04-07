'use strict';

// ── State ───────────────────────────────────────────────────────
let simRunning = false, simSpeed = 1, simTimers = [];
let incidentStartMs = null, incidentInterval = null;
let logCount = 1, logStartTime = null;
let dtInterval = null, budgetVal = 94.3, rtoSeconds = 0;
let dtChart = null, n9Chart = null;
const DT_POINTS = 40;
let dtOps = [], dtThrottle = [], dtLatency = [];
let dtMode = 'normal'; // normal | outage | recovery
let currentService = 'dynamodb';

// ── Service Health State ─────────────────────────────────────────
const svcInit = {
  dynamodb:    { status: 'ok',          text: 'OK' },
  rds:         { status: 'ok',          text: 'OK' },
  s3:          { status: 'ok',          text: 'OK' },
  lambda:      { status: 'ok',          text: 'OK' },
  apigw:       { status: 'ok',          text: 'OK' },
  sqs:         { status: 'ok',          text: 'OK' },
  sns:         { status: 'maintenance', text: 'MAINT' },
  eventbridge: { status: 'ok',          text: 'OK' },
  ecs:         { status: 'ok',          text: 'OK' },
};
let svcStates = JSON.parse(JSON.stringify(svcInit));

const ddbRegionInit = {
  east: { cls: '',        text: 'Operating Normally' },
  west: { cls: '',        text: 'Operating Normally' },
  eu:   { cls: '',        text: 'Operating Normally' },
};
let ddbRegions = JSON.parse(JSON.stringify(ddbRegionInit));

// ── Service health helpers ───────────────────────────────────────
function setSvcStatus(id, status, text) {
  svcStates[id] = { status, text };
  const badge = document.getElementById(`sbadge-${id}`);
  const dot   = document.getElementById(`sdot-${id}`);
  const row   = document.getElementById(`svc-row-${id}`);
  if (!badge) return;
  badge.className = `svc-badge ${status}`;
  badge.textContent = text;
  if (dot) {
    dot.className = 'svc-dot' +
      (status === 'outage' ? ' danger' : status === 'performance' ? ' warning' : status === 'maintenance' ? ' info' : status === 'recovering' ? ' info' : '');
  }
  if (row) {
    row.classList.toggle('has-issue', status === 'outage' || status === 'performance');
    row.classList.toggle('has-maintenance', status === 'maintenance');
  }
  updateHealthBadge();
}

function setDdbRegion(region, cls, text) {
  ddbRegions[region] = { cls, text };
  const dot  = document.getElementById(`rdot-ddb-${region}`);
  const stat = document.getElementById(`rstat-ddb-${region}`);
  if (dot)  dot.className = `rdot ${cls}`;
  if (stat) { stat.className = `rstat ${cls}`; stat.textContent = text; }
}

function updateHealthBadge() {
  const issues = Object.values(svcStates).filter(s => s.status === 'outage' || s.status === 'performance').length;
  const maints  = Object.values(svcStates).filter(s => s.status === 'maintenance').length;
  const badge   = document.getElementById('health-all-badge');
  if (!badge) return;
  if (issues > 0) {
    badge.textContent = `${issues} ISSUE${issues>1?'S':''}`;
    badge.className   = 'panel-badge danger';
  } else if (maints > 0) {
    badge.textContent = `${maints} MAINT`;
    badge.className   = 'panel-badge';
    badge.style.background = 'rgba(79,195,247,0.12)';
    badge.style.color = '#7dd3fc';
    badge.style.borderColor = 'rgba(79,195,247,0.3)';
  } else {
    badge.textContent = 'ALL OK';
    badge.className   = 'panel-badge';
    badge.style.cssText = '';
  }
}

function toggleDetail(id) {
  const detail = document.getElementById(`sdetail-${id}`);
  const chev   = document.getElementById(`svc-chev-${id}`);
  if (!detail) return;
  const isOpen = detail.classList.toggle('open');
  if (chev) chev.classList.toggle('open', isOpen);
}

// ── Chart init ───────────────────────────────────────────────────
function initCharts() {
  dtOps = []; dtThrottle = []; dtLatency = [];
  for (let i = 0; i < DT_POINTS; i++) {
    dtOps.push(4000 + Math.random() * 400);
    dtThrottle.push(0 + Math.random() * 0.2);
    dtLatency.push(3.5 + Math.random() * 0.8);
  }

  const dtCtx = document.getElementById('dt-chart').getContext('2d');
  dtChart = new Chart(dtCtx, {
    type: 'line',
    data: {
      labels: Array.from({ length: DT_POINTS }, () => ''),
      datasets: [
        { label: 'Ops/sec', data: [...dtOps], borderColor: '#22d3a5', backgroundColor: 'rgba(34,211,165,0.07)', borderWidth: 1.5, pointRadius: 0, fill: true, tension: 0.4, yAxisID: 'y' },
        { label: 'Throttle%', data: [...dtThrottle], borderColor: '#ef4444', backgroundColor: 'rgba(239,68,68,0.07)', borderWidth: 1.5, pointRadius: 0, fill: false, tension: 0.4, yAxisID: 'y2' },
        { label: 'Latency', data: dtLatency.map(v => v * 10), borderColor: '#4fc3f7', borderWidth: 1, pointRadius: 0, fill: false, tension: 0.4, yAxisID: 'y' },
      ]
    },
    options: {
      responsive: true, maintainAspectRatio: false, animation: { duration: 200 },
      plugins: { legend: { display: false }, tooltip: { enabled: false } },
      scales: { x: { display: false }, y: { display: false, min: 0, max: 5500 }, y2: { display: false, min: 0, max: 105 } }
    }
  });

  const n9Ctx = document.getElementById('n9-chart').getContext('2d');
  n9Chart = new Chart(n9Ctx, {
    type: 'line',
    data: {
      labels: Array.from({ length: 30 }, (_, i) => `D${i+1}`),
      datasets: [{ label: 'Budget%', data: buildN9Baseline(), borderColor: '#00c48c', backgroundColor: 'rgba(0,196,140,0.1)', borderWidth: 1.5, pointRadius: 0, fill: true, tension: 0.4 }]
    },
    options: {
      responsive: true, maintainAspectRatio: false, animation: { duration: 400 },
      plugins: { legend: { display: false }, tooltip: { enabled: false } },
      scales: { x: { display: false }, y: { display: false, min: 0, max: 100 } }
    }
  });
}

function buildN9Baseline() {
  const data = []; let v = 100;
  for (let i = 0; i < 30; i++) { v -= 0.15 + Math.random() * 0.25; data.push(Math.max(0, v)); }
  return data;
}

// ── Live DT tick ─────────────────────────────────────────────────
function pushDtTick() {
  let ops, thr, lat;
  if (dtMode === 'normal') {
    ops = 4000 + Math.random() * 400;
    thr = Math.random() * 0.2;
    lat = 3.5 + Math.random() * 0.8;
  } else if (dtMode === 'outage') {
    ops = Math.max(0, (dtOps.at(-1) || 4000) - 300 - Math.random() * 500);
    thr = Math.min(100, (dtThrottle.at(-1) || 0) + 8 + Math.random() * 15);
    lat = Math.min(30000, (dtLatency.at(-1) || 4) * (1.4 + Math.random() * 0.5));
  } else {
    ops = Math.min(4200, (dtOps.at(-1) || 0) + 200 + Math.random() * 300);
    thr = Math.max(0, (dtThrottle.at(-1) || 50) - 5 - Math.random() * 8);
    lat = Math.max(4, (dtLatency.at(-1) || 500) * (0.6 + Math.random() * 0.2));
  }
  dtOps.push(ops);     if (dtOps.length     > DT_POINTS) dtOps.shift();
  dtThrottle.push(thr);if (dtThrottle.length> DT_POINTS) dtThrottle.shift();
  dtLatency.push(lat); if (dtLatency.length > DT_POINTS) dtLatency.shift();

  dtChart.data.datasets[0].data = [...dtOps];
  dtChart.data.datasets[1].data = [...dtThrottle];
  dtChart.data.datasets[2].data = dtLatency.map(v => Math.min(v, 5000));
  dtChart.update('none');

  const lastOps = dtOps.at(-1), lastThr = dtThrottle.at(-1), lastLat = dtLatency.at(-1);
  setText('dt-throughput', lastOps < 50 ? '~0' : (lastOps / 1000).toFixed(1) + 'k');
  setText('dt-errors',     lastThr.toFixed(1) + '%');
  setText('dt-latency',    lastLat > 1000 ? '>1s' : lastLat > 100 ? lastLat.toFixed(0) + 'ms' : lastLat.toFixed(1) + 'ms');
  const errEl = document.getElementById('dt-errors');
  errEl.style.color = lastThr > 30 ? '#ef4444' : lastThr > 5 ? '#f59e0b' : '#22d3a5';
}

// ── Utilities ────────────────────────────────────────────────────
function setText(id, v)     { const e = document.getElementById(id); if (e) e.textContent = v; }
function svgAttr(id, a, v)  { const e = document.getElementById(id); if (e) e.setAttribute(a, v); }
function setTextEl(id, txt, fill) { const e = document.getElementById(id); if (!e) return; if (txt !== null && txt !== undefined) e.textContent = txt; if (fill) e.setAttribute('fill', fill); }
function setArrow(id, stroke, dash, marker) {
  const e = document.getElementById(id); if (!e) return;
  e.setAttribute('stroke', stroke);
  if (dash   !== null) e.setAttribute('stroke-dasharray', dash);
  if (marker !== null) e.setAttribute('marker-end', `url(#${marker})`);
}
function after(ms, fn) { const t = setTimeout(fn, ms / simSpeed); simTimers.push(t); }
function formatTime(s) { return String(Math.floor(s/60)).padStart(2,'0') + ':' + String(s%60).padStart(2,'0'); }

function addLog(icon, msg, type = 'info') {
  if (!logStartTime) logStartTime = Date.now();
  const e = Math.floor((Date.now() - logStartTime) / 1000);
  const ts = formatTime(e);
  const body = document.getElementById('console-body');
  const line = document.createElement('div');
  line.className = 'log-line';
  line.innerHTML = `<span class="log-ts">[${ts}]</span><span class="log-icon">${icon}</span><span class="log-msg ${type}">${msg}</span>`;
  body.appendChild(line);
  body.scrollTop = body.scrollHeight;
  logCount++;
  setText('log-count', logCount + ' events');
}

function setGlobalStatus(text, mode) {
  setText('global-status-text', text);
  document.getElementById('global-status-chip').className = 'status-chip ' + (mode || '');
  document.getElementById('global-dot').className = 'status-dot ' + (mode || '');
}
function setIncidentBanner(show, msg) {
  const el = document.getElementById('incident-banner');
  show ? el.classList.add('show') : el.classList.remove('show');
  if (msg) setText('inc-msg', msg);
}
function startIncidentTimer() {
  incidentStartMs = Date.now();
  incidentInterval = setInterval(() => {
    rtoSeconds = Math.floor((Date.now() - incidentStartMs) / 1000);
    setText('inc-timer', formatTime(rtoSeconds));
    setText('rh-rto', formatTime(rtoSeconds));
  }, 500);
}
function stopIncidentTimer() { clearInterval(incidentInterval); }

// ── Nobl9 burn ───────────────────────────────────────────────────
let n9BurnInterval = null;
function startN9Burn() {
  document.getElementById('n9-badge').textContent = 'BURNING';
  document.getElementById('n9-badge').className   = 'panel-badge danger';
  n9BurnInterval = setInterval(() => {
    budgetVal = Math.max(0, budgetVal - (0.3 + Math.random() * 0.5));
    setText('n9-budget-val', budgetVal.toFixed(1) + '%');
    document.getElementById('n9-budget-val').style.color = budgetVal < 20 ? '#ef4444' : budgetVal < 50 ? '#f59e0b' : '#00c48c';
    const tteD = Math.round((budgetVal / 100) * 43200 / 1440);
    setText('n9-burn', (4 + Math.random()).toFixed(1) + '×');
    setText('n9-tte',  tteD < 1 ? '< 1 day' : tteD + ' days');
    n9Chart.data.datasets[0].data.push(budgetVal);
    n9Chart.data.datasets[0].data.shift();
    n9Chart.update('none');
  }, 400 / simSpeed);
}
function stopN9Burn() { clearInterval(n9BurnInterval); }

// ── SIMULATION SEQUENCE ──────────────────────────────────────────
const serviceKeys = ['dynamodb', 'rds', 's3', 'lambda', 'apigw', 'sqs', 'sns', 'eventbridge', 'ecs'];

function startSim(serviceKey) {
  if (simRunning) return;
  simRunning = true;
  
  if (!serviceKey) {
    serviceKey = serviceKeys[Math.floor(Math.random() * serviceKeys.length)];
  }
  currentService = serviceKey;

  logStartTime = Date.now();
  document.getElementById('btn-trigger').disabled = true;

  const seq = [
    { t: 0,     fn: stepOutage },
    { t: 2500,  fn: stepHealthDetected },
    { t: 5000,  fn: stepEventBridge },
    { t: 8000,  fn: stepLambdaInvoked },
    { t: 11500, fn: stepHealthInverted },
    { t: 14500, fn: stepTrafficShifted },
    { t: 17500, fn: stepRecovered },
  ];
  seq.forEach(({ t, fn }) => after(t, fn));
}

function stepOutage() {
  const svcNames = {
    dynamodb: 'DynamoDB',
    rds: 'RDS',
    s3: 'S3',
    lambda: 'Lambda',
    apigw: 'API Gateway',
    sqs: 'SQS',
    sns: 'SNS',
    eventbridge: 'EventBridge',
    ecs: 'ECS'
  };
  const name = svcNames[currentService];

  setGlobalStatus(`CRITICAL — ${name} outage in us-east-1`, 'danger');
  setIncidentBanner(true, `🚨  BILLING APP INCIDENT — ${name} Service Disruption · us-east-1`);
  startIncidentTimer();
  dtMode = 'outage';

  // Service health
  setSvcStatus(currentService, 'outage', 'OUTAGE');
  if (['apigw', 'lambda', 'ecs'].includes(currentService)) {
    setSvcStatus('apigw', 'performance', 'PERF↓');
    setSvcStatus('lambda', 'performance', 'PERF↓');
  }

  if (currentService === 'dynamodb') {
    setDdbRegion('east', 'danger',  '🔴 Service Disruption');
    setDdbRegion('eu',   'warning', '⚠️ Increased latency');
    if (!document.getElementById('sdetail-dynamodb').classList.contains('open')) toggleDetail('dynamodb');
  }

  // SVG primary → red
  svgAttr('rect-primary', 'stroke', '#ef4444');
  svgAttr('rect-primary', 'fill',   'rgba(239,68,68,0.06)');
  setTextEl('label-primary',  'OUTAGE  ·  us-east-1',    '#ef4444');
  setTextEl('dot-primary',    null, '#ef4444');
  setTextEl('status-primary', 'DOWN',  '#ef4444');
  
  if (currentService === 'dynamodb') {
    setTextEl('ec2-p-stat', '● DynamoDB UNREACHABLE — Write timeout', '#ef4444');
    svgAttr('ddb-primary-rect', 'stroke', '#ef4444');
  } else {
    setTextEl('ec2-p-stat', `● ${name} Service Failure — 5xx / Timeout`, '#ef4444');
    // If it's not DynamoDB, also dim the DynamoDB cell specifically
    svgAttr('ddb-primary-rect', 'stroke', '#1e3050');
    setTextEl('ec2-p-stat', `● ${name} FAIL · Subgraph Dep. Broken`, '#ef4444');
  }
  
  svgAttr('dots-primary', 'visibility', 'hidden');

  // Resilience Hub
  document.getElementById('rh-badge').textContent = 'AT RISK';
  document.getElementById('rh-badge').className   = 'panel-badge danger';
  const sb = document.getElementById('rh-status-bar');
  sb.className = 'rh-status-bar danger';
  setText('rh-status-icon', '⚠️');
  setText('rh-status-msg', `${name} tier disruption — Billing App affected · Failover engaging`);
  document.getElementById('rh-score').textContent = '14 / 100';
  document.getElementById('rh-score').className   = 'rh-value danger';

  // Dynatrace alert
  document.getElementById('dt-alert').style.display = 'flex';
  setText('dt-alert-msg', `PROBLEM: ${name} Service Down · 100% error rate · us-east-1 CRITICAL`);
  document.getElementById('dt-badge').textContent = 'CRITICAL';
  document.getElementById('dt-badge').className   = 'panel-badge danger';

  startN9Burn();

  addLog('🔴', `${name}: Service disruption detected — us-east-1 endpoint unreachable`, 'error');
  addLog('💥', `Billing API: All operations depending on ${name} failing correctly`, 'error');
}

function stepHealthDetected() {
  const svcNames = {
    dynamodb: 'Amazon DynamoDB',
    rds: 'Amazon RDS',
    s3: 'Amazon S3',
    lambda: 'AWS Lambda',
    apigw: 'API Gateway',
    sqs: 'Amazon SQS',
    sns: 'Amazon SNS',
    eventbridge: 'EventBridge',
    ecs: 'Amazon ECS'
  };
  const name = svcNames[currentService];

  addLog('📋', `AWS Health: SERVICE_ISSUE event published — ${name} · us-east-1 disruption`, 'warn');
  addLog('📧', 'SNS notification sent to: arn:aws:sns:us-east-1:142824:BillingSubgraph-DR-Alerts', 'warn');

  svgAttr('rect-health', 'stroke', '#f59e0b');
  svgAttr('rect-health', 'fill',   'rgba(245,158,11,0.12)');
  setTextEl('health-title', 'AWS Health 🔔', '#f59e0b');
  setTextEl('health-sub',   `EVENT: SERVICE_ISSUE · ${currentService.toUpperCase()}`, 'rgba(255,255,255,0.6)');
}

function stepEventBridge() {
  addLog('⚡', `EventBridge: Rule matched — DR-AutoFailover-Rule · pattern: aws.health + ${currentService}`, 'system');
  addLog('📨', `EventBridge: Dispatching event to Lambda target: DR-${currentService.toUpperCase()}-Failover`, 'info');

  setArrow('arrow-h-eb', '#f59e0b', 'none', 'mk-purple');
  svgAttr('rect-eb', 'stroke', '#a78bfa');
  svgAttr('rect-eb', 'fill',   'rgba(167,139,250,0.12)');
  setTextEl('eb-title', 'EventBridge ⚡', '#a78bfa');
  setTextEl('eb-sub',   'Rule TRIGGERED', 'rgba(255,255,255,0.6)');
}

function stepLambdaInvoked() {
  addLog('🔧', 'Lambda INVOKED: arn:aws:lambda:us-east-1:142824:function:DR-Failover-Engine', 'recovery');
  addLog('🟣', 'Lambda: Performing regional failover logic for the Billing App', 'recovery');

  setArrow('arrow-eb-l', '#a78bfa', 'none', 'mk-purple');
  svgAttr('rect-lambda', 'stroke', '#a78bfa');
  svgAttr('rect-lambda', 'fill',   'rgba(167,139,250,0.15)');
  setTextEl('lambda-title', 'Lambda ⚙️', '#a78bfa');
  setTextEl('lambda-sub',   'EXECUTING...', 'rgba(255,255,255,0.6)');
  setArrow('path-lambda-r53', '#a78bfa', 'none', 'mk-purple');
  svgAttr('dots-lambda-r53', 'visibility', 'visible');
}

function stepHealthInverted() {
  addLog('🔄', 'Route53 Health Check → INVERTED · Primary weight: 100 → 0', 'recovery');
  addLog('🌐', 'Route53: Updating DNS records to point to us-west-2 (Secondary)', 'recovery');

  if (currentService === 'dynamodb') {
    setDdbRegion('east', 'danger',  '🔴 Isolated (HC inverted)');
    setDdbRegion('west', 'info',    '🔵 Promoting to Writer...');
  }

  svgAttr('rect-r53', 'stroke', '#a78bfa');
  setTextEl('r53-policy', 'Failover → Routing to us-west-2', '#a78bfa');
}

function stepTrafficShifted() {
  addLog('🎯', 'FAILOVER COMPLETE — 100% of Billing App traffic routed to us-west-2', 'success');
  addLog('✅', 'Secondary Region Active — All Billing App services healthy in us-west-2', 'success');

  setSvcStatus(currentService, 'recovering', 'FAILOVER');
  setSvcStatus('lambda',   'ok', 'OK');
  setSvcStatus('apigw',    'ok', 'OK');
  
  if (currentService === 'dynamodb') {
    setDdbRegion('east', 'danger',  '🔴 Isolated · Recovery in progress');
    setDdbRegion('west', '',        '✅ Writer Active · 0ms lag');
  }

  setArrow('path-to-primary',   '#1e3050', '8,4', 'mk-dim');
  setArrow('path-to-secondary', '#22d3a5', 'none', 'mk-healthy');
  svgAttr('dots-primary',   'visibility', 'hidden');
  svgAttr('dots-secondary', 'visibility', 'visible');

  svgAttr('rect-secondary', 'stroke', '#22d3a5');
  svgAttr('rect-secondary', 'fill',   'rgba(34,211,165,0.05)');
  svgAttr('rect-secondary', 'stroke-dasharray', 'none');
  
  // Highlighting Active Failover
  document.getElementById('rect-secondary').classList.add('failover-active');
  document.getElementById('label-secondary').classList.add('active-failover');
  document.getElementById('status-secondary').classList.add('active-failover');

  setTextEl('label-secondary', 'PRIMARY (FAILOVER)  ·  us-west-2', '#22d3a5');
  setTextEl('dot-secondary', null, '#22d3a5');
  setTextEl('status-secondary', 'ACTIVE', '#22d3a5');
  
  dtMode = 'recovery';
  document.getElementById('dt-alert').style.display = 'none';
  document.getElementById('dt-badge').textContent = 'RECOVERING';
  document.getElementById('dt-badge').className   = 'panel-badge warning';

  setGlobalStatus('FAILOVER COMPLETE — Running on us-west-2', 'warning');
}

function stepRecovered() {
  stopIncidentTimer();
  dtMode = 'normal';
  const rtoFmt = formatTime(rtoSeconds);

  addLog('🏁', `RTO ACHIEVED: ${rtoFmt} · Target was 5 min · Billing App operational`, 'success');
  addLog('💰', 'Incident Summary: Zero transaction loss achieved through fully automated failover', 'success');

  setGlobalStatus('RECOVERED — Running on us-west-2', '');
  setIncidentBanner(false, '');
  stopN9Burn();

  svgAttr('dots-lambda-r53', 'visibility', 'hidden');
  setArrow('path-lambda-r53', '#1e3050', '7,4', 'mk-dim');
  svgAttr('rect-r53', 'stroke', '#22d3a5');
  setTextEl('r53-policy', 'Failover — Route to us-west-2', '#22d3a5');

  document.getElementById('rh-badge').textContent = 'RECOVERED';
  document.getElementById('rh-badge').className   = 'panel-badge recovery';
  const sb = document.getElementById('rh-status-bar');
  sb.className = 'rh-status-bar';
  setText('rh-status-icon', '✅');
  setText('rh-status-msg', `Failover complete. Actual RTO: ${rtoFmt}. Within policy targets.`);
  document.getElementById('rh-score').textContent = '76 / 100';
  document.getElementById('rh-score').className   = 'rh-value warning';

  document.getElementById('dt-badge').textContent = 'NOMINAL';
  document.getElementById('dt-badge').className   = 'panel-badge dt-badge';
  document.getElementById('n9-badge').textContent = 'RECOVERING';
  document.getElementById('n9-badge').className = 'panel-badge warning';

  simRunning = false;
  document.getElementById('btn-trigger').disabled = false;
}

// ── RESET ────────────────────────────────────────────────────────
function resetSim() {
  simTimers.forEach(clearTimeout); simTimers = [];
  stopIncidentTimer(); stopN9Burn(); clearInterval(dtInterval);
  simRunning = false; logStartTime = null; rtoSeconds = 0;
  budgetVal = 94.3; dtMode = 'normal';

  // Service health
  Object.entries(svcInit).forEach(([id, v]) => setSvcStatus(id, v.status, v.text));
  Object.entries(ddbRegionInit).forEach(([r, v]) => setDdbRegion(r, v.cls, v.text));
  const det = document.getElementById('sdetail-dynamodb');
  if (det) det.classList.remove('open');
  const chev = document.getElementById('svc-chev-dynamodb');
  if (chev) chev.classList.remove('open');

  // SVG Primary
  svgAttr('rect-primary', 'stroke', '#22d3a5'); svgAttr('rect-primary', 'fill', 'rgba(34,211,165,0.04)');
  setTextEl('label-primary', 'PRIMARY  ·  us-east-1', '#22d3a5');
  setTextEl('dot-primary', null, '#22d3a5'); setTextEl('status-primary', 'HEALTHY', '#22d3a5');
  setTextEl('alb-p-stat', '● Active — Billing API v2.4  ·  12ms', '#22d3a5');
  setTextEl('ec2-p-stat', '● Writer Active — 0ms lag · 4,200 WCU', '#22d3a5');
  setTextEl('rds-p-stat', '● RDS Active · S3 Available  ·  2s sync', '#22d3a5');
  svgAttr('ddb-primary-rect', 'stroke', '#3b82f6');
  svgAttr('dots-primary', 'visibility', 'visible');

  // SVG Secondary
  svgAttr('rect-secondary', 'stroke', '#1e3050'); svgAttr('rect-secondary', 'fill', 'rgba(30,48,80,0.3)');
  svgAttr('rect-secondary', 'stroke-dasharray', '6,3');
  setTextEl('label-secondary', 'WARM STANDBY  ·  us-west-2', '#334155');
  setTextEl('dot-secondary', null, '#334155'); setTextEl('status-secondary', 'STANDBY', '#334155');
  setTextEl('alb-s-stat', '● Warm — Ready to accept traffic', '#334155');
  setTextEl('ec2-s-stat', '● Replica — 180ms replication lag', '#334155');
  setTextEl('rds-s-stat', '● Queue depth 0 · Standby', '#334155');
  svgAttr('ddb-secondary-rect', 'stroke', '#1e3050');
  svgAttr('dots-secondary', 'visibility', 'hidden');

  document.getElementById('rect-secondary').classList.remove('failover-active');
  document.getElementById('label-secondary').classList.remove('active-failover');
  document.getElementById('status-secondary').classList.remove('active-failover');

  // Routes + Control Plane
  setArrow('path-to-primary',   '#22d3a5', 'none', 'mk-healthy');
  setArrow('path-to-secondary', '#1e3050', '8,4',  'mk-dim');
  setArrow('arrow-h-eb',       '#1e3050', 'none', 'mk-dim');
  setArrow('arrow-eb-l',       '#1e3050', 'none', 'mk-dim');
  setArrow('path-lambda-r53',  '#1e3050', '7,4',  'mk-dim');
  svgAttr('dots-lambda-r53', 'visibility', 'hidden');
  ['health','eb','lambda'].forEach(n => { svgAttr(`rect-${n}`, 'stroke', '#1e3050'); svgAttr(`rect-${n}`, 'fill', '#0d1524'); });
  setTextEl('health-title', 'AWS Health', '#334155'); setTextEl('health-sub', 'Personal Health Dashboard', '#334155');
  setTextEl('eb-title', 'EventBridge', '#334155'); setTextEl('eb-sub', 'Rule: DR-AutoFailover', '#334155');
  setTextEl('lambda-title', 'Lambda', '#334155'); setTextEl('lambda-sub', 'DR-HealthCheck-Inverter', '#334155');
  setTextEl('replication-label', 'GLOBAL REPLICATION', '#3b82f6');
  svgAttr('rect-r53', 'stroke', '#22d3a5'); setTextEl('r53-policy', 'Active-Passive Failover Policy', '#64748b');

  // Banners + status
  setIncidentBanner(false, ''); setText('inc-timer', '00:00');
  setGlobalStatus('ALL SYSTEMS OPERATIONAL', '');

  // Resilience Hub
  document.getElementById('rh-badge').textContent = 'RESILIENT';
  document.getElementById('rh-badge').className   = 'panel-badge';
  document.getElementById('rh-status-bar').className = 'rh-status-bar';
  setText('rh-status-icon', '✅');
  setText('rh-status-msg', 'All disruption types within RTO/RPO targets. DynamoDB Global Tables configured.');
  document.getElementById('rh-score').textContent = '84 / 100';
  document.getElementById('rh-score').className   = 'rh-value';
  setText('rh-rto', '—'); setText('rh-policy', 'Within Policy');

  // Charts + DT
  document.getElementById('dt-alert').style.display = 'none';
  document.getElementById('dt-badge').textContent = 'NOMINAL';
  document.getElementById('dt-badge').className   = 'panel-badge dt-badge';
  setText('dt-throughput', '4.2k'); setText('dt-errors', '0.0%'); setText('dt-latency', '3.8ms');
  document.getElementById('dt-errors').style.color = '#22d3a5';

  initCharts();
  budgetVal = 94.3;
  setText('n9-budget-val', '94.3%');
  document.getElementById('n9-budget-val').style.color = '#00c48c';
  setText('n9-burn', '0.8×'); setText('n9-tte', '37 days');
  document.getElementById('n9-badge').textContent = 'ON TRACK';
  document.getElementById('n9-badge').className = 'panel-badge n9-badge';
  n9Chart.data.datasets[0].data = buildN9Baseline();
  n9Chart.update();

  // Console
  document.getElementById('console-body').innerHTML = '';
  logCount = 0; setText('log-count', '0 events');
  addLog('✅', 'System reset — Billing App fully operational in us-east-1', 'success');

  document.getElementById('btn-trigger').disabled = false;
  dtInterval = setInterval(pushDtTick, 600);
}

function setSpeed(n, btn) {
  simSpeed = n;
  document.querySelectorAll('.speed-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
}

// ── BOOT ─────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  initCharts();
  dtInterval = setInterval(pushDtTick, 600);
  Object.entries(svcInit).forEach(([id, v]) => setSvcStatus(id, v.status, v.text));
  Object.entries(ddbRegionInit).forEach(([r, v]) => setDdbRegion(r, v.cls, v.text));
  updateHealthBadge();
  addLog('🟢', 'Billing App DR Simulator ready — Click "RANDOM Outage" or select a service to simulate.', 'system');
});
