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

Medscan currently loads those pinned system assets remotely rather than
redistributing them in this repository. Any vendored, modified, or exported
derivative anatomy asset must retain the applicable attribution and ShareAlike
licensing.

The application code that positions HealthPar findings against semantic anatomy
structures is separate from the anatomy data itself; no claim is made here that
CC BY-SA applies to unrelated HealthPar or Medscan application code.

## Outer scan body

The translucent exterior is a redistributed derivative of Z-Anatomy's
`Resources/Models/FBX/Regions of human body100.fbx`, pinned to Z-Anatomy commit
`6c7f9016bd5899ac8edafd31b9900c151df42ed6`.

HealthPar's reproducible Blender build imports that pinned FBX, makes all 301
exterior region meshes visible, joins them without changing the body's pose or
non-uniformly reshaping it, removes source material slots, and exports the result
as the local browser asset:

`web/assets/z-anatomy-skin.glb`

The first committed build was produced with Blender 4.0.2 and has SHA-256:

`34034912ff049ff20db86d97ebbdfbebde71bf9b6dcac793a959f7a7b0595f2a`

At runtime Medscan applies only a uniform export-scale/centre fit against the
already-loaded Z-Anatomy-derived skeleton, then performs a proportion sanity
check. A failed registration suppresses the exterior rather than displaying a
misleading offset body.

This local exterior derivative remains subject to the applicable **CC BY-SA
4.0** attribution and ShareAlike terms, with the BodyParts3D source attribution
above retained as part of the provenance chain.

## three.js

The browser prototype uses three.js under the MIT License via jsDelivr.
https://github.com/mrdoob/three.js
