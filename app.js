/* ═══════════════════════════════════════════════════════════════
   CF STUDY CHECKLIST — app.js
   Single-file vanilla JS application.
   Routes: #participant  #collector  #admin
   Storage: localStorage (synced via manual export/import for cross-device)
   ═══════════════════════════════════════════════════════════════ */

'use strict';

// ─── STUDY CONFIGURATION ────────────────────────────────────────────────────

const SURVEYS = {
  sleep:   { label: 'Sleep Quality Survey',       url: 'https://purdue.ca1.qualtrics.com/jfe/form/SV_80buUCCnp3ssuEu' },
  anxiety: { label: 'Test Anxiety Survey',         url: 'https://purdue.ca1.qualtrics.com/jfe/form/SV_bkGoyGnyAYnrbtY' },
  fatigue: { label: 'Fatigue Survey',              url: 'https://purdue.ca1.qualtrics.com/jfe/form/SV_eD4CwmMjOpMLm3c' },
  review:  { label: 'Review Text Check',           url: 'https://purdue.ca1.qualtrics.com/jfe/form/SV_8k5vYg8glY43VIi' },
};

const SESSION1 = [
  { id:'S1-01a', label:'Sleep Quality Survey',          type:'survey', key:'sleep',   phase:'pre',  desc:'Before Exam 1',         who:'participant' },
  { id:'S1-01b', label:'Test Anxiety Survey',           type:'survey', key:'anxiety', phase:'pre',  desc:'Before Exam 1',         who:'participant' },
  { id:'S1-01c', label:'Fatigue Survey (Pre-Exam)',     type:'survey', key:'fatigue', phase:'pre',  desc:'Before Exam 1',         who:'participant' },
  { id:'S1-02',  label:'Polar H10 Fitted & Verified',  type:'ra',                    desc:'Check HRV sensor signal',     who:'ra' },
  { id:'S1-03',  label:'Resting HRV Baseline (5 min)', type:'ra',                    desc:'Record before Exam 1 starts', who:'ra' },
  { id:'S1-04',  label:'Exam 1 — Start Time',          type:'timestamp',             desc:'Mark exact start',            who:'ra' },
  { id:'S1-05',  label:'Exam 1 — End Time',            type:'timestamp',             desc:'Mark exact end',              who:'ra' },
  { id:'S1-06a', label:'Sleep Quality Survey (Post)',  type:'survey', key:'sleep',   phase:'post', desc:'After Exam 1',          who:'participant' },
  { id:'S1-06b', label:'Test Anxiety Survey (Post)',   type:'survey', key:'anxiety', phase:'post', desc:'After Exam 1',          who:'participant' },
  { id:'S1-06c', label:'Fatigue Survey (Post-Exam)',   type:'survey', key:'fatigue', phase:'post', desc:'After Exam 1',          who:'participant' },
  { id:'S1-07',  label:'Review Materials Delivered',  type:'ra',                    desc:'Explain task + hand out',     who:'ra' },
];

const SESSION2_ALL = [
  { id:'S2-01',  label:'Review Text Check',            type:'survey', key:'review',  phase:'pre',  desc:'Review group only',     who:'participant', reviewOnly:true },
  { id:'S2-02a', label:'Sleep Quality Survey',         type:'survey', key:'sleep',   phase:'pre',  desc:'Before Exam 2',         who:'participant' },
  { id:'S2-02b', label:'Test Anxiety Survey',          type:'survey', key:'anxiety', phase:'pre',  desc:'Before Exam 2',         who:'participant' },
  { id:'S2-02c', label:'Fatigue Survey (Pre-Exam)',    type:'survey', key:'fatigue', phase:'pre',  desc:'Before Exam 2',         who:'participant' },
  { id:'S2-03',  label:'Resting HRV Baseline (5 min)',type:'ra',                    desc:'Record before Exam 2 starts', who:'ra' },
  { id:'S2-04',  label:'Exam 2 — Start Time',         type:'timestamp',             desc:'Mark exact start',            who:'ra' },
  { id:'S2-05',  label:'Exam 2 — End Time',           type:'timestamp',             desc:'Mark exact end',              who:'ra' },
  { id:'S2-06',  label:'Fatigue Survey (Post-Exam)',  type:'survey', key:'fatigue', phase:'post', desc:'After Exam 2',          who:'participant' },
  { id:'S2-07',  label:'Compensation Recorded',       type:'ra',                    desc:'Bonus + final payment',       who:'ra' },
];

const REVIEW_GROUPS = ['Review', 'No Review'];

const STATUS_META = {
  new:           { label:'Registered',     badge:'badge-teal'  },
  scheduled:     { label:'Scheduled',      badge:'badge-amber' },
  session1_live: { label:'Session 1 Live', badge:'badge-blue'  },
  session1_done: { label:'Session 1 Done', badge:'badge-amber' },
  session2_live: { label:'Session 2 Live', badge:'badge-blue'  },
  complete:      { label:'Complete',       badge:'badge-green' },
  dropped:       { label:'Dropped',        badge:'badge-red'   },
};

const ADMIN_PASSWORD = 'CFstudy2025';

// ─── STATE ───────────────────────────────────────────────────────────────────

const APP = {
  view:           'participant',
  participants:   {},     // code → participant
  adminAuthed:    false,
  collectorCode:  null,
  raInitials:     '',
};

// ─── STORAGE ─────────────────────────────────────────────────────────────────

const DB = {
  KEY: 'cf_checklist_v1',
  load() {
    try {
      const raw = localStorage.getItem(this.KEY);
      if (raw) {
        const saved = JSON.parse(raw);
        APP.participants = saved.participants || {};
        APP.adminAuthed  = false; // never persist auth
      }
    } catch(e) { console.error('DB load error', e); }
  },
  save() {
    try {
      localStorage.setItem(this.KEY, JSON.stringify({ participants: APP.participants, savedAt: new Date().toISOString() }));
    } catch(e) { console.error('DB save error', e); }
  },
  export() {
    const data = JSON.stringify({ participants: APP.participants, exportedAt: new Date().toISOString() }, null, 2);
    triggerDownload('cf_study_data_' + dateTag() + '.json', data, 'application/json');
  },
  import(json) {
    try {
      const d = JSON.parse(json);
      if (d.participants) {
        // Merge — imported data wins on conflict
        Object.assign(APP.participants, d.participants);
        DB.save();
        return true;
      }
    } catch(e) {}
    return false;
  }
};

// ─── PARTICIPANT LOGIC ────────────────────────────────────────────────────────

function nextCode() {
  const nums = Object.keys(APP.participants)
    .map(c => parseInt(c.replace('CF',''), 10))
    .filter(n => !isNaN(n));
  return 'CF' + String((nums.length ? Math.max(...nums) : 0) + 1).padStart(3, '0');
}

function balancedGroup() {
  const counts = { 'Review': 0, 'No Review': 0 };
  Object.values(APP.participants).forEach(p => {
    if (counts[p.group] !== undefined) counts[p.group]++;
  });
  const min = Math.min(...Object.values(counts));
  const cands = Object.keys(counts).filter(g => counts[g] === min);
  return cands[Math.floor(Math.random() * cands.length)];
}

function createParticipant({ firstName, lastName, email, phone='', group='', ra='' }) {
  const code  = nextCode();
  const grp   = group || balancedGroup();
  const p = {
    code, group: grp,
    firstName, lastName, email, phone,
    raInitials: ra,
    status: 'new',
    registeredAt: new Date().toISOString(),
    s1: {},   // stepId → { done, ts, note }
    s2: {},
    s1Date:'', s1Time:'',
    s2Date:'', s2Time:'',
    hrv1:'', hrv2:'',
    notes:'',
  };
  APP.participants[code] = p;
  DB.save();
  return p;
}

function s2Steps(p) {
  const isReview = p.group === 'Review';
  return SESSION2_ALL.filter(s => !s.reviewOnly || isReview);
}

function s1Progress(p) {
  const done  = SESSION1.filter(s => p.s1[s.id]?.done).length;
  return { done, total: SESSION1.length, pct: Math.round(done / SESSION1.length * 100) };
}

function s2Progress(p) {
  const steps = s2Steps(p);
  const done  = steps.filter(s => p.s2[s.id]?.done).length;
  return { done, total: steps.length, pct: steps.length ? Math.round(done / steps.length * 100) : 0 };
}

function nextS1Step(p) { return SESSION1.find(s => !p.s1[s.id]?.done) || null; }
function nextS2Step(p) { return s2Steps(p).find(s => !p.s2[s.id]?.done) || null; }

function markStep(p, session, stepId, note='', ts=null) {
  const bucket = session === 1 ? p.s1 : p.s2;
  bucket[stepId] = { done: true, ts: ts || new Date().toISOString(), note };
  recalcStatus(p);
  DB.save();
}

function unmarkStep(p, session, stepId) {
  const bucket = session === 1 ? p.s1 : p.s2;
  delete bucket[stepId];
  recalcStatus(p);
  DB.save();
}

function recalcStatus(p) {
  const s1all  = nextS1Step(p) === null;
  const s2all  = nextS2Step(p) === null;
  const s1any  = Object.keys(p.s1).length > 0;
  const s2any  = Object.keys(p.s2).length > 0;
  if      (s1all && s2all) p.status = 'complete';
  else if (s2any)          p.status = 'session2_live';
  else if (s1all)          p.status = 'session1_done';
  else if (s1any)          p.status = 'session1_live';
  else if (p.s1Date)       p.status = 'scheduled';
  else                     p.status = 'new';
}

function tlPhase(p) {
  // 0=Registered 1=Session1 2=Between 3=Session2 4=Done
  switch(p.status) {
    case 'new': case 'scheduled': return 0;
    case 'session1_live':         return 1;
    case 'session1_done':         return 2;
    case 'session2_live':         return 3;
    case 'complete':              return 4;
    default: return 0;
  }
}

// ─── ROUTING ─────────────────────────────────────────────────────────────────

function getRoute() {
  const h = location.hash.replace('#','');
  return ['participant','collector','admin'].includes(h) ? h : 'participant';
}

window.addEventListener('hashchange', () => render());
window.addEventListener('DOMContentLoaded', () => { DB.load(); render(); });

function render() {
  const route = getRoute();
  APP.view = route;
  document.getElementById('root').innerHTML = buildShell(route);
  bindCommon();
  switch(route) {
    case 'participant': renderParticipant(); break;
    case 'collector':   renderCollector();   break;
    case 'admin':       renderAdmin();       break;
  }
}

function navigate(view) { location.hash = view; }

// ─── SHELL ───────────────────────────────────────────────────────────────────

function buildShell(active) {
  const tabs = [
    { id:'participant', icon:'○', label:'Participant'   },
    { id:'collector',   icon:'◈', label:'Data Collector'},
    { id:'admin',       icon:'◆', label:'Admin'         },
  ];
  return `
    <header class="topbar">
      <a class="logo" href="#participant">
        <div class="logo-chip">CF</div>
        <div>
          <div class="logo-name">Study Checklist</div>
          <div class="logo-sub">Purdue · Cognitive Flexibility</div>
        </div>
      </a>
      <nav class="nav">
        ${tabs.map(t => `
          <button class="nav-btn${t.id===active?' active':''}" onclick="navigate('${t.id}')">
            <span class="nav-icon">${t.icon}</span> ${t.label}
          </button>`).join('')}
      </nav>
      <div class="topbar-right">
        <div class="live-pill"><div class="live-dot"></div>Live</div>
      </div>
    </header>
    <div id="page" class="page-wrap"></div>
    <div id="modal-layer"></div>
  `;
}

function setPage(html) {
  const el = document.getElementById('page');
  el.style.animation = 'none';
  requestAnimationFrame(() => {
    el.innerHTML = html;
    el.style.animation = 'fadeUp 0.28s ease both';
  });
}

function bindCommon() {}

// ═══════════════════════════════════════════════════════════════════════════
// VIEW: PARTICIPANT
// ═══════════════════════════════════════════════════════════════════════════

function renderParticipant() {
  setPage(`
    <div class="hero">
      <div class="hero-eyebrow">Purdue University · CF Study</div>
      <h1>Your Study<br/><span>Checklist</span></h1>
      <p>Enter your Participant ID to access your personalized session checklist and complete each step in order.</p>
    </div>

    <div style="max-width:440px;margin:0 auto">
      <div class="card">
        <div class="card-label">Access Your Portal</div>
        <div class="field" style="margin-bottom:14px">
          <label class="lbl">Participant ID</label>
          <input class="input mono" id="p-code" placeholder="CF001" maxlength="6" autocomplete="off"/>
        </div>
        <button class="btn btn-primary btn-full btn-lg" onclick="pLookup()">Access My Sessions →</button>
        <div class="divider"></div>
        <p class="text-sm text-muted" style="text-align:center">
          New participant? <a href="#" onclick="showRegModal();return false" style="color:var(--teal-dk);text-decoration:none;font-weight:500">Register here</a>
        </p>
      </div>
      <div id="p-result"></div>
    </div>
  `);

  document.getElementById('p-code').addEventListener('keydown', e => {
    if (e.key === 'Enter') pLookup();
  });
}

function pLookup() {
  const code = document.getElementById('p-code').value.trim().toUpperCase();
  const el   = document.getElementById('p-result');
  const p    = APP.participants[code];
  if (!p) {
    el.innerHTML = `<div class="alert alert-error">✗ No participant found for <strong>${escHtml(code)}</strong>. Please check your ID or contact your RA.</div>`;
    return;
  }
  el.innerHTML = buildParticipantPortal(p);
}

function buildParticipantPortal(p) {
  const phase = tlPhase(p);
  const prog1 = s1Progress(p);
  const prog2 = s2Progress(p);

  return `
  <div style="animation:slideRight 0.25s ease">
    ${buildIDCard(p)}
    ${buildTimeline(phase)}
    ${buildParticipantS1(p, prog1)}
    ${phase >= 2 ? buildParticipantS2(p, prog2) : ''}
    ${p.status === 'complete' ? buildCompleteBanner() : ''}
  </div>`;
}

function buildIDCard(p) {
  const sm = STATUS_META[p.status] || STATUS_META.new;
  return `
  <div class="id-card">
    <div class="id-card-code">${p.code}</div>
    <div class="id-card-name">${escHtml(p.firstName)} ${escHtml(p.lastName)}</div>
    <div class="id-card-meta">
      <div>
        <div class="id-meta-item">Group</div>
        <div class="id-meta-val">${p.group}</div>
      </div>
      <div>
        <div class="id-meta-item">Status</div>
        <div class="id-meta-val">${sm.label}</div>
      </div>
      ${p.s1Date ? `<div>
        <div class="id-meta-item">Session 1</div>
        <div class="id-meta-val">${p.s1Date}${p.s1Time ? ' · '+p.s1Time : ''}</div>
      </div>` : ''}
      ${p.s2Date ? `<div>
        <div class="id-meta-item">Session 2</div>
        <div class="id-meta-val">${p.s2Date}${p.s2Time ? ' · '+p.s2Time : ''}</div>
      </div>` : ''}
    </div>
    <button class="btn btn-sm" style="position:absolute;top:20px;right:20px;background:rgba(255,255,255,.1);color:white;border-color:rgba(255,255,255,.2)" onclick="downloadParticipantReport('${p.code}')">↓ Download</button>
  </div>`;
}

function buildTimeline(phase) {
  const nodes = ['Registered','Session 1','Between','Session 2','Complete'];
  return `
  <div class="card" style="padding:20px 24px">
    <div class="card-label" style="margin-bottom:16px">Study Progress</div>
    <div class="timeline">
      ${nodes.map((lbl, i) => {
        const done   = phase > i;
        const active = phase === i;
        return `<div class="tl-node">
          <div class="tl-circle ${done?'tl-done':active?'tl-active':''}">${done ? '✓' : i+1}</div>
          <div class="tl-lbl ${done?'tl-done':active?'tl-active':''}">${lbl}</div>
        </div>`;
      }).join('')}
    </div>
  </div>`;
}

function buildParticipantS1(p, prog) {
  const activeId = nextS1Step(p)?.id;
  return `
  <div class="session-card mb16">
    <div class="session-card-header">
      <div>
        <div class="session-num">Session 1</div>
        <div class="session-title">Day 1 — Exam &amp; Surveys</div>
      </div>
      <span class="badge ${prog.pct===100?'badge-green':'badge-teal'}">${prog.done}/${prog.total} steps</span>
    </div>
    <div class="session-card-body">
      <div class="progress-wrap mb16">
        <div class="progress-bar"><div class="progress-fill" style="width:${prog.pct}%"></div></div>
        <div class="progress-meta"><span>${prog.pct}% complete</span>${p.s1Date?`<span class="mono">${p.s1Date}</span>`:''}</div>
      </div>
      <div class="step-list">
        ${SESSION1.map((s, idx) => buildParticipantStep(p, s, idx, 1, activeId)).join('')}
      </div>
    </div>
  </div>`;
}

function buildParticipantS2(p, prog) {
  const steps    = s2Steps(p);
  const activeId = nextS2Step(p)?.id;
  return `
  <div class="session-card mb16">
    <div class="session-card-header" style="border-top:3px solid var(--green);border-radius:var(--r-lg) var(--r-lg) 0 0">
      <div>
        <div class="session-num">Session 2</div>
        <div class="session-title">Day 2 — Exam &amp; Surveys</div>
      </div>
      <span class="badge ${prog.pct===100?'badge-green':'badge-teal'}">${prog.done}/${prog.total} steps</span>
    </div>
    <div class="session-card-body">
      <div class="progress-wrap mb16">
        <div class="progress-bar"><div class="progress-fill s2" style="width:${prog.pct}%"></div></div>
        <div class="progress-meta"><span>${prog.pct}% complete</span>${p.s2Date?`<span class="mono">${p.s2Date}</span>`:''}</div>
      </div>
      <div class="step-list">
        ${steps.map((s, idx) => buildParticipantStep(p, s, idx, 2, activeId)).join('')}
      </div>
    </div>
  </div>`;
}

function buildParticipantStep(p, s, idx, session, activeId) {
  const bucket   = session === 1 ? p.s1 : p.s2;
  const rec      = bucket[s.id];
  const done     = !!rec?.done;
  const isActive = s.id === activeId;
  const locked   = !done && !isActive;
  const cls      = done ? 's-done' : isActive ? 's-active' : locked ? 's-locked' : '';

  let typePill = '';
  if (s.type === 'survey')    typePill = `<span class="type-pill type-survey">Survey</span>`;
  if (s.type === 'ra')        typePill = `<span class="type-pill type-ra">RA</span>`;
  if (s.type === 'timestamp') typePill = `<span class="type-pill type-ts">Timestamp</span>`;
  if (s.reviewOnly)           typePill += ` <span class="type-pill type-review">Review Group</span>`;

  let actionHtml = '';
  if (isActive && s.type === 'survey') {
    actionHtml = `
      <div class="step-actions">
        <button class="btn btn-primary btn-sm" onclick="openSurveyModal('${s.key}','${p.code}','${s.id}',${session})">
          Open Survey →
        </button>
      </div>`;
  }
  if (isActive && (s.type === 'ra' || s.type === 'timestamp')) {
    actionHtml = `<div class="step-actions"><span class="text-sm text-muted">⌛ Waiting for RA to complete this step</span></div>`;
  }

  return `
  <div class="step-row ${cls}">
    <div class="step-index ${done?'done':isActive?'active':''}">
      ${done ? '' : idx+1}
      ${isActive && !done ? '<div class="pulse-ring"></div>' : ''}
    </div>
    <div class="step-body">
      <div class="step-name ${done?'done':''}">${s.label}</div>
      <div class="step-desc">
        <span>${s.desc}</span>
        ${typePill}
        ${rec?.ts ? `<span class="step-ts">✓ ${fmtTs(rec.ts)}</span>` : ''}
      </div>
      ${actionHtml}
    </div>
  </div>`;
}

function buildCompleteBanner() {
  return `
  <div class="complete-banner">
    <div class="complete-icon">🎉</div>
    <div class="complete-title">Study Complete!</div>
    <div class="complete-sub">Thank you for participating. Compensation will be processed within 5 business days.</div>
  </div>`;
}

// Survey modal for participant
function openSurveyModal(key, code, stepId, session) {
  const survey = SURVEYS[key];
  const url    = survey.url + '?participant=' + code;
  showModal(`
    <div class="modal-title">${survey.label}</div>
    <div class="alert alert-info mb16">
      📋 The survey will open in a new tab. Complete it, then come back and click <strong>Mark as Submitted</strong>.
    </div>
    <div style="background:var(--surface2);border:1px solid var(--line);border-radius:var(--r);padding:12px 14px;margin-bottom:16px">
      <div class="text-xs text-muted mono mb4">Participant ID embedded:</div>
      <code style="font-family:var(--font-mono);font-size:12px;color:var(--teal-dk);word-break:break-all">${url}</code>
    </div>
    <a href="${url}" target="_blank" class="btn btn-primary btn-full" style="margin-bottom:10px">
      Open Survey in New Tab ↗
    </a>
    <button class="btn btn-green btn-full" onclick="participantMarkSurvey('${code}','${stepId}',${session})">
      ✓ Mark as Submitted
    </button>
    <button class="btn btn-ghost btn-full" style="margin-top:8px" onclick="closeModal()">Cancel</button>
  `);
}

function participantMarkSurvey(code, stepId, session) {
  const p = APP.participants[code];
  if (!p) return;
  markStep(p, session, stepId);
  closeModal();
  // Refresh portal inline
  const el = document.getElementById('p-result');
  if (el) el.innerHTML = buildParticipantPortal(p);
}

function downloadParticipantReport(code) {
  const p = APP.participants[code];
  if (!p) return;
  exportParticipantCSV(p);
}

// ═══════════════════════════════════════════════════════════════════════════
// VIEW: COLLECTOR
// ═══════════════════════════════════════════════════════════════════════════

function renderCollector() {
  setPage(`
    <div class="section-head mb20">
      <div>
        <div class="card-label">Data Collector Interface</div>
        <div class="page-title">Session Manager</div>
        <div class="page-sub">Load a participant to manage their checklist, mark steps, and record timestamps.</div>
      </div>
    </div>

    <div class="card" style="max-width:520px;margin-bottom:24px">
      <div class="card-label" style="margin-bottom:14px">Load Participant</div>
      <div class="g2">
        <div class="field">
          <label class="lbl">Participant Code</label>
          <input class="input mono" id="c-code" placeholder="CF001" maxlength="6" autocomplete="off"/>
        </div>
        <div class="field">
          <label class="lbl">RA Initials</label>
          <input class="input" id="c-ra" placeholder="AJ" maxlength="4"/>
        </div>
      </div>
      <button class="btn btn-primary btn-full" onclick="collectorLoad()">Load →</button>
    </div>

    <div id="c-panel"></div>
  `);

  document.getElementById('c-code').addEventListener('keydown', e => {
    if (e.key === 'Enter') collectorLoad();
  });
}

function collectorLoad() {
  const code = document.getElementById('c-code').value.trim().toUpperCase();
  const ra   = document.getElementById('c-ra').value.trim();
  const p    = APP.participants[code];
  const el   = document.getElementById('c-panel');

  if (!p) {
    el.innerHTML = `<div class="alert alert-error">✗ Participant <strong>${escHtml(code)}</strong> not found.</div>`;
    return;
  }
  if (ra) { p.raInitials = ra; DB.save(); }
  APP.collectorCode = code;
  APP.raInitials    = ra;
  renderCollectorPanel();
}

function renderCollectorPanel() {
  const code = APP.collectorCode;
  const p    = APP.participants[code];
  if (!p) return;

  const prog1 = s1Progress(p);
  const prog2 = s2Progress(p);
  const sm    = STATUS_META[p.status] || STATUS_META.new;

  document.getElementById('c-panel').innerHTML = `
  <div style="animation:slideRight 0.22s ease">

    <!-- Participant header -->
    <div class="card mb16">
      <div class="flex-wrap gap12" style="justify-content:space-between">
        <div class="flex-wrap gap12">
          <span class="mono" style="font-size:22px;font-weight:600;color:var(--teal-dk)">${p.code}</span>
          <span style="font-size:17px;font-weight:500">${escHtml(p.firstName)} ${escHtml(p.lastName)}</span>
          <span class="badge ${p.group==='Review'?'badge-review':'badge-noreview'}">${p.group}</span>
          <span class="badge ${sm.badge}">${sm.label}</span>
        </div>
        <div class="flex gap8">
          <button class="btn btn-ghost btn-sm" onclick="exportParticipantCSV(APP.participants['${code}'])">↓ CSV</button>
          <button class="btn btn-ghost btn-sm" onclick="showEditSchedule('${code}')">📅 Schedule</button>
        </div>
      </div>
    </div>

    <!-- Session tabs -->
    <div class="g2 mb4">
      <button class="session-card" style="cursor:pointer;border:2px solid var(--teal);text-align:left;background:var(--surface)"
        onclick="collectorShowSession(1)">
        <div class="session-card-header" style="border-bottom:1px solid var(--line)">
          <div>
            <div class="session-num">Session 1 — Day 1</div>
            <div class="session-title">Exam &amp; Surveys</div>
          </div>
          <span class="badge ${prog1.pct===100?'badge-green':'badge-teal'}">${prog1.pct}%</span>
        </div>
        <div style="padding:14px 20px">
          <div class="progress-bar mb8"><div class="progress-fill" style="width:${prog1.pct}%"></div></div>
          <div class="flex gap8">
            <span class="text-sm text-muted">${prog1.done}/${prog1.total} steps</span>
            ${p.s1Date?`<span class="text-sm mono">${p.s1Date}</span>`:'<span class="text-sm text-muted">Date not set</span>'}
          </div>
        </div>
      </button>

      <button class="session-card" style="cursor:pointer;border:2px solid var(--green);text-align:left;background:var(--surface)"
        onclick="collectorShowSession(2)">
        <div class="session-card-header" style="border-bottom:1px solid var(--line)">
          <div>
            <div class="session-num" style="color:var(--green)">Session 2 — Day 2</div>
            <div class="session-title">Exam &amp; Surveys</div>
          </div>
          <span class="badge ${prog2.pct===100?'badge-green':'badge-teal'}">${prog2.pct}%</span>
        </div>
        <div style="padding:14px 20px">
          <div class="progress-bar mb8"><div class="progress-fill s2" style="width:${prog2.pct}%"></div></div>
          <div class="flex gap8">
            <span class="text-sm text-muted">${prog2.done}/${prog2.total} steps</span>
            ${p.s2Date?`<span class="text-sm mono">${p.s2Date}</span>`:'<span class="text-sm text-muted">Date not set</span>'}
          </div>
        </div>
      </button>
    </div>

    <div id="c-session-panel"></div>
  </div>`;
}

function collectorShowSession(session) {
  const p     = APP.participants[APP.collectorCode];
  if (!p) return;
  const steps = session === 1 ? SESSION1 : s2Steps(p);
  const bucket = session === 1 ? p.s1 : p.s2;
  const el    = document.getElementById('c-session-panel');

  el.innerHTML = `
  <div class="session-card" style="margin-top:16px;animation:fadeUp 0.2s ease">
    <div class="session-card-header">
      <div class="session-title">Session ${session} Checklist</div>
      <div class="flex gap8">
        <input class="input" style="width:145px" type="date" value="${session===1?p.s1Date:p.s2Date}"
          onchange="updateDate(${session},this.value)" placeholder="Session date"/>
        <input class="input" style="width:105px" type="time" value="${session===1?p.s1Time:p.s2Time}"
          onchange="updateTime(${session},this.value)"/>
      </div>
    </div>

    ${session===1 && p.group==='No Review'
      ? `<div class="alert alert-info" style="margin:0 20px 4px">ℹ No Review group — review step auto-skipped in Session 2.</div>`
      : ''}

    <div class="session-card-body">
      <div class="step-list">
        ${steps.map((s, idx) => buildCollectorStep(p, s, idx, session, bucket)).join('')}
      </div>

      <div class="divider"></div>

      <div class="g2">
        <div class="field">
          <label class="lbl">HRV Device ID</label>
          <input class="input" placeholder="Polar H10 ID"
            value="${session===1?p.hrv1:p.hrv2}"
            onchange="updateHRV(${session},this.value)"/>
        </div>
        <div class="field">
          <label class="lbl">RA Initials</label>
          <input class="input" placeholder="AJ" maxlength="4" value="${p.raInitials||''}"
            onchange="updateRA(this.value)"/>
        </div>
      </div>
      <div class="field">
        <label class="lbl">Session Notes</label>
        <textarea class="textarea" placeholder="Issues, observations, anything notable…"
          onchange="updateNotes(this.value)">${escHtml(p.notes||'')}</textarea>
      </div>
    </div>
  </div>`;
}

function buildCollectorStep(p, s, idx, session, bucket) {
  const rec    = bucket[s.id];
  const done   = !!rec?.done;
  const cls    = done ? 's-done' : 's-active';

  let typePill = '';
  if (s.type === 'survey')    typePill = `<span class="type-pill type-survey">Participant Survey</span>`;
  if (s.type === 'ra')        typePill = `<span class="type-pill type-ra">RA Action</span>`;
  if (s.type === 'timestamp') typePill = `<span class="type-pill type-ts">Timestamp</span>`;
  if (s.reviewOnly)           typePill += ` <span class="type-pill type-review">Review Only</span>`;

  let noteId    = `note_${s.id}`;
  let actionHtml = '';

  if (!done) {
    if (s.type === 'survey') {
      actionHtml = `
        <div class="step-actions">
          <a href="${SURVEYS[s.key].url}?participant=${p.code}" target="_blank" class="btn btn-outline btn-sm">Open Survey ↗</a>
          <button class="btn btn-green btn-sm" onclick="raComplete(${session},'${s.id}',false)">✓ Survey Submitted</button>
          <input class="input" id="${noteId}" placeholder="Note (optional)" style="flex:1;min-width:120px;max-width:220px"/>
        </div>`;
    } else if (s.type === 'ra') {
      actionHtml = `
        <div class="step-actions">
          <button class="btn btn-green btn-sm" onclick="raComplete(${session},'${s.id}',false)">✓ Done</button>
          <input class="input" id="${noteId}" placeholder="Note (optional)" style="flex:1;min-width:120px;max-width:220px"/>
        </div>`;
    } else if (s.type === 'timestamp') {
      actionHtml = `
        <div class="step-actions">
          <button class="btn btn-amber btn-sm" onclick="raTimestamp(${session},'${s.id}')">⏱ Record Now</button>
          <input class="input" id="${noteId}" placeholder="Note (optional)" style="flex:1;min-width:120px;max-width:220px"/>
        </div>`;
    }
  } else {
    actionHtml = `
      <div class="step-actions">
        <button class="btn btn-ghost btn-xs" onclick="raUndo(${session},'${s.id}')">↩ Undo</button>
        ${rec.note ? `<span class="text-xs text-muted">"${escHtml(rec.note)}"</span>` : ''}
      </div>`;
  }

  return `
  <div class="step-row ${cls}">
    <div class="step-index ${done?'done':'active'}">${done?'':idx+1}</div>
    <div class="step-body">
      <div class="step-name ${done?'done':''}">${s.label}</div>
      <div class="step-desc">
        <span>${s.desc}</span>
        ${typePill}
        ${rec?.ts ? `<span class="step-ts">✓ ${fmtTs(rec.ts)}</span>` : ''}
      </div>
      ${actionHtml}
    </div>
  </div>`;
}

// Collector actions
function raComplete(session, stepId, _isTS) {
  const p = APP.participants[APP.collectorCode]; if (!p) return;
  const note = getNote(stepId);
  markStep(p, session, stepId, note);
  renderCollectorPanel();
  collectorShowSession(session);
}

function raTimestamp(session, stepId) {
  const p = APP.participants[APP.collectorCode]; if (!p) return;
  const note = getNote(stepId);
  markStep(p, session, stepId, note, new Date().toISOString());
  renderCollectorPanel();
  collectorShowSession(session);
}

function raUndo(session, stepId) {
  const p = APP.participants[APP.collectorCode]; if (!p) return;
  unmarkStep(p, session, stepId);
  renderCollectorPanel();
  collectorShowSession(session);
}

function getNote(stepId) {
  const el = document.getElementById('note_'+stepId);
  return el ? el.value.trim() : '';
}

function updateDate(s, v)  { const p=cP(); if(p){ s===1?p.s1Date=v:p.s2Date=v; DB.save(); } }
function updateTime(s, v)  { const p=cP(); if(p){ s===1?p.s1Time=v:p.s2Time=v; DB.save(); recalcStatus(p); } }
function updateHRV(s, v)   { const p=cP(); if(p){ s===1?p.hrv1=v:p.hrv2=v;   DB.save(); } }
function updateRA(v)        { const p=cP(); if(p){ p.raInitials=v;              DB.save(); } }
function updateNotes(v)    { const p=cP(); if(p){ p.notes=v;                   DB.save(); } }
function cP()              { return APP.participants[APP.collectorCode]; }

function showEditSchedule(code) {
  const p = APP.participants[code];
  if (!p) return;
  showModal(`
    <div class="modal-title">📅 Schedule — ${code}</div>
    <div class="g2">
      <div class="field"><label class="lbl">Session 1 Date</label>
        <input class="input" type="date" id="sch-s1d" value="${p.s1Date}"/></div>
      <div class="field"><label class="lbl">Session 1 Time</label>
        <input class="input" type="time" id="sch-s1t" value="${p.s1Time}"/></div>
    </div>
    <div class="g2">
      <div class="field"><label class="lbl">Session 2 Date</label>
        <input class="input" type="date" id="sch-s2d" value="${p.s2Date}"/></div>
      <div class="field"><label class="lbl">Session 2 Time</label>
        <input class="input" type="time" id="sch-s2t" value="${p.s2Time}"/></div>
    </div>
    <div class="flex gap8" style="justify-content:flex-end;margin-top:8px">
      <button class="btn btn-ghost" onclick="closeModal()">Cancel</button>
      <button class="btn btn-primary" onclick="saveSchedule('${code}')">Save Schedule</button>
    </div>
  `);
}

function saveSchedule(code) {
  const p = APP.participants[code]; if (!p) return;
  p.s1Date = document.getElementById('sch-s1d').value;
  p.s1Time = document.getElementById('sch-s1t').value;
  p.s2Date = document.getElementById('sch-s2d').value;
  p.s2Time = document.getElementById('sch-s2t').value;
  if ((p.status === 'new') && p.s1Date) p.status = 'scheduled';
  DB.save();
  closeModal();
  renderCollectorPanel();
}

// ═══════════════════════════════════════════════════════════════════════════
// VIEW: ADMIN
// ═══════════════════════════════════════════════════════════════════════════

function renderAdmin() {
  if (!APP.adminAuthed) {
    setPage(`
      <div style="max-width:380px;margin:80px auto">
        <div class="card">
          <div class="card-label">Admin Access</div>
          <div class="page-title" style="font-size:22px;margin-bottom:18px">Dashboard Login</div>
          <div class="field">
            <label class="lbl">Password</label>
            <input class="input" type="password" id="admin-pw" placeholder="••••••••"/>
          </div>
          <button class="btn btn-primary btn-full" onclick="adminLogin()">Sign In →</button>
        </div>
      </div>
    `);
    document.getElementById('admin-pw').addEventListener('keydown', e => {
      if (e.key === 'Enter') adminLogin();
    });
    return;
  }
  renderAdminDashboard();
}

function adminLogin() {
  const pw = document.getElementById('admin-pw').value;
  if (pw === ADMIN_PASSWORD) {
    APP.adminAuthed = true;
    renderAdminDashboard();
  } else {
    document.getElementById('admin-pw').style.borderColor = 'var(--red)';
    setTimeout(() => { document.getElementById('admin-pw').style.borderColor = ''; }, 1500);
  }
}

function renderAdminDashboard() {
  const ps      = Object.values(APP.participants);
  const total   = ps.length;
  const s1done  = ps.filter(p => ['session1_done','session2_live','complete'].includes(p.status)).length;
  const s2done  = ps.filter(p => ['session2_live','complete'].includes(p.status)).length;
  const complete = ps.filter(p => p.status === 'complete').length;
  const review   = ps.filter(p => p.group === 'Review').length;
  const noReview = ps.filter(p => p.group === 'No Review').length;

  const balPct  = total ? Math.round(review / total * 100) : 50;

  setPage(`
    <div class="section-head mb20">
      <div>
        <div class="card-label">Admin Dashboard</div>
        <div class="page-title">Study Overview</div>
        <div class="page-sub">All participants · group balance · progress tracking</div>
      </div>
      <div class="flex gap8">
        <button class="btn btn-ghost btn-sm" onclick="adminImport()">↑ Import JSON</button>
        <button class="btn btn-ghost btn-sm" onclick="DB.export()">↓ Export All</button>
        <button class="btn btn-outline btn-sm" onclick="showAddParticipantModal()">+ Add Participant</button>
        <button class="btn btn-ghost btn-sm" onclick="adminLogout()">Log Out</button>
      </div>
    </div>

    <!-- Stats row -->
    <div class="g4 mb20">
      <div class="stat-tile teal">
        <div class="stat-num teal">${total}</div>
        <div class="stat-lbl">Enrolled</div>
      </div>
      <div class="stat-tile amber">
        <div class="stat-num amber">${s1done}</div>
        <div class="stat-lbl">S1 Done</div>
      </div>
      <div class="stat-tile blue">
        <div class="stat-num blue">${s2done}</div>
        <div class="stat-lbl">S2 Started</div>
      </div>
      <div class="stat-tile green">
        <div class="stat-num green">${complete}</div>
        <div class="stat-lbl">Complete</div>
      </div>
    </div>

    <!-- Group balance -->
    <div class="card mb20">
      <div class="card-header">
        <div>
          <div class="card-label">Group Balance</div>
          <div class="card-title">Review vs No Review</div>
        </div>
        <div class="flex gap12">
          <span><span class="badge badge-review">${review} Review</span></span>
          <span><span class="badge badge-noreview">${noReview} No Review</span></span>
        </div>
      </div>
      <div class="group-bar">
        <div class="group-seg" style="flex:${review||0.5};background:var(--teal);min-width:${review?0:4}px"></div>
        <div class="group-seg" style="flex:${noReview||0.5};background:var(--ink4);min-width:${noReview?0:4}px"></div>
      </div>
      <div class="flex gap8" style="margin-top:8px">
        <span class="text-xs text-muted">Review: ${balPct}%</span>
        <span class="text-xs text-muted">No Review: ${100-balPct}%</span>
        ${Math.abs(review - noReview) > 2
          ? `<span class="badge badge-amber">⚠ Imbalanced by ${Math.abs(review-noReview)}</span>`
          : `<span class="badge badge-green">✓ Balanced</span>`}
      </div>
    </div>

    <!-- Table -->
    <div class="card">
      <div class="card-header">
        <div class="card-title">All Participants</div>
        <input class="input" id="admin-search" placeholder="Search name, code, group…" style="max-width:220px"
          oninput="adminFilter(this.value)"/>
      </div>
      ${total === 0
        ? `<div class="empty-state"><div class="empty-icon">◎</div><p class="empty-text">No participants yet.<br>Click "+ Add Participant" to enrol the first one.</p></div>`
        : `<div class="table-wrap">
          <table id="admin-table">
            <thead><tr>
              <th>Code</th><th>Name</th><th>Group</th><th>Status</th>
              <th>S1 Progress</th><th>S2 Progress</th><th>Session 1</th><th>Session 2</th><th>RA</th><th>Actions</th>
            </tr></thead>
            <tbody>
              ${ps.sort((a,b)=>a.code.localeCompare(b.code)).map(p => buildAdminRow(p)).join('')}
            </tbody>
          </table>
        </div>`}
    </div>
  `);
}

function buildAdminRow(p) {
  const sm   = STATUS_META[p.status] || STATUS_META.new;
  const p1   = s1Progress(p);
  const p2   = s2Progress(p);
  return `
  <tr id="arow-${p.code}">
    <td>${p.code}</td>
    <td style="color:var(--ink);font-weight:500">${escHtml(p.firstName)} ${escHtml(p.lastName)}</td>
    <td><span class="badge ${p.group==='Review'?'badge-review':'badge-noreview'}">${p.group}</span></td>
    <td><span class="badge ${sm.badge}">${sm.label}</span></td>
    <td style="min-width:100px">
      <div style="display:flex;align-items:center;gap:7px">
        <div style="flex:1;height:5px;background:var(--surface3);border-radius:3px;overflow:hidden">
          <div style="height:100%;width:${p1.pct}%;background:linear-gradient(90deg,var(--teal),var(--green));border-radius:3px"></div>
        </div>
        <span class="mono text-xs">${p1.pct}%</span>
      </div>
    </td>
    <td style="min-width:100px">
      <div style="display:flex;align-items:center;gap:7px">
        <div style="flex:1;height:5px;background:var(--surface3);border-radius:3px;overflow:hidden">
          <div style="height:100%;width:${p2.pct}%;background:linear-gradient(90deg,var(--green),var(--teal));border-radius:3px"></div>
        </div>
        <span class="mono text-xs">${p2.pct}%</span>
      </div>
    </td>
    <td class="mono text-xs">${p.s1Date||'—'}</td>
    <td class="mono text-xs">${p.s2Date||'—'}</td>
    <td class="mono text-xs">${p.raInitials||'—'}</td>
    <td>
      <div class="flex gap4">
        <button class="btn btn-ghost btn-xs" onclick="showEditModal('${p.code}')">Edit</button>
        <button class="btn btn-ghost btn-xs" onclick="exportParticipantCSV(APP.participants['${p.code}'])">↓</button>
        <button class="btn btn-danger btn-xs" onclick="adminDrop('${p.code}')">Drop</button>
      </div>
    </td>
  </tr>`;
}

function adminFilter(q) {
  const rows = document.querySelectorAll('#admin-table tbody tr');
  const lq = q.toLowerCase();
  rows.forEach(r => { r.style.display = r.textContent.toLowerCase().includes(lq) ? '' : 'none'; });
}

function adminLogout() { APP.adminAuthed = false; renderAdmin(); }

function adminImport() {
  const input = document.createElement('input');
  input.type = 'file'; input.accept = '.json';
  input.onchange = e => {
    const f = e.target.files[0]; if (!f) return;
    const reader = new FileReader();
    reader.onload = ev => {
      const ok = DB.import(ev.target.result);
      if (ok) { renderAdminDashboard(); } else { alert('Invalid JSON file.'); }
    };
    reader.readAsText(f);
  };
  input.click();
}

function showAddParticipantModal() {
  showModal(`
    <div class="modal-title">+ Add New Participant</div>
    <div class="g2">
      <div class="field"><label class="lbl">First Name*</label><input class="input" id="m-first" placeholder="Jane"/></div>
      <div class="field"><label class="lbl">Last Name*</label><input class="input" id="m-last" placeholder="Smith"/></div>
    </div>
    <div class="field"><label class="lbl">Email*</label><input class="input" id="m-email" placeholder="jane@purdue.edu" type="email"/></div>
    <div class="field"><label class="lbl">Phone</label><input class="input" id="m-phone" placeholder="(765) 000-0000" type="tel"/></div>
    <div class="field">
      <label class="lbl">Review Group</label>
      <select class="select" id="m-group">
        <option value="">Auto-assign (balanced)</option>
        <option>Review</option>
        <option>No Review</option>
      </select>
    </div>
    <div class="field"><label class="lbl">RA Initials</label><input class="input" id="m-ra" placeholder="AJ" maxlength="4"/></div>
    <div class="divider"></div>
    <div class="flex gap8" style="justify-content:flex-end">
      <button class="btn btn-ghost" onclick="closeModal()">Cancel</button>
      <button class="btn btn-primary" onclick="adminAddParticipant()">Create →</button>
    </div>
  `);
}

function adminAddParticipant() {
  const first = document.getElementById('m-first').value.trim();
  const last  = document.getElementById('m-last').value.trim();
  const email = document.getElementById('m-email').value.trim();
  const phone = document.getElementById('m-phone').value.trim();
  const group = document.getElementById('m-group').value;
  const ra    = document.getElementById('m-ra').value.trim();
  if (!first || !last || !email) { alert('First name, last name, and email are required.'); return; }
  const p = createParticipant({ firstName:first, lastName:last, email, phone, group, ra });
  closeModal();
  renderAdminDashboard();
  // flash new code
  setTimeout(() => {
    const row = document.getElementById('arow-'+p.code);
    if (row) { row.style.background='var(--teal-lt)'; setTimeout(()=>row.style.background='',1500); }
  }, 100);
}

function showEditModal(code) {
  const p = APP.participants[code]; if (!p) return;
  showModal(`
    <div class="modal-title">Edit — ${code}</div>
    <div class="g2">
      <div class="field"><label class="lbl">First Name</label><input class="input" id="e-first" value="${escHtml(p.firstName)}"/></div>
      <div class="field"><label class="lbl">Last Name</label><input class="input" id="e-last" value="${escHtml(p.lastName)}"/></div>
    </div>
    <div class="field"><label class="lbl">Email</label><input class="input" id="e-email" value="${escHtml(p.email)}" type="email"/></div>
    <div class="field"><label class="lbl">Phone</label><input class="input" id="e-phone" value="${escHtml(p.phone||'')}"/></div>
    <div class="g2">
      <div class="field">
        <label class="lbl">Group</label>
        <select class="select" id="e-group">
          ${REVIEW_GROUPS.map(g=>`<option ${g===p.group?'selected':''}>${g}</option>`).join('')}
        </select>
      </div>
      <div class="field">
        <label class="lbl">Status</label>
        <select class="select" id="e-status">
          ${Object.keys(STATUS_META).map(s=>`<option value="${s}" ${s===p.status?'selected':''}>${STATUS_META[s].label}</option>`).join('')}
        </select>
      </div>
    </div>
    <div class="g2">
      <div class="field"><label class="lbl">S1 Date</label><input class="input" type="date" id="e-s1d" value="${p.s1Date}"/></div>
      <div class="field"><label class="lbl">S1 Time</label><input class="input" type="time" id="e-s1t" value="${p.s1Time}"/></div>
    </div>
    <div class="g2">
      <div class="field"><label class="lbl">S2 Date</label><input class="input" type="date" id="e-s2d" value="${p.s2Date}"/></div>
      <div class="field"><label class="lbl">S2 Time</label><input class="input" type="time" id="e-s2t" value="${p.s2Time}"/></div>
    </div>
    <div class="field"><label class="lbl">RA Initials</label><input class="input" id="e-ra" value="${escHtml(p.raInitials||'')}" maxlength="4"/></div>
    <div class="field"><label class="lbl">Notes</label><textarea class="textarea" id="e-notes">${escHtml(p.notes||'')}</textarea></div>
    <div class="flex gap8" style="justify-content:flex-end;margin-top:8px">
      <button class="btn btn-ghost" onclick="closeModal()">Cancel</button>
      <button class="btn btn-primary" onclick="adminSaveEdit('${code}')">Save Changes</button>
    </div>
  `);
}

function adminSaveEdit(code) {
  const p = APP.participants[code]; if (!p) return;
  p.firstName  = document.getElementById('e-first').value.trim();
  p.lastName   = document.getElementById('e-last').value.trim();
  p.email      = document.getElementById('e-email').value.trim();
  p.phone      = document.getElementById('e-phone').value.trim();
  p.group      = document.getElementById('e-group').value;
  p.status     = document.getElementById('e-status').value;
  p.s1Date     = document.getElementById('e-s1d').value;
  p.s1Time     = document.getElementById('e-s1t').value;
  p.s2Date     = document.getElementById('e-s2d').value;
  p.s2Time     = document.getElementById('e-s2t').value;
  p.raInitials = document.getElementById('e-ra').value.trim();
  p.notes      = document.getElementById('e-notes').value.trim();
  DB.save();
  closeModal();
  renderAdminDashboard();
}

function adminDrop(code) {
  if (!confirm(`Mark ${code} as Dropped? You can undo this in Edit.`)) return;
  APP.participants[code].status = 'dropped';
  DB.save();
  renderAdminDashboard();
}

// ─── PARTICIPANT REGISTRATION (from participant view) ────────────────────────

function showRegModal() {
  showModal(`
    <div class="modal-title">Register to Participate</div>
    <div class="alert alert-info mb16">
      Your Participant ID (CF###) is generated automatically and will appear after submitting.
    </div>
    <div class="g2">
      <div class="field"><label class="lbl">First Name*</label><input class="input" id="r-first" placeholder="Jane"/></div>
      <div class="field"><label class="lbl">Last Name*</label><input class="input" id="r-last" placeholder="Smith"/></div>
    </div>
    <div class="field"><label class="lbl">Email*</label><input class="input" id="r-email" placeholder="you@purdue.edu" type="email"/></div>
    <div class="field"><label class="lbl">Phone (optional)</label><input class="input" id="r-phone" placeholder="(765) 000-0000" type="tel"/></div>
    <div class="alert alert-warn">⚠ Registration must be confirmed with your RA before your first session.</div>
    <div class="flex gap8" style="justify-content:flex-end;margin-top:14px">
      <button class="btn btn-ghost" onclick="closeModal()">Cancel</button>
      <button class="btn btn-primary" onclick="submitReg()">Submit Registration →</button>
    </div>
  `);
}

function submitReg() {
  const first = document.getElementById('r-first').value.trim();
  const last  = document.getElementById('r-last').value.trim();
  const email = document.getElementById('r-email').value.trim();
  const phone = document.getElementById('r-phone').value.trim();
  if (!first || !last || !email) { alert('Please fill in all required fields.'); return; }
  const p = createParticipant({ firstName:first, lastName:last, email, phone });
  closeModal();
  // Show success and auto-fill
  showModal(`
    <div class="modal-title" style="color:var(--green)">✓ Registration Submitted</div>
    <div style="text-align:center;padding:10px 0 20px">
      <div style="font-family:var(--font-display);font-size:48px;font-weight:800;color:var(--teal);letter-spacing:3px;margin-bottom:8px">${p.code}</div>
      <div style="font-size:16px;font-weight:500;margin-bottom:6px">${escHtml(first)} ${escHtml(last)}</div>
      <div class="text-muted text-sm">Save this ID — you will need it to access your sessions.</div>
    </div>
    <div class="alert alert-warn mb16">Please confirm your participation with your RA before Session 1.</div>
    <button class="btn btn-primary btn-full" onclick="closeModal();document.getElementById('p-code').value='${p.code}';pLookup()">
      Access My Portal →
    </button>
  `);
}

// ─── EXPORT HELPERS ──────────────────────────────────────────────────────────

function exportParticipantCSV(p) {
  if (!p) return;
  const rows = [
    ['CF Study — Participant Report'],
    ['Generated', new Date().toLocaleString()],
    [],
    ['Code', p.code],
    ['Name', `${p.firstName} ${p.lastName}`],
    ['Email', p.email],
    ['Phone', p.phone||''],
    ['Group', p.group],
    ['Status', p.status],
    ['Registered', fmtTs(p.registeredAt)],
    ['RA', p.raInitials||''],
    [],
    ['── SESSION 1 ──'],
    ['Date', p.s1Date||''],
    ['Time', p.s1Time||''],
    ['HRV Device', p.hrv1||''],
    ['Step ID','Step Name','Done','Timestamp','Note'],
    ...SESSION1.map(s => [s.id, s.label, p.s1[s.id]?.done?'Yes':'No', p.s1[s.id]?.ts?fmtTs(p.s1[s.id].ts):'', p.s1[s.id]?.note||'']),
    [],
    ['── SESSION 2 ──'],
    ['Date', p.s2Date||''],
    ['Time', p.s2Time||''],
    ['HRV Device', p.hrv2||''],
    ['Step ID','Step Name','Done','Timestamp','Note'],
    ...s2Steps(p).map(s => [s.id, s.label, p.s2[s.id]?.done?'Yes':'No', p.s2[s.id]?.ts?fmtTs(p.s2[s.id].ts):'', p.s2[s.id]?.note||'']),
    [],
    ['Notes', p.notes||''],
  ];
  const csv = rows.map(r => r.map(c => `"${String(c).replace(/"/g,'""')}"`).join(',')).join('\n');
  triggerDownload(`CF_${p.code}_${dateTag()}.csv`, csv, 'text/csv');
}

// ─── MODAL HELPERS ────────────────────────────────────────────────────────────

function showModal(html) {
  const layer = document.getElementById('modal-layer');
  layer.innerHTML = `
    <div class="modal-bg" onclick="handleModalBgClick(event)">
      <div class="modal">${html}</div>
    </div>`;
}

function closeModal() {
  const layer = document.getElementById('modal-layer');
  if (layer) layer.innerHTML = '';
}

function handleModalBgClick(e) {
  if (e.target.classList.contains('modal-bg')) closeModal();
}

// ─── UTILITIES ────────────────────────────────────────────────────────────────

function fmtTs(iso) {
  if (!iso) return '';
  try {
    const d = new Date(iso);
    return d.toLocaleDateString('en-US', { month:'short', day:'numeric' })
      + ' ' + d.toLocaleTimeString('en-US', { hour:'2-digit', minute:'2-digit' });
  } catch(e) { return iso; }
}

function dateTag() {
  return new Date().toISOString().slice(0,10).replace(/-/g,'');
}

function escHtml(s) {
  return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function triggerDownload(filename, content, mimeType) {
  const a    = document.createElement('a');
  const blob = new Blob([content], { type: mimeType });
  a.href     = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  URL.revokeObjectURL(a.href);
}
