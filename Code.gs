// ═══════════════════════════════════════════════════════════════════════
//  CF STUDY CHECKLIST — Google Apps Script Backend
//  Paste this entire file into Google Apps Script (script.google.com)
//  then deploy as a Web App (see README for exact steps).
// ═══════════════════════════════════════════════════════════════════════

const SHEET_NAME = 'Participants';
const LOCK_TIMEOUT = 10000; // ms — prevents race conditions on code generation

// ── CORS HEADERS ────────────────────────────────────────────────────────────
function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST',
    'Access-Control-Allow-Headers': 'Content-Type',
  };
}

function doOptions(e) {
  return ContentService.createTextOutput('')
    .setMimeType(ContentService.MimeType.TEXT);
}

// ── ENTRY POINTS ─────────────────────────────────────────────────────────────
function doGet(e) {
  try {
    const action = e.parameter.action;
    let result;
    switch (action) {
      case 'getAll':        result = getAllParticipants(); break;
      case 'getOne':        result = getParticipant(e.parameter.code); break;
      case 'nextCode':      result = { code: peekNextCode() }; break;
      default: result = { error: 'Unknown action: ' + action };
    }
    return jsonOut(result);
  } catch(err) {
    return jsonOut({ error: err.message });
  }
}

function doPost(e) {
  try {
    const body   = JSON.parse(e.postData.contents);
    const action = body.action;
    let result;
    switch (action) {
      case 'create':     result = createParticipant(body.data);       break;
      case 'update':     result = updateParticipant(body.data);       break;
      case 'markStep':   result = markStep(body.code, body.session, body.stepId, body.note, body.ts); break;
      case 'unmarkStep': result = unmarkStep(body.code, body.session, body.stepId); break;
      default: result = { error: 'Unknown action: ' + action };
    }
    return jsonOut(result);
  } catch(err) {
    return jsonOut({ error: err.message });
  }
}

function jsonOut(data) {
  return ContentService
    .createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}

// ── SHEET ACCESS ─────────────────────────────────────────────────────────────
function getSheet() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sh = ss.getSheetByName(SHEET_NAME);
  if (!sh) {
    sh = ss.insertSheet(SHEET_NAME);
    sh.appendRow(['code','firstName','lastName','email','phone','group','raInitials',
                  'status','registeredAt','s1Date','s1Time','s2Date','s2Time',
                  'hrv1','hrv2','notes','s1','s2']);
    sh.setFrozenRows(1);
    sh.getRange(1,1,1,18).setFontWeight('bold').setBackground('#1a2940').setFontColor('white');
  }
  return sh;
}

function sheetToObject(row) {
  return {
    code:         row[0]  || '',
    firstName:    row[1]  || '',
    lastName:     row[2]  || '',
    email:        row[3]  || '',
    phone:        row[4]  || '',
    group:        row[5]  || '',
    raInitials:   row[6]  || '',
    status:       row[7]  || 'new',
    registeredAt: row[8]  || '',
    s1Date:       row[9]  || '',
    s1Time:       row[10] || '',
    s2Date:       row[11] || '',
    s2Time:       row[12] || '',
    hrv1:         row[13] || '',
    hrv2:         row[14] || '',
    notes:        row[15] || '',
    s1:           safeParseJSON(row[16], {}),
    s2:           safeParseJSON(row[17], {}),
  };
}

function objectToRow(p) {
  return [
    p.code, p.firstName, p.lastName, p.email, p.phone, p.group,
    p.raInitials, p.status, p.registeredAt,
    p.s1Date, p.s1Time, p.s2Date, p.s2Time,
    p.hrv1, p.hrv2, p.notes,
    JSON.stringify(p.s1 || {}),
    JSON.stringify(p.s2 || {}),
  ];
}

function safeParseJSON(val, def) {
  try { return val ? JSON.parse(val) : def; } catch(e) { return def; }
}

function findRow(sh, code) {
  const data = sh.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][0]).trim() === code.trim()) return i + 1; // 1-indexed
  }
  return -1;
}

// ── PARTICIPANT CRUD ─────────────────────────────────────────────────────────
function getAllParticipants() {
  const sh   = getSheet();
  const data = sh.getDataRange().getValues();
  const participants = [];
  for (let i = 1; i < data.length; i++) {
    if (data[i][0]) participants.push(sheetToObject(data[i]));
  }
  return { participants };
}

function getParticipant(code) {
  const sh  = getSheet();
  const row = findRow(sh, code);
  if (row < 0) return { error: 'Not found' };
  const data = sh.getRange(row, 1, 1, 18).getValues()[0];
  return { participant: sheetToObject(data) };
}

function createParticipant(data) {
  // Use a lock to prevent duplicate codes under concurrent requests
  const lock = LockService.getScriptLock();
  lock.waitLock(LOCK_TIMEOUT);
  try {
    const sh   = getSheet();
    const code = nextCode(sh);

    // Determine group if not specified
    let group = data.group || '';
    if (!group) group = balancedGroup(sh);

    const now = new Date().toISOString();
    const p = {
      code,
      firstName:    data.firstName    || '',
      lastName:     data.lastName     || '',
      email:        data.email        || '',
      phone:        data.phone        || '',
      group,
      raInitials:   data.raInitials   || '',
      status:       'new',
      registeredAt: now,
      s1Date:'', s1Time:'', s2Date:'', s2Time:'',
      hrv1:'', hrv2:'', notes:'',
      s1: {}, s2: {},
    };
    sh.appendRow(objectToRow(p));
    SpreadsheetApp.flush();
    return { participant: p, created: true };
  } finally {
    lock.releaseLock();
  }
}

function updateParticipant(data) {
  const sh  = getSheet();
  const row = findRow(sh, data.code);
  if (row < 0) return { error: 'Not found' };

  // Preserve existing s1/s2 step data unless explicitly passed
  const existing = sheetToObject(sh.getRange(row, 1, 1, 18).getValues()[0]);
  const merged = Object.assign(existing, data);
  // Keep existing step buckets if not being overwritten
  if (!data.s1) merged.s1 = existing.s1;
  if (!data.s2) merged.s2 = existing.s2;

  sh.getRange(row, 1, 1, 18).setValues([objectToRow(merged)]);
  SpreadsheetApp.flush();
  return { participant: merged, updated: true };
}

function markStep(code, session, stepId, note, ts) {
  const sh  = getSheet();
  const row = findRow(sh, code);
  if (row < 0) return { error: 'Not found' };

  const existing = sheetToObject(sh.getRange(row, 1, 1, 18).getValues()[0]);
  const bucket   = session === 1 ? existing.s1 : existing.s2;
  bucket[stepId] = { done: true, ts: ts || new Date().toISOString(), note: note || '' };
  session === 1 ? (existing.s1 = bucket) : (existing.s2 = bucket);

  // Recalc status
  existing.status = calcStatus(existing);

  sh.getRange(row, 1, 1, 18).setValues([objectToRow(existing)]);
  SpreadsheetApp.flush();
  return { participant: existing, updated: true };
}

function unmarkStep(code, session, stepId) {
  const sh  = getSheet();
  const row = findRow(sh, code);
  if (row < 0) return { error: 'Not found' };

  const existing = sheetToObject(sh.getRange(row, 1, 1, 18).getValues()[0]);
  const bucket   = session === 1 ? existing.s1 : existing.s2;
  delete bucket[stepId];
  session === 1 ? (existing.s1 = bucket) : (existing.s2 = bucket);
  existing.status = calcStatus(existing);

  sh.getRange(row, 1, 1, 18).setValues([objectToRow(existing)]);
  SpreadsheetApp.flush();
  return { participant: existing, updated: true };
}

// ── HELPERS ──────────────────────────────────────────────────────────────────
function nextCode(sh) {
  const data = sh.getDataRange().getValues();
  let max = 0;
  for (let i = 1; i < data.length; i++) {
    const c = String(data[i][0]);
    if (c.startsWith('CF')) {
      const n = parseInt(c.replace('CF', ''), 10);
      if (!isNaN(n) && n > max) max = n;
    }
  }
  return 'CF' + String(max + 1).padStart(3, '0');
}

function peekNextCode() {
  return nextCode(getSheet());
}

function balancedGroup(sh) {
  const data   = sh.getDataRange().getValues();
  const counts = { 'Review': 0, 'No Review': 0 };
  for (let i = 1; i < data.length; i++) {
    const g = String(data[i][5]);
    if (counts[g] !== undefined) counts[g]++;
  }
  const min   = Math.min(counts['Review'], counts['No Review']);
  const cands = Object.keys(counts).filter(g => counts[g] === min);
  return cands[Math.floor(Math.random() * cands.length)];
}

// Step definitions (mirrors frontend) — used for status calculation
const S1_IDS = ['S1-01a','S1-01b','S1-01c','S1-02','S1-03','S1-04','S1-05','S1-06a','S1-06b','S1-06c','S1-07'];
const S2_ALL = ['S2-01','S2-02a','S2-02b','S2-02c','S2-03','S2-04','S2-05','S2-06','S2-07'];
const S2_REVIEW_ONLY = ['S2-01'];

function calcStatus(p) {
  const s2ids    = p.group === 'Review' ? S2_ALL : S2_ALL.filter(id => !S2_REVIEW_ONLY.includes(id));
  const s1done   = S1_IDS.every(id => p.s1[id]?.done);
  const s2done   = s2ids.every(id => p.s2[id]?.done);
  const s1any    = Object.keys(p.s1).length > 0;
  const s2any    = Object.keys(p.s2).length > 0;
  if (s1done && s2done) return 'complete';
  if (s2any)            return 'session2_live';
  if (s1done)           return 'session1_done';
  if (s1any)            return 'session1_live';
  if (p.s1Date)         return 'scheduled';
  return 'new';
}
