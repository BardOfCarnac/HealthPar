import * as THREE from 'three';
import { STLLoader } from 'three/addons/loaders/STLLoader.js';

const ASSET_BASE = 'https://cdn.jsdelivr.net/gh/9Akshit1/RoboArm@main/CAD';
const PARTS = [
  { name: 'Shoulder interface', file: 'Human Arm Base.stl', length: 0.27, position: [-0.63, 0.91, 0.035] },
  { name: 'Upper arm shell A', file: 'Human Arm First Link - Half 1.stl', length: 0.58, position: [-0.68, 0.57, 0.035] },
  { name: 'Upper arm shell B', file: 'Human Arm First Link - Half 2.stl', length: 0.58, position: [-0.68, 0.57, 0.035] },
  { name: 'Forearm shell A', file: 'Human Arm Second Link - Half 1.stl', length: 0.54, position: [-0.70, -0.01, 0.04] },
  { name: 'Forearm shell B', file: 'Human Arm Second Link - Half 2.stl', length: 0.54, position: [-0.70, -0.01, 0.04] },
  { name: 'Wrist', file: 'Wrist.stl', length: 0.16, position: [-0.70, -0.37, 0.04] },
];

const state = {
  viewer: null,
  group: null,
  pickMeshes: [],
  visible: false,
  loaded: 0,
  failed: 0,
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

function orientAlongY(geometry) {
  geometry.computeBoundingBox();
  const size = geometry.boundingBox.getSize(new THREE.Vector3());
  if (size.x >= size.y && size.x >= size.z) geometry.rotateZ(Math.PI / 2);
  else if (size.z >= size.x && size.z >= size.y) geometry.rotateX(-Math.PI / 2);
  geometry.center();
  geometry.computeVertexNormals();
  geometry.computeBoundingBox();
}

function normalizePart(geometry, targetLength) {
  orientAlongY(geometry);
  const size = geometry.boundingBox.getSize(new THREE.Vector3());
  const scale = targetLength / Math.max(size.y, 0.001);
  geometry.scale(scale, scale, scale);
  geometry.computeBoundingSphere();
  return geometry;
}

function meshFromGeometry(geometry, part) {
  const mesh = new THREE.Mesh(geometry, makeMaterial());
  mesh.position.fromArray(part.position);
  mesh.userData.cyberware = true;
  mesh.userData.cyberwareLabel = part.name;
  mesh.castShadow = false;
  mesh.receiveShadow = false;
  mesh.renderOrder = 7;
  return mesh;
}

function addRod(group, a, b, radius = 0.025) {
  const start = new THREE.Vector3(...a);
  const end = new THREE.Vector3(...b);
  const direction = end.clone().sub(start);
  const length = direction.length();
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, length, 12), makeMaterial());
  mesh.position.copy(start).add(end).multiplyScalar(0.5);
  mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction.normalize());
  mesh.userData.cyberware = true;
  mesh.userData.cyberwareLabel = 'Internal actuator';
  mesh.renderOrder = 6;
  group.add(mesh);
  state.pickMeshes.push(mesh);
}

function addJoint(group, position, radius = 0.075) {
  const joint = new THREE.Mesh(
    new THREE.TorusGeometry(radius, 0.017, 12, 34),
    new THREE.MeshStandardMaterial({ color: 0xd7dad9, metalness: 0.75, roughness: 0.26, emissive: 0x350705, emissiveIntensity: 0.3 }),
  );
  joint.position.fromArray(position);
  joint.rotation.x = Math.PI / 2;
  joint.userData.cyberware = true;
  joint.userData.cyberwareLabel = 'Articulation ring';
  joint.renderOrder = 8;
  group.add(joint);
  state.pickMeshes.push(joint);
}

function addFallbackFramework(group) {
  addJoint(group, [-0.63, 0.91, 0.07], 0.085);
  addJoint(group, [-0.70, 0.27, 0.07], 0.072);
  addJoint(group, [-0.70, -0.38, 0.07], 0.055);
  addRod(group, [-0.65, 0.86, 0.04], [-0.69, 0.33, 0.04], 0.022);
  addRod(group, [-0.61, 0.85, 0.09], [-0.66, 0.34, 0.09], 0.018);
  addRod(group, [-0.69, 0.21, 0.04], [-0.70, -0.31, 0.04], 0.019);
  addRod(group, [-0.65, 0.20, 0.09], [-0.66, -0.31, 0.09], 0.016);

  const palm = new THREE.Mesh(new THREE.BoxGeometry(0.17, 0.16, 0.07), makeMaterial());
  palm.position.set(-0.70, -0.50, 0.055);
  palm.rotation.z = -0.05;
  palm.userData.cyberware = true;
  palm.userData.cyberwareLabel = 'Cyberhand proxy';
  group.add(palm);
  state.pickMeshes.push(palm);

  const fingerXs = [-0.76, -0.72, -0.68, -0.64];
  fingerXs.forEach((x, index) => {
    const length = 0.13 - index * 0.007;
    addRod(group, [x, -0.57, 0.055], [x + 0.005, -0.57 - length, 0.055], 0.012);
  });
  addRod(group, [-0.77, -0.51, 0.055], [-0.84, -0.60, 0.055], 0.014);
}

async function loadPart(loader, group, part) {
  const url = `${ASSET_BASE}/${encodeURIComponent(part.file).replaceAll('%2F', '/')}`;
  try {
    const geometry = await loader.loadAsync(url);
    normalizePart(geometry, part.length);
    const mesh = meshFromGeometry(geometry, part);
    group.add(mesh);
    state.pickMeshes.push(mesh);
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
    ? `loading ${state.loaded}/${total}`
    : state.failed
      ? `${state.loaded}/${total} model parts · proxy fallback active`
      : `${state.loaded}/${total} model parts loaded`;
  tag.innerHTML = `<b>CYBERWARE MODEL TEST</b><br>${suffix}`;
}

function buildCyberware(viewer) {
  const group = new THREE.Group();
  group.name = 'medscan:cyberware-demo';
  group.visible = false;
  viewer.scene.add(group);
  state.group = group;

  addFallbackFramework(group);

  const loader = new STLLoader();
  PARTS.forEach((part) => loadPart(loader, group, part));

  const stage = document.querySelector('.anatomy-stage');
  if (stage && !stage.querySelector('.cyberware-demo-tag')) {
    const tag = document.createElement('div');
    tag.className = 'cyberware-demo-tag';
    stage.appendChild(tag);
    updateTag();
  }
}

function showCyberware() {
  const viewer = state.viewer;
  if (!viewer || !state.group) return;
  state.visible = true;
  state.group.visible = true;

  viewer.selectMode('skeletal').then(() => {
    viewer.layers.forEach((layer) => {
      if (!layer.mesh.visible) return;
      layer.mesh.material.opacity = 0.11;
      layer.mesh.material.depthWrite = false;
    });
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
  if (detail.copy) detail.copy.textContent = 'Replacement-limb model test. Bright mechanical geometry occupies the arm while the biological scan is reduced to a registration ghost. Tap the arm to reselect it.';
  if (detail.source) detail.source.textContent = 'MODEL TEST · 9AKSHIT1 ROBOARM · MIT';
  if (detail.chipTitle) detail.chipTitle.textContent = 'RIGHT CYBERARM';
  if (detail.chipMeta) detail.chipMeta.textContent = 'replacement assembly · nominal';

  if (!state.group) return;
  state.group.traverse((object) => {
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
      if (button.dataset.anatomyMode === 'cyberware') {
        window.setTimeout(showCyberware, 0);
      } else {
        hideCyberware();
      }
    });
  });

  const canvas = viewer.renderer.domElement;
  canvas.addEventListener('pointerup', () => {
    if (!state.visible) return;
    viewer.raycaster.setFromCamera(viewer.pointer, viewer.camera);
    const hits = viewer.raycaster.intersectObjects(state.pickMeshes, false);
    if (hits.length) selectCyberarm();
  });
}

function init(viewer) {
  if (!viewer || state.viewer) return;
  state.viewer = viewer;
  addStyles();
  buildCyberware(viewer);
  bindUi(viewer);
}

if (window.MedScanAnatomyViewer) init(window.MedScanAnatomyViewer);
else window.addEventListener('medscan:anatomy-ready', (event) => init(event.detail), { once: true });
