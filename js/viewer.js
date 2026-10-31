// =============================================================
//  3D 컨셉 뷰어 (three.js) — 고객/관리자 공용
//  - 파라메트릭 부품 렌더링, 작동 애니메이션, 외형 치수선, 부품 선택 시 치수 표시
//  - 간섭 부품 빨간색 강조, 핸드드로잉 스케치 참조 패널 표시
// =============================================================
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { CSS2DRenderer, CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';
import { MATERIALS } from './kb.js';
import { ownPose, worldOffset, makeIndex, overallBox, halfExtents } from './engine.js';
import { fmtN } from './estimator.js';

const AXV = { x: new THREE.Vector3(1, 0, 0), y: new THREE.Vector3(0, 1, 0), z: new THREE.Vector3(0, 0, 1) };

function colorOf(p) {
  if (p.color) return p.color;
  if (p.role === 'work') return 0x3b8eea;
  if (p.std) return 0x3a414b;
  if (p.motion && p.motion.length) return 0xf28c28;
  return MATERIALS[p.mat]?.color ?? 0xa0a7b0;
}

export class Viewer {
  constructor(container, opts = {}) {
    this.el = container;
    this.opts = opts;
    this.t = 0; this.playing = true; this.speed = 1; this.period = 0;
    this.objects = new Map(); this.parts = []; this.index = new Map();
    this.showDims = true; this.selected = null; this.listeners = {};

    const w = container.clientWidth || 600, h = container.clientHeight || 400;
    this.renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
    this.renderer.setPixelRatio(Math.min(2, window.devicePixelRatio));
    this.renderer.setSize(w, h);
    this.renderer.shadowMap.enabled = true;
    container.appendChild(this.renderer.domElement);
    this.labelRenderer = new CSS2DRenderer();
    this.labelRenderer.setSize(w, h);
    Object.assign(this.labelRenderer.domElement.style, { position: 'absolute', inset: '0', pointerEvents: 'none' });
    container.appendChild(this.labelRenderer.domElement);

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(40, w / h, 1, 100000);
    this.camera.up.set(0, 0, 1);
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;

    this.scene.add(new THREE.HemisphereLight(0xffffff, 0x445566, 1.6));
    const sun = new THREE.DirectionalLight(0xffffff, 1.8);
    sun.position.set(2000, -3000, 5000); sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    this.sun = sun; this.scene.add(sun);
    this.root = new THREE.Group(); this.scene.add(this.root);
    this.dimGroup = new THREE.Group(); this.scene.add(this.dimGroup);
    this.helpers = new THREE.Group(); this.scene.add(this.helpers);

    this.applyTheme();
    matchMedia('(prefers-color-scheme: dark)').addEventListener?.('change', () => this.applyTheme());

    this.raycaster = new THREE.Raycaster();
    this.renderer.domElement.addEventListener('pointerdown', (e) => { this._down = [e.clientX, e.clientY]; });
    this.renderer.domElement.addEventListener('pointerup', (e) => {
      if (!this._down || Math.hypot(e.clientX - this._down[0], e.clientY - this._down[1]) > 4) return;
      this.pick(e);
    });
    new ResizeObserver(() => this.resize()).observe(container);
    this.clock = new THREE.Clock();
    this.renderer.setAnimationLoop(() => this.frame());
  }

  on(ev, fn) { (this.listeners[ev] = this.listeners[ev] || []).push(fn); }
  emit(ev, data) { (this.listeners[ev] || []).forEach((f) => f(data)); }

  applyTheme() {
    const dark = document.documentElement.dataset.theme === 'dark' || (!document.documentElement.dataset.theme && matchMedia('(prefers-color-scheme: dark)').matches);
    this.scene.background = new THREE.Color(dark ? 0x161b22 : 0xf3f5f8);
    this.dark = dark;
  }

  resize() {
    const w = this.el.clientWidth, h = this.el.clientHeight;
    if (!w || !h) return;
    this.camera.aspect = w / h; this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h); this.labelRenderer.setSize(w, h);
  }

  clear() {
    for (const o of [this.root, this.dimGroup, this.helpers]) {
      while (o.children.length) {
        const c = o.children.pop();
        c.traverse((n) => { n.geometry?.dispose?.(); if (n.material) [].concat(n.material).forEach((m) => { m.map?.dispose?.(); m.dispose?.(); }); if (n.element) n.element.remove(); });
      }
    }
    this.objects.clear();
  }

  /** built = buildDesign() 결과 */
  setDesign(built, { keepCamera = false } = {}) {
    this.clear();
    this.parts = built.parts.filter((p) => p.shape && !p.bomOnly);
    this.index = makeIndex(this.parts);
    this.period = built.period || 0;
    for (const p of this.parts) {
      const g = new THREE.Group();
      let geo;
      if (p.shape === 'cyl') {
        geo = new THREE.CylinderGeometry(p.d / 2, p.d / 2, p.len, 40);
        if (p.axis === 'x') geo.rotateZ(Math.PI / 2); else if (p.axis === 'z') geo.rotateX(Math.PI / 2);
      } else geo = new THREE.BoxGeometry(...p.size);
      const col = colorOf(p);
      const mat = new THREE.MeshStandardMaterial({ color: col, metalness: p.std ? 0.3 : 0.45, roughness: 0.55, transparent: p.role === 'work', opacity: p.role === 'work' ? 0.85 : 1 });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.castShadow = true; mesh.receiveShadow = true; mesh.userData.part = p;
      g.add(mesh);
      const edges = new THREE.LineSegments(new THREE.EdgesGeometry(geo, 25), new THREE.LineBasicMaterial({ color: 0x1b1f24, transparent: true, opacity: 0.45 }));
      g.add(edges);
      if (p.shape === 'box' && p.holes?.length) {
        for (const h of p.holes) {
          const hg = new THREE.CylinderGeometry(h.d / 2, h.d / 2, p.size[2] + 0.6, 20); hg.rotateX(Math.PI / 2);
          const hm = new THREE.Mesh(hg, new THREE.MeshBasicMaterial({ color: 0x15181c }));
          hm.position.set(h.x, h.y, 0); hm.scale.set(1, 1, 1.002); g.add(hm);
        }
      }
      g.position.set(...p.pos);
      g.userData = { part: p, mesh, baseColor: col };
      this.root.add(g);
      this.objects.set(p.id, g);
    }
    const ob = overallBox(this.parts);
    this.box = ob;
    // 바닥 그리드
    const D = Math.max(...ob.size, 500);
    const grid = new THREE.GridHelper(Math.ceil((D * 2) / 100) * 100, Math.ceil((D * 2) / 100), 0x8892a0, this.dark ? 0x2a313b : 0xd6dbe2);
    grid.rotation.x = Math.PI / 2; grid.position.set((ob.min[0] + ob.max[0]) / 2, (ob.min[1] + ob.max[1]) / 2, Math.min(0, ob.min[2]) - 0.5);
    this.helpers.add(grid);
    const shadowPlane = new THREE.Mesh(new THREE.PlaneGeometry(D * 3, D * 3), new THREE.ShadowMaterial({ opacity: 0.18 }));
    shadowPlane.position.copy(grid.position); shadowPlane.receiveShadow = true; this.helpers.add(shadowPlane);
    const sc = this.sun.shadow.camera; sc.left = -D; sc.right = D; sc.top = D; sc.bottom = -D; sc.far = D * 10; sc.updateProjectionMatrix();
    if (this.refTexture) this.addReferenceImage(this.refTexture.image, true);
    this.buildDims();
    if (!keepCamera) this.fit();
    this.applyPose(this.t);
    if (this.collisionIds) this.markCollisions(this.collisionIds);
  }

  fit() {
    const ob = this.box, c = new THREE.Vector3(...ob.min.map((v, i) => (v + ob.max[i]) / 2));
    const D = Math.max(...ob.size, 300);
    this.camera.position.set(c.x + D * 1.15, c.y - D * 1.7, c.z + D * 0.95);
    this.controls.target.copy(c); this.controls.update();
  }
  view(name) {
    const ob = this.box, c = new THREE.Vector3(...ob.min.map((v, i) => (v + ob.max[i]) / 2));
    const D = Math.max(...ob.size, 300) * 2.2;
    const dir = { front: [0, -1, 0], top: [0, -0.001, 1], right: [1, 0, 0], iso: [0.55, -0.8, 0.45] }[name] || [0.55, -0.8, 0.45];
    this.camera.position.set(c.x + dir[0] * D, c.y + dir[1] * D, c.z + dir[2] * D);
    this.controls.target.copy(c); this.controls.update();
  }

  label(text, pos, cls = 'dim-label') {
    const div = document.createElement('div'); div.className = cls; div.textContent = text;
    const o = new CSS2DObject(div); o.position.copy(pos); return o;
  }
  dimLine(a, b, text, color = 0x0a66c2) {
    const g = new THREE.Group();
    const mat = new THREE.LineBasicMaterial({ color, depthTest: false });
    g.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints([a, b]), mat));
    const dir = b.clone().sub(a).normalize(), len = a.distanceTo(b), al = Math.min(40, len * 0.08);
    for (const [p, d] of [[a, dir], [b, dir.clone().negate()]]) {
      const cone = new THREE.Mesh(new THREE.ConeGeometry(al * 0.25, al, 12), new THREE.MeshBasicMaterial({ color, depthTest: false }));
      cone.position.copy(p.clone().add(d.clone().multiplyScalar(al / 2)));
      cone.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.clone().negate());
      cone.renderOrder = 10; g.add(cone);
    }
    g.add(this.label(text, a.clone().add(b).multiplyScalar(0.5)));
    return g;
  }
  buildDims() {
    this.dimGroup.clear();
    if (!this.showDims || !this.box) return;
    const { min, max, size } = this.box, off = Math.max(60, Math.max(...size) * 0.06);
    const V = (x, y, z) => new THREE.Vector3(x, y, z);
    const ext = (a, b) => new THREE.Line(new THREE.BufferGeometry().setFromPoints([a, b]), new THREE.LineBasicMaterial({ color: 0x0a66c2, transparent: true, opacity: 0.5 }));
    const z0 = Math.min(0, min[2]);
    this.dimGroup.add(this.dimLine(V(min[0], min[1] - off, z0), V(max[0], min[1] - off, z0), `W ${fmtN(size[0])}`));
    this.dimGroup.add(ext(V(min[0], min[1], z0), V(min[0], min[1] - off * 1.2, z0)), ext(V(max[0], min[1], z0), V(max[0], min[1] - off * 1.2, z0)));
    this.dimGroup.add(this.dimLine(V(max[0] + off, min[1], z0), V(max[0] + off, max[1], z0), `D ${fmtN(size[1])}`));
    this.dimGroup.add(ext(V(max[0], min[1], z0), V(max[0] + off * 1.2, min[1], z0)), ext(V(max[0], max[1], z0), V(max[0] + off * 1.2, max[1], z0)));
    this.dimGroup.add(this.dimLine(V(min[0] - off, min[1], z0), V(min[0] - off, min[1], max[2]), `H ${fmtN(max[2] - z0)}`));
    this.dimGroup.add(ext(V(min[0], min[1], max[2]), V(min[0] - off * 1.2, min[1], max[2])));
    if (this.selected) this.buildPartDims(this.selected);
  }
  buildPartDims(p) {
    const e = halfExtents(p), o = this.objects.get(p.id); if (!o) return;
    const c = o.position, V = (x, y, z) => new THREE.Vector3(x, y, z);
    const g = new THREE.Group(); g.name = 'partDims';
    const off = 25;
    g.add(this.dimLine(V(c.x - e[0], c.y - e[1] - off, c.z + e[2]), V(c.x + e[0], c.y - e[1] - off, c.z + e[2]), fmtN(e[0] * 2), 0xd9480f));
    g.add(this.dimLine(V(c.x + e[0] + off, c.y - e[1], c.z + e[2]), V(c.x + e[0] + off, c.y + e[1], c.z + e[2]), fmtN(e[1] * 2), 0xd9480f));
    g.add(this.dimLine(V(c.x - e[0] - off, c.y - e[1], c.z - e[2]), V(c.x - e[0] - off, c.y - e[1], c.z + e[2]), fmtN(e[2] * 2), 0xd9480f));
    g.add(this.label(p.name, V(c.x, c.y, c.z + e[2] + 40), 'part-label'));
    this.dimGroup.add(g);
  }
  setShowDims(v) { this.showDims = v; this.buildDims(); }

  pick(e) {
    const r = this.renderer.domElement.getBoundingClientRect();
    const m = new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    this.raycaster.setFromCamera(m, this.camera);
    const hit = this.raycaster.intersectObjects(this.root.children, true).find((h) => h.object.userData.part);
    this.select(hit ? hit.object.userData.part : null);
  }
  select(p) {
    for (const o of this.objects.values()) o.userData.mesh.material.emissive?.setHex(0x000000);
    this.selected = p;
    if (p) this.objects.get(p.id)?.userData.mesh.material.emissive.setHex(0x553300);
    this.buildDims();
    this.emit('select', p);
  }
  markCollisions(ids) {
    this.collisionIds = ids;
    for (const [id, o] of this.objects) o.userData.mesh.material.color.setHex(ids && ids.includes(id) ? 0xe03131 : o.userData.baseColor);
  }

  /** 핸드드로잉/스케치 이미지를 3D 공간 뒤편에 참조 패널로 표시 */
  addReferenceImage(img, rebuild = false) {
    if (!rebuild) { this.refTexture?.dispose(); this.refTexture = new THREE.Texture(img); this.refTexture.colorSpace = THREE.SRGBColorSpace; this.refTexture.needsUpdate = true; }
    this.helpers.children.filter((c) => c.name === 'ref').forEach((c) => this.helpers.remove(c));
    if (!this.box) return;
    const { min, max, size } = this.box, Hh = Math.max(size[2], 400), ar = img.width / img.height;
    const plane = new THREE.Mesh(new THREE.PlaneGeometry(Hh * ar, Hh), new THREE.MeshBasicMaterial({ map: this.refTexture, side: THREE.DoubleSide, transparent: true, opacity: 0.92 }));
    plane.rotation.x = Math.PI / 2; plane.name = 'ref';
    plane.position.set((min[0] + max[0]) / 2, max[1] + Math.max(200, size[1] * 0.4), Hh / 2);
    this.helpers.add(plane);
  }
  removeReferenceImage() { this.refTexture?.dispose(); this.refTexture = null; this.helpers.children.filter((c) => c.name === 'ref').forEach((c) => this.helpers.remove(c)); }

  applyPose(t) {
    const q = new THREE.Quaternion();
    for (const p of this.parts) {
      const o = this.objects.get(p.id); if (!o) continue;
      const off = worldOffset(p, t, this.index), { rot } = ownPose(p, t);
      let c = new THREE.Vector3(...p.pos);
      q.identity();
      if (rot && rot.angle) {
        q.setFromAxisAngle(AXV[rot.axis], rot.angle);
        if (rot.center) { const ctr = new THREE.Vector3(rot.center[0], rot.center[1], p.pos[2]); c = c.sub(ctr).applyQuaternion(q).add(ctr); }
      }
      o.position.set(c.x + off[0], c.y + off[1], c.z + off[2]);
      o.quaternion.copy(q);
    }
    if (this.selected) { const g = this.dimGroup.getObjectByName('partDims'); if (g) { this.dimGroup.remove(g); g.traverse((n) => { n.geometry?.dispose(); n.material?.dispose?.(); n.element?.remove(); }); this.buildPartDims(this.selected); } }
  }
  setTime(t) { this.t = ((t % 1) + 1) % 1; this.applyPose(this.t); this.emit('time', this.t); }

  frame() {
    const dt = this.clock.getDelta();
    if (this.playing && this.period > 0) { this.t = (this.t + (dt * this.speed) / this.period) % 1; this.applyPose(this.t); this.emit('time', this.t); }
    this.controls.update();
    this.renderer.render(this.scene, this.camera);
    this.labelRenderer.render(this.scene, this.camera);
  }
  screenshot() { this.renderer.render(this.scene, this.camera); return this.renderer.domElement.toDataURL('image/png'); }
  dispose() { this.renderer.setAnimationLoop(null); this.clear(); this.renderer.dispose(); this.el.innerHTML = ''; }
}
