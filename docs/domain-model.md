# Medscan domain model

## Purpose

HealthPar provides the canonical medical-state layer used by Medscan and, later, other Radian clients. It does **not** own character identity and it does not require the presentation layer to know game mechanics.

The central distinction is:

- **identity** — who the character is;
- **medical record** — the latest projected medical state;
- **medical events** — what happened, in order;
- **rules adapter** — how a game action becomes one or more medical events;
- **client view** — what a particular user or scanner is allowed to know and display.

## Core identifiers

Every persisted object uses an opaque stable identifier. IDs must never encode display names or game-state values.

- `characterId` — external identity reference supplied by the wider Radian/Sinlog layer (or a temporary local identity until that exists).
- `recordId` — one HealthPar medical record for that character in a continuity/world.
- `eventId` — globally unique medical event identifier.
- `conditionId` — stable identifier for an injury, condition, implant complication, treatment course, or similar longitudinal medical object.
- `anatomyMarkerId` — stable identifier for a marker attached to the anatomy coordinate system.

## Medical record

A `MedicalRecord` is a **projection** of the event stream. It is deliberately useful to a UI without requiring the UI to replay history itself.

The first version contains:

- record and character identity references;
- continuity/world reference;
- revision number and projection timestamp;
- scalar current-state values such as hit points when the rules adapter exposes them;
- current conditions and injuries;
- active treatments;
- cyberware/medical hardware relevant to the body view;
- anatomy markers;
- knowledge state for information that may be unknown rather than absent.

The record may be cached and queried, but events remain the source of truth.

## Events first

HealthPar stores changes as events instead of only overwriting the latest values. Examples:

- damage sustained;
- condition added;
- condition updated/resolved;
- treatment attempted;
- treatment outcome recorded;
- stabilisation changed;
- healing advanced;
- cyberware installed/removed/changed;
- note added;
- correction applied.

Events are immutable once committed. Mistakes are corrected with a compensating/correction event rather than editing history in place.

This gives us audit history, undo semantics, multi-device synchronisation, medical timelines, printable records, and later GM review without changing the core storage model.

## Rules separation

The 0.95 rules implementation should live behind a rules adapter. A client sends an **intent/command** such as `applyDamage`, `attemptTreatment`, or `advanceHealing`; the adapter validates it and emits domain events. The UI does not directly calculate the authoritative result.

This lets Medscan, Sightkick, GM tooling, imports, and tests all use the same mechanics without duplicating logic.

## Unknown is not the same as absent

A medical scanner may not know everything that HealthPar knows. Fields that can be hidden or uncertain therefore use explicit knowledge states:

- `known` — value is known and may be shown;
- `unknown` — record knows that the information is not available to this view;
- `withheld` — information exists but is intentionally hidden from this view;
- `suspected` — provisional/unconfirmed information.

A missing array entry means "no currently projected object"; it must not be overloaded to mean "the scanner has not checked".

## Anatomy coordinate system

Markers are not stored as pixel positions on a particular image. Each marker uses normalized coordinates (`x` and `y`, 0..1) against a named anatomical view such as `anterior` or `posterior`, plus an optional depth/layer.

Artwork is a renderer for those coordinates. This lets us replace body/skeleton/circulatory artwork later without rewriting saved medical data.

Initial marker fields:

- `view` — named anatomical projection;
- `x`, `y` — normalized coordinates;
- `layer` — exterior, skeletal, vascular, cyberware, annotation, or custom;
- `bodyRegion` — semantic fallback for accessibility and alternate renderers;
- `conditionId` / `cyberwareId` — optional link to the thing the marker represents.

## Projection invariants

1. Event order is deterministic within a record.
2. Applying the same event twice must not duplicate its effect (`eventId` idempotency).
3. A record revision only advances when a new event is accepted.
4. Resolved conditions remain in history but leave the active-condition projection.
5. Corrections never erase earlier events.
6. Character display names are presentation data, not identifiers.
7. Rules-specific calculations do not belong in UI components.
8. Anatomy data is artwork-independent.

## Deliberately deferred

This foundation does not yet choose:

- the final database/storage provider;
- authentication/account ownership;
- the exact Radian/Sinlog identity API;
- visibility policy between GM/player/public views;
- the final anatomy artwork;
- exact 0.95 numerical rules where they have not yet been encoded in repository source.

Those should attach to this model rather than force us to replace it.
