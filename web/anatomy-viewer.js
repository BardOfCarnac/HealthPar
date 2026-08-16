import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { ANATOMY_SYSTEMS, ZONE_ANCHORS, normalizeStructureName, resolveStructureIndex } from './anatomy-anchors.js';

const DATA_BASE = 'https://cdn.jsdelivr.net/gh/DrMuratAltun/anatomi-simulatoru@37e85dfbbb398e11ba33c8f0e411f06f9bba592f/systems';
const MODE_BY_SYSTEM = Object.fromEntries(Object.entries(ANATOMY_SYSTEMS).map(([key, value]) => [value.id, key]));
const SIDE_LABELS = { l: 'LEFT', r: 'RIGHT', ol: 'LEFT OUTER', or: 'RIGHT OUTER' };

function parseStructureName(raw) {
  let name = normalizeStructureName(raw);
  let side = null;
  const match = name.match(/\.(ol|or|l|r)$/i);
  if (match) {
    side = SIDE_LABELS[match[1].toLowerCase()] ?? null;
    name = name.slice(0, -match[0].length);
  }
  return { name, side };
}

function markerColor(finding) {
  if (finding.source === 'cyberware') return 0xe7bb35;
  if (finding.severity === 'critical') return 0xcf312c;
  if (finding.severity === 'moderate') return 0xe1742c;
  return 0xe7bb35;
}

export class MedscanAnatomyViewer {
  constructor({ container, tooltip, modeTitle, structureCount, loadingOverlay, loadingText, onFindingSelected, onStructureSelected } = {}) {
    this.container = container;
    this.tooltip = tooltip;
    this.modeTitle = modeTitle;
    this.structureCount = structureCount;
    this.loadingOverlay = loadingOverlay;
    this.loadingText = loadingText;
    this.onFindingSelected = onFindingSelected ?? (() => {});
    this.onStructureSelected = onStructureSelected ?? (() => {});

    this.activeMode = 'skeletal';
    this.layers = new Map();
    this.loading = new Set();
    this.findings = [];
    this.markerMeshes = new Map();
    this.centroidCache = new Map();
    this.normalized = false;
    this.selected = null;
    this.pointer = new THREE.Vector2(-999, -999);
    this.pointerClient = { x: 0, y: 0 };
    this.pointerDown = { x: 0, y: 0, at: 0 };
    this.previewScheduled = false;
    this.view = 'front';

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

    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.setSize(width, height, false);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.renderer.domElement.setAttribute('aria-label', 'Interactive Medscan anatomy view');
    this.container.appendChild(this.renderer.domElement);

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.07;
    this.controls.enablePan = false;
    this.controls.enableZoom = true;
    this.controls.minDistance = 3.2;
    this.controls.maxDistance = 7.2;
    this.controls.minPolarAngle = Math.PI * 0.42;
    this.controls.maxPolarAngle = Math.PI * 0.58;
    this.controls.target.set(0, 0, 0);

    this.bodyPivot = new THREE.Group();
    this.markerGroup = new THREE.Group();
    this.scene.add(this.bodyPivot, this.markerGroup);

    this.raycaster = new THREE.Raycaster();
    this.loader = new GLTFLoader();

    this.scene.add(new THREE.HemisphereLight(0xf4efe3, 0x241f1b, 1.05));
    const key = new THREE.DirectionalLight(0xfff6e6, 2.15);
    key.position.set(3.4, 5.2, 4.5);
    this.scene.add(key);
    const rim = new THREE.DirectionalLight(0xe1b23c, 0.72);
    rim.position.set(-4.5, 1.8, -2.8);
    this.scene.add(rim);
    const red = new THREE.PointLight(0xcf312c, 0.68, 9);
    red.position.set(2.4, -0.4, 3.2);
    this.scene.add(red);

    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(this.container);
  }

  initEvents() {
    const canvas = this.renderer.domElement;
    canvas.addEventListener('pointermove', (event) => {
      this.updatePointer(event);
      if (event.pointerType !== 'touch') this.schedulePreview();
    });
    canvas.addEventListener('pointerleave', () => {
      this.pointer.set(-999, -999);
      if (this.tooltip) this.tooltip.style.opacity = '0';
    });
    canvas.addEventListener('pointerdown', (event) => {
      this.updatePointer(event);
      this.pointerDown = { x: event.clientX, y: event.clientY, at: performance.now() };
    });
    canvas.addEventListener('pointerup', (event) => {
      this.updatePointer(event);
      const distance = Math.hypot(event.clientX - this.pointerDown.x, event.clientY - this.pointerDown.y);
      if (distance < 8 && performance.now() - this.pointerDown.at < 450) this.pick();
    });
  }

  updatePointer(event) {
    const rect = this.renderer.domElement.getBoundingClientRect();
    this.pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    this.pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
    this.pointerClient = { x: event.clientX, y: event.clientY };
  }

  schedulePreview() {
    if (this.previewScheduled) return;
    this.previewScheduled = true;
    requestAnimationFrame(() => {
      this.previewScheduled = false;
      this.preview();
    });
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
    const mode = ANATOMY_SYSTEMS[modeKey];
    if (!mode) return;
    this.activeMode = modeKey;
    this.modeTitle && (this.modeTitle.textContent = mode.label);
    this.structureCount && (this.structureCount.textContent = String(mode.count).padStart(3, '0'));

    try {
      await this.loadSystem(mode.id);
      this.applyVisibility();
      this.paintAll();
      this.refreshMarkers();
    } catch (error) {
      console.error(error);
      this.setLoading(true, 'SCAN LINK ERROR — CHECK NETWORK');
    }
  }

  async loadSystem(systemId) {
    if (this.layers.has(systemId)) return this.layers.get(systemId);
    if (this.loading.has(systemId)) return null;

    const modeKey = MODE_BY_SYSTEM[systemId];
    const mode = ANATOMY_SYSTEMS[modeKey];
    this.loading.add(systemId);
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
        if (association?.nodes !== undefined && json.nodes?.[association.nodes]) return json.nodes[association.nodes].name || object.name;
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
        geometry.setAttribute('structureId', new THREE.BufferAttribute(new Float32Array(geometry.attributes.position.count).fill(structureId), 1));
        geometries.push(geometry);
      });

      const merged = mergeGeometries(geometries);
      geometries.forEach((geometry) => geometry.dispose());
      const color = new THREE.Color(mode.color);
      merged.setAttribute('color', new THREE.BufferAttribute(new Float32Array(merged.attributes.position.count * 3), 3));
      const material = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.66, metalness: 0.02, transparent: true, opacity: 1, side: THREE.DoubleSide });
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

      if (!this.normalized) this.normalizeBody();
      this.paintLayer(layer);
      this.refreshMarkers();
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
    this.bodyPivot.updateMatrixWorld(true);
    this.bodyHeight = height;
    this.normalized = true;
    this.setView('front', false);
  }

  applyVisibility() {
    const activeSystem = ANATOMY_SYSTEMS[this.activeMode].id;
    this.layers.forEach((layer) => {
      const active = layer.systemId === activeSystem;
      const skeletonContext = this.activeMode !== 'skeletal' && layer.systemId === ANATOMY_SYSTEMS.skeletal.id;
      layer.mesh.visible = active || skeletonContext;
      layer.mesh.material.opacity = active ? 1 : 0.10;
      layer.mesh.material.depthWrite = active;
      layer.mesh.renderOrder = active ? 2 : 1;
    });
  }

  paintLayer(layer) {
    const colors = layer.colorAttr.array;
    const ids = layer.structureIds;
    const base = layer.baseColor;
    const selectedId = this.selected?.systemId === layer.systemId ? this.selected.structureId : -1;
    if (!layer.shades) {
      layer.shades = new Float32Array(layer.names.length);
      for (let i = 0; i < layer.names.length; i += 1) {
        const name = normalizeStructureName(layer.names[i]);
        let hash = 0;
        for (let c = 0; c < name.length; c += 1) hash = (hash * 31 + name.charCodeAt(c)) % 100003;
        layer.shades[i] = 0.82 + 0.24 * (hash / 100003);
      }
    }
    for (let i = 0; i < ids.length; i += 1) {
      const sid = ids[i];
      if (sid === selectedId) {
        colors[i * 3] = 1; colors[i * 3 + 1] = 0.25; colors[i * 3 + 2] = 0.18;
      } else {
        const shade = layer.shades[sid];
        colors[i * 3] = base.r * shade;
        colors[i * 3 + 1] = base.g * shade;
        colors[i * 3 + 2] = base.b * shade;
      }
    }
    layer.colorAttr.needsUpdate = true;
  }

  paintAll() { this.layers.forEach((layer) => this.paintLayer(layer)); }

  preview() {
    const hit = this.raycastStructure();
    if (!this.tooltip) return;
    if (!hit) {
      this.tooltip.style.opacity = '0';
      return;
    }
    const parsed = parseStructureName(hit.layer.names[hit.structureId]);
    this.tooltip.textContent = [parsed.side, parsed.name].filter(Boolean).join(' · ');
    this.tooltip.style.left = `${this.pointerClient.x}px`;
    this.tooltip.style.top = `${this.pointerClient.y}px`;
    this.tooltip.style.opacity = '1';
  }

  pick() {
    this.raycaster.setFromCamera(this.pointer, this.camera);
    const markerHits = this.raycaster.intersectObjects([...this.markerMeshes.values()], false);
    if (markerHits.length) {
      const findingId = markerHits[0].object.userData.findingId;
      const finding = this.findings.find((item) => item.id === findingId);
      if (finding) this.onFindingSelected(finding);
      return;
    }

    const hit = this.raycastStructure();
    if (!hit) return;
    this.selected = { systemId: hit.layer.systemId, structureId: hit.structureId };
    this.paintAll();
    const parsed = parseStructureName(hit.layer.names[hit.structureId]);
    this.onStructureSelected({
      system: hit.layer.modeKey,
      systemId: hit.layer.systemId,
      structureId: hit.structureId,
      rawName: hit.layer.names[hit.structureId],
      name: parsed.name,
      side: parsed.side,
    });
  }

  raycastStructure() {
    const targets = [];
    this.layers.forEach((layer) => { if (layer.mesh.visible) targets.push(layer.mesh); });
    if (!targets.length) return null;
    this.raycaster.setFromCamera(this.pointer, this.camera);
    const hit = this.raycaster.intersectObjects(targets, false)[0];
    if (!hit?.face) return null;
    const layer = this.layers.get(hit.object.userData.systemId);
    if (!layer) return null;
    const positions = hit.object.geometry.attributes.position;
    const temp = new THREE.Vector3();
    let best = hit.face.a;
    let bestDistance = Infinity;
    for (const index of [hit.face.a, hit.face.b, hit.face.c]) {
      temp.fromBufferAttribute(positions, index).applyMatrix4(hit.object.matrixWorld);
      const distance = temp.distanceToSquared(hit.point);
      if (distance < bestDistance) { bestDistance = distance; best = index; }
    }
    return { hit, layer, structureId: layer.structureIds[best] };
  }

  setFindings(findings = []) {
    this.findings = structuredClone(findings);
    this.refreshMarkers();
  }

  refreshMarkers() {
    for (const marker of this.markerMeshes.values()) {
      marker.geometry.dispose();
      marker.material.dispose();
      this.markerGroup.remove(marker);
    }
    this.markerMeshes.clear();

    for (const finding of this.findings) {
      const anchor = this.resolveFindingAnchor(finding);
      if (!anchor) continue;
      const marker = this.makeMarker(markerColor(finding), finding.id);
      marker.position.copy(anchor.position);
      marker.userData.anchor = { system: anchor.layer.modeKey, structureId: anchor.structureId, structureName: anchor.layer.names[anchor.structureId] };
      this.markerGroup.add(marker);
      this.markerMeshes.set(finding.id, marker);
    }
  }

  resolveFindingAnchor(finding) {
    const candidates = ZONE_ANCHORS[finding.zone] ?? [];
    const ordered = [...candidates].sort((a, b) => (a.system === this.activeMode ? -1 : 0) - (b.system === this.activeMode ? -1 : 0));
    for (const candidate of ordered) {
      const mode = ANATOMY_SYSTEMS[candidate.system];
      const layer = this.layers.get(mode.id);
      if (!layer) continue;
      const structureId = resolveStructureIndex(layer.names, finding.zone, candidate.system);
      if (structureId < 0) continue;
      return { layer, structureId, position: this.structureCentroid(layer, structureId) };
    }
    return null;
  }

  structureCentroid(layer, structureId) {
    const key = `${layer.systemId}:${structureId}`;
    if (this.centroidCache.has(key)) return this.centroidCache.get(key).clone();
    const positions = layer.mesh.geometry.attributes.position;
    const ids = layer.structureIds;
    const centroid = new THREE.Vector3();
    const v = new THREE.Vector3();
    let count = 0;
    for (let i = 0; i < ids.length; i += 1) {
      if (ids[i] !== structureId) continue;
      v.fromBufferAttribute(positions, i);
      centroid.add(v);
      count += 1;
    }
    if (count) centroid.multiplyScalar(1 / count);
    layer.mesh.localToWorld(centroid);
    this.centroidCache.set(key, centroid.clone());
    return centroid;
  }

  makeMarker(color, findingId) {
    const marker = new THREE.Mesh(
      new THREE.TorusGeometry(0.095, 0.019, 12, 40),
      new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.95, depthTest: false }),
    );
    marker.userData.findingId = findingId;
    marker.renderOrder = 20;
    return marker;
  }

  setView(view, animate = true) {
    this.view = view === 'back' ? 'back' : 'front';
    const height = this.bodyHeight || 3.45;
    const aspect = Math.max(this.camera.aspect, 0.42);
    const halfWidth = height * 0.30;
    const verticalFov = THREE.MathUtils.degToRad(this.camera.fov);
    const fit = halfWidth / (Math.tan(verticalFov / 2) * aspect);
    const distance = Math.max(height * 1.48, fit * 1.05);
    const targetPosition = new THREE.Vector3(0, 0, this.view === 'front' ? distance : -distance);
    const target = new THREE.Vector3(0, 0, 0);

    this.controls.minAzimuthAngle = this.view === 'front' ? -0.48 : Math.PI - 0.48;
    this.controls.maxAzimuthAngle = this.view === 'front' ? 0.48 : Math.PI + 0.48;
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
    if (text && this.loadingText) this.loadingText.textContent = text;
    this.loadingOverlay?.classList.toggle('hidden', !on);
  }

  animate() {
    requestAnimationFrame(this.animate);
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
