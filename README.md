# HealthPar

HealthPar is the working repository for the Medscan medical-state system in the Radian ecosystem.

The project separates:

- canonical character identity;
- current medical state;
- append-only medical events;
- rules/mechanics adapters; and
- presentation clients such as Medscan.

## Current milestone

The repository now contains an executable **Medscan Live 0.95** rules profile in `src/medscan-095.js` plus the generic HealthPar record/event contracts.

The 0.95 profile implements the recovered medical-state behaviour for baselines, wound states, Death Saves, stabilization, Care and recovery, medical time/timed effects, drugs and pharmaceuticals, Humanity/addiction/Therapy, cyberware trauma/lifecycle, Cryotech and psych-state projection.

It does not make Medscan the owner of the character sheet. `toMedscanSnapshot()` projects the authoritative rules state into the small snapshot boundary used by the UI.

## Run the compatibility suite

Requires Node.js 20 or later.

```sh
npm test
```

The suite contains 69 compatibility tests for the 0.95 invariants.

## Documentation

- `docs/domain-model.md` — generic HealthPar domain boundaries and event model.
- `docs/command-contract.md` — command/result contract and 0.95 command vocabulary.
- `docs/medscan-live-0.95.md` — executable rules-profile behaviour.
- `schemas/medical-record.schema.json` — generic projected medical record.
- `schemas/medical-event.schema.json` — immutable event envelope.
- `schemas/rules-medscan-live-0.95.schema.json` — profile-specific rules projection.
- `examples/medical-record.example.json` — example UI-friendly projection.
- `examples/medical-events.example.json` — corresponding event history.

The next product milestone is to bind the current Medscan UI to these projections and replace demo state with real command/event flow.
