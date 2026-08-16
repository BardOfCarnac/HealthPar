# Medscan Live 0.95 rules profile

`src/medscan-095.js` is the executable HealthPar adapter/projector for the completed Medscan Live 0.95 medical rules pass.

## Boundary

HealthPar remains event-first. Clients send commands; the rules profile emits immutable medical events; `project()` deterministically rebuilds the current state; `projectMedicalRecord()` exposes the generic HealthPar record; and `toMedscanSnapshot()` produces the small snapshot boundary already used by the Medscan UI.

The UI therefore never owns HP, wound state, Critical Injuries, Death Saves, stabilization, Humanity, cyberware trauma, or recovery rules.

## Baselines

BODY and WILL are authoritative inputs.

- Maximum HP is derived from BODY/WILL unless explicitly overridden.
- Seriously Wounded threshold derives from Maximum HP unless explicitly overridden.
- Death Save derives from WILL unless explicitly overridden.
- The three overrides are independent.
- Reducing Maximum HP clamps current HP downward.
- Increasing Maximum HP does not heal current HP.
- Legacy 0.9-and-earlier values can be migrated conservatively as explicit overrides with `migrateLegacyBaselineValues()`.

## Wounds, Death Saves, and stabilization

The projection distinguishes healthy, lightly wounded, seriously wounded, mortally wounded, and dead states.

While Mortally Wounded, the Death Save target combines the baseline with active Critical Injury, timed-effect, addiction, and operational-cyberware modifiers, then applies the cumulative successive-save penalty. The physical d10 result is supplied by the caller. A passed save advances the cumulative penalty; a failed save marks the patient dead.

Damage sustained while already Mortally Wounded does not invent or roll a Critical Injury. Instead it emits `additional_critical_injury_required`, leaving the actual injury resolution to the table/GM/rules-data layer.

Successful stabilization from 0 HP or below returns the patient to 1 HP, ends the active mortal cycle, and preserves Critical Injuries. Failed Care remains in history without changing the medical state.

## Critical Injuries and Care

Critical Injury instances are data-driven and can carry:

- table and roll reference;
- body region and side;
- Death Save contribution;
- Quick Fix route;
- definitive Treatment route;
- whether a Quick Fix permanently resolves the injury;
- linked cyberware/cyberlimb trauma.

The core engine intentionally does not bundle copyrighted Critical Injury table prose. A rules-data package can supply the structured definitions while this profile owns the state transitions.

Cyberlimb-linked trauma can mark an implant Damaged or Severed. Linked Care is routed through Cybertech; successful definitive repair restores the implant to Operational and resolves the injury state.

## Recovery and medical time

Recovery requires stabilization, active rest, and complete game days. Each complete recovery day restores BODY HP, capped at Maximum HP. New damage interrupts recovery and removes stabilization.

Cryotech can be `none`, `cryopump`, or `cryotank`. Ordinary recovery is suspended while Cryotech is active. Cryotech never auto-adjudicates Death Saves.

The medical clock supports paused/live state plus deterministic manual advances by combat round, minute, ten minutes, hour, or day. Timed effects expire against game medical time rather than wall-clock phone time. Expiry stops modifiers immediately while the expired effect remains present until acknowledged.

## Drugs, pharmaceuticals, Humanity, and Therapy

Drug secondary checks and pharmaceutical administration are distinct operations.

Failed known-drug secondary checks can create or worsen persistent addiction. Addiction state can contribute to Death Saves. Successful secondary checks do not create addiction.

Pharmaceutical administration records provider, route, qualification confirmation, notes, and the resolved result. It can record actual HP recovered or create timed effects.

Cyberware installation records the actual Humanity loss supplied by the caller, including explicit zero-loss cases. Installed standard cyberware lowers the Humanity ceiling by 2; Borgware lowers it by 4 unless an explicit ceiling loss is supplied. Removal restores only the ceiling. It never restores current Humanity.

Therapy records kind, provider, downtime, notes, outcome, and entered Humanity recovery. Successful Humanity Therapy restores only up to the current Humanity ceiling. Addiction state changes to resolved only through successful Addiction Therapy.

EMP is conservatively projected from current Humanity. EMP 1 is surfaced as `borderline_cyberpsychosis`; EMP 0 as `critical_psych_state`. The profile does not invent consequences beyond that state marker.

## Determinism and concurrency

- Event IDs are deterministic per command (`commandId:index`).
- Projection is idempotent by `eventId`.
- Commands require `expectedRevision` and reject stale writes without partial application.
- Failed checks remain historical events; successful checks emit the additional state-changing events.

## Validation

`npm test` runs 69 compatibility tests covering the recovered 0.95 invariants, including baseline overrides, mortal-state edge cases, recovery, timed effects, addiction/Therapy, Humanity ceilings, cyberware lifecycle, cyberlimb trauma, Cryotech, projections, idempotency, and optimistic concurrency.
