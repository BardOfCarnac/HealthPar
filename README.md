# HealthPar

HealthPar is the working repository for the Medscan medical-state system in the Radian ecosystem.

The project separates:

- canonical character identity;
- current medical state;
- append-only medical events;
- rules/mechanics adapters; and
- presentation clients such as Medscan.

## Current milestone

The repository contains the executable **Medscan Live 0.95** rules profile and a browser Medscan client wired directly to it.

`src/medscan-095.js` implements the recovered medical-state behaviour for baselines, wound states, Death Saves, stabilization, Care and recovery, medical time/timed effects, drugs and pharmaceuticals, Humanity/addiction/Therapy, cyberware trauma/lifecycle, Cryotech and psych-state projection.

`web/` contains the current Medscan UI. Its gameplay health values are not demo constants: browser actions go through the same HealthPar command/event/projector flow used by the engine tests, then the page redraws from `toMedscanSnapshot()`.

The Body view now embeds an interactive aligned anatomy viewer using pinned BodyParts3D / Z-Anatomy-derived GLB systems for skeletal, internal, vascular, and neural scan modes. HealthPar findings attach to **semantic anatomical structures** (for example, a `left_thigh` finding resolves against `Femur.l`) rather than storing fragile GLB object numbers or hand-placed XYZ coordinates. Structure IDs remain available for picking inside a loaded asset, but they are not persisted as the cross-version anchor.

Active Critical Injuries and installed cyberware are projected into the same body-map finding stream. Sensor/narrative findings can share the display without becoming gameplay truth.

Presentation-only biomonitor telemetry, sensor findings, Trauma Team coverage/response and Spaciel location remain deliberately separate from canonical game state.

Anatomy-data attribution and ShareAlike requirements are documented in [`ATTRIBUTION.md`](./ATTRIBUTION.md).

## Run the compatibility suite

Requires Node.js 20 or later.

```sh
npm test
```

The suite contains **81 tests**: 69 rules-profile compatibility tests, 6 browser-bridge integration tests, and 6 anatomy/HealthPar anchoring tests.

## Run the browser demo

Serve the repository over HTTP so browser ES modules and pinned anatomy data can load. For example:

```sh
python -m http.server 8080
```

Then open `web/` in the browser.

The first anatomy mode downloads the pinned skeletal GLB from jsDelivr; other systems are lazy-loaded only when selected.

For the hidden HealthPar developer harness, open `web/?healthpar=1`. It can apply damage, record Death Saves, add/treat a test Critical Injury, stabilize, begin recovery, advance one day, install a demo right-eye cyberware item, and reset the demo patient. Those actions drive the real HealthPar event stream; the ordinary patient-facing page does not expose them.

The demo browser client stores its event stream in `localStorage`; this is intentionally a development persistence layer, not the eventual multi-user backend.

## Anatomy interaction

- Four scan modes: Skeletal, Internal, Vascular, Neural.
- Front/rear constrained examination rather than unrestricted free orbit.
- Structure-level raycast picking using the upstream structure IDs.
- Pointer hover raycasts are scheduled only when the pointer actually moves; the renderer no longer raycasts the high-triangle anatomy meshes on every animation frame.
- HealthPar clinical/cyberware markers resolve to structure centroids from semantic name candidates.
- Numeric structure ordering can change in a regenerated GLB without invalidating stored HealthPar records.

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

Replace demo `localStorage` persistence with a shared record/event store and connect character identity, while preserving the browser snapshot/command boundary. For anatomy, the next deeper step is a structure-visibility/replacement layer so biological structures can be suppressed when cyberware replaces them rather than merely receiving an overlay marker.
