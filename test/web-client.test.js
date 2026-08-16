import test from 'node:test';
import assert from 'node:assert/strict';
import { BrowserHealthParClient, mergePresentation } from '../web/healthpar-client.js';
import { project, toMedscanSnapshot } from '../src/medscan-095.js';

function createClient() {
  return new BrowserHealthParClient({ storageKey: `test-${Math.random()}` });
}

test('browser client creates a real 0.95 patient and returns the existing Medscan snapshot shape', () => {
  const client = createClient();
  const snapshot = client.ensureDemoPatient();
  assert.equal(snapshot.schemaVersion, 'medscan.snapshot/0.1');
  assert.equal(snapshot.subject.characterId, 'char_demo_001');
  assert.deepEqual(snapshot.game.hp, { current: 24, max: 40 });
  assert.equal(snapshot.game.woundState, 'lightly_wounded');
  assert.equal(snapshot.biomonitor.telemetryMode, 'derived');
});

test('damage command changes canonical HealthPar state before the UI snapshot changes', () => {
  const client = createClient();
  client.ensureDemoPatient();
  const result = client.command('apply_damage', { amount: 5 }, { issuedAt: '2045-08-16T14:03:00Z' });
  assert.equal(result.state.hp.current, 19);
  assert.equal(result.snapshot.game.hp.current, 19);
  assert.equal(result.snapshot.game.woundState, 'seriously_wounded');
  assert.ok(result.snapshot.history.some((entry) => entry.label === 'Trauma · 5 HP'));
});

test('Critical Injuries project into body-map findings without making sensor findings canonical', () => {
  const client = createClient();
  client.ensureDemoPatient();
  const result = client.command('add_critical_injury', {
    injuryId: 'inj_left_thigh',
    definitionId: 'demo:test',
    label: 'Left thigh critical trauma',
    bodyRegion: 'left_thigh',
    deathSaveModifier: -1,
  }, { issuedAt: '2045-08-16T14:04:00Z' });
  const ruleFinding = result.snapshot.bodyMap.findings.find((finding) => finding.ruleRef === 'inj_left_thigh');
  const sensorFinding = result.snapshot.bodyMap.findings.find((finding) => finding.id === 'sensor_head');
  assert.equal(ruleFinding.zone, 'left_thigh');
  assert.equal(ruleFinding.source, 'rules-linked');
  assert.equal(ruleFinding.severity, 'critical');
  assert.equal(sensorFinding.source, 'sensor');
  assert.equal(result.state.criticalInjuries.length, 1);
});

test('presentation merge cannot alter canonical game HP', () => {
  const client = createClient();
  client.ensureDemoPatient();
  const state = project(client.events);
  const canonical = toMedscanSnapshot(state);
  const merged = mergePresentation(canonical, state, client.events, {
    identityRef: 'sinlog:test',
    biomonitor: { status: 'connected', confidence: 50, telemetryMode: 'manual' },
    coverage: { plan: 'Test', status: 'active', dispatchEligible: true },
    location: { provider: 'spaciel', label: 'Test location' },
    telemetry: { heartRate: { value: 999, unit: 'bpm' } },
    sensorFindings: [{ id: 'sensor_fake', zone: 'head', title: 'Display only', severity: 'critical', source: 'sensor', summary: 'Not a rule.' }],
    response: { state: 'idle', timeline: [] },
  });
  assert.equal(merged.telemetry.heartRate.value, 999);
  assert.equal(merged.game.hp.current, 24);
  assert.equal(state.hp.current, 24);
  assert.equal(state.criticalInjuries.length, 0);
});

test('stabilisation and recovery round-trip through browser commands into the Medscan snapshot', () => {
  const client = createClient();
  client.ensureDemoPatient();
  client.command('apply_damage', { amount: 24 }, { issuedAt: '2045-08-16T14:05:00Z' });
  let result = client.command('attempt_stabilisation', { success: true, providerId: 'medtech:test' }, { issuedAt: '2045-08-16T14:06:00Z' });
  assert.equal(result.snapshot.game.hp.current, 1);
  assert.equal(result.snapshot.game.stabilized, true);
  client.command('set_resting', { resting: true }, { issuedAt: '2045-08-16T14:07:00Z' });
  result = client.command('advance_time', { unit: 'day', amount: 1 }, { issuedAt: '2045-08-17T14:07:00Z' });
  assert.equal(result.snapshot.game.hp.current, 7);
  assert.ok(result.snapshot.history.some((entry) => entry.label === 'Recovery'));
});

test('browser reset discards the demo event stream and recreates the baseline patient', () => {
  const client = createClient();
  client.ensureDemoPatient();
  client.command('apply_damage', { amount: 10 });
  const snapshot = client.reset();
  assert.equal(client.events.length, 1);
  assert.equal(snapshot.game.hp.current, 24);
  assert.equal(snapshot.history.length, 1);
});
