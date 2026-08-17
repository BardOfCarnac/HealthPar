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
https://github.com/LluisV/Z-Anatomy

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

The optional translucent exterior now loads Z-Anatomy's own
`Resources/Models/FBX/Regions of human body100.fbx`, pinned to Z-Anatomy commit
`6c7f9016bd5899ac8edafd31b9900c151df42ed6`.

This exterior comes from the same Z-Anatomy / BodyParts3D anatomical source as
the internal systems. Medscan fits only its uniform export scale and centre to
the already-loaded skeleton; it does not independently reshape the body. A
registration sanity check suppresses the exterior entirely if its resulting
proportions are implausible, so a failed shell never replaces the underlying
anatomy view.

The Z-Anatomy exterior remains subject to the applicable **CC BY-SA 4.0**
attribution and ShareAlike terms.

## three.js

The browser prototype uses three.js under the MIT License via jsDelivr.
https://github.com/mrdoob/three.js
