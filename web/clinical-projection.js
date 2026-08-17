import { preferredSystemForZone } from './anatomy-anchors.js';

export const REGION_TO_ZONE = Object.freeze({
  head: 'head', skull: 'head', face: 'head', brain: 'head',
  right_eye: 'right_eye', left_eye: 'left_eye', right_orbit: 'right_eye', left_orbit: 'left_eye',
  left_shoulder: 'left_shoulder', right_shoulder: 'right_shoulder',
  left_arm: 'left_arm', right_arm: 'right_arm',
  left_forearm: 'left_forearm', right_forearm: 'right_forearm',
  left_hand: 'left_forearm', right_hand: 'right_forearm',
  left_thigh: 'left_thigh', right_thigh: 'right_thigh',
  left_knee: 'left_knee', right_knee: 'right_knee',
  left_leg: 'left_leg', right_leg: 'right_leg',
  left_foot: 'left_leg', right_foot: 'right_leg',
  chest: 'chest', thorax: 'chest', lung: 'chest', lungs: 'chest', heart: 'chest',
  torso: 'torso', abdomen: 'torso', abdominal: 'torso',
  thoracic_back: 'thoracic_back', back: 'thoracic_back', spine: 'thoracic_back',
});

const SIDEABLE_REGIONS = Object.freeze({
  eye: 'eye', orbit: 'eye', shoulder: 'shoulder', arm: 'arm', forearm: 'forearm',
  thigh: 'thigh', knee: 'knee', leg: 'leg', hand: 'forearm', foot: 'leg',
});

function clone(value) {
  return structuredClone(value);
}

function cap(value) {
  return String(value ?? '')
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (match) => match.toUpperCase());
}

export function zoneForBodyRegion(bodyRegion, side = null) {
  const raw = String(bodyRegion ?? '').trim().toLowerCase().replace(/[\s-]+/g, '_');
  if (REGION_TO_ZONE[raw]) return REGION_TO_ZONE[raw];

  const normalSide = String(side ?? '').trim().toLowerCase();
  const sideable = SIDEABLE_REGIONS[raw];
  if (sideable && ['left', 'right'].includes(normalSide)) {
    return REGION_TO_ZONE[`${normalSide}_${sideable}`] ?? `${normalSide}_${sideable}`;
  }

  if (/head|skull|face|cran/i.test(raw)) return 'head';
  if (/chest|thorax|lung|heart|rib|stern/i.test(raw)) return 'chest';
  if (/back|spine|vertebr/i.test(raw)) return 'thoracic_back';
  if (/abdomen|torso|pelvis|liver|stomach|kidney/i.test(raw)) return 'torso';
  return 'torso';
}

function stabilisationState(state) {
  if (state.consciousness === 'dead') return 'not_applicable';
  if (state.stabilised) return 'stable';
  if (state.hp.current <= 0) return 'unstable';
  return 'not_applicable';
}

function woundTone(woundState) {
  if (woundState === 'dead' || woundState === 'mortally_wounded') return 'red';
  if (woundState === 'seriously_wounded') return 'yellow';
  return '';
}

export function projectClinicalState(state) {
  return {
    source: 'rules-projection',
    rulesLinked: true,
    presentationOnly: true,
    woundState: state.woundState,
    woundLabel: cap(state.woundState),
    tone: woundTone(state.woundState),
    consciousness: state.consciousness,
    stabilisation: stabilisationState(state),
    hitPoints: {
      current: state.hp.current,
      max: state.baselines.maxHitPoints,
    },
    deathSaveActive: Boolean(state.deathSave.active),
    activeCriticalInjuryCount: state.criticalInjuries
      .filter((injury) => injury.state !== 'treated' && injury.state !== 'resolved')
      .length,
    policy: 'descriptive_only_no_additional_gameplay_effects',
  };
}

export function rulesFindings(state) {
  return state.criticalInjuries
    .filter((injury) => injury.state !== 'treated' && injury.state !== 'resolved')
    .map((injury) => {
      const zone = zoneForBodyRegion(injury.bodyRegion, injury.side);
      return {
        id: `rule_${injury.injuryId}`,
        zone,
        title: injury.label,
        severity: 'critical',
        source: 'rules-linked',
        rulesLinked: true,
        presentationOnly: true,
        ruleRef: injury.injuryId,
        treatmentState: injury.state,
        anatomy: {
          bodyRegion: injury.bodyRegion ?? null,
          side: injury.side ?? null,
          zone,
          preferredSystem: preferredSystemForZone(zone),
        },
        summary: injury.state === 'quick_fixed'
          ? 'Quick Fixed. The canonical Critical Injury remains in HealthPar until definitive treatment resolves it.'
          : 'Canonical Critical Injury projected from HealthPar. Medical/anatomy presentation does not add gameplay consequences.',
      };
    });
}

export function cyberwareFindings(state) {
  return state.cyberware
    .filter((item) => item.state !== 'removed')
    .map((item) => {
      const zone = zoneForBodyRegion(item.bodyRegion);
      return {
        id: `cyberware_${item.cyberwareId}`,
        zone,
        title: item.label,
        severity: item.state === 'operational' ? 'stable' : 'moderate',
        source: 'cyberware',
        rulesLinked: true,
        presentationOnly: true,
        cyberwareRef: item.cyberwareId,
        anatomy: {
          bodyRegion: item.bodyRegion ?? null,
          side: null,
          zone,
          preferredSystem: 'cyberware',
        },
        summary: item.state === 'operational'
          ? 'Canonical installed cyberware projected from HealthPar.'
          : `Canonical cyberware state: ${cap(item.state)}.`,
      };
    });
}

export function sensorFindings(findings = []) {
  return clone(findings).map((finding) => ({
    ...finding,
    source: finding.source ?? 'sensor',
    rulesLinked: false,
    presentationOnly: true,
  }));
}

export function projectBiomonitor(presentation = {}) {
  const biomonitor = clone(presentation.biomonitor ?? { status: 'unknown', confidence: null, telemetryMode: 'manual' });
  biomonitor.presentationOnly = true;
  biomonitor.rulesLinked = false;
  biomonitor.policy = 'never_changes_red_rules_state';

  const telemetryMode = biomonitor.telemetryMode ?? 'manual';
  const telemetry = Object.fromEntries(Object.entries(clone(presentation.telemetry ?? {})).map(([key, reading]) => [
    key,
    {
      ...reading,
      source: reading?.source ?? telemetryMode,
      rulesLinked: false,
      presentationOnly: true,
    },
  ]));

  return { biomonitor, telemetry };
}

export function projectClinicalPresentation(state, presentation = {}) {
  const { biomonitor, telemetry } = projectBiomonitor(presentation);
  return {
    clinical: projectClinicalState(state),
    biomonitor,
    telemetry,
    bodyMap: {
      findings: [
        ...sensorFindings(presentation.sensorFindings ?? []),
        ...rulesFindings(state),
        ...cyberwareFindings(state),
      ],
    },
  };
}
