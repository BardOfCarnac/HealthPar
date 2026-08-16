import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

const DATA_BASE = 'https://cdn.jsdelivr.net/gh/DrMuratAltun/anatomi-simulatoru@37e85dfbbb398e11ba33c8f0e411f06f9bba592f/systems';

const MODES = {
  skeletal: {
    id: 'iskelet',
    label: 'SKELETAL',
    color: 0xe6dcc8,
    count: 277,
  },
  internal: {
    id: 'ic-organlar',
    label: 'INTERNAL',
    color: 0xc76557,
    count: 120,
  },
  vascular: {
    id: 'dolasim',
    label: 'VASCULAR',
    color: 0xd44840,
    count: 676,
  },
  neural: {
    id: 'sinir',
    label: 'NEURAL',
    color: 0xe2b83a,
    count: 582,
  },
};

const MODE_BY_SYSTEM = Object.fromEntries(
  Object.entries(MODES).map(([key, value]) => [value.id, key]),
);

const SIDE_LABELS = { l: 'LEFT', r: 'RIGHT', ol: 'LEFT OUTER', or: 'RIGHT OUTER' };

const CLINICAL = {
  fracture: {
    kind: 'CLINICAL FINDING',
    title: 'LEFT RADIUS',
    subtitle: 'Fracture · Moderate',
    rows: [
      ['TRAUMA', 'FRACTURE', true],
      ['STATE', 'UNTREATED'],
      ['VASCULAR', 'NO MAJOR COMPROMISE'],
    ],
  },
  implant: {
    kind: 'CYBERWARE',
    title: 'RIGHT ORBIT',
    subtitle: 'Optical implant · Functional',
    rows: [
      ['CLASS', 'OPTICAL IMPLANT'],
      ['STATE', 'FUNCTIONAL'],
      ['SERVICE', 'NO FAULTS REPORTED'],
    ],
  },
};

function parseStructureName(raw) {
  let name = (raw || '').trim();
  let side = null;
  const sideMatch = name.match(/\.(ol|or|l|r)$/i);
  if (sideMatch) {
    side = SIDE_LABELS[sideMatch[1].toLowerCase()] || null;
    name = name.slice(0, -sideMatch[0].length);
  }
  name = name.replace(/\.\d{3}$/, '').replace(/^\((.*)\)$/, '$1').replaceAll('_', ' ');
  return { name: name.trim(), side };
}

class MedscanAnatomy {
  constructor() {
    this.container = document.getElementById('canvas-container');
    this.modeTitle = document.getElementById('scan-mode-title');
    this.structureCount = document.getElementById('structure-count');
    this.loadingOverlay = document.getElementById('loading-overlay');
    this.loadingText = document.getElementById('loading-text');
    this.tooltip = document.getElementById('tooltip');
    this.viewLabel = document.getElementById('view-label');

    this.activeMode = 'skeletal';
    this.view = 'front';
    this.layers = new Map();
    this.loading = new Set();
    this.normalized = false;
    this.selected = null;
    this.hovered = null;
    this.pointer = new THREE.Vector2(-999, -999);
    this.pointerClient = { x: 0, y: 0 };
    this.pointerDown = { x: 0, y: 0, at: 0 };

    this.initScene();
    this.initEvents();
    this.animate = this.animate.bind(this);
    requestAnimationFrame(this.animate);

    this.selectMode('skeletal');
  }

  initScene() {
    const rect = this.container.getBoundingClientRect();
    const width = Math.max(1, Math.round(rect.width));
    const height = Math.max(1, Math.round(rect.height));

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(40, width / height, 0.05, 100);
    this.camera.position.set(0, 0.02, 5.4);

    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.setSize(width, height, false);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.1;
    this.renderer.domElement.setAttribute('aria-label', 'Interactive Medscan anatomy view');
    this.container.appendChild(this.renderer.domElement);

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.07;
    this.controls.enablePan = false;
    this.controls.enableZoom = true;
    this.controls.minDistance = 3.2;
    this.controls.maxDistance = 7.2;
    this.controls.minAzimuthAngle = -0.48;
    this.controls.maxAzimuthAngle = 0.48;
    this.controls.minPolarAngle = Math.PI * 0.42;
    this.controls.maxPolarAngle = Math.PI * 0.58;
    this.controls.target.set(0, 0, 0);

    this.bodyGroup = new THREE.Group();
    this.bodyPivot = new THREE.Group();
    this.markerGroup = new THREE.Group();
    this.bodyGroup.add(this.bodyPivot, this.markerGroup);
    this.scene.add(this.bodyGroup);

    this.raycaster = new THREE.Raycaster();
    this.loader = new GLTFLoader();

    this.scene.add(new THREE.HemisphereLight(0xf4efe3, 0x241f1b, 1.05));

    const key = new THREE.DirectionalLight(0xfff6e6, 2.2);
    key.position.set(3.4, 5.2, 4.5);
    this.scene.add(key);

    const rim = new THREE.DirectionalLight(0xe1b23c, 0.75);
    rim.position.set(-4.5, 1.8, -2.8);
    this.scene.add(rim);

    const red = new THREE.PointLight(0xcf312c, 0.75, 9);
    red.position.set(2.4, -0.4, 3.2);
    this.scene.add(red);

    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(this.container);
  }

  initEvents() {
    document.querySelectorAll('.mode-button').forEach((button) => {
      button.addEventListener('click', () => this.selectMode(button.dataset.mode));
    });

    document.getElementById('flip-view').addEventListener('click', () => {
      this.view = this.view === 'front' ? 'back' : 'front';
      this.viewLabel.textContent = this.view.toUpperCase();
      this.setView(this.view);
    });

    document.getElementById('reset-view').addEventListener('click', () => {
      this.view = 'front';
      this.viewLabel.textContent = 'FRONT';
      this.setView('front');
    });

    document.querySelectorAll('[data-clinical-marker]').forEach((button) => {
      button.addEventListener('click', () => {
        this.selectClinical(button.dataset.clinicalMarker);
        this.pulseMarker(button.dataset.clinicalMarker);
      });
    });

    const canvas = this.renderer.domElement;
    canvas.addEventListener('pointermove', (event) => this.updatePointer(event));
    canvas.addEventListener('pointerleave', () => {
      this.pointer.set(-999, -999);
      this.hovered = null;
      this.tooltip.style.opacity = '0';
      this.repaintAll();
    });
    canvas.addEventListener('pointerdown', (event) => {
      this.updatePointer(event);
      this.pointerDown = { x: event.clientX, y: event.clientY, at: performance.now() };
    });
    canvas.addEventListener('pointerup', (event) => {
      this.updatePointer(event);
      const distance = Math.hypot(event.clientX - this.pointerDown.x, event.clientY - this.pointerDown.y);
      if (distance < 7 && performance.now() - this.pointerDown.at < 350) this.pick();
    });
  }

  updatePointer(event) {
    const rect = this.renderer.domElement.getBoundingClientRect();
    this.pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    this.pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
    this.pointerClient = { x: event.clientX, y: event.clientY };
  }

  resize() {
    const rect = this.container.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    this.camera.aspect = rect.width / rect.height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(rect.width, rect.height, false);
    this.setView(this.view, false);
  }

  async selectMode(modeKey) {
    if (!MODES[modeKey]) return;
    this.activeMode = modeKey;
    const mode = MODES[modeKey];

    document.querySelectorAll('.mode-button').forEach((button) => {
      button.classList.toggle('active', button.dataset.mode === modeKey);
      button.setAttribute('aria-pressed', String(button.dataset.mode === modeKey));
    });

    this.modeTitle.textContent = mode.label;
    this.structureCount.textContent = String(mode.count).padStart(3, '0');

    try {
      await this.loadSystem(mode.id);
      this.applyVisibility();
      this.repaintAll();
    } catch (error) {
      console.error(error);
      this.loadingText.textContent = 'SCAN LINK ERROR — CHECK NETWORK';
      this.loadingOverlay.classList.remove('hidden');
    }
  }

  async loadSystem(systemId) {
    if (this.layers.has(systemId)) return this.layers.get(systemId);
    if (this.loading.has(systemId)) return null;

    this.loading.add(systemId);
    const modeKey = MODE_BY_SYSTEM[systemId];
    const mode = MODES[modeKey];
    this.setLoading(true, `LOADING ${mode.label} DATA…`);

    try {
      const gltf = await this.loader.loadAsync(`${DATA_BASE}/${systemId}.glb`);
      gltf.scene.updateMatrixWorld(true);

      const json = gltf.parser.json;
      const associations = gltf.parser.associations;
      const names = [];
      const geometries = [];

      const originalName = (object) => {
        const association = associations.get(object);
        if (association?.nodes !== undefined && json.nodes?.[association.nodes]) {
          return json.nodes[association.nodes].name || object.name;
        }
        return object.name;
      };

      gltf.scene.traverse((child) => {
        if (!child.isMesh) return;

        const geometry = child.geometry.clone();
        geometry.applyMatrix4(child.matrixWorld);
        geometry.deleteAttribute('uv');
        geometry.deleteAttribute('tangent');
        if (!geometry.attributes.normal) geometry.computeVertexNormals();

        const structureId = names.length;
        names.push(originalName(child) || `Structure ${structureId}`);
        geometry.setAttribute(
          'structureId',
          new THREE.BufferAttribute(new Float32Array(geometry.attributes.position.count).fill(structureId), 1),
        );
        geometries.push(geometry);
      });

      const merged = mergeGeometries(geometries);
      geometries.forEach((geometry) => geometry.dispose());

      const color = new THREE.Color(mode.color);
      const colors = new Float32Array(merged.attributes.position.count * 3);
      merged.setAttribute('color', new THREE.BufferAttribute(colors, 3));

      const material = new THREE.MeshStandardMaterial({
        vertexColors: true,
        roughness: 0.66,
        metalness: 0.02,
        transparent: true,
        opacity: 1,
        side: THREE.DoubleSide,
      });

      const mesh = new THREE.Mesh(merged, material);
      mesh.name = `medscan:${systemId}`;
      mesh.userData.systemId = systemId;
      this.bodyPivot.add(mesh);

      const layer = {
        systemId,
        modeKey,
        names,
        mesh,
        structureIds: merged.attributes.structureId.array,
        colorAttr: merged.attributes.color,
        baseColor: color,
      };

      this.layers.set(systemId, layer);

      if (!this.normalized) {
        this.normalizeBody();
        this.createClinicalMarkers();
      }

      return layer;
    } finally {
      this.loading.delete(systemId);
      if (this.loading.size === 0) this.setLoading(false);
    }
  }

  normalizeBody() {
    const box = new THREE.Box3().setFromObject(this.bodyPivot);
    const size = box.getSize(new THREE.Vector3());
    const center = box.getCenter(new THREE.Vector3());
    if (size.y < 0.001) return;

    const height = 3.45;
    const scale = height / size.y;
    this.bodyPivot.scale.setScalar(scale);
    this.bodyPivot.position.set(-center.x * scale, -center.y * scale, -center.z * scale);
    this.bodyHeight = height;
    this.normalized = true;
    this.setView('front', false);
  }

  applyVisibility() {
    const activeSystem = MODES[this.activeMode].id;
    this.layers.forEach((layer) => {
      const isActive = layer.systemId === activeSystem;
      const isContextSkeleton = this.activeMode !== 'skeletal' && layer.systemId === MODES.skeletal.id;
      layer.mesh.visible = isActive || isContextSkeleton;
      layer.mesh.material.opacity = isActive ? 1 : 0.11;
      layer.mesh.material.depthWrite = isActive;
      layer.mesh.renderOrder = isActive ? 2 : 1;
    });
  }

  repaintLayer(layer) {
    const isActive = layer.systemId === MODES[this.activeMode].id;
    const selectedId = this.selected?.systemId === layer.systemId ? this.selected.structureId : -1;
    const hoverId = this.hovered?.systemId === layer.systemId ? this.hovered.structureId : -1;

    if (!layer.shades) {
      layer.shades = new Float32Array(layer.names.length);
      for (let i = 0; i < layer.names.length; i += 1) {
        const baseName = parseStructureName(layer.names[i]).name;
        let hash = 0;
        for (let c = 0; c < baseName.length; c += 1) hash = (hash * 31 + baseName.charCodeAt(c)) % 100003;
        layer.shades[i] = 0.82 + 0.27 * (hash / 100003);
      }
    }

    const colors = layer.colorAttr.array;
    const ids = layer.structureIds;
    const base = layer.baseColor;
    const dim = isActive ? 1 : 0.5;

    for (let i = 0; i < ids.length; i += 1) {
      const sid = ids[i];
      const shade = layer.shades[sid] * dim;
      let r = base.r * shade;
      let g = base.g * shade;
      let b = base.b * shade;

      if (sid === selectedId) {
        r = 1.0; g = 0.25; b = 0.18;
      } else if (sid === hoverId) {
        r = Math.min(1, r * 1.35 + 0.16);
        g = Math.min(1, g * 1.35 + 0.16);
        b = Math.min(1, b * 1.35 + 0.16);
      }

      colors[i * 3] = r;
      colors[i * 3 + 1] = g;
      colors[i * 3 + 2] = b;
    }

    layer.colorAttr.needsUpdate = true;
  }

  repaintAll() {
    this.layers.forEach((layer) => this.repaintLayer(layer));
  }

  hover() {
    const targets = [];
    this.layers.forEach((layer) => {
      if (layer.mesh.visible) targets.push(layer.mesh);
    });
    if (!targets.length) return;

    this.raycaster.setFromCamera(this.pointer, this.camera);
    const hits = this.raycaster.intersectObjects(targets, false);

    if (!hits.length) {
      if (this.hovered) {
        this.hovered = null;
        this.repaintAll();
      }
      this.tooltip.style.opacity = '0';
      return;
    }

    const hit = hits[0];
    const layer = this.layers.get(hit.object.userData.systemId);
    if (!layer || !hit.face) return;

    const vertexIndex = this.nearestVertex(hit);
    const structureId = layer.structureIds[vertexIndex];

    if (!this.hovered || this.hovered.systemId !== layer.systemId || this.hovered.structureId !== structureId) {
      this.hovered = { systemId: layer.systemId, structureId };
      this.repaintAll();
    }

    const parsed = parseStructureName(layer.names[structureId]);
    this.tooltip.textContent = [parsed.side, parsed.name].filter(Boolean).join(' · ');
    this.tooltip.style.left = `${this.pointerClient.x}px`;
    this.tooltip.style.top = `${this.pointerClient.y}px`;
    this.tooltip.style.opacity = '1';
  }

  nearestVertex(hit) {
    const positions = hit.object.geometry.attributes.position;
    const temp = new THREE.Vector3();
    let best = hit.face.a;
    let bestDistance = Infinity;

    for (const index of [hit.face.a, hit.face.b, hit.face.c]) {
      temp.fromBufferAttribute(positions, index).applyMatrix4(hit.object.matrixWorld);
      const distance = temp.distanceToSquared(hit.point);
      if (distance < bestDistance) {
        bestDistance = distance;
        best = index;
      }
    }
    return best;
  }

  pick() {
    this.raycaster.setFromCamera(this.pointer, this.camera);

    const markerHits = this.raycaster.intersectObjects(this.markerGroup.children, false);
    if (markerHits.length) {
      const markerId = markerHits[0].object.userData.markerId;
      if (markerId) {
        this.selectClinical(markerId);
        this.pulseMarker(markerId);
        return;
      }
    }

    if (!this.hovered) return;
    const layer = this.layers.get(this.hovered.systemId);
    if (!layer) return;

    this.selected = { ...this.hovered };
    this.repaintAll();

    const parsed = parseStructureName(layer.names[this.selected.structureId]);
    const modeLabel = MODES[layer.modeKey]?.label || 'ANATOMY';
    this.setDetail({
      kind: `${modeLabel} STRUCTURE`,
      title: [parsed.side, parsed.name].filter(Boolean).join(' '),
      subtitle: 'Anatomical structure selected',
      rows: [
        ['SYSTEM', modeLabel],
        ['STRUCTURE ID', String(this.selected.structureId).padStart(3, '0')],
        ['CLINICAL LINK', 'NO RECORDED EVENT'],
      ],
    });
  }

  createClinicalMarkers() {
    const fracture = this.makeMarker(0xcf312c, 'fracture');
    fracture.position.set(-0.72, -0.04, 0.20);
    this.markerGroup.add(fracture);

    const implant = this.makeMarker(0xe7bb35, 'implant');
    implant.position.set(0.13, 1.36, 0.20);
    implant.scale.setScalar(0.82);
    this.markerGroup.add(implant);
  }

  makeMarker(color, markerId) {
    const geometry = new THREE.TorusGeometry(0.095, 0.019, 12, 40);
    const material = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.95, depthTest: false });
    const marker = new THREE.Mesh(geometry, material);
    marker.userData.markerId = markerId;
    marker.renderOrder = 20;

    const core = new THREE.Mesh(
      new THREE.CircleGeometry(0.035, 24),
      new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.7, depthTest: false }),
    );
    core.position.z = 0.002;
    core.userData.markerId = markerId;
    core.renderOrder = 21;
    marker.add(core);

    return marker;
  }

  pulseMarker(markerId) {
    const marker = this.markerGroup.children.find((child) => child.userData.markerId === markerId);
    if (!marker) return;
    marker.userData.pulseStart = performance.now();
  }

  updateMarkerPulse() {
    const now = performance.now();
    this.markerGroup.children.forEach((marker) => {
      if (!marker.userData.pulseStart) return;
      const progress = Math.min(1, (now - marker.userData.pulseStart) / 700);
      const scale = 1 + Math.sin(progress * Math.PI) * 0.45;
      marker.scale.setScalar(marker.userData.markerId === 'implant' ? scale * 0.82 : scale);
      if (progress >= 1) {
        marker.userData.pulseStart = 0;
        marker.scale.setScalar(marker.userData.markerId === 'implant' ? 0.82 : 1);
      }
    });
  }

  selectClinical(markerId) {
    const finding = CLINICAL[markerId];
    if (finding) this.setDetail(finding);
  }

  setDetail({ kind, title, subtitle, rows }) {
    document.getElementById('detail-kind').textContent = kind;
    document.getElementById('detail-title').textContent = title;
    document.getElementById('detail-subtitle').textContent = subtitle;
    document.getElementById('detail-body').innerHTML = rows.map(([label, value, critical]) => `
      <div class="finding-row${critical ? ' critical' : ''}">
        <span>${escapeHtml(label)}</span>
        <strong>${escapeHtml(value)}</strong>
      </div>
    `).join('');
  }

  setView(view, animate = true) {
    const height = this.bodyHeight || 3.45;
    const aspect = Math.max(this.camera.aspect, 0.42);
    const halfWidth = height * 0.30;
    const verticalFov = THREE.MathUtils.degToRad(this.camera.fov);
    const fit = halfWidth / (Math.tan(verticalFov / 2) * aspect);
    const distance = Math.max(height * 1.48, fit * 1.05);
    const z = view === 'front' ? distance : -distance;
    const targetPosition = new THREE.Vector3(0, 0, z);
    const target = new THREE.Vector3(0, 0, 0);

    this.controls.minAzimuthAngle = view === 'front' ? -0.48 : Math.PI - 0.48;
    this.controls.maxAzimuthAngle = view === 'front' ? 0.48 : Math.PI + 0.48;

    if (!animate) {
      this.camera.position.copy(targetPosition);
      this.controls.target.copy(target);
      this.controls.update();
      return;
    }

    const startPosition = this.camera.position.clone();
    const startTarget = this.controls.target.clone();
    const started = performance.now();
    const duration = 520;

    const step = () => {
      const p = Math.min(1, (performance.now() - started) / duration);
      const eased = 0.5 - Math.cos(p * Math.PI) / 2;
      this.camera.position.lerpVectors(startPosition, targetPosition, eased);
      this.controls.target.lerpVectors(startTarget, target, eased);
      this.controls.update();
      if (p < 1) requestAnimationFrame(step);
    };
    step();
  }

  setLoading(on, text = '') {
    if (text) this.loadingText.textContent = text;
    this.loadingOverlay.classList.toggle('hidden', !on);
  }

  animate() {
    requestAnimationFrame(this.animate);
    this.hover();
    this.updateMarkerPulse();
    this.controls.update();
    this.renderer.render(this.scene, this.camera);
  }
}

function mergeGeometries(geometries) {
  let vertexCount = 0;
  let indexCount = 0;

  for (const geometry of geometries) {
    vertexCount += geometry.attributes.position.count;
    indexCount += geometry.index ? geometry.index.count : geometry.attributes.position.count;
  }

  const positions = new Float32Array(vertexCount * 3);
  const normals = new Float32Array(vertexCount * 3);
  const structureIds = new Float32Array(vertexCount);
  const indices = vertexCount > 65535 ? new Uint32Array(indexCount) : new Uint16Array(indexCount);

  let vertexOffset = 0;
  let indexOffset = 0;

  for (const geometry of geometries) {
    const position = geometry.attributes.position;
    const normal = geometry.attributes.normal;
    const structureId = geometry.attributes.structureId;
    const count = position.count;

    positions.set(position.array.subarray(0, count * 3), vertexOffset * 3);
    if (normal) normals.set(normal.array.subarray(0, count * 3), vertexOffset * 3);
    structureIds.set(structureId.array.subarray(0, count), vertexOffset);

    if (geometry.index) {
      const source = geometry.index.array;
      for (let i = 0; i < source.length; i += 1) indices[indexOffset + i] = source[i] + vertexOffset;
      indexOffset += source.length;
    } else {
      for (let i = 0; i < count; i += 1) indices[indexOffset + i] = vertexOffset + i;
      indexOffset += count;
    }

    vertexOffset += count;
  }

  const merged = new THREE.BufferGeometry();
  merged.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  merged.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
  merged.setAttribute('structureId', new THREE.BufferAttribute(structureIds, 1));
  merged.setIndex(new THREE.BufferAttribute(indices, 1));
  merged.computeBoundingSphere();
  return merged;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

new MedscanAnatomy();
