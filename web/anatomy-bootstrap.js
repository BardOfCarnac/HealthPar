import { MedscanAnatomyViewer } from './anatomy-viewer.js';

const style = document.createElement('link');
style.rel = 'stylesheet';
style.href = './anatomy.css';
document.head.appendChild(style);

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];

let viewer = null;
let pendingSnapshot = null;

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

function setMode(mode) {
  $$('.anatomy-mode').forEach((button) => {
    const active = button.dataset.anatomyMode === mode;
    button.classList.toggle('active', active);
    button.setAttribute('aria-pressed', String(active));
  });
  viewer?.selectMode(mode);
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

  $$('.anatomy-mode').forEach((button) => button.addEventListener('click', () => setMode(button.dataset.anatomyMode)));
  $$('[data-bodyview]').forEach((button) => button.addEventListener('click', () => viewer.setView(button.dataset.bodyview)));

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
