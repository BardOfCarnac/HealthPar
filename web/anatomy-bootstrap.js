import * as THREE from 'three';
import { FBXLoader } from 'three/addons/loaders/FBXLoader.js';
import { MedscanAnatomyViewer } from './anatomy-viewer.js';
import { ANATOMY_SYSTEMS } from './anatomy-anchors.js';

const style = document.createElement('link');
style.rel = 'stylesheet';
style.href = './anatomy.css';
document.head.appendChild(style);

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];
const PUBLIC_MODES = new Set(['skeletal', 'vascular', 'neural']);
const SKELETON_ID = ANATOMY_SYSTEMS.skeletal.id;
const BODY_SHELL_URL = 'https://cdn.jsdelivr.net/gh/LluisV/Z-Anatomy@6c7f9016bd5899ac8edafd31b9900c151df42ed6/Resources/Models/FBX/Regions%20of%20human%20body100.fbx';

let viewer = null;
let pendingSnapshot = null;
let tiltTarget = 0;
let tiltCurrent = 0;
let tiltFrame = 0;
let fullDistance = 5.4;
let focusScale = 1;
let focusActive = false;
let focusCurrent = null;
let focusTarget = null;
let focusDistanceCurrent = 5.4;
let focusDistanceTarget = 5.4;
let resetFocusButton = null;
let scanShell = null;

function selectFindingInExistingUI(finding) {
  const zone = finding?.zone;
  if (zone) {
    const hiddenZone = document.querySelector(`.zone[data-zone="${CSS.escape(zone)}"]`);
    hiddenZone?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  }
  focusFinding(finding);
}

function renderStructureDetail(structure) {
  $('#severity').textContent = '● Anatomy';
  $('#detailTitle').textContent = [structure.side, structure.name].filter(Boolean).join(' ');
  $('#detailCopy').textContent = 'Anatomical structure selected from the aligned Z-Anatomy / BodyParts3D-derived model. No gameplay condition is implied by selecting anatomy.';
  $('#detailSource').textContent = `${structure.system.toUpperCase()} · STRUCTURE ${String(structure.structureId).padStart(3, '0')}`;
  $('#chipTitle').textContent = [structure.side, structure.name].filter(Boolean).join(' ');
  $('#chipMeta').textContent = `${structure.system.toUpperCase()} anatomy`;
  focusStructure(structure);
}

function applySnapshot(snapshot) {
  pendingSnapshot = snapshot;
  if (!viewer) return;
  viewer.setFindings(snapshot?.bodyMap?.findings ?? []);
}

function calculateFullDistance() {
  if (!viewer) return 5.4;
  const height = viewer.bodyHeight || 3.45;
  const aspect = Math.max(viewer.camera.aspect, 0.42);
  const halfWidth = height * 0.30;
  const verticalFov = Math.PI * viewer.camera.fov / 180;
  const fit = halfWidth / (Math.tan(verticalFov / 2) * aspect);
  return Math.max(height * 1.48, fit * 1.05);
}

function updateFocusButton() {
  resetFocusButton?.classList.toggle('visible', focusActive);
  resetFocusButton?.toggleAttribute('hidden', !focusActive);
}

function setFocus(point, scale = 0.43) {
  if (!viewer || !point) return;
  focusActive = true;
  focusScale = Math.max(0.34, Math.min(0.58, scale));
  focusTarget.copy(point);
  focusDistanceTarget = Math.max(1.55, fullDistance * focusScale);
  updateFocusButton();
}

function resetFocus() {
  if (!viewer) return;
  focusActive = false;
  focusScale = 1;
  focusTarget.set(0, 0, 0);
  focusDistanceTarget = fullDistance;
  viewer.selected = null;
  viewer.paintAll();
  updateFocusButton();
}

function focusStructure(structure) {
  if (!viewer || !structure) return;
  const layer = viewer.layers.get(structure.systemId);
  if (!layer) return;
  const point = viewer.structureCentroid(layer, structure.structureId);
  setFocus(point, 0.43);
}

function focusFinding(finding) {
  if (!viewer || !finding) return;
  const marker = viewer.markerMeshes.get(finding.id);
  if (marker) {
    setFocus(marker.position, finding.zone?.includes('eye') || finding.zone === 'head' ? 0.35 : 0.43);
    return;
  }
  const anchor = viewer.resolveFindingAnchor(finding);
  if (anchor) setFocus(anchor.position, 0.43);
}

function installFocusPicking() {
  if (!viewer) return;
  const originalPick = viewer.pick.bind(viewer);
  viewer.pick = () => {
    viewer.raycaster.setFromCamera(viewer.pointer, viewer.camera);
    const markerHit = viewer.raycaster.intersectObjects([...viewer.markerMeshes.values()], false)[0];
    const structureHit = markerHit ? null : viewer.raycastStructure();
    if (!markerHit && !structureHit) {
      resetFocus();
      return;
    }
    originalPick();
  };
}

function installFocusUI() {
  const stage = $('.anatomy-stage');
  if (!stage || stage.querySelector('.anatomy-reset-focus')) return;
  resetFocusButton = document.createElement('button');
  resetFocusButton.type = 'button';
  resetFocusButton.className = 'anatomy-reset-focus';
  resetFocusButton.textContent = 'FULL BODY';
  resetFocusButton.hidden = true;
  resetFocusButton.setAttribute('aria-label', 'Return to full body scan');
  resetFocusButton.addEventListener('click', (event) => {
    event.stopPropagation();
    resetFocus();
  });
  stage.appendChild(resetFocusButton);
}

function setShellOpacity() {
  if (!scanShell || !viewer) return;
  const opacity = viewer.activeMode === 'skeletal' ? 0.045 : 0.065;
  scanShell.traverse((child) => {
    if (!child.isMesh || !child.material) return;
    child.material.opacity = opacity;
    child.material.needsUpdate = true;
  });
}

function fitShellToSkeleton(shell, skeletonLayer) {
  shell.updateMatrixWorld(true);
  skeletonLayer.mesh.updateMatrixWorld(true);

  const shellBox = new THREE.Box3().setFromObject(shell);
  const skeletonBox = new THREE.Box3().setFromObject(skeletonLayer.mesh);
  const shellSize = shellBox.getSize(new THREE.Vector3());
  const skeletonSize = skeletonBox.getSize(new THREE.Vector3());
  const skeletonCenter = skeletonBox.getCenter(new THREE.Vector3());

  if (shellSize.y < 0.001 || skeletonSize.y < 0.001) throw new Error('Invalid scan-shell bounds');

  // The FBX and GLB originate in the same Z-Anatomy pose. Their exporters use
  // different unit conventions, so only a uniform height scale + centre match
  // is applied. We deliberately do not reshape individual axes.
  const scale = skeletonSize.y / shellSize.y;
  shell.scale.multiplyScalar(scale);
  shell.updateMatrixWorld(true);

  const scaledCenter = new THREE.Box3().setFromObject(shell).getCenter(new THREE.Vector3());
  shell.position.add(skeletonCenter.sub(scaledCenter));
  shell.updateMatrixWorld(true);

  // Catch a wrong-axis or wrong-file failure instead of quietly displaying a
  // second ghost person. A true skin shell should remain close to skeleton
  // proportions after the shared-height fit.
  const fittedSize = new THREE.Box3().setFromObject(shell).getSize(new THREE.Vector3());
  const widthRatio = fittedSize.x / Math.max(skeletonSize.x, 0.001);
  const depthRatio = fittedSize.z / Math.max(skeletonSize.z, 0.001);
  if (widthRatio < 0.85 || widthRatio > 1.9 || depthRatio < 0.75 || depthRatio > 2.4) {
    throw new Error(`Z-Anatomy shell registration rejected (${widthRatio.toFixed(2)}w, ${depthRatio.toFixed(2)}d)`);
  }
}

async function loadScanShell() {
  if (!viewer || scanShell) return;
  try {
    const skeletonLayer = await viewer.loadSystem(SKELETON_ID);
    if (!skeletonLayer) return;

    const shell = await new FBXLoader().loadAsync(BODY_SHELL_URL);
    fitShellToSkeleton(shell, skeletonLayer);

    shell.traverse((child) => {
      if (!child.isMesh) return;
      child.material?.dispose?.();
      child.material = new THREE.MeshBasicMaterial({
        color: 0x9aa5a0,
        transparent: true,
        opacity: 0.055,
        depthWrite: false,
        depthTest: true,
        side: THREE.DoubleSide,
      });
      child.renderOrder = 0;
      child.frustumCulled = false;
    });

    scanShell = shell;
    viewer.scene.add(scanShell);
    setShellOpacity();
  } catch (error) {
    scanShell?.removeFromParent?.();
    scanShell = null;
    // Exterior tissue is presentation-only. If registration fails, show the
    // clean scan rather than a misleading misaligned silhouette.
    console.warn('Medscan Z-Anatomy scan shell unavailable', error);
  }
}

function tuneViewer() {
  if (!viewer) return;

  // Medscan is a scan instrument, not a free-orbit anatomy atlas. Page scrolling
  // remains available over the canvas; zoom is driven by selecting anatomy.
  viewer.controls.enabled = false;
  viewer.renderer.domElement.style.touchAction = 'pan-y';
  viewer.renderer.toneMappingExposure = 0.92;

  const basePaintLayer = viewer.paintLayer.bind(viewer);
  viewer.paintLayer = (layer) => {
    if (layer.systemId === SKELETON_ID) layer.baseColor.set(0x7d8580);
    basePaintLayer(layer);
    layer.mesh.material.roughness = 1;
    layer.mesh.material.metalness = 0;
    if (layer.systemId !== SKELETON_ID) {
      layer.mesh.material.emissive.copy(layer.baseColor).multiplyScalar(0.06);
      layer.mesh.material.emissiveIntensity = 1;
    } else {
      layer.mesh.material.emissive.set(0x000000);
    }
  };

  viewer.applyVisibility = () => {
    const activeSystem = ANATOMY_SYSTEMS[viewer.activeMode]?.id;
    viewer.layers.forEach((layer) => {
      const isSkeleton = layer.systemId === SKELETON_ID;
      const isActive = layer.systemId === activeSystem;
      layer.mesh.visible = isSkeleton || isActive;

      if (isSkeleton) {
        layer.mesh.material.opacity = viewer.activeMode === 'skeletal' ? 0.24 : 0.085;
        layer.mesh.material.depthWrite = false;
        layer.mesh.renderOrder = 1;
      } else {
        layer.mesh.material.opacity = isActive ? 0.78 : 0;
        layer.mesh.material.depthWrite = false;
        layer.mesh.renderOrder = isActive ? 2 : 0;
      }
      layer.mesh.material.transparent = true;
    });
    setShellOpacity();
  };

  viewer.view = 'front';
  viewer.setView('front', false);
  fullDistance = calculateFullDistance();
  focusCurrent = viewer.controls.target.clone();
  focusTarget = viewer.controls.target.clone();
  focusDistanceCurrent = fullDistance;
  focusDistanceTarget = fullDistance;

  viewer.resize = () => {
    const rect = viewer.container.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    viewer.camera.aspect = rect.width / rect.height;
    viewer.camera.updateProjectionMatrix();
    viewer.renderer.setSize(rect.width, rect.height, false);
    fullDistance = calculateFullDistance();
    focusDistanceTarget = focusActive ? Math.max(1.55, fullDistance * focusScale) : fullDistance;
  };

  installFocusPicking();
  installFocusUI();
  setupScrollTilt();
  loadScanShell();
}

function setMode(mode) {
  const publicMode = PUBLIC_MODES.has(mode) ? mode : 'skeletal';
  $$('.anatomy-mode').forEach((button) => {
    const active = button.dataset.anatomyMode === publicMode;
    button.classList.toggle('active', active);
    button.setAttribute('aria-pressed', String(active));
  });
  viewer?.selectMode(publicMode);
}

function updateTiltTarget() {
  if (!viewer || window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    tiltTarget = 0;
    return;
  }
  const rect = viewer.container.getBoundingClientRect();
  const viewportCentre = window.innerHeight / 2;
  const scanCentre = rect.top + rect.height / 2;
  const travel = Math.max(window.innerHeight * 0.9, rect.height * 0.55, 1);
  const progress = Math.max(-1, Math.min(1, (viewportCentre - scanCentre) / travel));
  tiltTarget = progress * (Math.PI / 45);
}

function animateScrollTilt() {
  if (!viewer || !focusCurrent || !focusTarget) return;
  tiltCurrent += (tiltTarget - tiltCurrent) * 0.075;
  focusCurrent.lerp(focusTarget, 0.085);
  focusDistanceCurrent += (focusDistanceTarget - focusDistanceCurrent) * 0.085;

  viewer.controls.target.copy(focusCurrent);
  viewer.camera.position.x = focusCurrent.x + Math.sin(tiltCurrent) * focusDistanceCurrent;
  viewer.camera.position.y = focusCurrent.y + 0.015;
  viewer.camera.position.z = focusCurrent.z + Math.cos(tiltCurrent) * focusDistanceCurrent;
  viewer.camera.lookAt(focusCurrent);

  tiltFrame = requestAnimationFrame(animateScrollTilt);
}

function setupScrollTilt() {
  updateTiltTarget();
  window.addEventListener('scroll', updateTiltTarget, { passive: true });
  window.addEventListener('resize', updateTiltTarget, { passive: true });
  if (!tiltFrame) tiltFrame = requestAnimationFrame(animateScrollTilt);
}

function init() {
  const container = $('#anatomyViewport');
  if (!container) return;

  const structuralButton = $('[data-anatomy-mode="skeletal"]');
  if (structuralButton) structuralButton.textContent = 'Structural';

  viewer = new MedscanAnatomyViewer({
    container,
    tooltip: $('#anatomyTooltip'),
    modeTitle: $('#anatomyModeTitle'),
    structureCount: $('#anatomyStructureCount'),
    loadingOverlay: $('#anatomyLoading'),
    loadingText: $('#anatomyLoadingText'),
    onFindingSelected: selectFindingInExistingUI,
    onStructureSelected: renderStructureDetail,
  });

  tuneViewer();

  $$('.anatomy-mode').forEach((button) => button.addEventListener('click', () => setMode(button.dataset.anatomyMode)));

  const install = $('#installCyberwareBtn');
  install?.addEventListener('click', () => {
    const engine = window.MedScanBridge?.getEngineState?.();
    if (engine?.cyberware?.some((item) => item.cyberwareId === 'demo_right_eye')) return;
    try {
      window.MedScanBridge?.command?.('install_cyberware', {
        cyberwareId: 'demo_right_eye',
        catalogItemId: 'demo:optical-implant',
        label: 'Right optical implant',
        bodyRegion: 'right_eye',
        humanityLoss: 0,
      });
    } catch (error) {
      console.error(error);
    }
  });

  const current = pendingSnapshot ?? window.MedScanBridge?.getState?.();
  if (current) applySnapshot(current);
  setMode('skeletal');
}

window.addEventListener('medscan:update', (event) => applySnapshot(event.detail));
window.addEventListener('load', init, { once: true });
