# HealthPar command contract

## Why commands exist

Clients should express **intent** and let HealthPar decide which authoritative events follow. This prevents the Medscan UI, Sightkick, GM tools, imports, and future clients from each implementing their own version of the medical rules.

A command is not persisted as medical truth. Accepted commands emit one or more immutable medical events; rejected commands emit none.

## Common envelope

Every command should contain:

```json
{
  "commandId": "cmd_...",
  "recordId": "rec_...",
  "characterId": "char_...",
  "continuityId": "world_...",
  "expectedRevision": 12,
  "actorId": "char_or_user_or_system_id",
  "issuedAt": "2045-08-16T14:03:00Z",
  "type": "apply_damage",
  "payload": {}
}
```

`expectedRevision` provides optimistic concurrency. If the record has moved on, the caller reloads/rebases rather than silently overwriting another device's action.

## Initial command vocabulary

### `create_record`

Creates a medical record linked to an external character identity and continuity.

### `apply_damage`

Requests that the active rules adapter process damage. The payload contains only the inputs required by the rules engine; resulting HP/state/condition changes are emitted as events.

The UI must not authoritatively subtract hit points itself.

### `add_condition`

Adds a condition that did not originate from an automated damage calculation, for example a GM-entered or imported condition.

### `update_condition`

Changes the projected state or metadata of an existing condition.

### `resolve_condition`

Marks a condition resolved without deleting its earlier history.

### `attempt_treatment`

Passes treatment inputs to the active rules adapter. A single command can produce several events, for example `treatment_attempted`, `treatment_outcome_recorded`, `condition_updated`, and `stabilisation_changed`.

### `set_stabilisation`

Records an explicit stabilisation change when permitted by the rules adapter or GM authority.

### `set_consciousness`

Records a consciousness/incapacitation state change.

### `advance_healing`

Advances healing by the requested game-time interval. The rules adapter determines the resulting state changes.

### `install_cyberware` / `update_cyberware` / `remove_cyberware`

Maintains medically relevant installed hardware. `catalogItemId` may later reference Catalogger rather than duplicating item data inside HealthPar.

### `add_anatomy_marker` / `update_anatomy_marker` / `remove_anatomy_marker`

Changes the annotation projection. Marker positions remain normalized and artwork-independent.

### `add_note`

Adds a clinical/GM note. Visibility policy should be attached separately rather than encoded in free text.

### `apply_correction`

Creates a compensating event that corrects an earlier mistake. Historical events are never mutated or deleted by ordinary application behaviour.

## Result envelope

Accepted commands should return the resulting revision, events, and projected state in one response so the client can update immediately:

```json
{
  "accepted": true,
  "commandId": "cmd_...",
  "previousRevision": 12,
  "revision": 15,
  "events": [],
  "record": {}
}
```

Rejected commands should be machine-readable and must not partially apply:

```json
{
  "accepted": false,
  "commandId": "cmd_...",
  "error": {
    "code": "revision_conflict",
    "message": "Record has changed since revision 12.",
    "currentRevision": 14
  }
}
```

## Rules adapter boundary

The command layer should depend on a small adapter interface rather than on UI code or a particular ruleset implementation. The adapter is responsible for:

- validation of rules-specific inputs;
- calculating mechanical outcomes;
- emitting domain events;
- maintaining deterministic results where the rules require them;
- exposing enough metadata for the UI to explain what happened without reproducing rulebook text unnecessarily.

HealthPar can therefore support the 0.95 system now and additional rules profiles later without changing the persisted medical-record format.
