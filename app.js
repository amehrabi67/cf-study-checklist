/* ═══════════════════════════════════════════════════════════════════════
   CF STUDY CHECKLIST v2 — app.js
   Real-time shared backend via Google Apps Script + Google Sheets.
   All devices read/write the same data. No duplicate codes.
   ═══════════════════════════════════════════════════════════════════════ */

'use strict';

// ─── CONFIG — paste your Apps Script Web App URL here after deploying ────────
const API_URL = 'https://script.google.com/macros/s/AKfycbzlVN9xDVGtWULyQG1dGQkHCwINwaBngAxBVbI_6s9q0K2QKJ97s5oXUoRRV7HKmdxdvg/exec';   // ← replace this
const ADMIN_PASSWORD = 'CFstudy2025';               // ← change this

// ─── STUDY STEP DEFINITIONS ──────────────────────────────────────────────────
const SURVEYS = {
  sleep:   { label:'Sleep Quality Survey',  url:'https://purdue.ca1.qualtrics.com/jfe/form/SV_80buUCCnp3ssuEu' },
  anxiety: { label:'Test Anxiety Survey',   url:'https://purdue.ca1.qualtrics.com/jfe/form/SV_bkGoyGnyAYnrbtY' },
  fatigue: { label:'Fatigue Survey',        url:'https://purdue.ca1.qualtrics.com/jfe/form/SV_eD4CwmMjOpMLm3c' },
  review:  { label:'Review Text Check',     url:'https://purdue.ca1.qualtrics.com/jfe/form/SV_8k5vYg8glY43VIi' },
};

const SESSION1 = [
  { id:'S1-01a', label:'Sleep Quality Survey',          type:'survey', key:'sleep',   phase:'pre',  desc:'Before Exam 1',              who:'participant' },
  { id:'S1-01b', label:'Test Anxiety Survey',           type:'survey', key:'anxiety', phase:'pre',  desc:'Before Exam 1',              who:'participant' },
  { id:'S1-01c', label:'Fatigue Survey (Pre-Exam)',     type:'survey', key:'fatigue', phase:'pre',  desc:'Before Exam 1',              who:'participant' },
  { id:'S1-02',  label:'Polar H10 Fitted & Verified',  type:'ra',                    desc:'RA — check HRV sensor signal', who:'ra' },
  { id:'S1-03',  label:'Resting HRV Baseline (5 min)', type:'ra',                    desc:'RA — record before Exam 1',    who:'ra' },
  { id:'S1-04',  label:'Exam 1 — Start Time',          type:'timestamp',             desc:'RA — mark exact start time',   who:'ra' },
  { id:'S1-05',  label:'Exam 1 — End Time',            type:'timestamp',             desc:'RA — mark exact end time',     who:'ra' },
  { id:'S1-06a', label:'Sleep Quality Survey (Post)',  type:'survey', key:'sleep',   phase:'post', desc:'After Exam 1',               who:'participant' },
  { id:'S1-06b', label:'Test Anxiety Survey (Post)',   type:'survey', key:'anxiety', phase:'post', desc:'After Exam 1',               who:'participant' },
  { id:'S1-06c', label:'Fatigue Survey (Post-Exam)',   type:'survey', key:'fatigue', phase:'post', desc:'After Exam 1',               who:'participant' },
  { id:'S1-07',  label:'Review Materials Delivered',  type:'ra',                    desc:'RA — explain task + hand out', who:'ra' },
];

const SESSION2_ALL = [
  { id:'S2-01',  label:'Review Text Check',            type:'survey', key:'review',  phase:'pre',  desc:'Review group only — confirm text read', who:'participant', reviewOnly:true },
  { id:'S2-02a', label:'Sleep Quality Survey',         type:'survey', key:'sleep',   phase:'pre',  desc:'Before Exam 2',              who:'participant' },
  { id:'S2-02b', label:'Test Anxiety Survey',          type:'survey', key:'anxiety', phase:'pre',  desc:'Before Exam 2',              who:'participant' },
  { id:'S2-02c', label:'Fatigue Survey (Pre-Exam)',    type:'survey', key:'fatigue', phase:'pre',  desc:'Before Exam 2',              who:'participant' },
  { id:'S2-03',  label:'Resting HRV Baseline (5 min)',type:'ra',                    desc:'RA — record before Exam 2',    who:'ra' },
  { id:'S2-04',  label:'Exam 2 — Start Time',         type:'timestamp',             desc:'RA — mark exact start time',   who:'ra' },
  { id:'S2-05',  label:'Exam 2 — End Time',           type:'timestamp',             desc:'RA — mark exact end time',     who:'ra' },
  { id:'S2-06',  label:'Fatigue Survey (Post-Exam)',  type:'survey', key:'fatigue', phase:'post', desc:'After Exam 2',               who:'participant' },
  { id:'S2-07',  label:'Compensation Recorded',       type:'ra',                    desc:'RA — bonus + final payment',   who:'ra' },
];

const REVIEW_GROUPS = ['Review', 'No Review'];

const STATUS_META = {
  new:           { label:'Registered',      badge:'badge-teal'  },
  scheduled:     { label:'Scheduled',       badge:'badge-amber' },
  session1_live: { label:'Session 1 Live',  badge:'badge-blue'  },
  session1_done: { label:'Session 1 Done',  badge:'badge-amber' },
  session2_live: { label:'Session 2 Live',  badge:'badge-blue'  },
  complete:      { label:'Complete',        badge:'badge-green' },
  dropped:       { label:'Dropped',         badge:'badge-red'   },
};

// ─── APP STATE ────────────────────────────────────────────────────────────────
const APP = {
  adminAuthed:   false,
  collectorCode: null,
  // Local cache — populated from API, used for rendering
  cache:         {},   // code → participant
  syncState:     'ok', // 'ok' | 'syncing' | 'error'
};

// ─── API LAYER ────────────────────────────────────────────────────────────────
async function apiGet(params) {
  const qs = new URLSearchParams(params).toString();
  const res = await fetch(`${API_URL}?${qs}`, { method:'GET' });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

async function apiPost(body) {
  const res = await fetch(API_URL, {
    method: 'POST',
    headers: { 'Content-Type':'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

// Wrapper that shows sync state in topbar
async function api(method, payload) {
  setSyncState('syncing');
  try {
    const result = method === 'GET' ? await apiGet(payload) : await apiPost(payload);
    if (result.error) throw new Error(result.error);
    setSyncState('ok');
    return result;
  } catch(e) {
    setSyncState('error');
    throw e;
  }
}

function setSyncState(s) {
  APP.syncState = s;
  const el = document.getElementById('sync-pill');
  if (!el) return;
  el.className = `sync-pill ${s}`;
  el.innerHTML = s === 'syncing' ? '<span class="spinner" style="width:11px;height:11px;border-width:1.5px"></span> Syncing…'
               : s === 'error'   ? '⚠ Offline'
               :                   '✓ Synced';
}

// ─── STEP HELPERS ─────────────────────────────────────────────────────────────
function s2Steps(p) {
  return SESSION2_ALL.filter(s => !s.reviewOnly || p.group === 'Review');
}

function s1Progress(p) {
  const done = SESSION1.filter(s => p.s1?.[s.id]?.done).length;
  return { done, total: SESSION1.length, pct: Math.round(done / SESSION1.length * 100) };
}

function s2Progress(p) {
  const steps = s2Steps(p);
  const done  = steps.filter(s => p.s2?.[s.id]?.done).length;
  return { done, total: steps.length, pct: steps.length ? Math.round(done / steps.length * 100) : 0 };
}

function nextS1Step(p) { return SESSION1.find(s => !p.s1?.[s.id]?.done) || null; }
function nextS2Step(p) { return s2Steps(p).find(s => !p.s2?.[s.id]?.done) || null; }

function tlPhase(p) {
  switch(p.status) {
    case 'new': case 'scheduled': return 0;
    case 'session1_live':         return 1;
    case 'session1_done':         return 2;
    case 'session2_live':         return 3;
    case 'complete':              return 4;
    default: return 0;
  }
}

// ─── ROUTING ──────────────────────────────────────────────────────────────────
function getRoute() {
  const h = location.hash.replace('#','');
  return ['participant','collector','admin'].includes(h) ? h : 'participant';
}

window.addEventListener('hashchange', () => renderShell());
window.addEventListener('DOMContentLoaded', () => renderShell());

function navigate(v) { location.hash = v; }

function renderShell() {
  const route = getRoute();
  document.getElementById('root').innerHTML = buildShell(route);
  switch(route) {
    case 'participant': mountParticipant(); break;
    case 'collector':   mountCollector();   break;
    case 'admin':       mountAdmin();       break;
  }
}

// ─── SHELL ────────────────────────────────────────────────────────────────────
function buildShell(active) {
  const tabs = [
    { id:'participant', icon:'○', label:'Participant'    },
    { id:'collector',   icon:'◈', label:'Data Collector' },
    { id:'admin',       icon:'◆', label:'Admin'          },
  ];
  return `
  <header class="topbar">
    <a class="logo" href="#participant">
      <div class="logo-chip">CF</div>
      <div>
        <div class="logo-name">Study Checklist</div>
        <div class="logo-sub">Purdue · CF Study</div>
      </div>
    </a>
    <nav class="nav">
      ${tabs.map(t => `
        <button class="nav-btn${t.id===active?' active':''}" onclick="navigate('${t.id}')">
          <span>${t.icon}</span><span class="nav-lbl">${t.label}</span>
        </button>`).join('')}
    </nav>
    <div class="topbar-right">
      <button id="sync-pill" class="sync-pill ok" onclick="manualSync()">✓ Synced</button>
      <div class="live-pill"><div class="live-dot"></div>Live</div>
    </div>
  </header>
  <div id="page" class="page-wrap"></div>
  <div id="modal-layer"></div>`;
}

function setPage(html) {
  const el = document.getElementById('page');
  if (!el) return;
  el.style.animation = 'none';
  requestAnimationFrame(() => {
    el.innerHTML = html;
    el.style.animation = 'fadeUp .28s ease both';
  });
}

function manualSync() {
  const route = getRoute();
  if (route === 'admin' && APP.adminAuthed) loadAdminData();
}

// ═══════════════════════════════════════════════════════════════════════════
// VIEW: PARTICIPANT
// ═══════════════════════════════════════════════════════════════════════════
function mountParticipant() {
  setPage(`
    <div class="hero">
      <div class="hero-eyebrow">Purdue University · CF Study</div>
      <h1>Your Study<br/><span>Checklist</span></h1>
      <p>Enter your Participant ID to access your personalized session checklist and complete each step in order.</p>
    </div>
    <div style="max-width:440px;margin:0 auto">
      <div class="card">
        <div class="card-label">Access Your Portal</div>
        <div class="field mb16">
          <label class="lbl">Participant ID</label>
          <input class="input mono" id="p-code" placeholder="CF001" maxlength="6" autocomplete="off"/>
        </div>
        <button class="btn btn-primary btn-full btn-lg" onclick="pLookup()">Access My Sessions →</button>
        <div class="divider"></div>
        <p class="text-sm muted center">
          New participant? <a href="#" onclick="showRegModal();return false" style="color:var(--teal-dk);text-decoration:none;font-weight:500">Register here</a>
        </p>
      </div>
      <div id="p-result"></div>
    </div>
  `);
  document.getElementById('p-code').addEventListener('keydown', e => { if(e.key==='Enter') pLookup(); });
}

async function pLookup() {
  const code = document.getElementById('p-code').value.trim().toUpperCase();
  const el   = document.getElementById('p-result');
  if (!code) return;
  el.innerHTML = `<div class="center" style="padding:24px"><div class="spinner"></div></div>`;
  try {
    const res = await api('GET', { action:'getOne', code });
    if (res.error || !res.participant) {
      el.innerHTML = `<div class="alert alert-error">✗ No participant found for <strong>${esc(code)}</strong>. Check your ID or contact your RA.</div>`;
      return;
    }
    APP.cache[code] = res.participant;
    el.innerHTML = buildParticipantPortal(res.participant);
  } catch(e) {
    el.innerHTML = `<div class="alert alert-error">⚠ Could not connect to server. Check your internet connection and try again.</div>`;
  }
}

function buildParticipantPortal(p) {
  const phase = tlPhase(p);
  const prog1 = s1Progress(p);
  const prog2 = s2Progress(p);
  return `
  <div style="animation:slideRight .25s ease">
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
    <div class="id-code">${p.code}</div>
    <div class="id-name">${esc(p.firstName)} ${esc(p.lastName)}</div>
    <div class="id-meta">
      <div><div class="id-meta-k">Group</div><div class="id-meta-v">${p.group}</div></div>
      <div><div class="id-meta-k">Status</div><div class="id-meta-v">${sm.label}</div></div>
      ${p.s1Date ? `<div><div class="id-meta-k">Session 1</div><div class="id-meta-v">${p.s1Date}${p.s1Time?' · '+p.s1Time:''}</div></div>` : ''}
      ${p.s2Date ? `<div><div class="id-meta-k">Session 2</div><div class="id-meta-v">${p.s2Date}${p.s2Time?' · '+p.s2Time:''}</div></div>` : ''}
    </div>
    <button class="id-dl-btn" onclick="dlCSV('${p.code}')">↓ Download</button>
  </div>`;
}

function buildTimeline(phase) {
  const nodes = ['Registered','Session 1','Between','Session 2','Complete'];
  return `
  <div class="card" style="padding:20px 24px;margin-bottom:18px">
    <div class="card-label mb16">Study Progress</div>
    <div class="timeline">
      ${nodes.map((lbl, i) => {
        const done = phase > i, active = phase === i;
        return `<div class="tl-node">
          <div class="tl-dot ${done?'done':active?'active':''}">${done?'✓':i+1}</div>
          <div class="tl-lbl ${done?'done':active?'active':''}">${lbl}</div>
        </div>`;
      }).join('')}
    </div>
  </div>`;
}

function buildParticipantS1(p, prog) {
  const activeId = nextS1Step(p)?.id;
  return `
  <div class="scard">
    <div class="scard-head">
      <div><div class="scard-num">Session 1</div><div class="scard-title">Day 1 — Exam & Surveys</div></div>
      <span class="badge ${prog.pct===100?'badge-green':'badge-teal'}">${prog.done}/${prog.total} steps</span>
    </div>
    <div class="scard-body">
      <div class="prog-bar mb16"><div class="prog-fill" style="width:${prog.pct}%"></div></div>
      <div class="step-list">
        ${SESSION1.map((s,i) => buildPStep(p, s, i, 1, activeId)).join('')}
      </div>
    </div>
  </div>`;
}

function buildParticipantS2(p, prog) {
  const steps = s2Steps(p);
  const activeId = nextS2Step(p)?.id;
  return `
  <div class="scard" style="border-top:3px solid var(--green)">
    <div class="scard-head">
      <div><div class="scard-num" style="color:var(--green)">Session 2</div><div class="scard-title">Day 2 — Exam & Surveys</div></div>
      <span class="badge ${prog.pct===100?'badge-green':'badge-teal'}">${prog.done}/${prog.total} steps</span>
    </div>
    <div class="scard-body">
      <div class="prog-bar mb16"><div class="prog-fill s2" style="width:${prog.pct}%"></div></div>
      <div class="step-list">
        ${steps.map((s,i) => buildPStep(p, s, i, 2, activeId)).join('')}
      </div>
    </div>
  </div>`;
}

function buildPStep(p, s, idx, session, activeId) {
  const bucket = session === 1 ? p.s1 : p.s2;
  const rec    = bucket?.[s.id];
  const done   = !!rec?.done;
  const active = s.id === activeId;
  const cls    = done ? 's-done' : active ? 's-active' : 's-locked';

  const pill = s.type==='survey' ? `<span class="type-pill tp-survey">Survey</span>`
             : s.type==='ra'     ? `<span class="type-pill tp-ra">RA</span>`
             : `<span class="type-pill tp-ts">Timestamp</span>`;

  let action = '';
  if (active && s.type === 'survey') {
    action = `<div class="step-actions">
      <button class="btn btn-primary btn-sm" onclick="openSurveyModal('${s.key}','${p.code}','${s.id}',${session})">Open Survey →</button>
    </div>`;
  } else if (active) {
    action = `<div class="step-actions"><span class="text-sm muted">⌛ Waiting for RA to complete this step</span></div>`;
  }

  return `
  <div class="step-row ${cls}">
    <div class="step-idx ${done?'done':active?'active':''}">
      ${done ? '' : idx+1}
      ${active && !done ? '<div class="pulse-ring"></div>' : ''}
    </div>
    <div class="step-body">
      <div class="step-name ${done?'done':''}">${s.label}</div>
      <div class="step-desc">${s.desc} ${pill} ${rec?.ts?`<span class="step-ts">✓ ${fmt(rec.ts)}</span>`:''}</div>
      ${action}
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

// Survey modal
function openSurveyModal(key, code, stepId, session) {
  const survey = SURVEYS[key];
  const url    = survey.url + '?participant=' + code;
  showModal(`
    <div class="modal-title">${survey.label}</div>
    <div class="alert alert-info mb16">📋 The survey opens in a new tab. Complete it, then return here and click <strong>Mark as Submitted</strong>.</div>
    <div style="background:var(--surface2);border:1px solid var(--line);border-radius:var(--r);padding:12px 14px;margin-bottom:16px">
      <div class="text-xs muted mono mb4">URL (participant ID embedded)</div>
      <code style="font-family:var(--font-m);font-size:12px;color:var(--teal-dk);word-break:break-all">${url}</code>
    </div>
    <a href="${url}" target="_blank" class="btn btn-outline btn-full mb8">Open Survey in New Tab ↗</a>
    <button class="btn btn-green btn-full" onclick="pMarkSurvey('${code}','${stepId}',${session})">✓ Mark as Submitted</button>
    <button class="btn btn-ghost btn-full" style="margin-top:8px" onclick="closeModal()">Cancel</button>
  `);
}

async function pMarkSurvey(code, stepId, session) {
  closeModal();
  const el = document.getElementById('p-result');
  el.innerHTML += `<div id="p-saving" class="alert alert-info">Saving…</div>`;
  try {
    const res = await api('POST', { action:'markStep', code, session, stepId, note:'', ts: new Date().toISOString() });
    APP.cache[code] = res.participant;
    el.innerHTML = buildParticipantPortal(res.participant);
  } catch(e) {
    document.getElementById('p-saving')?.remove();
    showModal(`<div class="modal-title">⚠ Save Failed</div><p>Could not save to server. Please try again.</p><button class="btn btn-primary btn-full" style="margin-top:16px" onclick="closeModal()">OK</button>`);
  }
}

// Registration modal
function showRegModal() {
  showModal(`
    <div class="modal-title">Register to Participate</div>
    <div class="alert alert-info mb16">Your Participant ID (CF###) is assigned automatically and confirmed by your RA.</div>
    <div class="g2">
      <div class="field"><label class="lbl">First Name *</label><input class="input" id="r-first" placeholder="Jane"/></div>
      <div class="field"><label class="lbl">Last Name *</label><input class="input" id="r-last" placeholder="Smith"/></div>
    </div>
    <div class="field"><label class="lbl">Email *</label><input class="input" id="r-email" placeholder="jane@purdue.edu" type="email"/></div>
    <div class="field"><label class="lbl">Phone (optional)</label><input class="input" id="r-phone" placeholder="(765) 000-0000" type="tel"/></div>
    <div class="alert alert-warn">⚠ Your RA must confirm your registration before Session 1.</div>
    <div class="flex gap8" style="justify-content:flex-end;margin-top:14px">
      <button class="btn btn-ghost" onclick="closeModal()">Cancel</button>
      <button class="btn btn-primary" onclick="submitReg()">Submit →</button>
    </div>
  `);
}

async function submitReg() {
  const first = document.getElementById('r-first').value.trim();
  const last  = document.getElementById('r-last').value.trim();
  const email = document.getElementById('r-email').value.trim();
  const phone = document.getElementById('r-phone').value.trim();
  if (!first || !last || !email) { alert('Please fill in all required fields.'); return; }

  closeModal();
  setPage(`<div class="center" style="padding:80px"><div class="spinner"></div><p class="muted" style="margin-top:16px">Registering…</p></div>`);

  try {
    const res = await api('POST', { action:'create', data:{ firstName:first, lastName:last, email, phone } });
    const p   = res.participant;
    APP.cache[p.code] = p;
    showModal(`
      <div class="modal-title" style="color:var(--green)">✓ Registered!</div>
      <div style="text-align:center;padding:10px 0 20px">
        <div style="font-family:var(--font-h);font-size:52px;font-weight:800;color:var(--teal);letter-spacing:3px;margin-bottom:8px">${p.code}</div>
        <div style="font-size:16px;font-weight:500;margin-bottom:6px">${esc(first)} ${esc(last)}</div>
        <div class="muted text-sm">Save this ID — you'll need it for your sessions.</div>
      </div>
      <div class="alert alert-warn mb16">Please confirm your participation with your RA before Session 1.</div>
      <button class="btn btn-primary btn-full" onclick="closeModal();mountParticipant();setTimeout(()=>{document.getElementById('p-code').value='${p.code}';pLookup();},50)">
        Access My Portal →
      </button>
    `);
    mountParticipant();
  } catch(e) {
    mountParticipant();
    showModal(`<div class="modal-title">⚠ Registration Failed</div><p>Could not connect to server. Please try again or ask your RA.</p><button class="btn btn-primary btn-full" style="margin-top:16px" onclick="closeModal()">OK</button>`);
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// VIEW: COLLECTOR
// ═══════════════════════════════════════════════════════════════════════════
function mountCollector() {
  setPage(`
    <div class="section-head mb20">
      <div>
        <div class="card-label">Data Collector Interface</div>
        <div class="page-title">Session Manager</div>
        <div class="page-sub">Load any participant by code to manage their checklist in real time.</div>
      </div>
    </div>
    <div class="card" style="max-width:520px;margin-bottom:24px">
      <div class="card-label mb16">Load Participant</div>
      <div class="g2">
        <div class="field"><label class="lbl">Participant Code</label>
          <input class="input mono" id="c-code" placeholder="CF001" maxlength="6" autocomplete="off"/></div>
        <div class="field"><label class="lbl">RA Initials</label>
          <input class="input" id="c-ra" placeholder="AJ" maxlength="4"/></div>
      </div>
      <button class="btn btn-primary btn-full" onclick="cLoad()">Load →</button>
    </div>
    <div id="c-panel"></div>
  `);
  document.getElementById('c-code').addEventListener('keydown', e => { if(e.key==='Enter') cLoad(); });
}

async function cLoad() {
  const code = document.getElementById('c-code').value.trim().toUpperCase();
  const ra   = document.getElementById('c-ra').value.trim();
  const el   = document.getElementById('c-panel');
  if (!code) return;
  el.innerHTML = `<div class="center" style="padding:24px"><div class="spinner"></div></div>`;
  try {
    const res = await api('GET', { action:'getOne', code });
    if (res.error || !res.participant) {
      el.innerHTML = `<div class="alert alert-error">✗ Participant <strong>${esc(code)}</strong> not found.</div>`;
      return;
    }
    const p = res.participant;
    if (ra && p.raInitials !== ra) {
      p.raInitials = ra;
      await api('POST', { action:'update', data:{ code, raInitials:ra } });
    }
    APP.cache[code]    = p;
    APP.collectorCode  = code;
    renderCPanel();
  } catch(e) {
    el.innerHTML = `<div class="alert alert-error">⚠ Could not connect to server.</div>`;
  }
}

function renderCPanel() {
  const p    = APP.cache[APP.collectorCode]; if (!p) return;
  const prog1 = s1Progress(p), prog2 = s2Progress(p);
  const sm    = STATUS_META[p.status] || STATUS_META.new;

  document.getElementById('c-panel').innerHTML = `
  <div style="animation:slideRight .22s ease">
    <div class="card mb16">
      <div class="flex-wrap gap12" style="justify-content:space-between">
        <div class="flex-wrap gap12">
          <span class="mono" style="font-size:22px;font-weight:600;color:var(--teal-dk)">${p.code}</span>
          <span style="font-size:17px;font-weight:500">${esc(p.firstName)} ${esc(p.lastName)}</span>
          <span class="badge ${p.group==='Review'?'badge-review':'badge-none'}">${p.group}</span>
          <span class="badge ${sm.badge}">${sm.label}</span>
        </div>
        <div class="flex gap8">
          <button class="btn btn-ghost btn-sm" onclick="cRefresh()">↻ Refresh</button>
          <button class="btn btn-ghost btn-sm" onclick="dlCSV('${p.code}')">↓ CSV</button>
          <button class="btn btn-ghost btn-sm" onclick="showScheduleModal('${p.code}')">📅 Schedule</button>
        </div>
      </div>
    </div>

    <div class="g2 mb8">
      <button onclick="cShowSession(1)" style="cursor:pointer;text-align:left;border:2px solid var(--teal);border-radius:var(--r3);background:var(--surface);box-shadow:var(--sh-sm);overflow:hidden;padding:0">
        <div style="padding:16px 20px 12px;border-bottom:1px solid var(--line)">
          <div class="scard-num">Session 1 — Day 1</div>
          <div class="flex gap8" style="justify-content:space-between;align-items:center;margin-top:2px">
            <span class="scard-title" style="font-size:17px">Exam & Surveys</span>
            <span class="badge ${prog1.pct===100?'badge-green':'badge-teal'}">${prog1.pct}%</span>
          </div>
        </div>
        <div style="padding:12px 20px">
          <div class="prog-bar mb8"><div class="prog-fill" style="width:${prog1.pct}%"></div></div>
          <div class="flex gap8 muted text-sm">${prog1.done}/${prog1.total} steps${p.s1Date?' · <span class="mono">'+p.s1Date+'</span>':''}</div>
        </div>
      </button>

      <button onclick="cShowSession(2)" style="cursor:pointer;text-align:left;border:2px solid var(--green);border-radius:var(--r3);background:var(--surface);box-shadow:var(--sh-sm);overflow:hidden;padding:0">
        <div style="padding:16px 20px 12px;border-bottom:1px solid var(--line)">
          <div class="scard-num" style="color:var(--green)">Session 2 — Day 2</div>
          <div class="flex gap8" style="justify-content:space-between;align-items:center;margin-top:2px">
            <span class="scard-title" style="font-size:17px">Exam & Surveys</span>
            <span class="badge ${prog2.pct===100?'badge-green':'badge-teal'}">${prog2.pct}%</span>
          </div>
        </div>
        <div style="padding:12px 20px">
          <div class="prog-bar mb8"><div class="prog-fill s2" style="width:${prog2.pct}%"></div></div>
          <div class="flex gap8 muted text-sm">${prog2.done}/${prog2.total} steps${p.s2Date?' · <span class="mono">'+p.s2Date+'</span>':''}</div>
        </div>
      </button>
    </div>

    <div id="c-session-panel"></div>
  </div>`;
}

async function cRefresh() {
  const code = APP.collectorCode; if (!code) return;
  try {
    const res = await api('GET', { action:'getOne', code });
    if (res.participant) { APP.cache[code] = res.participant; renderCPanel(); }
  } catch(e) {}
}

function cShowSession(session) {
  const p     = APP.cache[APP.collectorCode]; if (!p) return;
  const steps = session === 1 ? SESSION1 : s2Steps(p);
  const bucket = session === 1 ? p.s1 : p.s2;
  const el    = document.getElementById('c-session-panel');

  el.innerHTML = `
  <div class="scard" style="margin-top:16px;animation:fadeUp .2s ease">
    <div class="scard-head">
      <div class="scard-title">Session ${session} Checklist</div>
      <div class="flex gap8">
        <input class="input" style="width:145px" type="date" value="${session===1?p.s1Date:p.s2Date}"
          onchange="cUpdateDate(${session},this.value)"/>
        <input class="input" style="width:108px" type="time" value="${session===1?p.s1Time:p.s2Time}"
          onchange="cUpdateTime(${session},this.value)"/>
      </div>
    </div>
    <div class="scard-body">
      ${session===1&&p.group==='No Review'?`<div class="alert alert-info mb16">ℹ No Review group — S2-01 (Review Text Check) is skipped in Session 2.</div>`:''}
      <div class="step-list">
        ${steps.map((s, idx) => buildCStep(p, s, idx, session, bucket)).join('')}
      </div>
      <div class="divider"></div>
      <div class="g2">
        <div class="field"><label class="lbl">HRV Device ID</label>
          <input class="input" placeholder="Polar H10 ID" value="${session===1?p.hrv1||'':p.hrv2||''}"
            onchange="cUpdateHRV(${session},this.value)"/></div>
        <div class="field"><label class="lbl">RA Initials</label>
          <input class="input" placeholder="AJ" maxlength="4" value="${p.raInitials||''}"
            onchange="cUpdateRA(this.value)"/></div>
      </div>
      <div class="field"><label class="lbl">Session Notes</label>
        <textarea class="textarea" placeholder="Issues, observations…" onchange="cUpdateNotes(this.value)">${esc(p.notes||'')}</textarea>
      </div>
    </div>
  </div>`;
}

function buildCStep(p, s, idx, session, bucket) {
  const rec  = bucket?.[s.id];
  const done = !!rec?.done;
  const cls  = done ? 's-done' : 's-active';
  const pill = s.type==='survey' ? `<span class="type-pill tp-survey">Participant Survey</span>`
             : s.type==='ra'     ? `<span class="type-pill tp-ra">RA Action</span>`
             : `<span class="type-pill tp-ts">Timestamp</span>`;
  const rPill = s.reviewOnly ? `<span class="type-pill tp-review">Review Only</span>` : '';
  const nId  = `cn_${s.id}`;

  let actions = '';
  if (!done) {
    if (s.type === 'survey') {
      actions = `<a href="${SURVEYS[s.key].url}?participant=${p.code}" target="_blank" class="btn btn-outline btn-sm">Open ↗</a>
                 <button class="btn btn-green btn-sm" onclick="cMark(${session},'${s.id}',false)">✓ Submitted</button>
                 <input class="input" id="${nId}" placeholder="Note" style="flex:1;min-width:100px;max-width:200px"/>`;
    } else if (s.type === 'ra') {
      actions = `<button class="btn btn-green btn-sm" onclick="cMark(${session},'${s.id}',false)">✓ Done</button>
                 <input class="input" id="${nId}" placeholder="Note" style="flex:1;min-width:100px;max-width:200px"/>`;
    } else {
      actions = `<button class="btn btn-amber btn-sm" onclick="cTimestamp(${session},'${s.id}')">⏱ Record Now</button>
                 <input class="input" id="${nId}" placeholder="Note" style="flex:1;min-width:100px;max-width:200px"/>`;
    }
    actions = `<div class="step-actions">${actions}</div>`;
  } else {
    actions = `<div class="step-actions">
      <button class="btn btn-ghost btn-xs" onclick="cUndo(${session},'${s.id}')">↩ Undo</button>
      ${rec.note?`<span class="text-xs muted">"${esc(rec.note)}"</span>`:''}
    </div>`;
  }

  return `
  <div class="step-row ${cls}">
    <div class="step-idx ${done?'done':'active'}">${done?'':idx+1}</div>
    <div class="step-body">
      <div class="step-name ${done?'done':''}">${s.label}</div>
      <div class="step-desc">${s.desc} ${pill}${rPill} ${rec?.ts?`<span class="step-ts">✓ ${fmt(rec.ts)}</span>`:''}</div>
      ${actions}
    </div>
  </div>`;
}

async function cMark(session, stepId, _) {
  const code = APP.collectorCode; const p = APP.cache[code]; if(!p) return;
  const note = document.getElementById('cn_'+stepId)?.value.trim() || '';
  try {
    const res = await api('POST', { action:'markStep', code, session, stepId, note, ts: new Date().toISOString() });
    APP.cache[code] = res.participant;
    renderCPanel(); cShowSession(session);
  } catch(e) { alert('Save failed. Please retry.'); }
}

async function cTimestamp(session, stepId) {
  const code = APP.collectorCode; const p = APP.cache[code]; if(!p) return;
  const note = document.getElementById('cn_'+stepId)?.value.trim() || '';
  const ts   = new Date().toISOString();
  try {
    const res = await api('POST', { action:'markStep', code, session, stepId, note, ts });
    APP.cache[code] = res.participant;
    renderCPanel(); cShowSession(session);
  } catch(e) { alert('Save failed. Please retry.'); }
}

async function cUndo(session, stepId) {
  const code = APP.collectorCode; const p = APP.cache[code]; if(!p) return;
  try {
    const res = await api('POST', { action:'unmarkStep', code, session, stepId });
    APP.cache[code] = res.participant;
    renderCPanel(); cShowSession(session);
  } catch(e) { alert('Undo failed. Please retry.'); }
}

async function cUpdateDate(s,v)  { await cUpdate(s===1?{s1Date:v}:{s2Date:v}); }
async function cUpdateTime(s,v)  { await cUpdate(s===1?{s1Time:v}:{s2Time:v}); }
async function cUpdateHRV(s,v)   { await cUpdate(s===1?{hrv1:v}:{hrv2:v}); }
async function cUpdateRA(v)      { await cUpdate({raInitials:v}); }
async function cUpdateNotes(v)   { await cUpdate({notes:v}); }

async function cUpdate(fields) {
  const code = APP.collectorCode; if (!code) return;
  try {
    const res = await api('POST', { action:'update', data:{ code, ...fields } });
    APP.cache[code] = res.participant;
  } catch(e) {}
}

function showScheduleModal(code) {
  const p = APP.cache[code]; if (!p) return;
  showModal(`
    <div class="modal-title">📅 Schedule — ${code}</div>
    <div class="g2">
      <div class="field"><label class="lbl">S1 Date</label><input class="input" type="date" id="ss1d" value="${p.s1Date}"/></div>
      <div class="field"><label class="lbl">S1 Time</label><input class="input" type="time" id="ss1t" value="${p.s1Time}"/></div>
    </div>
    <div class="g2">
      <div class="field"><label class="lbl">S2 Date</label><input class="input" type="date" id="ss2d" value="${p.s2Date}"/></div>
      <div class="field"><label class="lbl">S2 Time</label><input class="input" type="time" id="ss2t" value="${p.s2Time}"/></div>
    </div>
    <div class="flex gap8" style="justify-content:flex-end;margin-top:8px">
      <button class="btn btn-ghost" onclick="closeModal()">Cancel</button>
      <button class="btn btn-primary" onclick="saveSchedule('${code}')">Save</button>
    </div>
  `);
}

async function saveSchedule(code) {
  const s1Date = document.getElementById('ss1d').value;
  const s1Time = document.getElementById('ss1t').value;
  const s2Date = document.getElementById('ss2d').value;
  const s2Time = document.getElementById('ss2t').value;
  closeModal();
  try {
    const res = await api('POST', { action:'update', data:{ code, s1Date, s1Time, s2Date, s2Time } });
    APP.cache[code] = res.participant;
    renderCPanel();
  } catch(e) { alert('Save failed.'); }
}

// ═══════════════════════════════════════════════════════════════════════════
// VIEW: ADMIN
// ═══════════════════════════════════════════════════════════════════════════
function mountAdmin() {
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
    document.getElementById('admin-pw').addEventListener('keydown', e => { if(e.key==='Enter') adminLogin(); });
    return;
  }
  loadAdminData();
}

function adminLogin() {
  if (document.getElementById('admin-pw').value === ADMIN_PASSWORD) {
    APP.adminAuthed = true;
    loadAdminData();
  } else {
    const el = document.getElementById('admin-pw');
    el.style.borderColor = 'var(--red)';
    setTimeout(() => el.style.borderColor = '', 1400);
  }
}

async function loadAdminData() {
  setPage(`<div class="center" style="padding:80px"><div class="spinner"></div><p class="muted" style="margin-top:14px">Loading all participants…</p></div>`);
  try {
    const res = await api('GET', { action:'getAll' });
    const ps  = res.participants || [];
    ps.forEach(p => { APP.cache[p.code] = p; });
    renderAdminDash(ps);
  } catch(e) {
    setPage(`<div class="alert alert-error" style="margin-top:40px">⚠ Could not load data. Check your internet connection.<br/><button class="btn btn-ghost btn-sm" style="margin-top:12px" onclick="loadAdminData()">Retry</button></div>`);
  }
}

function renderAdminDash(ps) {
  const total    = ps.length;
  const s1done   = ps.filter(p => ['session1_done','session2_live','complete'].includes(p.status)).length;
  const s2start  = ps.filter(p => ['session2_live','complete'].includes(p.status)).length;
  const complete = ps.filter(p => p.status === 'complete').length;
  const review   = ps.filter(p => p.group === 'Review').length;
  const noReview = ps.filter(p => p.group === 'No Review').length;
  const balPct   = total ? Math.round(review / total * 100) : 50;

  setPage(`
    <div class="section-head mb20">
      <div>
        <div class="card-label">Admin Dashboard</div>
        <div class="page-title">Study Overview</div>
        <div class="page-sub">All participants · real-time from Google Sheets</div>
      </div>
      <div class="flex gap8 flex-wrap">
        <button class="btn btn-ghost btn-sm" onclick="loadAdminData()">↻ Refresh</button>
        <button class="btn btn-outline btn-sm" onclick="showAddModal()">+ Add Participant</button>
        <button class="btn btn-ghost btn-sm" onclick="adminLogout()">Log Out</button>
      </div>
    </div>

    <div class="g4 mb20">
      <div class="stat-tile teal"><div class="stat-num teal">${total}</div><div class="stat-lbl">Enrolled</div></div>
      <div class="stat-tile amber"><div class="stat-num amber">${s1done}</div><div class="stat-lbl">S1 Done</div></div>
      <div class="stat-tile blue"><div class="stat-num blue">${s2start}</div><div class="stat-lbl">S2 Started</div></div>
      <div class="stat-tile green"><div class="stat-num green">${complete}</div><div class="stat-lbl">Complete</div></div>
    </div>

    <div class="card mb20">
      <div class="card-header">
        <div><div class="card-label">Group Balance</div><div class="card-title">Review vs No Review</div></div>
        <div class="flex gap8">
          <span class="badge badge-review">${review} Review</span>
          <span class="badge badge-none">${noReview} No Review</span>
          ${Math.abs(review-noReview)>2
            ? `<span class="badge badge-amber">⚠ Off by ${Math.abs(review-noReview)}</span>`
            : `<span class="badge badge-green">✓ Balanced</span>`}
        </div>
      </div>
      <div class="group-bar">
        <div class="group-seg" style="flex:${review||.5};background:var(--teal)"></div>
        <div class="group-seg" style="flex:${noReview||.5};background:var(--ink4)"></div>
      </div>
      <div class="flex gap8 muted text-xs" style="margin-top:6px">
        <span>■ Review: ${balPct}%</span><span>■ No Review: ${100-balPct}%</span>
      </div>
    </div>

    <div class="card">
      <div class="card-header">
        <div class="card-title">All Participants</div>
        <input class="input" id="a-search" placeholder="Search…" style="max-width:220px" oninput="aFilter(this.value)"/>
      </div>
      ${total === 0
        ? `<div class="empty-state"><div class="empty-icon">◎</div><p class="muted text-sm">No participants yet. Click "+ Add Participant".</p></div>`
        : `<div class="table-wrap">
          <table id="a-table">
            <thead><tr>
              <th>Code</th><th>Name</th><th>Group</th><th>Status</th>
              <th>S1</th><th>S2</th><th>Session 1</th><th>Session 2</th><th>RA</th><th>Actions</th>
            </tr></thead>
            <tbody>${ps.sort((a,b)=>a.code.localeCompare(b.code)).map(buildAdminRow).join('')}</tbody>
          </table>
        </div>`}
    </div>
  `);
}

function buildAdminRow(p) {
  const sm = STATUS_META[p.status] || STATUS_META.new;
  const p1 = s1Progress(p), p2 = s2Progress(p);
  const miniBar = (pct, cls='') => `
    <div style="display:flex;align-items:center;gap:7px">
      <div style="flex:1;height:5px;background:var(--surface3);border-radius:3px;min-width:54px;overflow:hidden">
        <div style="height:100%;width:${pct}%;background:linear-gradient(90deg,var(--teal),var(--green));border-radius:3px${cls}"></div>
      </div>
      <span class="mono text-xs">${pct}%</span>
    </div>`;
  return `
  <tr id="ar-${p.code}">
    <td>${p.code}</td>
    <td style="color:var(--ink);font-weight:500">${esc(p.firstName)} ${esc(p.lastName)}</td>
    <td><span class="badge ${p.group==='Review'?'badge-review':'badge-none'}">${p.group}</span></td>
    <td><span class="badge ${sm.badge}">${sm.label}</span></td>
    <td>${miniBar(p1.pct)}</td>
    <td>${miniBar(p2.pct)}</td>
    <td class="mono text-xs">${p.s1Date||'—'}</td>
    <td class="mono text-xs">${p.s2Date||'—'}</td>
    <td class="mono text-xs">${p.raInitials||'—'}</td>
    <td><div class="flex gap4">
      <button class="btn btn-ghost btn-xs" onclick="showEditModal('${p.code}')">Edit</button>
      <button class="btn btn-ghost btn-xs" onclick="dlCSV('${p.code}')">↓</button>
      <button class="btn btn-danger btn-xs" onclick="aDrop('${p.code}')">Drop</button>
    </div></td>
  </tr>`;
}

function aFilter(q) {
  document.querySelectorAll('#a-table tbody tr').forEach(r => {
    r.style.display = r.textContent.toLowerCase().includes(q.toLowerCase()) ? '' : 'none';
  });
}

function adminLogout() { APP.adminAuthed = false; mountAdmin(); }

function showAddModal() {
  showModal(`
    <div class="modal-title">+ Add Participant</div>
    <div class="g2">
      <div class="field"><label class="lbl">First Name *</label><input class="input" id="m-first" placeholder="Jane"/></div>
      <div class="field"><label class="lbl">Last Name *</label><input class="input" id="m-last" placeholder="Smith"/></div>
    </div>
    <div class="field"><label class="lbl">Email *</label><input class="input" id="m-email" placeholder="jane@purdue.edu" type="email"/></div>
    <div class="field"><label class="lbl">Phone</label><input class="input" id="m-phone" type="tel" placeholder="(765) 000-0000"/></div>
    <div class="g2">
      <div class="field"><label class="lbl">Group</label>
        <select class="select" id="m-group">
          <option value="">Auto (balanced)</option>
          <option>Review</option><option>No Review</option>
        </select></div>
      <div class="field"><label class="lbl">RA Initials</label>
        <input class="input" id="m-ra" placeholder="AJ" maxlength="4"/></div>
    </div>
    <div class="divider"></div>
    <div class="flex gap8" style="justify-content:flex-end">
      <button class="btn btn-ghost" onclick="closeModal()">Cancel</button>
      <button class="btn btn-primary" onclick="aAdd()">Create →</button>
    </div>
  `);
}

async function aAdd() {
  const first = document.getElementById('m-first').value.trim();
  const last  = document.getElementById('m-last').value.trim();
  const email = document.getElementById('m-email').value.trim();
  const phone = document.getElementById('m-phone').value.trim();
  const group = document.getElementById('m-group').value;
  const ra    = document.getElementById('m-ra').value.trim();
  if (!first||!last||!email) { alert('Name and email are required.'); return; }
  closeModal();
  try {
    const res = await api('POST', { action:'create', data:{ firstName:first, lastName:last, email, phone, group, raInitials:ra } });
    APP.cache[res.participant.code] = res.participant;
    loadAdminData();
  } catch(e) { alert('Failed to create participant.'); }
}

function showEditModal(code) {
  const p = APP.cache[code]; if (!p) return;
  showModal(`
    <div class="modal-title">Edit — ${code}</div>
    <div class="g2">
      <div class="field"><label class="lbl">First Name</label><input class="input" id="e-first" value="${esc(p.firstName)}"/></div>
      <div class="field"><label class="lbl">Last Name</label><input class="input" id="e-last" value="${esc(p.lastName)}"/></div>
    </div>
    <div class="field"><label class="lbl">Email</label><input class="input" id="e-email" value="${esc(p.email)}" type="email"/></div>
    <div class="field"><label class="lbl">Phone</label><input class="input" id="e-phone" value="${esc(p.phone||'')}"/></div>
    <div class="g2">
      <div class="field"><label class="lbl">Group</label>
        <select class="select" id="e-group">
          ${REVIEW_GROUPS.map(g=>`<option ${g===p.group?'selected':''}>${g}</option>`).join('')}
        </select></div>
      <div class="field"><label class="lbl">Status</label>
        <select class="select" id="e-status">
          ${Object.keys(STATUS_META).map(s=>`<option value="${s}" ${s===p.status?'selected':''}>${STATUS_META[s].label}</option>`).join('')}
        </select></div>
    </div>
    <div class="g2">
      <div class="field"><label class="lbl">S1 Date</label><input class="input" type="date" id="e-s1d" value="${p.s1Date}"/></div>
      <div class="field"><label class="lbl">S1 Time</label><input class="input" type="time" id="e-s1t" value="${p.s1Time}"/></div>
    </div>
    <div class="g2">
      <div class="field"><label class="lbl">S2 Date</label><input class="input" type="date" id="e-s2d" value="${p.s2Date}"/></div>
      <div class="field"><label class="lbl">S2 Time</label><input class="input" type="time" id="e-s2t" value="${p.s2Time}"/></div>
    </div>
    <div class="field"><label class="lbl">RA Initials</label><input class="input" id="e-ra" value="${esc(p.raInitials||'')}" maxlength="4"/></div>
    <div class="field"><label class="lbl">Notes</label><textarea class="textarea" id="e-notes">${esc(p.notes||'')}</textarea></div>
    <div class="flex gap8" style="justify-content:flex-end;margin-top:8px">
      <button class="btn btn-ghost" onclick="closeModal()">Cancel</button>
      <button class="btn btn-primary" onclick="aSave('${code}')">Save</button>
    </div>
  `);
}

async function aSave(code) {
  const data = {
    code,
    firstName:  document.getElementById('e-first').value.trim(),
    lastName:   document.getElementById('e-last').value.trim(),
    email:      document.getElementById('e-email').value.trim(),
    phone:      document.getElementById('e-phone').value.trim(),
    group:      document.getElementById('e-group').value,
    status:     document.getElementById('e-status').value,
    s1Date:     document.getElementById('e-s1d').value,
    s1Time:     document.getElementById('e-s1t').value,
    s2Date:     document.getElementById('e-s2d').value,
    s2Time:     document.getElementById('e-s2t').value,
    raInitials: document.getElementById('e-ra').value.trim(),
    notes:      document.getElementById('e-notes').value.trim(),
  };
  closeModal();
  try {
    const res = await api('POST', { action:'update', data });
    APP.cache[code] = res.participant;
    loadAdminData();
  } catch(e) { alert('Save failed.'); }
}

async function aDrop(code) {
  if (!confirm(`Mark ${code} as Dropped?`)) return;
  try {
    await api('POST', { action:'update', data:{ code, status:'dropped' } });
    loadAdminData();
  } catch(e) { alert('Failed.'); }
}

// ─── CSV EXPORT ───────────────────────────────────────────────────────────────
async function dlCSV(code) {
  let p = APP.cache[code];
  if (!p) {
    try { const res = await api('GET',{action:'getOne',code}); p = res.participant; } catch(e){ alert('Could not load data.'); return; }
  }
  const rows = [
    ['CF Study — Participant Report'],
    ['Generated', new Date().toLocaleString()],
    [],
    ['Code', p.code], ['Name', `${p.firstName} ${p.lastName}`],
    ['Email', p.email], ['Phone', p.phone||''],
    ['Group', p.group], ['Status', p.status],
    ['Registered', fmt(p.registeredAt)], ['RA', p.raInitials||''],
    [],
    ['── SESSION 1 ──'],
    ['Date', p.s1Date||''], ['Time', p.s1Time||''], ['HRV Device', p.hrv1||''],
    ['Step ID','Step Name','Done','Timestamp','Note'],
    ...SESSION1.map(s => [s.id, s.label, p.s1?.[s.id]?.done?'Yes':'No', p.s1?.[s.id]?.ts?fmt(p.s1[s.id].ts):'', p.s1?.[s.id]?.note||'']),
    [],
    ['── SESSION 2 ──'],
    ['Date', p.s2Date||''], ['Time', p.s2Time||''], ['HRV Device', p.hrv2||''],
    ['Step ID','Step Name','Done','Timestamp','Note'],
    ...s2Steps(p).map(s => [s.id, s.label, p.s2?.[s.id]?.done?'Yes':'No', p.s2?.[s.id]?.ts?fmt(p.s2[s.id].ts):'', p.s2?.[s.id]?.note||'']),
    [],
    ['Notes', p.notes||''],
  ];
  const csv = rows.map(r => r.map(c=>`"${String(c).replace(/"/g,'""')}"`).join(',')).join('\n');
  dl(`CF_${code}_${dtag()}.csv`, csv, 'text/csv');
}

// ─── MODAL ────────────────────────────────────────────────────────────────────
function showModal(html) {
  document.getElementById('modal-layer').innerHTML =
    `<div class="modal-bg" onclick="bgClick(event)"><div class="modal">${html}</div></div>`;
}
function closeModal() { document.getElementById('modal-layer').innerHTML = ''; }
function bgClick(e)   { if (e.target.classList.contains('modal-bg')) closeModal(); }

// ─── UTILS ────────────────────────────────────────────────────────────────────
function fmt(iso) {
  if (!iso) return '';
  try {
    const d = new Date(iso);
    return d.toLocaleDateString('en-US',{month:'short',day:'numeric'}) + ' ' +
           d.toLocaleTimeString('en-US',{hour:'2-digit',minute:'2-digit'});
  } catch(e) { return iso; }
}
function dtag() { return new Date().toISOString().slice(0,10).replace(/-/g,''); }
function esc(s) { return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
function dl(name, content, mime) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([content],{type:mime}));
  a.download = name; a.click(); URL.revokeObjectURL(a.href);
}
