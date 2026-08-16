import test from 'node:test';
import assert from 'node:assert/strict';
import {
  PROFILE,
  deriveMaximumHitPoints,
  deriveSeriouslyWoundedThreshold,
  deriveDeathSave,
  deriveBaselines,
  deriveEmp,
  derivePsychStatus,
  getDeathSave,
  handleCommand,
  project,
  projectMedicalRecord,
  toMedscanSnapshot,
  migrateLegacyBaselineValues,
} from '../src/medscan-095.js';

let serial = 0;
const at = '2045-08-16T14:03:00Z';

function command(events, type, payload = {}, overrides = {}) {
  const state = project(events);
  serial += 1;
  const cmd = {
    commandId: overrides.commandId ?? `cmd_${serial}`,
    recordId: overrides.recordId ?? 'rec_test',
    characterId: overrides.characterId ?? 'char_test',
    continuityId: overrides.continuityId ?? 'world_test',
    expectedRevision: overrides.expectedRevision ?? state.revision,
    actorId: 'tester',
    issuedAt: overrides.issuedAt ?? at,
    type,
    payload,
  };
  return handleCommand(events, cmd);
}

function accepted(events, type, payload = {}, overrides = {}) {
  const result = command(events, type, payload, overrides);
  assert.equal(result.accepted, true, result.error?.message);
  return { result, events: [...events, ...result.events], state: result.state };
}

function created(payload = {}) {
  return accepted([], 'create_record', payload);
}

function withMortalPatient() {
  let ctx = created({ body: 6, will: 6 });
  ctx = accepted(ctx.events, 'apply_damage', { amount: 40 });
  return ctx;
}

test('01 profile is Medscan Live 0.95', () => {
  assert.equal(PROFILE, 'medscan-live/0.95');
});

test('02 BODY 6 + WILL 6 derives 40 maximum HP', () => {
  assert.equal(deriveMaximumHitPoints(6, 6), 40);
});

test('03 odd BODY/WILL average rounds upward for maximum HP', () => {
  assert.equal(deriveMaximumHitPoints(5, 6), 40);
});

test('04 seriously wounded threshold rounds upward', () => {
  assert.equal(deriveSeriouslyWoundedThreshold(35), 18);
});

test('05 death save derives from WILL', () => {
  assert.equal(deriveDeathSave(7), 7);
});

test('06 maximum HP override is independent', () => {
  const b = deriveBaselines({ body: 6, will: 6 }, { maxHitPoints: 50 });
  assert.deepEqual(b, { maxHitPoints: 50, seriouslyWoundedThreshold: 25, deathSave: 6 });
});

test('07 serious threshold override is independent', () => {
  const b = deriveBaselines({ body: 6, will: 6 }, { seriouslyWoundedThreshold: 17 });
  assert.equal(b.maxHitPoints, 40);
  assert.equal(b.seriouslyWoundedThreshold, 17);
  assert.equal(b.deathSave, 6);
});

test('08 death save override is independent', () => {
  const b = deriveBaselines({ body: 6, will: 6 }, { deathSave: 9 });
  assert.equal(b.maxHitPoints, 40);
  assert.equal(b.seriouslyWoundedThreshold, 20);
  assert.equal(b.deathSave, 9);
});

test('09 create record defaults current HP to maximum', () => {
  const { state } = created({ body: 6, will: 6 });
  assert.equal(state.hp.current, 40);
});

test('10 create record clamps current HP to maximum', () => {
  const { state } = created({ body: 6, will: 6, currentHitPoints: 99 });
  assert.equal(state.hp.current, 40);
});

test('11 lowering maximum HP clamps current HP', () => {
  let ctx = created({ body: 6, will: 6 });
  ctx = accepted(ctx.events, 'set_baselines', { maxHitPointsOverride: 30 });
  assert.equal(ctx.state.hp.current, 30);
});

test('12 raising maximum HP does not heal current HP', () => {
  let ctx = created({ body: 6, will: 6, currentHitPoints: 20 });
  ctx = accepted(ctx.events, 'set_baselines', { maxHitPointsOverride: 50 });
  assert.equal(ctx.state.hp.current, 20);
});

test('13 full HP is healthy', () => {
  assert.equal(created().state.woundState, 'healthy');
});

test('14 damage above serious threshold is lightly wounded', () => {
  let ctx = created();
  ctx = accepted(ctx.events, 'apply_damage', { amount: 10 });
  assert.equal(ctx.state.woundState, 'lightly_wounded');
});

test('15 HP at serious threshold is seriously wounded', () => {
  let ctx = created();
  ctx = accepted(ctx.events, 'apply_damage', { amount: 20 });
  assert.equal(ctx.state.woundState, 'seriously_wounded');
});

test('16 zero HP is mortally wounded', () => {
  assert.equal(withMortalPatient().state.woundState, 'mortally_wounded');
});

test('17 mortally wounded state activates death save cycle', () => {
  assert.equal(withMortalPatient().state.deathSave.active, true);
});

test('18 damage while already mortal flags another critical injury', () => {
  let ctx = withMortalPatient();
  ctx = accepted(ctx.events, 'apply_damage', { amount: 1 });
  assert.equal(ctx.state.deathSave.additionalCriticalInjuryRequired, true);
});

test('19 damage while mortal does not invent the critical injury', () => {
  let ctx = withMortalPatient();
  ctx = accepted(ctx.events, 'apply_damage', { amount: 1 });
  assert.equal(ctx.state.criticalInjuries.length, 0);
});

test('20 adding required critical injury clears pending flag', () => {
  let ctx = withMortalPatient();
  ctx = accepted(ctx.events, 'apply_damage', { amount: 1 });
  ctx = accepted(ctx.events, 'add_critical_injury', { injuryId: 'inj_1', label: 'Test injury', deathSaveModifier: -1 });
  assert.equal(ctx.state.deathSave.additionalCriticalInjuryRequired, false);
});

test('21 critical injury contributes death save modifier', () => {
  let ctx = withMortalPatient();
  ctx = accepted(ctx.events, 'add_critical_injury', { injuryId: 'inj_1', label: 'Test injury', deathSaveModifier: -1 });
  assert.equal(getDeathSave(ctx.state).target, 5);
});

test('22 active timed effect contributes death save modifier', () => {
  let ctx = withMortalPatient();
  ctx = accepted(ctx.events, 'add_timed_effect', { effectId: 'fx_1', durationSeconds: 60, modifiers: { deathSave: -2 } });
  assert.equal(getDeathSave(ctx.state).target, 4);
});

test('23 active addiction contributes death save modifier', () => {
  let ctx = withMortalPatient();
  ctx = accepted(ctx.events, 'record_drug_secondary_check', { success: false, addictionId: 'add_1', deathSaveModifier: -1 });
  assert.equal(getDeathSave(ctx.state).target, 5);
});

test('24 operational cyberware contributes live death save modifier', () => {
  let ctx = withMortalPatient();
  ctx = accepted(ctx.events, 'install_cyberware', { cyberwareId: 'cy_1', humanityLoss: 0, deathSaveModifier: 1 });
  assert.equal(getDeathSave(ctx.state).target, 7);
});

test('25 non-operational cyberware stops contributing death save modifier', () => {
  let ctx = withMortalPatient();
  ctx = accepted(ctx.events, 'install_cyberware', { cyberwareId: 'cy_1', humanityLoss: 0, deathSaveModifier: 1 });
  ctx = accepted(ctx.events, 'set_cyberware_state', { cyberwareId: 'cy_1', state: 'disabled' });
  assert.equal(getDeathSave(ctx.state).target, 6);
});

test('26 death save succeeds only when physical d10 is under target', () => {
  let ctx = withMortalPatient();
  ctx = accepted(ctx.events, 'roll_death_save', { roll: 5 });
  assert.equal(ctx.state.deathSave.lastOutcome, 'passed');
});

test('27 death save equal to target fails', () => {
  let ctx = withMortalPatient();
  ctx = accepted(ctx.events, 'roll_death_save', { roll: 6 });
  assert.equal(ctx.state.consciousness, 'dead');
});

test('28 successful death save advances cumulative penalty', () => {
  let ctx = withMortalPatient();
  ctx = accepted(ctx.events, 'roll_death_save', { roll: 5 });
  assert.equal(ctx.state.deathSave.cumulativePenalty, 1);
  assert.equal(getDeathSave(ctx.state).target, 5);
});

test('29 failed death save produces no-vital-response/dead state', () => {
  let ctx = withMortalPatient();
  ctx = accepted(ctx.events, 'roll_death_save', { roll: 10 });
  assert.equal(ctx.state.woundState, 'dead');
});

test('30 successful stabilization returns mortal patient to 1 HP', () => {
  let ctx = withMortalPatient();
  ctx = accepted(ctx.events, 'attempt_stabilisation', { success: true, providerId: 'med_1' });
  assert.equal(ctx.state.hp.current, 1);
});

test('31 successful stabilization clears active death save cycle', () => {
  let ctx = withMortalPatient();
  ctx = accepted(ctx.events, 'attempt_stabilisation', { success: true });
  assert.equal(ctx.state.deathSave.active, false);
});

test('32 stabilization preserves critical injuries', () => {
  let ctx = withMortalPatient();
  ctx = accepted(ctx.events, 'add_critical_injury', { injuryId: 'inj_1', label: 'Test injury' });
  ctx = accepted(ctx.events, 'attempt_stabilisation', { success: true });
  assert.equal(ctx.state.criticalInjuries.length, 1);
});

test('33 failed stabilization is history-only', () => {
  let ctx = withMortalPatient();
  ctx = accepted(ctx.events, 'attempt_stabilisation', { success: false, checkTotal: 10, dv: 15 });
  assert.equal(ctx.state.hp.current, 0);
  assert.equal(ctx.state.care.length, 1);
});

test('34 recovery rest requires stabilization', () => {
  const ctx = created({ currentHitPoints: 20 });
  const result = command(ctx.events, 'set_resting', { resting: true });
  assert.equal(result.accepted, false);
});

test('35 stabilized resting patient heals BODY HP after complete day', () => {
  let ctx = withMortalPatient();
  ctx = accepted(ctx.events, 'attempt_stabilisation', { success: true });
  ctx = accepted(ctx.events, 'set_resting', { resting: true });
  ctx = accepted(ctx.events, 'advance_time', { unit: 'day', amount: 1 });
  assert.equal(ctx.state.hp.current, 7);
});

test('36 recovery never exceeds maximum HP', () => {
  let ctx = created({ currentHitPoints: 39 });
  ctx = accepted(ctx.events, 'apply_damage', { amount: 39 });
  ctx = accepted(ctx.events, 'attempt_stabilisation', { success: true });
  ctx = accepted(ctx.events, 'set_resting', { resting: true });
  ctx = accepted(ctx.events, 'advance_time', { unit: 'day', amount: 20 });
  assert.equal(ctx.state.hp.current, 40);
});

test('37 incomplete day does not trigger ordinary recovery', () => {
  let ctx = withMortalPatient();
  ctx = accepted(ctx.events, 'attempt_stabilisation', { success: true });
  ctx = accepted(ctx.events, 'set_resting', { resting: true });
  ctx = accepted(ctx.events, 'advance_time', { unit: 'hour', amount: 23 });
  assert.equal(ctx.state.hp.current, 1);
});

test('38 cryotech suspends ordinary recovery', () => {
  let ctx = withMortalPatient();
  ctx = accepted(ctx.events, 'attempt_stabilisation', { success: true });
  ctx = accepted(ctx.events, 'set_resting', { resting: true });
  ctx = accepted(ctx.events, 'set_cryotech', { mode: 'cryotank', providerId: 'med_1' });
  ctx = accepted(ctx.events, 'advance_time', { unit: 'day', amount: 1 });
  assert.equal(ctx.state.hp.current, 1);
});

test('39 damage interrupts recovery and removes stabilization', () => {
  let ctx = withMortalPatient();
  ctx = accepted(ctx.events, 'attempt_stabilisation', { success: true });
  ctx = accepted(ctx.events, 'set_resting', { resting: true });
  ctx = accepted(ctx.events, 'apply_damage', { amount: 1 });
  assert.equal(ctx.state.recovery.resting, false);
  assert.equal(ctx.state.stabilised, false);
});

test('40 medical clock can be put into live mode', () => {
  let ctx = created();
  ctx = accepted(ctx.events, 'set_clock_mode', { mode: 'live' });
  assert.equal(ctx.state.clockMode, 'live');
});

test('41 one combat round advances medical clock by 3 seconds', () => {
  let ctx = created();
  ctx = accepted(ctx.events, 'advance_time', { unit: 'round', amount: 1 });
  assert.equal(ctx.state.medicalTimeSeconds, 3);
});

test('42 timed effect expires against game medical time', () => {
  let ctx = created();
  ctx = accepted(ctx.events, 'add_timed_effect', { effectId: 'fx_1', durationSeconds: 60 });
  ctx = accepted(ctx.events, 'advance_time', { unit: 'minute', amount: 1 });
  assert.equal(ctx.state.timedEffects[0].active, false);
});

test('43 expired timed effect remains visible until acknowledged', () => {
  let ctx = created();
  ctx = accepted(ctx.events, 'add_timed_effect', { effectId: 'fx_1', durationSeconds: 60 });
  ctx = accepted(ctx.events, 'advance_time', { unit: 'minute', amount: 1 });
  assert.equal(ctx.state.timedEffects.length, 1);
  assert.equal(ctx.state.timedEffects[0].acknowledged, false);
});

test('44 timed effect can be acknowledged after expiry', () => {
  let ctx = created();
  ctx = accepted(ctx.events, 'add_timed_effect', { effectId: 'fx_1', durationSeconds: 60 });
  ctx = accepted(ctx.events, 'advance_time', { unit: 'minute', amount: 1 });
  ctx = accepted(ctx.events, 'acknowledge_timed_effect', { effectId: 'fx_1' });
  assert.equal(ctx.state.timedEffects[0].acknowledged, true);
});

test('45 expired effect immediately stops modifying death saves', () => {
  let ctx = withMortalPatient();
  ctx = accepted(ctx.events, 'add_timed_effect', { effectId: 'fx_1', durationSeconds: 60, modifiers: { deathSave: -2 } });
  ctx = accepted(ctx.events, 'advance_time', { unit: 'minute', amount: 1 });
  assert.equal(getDeathSave(ctx.state).target, 6);
});

test('46 failed known-drug secondary check creates persistent addiction', () => {
  let ctx = created();
  ctx = accepted(ctx.events, 'record_drug_secondary_check', { success: false, addictionId: 'add_1', label: 'Test addiction' });
  assert.equal(ctx.state.addictions[0].state, 'active');
});

test('47 repeated failed secondary check worsens addiction severity', () => {
  let ctx = created();
  ctx = accepted(ctx.events, 'record_drug_secondary_check', { success: false, addictionId: 'add_1' });
  ctx = accepted(ctx.events, 'record_drug_secondary_check', { success: false, addictionId: 'add_1' });
  assert.equal(ctx.state.addictions[0].severity, 2);
});

test('48 successful secondary check does not create addiction', () => {
  let ctx = created();
  ctx = accepted(ctx.events, 'record_drug_secondary_check', { success: true, addictionId: 'add_1' });
  assert.equal(ctx.state.addictions.length, 0);
});

test('49 therapy success restores entered Humanity capped at max', () => {
  let ctx = created({ humanityCurrent: 30, humanityBaseMax: 60 });
  ctx = accepted(ctx.events, 'therapy', { success: true, humanityRestored: 40 });
  assert.equal(ctx.state.humanity.current, 60);
});

test('50 failed therapy does not restore Humanity', () => {
  let ctx = created({ humanityCurrent: 30, humanityBaseMax: 60 });
  ctx = accepted(ctx.events, 'therapy', { success: false, humanityRestored: 20 });
  assert.equal(ctx.state.humanity.current, 30);
});

test('51 addiction only resolves through successful therapy command', () => {
  let ctx = created();
  ctx = accepted(ctx.events, 'record_drug_secondary_check', { success: false, addictionId: 'add_1' });
  ctx = accepted(ctx.events, 'therapy', { kind: 'addiction', success: true, addictionId: 'add_1' });
  assert.equal(ctx.state.addictions[0].state, 'resolved');
});

test('52 standard cyberware lowers Humanity ceiling by 2', () => {
  let ctx = created({ humanityCurrent: 60, humanityBaseMax: 60 });
  ctx = accepted(ctx.events, 'install_cyberware', { cyberwareId: 'cy_1', humanityLoss: 0 });
  assert.equal(ctx.state.humanity.max, 58);
});

test('53 Borgware lowers Humanity ceiling by 4', () => {
  let ctx = created({ humanityCurrent: 60, humanityBaseMax: 60 });
  ctx = accepted(ctx.events, 'install_cyberware', { cyberwareId: 'cy_1', borgware: true, humanityLoss: 0 });
  assert.equal(ctx.state.humanity.max, 56);
});

test('54 cyberware installation records actual Humanity loss', () => {
  let ctx = created({ humanityCurrent: 60, humanityBaseMax: 60 });
  ctx = accepted(ctx.events, 'install_cyberware', { cyberwareId: 'cy_1', humanityLoss: 7 });
  assert.equal(ctx.state.humanity.current, 53);
});

test('55 removal restores ceiling only, not current Humanity', () => {
  let ctx = created({ humanityCurrent: 60, humanityBaseMax: 60 });
  ctx = accepted(ctx.events, 'install_cyberware', { cyberwareId: 'cy_1', humanityLoss: 7 });
  ctx = accepted(ctx.events, 'remove_cyberware', { cyberwareId: 'cy_1' });
  assert.equal(ctx.state.humanity.max, 60);
  assert.equal(ctx.state.humanity.current, 53);
});

test('56 reinstall can explicitly record zero Humanity loss', () => {
  let ctx = created({ humanityCurrent: 60, humanityBaseMax: 60 });
  ctx = accepted(ctx.events, 'install_cyberware', { cyberwareId: 'cy_1', humanityLoss: 5 });
  ctx = accepted(ctx.events, 'remove_cyberware', { cyberwareId: 'cy_1' });
  const before = ctx.state.humanity.current;
  ctx = accepted(ctx.events, 'install_cyberware', { cyberwareId: 'cy_1', humanityLoss: 0 });
  assert.equal(ctx.state.humanity.current, before);
  assert.equal(ctx.state.humanity.max, 58);
});

test('57 linked cyberlimb trauma can mark an implant damaged', () => {
  let ctx = created();
  ctx = accepted(ctx.events, 'install_cyberware', { cyberwareId: 'arm_l', bodyRegion: 'left_arm', humanityLoss: 0 });
  ctx = accepted(ctx.events, 'add_critical_injury', { injuryId: 'inj_1', linkedCyberwareId: 'arm_l', cyberlimbTrauma: 'damaged' });
  assert.equal(ctx.state.cyberware[0].state, 'damaged');
});

test('58 linked dismemberment can mark cyberlimb severed', () => {
  let ctx = created();
  ctx = accepted(ctx.events, 'install_cyberware', { cyberwareId: 'arm_l', humanityLoss: 0 });
  ctx = accepted(ctx.events, 'add_critical_injury', { injuryId: 'inj_1', linkedCyberwareId: 'arm_l', cyberlimbTrauma: 'severed' });
  assert.equal(ctx.state.cyberware[0].state, 'severed');
});

test('59 successful linked cyberlimb treatment routes Care through Cybertech', () => {
  let ctx = created();
  ctx = accepted(ctx.events, 'install_cyberware', { cyberwareId: 'arm_l', humanityLoss: 0 });
  ctx = accepted(ctx.events, 'add_critical_injury', { injuryId: 'inj_1', linkedCyberwareId: 'arm_l', cyberlimbTrauma: 'damaged' });
  ctx = accepted(ctx.events, 'attempt_treatment', { injuryId: 'inj_1', route: 'treatment', success: true, method: 'First Aid' });
  assert.equal(ctx.state.care.at(-1).method, 'Cybertech');
  assert.equal(ctx.state.cyberware[0].state, 'operational');
});

test('60 failed injury treatment remains history-only', () => {
  let ctx = created();
  ctx = accepted(ctx.events, 'add_critical_injury', { injuryId: 'inj_1', state: 'untreated' });
  ctx = accepted(ctx.events, 'attempt_treatment', { injuryId: 'inj_1', route: 'treatment', success: false });
  assert.equal(ctx.state.criticalInjuries[0].state, 'untreated');
  assert.equal(ctx.state.care.length, 1);
});

test('61 successful Quick Fix moves injury to quick_fixed when temporary', () => {
  let ctx = created();
  ctx = accepted(ctx.events, 'add_critical_injury', { injuryId: 'inj_1', quickFixPermanentlyResolves: false });
  ctx = accepted(ctx.events, 'attempt_treatment', { injuryId: 'inj_1', route: 'quick_fix', success: true });
  assert.equal(ctx.state.criticalInjuries[0].state, 'quick_fixed');
});

test('62 permanent Quick Fix can move injury directly to treated', () => {
  let ctx = created();
  ctx = accepted(ctx.events, 'add_critical_injury', { injuryId: 'inj_1', quickFixPermanentlyResolves: true });
  ctx = accepted(ctx.events, 'attempt_treatment', { injuryId: 'inj_1', route: 'quick_fix', success: true });
  assert.equal(ctx.state.criticalInjuries[0].state, 'treated');
});

test('63 pharmaceutical administration stores provider/route/qualification/result', () => {
  let ctx = created();
  ctx = accepted(ctx.events, 'administer_pharmaceutical', {
    pharmaceuticalRef: 'pharm:test', providerId: 'med_1', route: 'injector', qualificationConfirmed: true, resolvedResult: 'success',
  });
  assert.deepEqual(
    { providerId: ctx.state.pharmaceuticals[0].providerId, route: ctx.state.pharmaceuticals[0].route, qualificationConfirmed: ctx.state.pharmaceuticals[0].qualificationConfirmed, resolvedResult: ctx.state.pharmaceuticals[0].resolvedResult },
    { providerId: 'med_1', route: 'injector', qualificationConfirmed: true, resolvedResult: 'success' },
  );
});

test('64 pharmaceutical can record actual HP recovered and caps at max', () => {
  let ctx = created({ currentHitPoints: 35 });
  ctx = accepted(ctx.events, 'administer_pharmaceutical', { pharmaceuticalRef: 'pharm:heal', hitPointsRecovered: 20 });
  assert.equal(ctx.state.hp.current, 40);
});

test('65 pharmaceutical can create a timed effect', () => {
  let ctx = created();
  ctx = accepted(ctx.events, 'administer_pharmaceutical', {
    pharmaceuticalRef: 'pharm:sedative', timedEffect: { effectId: 'sed_1', durationUnit: 'minute', durationAmount: 10 },
  });
  assert.equal(ctx.state.timedEffects[0].effectId, 'sed_1');
});

test('66 Cryotech state records Cryopump/Cryotank without auto death-save adjudication', () => {
  let ctx = withMortalPatient();
  ctx = accepted(ctx.events, 'set_cryotech', { mode: 'cryopump', providerId: 'med_1', equipmentRef: 'gear:pump' });
  assert.equal(ctx.state.cryotech.mode, 'cryopump');
  assert.equal(ctx.state.consciousness, 'conscious');
});

test('67 EMP 1 is borderline cyberpsychosis and EMP 0 is critical psych state', () => {
  assert.deepEqual(derivePsychStatus(19), { emp: 1, status: 'borderline_cyberpsychosis' });
  assert.deepEqual(derivePsychStatus(9), { emp: 0, status: 'critical_psych_state' });
  assert.equal(deriveEmp(30), 3);
});

test('68 projector is idempotent by eventId and command layer rejects stale revision', () => {
  const ctx = created();
  const duplicate = [...ctx.events, ctx.events[0]];
  assert.equal(project(duplicate).revision, 1);
  const stale = command(ctx.events, 'apply_damage', { amount: 1 }, { expectedRevision: 0 });
  assert.equal(stale.accepted, false);
  assert.equal(stale.error.code, 'revision_conflict');
});

test('69 projections expose canonical MedicalRecord, Medscan snapshot, and conservative legacy overrides', () => {
  const ctx = created({ body: 6, will: 6, currentHitPoints: 24 });
  const record = projectMedicalRecord(ctx.state);
  const snapshot = toMedscanSnapshot(ctx.state);
  const migration = migrateLegacyBaselineValues({ body: 5, will: 7, hp: { current: 23, max: 45, seriouslyWoundedThreshold: 22 }, deathSave: { base: 8 } });
  assert.equal(record.rules.profile, PROFILE);
  assert.equal(snapshot.game.hp.current, 24);
  assert.deepEqual(migration, {
    body: 5,
    will: 7,
    maxHitPointsOverride: 45,
    seriouslyWoundedThresholdOverride: 22,
    deathSaveOverride: 8,
    currentHitPoints: 23,
  });
});
