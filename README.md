# HealthPar

HealthPar is the working repository for the Medscan medical-state system in the Radian ecosystem.

The project is being built around a separation between:

- canonical character identity;
- current medical state;
- append-only medical events;
- rules/mechanics adapters; and
- presentation clients such as Medscan.

## Current prototype

The first interactive Medscan vertical slice is now represented by the static web prototype in this repository. It is deliberately small and proves the presentation boundary before backend plumbing is added.

It currently includes:

- a mobile-first Medscan Live patient screen;
- a real browser-rendered 3D anatomy model;
- lazy-loaded **Skeletal**, **Internal**, **Vascular**, and **Neural** scan modes;
- constrained examination controls plus front/rear views;
- per-structure raycast selection and anatomical labels;
- a demo left-radius fracture marker;
- a demo right-eye cyberware marker; and
- a persistent bottom scan-mode bar on mobile.

The anatomy data is loaded from a pinned version of Dr. Murat Altun's browser conversion of the BodyParts3D / Z-Anatomy dataset. See [`ATTRIBUTION.md`](./ATTRIBUTION.md) for licensing and attribution details.

## Running the prototype

Because the page uses ES modules, serve the repository over HTTP rather than opening `index.html` directly. For example:

```bash
python3 -m http.server 8000
```

Then open `http://localhost:8000` in a modern browser. The first skeletal scan downloads roughly 5 MB; the other anatomical systems are loaded only when selected.

## Architecture direction

The anatomy viewer is intentionally kept separate from Medscan's future record/event model. The next implementation milestones are to replace hard-coded demo findings with medical-state data and then attach clinical events/cyberware to stable anatomical targets.
