import * as THREE from 'three';
import { STLLoader } from 'three/addons/loaders/STLLoader.js';
import { ANATOMY_SYSTEMS, resolveStructureIndex } from './anatomy-anchors.js';

const ASSET_BASE = 'https://cdn.jsdelivr.net/gh/9Akshit1/RoboArm@main/CAD';
const PARTS = [
  { name: 'Upper arm shell', file: 'Human Arm First Link - Half 1.stl', from: 'shoulder', to: 'elbow', width: 0.16 },
  { name: 'Forearm shell', file: 'Human Arm Second Link - Half 1.stl', from: 'elbow', to: 'wrist', width: 0.145 },
  { name: 'Wrist housing', file: 'Wrist.stl', from: 'wrist', to: 'hand', width: 0.12 },
];

const state = {
  viewer: null,
  group: null,
  pickMeshes: [],
  visible: false,
  loaded: 0,
  failed: 0,
  anchors: null,
};

function addStyles() {
  if (document.querySelector('#cyberwareDemoStyles')) return;
  const style = document.createElement('style');
  style.id = 'cyberwareDemoStyles';
  style.textContent = `
    .cyberware-demo-tag {
      position: absolute;
      z-index: 8;
      top: 70px;
      left: 18px;
      padding: 7px 9px;
      border: 1px solid rgba(207,49,44,.44);
      background: rgba(20,18,16,.82);
      color: #d7d4ca;
      font: 700 10px/1.2 system-ui, sans-serif;
      letter-spacing: .12em;
      text-transform: uppercase;
      pointer-events: none;
      opacity: 0;
      transform: translateY(-4px);
      transition: opacity .18s ease, transform .18s ease;
    }
    .cyberware-demo-tag.show { opacity: 1; transform: translateY(0); }
    .cyberware-demo-tag b { color: #cf312c; }
    .anatomy-mode[data-anatomy-mode="cyberware"] { border-color: rgba(207,49,44,.32); }
    .anatomy-mode[data-anatomy-mode="cyberware"].active {
      color: #fff4ee;
      border-color: rgba(207,49,44,.78);
      box-shadow: inset 0 0 0 1px rgba(207,49,44,.18), 0 0 16px rgba(207,49,44,.12);
    }
  `;
  document.head.appendChild(style);
}

function makeMaterial() {
  return new THREE.MeshStandardMaterial({
    color: 0xbfc4c6,
    metalness: 0.72,
    roughness: 0.32,
    emissive: 0x230807,
    emissiveIntensity: 0.25,
    transparent: true,
    opacity: 0.98,
  });
}

function register(mesh, label, order = 7) {
  mesh.userData.cyberware = true;
  mesh.userData.cyberwareLabel = label;
  mesh.castShadow = false;
  mesh.receiveShadow = false;
  mesh.renderOrder = order;
  state.pickMeshes.push(mesh);
  return mesh;
}

function getArmAnchors(viewer) {
  const skeleton = viewer.layers.get(ANATOMY_SYSTEMS.skeletal.id);
  if (!skeleton) return null;

  const humerusId = resolveStructureIndex(skeleton.names, 'right_arm', 'skeletal');
  const forearmId = resolveStructureIndex(skeleton.names, 'right_forearm', 'skeletal');
  if (humerusId < 0 || forearmId < 0) return null;

  const upperCentre = viewer.structureCentroid(skeleton, humerusId);
  const foreCentre = viewer.structureCentroid(skeleton, forearmId);
  const span = foreCentre.clone().sub(upperCentre);

  // The centroids are the centres of the upper- and lower-arm bones. Extrapolate
  // from them to derive a stable shoulder / elbow / wrist chain on the exact body
  // currently rendered rather than using screen-size-dependent guessed offsets.
  const shoulder = upperCentre.clone().sub(span.clone().multiplyScalar(0.52));
  const elbow = upperCentre.clone().lerp(foreCentre, 0.50);
  const wrist = foreCentre.clone().add(span.clone().multiplyScalar(0.52));
  const hand = wrist.clone().add(span.clone().multiplyScalar(0.30));

  // Sit the cyberware very slightly toward the camera so it reads as a replacement
  // surface without z-fighting against the registration skeleton.
  [shoulder, elbow, wrist, hand].forEach((point) => { point.z += 0.035; });
  return { shoulder, elbow, wrist, hand };
}

function orientAlongY(geometry) {
  geometry.computeBoundingBox();
  const size = geometry.boundingBox.getSize(new THREE.Vector3());
  if (size.x >= size.y && size.x >= size.z) geometry.rotateZ(Math.PI / 2);
  else if (size.z >= size.x && size.z >= size.y) geometry.rotateX(-Math.PI / 2);
  geometry.center();
  geometry.computeVertexNormals();
  geometry.computeBoundingBox();
}

function fitGeometryToSegment(geometry, start, end, maxWidth) {
  orientAlongY(geometry);
  const size = geometry.boundingBox.getSize(new THREE.Vector3());
  const targetLength = start.distanceTo(end) * 0.88;
  const lengthScale = targetLength / Math.max(size.y, 0.001);
  const transverseScale = Math.min(
    lengthScale,
    maxWidth / Math.max(size.x, size.z, 0.001),
  );
  geometry.scale(transverseScale, lengthScale, transverseScale);
  geometry.computeBoundingSphere();
}

function placeAlongSegment(mesh, start, end) {
  const direction = end.clone().sub(start);
  mesh.position.copy(start).add(end).multiplyScalar(0.5);
  mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction.normalize());
}

function addRod(group, start, end, radius = 0.018, label = 'Internal actuator') {
  const direction = end.clone().sub(start);
  const length = direction.length();
  if (length < 0.001) return null;
  const mesh = register(
    new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, length, 12), makeMaterial()),
    label,
    6,
  );
  mesh.position.copy(start).add(end).multiplyScalar(0.5);
  mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction.normalize());
  group.add(mesh);
  return mesh;
}

function addJoint(group, position, radius, label) {
  const joint = register(
    new THREE.Mesh(
      new THREE.TorusGeometry(radius, 0.015, 12, 34),
      new THREE.MeshStandardMaterial({
        color: 0xd7dad9,
        metalness: 0.75,
        roughness: 0.26,
        emissive: 0x350705,
        emissiveIntensity: 0.3,
      }),
    ),
    label,
    8,
  );
  joint.position.copy(position);
  joint.rotation.x = Math.PI / 2;
  group.add(joint);
  return joint;
}

function offsetBetween(start, end, fraction, sideAmount = 0, depthAmount = 0) {
  const direction = end.clone().sub(start).normalize();
  const side = new THREE.Vector3(0, 0, 1).cross(direction).normalize();
  return start.clone()
    .lerp(end, fraction)
    .add(side.multiplyScalar(sideAmount))
    .add(new THREE.Vector3(0, 0, depthAmount));
}

function addFramework(group, anchors) {
  const { shoulder, elbow, wrist, hand } = anchors;
  addJoint(group, shoulder, 0.070, 'Shoulder interface');
  addJoint(group, elbow, 0.060, 'Elbow articulation');
  addJoint(group, wrist, 0.047, 'Wrist articulation');

  addRod(group, offsetBetween(shoulder, elbow, 0.08, -0.025), offsetBetween(shoulder, elbow, 0.92, -0.025), 0.017);
  addRod(group, offsetBetween(shoulder, elbow, 0.08, 0.025, 0.025), offsetBetween(shoulder, elbow, 0.92, 0.025, 0.025), 0.014);
  addRod(group, offsetBetween(elbow, wrist, 0.08, -0.022), offsetBetween(elbow, wrist, 0.92, -0.022), 0.015);
  addRod(group, offsetBetween(elbow, wrist, 0.08, 0.022, 0.022), offsetBetween(elbow, wrist, 0.92, 0.022, 0.022), 0.012);

  const direction = hand.clone().sub(wrist).normalize();
  const side = new THREE.Vector3(0, 0, 1).cross(direction).normalize();
  const palm = register(new THREE.Mesh(new THREE.BoxGeometry(0.13, wrist.distanceTo(hand) * 0.72, 0.055), makeMaterial()), 'Cyberhand proxy');
  placeAlongSegment(palm, wrist, hand);
  group.add(palm);

  const fingerBase = hand.clone().add(direction.clone().multiplyScalar(-0.01));
  [-0.045, -0.015, 0.015, 0.045].forEach((offset, index) => {
    const base = fingerBase.clone().add(side.clone().multiplyScalar(offset));
    const tip = base.clone().add(direction.clone().multiplyScalar(0.11 - index * 0.006));
    addRod(group, base, tip, 0.009, 'Articulated finger');
  });
  const thumbBase = wrist.clone().lerp(hand, 0.70).add(side.clone().multiplyScalar(-0.07));
  const thumbTip = thumbBase.clone().add(direction.clone().multiplyScalar(0.075)).add(side.clone().multiplyScalar(-0.035));
  addRod(group, thumbBase, thumbTip, 0.010, 'Articulated thumb');
}

async function loadPart(loader, group, part, anchors) {
  const url = `${ASSET_BASE}/${encodeURIComponent(part.file).replaceAll('%2F', '/')}`;
  try {
    const geometry = await loader.loadAsync(url);
    const start = anchors[part.from];
    const end = anchors[part.to];
    fitGeometryToSegment(geometry, start, end, part.width);
    const mesh = register(new THREE.Mesh(geometry, makeMaterial()), part.name);
    placeAlongSegment(mesh, start, end);
    group.add(mesh);
    state.loaded += 1;
    updateTag();
  } catch (error) {
    state.failed += 1;
    updateTag();
    console.warn(`Cyberware model part failed: ${part.name}`, error);
  }
}

function updateTag() {
  const tag = document.querySelector('.cyberware-demo-tag');
  if (!tag) return;
  const total = PARTS.length;
  const suffix = state.loaded + state.failed < total
    ? `fitting ${state.loaded}/${total}`
    : state.failed
      ? `${state.loaded}/${total} shells · framework fallback active`
      : `${state.loaded}/${total} shells fitted to anatomy`;
  tag.innerHTML = `<b>CYBERWARE MODEL TEST</b><br>${suffix}`;
}

function ensureTag() {
  const stage = document.querySelector('.anatomy-stage');
  if (!stage || stage.querySelector('.cyberware-demo-tag')) return;
  const tag = document.createElement('div');
  tag.className = 'cyberware-demo-tag';
  stage.appendChild(tag);
  updateTag();
}

function buildCyberware(viewer) {
  if (state.group) return true;
  const anchors = getArmAnchors(viewer);
  if (!anchors) return false;
  state.anchors = anchors;

  const group = new THREE.Group();
  group.name = 'medscan:cyberware-demo';
  group.visible = false;
  viewer.scene.add(group);
  state.group = group;

  addFramework(group, anchors);
  const loader = new STLLoader();
  PARTS.forEach((part) => loadPart(loader, group, part, anchors));
  ensureTag();
  return true;
}

async function showCyberware() {
  const viewer = state.viewer;
  if (!viewer) return;

  await viewer.selectMode('skeletal');
  if (!buildCyberware(viewer)) return;

  state.visible = true;
  state.group.visible = true;
  viewer.layers.forEach((layer) => {
    if (!layer.mesh.visible) return;
    layer.mesh.material.opacity = 0.11;
    layer.mesh.material.depthWrite = false;
  });

  document.querySelectorAll('.anatomy-mode').forEach((button) => {
    const active = button.dataset.anatomyMode === 'cyberware';
    button.classList.toggle('active', active);
    button.setAttribute('aria-pressed', String(active));
  });
  const title = document.querySelector('#anatomyModeTitle');
  const count = document.querySelector('#anatomyStructureCount');
  if (title) title.textContent = 'CYBERWARE';
  if (count) count.textContent = '001';
  document.querySelector('.cyberware-demo-tag')?.classList.add('show');
  selectCyberarm();
}

function hideCyberware() {
  if (!state.viewer || !state.group) return;
  state.visible = false;
  state.group.visible = false;
  document.querySelector('.cyberware-demo-tag')?.classList.remove('show');
}

function selectCyberarm() {
  const detail = {
    severity: document.querySelector('#severity'),
    title: document.querySelector('#detailTitle'),
    copy: document.querySelector('#detailCopy'),
    source: document.querySelector('#detailSource'),
    chipTitle: document.querySelector('#chipTitle'),
    chipMeta: document.querySelector('#chipMeta'),
  };
  if (detail.severity) detail.severity.textContent = '● Cyberware';
  if (detail.title) detail.title.textContent = 'RIGHT CYBERARM';
  if (detail.copy) detail.copy.textContent = 'Replacement-limb fit test. The mechanical assembly is anchored directly to the rendered right-arm anatomy rather than to guessed screen coordinates.';
  if (detail.source) detail.source.textContent = 'MODEL TEST · 9AKSHIT1 ROBOARM · MIT';
  if (detail.chipTitle) detail.chipTitle.textContent = 'RIGHT CYBERARM';
  if (detail.chipMeta) detail.chipMeta.textContent = 'replacement assembly · nominal';

  state.group?.traverse((object) => {
    if (!object.isMesh || !object.material) return;
    const materials = Array.isArray(object.material) ? object.material : [object.material];
    materials.forEach((material) => {
      if ('emissive' in material) material.emissive.set(0x5a0b08);
      if ('emissiveIntensity' in material) material.emissiveIntensity = 0.65;
    });
  });
  window.setTimeout(() => {
    state.group?.traverse((object) => {
      if (!object.isMesh || !object.material) return;
      const materials = Array.isArray(object.material) ? object.material : [object.material];
      materials.forEach((material) => {
        if ('emissive' in material) material.emissive.set(0x230807);
        if ('emissiveIntensity' in material) material.emissiveIntensity = 0.25;
      });
    });
  }, 340);
}

function bindUi(viewer) {
  document.querySelectorAll('.anatomy-mode').forEach((button) => {
    button.addEventListener('click', () => {
      if (button.dataset.anatomyMode === 'cyberware') window.setTimeout(showCyberware, 0);
      else hideCyberware();
    });
  });

  viewer.renderer.domElement.addEventListener('pointerup', () => {
    if (!state.visible) return;
    viewer.raycaster.setFromCamera(viewer.pointer, viewer.camera);
    if (viewer.raycaster.intersectObjects(state.pickMeshes, false).length) selectCyberarm();
  });
}

function init(viewer) {
  if (!viewer || state.viewer) return;
  state.viewer = viewer;
  addStyles();
  ensureTag();
  bindUi(viewer);
}

if (window.MedScanAnatomyViewer) init(window.MedScanAnatomyViewer);
else window.addEventListener('medscan:anatomy-ready', (event) => init(event.detail), { once: true });
