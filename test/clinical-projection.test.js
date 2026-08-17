import test from 'node:test';
import assert from 'node:assert/strict';
import {
  projectClinicalPresentation,
  projectClinicalState,
  zoneForBodyRegion,
} from '../web/clinical-projection.js';

function state(overrides = {}) {
  return {
    woundState: 'seriously_wounded',
    hp: { current: 15 },
    baselines: { maxHitPoints: 40 },
    stabilised: false,
    consciousness: 'conscious',
    deathSave: { active: false },
    criticalInjuries: [],
    cyberware: [],
    ...overrides,
  };
}

test('generic sided body regions resolve to stable semantic anatomy zones', () => {
  assert.equal(zoneForBodyRegion('arm', 'left'), 'left_arm');
  assert.equal(zoneForBodyRegion('eye', 'right'), 'right_eye');
  assert.equal(zoneForBodyRegion('lung'), 'chest');
  assert.equal(zoneForBodyRegion('unknown_internal_region'), 'torso');
});

test('clinical state mirrors canonical RED state without creating another rules layer', () => {
  const projected = projectClinicalState(state());
  assert.equal(projected.woundState, 'seriously_wounded');
  assert.equal(projected.woundLabel, 'Seriously Wounded');
  assert.equal(projected.hitPoints.current, 15);
  assert.equal(projected.hitPoints.max, 40);
  assert.equal(projected.rulesLinked, true);
  assert.equal(projected.presentationOnly, true);
  assert.equal(projected.policy, 'descriptive_only_no_additional_gameplay_effects');
});

test('Critical Injuries carry semantic anatomy and treatment state into presentation', () => {
  const projected = projectClinicalPresentation(state({
    criticalInjuries: [{
      injuryId: 'inj_leg',
      label: 'Broken leg',
      bodyRegion: 'leg',
      side: 'left',
      state: 'quick_fixed',
    }],
  }));
  const finding = projected.bodyMap.findings[0];
  assert.equal(finding.ruleRef, 'inj_leg');
  assert.equal(finding.zone, 'left_leg');
  assert.equal(finding.anatomy.preferredSystem, 'skeletal');
  assert.equal(finding.treatmentState, 'quick_fixed');
  assert.equal(finding.rulesLinked, true);
  assert.equal(finding.presentationOnly, true);
});

test('cyberware is canonical but its anatomy marker remains presentation-only', () => {
  const projected = projectClinicalPresentation(state({
    cyberware: [{
      cyberwareId: 'eye_r',
      label: 'Right optical implant',
      bodyRegion: 'right_eye',
      state: 'operational',
    }],
  }));
  const finding = projected.bodyMap.findings[0];
  assert.equal(finding.cyberwareRef, 'eye_r');
  assert.equal(finding.zone, 'right_eye');
  assert.equal(finding.anatomy.preferredSystem, 'cyberware');
  assert.equal(finding.rulesLinked, true);
  assert.equal(finding.presentationOnly, true);
});

test('biomonitor telemetry is explicitly barred from changing RED rules state', () => {
  const projected = projectClinicalPresentation(state(), {
    biomonitor: { status: 'connected', confidence: 99, telemetryMode: 'manual' },
    telemetry: { heartRate: { value: 155, unit: 'bpm' } },
    sensorFindings: [{ id: 'sensor_1', zone: 'chest', title: 'Irregular trace', severity: 'moderate' }],
  });
  assert.equal(projected.biomonitor.rulesLinked, false);
  assert.equal(projected.biomonitor.presentationOnly, true);
  assert.equal(projected.biomonitor.policy, 'never_changes_red_rules_state');
  assert.equal(projected.telemetry.heartRate.source, 'manual');
  assert.equal(projected.telemetry.heartRate.rulesLinked, false);
  assert.equal(projected.bodyMap.findings[0].rulesLinked, false);
});
