# HealthPar

HealthPar is the working repository for the Medscan medical-state system in the Radian ecosystem.

The project is being built around a separation between:

- canonical character identity;
- current medical state;
- append-only medical events;
- rules/mechanics adapters; and
- presentation clients such as Medscan.

## Current milestone

The first implementation milestone is the canonical medical record and event model.

Start here:

- [`docs/domain-model.md`](docs/domain-model.md) — ownership boundaries, event sourcing, partial knowledge, anatomy coordinates, and invariants.
- [`docs/command-contract.md`](docs/command-contract.md) — client intents, optimistic concurrency, command results, and the rules-adapter boundary.
- [`schemas/medical-record.schema.json`](schemas/medical-record.schema.json) — projected current medical record.
- [`schemas/medical-event.schema.json`](schemas/medical-event.schema.json) — immutable medical event envelope.
- [`examples/medical-record.example.json`](examples/medical-record.example.json) — example UI-friendly projection.
- [`examples/medical-events.example.json`](examples/medical-events.example.json) — the corresponding event history.

## Next implementation step

Encode the agreed 0.95 mechanics behind the command/rules-adapter boundary, then build a deterministic projector that rebuilds a `MedicalRecord` from its event stream. The current Medscan UI can then replace dummy state with this contract without owning game-rule calculations.
