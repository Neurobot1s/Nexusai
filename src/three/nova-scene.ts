import * as THREE from "three";

/* ══════════════════════════════════════════════════════════════
   NOVA · 3D AI CORE SCENE
   Minimalism theme: near-monochrome body, one precise cyan accent.
   ──────────────────────────────────────────────────────────────
   Public API:
     new NovaScene(container, callbacks)
     scene.setState("idle" | "listening" | "thinking" | "responding" | "error")
     scene.pulse(color?)          — energy pulse outward
     scene.streamTick()           — micro-flicker while text streams
     scene.dispose()
   ══════════════════════════════════════════════════════════════ */

export type NovaState =
  | "idle"
  | "listening"
  | "thinking"
  | "responding"
  | "error";

export interface NovaSceneCallbacks {
  onStateChange?: (state: NovaState) => void;
  onCoreClick?: () => void;
  onDataNodeClick?: (nodeIndex: number) => void;
}

/* State → animation targets (all values lerped every frame). */
const STATE_TARGETS: Record<
  NovaState,
  {
    coreGlow: number;
    lightIntensity: number;
    ringSpeed: number;
    orbitSpeed: number;
    particleFlow: number; // 0 = ambient, 1 = flowing into core
    coreScale: number;
    accent: number; // 0 = mono, 1 = cyan accent
  }
> = {
  idle: { coreGlow: 0.55, lightIntensity: 1.4, ringSpeed: 1, orbitSpeed: 1, particleFlow: 0, coreScale: 1, accent: 0.55 },
  listening: { coreGlow: 0.95, lightIntensity: 2.3, ringSpeed: 1.7, orbitSpeed: 1.8, particleFlow: 0.15, coreScale: 1.05, accent: 1 },
  thinking: { coreGlow: 0.8, lightIntensity: 2.0, ringSpeed: 2.6, orbitSpeed: 3.4, particleFlow: 1, coreScale: 0.97, accent: 1 },
  responding: { coreGlow: 1.25, lightIntensity: 3.0, ringSpeed: 1.5, orbitSpeed: 2.0, particleFlow: 0.1, coreScale: 1.07, accent: 1 },
  error: { coreGlow: 0.4, lightIntensity: 0.8, ringSpeed: 0.35, orbitSpeed: 0.3, particleFlow: 0, coreScale: 0.94, accent: 0.2 },
};

export const NODE_LABELS = [
  "SYNAPTIC LINK", "MEMORY LATTICE", "VECTOR FIELD", "LOGIC BUS",
  "CONTEXT POOL", "ATTENTION GATE", "SIGNAL RELAY", "CORE SYNC",
];

const isMobile = () =>
  typeof window !== "undefined" &&
  /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent);

export class NovaScene {
  private container: HTMLElement;
  private callbacks: NovaSceneCallbacks;

  private renderer!: THREE.WebGLRenderer;
  private scene!: THREE.Scene;
  private camera!: THREE.PerspectiveCamera;
  private clock = new THREE.Clock();
  private rafId = 0;
  private disposed = false;
  private paused = false;
  private readonly isMobileDevice = isMobile();

  /* Groups */
  private coreGroup!: THREE.Group;   // rotates slowly — whole entity
  private ringGroup!: THREE.Group;   // orbit rings
  private nodeGroup!: THREE.Group;   // data nodes + links
  private particleGroup!: THREE.Group;

  /* Core pieces */
  private coreMesh!: THREE.Mesh<THREE.IcosahedronGeometry, THREE.MeshStandardMaterial>;
  private coreWire!: THREE.Mesh<THREE.IcosahedronGeometry, THREE.MeshBasicMaterial>;
  private shellMesh!: THREE.Mesh<THREE.IcosahedronGeometry, THREE.MeshBasicMaterial>;
  private coreLight!: THREE.PointLight;
  private accentLight!: THREE.PointLight;

  /* Rings */
  private rings: THREE.Mesh<THREE.TorusGeometry, THREE.MeshStandardMaterial>[] = [];

  /* Particles */
  private particles!: THREE.Points<THREE.BufferGeometry, THREE.PointsMaterial>;
  private particleData: { base: THREE.Vector3; flow: number }[] = [];

  /* Nodes & links */
  private nodes: THREE.Mesh[] = [];
  private nodeLinks!: THREE.LineSegments<THREE.BufferGeometry, THREE.LineBasicMaterial>;
  private nodePhases: number[] = [];

  /* Pulses */
  private pulses: { mesh: THREE.Mesh<THREE.RingGeometry, THREE.MeshBasicMaterial>; life: number }[] = [];
  private waveTimer = 0;

  /* State machine */
  private state: NovaState = "idle";
  private cur = { ...STATE_TARGETS.idle };
  private streamFlicker = 0;

  /* Camera orbit (manual, damped) */
  private cam = {
    theta: 0.5, phi: 1.35, dist: 6.4,
    tTheta: 0.5, tPhi: 1.35, tDist: 6.4,
    dragging: false, lastX: 0, lastY: 0,
    lastInteraction: 0, pinchDist: 0,
  };
  private pointer = { x: 0, y: 0, tx: 0, ty: 0 };
  private raycaster = new THREE.Raycaster();

  /* Bound listeners for cleanup */
  private listeners: Array<[EventTarget, string, EventListener]> = [];
  private resizeObserver?: ResizeObserver;

  constructor(container: HTMLElement, callbacks: NovaSceneCallbacks = {}) {
    this.container = container;
    this.callbacks = callbacks;
    this.init();
    this.bindEvents();
    this.animate();
  }

  /* ── Setup ─────────────────────────────────────────────────── */

  private init() {
    const w = this.container.clientWidth || window.innerWidth;
    const h = this.container.clientHeight || window.innerHeight;

    this.renderer = new THREE.WebGLRenderer({ antialias: !this.isMobileDevice, alpha: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, this.isMobileDevice ? 1.5 : 2));
    this.renderer.setSize(w, h);
    this.renderer.setClearColor(0x000000, 0);
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.container.appendChild(this.renderer.domElement);
    this.renderer.domElement.style.display = "block";
    this.renderer.domElement.style.touchAction = "pan-y";

    this.scene = new THREE.Scene();
    this.scene.fog = new THREE.Fog(0xf2f3f5, 9, 26);

    this.camera = new THREE.PerspectiveCamera(42, w / h, 0.1, 100);
    this.updateCamera();

    /* Lights — soft studio + core accent */
    this.scene.add(new THREE.HemisphereLight(0xffffff, 0xdfe3ea, 1.1));
    const key = new THREE.DirectionalLight(0xffffff, 1.4);
    key.position.set(4, 6, 5);
    this.scene.add(key);
    const fill = new THREE.DirectionalLight(0xe8ebf0, 0.5);
    fill.position.set(-5, -2, -4);
    this.scene.add(fill);

    this.coreLight = new THREE.PointLight(0x5fd4e8, 1.4, 18, 1.6);
    this.scene.add(this.coreLight);
    this.accentLight = new THREE.PointLight(0x8f7bf0, 0.6, 14, 2);
    this.accentLight.position.set(-3, 2, -2);
    this.scene.add(this.accentLight);

    /* Groups */
    this.coreGroup = new THREE.Group();
    this.ringGroup = new THREE.Group();
    this.nodeGroup = new THREE.Group();
    this.particleGroup = new THREE.Group();
    this.scene.add(this.coreGroup, this.ringGroup, this.nodeGroup, this.particleGroup);

    this.buildGrid();
    this.buildCore();
    this.buildRings();
    this.buildShell();
    this.buildParticles();
    this.buildNodes();
  }

  private buildGrid() {
    const grid = new THREE.GridHelper(60, 60, 0xd6dae0, 0xe3e6ea);
    grid.position.y = -2.6;
    (grid.material as THREE.Material).transparent = true;
    (grid.material as THREE.Material).opacity = 0.5;
    this.scene.add(grid);
  }

  private buildCore() {
    const geo = new THREE.IcosahedronGeometry(1.05, 1);
    const mat = new THREE.MeshStandardMaterial({
      color: 0xf7f9fb,
      metalness: 0.15,
      roughness: 0.28,
      emissive: new THREE.Color(0x59c9dd),
      emissiveIntensity: 0.25,
      flatShading: true,
    });
    this.coreMesh = new THREE.Mesh(geo, mat);
    this.coreGroup.add(this.coreMesh);

    const wireGeo = new THREE.IcosahedronGeometry(1.28, 1);
    const wireMat = new THREE.MeshBasicMaterial({
      color: 0x4fc3d8, wireframe: true, transparent: true, opacity: 0.35,
    });
    this.coreWire = new THREE.Mesh(wireGeo, wireMat);
    this.coreGroup.add(this.coreWire);
  }

  private buildShell() {
    /* Animated outer sphere/grid — very subtle */
    const geo = new THREE.IcosahedronGeometry(2.55, 2);
    const mat = new THREE.MeshBasicMaterial({
      color: 0xc9ced6, wireframe: true, transparent: true, opacity: 0.14,
    });
    this.shellMesh = new THREE.Mesh(geo, mat);
    this.scene.add(this.shellMesh);
  }

  private buildRings() {
    const defs = [
      { r: 1.75, tube: 0.012, tilt: [Math.PI / 2.15, 0.2, 0], speed: 0.35 },
      { r: 2.05, tube: 0.008, tilt: [Math.PI / 2.6, -0.5, 0.3], speed: -0.24 },
      { r: 2.35, tube: 0.006, tilt: [Math.PI / 1.9, 0.9, -0.2], speed: 0.16 },
    ];
    for (const d of defs) {
      const mat = new THREE.MeshStandardMaterial({
        color: 0xb9c0c9, metalness: 0.6, roughness: 0.35,
        emissive: new THREE.Color(0x57c8dc), emissiveIntensity: 0.12,
      });
      const ring = new THREE.Mesh(new THREE.TorusGeometry(d.r, d.tube, 12, 128), mat);
      ring.rotation.set(d.tilt[0], d.tilt[1], d.tilt[2]);
      ring.userData.speed = d.speed;
      this.rings.push(ring);
      this.ringGroup.add(ring);
    }
  }

  private buildParticles() {
    const count = this.isMobileDevice ? 170 : 460;
    const positions = new Float32Array(count * 3);
    const colors = new Float32Array(count * 3);
    const mono = new THREE.Color(0xb7bec8);
    const cyan = new THREE.Color(0x4fc3d8);

    for (let i = 0; i < count; i++) {
      const base = new THREE.Vector3(
        (Math.random() - 0.5) * 11,
        (Math.random() - 0.5) * 7,
        (Math.random() - 0.5) * 11,
      );
      if (base.length() < 3.2) base.setLength(3.2 + Math.random() * 2);
      positions.set([base.x, base.y, base.z], i * 3);
      const c = Math.random() < 0.22 ? cyan : mono;
      colors.set([c.r, c.g, c.b], i * 3);
      this.particleData.push({ base, flow: Math.random() });
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    geo.setAttribute("color", new THREE.BufferAttribute(colors, 3));

    const mat = new THREE.PointsMaterial({
      size: 0.05,
      map: this.makeDotTexture(),
      vertexColors: true,
      transparent: true,
      opacity: 0.85,
      depthWrite: false,
      sizeAttenuation: true,
    });
    this.particles = new THREE.Points(geo, mat);
    this.particleGroup.add(this.particles);
  }

  private makeDotTexture(): THREE.Texture {
    const c = document.createElement("canvas");
    c.width = c.height = 64;
    const ctx = c.getContext("2d")!;
    const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
    g.addColorStop(0, "rgba(255,255,255,1)");
    g.addColorStop(0.4, "rgba(255,255,255,0.6)");
    g.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 64, 64);
    return new THREE.CanvasTexture(c);
  }

  private buildNodes() {
    const nodeGeo = new THREE.OctahedronGeometry(0.09, 0);
    const count = this.isMobileDevice ? 5 : 8;
    const positions: number[] = [];

    for (let i = 0; i < count; i++) {
      const mat = new THREE.MeshStandardMaterial({
        color: 0xeef1f4, metalness: 0.5, roughness: 0.3,
        emissive: new THREE.Color(0x57c8dc), emissiveIntensity: 0.3,
      });
      const node = new THREE.Mesh(nodeGeo, mat);
      node.userData.index = i;
      this.nodes.push(node);
      this.nodeGroup.add(node);
      this.nodePhases.push((i / count) * Math.PI * 2);
    }

    const linkGeo = new THREE.BufferGeometry();
    const maxLinks = count * 2 + 8;
    linkGeo.setAttribute("position", new THREE.BufferAttribute(new Float32Array(maxLinks * 6), 3));
    this.nodeLinks = new THREE.LineSegments(
      linkGeo,
      new THREE.LineBasicMaterial({ color: 0xaab2bc, transparent: true, opacity: 0.3 }),
    );
    this.nodeGroup.add(this.nodeLinks);
    void positions;
  }

  /* ── Public API ────────────────────────────────────────────── */

  setState(state: NovaState) {
    if (this.state === state) return;
    this.state = state;
    this.callbacks.onStateChange?.(state);
  }

  getState(): NovaState {
    return this.state;
  }

  /** Energy pulse travelling outward (message sent / response received). */
  pulse(color: number = 0x4fc3d8) {
    this.spawnPulse(color, 2.2);
    this.spawnPulse(color, 2.9);
    this.spawnPulse(color, 3.6);
  }

  /** Micro-flicker while streamed text arrives. */
  streamTick() {
    this.streamFlicker = 1;
  }

  /* ── Pulses ────────────────────────────────────────────────── */

  private spawnPulse(color: number, speed: number) {
    const geo = new THREE.RingGeometry(1.05, 1.09, 64);
    const mat = new THREE.MeshBasicMaterial({
      color, transparent: true, opacity: 0.55, side: THREE.DoubleSide, depthWrite: false,
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.rotation.x = -Math.PI / 2;
    this.scene.add(mesh);
    this.pulses.push({ mesh, life: 0 });
    void speed;
  }

  private updatePulses(dt: number) {
    for (let i = this.pulses.length - 1; i >= 0; i--) {
      const p = this.pulses[i];
      p.life += dt * 0.9;
      const s = 1 + p.life * 3.4;
      p.mesh.scale.setScalar(s);
      (p.mesh.material as THREE.MeshBasicMaterial).opacity =
        Math.max(0, 0.5 * (1 - p.life));
      if (p.life >= 1) {
        this.scene.remove(p.mesh);
        p.mesh.geometry.dispose();
        (p.mesh.material as THREE.Material).dispose();
        this.pulses.splice(i, 1);
      }
    }
  }

  /* ── Events ────────────────────────────────────────────────── */

  private bindEvents() {
    const el = this.renderer.domElement;

    const onPointerMove = (e: PointerEvent) => {
      const rect = el.getBoundingClientRect();
      this.pointer.tx = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      this.pointer.ty = ((e.clientY - rect.top) / rect.height) * 2 - 1;
      if (this.cam.dragging && e.isPrimary !== false) {
        this.cam.tTheta -= (e.clientX - this.cam.lastX) * 0.005;
        this.cam.tPhi = THREE.MathUtils.clamp(
          this.cam.tPhi - (e.clientY - this.cam.lastY) * 0.004, 0.7, 1.85);
        this.cam.lastX = e.clientX;
        this.cam.lastY = e.clientY;
        this.cam.lastInteraction = performance.now();
      }
    };
    const onPointerDown = (e: PointerEvent) => {
      this.cam.dragging = true;
      this.cam.lastX = e.clientX;
      this.cam.lastY = e.clientY;
      this.cam.lastInteraction = performance.now();
      this.handleClick(e);
    };
    const onPointerUp = () => { this.cam.dragging = false; };
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      this.cam.tDist = THREE.MathUtils.clamp(
        this.cam.tDist + e.deltaY * 0.004, 4.2, 10);
      this.cam.lastInteraction = performance.now();
    };
    const onTouchMove = (e: TouchEvent) => {
      if (e.touches.length === 2) {
        e.preventDefault();
        const dx = e.touches[0].clientX - e.touches[1].clientX;
        const dy = e.touches[0].clientY - e.touches[1].clientY;
        const d = Math.hypot(dx, dy);
        if (this.cam.pinchDist > 0) {
          this.cam.tDist = THREE.MathUtils.clamp(
            this.cam.tDist - (d - this.cam.pinchDist) * 0.02, 4.2, 10);
        }
        this.cam.pinchDist = d;
        this.cam.lastInteraction = performance.now();
      }
    };
    const onTouchEnd = () => { this.cam.pinchDist = 0; };
    const onVisibility = () => {
      this.paused = document.hidden;
      if (!this.paused) {
        this.clock.getDelta(); // discard accumulated time
        this.animate();
      }
    };

    el.addEventListener("pointermove", onPointerMove as EventListener);
    el.addEventListener("pointerdown", onPointerDown as EventListener);
    window.addEventListener("pointerup", onPointerUp);
    el.addEventListener("wheel", onWheel as EventListener, { passive: false });
    el.addEventListener("touchmove", onTouchMove as EventListener, { passive: false });
    el.addEventListener("touchend", onTouchEnd);
    document.addEventListener("visibilitychange", onVisibility);
    this.listeners = [
      [el, "pointermove", onPointerMove as EventListener],
      [el, "pointerdown", onPointerDown as EventListener],
      [window, "pointerup", onPointerUp],
      [el, "wheel", onWheel as EventListener],
      [el, "touchmove", onTouchMove as EventListener],
      [el, "touchend", onTouchEnd],
      [document, "visibilitychange", onVisibility],
    ];

    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(this.container);
  }

  private handleClick(e: PointerEvent) {
    const rect = this.renderer.domElement.getBoundingClientRect();
    const ndc = new THREE.Vector2(
      ((e.clientX - rect.left) / rect.width) * 2 - 1,
      -((e.clientY - rect.top) / rect.height) * 2 + 1,
    );
    this.raycaster.setFromCamera(ndc, this.camera);

    const nodeHits = this.raycaster.intersectObjects(this.nodes, false);
    if (nodeHits.length > 0) {
      const idx = nodeHits[0].object.userData.index as number;
      this.callbacks.onDataNodeClick?.(idx);
      this.spawnPulse(0x8f7bf0, 2);
      return;
    }
    const coreHits = this.raycaster.intersectObject(this.coreMesh, false);
    if (coreHits.length > 0) {
      this.callbacks.onCoreClick?.();
      this.pulse();
    }
  }

  private resize() {
    if (this.disposed) return;
    const w = this.container.clientWidth || 1;
    const h = this.container.clientHeight || 1;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
  }

  private updateCamera() {
    const { theta, phi, dist } = this.cam;
    /* Subtle mouse parallax (pointer values are already smoothed) */
    this.camera.position.set(
      dist * Math.sin(phi) * Math.sin(theta) + this.pointer.x * 0.35,
      dist * Math.cos(phi) + 0.4 - this.pointer.y * 0.25,
      dist * Math.sin(phi) * Math.cos(theta),
    );
    this.camera.lookAt(0, 0.1, 0);
  }

  /* ── Frame loop ────────────────────────────────────────────── */

  private animate = () => {
    if (this.disposed || this.paused) return;
    this.rafId = requestAnimationFrame(this.animate);
    this.tick(Math.min(this.clock.getDelta(), 0.05));
  };

  private tick(dt: number) {
    const t = this.clock.elapsedTime;
    const target = STATE_TARGETS[this.state];

    /* Lerp all state parameters */
    const k = 1 - Math.pow(0.001, dt); // smooth exponential
    for (const key of Object.keys(target) as Array<keyof typeof target>) {
      this.cur[key] += (target[key] - this.cur[key]) * k;
    }
    const s = this.cur;

    /* Idle breathing + pointer parallax */
    this.pointer.x += (this.pointer.tx - this.pointer.x) * k * 0.6;
    this.pointer.y += (this.pointer.ty - this.pointer.y) * k * 0.6;

    /* Core */
    const breathe = 1 + Math.sin(t * 1.4) * 0.02 * s.coreGlow;
    const pop = 1 + this.streamFlicker * 0.03;
    this.coreGroup.scale.setScalar(s.coreScale * breathe * pop);
    this.coreGroup.rotation.y += dt * 0.12 * s.orbitSpeed;
    this.coreGroup.rotation.x = Math.sin(t * 0.4) * 0.06;

    this.coreMesh.material.emissiveIntensity = s.coreGlow * 0.45;
    this.coreWire.rotation.y -= dt * 0.5 * s.ringSpeed;
    this.coreWire.rotation.z += dt * 0.22 * s.ringSpeed;
    this.coreWire.material.opacity = 0.22 + s.coreGlow * 0.18 + this.streamFlicker * 0.2;

    this.shellMesh.rotation.y += dt * 0.05;
    this.shellMesh.rotation.x -= dt * 0.03;
    this.shellMesh.material.opacity = 0.1 + s.coreGlow * 0.06;

    /* Lights */
    this.coreLight.intensity =
      s.lightIntensity * (1 + Math.sin(t * 2.2) * 0.12) + this.streamFlicker * 0.8;
    this.coreLight.color.setHSL(
      THREE.MathUtils.lerp(0.53, 0.52, s.accent), 0.62, 0.62);

    /* Rings */
    for (const ring of this.rings) {
      const speed = (ring.userData.speed as number) * s.ringSpeed;
      ring.rotation.z += dt * speed;
      ring.rotation.x += dt * speed * 0.15;
      ring.material.emissiveIntensity = 0.08 + s.coreGlow * 0.1;
    }
    this.ringGroup.rotation.y += dt * 0.03 * s.orbitSpeed;

    /* Data nodes orbit + links to core */
    const posAttr = this.nodeLinks.geometry.getAttribute("position") as THREE.BufferAttribute;
    let li = 0;
    const corePos = new THREE.Vector3(0, 0, 0);
    for (let i = 0; i < this.nodes.length; i++) {
      const phase = this.nodePhases[i] + t * 0.25 * s.orbitSpeed;
      const r = 2.0;
      const y = Math.sin(phase * 1.7 + i) * 0.7;
      const x = Math.cos(phase) * r;
      const z = Math.sin(phase) * r;
      this.nodes[i].position.set(x, y, z);
      this.nodes[i].rotation.y += dt * 1.2;
      this.nodes[i].rotation.x += dt * 0.7;
      const wob = 1 + Math.sin(t * 2 + i * 1.3) * 0.12;
      this.nodes[i].scale.setScalar(wob * (0.9 + s.coreGlow * 0.2));

      /* Link node → core */
      if (li < posAttr.count) {
        posAttr.setXYZ(li, x, y, z); li++;
        posAttr.setXYZ(li, corePos.x, corePos.y, corePos.z); li++;
      }
      /* Link node → next node (sparse, every other) */
      if (i % 2 === 0 && li < posAttr.count - 1) {
        const j = (i + 1) % this.nodes.length;
        const pj = this.nodes[j].position;
        posAttr.setXYZ(li, x, y, z); li++;
        posAttr.setXYZ(li, pj.x, pj.y, pj.z); li++;
      }
    }
    posAttr.needsUpdate = true;
    this.nodeLinks.material.opacity = 0.18 + s.coreGlow * 0.14;
    this.nodeGroup.rotation.y = Math.sin(t * 0.1) * 0.15;

    /* Particles: ambient drift, flow to core while thinking */
    const pAttr = this.particles.geometry.getAttribute("position") as THREE.BufferAttribute;
    const flow = s.particleFlow;
    for (let i = 0; i < this.particleData.length; i++) {
      const d = this.particleData[i];
      /* ambient float */
      const bx = d.base.x + Math.sin(t * 0.5 + d.flow * 12) * 0.25;
      const by = d.base.y + Math.cos(t * 0.4 + d.flow * 9) * 0.22;
      const bz = d.base.z + Math.sin(t * 0.3 + d.flow * 7) * 0.25;
      /* pointer reaction — subtle push */
      const px = bx + this.pointer.x * 0.35 * (1 - Math.abs(d.base.y) / 5);
      const py = by - this.pointer.y * 0.3 * (1 - Math.abs(d.base.x) / 5);
      /* flow toward core */
      const target = flow > 0.01
        ? new THREE.Vector3(px, py, bz).multiplyScalar(1 - flow * (0.55 + 0.35 * Math.sin(t * 2 + d.flow * 20)))
        : new THREE.Vector3(px, py, bz);
      pAttr.setXYZ(i, target.x, target.y, target.z);
    }
    pAttr.needsUpdate = true;
    this.particles.rotation.y += dt * 0.02;
    this.particleGroup.rotation.y = -this.pointer.x * 0.04;

    /* Idle pulse waves */
    this.waveTimer += dt;
    const waveInterval = this.state === "thinking" ? 1.1 : 2.6;
    if (this.waveTimer > waveInterval && this.pulses.length < 4) {
      this.waveTimer = 0;
      this.spawnPulse(this.state === "error" ? 0xe05656 : 0x4fc3d8, 2);
    }
    this.updatePulses(dt);

    /* stream flicker decay */
    this.streamFlicker = Math.max(0, this.streamFlicker - dt * 5);

    /* Camera: auto-return + gentle drift after inactivity */
    const idle = performance.now() - this.cam.lastInteraction > 6000;
    if (idle && !this.cam.dragging) {
      /* Gentle drift + return to default framing after inactivity */
      this.cam.tTheta += dt * 0.03;
      this.cam.tPhi += (1.35 - this.cam.tPhi) * k * 0.25;
      this.cam.tDist += (6.4 - this.cam.tDist) * k * 0.25;
    }
    this.cam.theta += (this.cam.tTheta - this.cam.theta) * k * 0.6;
    this.cam.phi += (this.cam.tPhi - this.cam.phi) * k * 0.6;
    this.cam.dist += (this.cam.tDist - this.cam.dist) * k * 0.6;
    this.updateCamera();

    this.renderer.render(this.scene, this.camera);
  }

  /* ── Teardown ──────────────────────────────────────────────── */

  dispose() {
    this.disposed = true;
    cancelAnimationFrame(this.rafId);
    for (const [tgt, type, fn] of this.listeners) {
      tgt.removeEventListener(type, fn);
    }
    this.listeners = [];
    this.resizeObserver?.disconnect();

    this.scene.traverse((obj) => {
      if (obj instanceof THREE.Mesh || obj instanceof THREE.Points || obj instanceof THREE.LineSegments) {
        obj.geometry.dispose();
        const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
        for (const m of mats) {
          m.dispose();
          if (m.map) m.map.dispose();
        }
      }
    });
    this.renderer.dispose();
    if (this.renderer.domElement.parentElement === this.container) {
      this.container.removeChild(this.renderer.domElement);
    }
  }
}
