export const ANATOMY_SYSTEMS = Object.freeze({
  skeletal: { id: 'iskelet', label: 'SKELETAL', color: 0xe6dcc8, count: 277 },
  internal: { id: 'ic-organlar', label: 'INTERNAL', color: 0xc76557, count: 120 },
  vascular: { id: 'dolasim', label: 'VASCULAR', color: 0xd44840, count: 676 },
  neural: { id: 'sinir', label: 'NEURAL', color: 0xe2b83a, count: 582 },
});

// These are semantic candidates, not numeric mesh IDs. Z-Anatomy/BodyParts3D
// structure names remain the source of truth, so a regenerated GLB can change
// object ordering without invalidating HealthPar findings.
export const ZONE_ANCHORS = Object.freeze({
  head: [
    { system: 'skeletal', patterns: [/^Frontal bone(?:\.\d{3})?$/i, /^Frontal/i] },
    { system: 'internal', patterns: [/Brain/i] },
  ],
  right_eye: [
    { system: 'internal', patterns: [/Eyeball\.r$/i, /Eye\.r$/i, /Right.*eye/i] },
    { system: 'skeletal', patterns: [/Zygomatic bone\.r$/i, /Zygomatic\.r$/i] },
  ],
  left_eye: [
    { system: 'internal', patterns: [/Eyeball\.l$/i, /Eye\.l$/i, /Left.*eye/i] },
    { system: 'skeletal', patterns: [/Zygomatic bone\.l$/i, /Zygomatic\.l$/i] },
  ],
  left_shoulder: [
    { system: 'skeletal', patterns: [/Scapula\.l$/i, /Clavicle\.l$/i, /Humerus\.l$/i] },
  ],
  right_shoulder: [
    { system: 'skeletal', patterns: [/Scapula\.r$/i, /Clavicle\.r$/i, /Humerus\.r$/i] },
  ],
  left_arm: [
    { system: 'skeletal', patterns: [/Humerus\.l$/i, /Radius\.l$/i, /Ulna\.l$/i] },
  ],
  right_arm: [
    { system: 'skeletal', patterns: [/Humerus\.r$/i, /Radius\.r$/i, /Ulna\.r$/i] },
  ],
  left_forearm: [
    { system: 'skeletal', patterns: [/Radius\.l$/i, /Ulna\.l$/i] },
  ],
  right_forearm: [
    { system: 'skeletal', patterns: [/Radius\.r$/i, /Ulna\.r$/i] },
  ],
  chest: [
    { system: 'skeletal', patterns: [/Sternum/i, /Rib/i] },
    { system: 'internal', patterns: [/Heart/i, /Lung/i] },
  ],
  torso: [
    { system: 'skeletal', patterns: [/Sternum/i, /Lumbar vertebra/i] },
    { system: 'internal', patterns: [/Liver/i, /Stomach/i] },
  ],
  thoracic_back: [
    { system: 'skeletal', patterns: [/Thoracic vertebra/i] },
  ],
  left_thigh: [
    { system: 'skeletal', patterns: [/Femur\.l$/i] },
  ],
  right_thigh: [
    { system: 'skeletal', patterns: [/Femur\.r$/i] },
  ],
  left_knee: [
    { system: 'skeletal', patterns: [/Patella\.l$/i, /Femur\.l$/i, /Tibia\.l$/i] },
  ],
  right_knee: [
    { system: 'skeletal', patterns: [/Patella\.r$/i, /Femur\.r$/i, /Tibia\.r$/i] },
  ],
  left_leg: [
    { system: 'skeletal', patterns: [/Tibia\.l$/i, /Fibula\.l$/i] },
  ],
  right_leg: [
    { system: 'skeletal', patterns: [/Tibia\.r$/i, /Fibula\.r$/i] },
  ],
});

export function normalizeStructureName(raw) {
  return String(raw ?? '')
    .trim()
    .replace(/^\((.*)\)$/, '$1')
    .replace(/\.\d{3}$/, '')
    .replaceAll('_', ' ')
    .trim();
}

export function resolveStructureIndex(names, zone, systemKey) {
  const candidates = ZONE_ANCHORS[zone] ?? [];
  const candidate = candidates.find((entry) => entry.system === systemKey);
  if (!candidate) return -1;

  for (const pattern of candidate.patterns) {
    const index = names.findIndex((name) => pattern.test(normalizeStructureName(name)));
    if (index >= 0) return index;
  }
  return -1;
}

export function preferredSystemForZone(zone) {
  return ZONE_ANCHORS[zone]?.[0]?.system ?? 'skeletal';
}
