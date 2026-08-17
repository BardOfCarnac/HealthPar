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

let viewer = null;
let pendingSnapshot = null;
let tiltTarget = 0;
let tiltCurrent = 0;
let tiltFrame = 0;

function selectFindingInExistingUI(finding) {
  const zone = finding?.zone;
  if (!zone) return;
  const hiddenZone = document.querySelector(`.zone[data-zone="${CSS.escape(zone)}"]`);
  hiddenZone?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
}

function renderStructureDetail(structure) {
  $('#severity').textContent = '● Anatomy';
  $('#detailTitle').textContent = [structure.side, structure.name].filter(Boolean).join(' ');
  $('#detailCopy').textContent = 'Anatomical structure selected from the aligned Z-Anatomy / BodyParts3D-derived model. No gameplay condition is implied by selecting anatomy.';
  $('#detailSource').textContent = `${structure.system.toUpperCase()} · STRUCTURE ${String(structure.structureId).padStart(3, '0')}`;
  $('#chipTitle').textContent = [structure.side, structure.name].filter(Boolean).join(' ');
  $('#chipMeta').textContent = `${structure.system.toUpperCase()} anatomy`;
}

function applySnapshot(snapshot) {
  pendingSnapshot = snapshot;
  if (!viewer) return;
  viewer.setFindings(snapshot?.bodyMap?.findings ?? []);
}

function tuneViewer() {
  if (!viewer) return;

  // Medscan is a scan instrument, not a free-orbit anatomy atlas. Page scrolling
  // remains available over the canvas; deliberate region zoom will be added as
  // a separate interaction rather than preserving generic orbit/dolly controls.
  viewer.controls.enabled = false;
  viewer.renderer.domElement.style.touchAction = 'pan-y';

  const basePaintLayer = viewer.paintLayer.bind(viewer);
  viewer.paintLayer = (layer) => {
    if (layer.systemId === SKELETON_ID) layer.baseColor.set(0x929691);
    basePaintLayer(layer);
  };

  // The skeleton is always a restrained registration frame. Even in structural
  // mode it never returns to the bright ivory "anatomy model" treatment.
  viewer.applyVisibility = () => {
    const activeSystem = ANATOMY_SYSTEMS[viewer.activeMode]?.id;
    viewer.layers.forEach((layer) => {
      const isSkeleton = layer.systemId === SKELETON_ID;
      const isActive = layer.systemId === activeSystem;
      layer.mesh.visible = isSkeleton || isActive;

      if (isSkeleton) {
        layer.mesh.material.opacity = viewer.activeMode === 'skeletal' ? 0.30 : 0.11;
        layer.mesh.material.depthWrite = false;
        layer.mesh.renderOrder = 1;
      } else {
        layer.mesh.material.opacity = isActive ? 0.94 : 0;
        layer.mesh.material.depthWrite = isActive;
        layer.mesh.renderOrder = isActive ? 2 : 0;
      }
      layer.mesh.material.transparent = true;
    });
  };

  viewer.view = 'front';
  viewer.setView('front', false);
  setupScrollTilt();
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
  tiltTarget = progress * (Math.PI / 45); // ±4° maximum.
}

function animateScrollTilt() {
  if (!viewer) return;
  tiltCurrent += (tiltTarget - tiltCurrent) * 0.075;

  const target = viewer.controls.target;
  const dx = viewer.camera.position.x - target.x;
  const dz = viewer.camera.position.z - target.z;
  const radius = Math.max(0.001, Math.hypot(dx, dz));
  viewer.camera.position.x = target.x + Math.sin(tiltCurrent) * radius;
  viewer.camera.position.z = target.z + Math.cos(tiltCurrent) * radius;
  viewer.camera.lookAt(target);

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
