# HealthPar command contract

## Why commands exist

Clients express **intent** and let HealthPar decide which authoritative events follow. This prevents Medscan, Sightkick, GM tools, imports, and future clients from implementing separate versions of the medical rules.

A command is not persisted as medical truth. Accepted commands emit one or more immutable medical events; rejected commands emit none.

## Common envelope

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

`expectedRevision` is optimistic concurrency. A stale command is rejected without partial application so the caller can reload/rebase instead of silently overwriting another device's action.

## Generic command vocabulary

The generic HealthPar model reserves commands such as `create_record`, `apply_damage`, condition CRUD, treatment attempts, stabilization/consciousness changes, healing/recovery, cyberware changes, anatomy-marker changes, notes, and corrections.

Rules profiles may expose more precise commands while retaining the same envelope and immutable-event result.

## Medscan Live 0.95 commands

The executable 0.95 adapter currently accepts:

- `create_record` — create the rules state with BODY/WILL, optional independent baseline overrides, current HP, and Humanity baseline.
- `set_baselines` — change BODY/WILL and/or any independent Maximum HP, Seriously Wounded threshold, or Death Save override.
- `apply_damage` — apply HP damage; damage interrupts recovery/stabilization and, if already Mortally Wounded, flags that another Critical Injury must be supplied rather than inventing one.
- `add_critical_injury` — attach a structured Critical Injury definition/instance, including Death Save modifier, Care routes, anatomy and optional linked cyberware consequences.
- `roll_death_save` — record the caller-supplied physical d10 result against the current derived target.
- `attempt_stabilisation` — record Care and, on success, stabilize the patient according to the profile.
- `attempt_treatment` — record Quick Fix or definitive Treatment against an injury; linked cyberlimb Care can route through Cybertech.
- `set_resting` — start/stop ordinary recovery when the state permits it.
- `set_clock_mode` — switch the medical clock between `paused` and `live`.
- `advance_time` — deterministically advance by combat round, minute, ten minutes, hour, day, or an explicit duration.
- `add_timed_effect` / `acknowledge_timed_effect` — create and acknowledge timed medical/drug effects. Expiry itself is emitted when medical time advances past the effect.
- `record_drug_secondary_check` — record a known-drug secondary check and create/worsen persistent addiction on failure when defined.
- `administer_pharmaceutical` — record provider, route, qualification, notes, outcome, and any resolved HP/timed-effect result.
- `apply_humanity_loss` — record a direct Humanity change where a source requires it.
- `therapy` — record Humanity or Addiction Therapy and its resolved result.
- `install_cyberware` / `set_cyberware_state` / `remove_cyberware` — maintain operational state, Humanity ceiling impact, actual installation loss, live modifiers, and trauma-linked lifecycle.
- `set_cryotech` — record `none`, `cryopump`, or `cryotank` plus provider/equipment metadata.

The 0.95 implementation deliberately keeps Critical Injury table prose/data outside the engine. Structured injury definitions can be supplied by a rules-data package or caller, while HealthPar owns their state transitions.

## Result envelope

Accepted commands return the resulting revision, events and projected state together:

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

Rejected commands are machine-readable and must not partially apply:

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

The adapter owns:

- rules-specific input validation;
- mechanical outcomes;
- domain-event emission;
- deterministic projection;
- profile-specific state; and
- enough structured metadata for a client to explain what happened without reproducing rulebook prose.

The UI owns presentation only. `toMedscanSnapshot()` is the compatibility boundary for the current Medscan UI; it exposes the canonical gameplay health subset without making decorative biomonitor/body-map values authoritative.
