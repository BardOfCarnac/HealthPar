# Medscan browser integration

The `web/` demo is the first client wired directly to the HealthPar 0.95 engine.

## Data flow

The authoritative path is:

`user/GM intent -> HealthPar command -> immutable events -> deterministic projection -> Medscan snapshot -> render`

The DOM never subtracts HP, derives wound state, advances Death Save penalties, resolves Critical Injuries, or heals the patient itself.

`web/healthpar-client.js` is the current thin browser adapter. In the demo it stores the event stream in `localStorage`; a future server-backed adapter can keep the same command/snapshot boundary while replacing local persistence.

## Presentation merge

`toMedscanSnapshot()` supplies the canonical gameplay health subset. The browser then merges presentation/service domains on top:

- SINLog/Radian identity reference;
- biomonitor connection/confidence;
- flavour/manual telemetry;
- sensor/narrative body-map findings;
- Trauma Team coverage;
- Spaciel location reference;
- response/dispatch state.

This merge is one-way: presentation values cannot alter HealthPar HP, wound state, Death Saves or Critical Injuries.

Active HealthPar Critical Injuries are projected into body-map findings with `source: "rules-linked"` and an opaque injury reference. Sensor findings can occupy the same visual map but remain non-authoritative.

## Browser bridge

The page preserves the original model-ready bridge:

```js
window.MedScanBridge.load(snapshot)
window.MedScanBridge.getState()
window.MedScanBridge.requestDispatch()
```

HealthPar adds:

```js
window.MedScanBridge.command(type, payload)
window.MedScanBridge.getEngineState()
window.MedScanBridge.getEvents()
window.MedScanBridge.resetPatient()
```

External services can push a complete display snapshot with:

```js
window.dispatchEvent(new CustomEvent('medscan:update', { detail: snapshot }))
```

An external controller can submit a HealthPar command with:

```js
window.dispatchEvent(new CustomEvent('medscan:healthpar-command', {
  detail: { type: 'apply_damage', payload: { amount: 5 } }
}))
```

Rejected external commands emit `medscan:healthpar-error`.

Dispatch continues to emit `medscan:dispatch-requested`; HealthPar does not own Trauma Team unit assignment or ETA.

## Developer harness

The ordinary Medscan UI is patient-facing and contains no GM damage/treatment controls.

Append `?healthpar=1` to expose a development console. It exercises the real engine for damage, Death Saves, a test Critical Injury, treatment, stabilization, recovery and time advancement.

The harness deliberately accepts already-resolved table inputs such as a physical Death Save roll or a selected Critical Injury. It does not turn Medscan into a dice roller or reproduce Critical Injury tables.

## Integration correction discovered

The pre-engine UI fixture labelled a 24/40 HP patient as Seriously Wounded. Once the page was connected to 0.95, HealthPar correctly projected that patient as Lightly Wounded; the browser integration tests now lock the engine-derived result instead of preserving the stale display constant.
