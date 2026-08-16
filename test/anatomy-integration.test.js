import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeStructureName, preferredSystemForZone, resolveStructureIndex } from '../web/anatomy-anchors.js';
import { BrowserHealthParClient } from '../web/healthpar-client.js';

function client() {
  return new BrowserHealthParClient({ storageKey: `anatomy-test-${Math.random()}` });
}

test('Z-Anatomy export suffixes do not destabilise semantic structure names', () => {
  assert.equal(normalizeStructureName('Radius.l.003'), 'Radius.l');
  assert.equal(normalizeStructureName('(Thoracic_vertebra_5)'), 'Thoracic vertebra 5');
});

test('left thigh semantic anchor resolves the left femur regardless of object ordering', () => {
  const names = ['Tibia.r', 'Femur.r', 'Patella.l', 'Femur.l', 'Radius.l'];
  assert.equal(resolveStructureIndex(names, 'left_thigh', 'skeletal'), 3);
});

test('right forearm semantic anchor resolves Radius.r before fallback structures', () => {
  const names = ['Ulna.r', 'Radius.r', 'Radius.l'];
  assert.equal(resolveStructureIndex(names, 'right_forearm', 'skeletal'), 1);
});

test('right eye prefers internal anatomy while retaining a skeletal fallback', () => {
  assert.equal(preferredSystemForZone('right_eye'), 'internal');
  assert.equal(resolveStructureIndex(['Heart', 'Eyeball.r', 'Eyeball.l'], 'right_eye', 'internal'), 1);
  assert.equal(resolveStructureIndex(['Frontal bone', 'Zygomatic bone.r'], 'right_eye', 'skeletal'), 1);
});

test('HealthPar Critical Injuries become rules-linked anatomy findings', () => {
  const hp = client();
  hp.ensureDemoPatient();
  const result = hp.command('add_critical_injury', {
    injuryId: 'inj_left_thigh',
    definitionId: 'demo:test',
    label: 'Left thigh critical trauma',
    bodyRegion: 'left_thigh',
  });
  const finding = result.snapshot.bodyMap.findings.find((item) => item.ruleRef === 'inj_left_thigh');
  assert.equal(finding.zone, 'left_thigh');
  assert.equal(finding.source, 'rules-linked');
});

test('canonical cyberware becomes a cyberware anatomy finding rather than a hard-coded marker', () => {
  const hp = client();
  hp.ensureDemoPatient();
  const result = hp.command('install_cyberware', {
    cyberwareId: 'eye_r',
    catalogItemId: 'demo:optical-implant',
    label: 'Right optical implant',
    bodyRegion: 'right_eye',
    humanityLoss: 0,
  });
  const finding = result.snapshot.bodyMap.findings.find((item) => item.cyberwareRef === 'eye_r');
  assert.equal(finding.zone, 'right_eye');
  assert.equal(finding.source, 'cyberware');
  assert.equal(finding.title, 'Right optical implant');
});
