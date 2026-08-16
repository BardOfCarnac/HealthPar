# HealthPar

HealthPar is the working repository for the Medscan medical-state system in the Radian ecosystem.

The project separates:

- canonical character identity;
- current medical state;
- append-only medical events;
- rules/mechanics adapters; and
- presentation clients such as Medscan.

## Current milestone

The repository now contains both the executable **Medscan Live 0.95** rules profile and a browser Medscan client wired directly to it.

`src/medscan-095.js` implements the recovered medical-state behaviour for baselines, wound states, Death Saves, stabilization, Care and recovery, medical time/timed effects, drugs and pharmaceuticals, Humanity/addiction/Therapy, cyberware trauma/lifecycle, Cryotech and psych-state projection.

`web/` contains the current Medscan UI. Its gameplay health values are not demo constants: browser actions go through the same HealthPar command/event/projector flow used by the engine tests, then the page redraws from `toMedscanSnapshot()`.

Presentation-only biomonitor telemetry, body-map sensor findings, Trauma Team coverage/response and Spaciel location remain deliberately separate from canonical game state.

## Run the compatibility suite

Requires Node.js 20 or later.

```sh
npm test
```

The suite contains **75 tests**: 69 rules-profile compatibility tests and 6 browser-bridge integration tests.

## Run the browser demo

Serve the repository over HTTP so browser ES modules can import the shared engine. For example:

```sh
python -m http.server 8080
```

Then open `web/` in the browser.

For the hidden HealthPar developer harness, open `web/?healthpar=1`. It can apply damage, record Death Saves, add/treat a test Critical Injury, stabilize, begin recovery, advance one day and reset the demo patient. The ordinary patient-facing page does not expose those mechanics.

The demo browser client stores its event stream in `localStorage`; this is intentionally a development persistence layer, not the eventual multi-user backend.

## Documentation

- `docs/domain-model.md` — generic HealthPar domain boundaries and event model.
- `docs/command-contract.md` — command/result contract and 0.95 command vocabulary.
- `docs/medscan-live-0.95.md` — executable rules-profile behaviour.
- `docs/web-integration.md` — Medscan browser bridge and ownership boundaries.
- `schemas/medical-record.schema.json` — generic projected medical record.
- `schemas/medical-event.schema.json` — immutable event envelope.
- `schemas/rules-medscan-live-0.95.schema.json` — profile-specific rules projection.
- `examples/medical-record.example.json` — example UI-friendly projection.
- `examples/medical-events.example.json` — corresponding event history.

## Next product milestone

Replace demo `localStorage` persistence with a shared record/event store and connect character identity, while preserving the browser snapshot/command boundary. The UI and 0.95 rules engine should not need to be rewritten for that transition.
