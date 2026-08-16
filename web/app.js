import { createDemoHealthParClient } from './healthpar-client.js';
import { getDeathSave } from '../src/medscan-095.js';

const client = createDemoHealthParClient();
let state = client.snapshot();
let selectedFindingId = state.bodyMap.findings[0]?.id ?? null;
let countdownTimer = null;

const $ = (s) => document.querySelector(s);
const $$ = (s) => [...document.querySelectorAll(s)];
const cap = (s) => String(s ?? '').replace(/_/g, ' ').replace(/\b\w/g, (m) => m.toUpperCase());

function normalizeSnapshot(input) {
  const next = structuredClone(input || {});
  next.subject ||= {};
  next.game ||= {};
  next.game.hp ||= { current: null, max: null };
  next.game.deathSave ||= { active: false };
  next.biomonitor ||= { status: 'unknown', confidence: null, telemetryMode: 'unknown' };
  next.coverage ||= { plan: 'Unknown', status: 'unknown', dispatchEligible: false };
  next.location ||= { provider: 'unknown', label: 'Location unavailable' };
  next.telemetry ||= {};
  next.bodyMap ||= { findings: [] };
  next.bodyMap.findings ||= [];
  next.response ||= { state: 'idle', timeline: [] };
  next.response.timeline ||= [];
  next.history ||= [];
  return next;
}

function loadSnapshot(snapshot) {
  state = normalizeSnapshot(snapshot);
  if (!state.bodyMap.findings.some((f) => f.id === selectedFindingId)) selectedFindingId = state.bodyMap.findings[0]?.id ?? null;
  renderAll();
}

function getSelectedFinding() {
  return state.bodyMap.findings.find((f) => f.id === selectedFindingId) || state.bodyMap.findings[0] || null;
}

function renderHeader() {
  $('#headPlan').textContent = state.coverage.plan || 'Unknown';
  $('#patientId').textContent = state.subject.patientId || state.subject.characterId || 'Unlinked';
  $('#patientSecondary').textContent = state.subject.identityRef ? `Linked · ${state.subject.identityRef}` : 'No identity link';
  $('#bioState').textContent = cap(state.biomonitor.status);
  $('#bioSignal').textContent = state.biomonitor.confidence == null ? 'Signal confidence unavailable' : `Signal confidence ${state.biomonitor.confidence}%`;
  $('#planName').textContent = state.coverage.plan || 'Unknown';
  $('#coverageSecondary').textContent = state.coverage.dispatchEligible ? 'Extraction eligible' : 'Dispatch not verified';
  $('#coverageTag').textContent = cap(state.coverage.status);
}

function renderVitals() {
  const defs = [['Heart rate', 'heartRate'], ['Blood pressure', 'bloodPressure'], ['SpO₂', 'spo2'], ['Temperature', 'temperature']];
  $('#vitalsRow').innerHTML = defs.map(([label, key]) => {
    const v = state.telemetry[key] || {};
    return `<article class="card vital ${key === 'temperature' ? 'temp' : ''}"><div class="label">${label}</div><div class="value">${v.value ?? '—'}<span class="unit">${v.unit || ''}</span></div></article>`;
  }).join('');
  $('#chartGrid').innerHTML = defs.map(([label, key]) => {
    const v = state.telemetry[key] || {};
    return `<article class="card chart"><div class="eyebrow">${label}</div><div class="primary">${v.value ?? '—'} ${v.unit || ''}</div><div class="chartbox"></div></article>`;
  }).join('');
  $('#telemetryMode').textContent = `${cap(state.biomonitor.telemetryMode)} telemetry · presentation layer`;
}

function renderFinding() {
  const f = getSelectedFinding();
  const mappedZones = new Set(state.bodyMap.findings.map((finding) => finding.zone));
  $$('.zone').forEach((z) => {
    z.classList.toggle('mapped', mappedZones.has(z.dataset.zone));
    z.classList.toggle('active', Boolean(f) && z.dataset.zone === f.zone);
  });
  if (!f) {
    $('#severity').textContent = 'No finding';
    $('#detailTitle').textContent = 'Scan clear';
    $('#detailCopy').textContent = 'No current projected findings on this body view.';
    $('#detailSource').textContent = 'HealthPar';
    $('#chipTitle').textContent = 'No finding';
    $('#chipMeta').textContent = '—';
    return;
  }
  $('#severity').textContent = `● ${cap(f.severity)}`;
  $('#detailTitle').textContent = f.title;
  $('#detailCopy').textContent = f.summary;
  $('#detailSource').textContent = cap(f.source);
  $('#chipTitle').textContent = f.title;
  $('#chipMeta').textContent = `${cap(f.severity)} · ${cap(f.source)}`;
}

function renderSummary() {
  const counts = { mild: 0, moderate: 0, critical: 0 };
  state.bodyMap.findings.forEach((f) => { if (counts[f.severity] != null) counts[f.severity] += 1; });
  $('#sumMild').textContent = counts.mild;
  $('#sumModerate').textContent = counts.moderate;
  $('#sumCritical').textContent = counts.critical;
}

function renderOverview() {
  const ws = cap(state.game.woundState || 'unknown');
  const emphasis = ['mortally_wounded', 'dead'].includes(state.game.woundState) ? 'CRITICAL' : state.game.stabilized ? 'STABLE' : 'CONNECTED';
  $('#overviewState').innerHTML = `YOU ARE <span>${emphasis}</span>`;
  $('#overviewCopy').textContent = `Gameplay state: ${ws}. HP ${state.game.hp.current ?? '—'} / ${state.game.hp.max ?? '—'}. This panel is redrawn from the current HealthPar projection; biomonitor graphics do not create gameplay facts.`;
  $('#quickFindings').textContent = `${state.bodyMap.findings.length} mapped findings`;
  $('#quickVitals').textContent = `${cap(state.biomonitor.telemetryMode)} telemetry`;
  $('#quickHistory').textContent = `${state.history.length} stored events`;
}

function renderHistory() {
  $('#historyList').innerHTML = state.history.map((h) => `<article class="card history-item"><time>${new Date(h.at).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }).toUpperCase()}</time><strong>${h.label}</strong><span class="tag ${h.tone || ''}">${h.outcome}</span></article>`).join('') || '<article class="card history-item"><strong>No stored incidents</strong></article>';
}

function renderResponse() {
  $('#locationLabel').textContent = state.location.label || 'Location unavailable';
  $('#locationSource').textContent = `Source: ${state.location.provider || 'unknown'} · ${state.location.ref || 'no ref'}`;
  $('#unitId').textContent = state.response.unitId || 'Pending';
  $('#unitMeta').textContent = state.response.state === 'idle' ? 'No active response' : `${cap(state.response.state)}${state.response.distanceKm != null ? ` · ${state.response.distanceKm} km` : ''}`;
  $('#timeline').innerHTML = (state.response.timeline || []).map((t) => `<div><span>${t.time || '—'}</span><i></i><span>${t.label}</span></div>`).join('') || '<div><span>—</span><i></i><span>No active incident</span></div>';
  updateCountdown();
}

function updateCountdown() {
  const s = Math.max(0, state.response.etaSeconds || 0);
  $('#countdown').textContent = state.response.state === 'idle' ? '--:--' : `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
}

function renderConsole() {
  const engine = client.state;
  const deathSave = getDeathSave(engine);
  $('#engineRevision').textContent = `rev ${engine.revision}`;
  $('#engineHp').textContent = `${engine.hp.current} / ${engine.baselines.maxHitPoints} HP`;
  $('#engineWound').textContent = cap(engine.woundState);
  $('#engineDeathSave').textContent = deathSave.active ? `DS < ${deathSave.target}` : 'DS inactive';
}

function renderAll() {
  renderHeader(); renderVitals(); renderFinding(); renderSummary(); renderOverview(); renderHistory(); renderResponse(); renderConsole();
}

function openView(id) {
  $$('.view').forEach((v) => v.classList.toggle('active', v.id === id));
  $$('nav button').forEach((b) => b.classList.toggle('active', b.dataset.target === id));
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function showToast(text) {
  const t = $('#toast');
  t.textContent = text;
  t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), 1900);
}

function publishSnapshot(snapshot) {
  loadSnapshot(snapshot);
  window.dispatchEvent(new CustomEvent('medscan:update', { detail: structuredClone(snapshot) }));
}

function runHealthParCommand(type, payload = {}) {
  try {
    const result = client.command(type, payload);
    publishSnapshot(result.snapshot);
    showToast(`HealthPar · ${cap(type)}`);
    return result;
  } catch (error) {
    showToast(error.message || 'HealthPar command rejected');
    throw error;
  }
}

function requestDispatch() {
  const detail = {
    characterId: state.subject.characterId,
    identityRef: state.subject.identityRef,
    medicalSnapshot: structuredClone(state.game),
    bodyMap: structuredClone(state.bodyMap),
    location: structuredClone(state.location),
    coverage: structuredClone(state.coverage),
  };
  window.dispatchEvent(new CustomEvent('medscan:dispatch-requested', { detail }));
  if (state.response.state === 'idle') {
    const response = {
      state: 'en_route', unitId: 'TT-AV 12', etaSeconds: 197, distanceKm: 2.8,
      timeline: [{ time: '18:04', label: 'Signal received' }, { time: '18:04', label: 'Coverage verified' }, { time: '18:05', label: 'Unit dispatched' }, { time: '18:06', label: 'Unit approaching' }],
    };
    client.setPresentation({ response });
    loadSnapshot(client.snapshot());
    openView('emergency');
    showToast('Dispatch request emitted');
    clearInterval(countdownTimer);
    countdownTimer = setInterval(() => {
      if (state.response.etaSeconds > 0) {
        state.response.etaSeconds -= 1;
        updateCountdown();
      }
    }, 1000);
  }
}

$$('nav button').forEach((b) => b.addEventListener('click', () => openView(b.dataset.target)));
$$('[data-jump]').forEach((b) => b.addEventListener('click', () => openView(b.dataset.jump)));
$$('.zone').forEach((z) => z.addEventListener('click', () => {
  const f = state.bodyMap.findings.find((x) => x.zone === z.dataset.zone);
  if (f) { selectedFindingId = f.id; renderFinding(); }
}));
$$('[data-bodyview]').forEach((btn) => btn.addEventListener('click', () => {
  const front = btn.dataset.bodyview === 'front';
  $('#frontBody').hidden = !front;
  $('#backBody').hidden = front;
  $$('[data-bodyview]').forEach((b) => b.classList.toggle('active', b === btn));
  const f = state.bodyMap.findings.find((x) => front ? x.zone !== 'thoracic_back' : x.zone === 'thoracic_back');
  if (f) selectedFindingId = f.id;
  renderFinding();
}));
$('#dispatchBtn').addEventListener('click', requestDispatch);

const consoleEnabled = new URLSearchParams(location.search).get('healthpar') === '1';
if (consoleEnabled) {
  $('#consoleFab').hidden = false;
  $('#healthparConsole').hidden = false;
}
$('#consoleFab').addEventListener('click', () => { $('#healthparConsole').hidden = false; });
$('#closeConsole').addEventListener('click', () => { $('#healthparConsole').hidden = true; });
$$('[data-command]').forEach((button) => button.addEventListener('click', () => {
  const action = button.dataset.command;
  if (action === 'damage') runHealthParCommand('apply_damage', { amount: Number($('#damageAmount').value) || 0 });
  if (action === 'death-save') runHealthParCommand('roll_death_save', { roll: Number($('#deathSaveRoll').value) || 1 });
  if (action === 'critical') runHealthParCommand('add_critical_injury', { injuryId: `inj_${Date.now()}`, definitionId: 'demo:critical-injury', label: 'Left thigh critical trauma', bodyRegion: 'left_thigh', deathSaveModifier: -1, quickFixPermanentlyResolves: false });
  if (action === 'stabilise') runHealthParCommand('attempt_stabilisation', { success: true, providerId: 'demo:medtech', method: 'First Aid' });
  if (action === 'treat') {
    const injury = client.state.criticalInjuries.find((item) => item.state !== 'treated' && item.state !== 'resolved');
    if (!injury) return showToast('No active Critical Injury');
    runHealthParCommand('attempt_treatment', { injuryId: injury.injuryId, route: 'treatment', success: true, providerId: 'demo:medtech' });
  }
  if (action === 'rest') runHealthParCommand('set_resting', { resting: true });
  if (action === 'day') runHealthParCommand('advance_time', { unit: 'day', amount: 1 });
  if (action === 'reset') { publishSnapshot(client.reset()); showToast('Patient reset'); }
}));

window.addEventListener('medscan:healthpar-command', (event) => {
  const { type, payload = {}, overrides = {} } = event.detail ?? {};
  try {
    const result = client.command(type, payload, overrides);
    publishSnapshot(result.snapshot);
  } catch (error) {
    window.dispatchEvent(new CustomEvent('medscan:healthpar-error', { detail: { message: error.message, result: error.result ?? null } }));
  }
});

window.MedScanBridge = {
  load: loadSnapshot,
  getState: () => structuredClone(state),
  requestDispatch,
  command: runHealthParCommand,
  getEngineState: () => structuredClone(client.state),
  getEvents: () => structuredClone(client.events),
  resetPatient: () => { const snapshot = client.reset(); publishSnapshot(snapshot); return snapshot; },
};

renderAll();
