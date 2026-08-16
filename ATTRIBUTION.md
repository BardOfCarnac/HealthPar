# Anatomy data attribution

The Medscan anatomy prototype loads browser-ready anatomy data from
[`DrMuratAltun/anatomi-simulatoru`](https://github.com/DrMuratAltun/anatomi-simulatoru),
pinned to commit `37e85dfbbb398e11ba33c8f0e411f06f9bba592f`.

The anatomy data is not original Medscan material. The upstream GLB files are
published under **Creative Commons Attribution-ShareAlike 4.0 International
(CC BY-SA 4.0)** and derive from the projects below.

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
The upstream project states that its derived GLB files remain **CC BY-SA 4.0**.

This prototype currently loads those assets remotely rather than redistributing
them inside this repository. If Medscan later vendors, modifies, or exports
derivative anatomy assets, those assets must retain the applicable attribution
and ShareAlike licensing.

## three.js

The prototype uses three.js under the MIT License via jsDelivr.
https://github.com/mrdoob/three.js
