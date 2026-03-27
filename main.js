/**
 * Three.js restaurant room prototype — vanilla ES modules, GitHub Pages friendly.
 * Entry: index.html loads this file as type="module".
 */

import * as THREE from 'three';

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

/** Container query selector (9:16 stage inside letterboxed frame). */
const STAGE_SELECTOR = '#canvas-stage';

/** Trapezoid floor: wide at front (+Z, player), narrow at back (-Z, customers). */
const ROOM = {
  /** Front edge Z (player area). */
  zFront: 3.5,
  /** Back edge Z (customer area). */
  zBack: -4.5,
  /** Half-width at front (X). */
  halfWidthFront: 4.2,
  /** Half-width at back (X). */
  halfWidthBack: 2.6,
  /** Wall height from floor. */
  wallHeight: 4.2,
};

/** Z positions dividing the three floor zones (player | counter | customers). */
const ZONES = {
  /** Boundary between player (front) and counter (middle). */
  playerToCounter: 1.2,
  /** Boundary between counter (middle) and customers (back). — counter sits just behind this */
  counterToCustomers: -1.2,
};

const COLORS = {
  floorPlayer: 0x3d4f3a,
  floorCounter: 0x4a4540,
  floorCustomers: 0x3a4550,
  walls: 0xd8cfc4,
  counterTop: 0x6b5344,
  counterFront: 0x5c4638,
};

// ---------------------------------------------------------------------------
// Trapezoid helpers (linear interpolation along Z)
// ---------------------------------------------------------------------------

function halfWidthAtZ(z) {
  const t = (z - ROOM.zFront) / (ROOM.zBack - ROOM.zFront);
  return THREE.MathUtils.lerp(ROOM.halfWidthFront, ROOM.halfWidthBack, t);
}

function xLeftAtZ(z) {
  return -halfWidthAtZ(z);
}

function xRightAtZ(z) {
  return halfWidthAtZ(z);
}

/**
 * Builds one floor strip between zNear (closer to player, larger Z) and zFar.
 * Returns BufferGeometry (Y = 0 plane).
 */
function createFloorStripGeometry(zNear, zFar) {
  const xl0 = xLeftAtZ(zNear);
  const xr0 = xRightAtZ(zNear);
  const xl1 = xLeftAtZ(zFar);
  const xr1 = xRightAtZ(zFar);

  const positions = new Float32Array([
    xl0, 0, zNear,
    xr0, 0, zNear,
    xr1, 0, zFar,
    xl1, 0, zFar,
  ]);
  const indices = [0, 1, 2, 0, 2, 3];

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  return geo;
}

/**
 * Restaurant room: trapezoidal floor in three colored zones, three walls, counter bar.
 */
function buildRestaurantRoom() {
  const group = new THREE.Group();
  group.name = 'RestaurantRoom';

  const wallMat = new THREE.MeshStandardMaterial({
    color: COLORS.walls,
    roughness: 0.85,
    metalness: 0.05,
  });

  // --- Floor: three zones (player bottom of screen → customers top when viewed from camera) ---
  const floorMats = [
    new THREE.MeshStandardMaterial({
      color: COLORS.floorPlayer,
      roughness: 0.92,
      metalness: 0,
    }),
    new THREE.MeshStandardMaterial({
      color: COLORS.floorCounter,
      roughness: 0.9,
      metalness: 0,
    }),
    new THREE.MeshStandardMaterial({
      color: COLORS.floorCustomers,
      roughness: 0.9,
      metalness: 0,
    }),
  ];

  const z0 = ROOM.zFront;
  const z1 = ZONES.playerToCounter;
  const z2 = ZONES.counterToCustomers;
  const z3 = ROOM.zBack;

  const strips = [
    { zNear: z0, zFar: z1, matIndex: 0 },
    { zNear: z1, zFar: z2, matIndex: 1 },
    { zNear: z2, zFar: z3, matIndex: 2 },
  ];

  strips.forEach(({ zNear, zFar, matIndex }) => {
    const geo = createFloorStripGeometry(zNear, zFar);
    const mesh = new THREE.Mesh(geo, floorMats[matIndex]);
    mesh.receiveShadow = true;
    mesh.name = `FloorZone_${matIndex}`;
    group.add(mesh);
  });

  // --- Left wall: quad from front-left to back-left ---
  {
    const z0w = ROOM.zFront;
    const z1w = ROOM.zBack;
    const h = ROOM.wallHeight;
    const xl0 = xLeftAtZ(z0w);
    const xl1 = xLeftAtZ(z1w);
    const positions = new Float32Array([
      xl0, 0, z0w,
      xl0, h, z0w,
      xl1, h, z1w,
      xl1, 0, z1w,
    ]);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geo.setIndex([0, 1, 2, 0, 2, 3]);
    geo.computeVertexNormals();
    const mesh = new THREE.Mesh(geo, wallMat);
    mesh.receiveShadow = true;
    mesh.castShadow = true;
    mesh.name = 'WallLeft';
    group.add(mesh);
  }

  // --- Right wall ---
  {
    const z0w = ROOM.zFront;
    const z1w = ROOM.zBack;
    const h = ROOM.wallHeight;
    const xr0 = xRightAtZ(z0w);
    const xr1 = xRightAtZ(z1w);
    const positions = new Float32Array([
      xr0, 0, z0w,
      xr0, h, z0w,
      xr1, h, z1w,
      xr1, 0, z1w,
    ]);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geo.setIndex([0, 2, 1, 0, 3, 2]);
    geo.computeVertexNormals();
    const mesh = new THREE.Mesh(geo, wallMat);
    mesh.receiveShadow = true;
    mesh.castShadow = true;
    mesh.name = 'WallRight';
    group.add(mesh);
  }

  // --- Back wall (narrow end) ---
  {
    const z = ROOM.zBack;
    const h = ROOM.wallHeight;
    const xl = xLeftAtZ(z);
    const xr = xRightAtZ(z);
    const positions = new Float32Array([
      xl, 0, z,
      xl, h, z,
      xr, h, z,
      xr, 0, z,
    ]);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geo.setIndex([0, 1, 2, 0, 2, 3]);
    geo.computeVertexNormals();
    const mesh = new THREE.Mesh(geo, wallMat);
    mesh.receiveShadow = true;
    mesh.castShadow = true;
    mesh.name = 'WallBack';
    group.add(mesh);
  }

  // --- Counter: separates middle (counter zone) from top (customers) ---
  {
    // Slightly toward the player from the zone line so the bar reads as the service edge.
    const zPlane = ZONES.counterToCustomers + 0.32;
    const halfW = halfWidthAtZ(zPlane) * 0.92;
    const counterDepth = 0.55;
    const counterHeight = 1.05;
    const baseY = 0;
    const zCenter = zPlane + counterDepth / 2 - 0.08;

    const bodyGeo = new THREE.BoxGeometry(halfW * 2, counterHeight, counterDepth);
    const bodyMat = new THREE.MeshStandardMaterial({
      color: COLORS.counterFront,
      roughness: 0.78,
      metalness: 0.08,
    });
    const body = new THREE.Mesh(bodyGeo, bodyMat);
    body.position.set(0, baseY + counterHeight / 2, zCenter);
    body.castShadow = true;
    body.receiveShadow = true;
    body.name = 'CounterBody';
    group.add(body);

    const topGeo = new THREE.BoxGeometry(halfW * 2 + 0.15, 0.08, counterDepth + 0.2);
    const topMat = new THREE.MeshStandardMaterial({
      color: COLORS.counterTop,
      roughness: 0.45,
      metalness: 0.15,
    });
    const top = new THREE.Mesh(topGeo, topMat);
    top.position.set(0, baseY + counterHeight + 0.04, zCenter);
    top.castShadow = true;
    top.receiveShadow = true;
    top.name = 'CounterTop';
    group.add(top);
  }

  return group;
}

// ---------------------------------------------------------------------------
// App bootstrap
// ---------------------------------------------------------------------------

function init() {
  const stage = document.querySelector(STAGE_SELECTOR);
  if (!stage) {
    console.error(`Missing container: ${STAGE_SELECTOR}`);
    return;
  }

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x87a8c4);

  const camera = new THREE.PerspectiveCamera(50, 9 / 16, 0.1, 100);
  // Fixed viewpoint: elevated and back, looking down toward the room center.
  camera.position.set(0, 8, 10);
  camera.lookAt(0, 0, 0);

  const renderer = new THREE.WebGLRenderer({
    antialias: true,
    alpha: false,
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  stage.appendChild(renderer.domElement);

  // Hemisphere: sky / ground bounce for natural fill.
  const hemi = new THREE.HemisphereLight(0xe8f0ff, 0x3d3a36, 0.55);
  hemi.name = 'HemisphereLight';
  scene.add(hemi);

  // Key light with soft shadow map (PCF soft filtering on the map).
  const sun = new THREE.DirectionalLight(0xfff5e6, 1.05);
  sun.name = 'DirectionalLight';
  sun.position.set(-6, 14, 8);
  sun.castShadow = true;
  sun.shadow.mapSize.width = 2048;
  sun.shadow.mapSize.height = 2048;
  sun.shadow.camera.near = 0.5;
  sun.shadow.camera.far = 40;
  sun.shadow.camera.left = -12;
  sun.shadow.camera.right = 12;
  sun.shadow.camera.top = 12;
  sun.shadow.camera.bottom = -12;
  sun.shadow.bias = -0.00025;
  sun.shadow.normalBias = 0.03;
  scene.add(sun);

  scene.add(buildRestaurantRoom());

  /**
   * Resize renderer and camera to match the 9:16 stage element (CSS handles letterboxing).
   */
  function resize() {
    const w = stage.clientWidth;
    const h = stage.clientHeight;
    if (w === 0 || h === 0) return;
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    renderer.setSize(w, h, false);
  }

  window.addEventListener('resize', resize);
  resize();

  /**
   * Main loop.
   */
  function tick() {
    requestAnimationFrame(tick);
    renderer.render(scene, camera);
  }

  requestAnimationFrame(tick);
}

init();
