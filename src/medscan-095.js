export const PROFILE = 'medscan-live/0.95';

const ROUND_SECONDS = 3;
const TIME_SECONDS = Object.freeze({
  round: ROUND_SECONDS,
  minute: 60,
  '10_minutes': 600,
  hour: 3600,
  day: 86400,
});

const CYBERWARE_STATES = new Set(['operational', 'disabled', 'damaged', 'severed', 'removed']);

function clone(value) {
  return structuredClone(value);
}

function assertInteger(name, value, min = Number.MIN_SAFE_INTEGER) {
  if (!Number.isInteger(value) || value < min) {
    throw new Error(`${name} must be an integer >= ${min}`);
  }
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function sum(items) {
  return items.reduce((total, value) => total + value, 0);
}

export function deriveMaximumHitPoints(body, will) {
  assertInteger('BODY', body, 1);
  assertInteger('WILL', will, 1);
  return 10 + (5 * Math.ceil((body + will) / 2));
}

export function deriveSeriouslyWoundedThreshold(maxHitPoints) {
  assertInteger('Maximum HP', maxHitPoints, 1);
  return Math.ceil(maxHitPoints / 2);
}

export function deriveDeathSave(will) {
  assertInteger('WILL', will, 1);
  return will;
}

export function deriveBaselines(stats, overrides = {}) {
  const derivedMax = deriveMaximumHitPoints(stats.body, stats.will);
  const maxHitPoints = overrides.maxHitPoints ?? derivedMax;
  assertInteger('Maximum HP override', maxHitPoints, 1);

  const seriouslyWoundedThreshold = overrides.seriouslyWoundedThreshold
    ?? deriveSeriouslyWoundedThreshold(maxHitPoints);
  assertInteger('Seriously Wounded threshold override', seriouslyWoundedThreshold, 1);

  const deathSave = overrides.deathSave ?? deriveDeathSave(stats.will);
  assertInteger('Death Save override', deathSave, 1);

  return { maxHitPoints, seriouslyWoundedThreshold, deathSave };
}

export function deriveWoundState(state) {
  if (state.consciousness === 'dead') return 'dead';
  if (state.hp.current <= 0) return 'mortally_wounded';
  if (state.hp.current <= state.baselines.seriouslyWoundedThreshold) return 'seriously_wounded';
  if (state.hp.current < state.baselines.maxHitPoints) return 'lightly_wounded';
  return 'healthy';
}

export function deriveEmp(humanityCurrent) {
  return Math.max(0, Math.floor(humanityCurrent / 10));
}

export function derivePsychStatus(humanityCurrent) {
  const emp = deriveEmp(humanityCurrent);
  if (emp === 0) return { emp, status: 'critical_psych_state' };
  if (emp === 1) return { emp, status: 'borderline_cyberpsychosis' };
  return { emp, status: 'within_baseline' };
}

function defaultState() {
  const stats = { body: 6, will: 6 };
  const overrides = { maxHitPoints: null, seriouslyWoundedThreshold: null, deathSave: null };
  const baselines = deriveBaselines(stats, overrides);
  return {
    profile: PROFILE,
    recordId: null,
    characterId: null,
    continuityId: null,
    revision: 0,
    projectedAt: null,
    medicalTimeSeconds: 0,
    clockMode: 'paused',
    stats,
    overrides,
    baselines,
    hp: { current: baselines.maxHitPoints },
    woundState: 'healthy',
    stabilised: false,
    consciousness: 'conscious',
    deathSave: {
      active: false,
      cumulativePenalty: 0,
      lastRoll: null,
      lastOutcome: null,
      additionalCriticalInjuryRequired: false,
    },
    criticalInjuries: [],
    care: [],
    recovery: { resting: false, completeDays: 0 },
    timedEffects: [],
    pharmaceuticals: [],
    addictions: [],
    humanity: { current: 60, baseMax: 60, max: 60 },
    cyberware: [],
    cryotech: { mode: 'none', providerId: null, equipmentRef: null, enteredAt: null },
    therapy: [],
    psych: derivePsychStatus(60),
  };
}

function refreshDerived(state) {
  state.baselines = deriveBaselines(state.stats, state.overrides);
  if (state.hp.current > state.baselines.maxHitPoints) {
    state.hp.current = state.baselines.maxHitPoints;
  }

  const activeCeilingLoss = sum(state.cyberware
    .filter((item) => item.state !== 'removed')
    .map((item) => item.humanityCeilingLoss ?? (item.borgware ? 4 : 2)));
  state.humanity.max = Math.max(0, state.humanity.baseMax - activeCeilingLoss);
  state.humanity.current = clamp(state.humanity.current, 0, state.humanity.max);
  state.psych = derivePsychStatus(state.humanity.current);

  state.woundState = deriveWoundState(state);
  state.deathSave.active = state.woundState === 'mortally_wounded' && state.consciousness !== 'dead';
  if (!state.deathSave.active) {
    state.deathSave.additionalCriticalInjuryRequired = false;
  }
  return state;
}

function activeDeathSaveModifiers(state) {
  const criticalInjury = sum(state.criticalInjuries
    .filter((injury) => injury.state !== 'treated' && injury.state !== 'resolved')
    .map((injury) => injury.deathSaveModifier ?? 0));
  const effects = sum(state.timedEffects
    .filter((effect) => effect.active)
    .map((effect) => effect.modifiers?.deathSave ?? 0));
  const addictions = sum(state.addictions
    .filter((addiction) => addiction.state !== 'resolved')
    .map((addiction) => addiction.deathSaveModifier ?? 0));
  const cyberware = sum(state.cyberware
    .filter((item) => item.state === 'operational')
    .map((item) => item.deathSaveModifier ?? 0));
  return { criticalInjury, effects, addictions, cyberware };
}

export function getDeathSave(state) {
  const modifiers = activeDeathSaveModifiers(state);
  const modifierTotal = sum(Object.values(modifiers));
  const target = state.baselines.deathSave + modifierTotal - state.deathSave.cumulativePenalty;
  return {
    active: state.deathSave.active,
    base: state.baselines.deathSave,
    modifiers,
    modifierTotal,
    cumulativePenalty: state.deathSave.cumulativePenalty,
    target,
    lastRoll: state.deathSave.lastRoll,
    lastOutcome: state.deathSave.lastOutcome,
    additionalCriticalInjuryRequired: state.deathSave.additionalCriticalInjuryRequired,
  };
}

function makeEvent(command, index, type, payload) {
  return {
    eventId: `${command.commandId}:${index + 1}`,
    recordId: command.recordId,
    characterId: command.characterId,
    continuityId: command.continuityId,
    occurredAt: command.issuedAt,
    recordedAt: command.issuedAt,
    actorId: command.actorId ?? null,
    source: 'rules_engine',
    type,
    correlationId: command.commandId,
    payload,
  };
}

function requireCreated(state) {
  if (!state.recordId) throw new Error('record_not_created');
}

function requirePayload(command) {
  return command.payload ?? {};
}

function eventSpecsForCommand(state, command) {
  const payload = requirePayload(command);
  const specs = [];
  const emit = (type, data) => specs.push({ type, payload: data });

  switch (command.type) {
    case 'create_record': {
      if (state.recordId) throw new Error('record_already_created');
      const stats = { body: payload.body ?? 6, will: payload.will ?? 6 };
      const overrides = {
        maxHitPoints: payload.maxHitPointsOverride ?? null,
        seriouslyWoundedThreshold: payload.seriouslyWoundedThresholdOverride ?? null,
        deathSave: payload.deathSaveOverride ?? null,
      };
      const baselines = deriveBaselines(stats, overrides);
      const currentHitPoints = payload.currentHitPoints ?? baselines.maxHitPoints;
      emit('record_created', {
        stats,
        overrides,
        currentHitPoints: Math.min(currentHitPoints, baselines.maxHitPoints),
        humanity: {
          current: payload.humanityCurrent ?? 60,
          baseMax: payload.humanityBaseMax ?? payload.humanityCurrent ?? 60,
        },
      });
      break;
    }
    case 'set_baselines': {
      requireCreated(state);
      const stats = {
        body: payload.body ?? state.stats.body,
        will: payload.will ?? state.stats.will,
      };
      const overrides = {
        maxHitPoints: Object.hasOwn(payload, 'maxHitPointsOverride') ? payload.maxHitPointsOverride : state.overrides.maxHitPoints,
        seriouslyWoundedThreshold: Object.hasOwn(payload, 'seriouslyWoundedThresholdOverride') ? payload.seriouslyWoundedThresholdOverride : state.overrides.seriouslyWoundedThreshold,
        deathSave: Object.hasOwn(payload, 'deathSaveOverride') ? payload.deathSaveOverride : state.overrides.deathSave,
      };
      const next = deriveBaselines(stats, overrides);
      emit('baselines_changed', { stats, overrides, baselines: next });
      break;
    }
    case 'apply_damage': {
      requireCreated(state);
      assertInteger('damage', payload.amount, 0);
      const wasMortallyWounded = state.woundState === 'mortally_wounded';
      emit('damage_sustained', {
        amount: payload.amount,
        fromHitPoints: state.hp.current,
        toHitPoints: state.hp.current - payload.amount,
        whileMortallyWounded: wasMortallyWounded,
      });
      if (state.recovery.resting || state.stabilised) {
        emit('recovery_interrupted', { reason: 'damage' });
      }
      if (wasMortallyWounded && payload.amount > 0) {
        emit('additional_critical_injury_required', { reason: 'damage_while_mortally_wounded' });
      }
      break;
    }
    case 'add_critical_injury': {
      requireCreated(state);
      const injury = {
        injuryId: payload.injuryId,
        definitionId: payload.definitionId ?? null,
        label: payload.label ?? payload.definitionId ?? 'Critical injury',
        table: payload.table ?? 'body',
        roll: payload.roll ?? null,
        bodyRegion: payload.bodyRegion ?? null,
        side: payload.side ?? null,
        state: payload.state ?? 'untreated',
        deathSaveModifier: payload.deathSaveModifier ?? 0,
        quickFix: payload.quickFix ?? null,
        treatment: payload.treatment ?? null,
        quickFixPermanentlyResolves: payload.quickFixPermanentlyResolves ?? false,
        linkedCyberwareId: payload.linkedCyberwareId ?? null,
        cyberlimbTrauma: payload.cyberlimbTrauma ?? null,
      };
      if (!injury.injuryId) throw new Error('injuryId_required');
      emit('critical_injury_added', injury);
      if (injury.linkedCyberwareId && injury.cyberlimbTrauma) {
        const desiredState = injury.cyberlimbTrauma === 'severed' ? 'severed' : 'damaged';
        emit('cyberware_state_changed', { cyberwareId: injury.linkedCyberwareId, state: desiredState, reason: 'linked_critical_injury' });
      }
      break;
    }
    case 'roll_death_save': {
      requireCreated(state);
      if (!state.deathSave.active) throw new Error('death_save_not_active');
      assertInteger('d10 result', payload.roll, 1);
      if (payload.roll > 10) throw new Error('d10 result must be <= 10');
      const deathSave = getDeathSave(state);
      const success = payload.roll < deathSave.target;
      emit('death_save_rolled', {
        roll: payload.roll,
        target: deathSave.target,
        success,
        nextCumulativePenalty: success ? state.deathSave.cumulativePenalty + 1 : state.deathSave.cumulativePenalty,
      });
      if (!success) emit('consciousness_changed', { consciousness: 'dead', reason: 'death_save_failed' });
      break;
    }
    case 'attempt_stabilisation': {
      requireCreated(state);
      if (state.hp.current > 0) throw new Error('stabilisation_not_required');
      emit('care_recorded', {
        careId: payload.careId ?? `${command.commandId}:care`,
        kind: 'stabilisation',
        providerId: payload.providerId ?? null,
        method: payload.method ?? null,
        checkTotal: payload.checkTotal ?? null,
        dv: payload.dv ?? null,
        success: Boolean(payload.success),
        targetInjuryId: null,
        notes: payload.notes ?? null,
      });
      if (payload.success) {
        emit('stabilisation_changed', { stabilised: true, hitPoints: 1 });
        emit('recovery_state_changed', { resting: false, completeDays: 0 });
      }
      break;
    }
    case 'set_resting': {
      requireCreated(state);
      if (payload.resting && !state.stabilised) throw new Error('recovery_requires_stabilisation');
      emit('recovery_state_changed', {
        resting: Boolean(payload.resting),
        completeDays: state.recovery.completeDays,
      });
      break;
    }
    case 'set_clock_mode': {
      requireCreated(state);
      const mode = payload.mode;
      if (!['paused', 'live'].includes(mode)) throw new Error('invalid_clock_mode');
      emit('clock_mode_changed', { mode });
      break;
    }
    case 'advance_time': {
      requireCreated(state);
      const unit = payload.unit ?? 'round';
      const multiplier = TIME_SECONDS[unit];
      if (!multiplier) throw new Error('unsupported_time_unit');
      const amount = payload.amount ?? 1;
      assertInteger('time amount', amount, 1);
      const seconds = multiplier * amount;
      emit('medical_time_advanced', { seconds, unit, amount });

      const nextClock = state.medicalTimeSeconds + seconds;
      for (const effect of state.timedEffects) {
        if (effect.active && effect.expiresAtSeconds != null && effect.expiresAtSeconds <= nextClock) {
          emit('timed_effect_expired', { effectId: effect.effectId });
        }
      }

      const completeDays = Math.floor(seconds / TIME_SECONDS.day);
      if (completeDays > 0 && state.recovery.resting && state.stabilised && state.cryotech.mode === 'none') {
        const healed = Math.min(
          state.baselines.maxHitPoints - state.hp.current,
          state.stats.body * completeDays,
        );
        if (healed > 0) {
          emit('healing_advanced', {
            completeDays,
            hitPointsRecovered: healed,
            fromHitPoints: state.hp.current,
            toHitPoints: state.hp.current + healed,
          });
        }
      }
      break;
    }
    case 'add_timed_effect': {
      requireCreated(state);
      const durationSeconds = payload.durationSeconds
        ?? ((TIME_SECONDS[payload.durationUnit] ?? 1) * (payload.durationAmount ?? 0));
      assertInteger('durationSeconds', durationSeconds, 1);
      emit('timed_effect_added', {
        effectId: payload.effectId,
        label: payload.label ?? payload.effectId,
        startsAtSeconds: state.medicalTimeSeconds,
        expiresAtSeconds: state.medicalTimeSeconds + durationSeconds,
        active: true,
        acknowledged: false,
        modifiers: payload.modifiers ?? {},
        sourceRef: payload.sourceRef ?? null,
      });
      break;
    }
    case 'acknowledge_timed_effect': {
      requireCreated(state);
      emit('timed_effect_acknowledged', { effectId: payload.effectId });
      break;
    }
    case 'record_drug_secondary_check': {
      requireCreated(state);
      emit('drug_secondary_check_recorded', {
        drugRef: payload.drugRef ?? null,
        success: Boolean(payload.success),
        addictionId: payload.addictionId ?? null,
      });
      if (!payload.success && payload.addictionId) {
        const existing = state.addictions.find((item) => item.addictionId === payload.addictionId);
        emit('addiction_changed', {
          addictionId: payload.addictionId,
          label: payload.label ?? existing?.label ?? payload.addictionId,
          state: 'active',
          severity: (existing?.severity ?? 0) + 1,
          deathSaveModifier: payload.deathSaveModifier ?? existing?.deathSaveModifier ?? 0,
        });
      }
      break;
    }
    case 'administer_pharmaceutical': {
      requireCreated(state);
      emit('pharmaceutical_administered', {
        administrationId: payload.administrationId ?? `${command.commandId}:administration`,
        pharmaceuticalRef: payload.pharmaceuticalRef,
        providerId: payload.providerId ?? null,
        route: payload.route ?? null,
        qualificationConfirmed: Boolean(payload.qualificationConfirmed),
        notes: payload.notes ?? null,
        resolvedResult: payload.resolvedResult ?? null,
      });
      if (payload.hitPointsRecovered != null) {
        assertInteger('hitPointsRecovered', payload.hitPointsRecovered, 0);
        const recovered = Math.min(payload.hitPointsRecovered, state.baselines.maxHitPoints - state.hp.current);
        if (recovered > 0) {
          emit('hit_points_restored', {
            amount: recovered,
            reason: 'pharmaceutical',
            sourceRef: payload.pharmaceuticalRef,
          });
        }
      }
      if (payload.timedEffect) {
        const effect = payload.timedEffect;
        const durationSeconds = effect.durationSeconds
          ?? ((TIME_SECONDS[effect.durationUnit] ?? 1) * (effect.durationAmount ?? 0));
        assertInteger('timed effect duration', durationSeconds, 1);
        emit('timed_effect_added', {
          effectId: effect.effectId ?? `${command.commandId}:effect`,
          label: effect.label ?? payload.pharmaceuticalRef ?? 'Pharmaceutical effect',
          startsAtSeconds: state.medicalTimeSeconds,
          expiresAtSeconds: state.medicalTimeSeconds + durationSeconds,
          active: true,
          acknowledged: false,
          modifiers: effect.modifiers ?? {},
          sourceRef: payload.pharmaceuticalRef ?? null,
        });
      }
      break;
    }
    case 'apply_humanity_loss': {
      requireCreated(state);
      assertInteger('Humanity loss', payload.amount, 0);
      emit('humanity_changed', { delta: -payload.amount, reason: payload.reason ?? 'explicit_loss' });
      break;
    }
    case 'therapy': {
      requireCreated(state);
      emit('therapy_recorded', {
        therapyId: payload.therapyId ?? `${command.commandId}:therapy`,
        kind: payload.kind ?? 'standard_humanity',
        providerId: payload.providerId ?? null,
        downtime: payload.downtime ?? null,
        success: Boolean(payload.success),
        humanityRestored: payload.humanityRestored ?? 0,
        addictionId: payload.addictionId ?? null,
        notes: payload.notes ?? null,
      });
      if (payload.success && (payload.humanityRestored ?? 0) > 0) {
        emit('humanity_changed', { delta: payload.humanityRestored, reason: 'therapy' });
      }
      if (payload.success && payload.addictionId) {
        const existing = state.addictions.find((item) => item.addictionId === payload.addictionId);
        emit('addiction_changed', {
          addictionId: payload.addictionId,
          label: existing?.label ?? payload.addictionId,
          state: 'resolved',
          severity: existing?.severity ?? 0,
          deathSaveModifier: existing?.deathSaveModifier ?? 0,
        });
      }
      break;
    }
    case 'install_cyberware': {
      requireCreated(state);
      const item = {
        cyberwareId: payload.cyberwareId,
        catalogItemId: payload.catalogItemId ?? null,
        label: payload.label ?? payload.cyberwareId,
        bodyRegion: payload.bodyRegion ?? null,
        borgware: Boolean(payload.borgware),
        humanityCeilingLoss: payload.humanityCeilingLoss ?? (payload.borgware ? 4 : 2),
        humanityLoss: payload.humanityLoss ?? 0,
        deathSaveModifier: payload.deathSaveModifier ?? 0,
        state: 'operational',
      };
      if (!item.cyberwareId) throw new Error('cyberwareId_required');
      emit('cyberware_installed', item);
      break;
    }
    case 'set_cyberware_state': {
      requireCreated(state);
      if (!CYBERWARE_STATES.has(payload.state)) throw new Error('invalid_cyberware_state');
      emit('cyberware_state_changed', { cyberwareId: payload.cyberwareId, state: payload.state, reason: payload.reason ?? null });
      break;
    }
    case 'remove_cyberware': {
      requireCreated(state);
      emit('cyberware_removed', { cyberwareId: payload.cyberwareId });
      break;
    }
    case 'attempt_treatment': {
      requireCreated(state);
      const injury = state.criticalInjuries.find((item) => item.injuryId === payload.injuryId);
      if (!injury) throw new Error('critical_injury_not_found');
      const route = payload.route ?? 'treatment';
      const expectedMethod = route === 'quick_fix' ? injury.quickFix?.method : injury.treatment?.method;
      const linkedCyberware = injury.linkedCyberwareId
        ? state.cyberware.find((item) => item.cyberwareId === injury.linkedCyberwareId)
        : null;
      const method = linkedCyberware ? 'Cybertech' : (payload.method ?? expectedMethod ?? null);
      emit('care_recorded', {
        careId: payload.careId ?? `${command.commandId}:care`,
        kind: route,
        providerId: payload.providerId ?? null,
        method,
        checkTotal: payload.checkTotal ?? null,
        dv: payload.dv ?? null,
        success: Boolean(payload.success),
        targetInjuryId: injury.injuryId,
        notes: payload.notes ?? null,
      });
      if (payload.success) {
        const nextState = route === 'quick_fix' && !injury.quickFixPermanentlyResolves ? 'quick_fixed' : 'treated';
        emit('critical_injury_state_changed', { injuryId: injury.injuryId, state: nextState });
        if (linkedCyberware && nextState === 'treated') {
          emit('cyberware_state_changed', { cyberwareId: linkedCyberware.cyberwareId, state: 'operational', reason: 'successful_cybertech_repair' });
        }
      }
      break;
    }
    case 'set_cryotech': {
      requireCreated(state);
      const mode = payload.mode ?? 'none';
      if (!['none', 'cryopump', 'cryotank'].includes(mode)) throw new Error('invalid_cryotech_mode');
      emit('cryotech_changed', {
        mode,
        providerId: payload.providerId ?? null,
        equipmentRef: payload.equipmentRef ?? null,
        enteredAt: mode === 'none' ? null : command.issuedAt,
      });
      break;
    }
    default:
      throw new Error(`unsupported_command:${command.type}`);
  }

  return specs;
}

function applyEvent(state, event) {
  const p = event.payload ?? {};
  switch (event.type) {
    case 'record_created': {
      state.recordId = event.recordId;
      state.characterId = event.characterId;
      state.continuityId = event.continuityId;
      state.stats = clone(p.stats);
      state.overrides = clone(p.overrides);
      state.baselines = deriveBaselines(state.stats, state.overrides);
      state.hp.current = Math.min(p.currentHitPoints, state.baselines.maxHitPoints);
      state.humanity.current = p.humanity.current;
      state.humanity.baseMax = p.humanity.baseMax;
      break;
    }
    case 'baselines_changed': {
      state.stats = clone(p.stats);
      state.overrides = clone(p.overrides);
      break;
    }
    case 'damage_sustained':
      state.hp.current = p.toHitPoints;
      state.stabilised = false;
      break;
    case 'additional_critical_injury_required':
      state.deathSave.additionalCriticalInjuryRequired = true;
      break;
    case 'critical_injury_added': {
      if (!state.criticalInjuries.some((item) => item.injuryId === p.injuryId)) {
        state.criticalInjuries.push({ ...clone(p), firstObservedAt: event.occurredAt });
      }
      state.deathSave.additionalCriticalInjuryRequired = false;
      break;
    }
    case 'critical_injury_state_changed': {
      const injury = state.criticalInjuries.find((item) => item.injuryId === p.injuryId);
      if (injury) injury.state = p.state;
      break;
    }
    case 'death_save_rolled':
      state.deathSave.lastRoll = p.roll;
      state.deathSave.lastOutcome = p.success ? 'passed' : 'failed';
      state.deathSave.cumulativePenalty = p.nextCumulativePenalty;
      break;
    case 'consciousness_changed':
      state.consciousness = p.consciousness;
      break;
    case 'care_recorded':
      state.care.push({ ...clone(p), recordedAt: event.occurredAt });
      break;
    case 'stabilisation_changed':
      state.stabilised = p.stabilised;
      if (p.hitPoints != null) state.hp.current = p.hitPoints;
      state.deathSave.cumulativePenalty = 0;
      state.deathSave.lastRoll = null;
      state.deathSave.lastOutcome = null;
      break;
    case 'recovery_interrupted':
      state.recovery.resting = false;
      state.recovery.completeDays = 0;
      state.stabilised = false;
      break;
    case 'recovery_state_changed':
      state.recovery.resting = p.resting;
      state.recovery.completeDays = p.completeDays ?? state.recovery.completeDays;
      break;
    case 'clock_mode_changed':
      state.clockMode = p.mode;
      break;
    case 'medical_time_advanced':
      state.medicalTimeSeconds += p.seconds;
      break;
    case 'healing_advanced':
      state.hp.current = p.toHitPoints;
      state.recovery.completeDays += p.completeDays;
      break;
    case 'timed_effect_added':
      state.timedEffects.push(clone(p));
      break;
    case 'timed_effect_expired': {
      const effect = state.timedEffects.find((item) => item.effectId === p.effectId);
      if (effect) effect.active = false;
      break;
    }
    case 'timed_effect_acknowledged': {
      const effect = state.timedEffects.find((item) => item.effectId === p.effectId);
      if (effect) effect.acknowledged = true;
      break;
    }
    case 'drug_secondary_check_recorded':
      break;
    case 'addiction_changed': {
      const existing = state.addictions.find((item) => item.addictionId === p.addictionId);
      if (existing) Object.assign(existing, clone(p));
      else state.addictions.push(clone(p));
      break;
    }
    case 'pharmaceutical_administered':
      state.pharmaceuticals.push(clone(p));
      break;
    case 'hit_points_restored':
      state.hp.current = Math.min(state.baselines.maxHitPoints, state.hp.current + p.amount);
      break;
    case 'humanity_changed':
      state.humanity.current += p.delta;
      break;
    case 'therapy_recorded':
      state.therapy.push(clone(p));
      break;
    case 'cyberware_installed': {
      const existing = state.cyberware.find((item) => item.cyberwareId === p.cyberwareId);
      if (existing) Object.assign(existing, clone(p));
      else state.cyberware.push({ ...clone(p), installedAt: event.occurredAt });
      state.humanity.current -= p.humanityLoss ?? 0;
      break;
    }
    case 'cyberware_state_changed': {
      const item = state.cyberware.find((cyberware) => cyberware.cyberwareId === p.cyberwareId);
      if (item) item.state = p.state;
      break;
    }
    case 'cyberware_removed': {
      const item = state.cyberware.find((cyberware) => cyberware.cyberwareId === p.cyberwareId);
      if (item) item.state = 'removed';
      break;
    }
    case 'cryotech_changed':
      state.cryotech = clone(p);
      break;
    default:
      throw new Error(`unsupported_event:${event.type}`);
  }
  state.revision += 1;
  state.projectedAt = event.recordedAt;
  return refreshDerived(state);
}

export function project(events = []) {
  const state = defaultState();
  const seen = new Set();
  const ordered = [...events].sort((a, b) => (a.sequence ?? 0) - (b.sequence ?? 0));
  for (const event of ordered) {
    if (seen.has(event.eventId)) continue;
    seen.add(event.eventId);
    applyEvent(state, event);
  }
  return state;
}

export function handleCommand(events, command) {
  if (!command?.commandId) throw new Error('commandId_required');
  if (!command?.recordId) throw new Error('recordId_required');
  if (!command?.characterId) throw new Error('characterId_required');
  if (!command?.continuityId) throw new Error('continuityId_required');
  if (!command?.issuedAt) throw new Error('issuedAt_required');

  const state = project(events);
  if (command.expectedRevision !== state.revision) {
    return {
      accepted: false,
      commandId: command.commandId,
      error: {
        code: 'revision_conflict',
        message: `Record has changed since revision ${command.expectedRevision}.`,
        currentRevision: state.revision,
      },
    };
  }

  let specs;
  try {
    specs = eventSpecsForCommand(state, command);
  } catch (error) {
    return {
      accepted: false,
      commandId: command.commandId,
      error: { code: error.message, message: error.message, currentRevision: state.revision },
    };
  }

  const newEvents = specs.map((spec, index) => ({
    ...makeEvent(command, index, spec.type, spec.payload),
    sequence: state.revision + index + 1,
  }));
  const allEvents = [...events, ...newEvents];
  const next = project(allEvents);
  return {
    accepted: true,
    commandId: command.commandId,
    previousRevision: state.revision,
    revision: next.revision,
    events: newEvents,
    state: next,
    record: projectMedicalRecord(next),
  };
}

export function projectMedicalRecord(state) {
  const deathSave = getDeathSave(state);
  return {
    recordId: state.recordId,
    characterId: state.characterId,
    continuityId: state.continuityId,
    revision: state.revision,
    projectedAt: state.projectedAt,
    status: {
      hitPoints: state.hp.current,
      maxHitPoints: state.baselines.maxHitPoints,
      stabilisation: state.stabilised ? 'stable' : (state.hp.current <= 0 ? 'unstable' : 'not_applicable'),
      consciousness: state.consciousness,
    },
    conditions: state.criticalInjuries
      .filter((injury) => injury.state !== 'treated' && injury.state !== 'resolved')
      .map((injury) => ({
        conditionId: injury.injuryId,
        kind: 'critical_injury',
        label: injury.label,
        state: injury.state === 'quick_fixed' ? 'treated' : 'active',
        severity: 'critical',
        bodyRegion: injury.bodyRegion,
        firstObservedAt: injury.firstObservedAt ?? state.projectedAt,
        resolvedAt: null,
        sourceEventId: null,
        rulesRef: injury.definitionId,
        notes: [],
      })),
    treatments: state.care.map((care) => ({
      treatmentId: care.careId,
      label: care.kind,
      state: care.success ? 'completed' : 'failed',
      conditionId: care.targetInjuryId,
      startedAt: care.recordedAt ?? state.projectedAt,
      endedAt: care.recordedAt ?? state.projectedAt,
      practitionerId: care.providerId,
    })),
    cyberware: state.cyberware
      .filter((item) => item.state !== 'removed')
      .map((item) => ({
        cyberwareId: item.cyberwareId,
        catalogItemId: item.catalogItemId,
        label: item.label,
        state: item.state === 'operational' ? 'installed' : item.state,
        bodyRegion: item.bodyRegion,
        installedAt: item.installedAt ?? null,
      })),
    anatomyMarkers: [],
    knowledge: {},
    rules: {
      profile: PROFILE,
      state: {
        stats: clone(state.stats),
        overrides: clone(state.overrides),
        baselines: clone(state.baselines),
        woundState: state.woundState,
        deathSave,
        recovery: clone(state.recovery),
        medicalTimeSeconds: state.medicalTimeSeconds,
        clockMode: state.clockMode,
        timedEffects: clone(state.timedEffects),
        humanity: clone(state.humanity),
        addictions: clone(state.addictions),
        cryotech: clone(state.cryotech),
        psych: clone(state.psych),
      },
    },
  };
}

export function toMedscanSnapshot(state) {
  return {
    schemaVersion: 'medscan.snapshot/0.1',
    subject: {
      characterId: state.characterId,
      identityRef: null,
      patientId: state.recordId,
    },
    game: {
      hp: { current: state.hp.current, max: state.baselines.maxHitPoints },
      woundState: state.woundState,
      stabilized: state.stabilised,
      deathSave: getDeathSave(state),
      criticalInjuries: state.criticalInjuries.map((injury) => injury.injuryId),
    },
    biomonitor: { status: 'unknown', confidence: null, telemetryMode: 'derived' },
    coverage: { provider: null, plan: 'Unknown', status: 'unknown', dispatchEligible: false },
    location: { provider: 'unknown', ref: null, label: 'Location unavailable' },
    telemetry: {},
    bodyMap: { findings: [] },
    response: { state: 'idle', unitId: null, etaSeconds: null, distanceKm: null, timeline: [] },
    history: [],
  };
}

export function migrateLegacyBaselineValues(legacy, fallbackStats = { body: 6, will: 6 }) {
  const body = legacy.body ?? legacy.stats?.body ?? fallbackStats.body;
  const will = legacy.will ?? legacy.stats?.will ?? fallbackStats.will;
  const maxHitPoints = legacy.maxHitPoints ?? legacy.hp?.max ?? null;
  const seriouslyWoundedThreshold = legacy.seriouslyWoundedThreshold ?? legacy.seriousThreshold ?? legacy.hp?.seriouslyWoundedThreshold ?? null;
  const deathSave = legacy.deathSaveBase ?? legacy.deathSave?.base ?? (typeof legacy.deathSave === 'number' ? legacy.deathSave : null);
  return {
    body,
    will,
    maxHitPointsOverride: maxHitPoints,
    seriouslyWoundedThresholdOverride: seriouslyWoundedThreshold,
    deathSaveOverride: deathSave,
    currentHitPoints: legacy.currentHitPoints ?? legacy.hp?.current ?? maxHitPoints ?? undefined,
  };
}
