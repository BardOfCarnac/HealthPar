# Anatomy data attribution

The Medscan anatomy viewer loads browser-ready anatomical systems from
[`DrMuratAltun/anatomi-simulatoru`](https://github.com/DrMuratAltun/anatomi-simulatoru),
pinned to commit `37e85dfbbb398e11ba33c8f0e411f06f9bba592f`.

The anatomy data is not original HealthPar/Medscan material. The upstream
`systems/*.glb` files are published under **Creative Commons
Attribution-ShareAlike 4.0 International (CC BY-SA 4.0)** and derive from the
projects below.

## BodyParts3D

**BodyParts3D, © The Database Center for Life Science (DBCLS)**  
Licensed under **CC BY-SA 2.1 Japan**.  
https://lifesciencedb.jp/bp3d/

## Z-Anatomy

**Z-Anatomy — The libre 3D atlas of anatomy**  
Licensed under **CC BY-SA 4.0**.  
https://www.z-anatomy.com/  
https://github.com/Z-Anatomy/Models-of-human-anatomy

## Browser conversion

The browser-ready `systems/*.glb` assets used by this prototype were produced by
Dr. Murat Altun's **Anatomi Simülatörü** project from the Z-Anatomy source data.
The upstream project states that these derived GLB files remain **CC BY-SA 4.0**.

Medscan currently loads those pinned assets remotely rather than redistributing
them in this repository. If we later vendor, modify, or export derivative anatomy
assets, the affected anatomy assets/derivatives must retain the applicable
attribution and ShareAlike licensing.

The application code that positions HealthPar findings against semantic anatomy
structures is separate from the anatomy data itself; no claim is made here that
CC BY-SA applies to unrelated HealthPar or Medscan application code.

## Outer scan body

The optional translucent outer-body scan layer loads `human_posed.glb` from
[`UMRAM-Bilkent/supine-human-model`](https://github.com/UMRAM-Bilkent/supine-human-model),
pinned to commit `728f23ab5eb9d6cb2c8fb39acb3440bd81db0d3e`.

That prepared model is released under **CC0 1.0** and is derived from a CC0
Quaternius character. Attribution is not legally required; we retain this note as
courtesy provenance. The shell is presentation-only and is not used as the
source of anatomical structure names or HealthPar body-region mappings.

## three.js

The browser prototype uses three.js under the MIT License via jsDelivr.
https://github.com/mrdoob/three.js
