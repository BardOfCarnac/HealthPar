import { handleCommand, project, toMedscanSnapshot } from '../src/medscan-095.js';
import { projectClinicalPresentation } from './clinical-projection.js';

const DEFAULT_PRESENTATION = Object.freeze({
  identityRef: 'sinlog:demo-character',
  biomonitor: { status: 'connected', confidence: 98.2, telemetryMode: 'derived' },
  coverage: { provider: 'Trauma Team International', plan: 'Silver', status: 'active', dispatchEligible: true },
  location: { provider: 'spaciel', ref: 'spaciel:demo-location', label: 'Little Europe · Night City' },
  telemetry: {
    heartRate: { value: 72, unit: 'bpm' },
    bloodPressure: { value: '118/76', unit: 'mmHg' },
    spo2: { value: 98, unit: '%' },
    temperature: { value: 36.7, unit: '°C' },
  },
  sensorFindings: [
    { id: 'sensor_head', zone: 'head', title: 'Head contusion', severity: 'mild', source: 'sensor', summary: 'Superficial impact signature. No gameplay state is created by this sensor finding.' },
    { id: 'sensor_arm', zone: 'right_forearm', title: 'Right forearm abrasion', severity: 'mild', source: 'sensor', summary: 'Surface tissue damage. This remains presentation telemetry unless linked to a rules event.' },
  ],
  response: { state: 'idle', unitId: null, etaSeconds: null, distanceKm: null, timeline: [] },
});

function clone(value) { return structuredClone(value); }
function cap(value) { return String(value ?? '').replace(/_/g, ' ').replace(/\b\w/g, (m) => m.toUpperCase()); }

function eventHistory(events) {
  const visible = new Set([
    'record_created', 'damage_sustained', 'critical_injury_added', 'death_save_rolled',
    'stabilisation_changed', 'care_recorded', 'healing_advanced', 'humanity_changed',
    'therapy_recorded', 'cyberware_installed', 'cyberware_state_changed', 'cyberware_removed',
    'cryotech_changed', 'pharmaceutical_administered', 'addiction_changed',
  ]);
  return events.filter((event) => visible.has(event.type)).slice(-24).reverse().map((event) => {
    const p = event.payload ?? {};
    let label = cap(event.type);
    let outcome = 'Recorded';
    let tone = '';
    if (event.type === 'damage_sustained') { label = `Trauma · ${p.amount ?? 0} HP`; outcome = `${p.toHitPoints ?? '—'} HP`; tone = 'red'; }
    if (event.type === 'critical_injury_added') { label = p.label ?? 'Critical injury'; outcome = 'Critical'; tone = 'red'; }
    if (event.type === 'death_save_rolled') { label = 'Death Save'; outcome = p.success ? 'Passed' : 'Failed'; tone = p.success ? 'yellow' : 'red'; }
    if (event.type === 'stabilisation_changed') { label = 'Stabilisation'; outcome = p.stabilised ? 'Stable' : 'Unstable'; tone = 'yellow'; }
    if (event.type === 'healing_advanced') { label = 'Recovery'; outcome = `+${p.hitPointsRecovered ?? 0} HP`; }
    if (event.type === 'cyberware_installed') { label = p.label ?? 'Cyberware installed'; outcome = 'Installed'; }
    if (event.type === 'cyberware_state_changed') { label = 'Cyberware state'; outcome = cap(p.state); tone = p.state === 'operational' ? '' : 'yellow'; }
    return { at: event.occurredAt, label, outcome, tone, eventId: event.eventId };
  });
}

export function mergePresentation(snapshot, state, events, presentation = DEFAULT_PRESENTATION) {
  const next = clone(snapshot);
  const clinical = projectClinicalPresentation(state, presentation);
  next.subject.identityRef = presentation.identityRef ?? null;
  next.clinical = clinical.clinical;
  next.biomonitor = clinical.biomonitor;
  next.coverage = clone(presentation.coverage);
  next.location = clone(presentation.location);
  next.telemetry = clinical.telemetry;
  next.bodyMap = clinical.bodyMap;
  next.response = clone(presentation.response);
  next.history = eventHistory(events);
  return next;
}

export class BrowserHealthParClient {
  constructor({ storageKey = 'healthpar.medscan.demo.events', presentation = {} } = {}) {
    this.storageKey = storageKey;
    this.presentation = { ...clone(DEFAULT_PRESENTATION), ...clone(presentation) };
    this.events = [];
    this.load();
  }

  load() {
    if (typeof localStorage === 'undefined') return this.events;
    try {
      const raw = localStorage.getItem(this.storageKey);
      this.events = raw ? JSON.parse(raw) : [];
    } catch {
      this.events = [];
    }
    return this.events;
  }

  save() {
    if (typeof localStorage !== 'undefined') localStorage.setItem(this.storageKey, JSON.stringify(this.events));
  }

  get state() { return project(this.events); }

  snapshot() {
    return mergePresentation(toMedscanSnapshot(this.state), this.state, this.events, this.presentation);
  }

  command(type, payload = {}, overrides = {}) {
    const state = this.state;
    const command = {
      commandId: overrides.commandId ?? `web_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      recordId: overrides.recordId ?? state.recordId ?? 'rec_demo_001',
      characterId: overrides.characterId ?? state.characterId ?? 'char_demo_001',
      continuityId: overrides.continuityId ?? state.continuityId ?? 'world_demo_001',
      expectedRevision: state.revision,
      actorId: overrides.actorId ?? 'medscan:web-demo',
      issuedAt: overrides.issuedAt ?? new Date().toISOString(),
      type,
      payload,
    };
    const result = handleCommand(this.events, command);
    if (!result.accepted) throw Object.assign(new Error(result.error?.message ?? result.error?.code ?? 'HealthPar command rejected'), { result });
    this.events.push(...result.events);
    this.save();
    return { ...result, snapshot: mergePresentation(toMedscanSnapshot(result.state), result.state, this.events, this.presentation) };
  }

  ensureDemoPatient() {
    if (this.events.length) return this.snapshot();
    return this.command('create_record', {
      body: 6,
      will: 6,
      currentHitPoints: 24,
      humanityCurrent: 60,
      humanityBaseMax: 60,
    }).snapshot;
  }

  reset() {
    this.events = [];
    this.save();
    return this.ensureDemoPatient();
  }

  setPresentation(patch) {
    this.presentation = { ...this.presentation, ...clone(patch) };
    return this.snapshot();
  }
}

export function createDemoHealthParClient(options) {
  const client = new BrowserHealthParClient(options);
  client.ensureDemoPatient();
  return client;
}
