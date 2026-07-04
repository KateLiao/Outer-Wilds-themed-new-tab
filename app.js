import * as THREE from "./node_modules/three/build/three.module.js";
import { OrbitControls } from "./node_modules/three/examples/jsm/controls/OrbitControls.js";
import { GLTFLoader } from "./node_modules/three/examples/jsm/loaders/GLTFLoader.js";
import { EffectComposer } from "./node_modules/three/examples/jsm/postprocessing/EffectComposer.js";
import { RenderPass } from "./node_modules/three/examples/jsm/postprocessing/RenderPass.js";
import { ShaderPass } from "./node_modules/three/examples/jsm/postprocessing/ShaderPass.js";
import { UnrealBloomPass } from "./node_modules/three/examples/jsm/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "./node_modules/three/examples/jsm/postprocessing/OutputPass.js";
import { FXAAShader } from "./node_modules/three/examples/jsm/shaders/FXAAShader.js";
import { OuterWildsCosmicVFX } from "./outer-wilds-vfx.js";

/**
 * 初始化篝火 3D 场景并与番茄钟联动。
 * @param {object} [options]
 * @param {() => boolean} [options.canManualRoast] 是否允许手动进入烤火视角
 * @returns {Promise<object>} 场景控制桥接对象
 */
export async function initCampfireScene(options = {}) {
  const canManualRoast = options.canManualRoast ?? (() => true);

  const canvas = document.querySelector("#scene");
  const clockEl = document.querySelector("#clock");
  const dateEl = document.querySelector("#date");
  const focusButton = document.querySelector("#focusButton");
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  let motionScale = 1;
  let focusIntensityActive = false;

  if (!canvas) {
    throw new Error("Canvas element #scene not found");
  }

const scene = new THREE.Scene();
scene.fog = new THREE.FogExp2(0x050712, 0.018);

const camera = new THREE.PerspectiveCamera(48, window.innerWidth / window.innerHeight, 0.1, 700);
camera.position.set(0, 6.4, 16);

const renderer = new THREE.WebGLRenderer({
  canvas,
  antialias: true,
  alpha: false,
});
if (!renderer.getContext()) {
  throw new Error("WebGL unavailable");
}
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.44;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

const bloomPixelRatio = Math.min(window.devicePixelRatio, window.innerWidth < 720 ? 1.35 : 1.75);
const composer = new EffectComposer(renderer);
composer.setPixelRatio(bloomPixelRatio);
composer.setSize(window.innerWidth, window.innerHeight);
const renderPass = new RenderPass(scene, camera);
const bloomPass = new UnrealBloomPass(
  new THREE.Vector2(window.innerWidth, window.innerHeight),
  0.46,
  0.52,
  0.3,
);
const fxaaPass = new ShaderPass(FXAAShader);
const outputPass = new OutputPass();
fxaaPass.material.uniforms.resolution.value.set(
  1 / (window.innerWidth * bloomPixelRatio),
  1 / (window.innerHeight * bloomPixelRatio),
);
composer.addPass(renderPass);
composer.addPass(bloomPass);
composer.addPass(fxaaPass);
composer.addPass(outputPass);

const gltfLoader = new GLTFLoader();

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.055;
controls.enablePan = false;
controls.minDistance = 8.2;
controls.maxDistance = 22;
controls.maxPolarAngle = Math.PI * 0.46;
controls.minPolarAngle = Math.PI * 0.2;
controls.target.set(0, 1.1, 0);

const defaultCameraPosition = new THREE.Vector3(0, 6.4, 16);
const defaultControlsTarget = new THREE.Vector3(0, 1.1, 0);
const roastCameraPosition = new THREE.Vector3(0.72, 1.58, 3.32);
const roastControlsTarget = new THREE.Vector3(0.18, 1.08, 0.08);
let roastViewActive = false;
let roastBlend = 0;
let roastReach = 0;
let roastTransitioningOut = false;
let lastPointerDownAt = 0;

const root = new THREE.Group();
scene.add(root);

const ambient = new THREE.HemisphereLight(0x2b4166, 0x211309, 0.84);
scene.add(ambient);

const moon = new THREE.DirectionalLight(0x94c3ff, 0.82);
moon.position.set(-8, 11, -8);
moon.castShadow = true;
moon.shadow.mapSize.set(1024, 1024);
moon.shadow.camera.near = 1;
moon.shadow.camera.far = 44;
moon.shadow.camera.left = -18;
moon.shadow.camera.right = 18;
moon.shadow.camera.top = 18;
moon.shadow.camera.bottom = -18;
scene.add(moon);

const fireLight = new THREE.PointLight(0xff8a32, 30, 38, 2.05);
fireLight.position.set(0, 1.15, 0);
fireLight.castShadow = true;
fireLight.shadow.mapSize.set(768, 768);
fireLight.shadow.camera.near = 0.45;
fireLight.shadow.camera.far = 30;
fireLight.shadow.bias = -0.002;
scene.add(fireLight);

const emberFillLight = new THREE.PointLight(0xffb36a, 9.6, 24, 2.35);
emberFillLight.position.set(0, 0.42, 0);
scene.add(emberFillLight);

const forestBounceLights = [
  [0, 0.82, -4.2],
  [4.1, 0.75, -0.6],
  [-4.1, 0.75, 0.7],
].map(([x, y, z]) => {
  const light = new THREE.PointLight(0xff9a48, 3.8, 24, 2.15);
  light.position.set(x, y, z);
  scene.add(light);
  return light;
});

const canopyWashLight = new THREE.SpotLight(0xff9f4f, 13, 18, Math.PI * 0.34, 0.88, 1.75);
canopyWashLight.position.set(0, 1.75, 0);
canopyWashLight.target.position.set(0, 3.5, -5.8);
scene.add(canopyWashLight, canopyWashLight.target);

const violetLight = new THREE.PointLight(0x8276ff, 2.1, 38, 2.05);
violetLight.position.set(6, 4, -7);
scene.add(violetLight);

const rimLight = new THREE.PointLight(0x6a85ff, 3.2, 46, 2.1);
rimLight.position.set(-7, 3.6, 6);
scene.add(rimLight);

const ground = new THREE.Mesh(
  new THREE.CircleGeometry(14, 96),
  new THREE.MeshStandardMaterial({
    color: 0x171713,
    roughness: 0.96,
    metalness: 0.02,
  }),
);
ground.rotation.x = -Math.PI / 2;
ground.position.y = -0.04;
ground.receiveShadow = true;
root.add(ground);

const fireGlow = new THREE.Mesh(
  new THREE.CircleGeometry(11.2, 128),
  new THREE.MeshBasicMaterial({
    map: makeRadialGlowTexture("rgba(255, 149, 53, 0.9)", "rgba(255, 94, 22, 0)"),
    color: 0xffffff,
    transparent: true,
    opacity: 0.72,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  }),
);
fireGlow.rotation.x = -Math.PI / 2;
fireGlow.position.y = 0.006;
root.add(fireGlow);

const groundRing = new THREE.Mesh(
  new THREE.RingGeometry(2.7, 2.82, 96),
  new THREE.MeshBasicMaterial({
    color: 0xff8b35,
    transparent: true,
    opacity: 0.24,
    side: THREE.DoubleSide,
  }),
);
groundRing.rotation.x = -Math.PI / 2;
groundRing.position.y = 0.015;
root.add(groundRing);

const horizonGlow = new THREE.Mesh(
  new THREE.RingGeometry(11.4, 14.2, 128),
  new THREE.MeshBasicMaterial({
    color: 0x5860bc,
    transparent: true,
    opacity: 0.075,
    side: THREE.DoubleSide,
    depthWrite: false,
  }),
);
horizonGlow.rotation.x = -Math.PI / 2;
horizonGlow.position.y = 0.025;
root.add(horizonGlow);

const stones = new THREE.Group();
const stoneMat = new THREE.MeshStandardMaterial({ color: 0x5c6153, roughness: 0.9 });
for (let i = 0; i < 22; i += 1) {
  const angle = (i / 22) * Math.PI * 2;
  const radius = 2.28 + Math.sin(i * 1.8) * 0.12;
  const stone = new THREE.Mesh(
    new THREE.DodecahedronGeometry(0.22 + Math.random() * 0.16, 0),
    stoneMat,
  );
  stone.position.set(Math.cos(angle) * radius, 0.16, Math.sin(angle) * radius);
  stone.rotation.set(Math.random() * 2, Math.random() * 2, Math.random() * 2);
  stone.scale.setScalar(0.75 + Math.random() * 0.7);
  stones.add(stone);
}
root.add(stones);

const forest = new THREE.Group();
const treeMat = new THREE.MeshStandardMaterial({
  color: 0x223219,
  roughness: 0.98,
  metalness: 0,
  emissive: 0x120905,
  emissiveIntensity: 0.38,
});
const barkMat = new THREE.MeshStandardMaterial({
  color: 0x3b2110,
  roughness: 0.96,
  emissive: 0x1a0904,
  emissiveIntensity: 0.3,
});

[
  [-8.8, -4.2, 3.5, -0.38],
  [-7.2, 2.8, 4.7, 0.2],
  [-5.7, -7.8, 4.1, -0.52],
  [-3.8, 8.8, 5.2, 0.16],
  [3.2, -9.2, 3.9, 0.24],
  [5.4, 7.4, 5.8, -0.18],
  [8.2, -3.9, 4.8, 0.34],
  [9.4, 3.1, 3.6, -0.28],
  [-10.8, 0.6, 5.6, -0.48],
  [11.1, -0.8, 4.9, 0.2],
].forEach(([x, z, height, lean], index) => {
  const tree = makePineTree(height, index % 3 === 0 ? treeMat : barkMat);
  tree.position.set(x, 0, z);
  tree.rotation.z = lean * 0.18;
  tree.rotation.y = Math.atan2(x, z) + Math.PI + lean * 0.08;
  tree.userData = { seed: index * 1.91, lean };
  forest.add(tree);
});
root.add(forest);

const ship = new THREE.Group();
const shipFallback = makeCampShip();
ship.add(shipFallback);
ship.position.set(5.85, 0.08, -6.25);
ship.rotation.set(0.06, -0.98, 0.02);
ship.userData = { baseY: ship.position.y };
root.add(ship);
loadModelIntoGroup(ship, "./assets/outer_wilds__the_ship.glb", {
  fallback: shipFallback,
  targetMaxSize: 4.7,
  groundY: 0,
  yOffset: 0,
  avoidObjects: forest.children,
  collisionPadding: 0.16,
  name: "Outer Wilds ship",
});

const logs = new THREE.Group();
const logMat = new THREE.MeshStandardMaterial({
  color: 0x3e2414,
  roughness: 0.85,
  emissive: 0x240b03,
  emissiveIntensity: 0.15,
});
for (let i = 0; i < 5; i += 1) {
  const log = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.24, 3.4, 16), logMat);
  log.position.y = 0.32;
  log.rotation.z = Math.PI / 2;
  log.rotation.y = (i / 5) * Math.PI;
  log.position.x = Math.cos(log.rotation.y) * 0.26;
  log.position.z = Math.sin(log.rotation.y) * 0.26;
  logs.add(log);
}
root.add(logs);

const flameGroup = new THREE.Group();
root.add(flameGroup);

const flameMaterials = [
  new THREE.MeshBasicMaterial({ color: 0xffe4a1, transparent: true, opacity: 0.82, side: THREE.DoubleSide }),
  new THREE.MeshBasicMaterial({ color: 0xff8b35, transparent: true, opacity: 0.64, side: THREE.DoubleSide }),
  new THREE.MeshBasicMaterial({ color: 0xd33b1f, transparent: true, opacity: 0.44, side: THREE.DoubleSide }),
];

const flames = [];
for (let i = 0; i < 16; i += 1) {
  const layer = i % flameMaterials.length;
  const flame = new THREE.Mesh(
    new THREE.ConeGeometry(0.22 + layer * 0.14, 1.2 + layer * 0.34, 6),
    flameMaterials[layer].clone(),
  );
  const angle = (i / 16) * Math.PI * 2;
  flame.position.set(Math.cos(angle) * (0.18 + layer * 0.08), 0.92 + layer * 0.14, Math.sin(angle) * (0.18 + layer * 0.08));
  flame.rotation.y = angle;
  flame.userData = {
    baseY: flame.position.y,
    seed: Math.random() * 100,
    layer,
  };
  flames.push(flame);
  flameGroup.add(flame);
}

const sparkCount = 180;
const sparkGeometry = new THREE.BufferGeometry();
const sparkPositions = new Float32Array(sparkCount * 3);
const sparkSeeds = [];
for (let i = 0; i < sparkCount; i += 1) {
  const angle = Math.random() * Math.PI * 2;
  const radius = Math.random() * 0.75;
  sparkPositions[i * 3] = Math.cos(angle) * radius;
  sparkPositions[i * 3 + 1] = Math.random() * 5;
  sparkPositions[i * 3 + 2] = Math.sin(angle) * radius;
  sparkSeeds.push({
    angle,
    radius,
    speed: 0.35 + Math.random() * 1.1,
    drift: 0.1 + Math.random() * 0.5,
    offset: Math.random() * 100,
  });
}
sparkGeometry.setAttribute("position", new THREE.BufferAttribute(sparkPositions, 3));
const sparks = new THREE.Points(
  sparkGeometry,
  new THREE.PointsMaterial({
    color: 0xffb45c,
    size: 0.055,
    transparent: true,
    opacity: 0.92,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  }),
);
root.add(sparks);

const cosmicVFX = new OuterWildsCosmicVFX({
  starCount: window.innerWidth < 720 ? 6000 : 11000,
  supernovaIntensity: 0,
  dustIntensity: 0.085,
  orbitLineOpacity: 0.14,
  animationSpeed: reducedMotion ? 0.35 : 1,
});
scene.add(cosmicVFX.group);

const orbitLineMat = new THREE.LineBasicMaterial({
  color: 0x8f86ff,
  transparent: true,
  opacity: cosmicVFX.orbitLineOpacity * 0.82,
});
const orbitLine = new THREE.Line(new THREE.BufferGeometry().setFromPoints(makeCirclePoints(23.5, 192)), orbitLineMat);
orbitLine.rotation.x = Math.PI * 0.54;
orbitLine.position.set(0, 9.6, -88);
scene.add(orbitLine);

const eyeSky = new THREE.Group();
eyeSky.position.set(0, 15.8, -200);
scene.add(eyeSky);

const eyeSymbol = makeEyeSymbol();
eyeSymbol.position.set(0, 3.2, 0);
eyeSymbol.scale.set(28.4, 25.1, 2);
eyeSky.add(eyeSymbol);

const coordinateGlyphs = makeCoordinateGlyphs();
coordinateGlyphs.position.set(0, -13, 0);
coordinateGlyphs.scale.set(27.2, 17.9, 2);
coordinateGlyphs.renderOrder = 10;
eyeSky.add(coordinateGlyphs);

replaceWithReferenceLineArt(eyeSymbol, "./assets/eye-symbol-reference.png", {
  color: [226, 230, 255],
  glowColor: [130, 118, 255],
  threshold: 228,
  softness: 64,
  alphaPower: 0.82,
  glow: 0.46,
  edgeClear: 18,
  pad: 8,
});

replaceWithReferenceLineArt(coordinateGlyphs, "./assets/eye-coordinates-reference.png", {
  color: [226, 230, 255],
  glowColor: [130, 118, 255],
  threshold: 226,
  softness: 58,
  alphaPower: 0.74,
  glow: 0.42,
  edgeClear: 18,
  pad: 6,
});

const comet = new THREE.Mesh(
  new THREE.SphereGeometry(0.08, 16, 12),
  new THREE.MeshBasicMaterial({ color: 0xf7f0d4 }),
);
scene.add(comet);

const roastingRig = makeRoastingRig();
roastingRig.visible = false;
camera.add(roastingRig);
scene.add(camera);

let clickBurst = 0;
canvas.addEventListener("pointerdown", () => {
  const now = performance.now();
  if (now - lastPointerDownAt < 340 && canManualRoast()) {
    enterRoastView(false);
  }
  lastPointerDownAt = now;
  clickBurst = 1;
});

canvas.addEventListener("dblclick", () => {
  if (canManualRoast()) {
    enterRoastView(false);
  }
});

focusButton.addEventListener("click", () => {
  exitRoastView();
});

/**
 * 进入烤棉花糖近景；番茄钟完成时可强制进入。
 * @param {boolean} [forced=false] 是否为专注完成触发的强制烤火
 */
function enterRoastView(forced = false) {
  if (!forced && !canManualRoast()) {
    return;
  }
  roastViewActive = true;
  roastTransitioningOut = false;
  controls.enabled = false;
  roastingRig.visible = true;
  roastReach = 0;
  clickBurst = forced ? 2.2 : 1.8;
}

/**
 * 退出烤火视角，回到默认营地相机。
 */
function exitRoastView() {
  roastViewActive = false;
  roastTransitioningOut = true;
  controls.enabled = true;
}

function makeCirclePoints(radius, segments) {
  const points = [];
  for (let i = 0; i <= segments; i += 1) {
    const angle = (i / segments) * Math.PI * 2;
    points.push(new THREE.Vector3(Math.cos(angle) * radius, 0, Math.sin(angle) * radius));
  }
  return points;
}

function makeRadialGlowTexture(innerColor, outerColor) {
  const size = 256;
  const canvas2d = document.createElement("canvas");
  canvas2d.width = size;
  canvas2d.height = size;
  const ctx = canvas2d.getContext("2d");
  const gradient = ctx.createRadialGradient(size / 2, size / 2, 4, size / 2, size / 2, size / 2);
  gradient.addColorStop(0, innerColor);
  gradient.addColorStop(0.16, "rgba(255, 179, 92, 0.42)");
  gradient.addColorStop(0.46, "rgba(255, 128, 42, 0.18)");
  gradient.addColorStop(0.78, "rgba(255, 94, 22, 0.055)");
  gradient.addColorStop(1, outerColor);
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, size, size);
  const texture = new THREE.CanvasTexture(canvas2d);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  return texture;
}

function makePineTree(height, material) {
  const tree = new THREE.Group();
  const trunk = new THREE.Mesh(
    new THREE.CylinderGeometry(0.08, 0.15, height * 0.88, 7),
    material === treeMat ? barkMat : material,
  );
  trunk.position.y = height * 0.44;
  trunk.castShadow = true;
  trunk.receiveShadow = true;
  tree.add(trunk);

  const branchCount = Math.floor(6 + height * 1.4);
  const branchMat = treeMat;
  for (let i = 0; i < branchCount; i += 1) {
    const level = i / branchCount;
    const branch = new THREE.Mesh(
      new THREE.ConeGeometry((1 - level) * 0.9 + 0.18, height * 0.24, 5),
      branchMat,
    );
    branch.position.y = height * (0.22 + level * 0.66);
    branch.scale.z = 0.25;
    branch.rotation.y = i * 1.82;
    branch.rotation.x = Math.PI * 0.54;
    branch.castShadow = true;
    branch.receiveShadow = true;
    tree.add(branch);
  }

  const needles = new THREE.Mesh(
    new THREE.ConeGeometry(height * 0.18, height * 0.28, 6),
    branchMat,
  );
  needles.position.y = height * 0.96;
  needles.castShadow = true;
  needles.receiveShadow = true;
  tree.add(needles);
  return tree;
}

function makeCampShip() {
  const group = new THREE.Group();
  const hullMat = new THREE.MeshStandardMaterial({
    color: 0x101820,
    roughness: 0.64,
    metalness: 0.36,
    emissive: 0x081018,
    emissiveIntensity: 0.28,
  });
  const goldMat = new THREE.MeshBasicMaterial({ color: 0xffb45c });
  const glassMat = new THREE.MeshStandardMaterial({
    color: 0x5fbfd2,
    roughness: 0.2,
    metalness: 0.1,
    transparent: true,
    opacity: 0.78,
    emissive: 0x113e47,
    emissiveIntensity: 0.9,
  });

  const body = new THREE.Mesh(new THREE.SphereGeometry(1.08, 32, 18), hullMat);
  body.scale.set(1.35, 0.72, 0.92);
  body.position.y = 1.65;
  group.add(body);

  const nose = new THREE.Mesh(new THREE.ConeGeometry(0.52, 1.15, 24), hullMat);
  nose.rotation.z = -Math.PI / 2;
  nose.position.set(1.42, 1.67, 0);
  group.add(nose);

  const cockpit = new THREE.Mesh(new THREE.SphereGeometry(0.5, 24, 14), glassMat);
  cockpit.scale.set(1, 0.46, 0.78);
  cockpit.position.set(-0.18, 2.21, 0.1);
  group.add(cockpit);

  const dish = new THREE.Mesh(new THREE.ConeGeometry(0.72, 0.34, 28, 1, true), goldMat);
  dish.rotation.x = Math.PI * 0.5;
  dish.position.set(-1.12, 2.35, 0.06);
  group.add(dish);

  for (let i = 0; i < 4; i += 1) {
    const side = i < 2 ? -1 : 1;
    const front = i % 2 === 0 ? -1 : 1;
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.06, 1.15, 7), hullMat);
    leg.position.set(side * 0.72, 0.74, front * 0.48);
    leg.rotation.z = side * 0.42;
    leg.rotation.x = front * 0.22;
    group.add(leg);

    const foot = new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.08, 0.2), hullMat);
    foot.position.set(side * 1.04, 0.18, front * 0.66);
    foot.rotation.y = front * 0.2;
    group.add(foot);
  }

  const flame = new THREE.PointLight(0xff8b35, 1.6, 4.5, 2);
  flame.position.set(1.95, 1.45, 0);
  group.add(flame);

  return group;
}

function makeRoastingRig() {
  const group = new THREE.Group();
  group.position.set(0, 0, 0);
  const fallback = new THREE.Group();
  group.add(fallback);
  const modelHolder = new THREE.Group();
  const holderStart = new THREE.Vector3(2.35, -1.08, -0.45);
  const holderEnd = new THREE.Vector3(0.56, -0.34, -2.18);
  modelHolder.position.copy(holderStart);
  modelHolder.rotation.set(0.12, -0.58, -0.72);
  group.add(modelHolder);

  const stickMat = new THREE.MeshStandardMaterial({
    color: 0x5c3518,
    roughness: 0.88,
    metalness: 0.02,
    emissive: 0x120804,
    emissiveIntensity: 0.15,
  });
  const marshmallowMat = new THREE.MeshStandardMaterial({
    color: 0xfff1d4,
    roughness: 0.74,
    emissive: 0x3b210b,
    emissiveIntensity: 0.18,
  });
  const charMat = new THREE.MeshStandardMaterial({
    color: 0x3a1908,
    roughness: 0.9,
    emissive: 0x1b0702,
    emissiveIntensity: 0.25,
  });
  const sleeveMat = new THREE.MeshStandardMaterial({
    color: 0x182333,
    roughness: 0.8,
    emissive: 0x07101a,
    emissiveIntensity: 0.25,
  });

  const stick = makeCylinderBetween(
    new THREE.Vector3(1.26, -0.76, -0.86),
    new THREE.Vector3(0.12, -0.24, -2.36),
    0.012,
    stickMat,
  );
  fallback.add(stick);

  const twig = makeCylinderBetween(
    new THREE.Vector3(0.12, -0.24, -2.36),
    new THREE.Vector3(-0.02, -0.18, -2.56),
    0.007,
    stickMat,
  );
  fallback.add(twig);

  const marshmallow = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.14, 0.16), marshmallowMat);
  marshmallow.position.set(0.02, -0.2, -2.48);
  marshmallow.rotation.set(0.22, 0.32, -0.14);
  fallback.add(marshmallow);

  const toastMarkA = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.08, 0.13), charMat);
  toastMarkA.position.set(0.055, -0.19, -2.405);
  toastMarkA.rotation.set(0.22, 0.32, -0.14);
  fallback.add(toastMarkA);

  const toastMarkB = toastMarkA.clone();
  toastMarkB.position.set(-0.035, -0.215, -2.555);
  fallback.add(toastMarkB);

  const sleeve = makeCylinderBetween(
    new THREE.Vector3(1.68, -0.98, -0.48),
    new THREE.Vector3(1.2, -0.74, -0.86),
    0.12,
    sleeveMat,
  );
  group.add(sleeve);

  const hand = new THREE.Mesh(new THREE.SphereGeometry(0.17, 16, 12), sleeveMat);
  hand.position.set(1.2, -0.74, -0.86);
  hand.scale.set(0.86, 0.44, 0.58);
  hand.rotation.set(0.12, -0.34, -0.28);
  group.add(hand);

  const emberLight = new THREE.PointLight(0xff8b35, 0.65, 3.2, 1.8);
  emberLight.position.set(0.04, -0.08, -2.38);
  group.add(emberLight);

  group.userData = {
    baseStickRotation: stick.rotation.clone(),
    marshmallow,
    modelHolder,
    modelHolderBaseRotation: modelHolder.rotation.clone(),
    holderStart,
    holderEnd,
    emberLight,
    stick,
  };
  loadModelIntoGroup(modelHolder, "./assets/marshmallow_stick.glb", {
    fallback,
    targetMaxSize: 1.8,
    center: true,
    name: "Marshmallow stick",
  });
  return group;
}

function makeCylinderBetween(start, end, radius, material) {
  const direction = new THREE.Vector3().subVectors(end, start);
  const length = direction.length();
  const cylinder = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, length, 10), material);
  cylinder.position.copy(start).add(end).multiplyScalar(0.5);
  cylinder.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction.normalize());
  return cylinder;
}

function loadModelIntoGroup(container, url, options = {}) {
  gltfLoader.load(
    url,
    (gltf) => {
      const model = gltf.scene;
      model.name = options.name ?? "loaded glb";
      model.traverse((child) => {
        if (!child.isMesh) return;
        child.castShadow = false;
        child.receiveShadow = true;
        if (child.material) {
          child.material.side = THREE.FrontSide;
          child.material.needsUpdate = true;
        }
      });

      normalizeModel(model, {
        targetMaxSize: options.targetMaxSize,
        targetHeight: options.targetHeight,
        groundY: options.groundY ?? 0,
        center: options.center ?? false,
      });

      container.add(model);
      if (options.avoidObjects?.length) {
        resolveContainerCollisions(container, options.avoidObjects, options.collisionPadding ?? 0);
      }
      if (options.fallback) options.fallback.visible = false;
    },
    undefined,
    (error) => {
      console.warn(`Could not load ${options.name ?? url}`, error);
      if (options.fallback) options.fallback.visible = true;
    },
  );
}

function resolveContainerCollisions(container, avoidObjects, padding = 0) {
  container.updateWorldMatrix(true, true);
  const movingBox = new THREE.Box3().setFromObject(container).expandByScalar(padding);
  const tmpBox = new THREE.Box3();
  const pushDirection = new THREE.Vector3(container.position.x, 0, container.position.z);
  if (pushDirection.lengthSq() < 0.001) pushDirection.set(1, 0, 0);
  pushDirection.normalize();

  for (let pass = 0; pass < 10; pass += 1) {
    let hasCollision = false;
    for (const object of avoidObjects) {
      tmpBox.setFromObject(object).expandByScalar(padding);
      if (!movingBox.intersectsBox(tmpBox)) continue;
      hasCollision = true;
      container.position.addScaledVector(pushDirection, 0.32);
      container.updateWorldMatrix(true, true);
      movingBox.setFromObject(container).expandByScalar(padding);
      break;
    }
    if (!hasCollision) return;
  }
}

function normalizeModel(model, options = {}) {
  model.updateWorldMatrix(true, true);
  const box = new THREE.Box3().setFromObject(model);
  const size = new THREE.Vector3();
  box.getSize(size);
  const maxSize = Math.max(size.x, size.y, size.z);
  if (maxSize === 0) return;

  const scale = options.targetHeight
    ? options.targetHeight / size.y
    : (options.targetMaxSize ?? maxSize) / maxSize;
  model.scale.multiplyScalar(scale);
  model.updateWorldMatrix(true, true);

  const scaledBox = new THREE.Box3().setFromObject(model);
  const center = new THREE.Vector3();
  scaledBox.getCenter(center);
  if (options.center) {
    model.position.sub(center);
  } else {
    model.position.x -= center.x;
    model.position.z -= center.z;
    model.position.y += (options.groundY ?? 0) - scaledBox.min.y;
  }
}

function makeEyeSymbol() {
  return makeCanvasSprite(640, 640, (ctx, w, h) => {
    const cx = w / 2;
    const cy = h / 2;
    const starlight = "#e2e6ff";
    const violet = "#8276ff";

    ctx.lineCap = "butt";
    ctx.lineJoin = "miter";
    ctx.shadowColor = "rgba(130, 118, 255, 0.66)";
    ctx.shadowBlur = 22;

    function strokePath(points, color = starlight, width = 8) {
      ctx.beginPath();
      points.forEach(([x, y], index) => {
        if (index === 0) ctx.moveTo(cx + x, cy + y);
        else ctx.lineTo(cx + x, cy + y);
      });
      ctx.strokeStyle = color;
      ctx.lineWidth = width;
      ctx.stroke();
    }

    const rays = [
      [0, -230, 0, -75, 7],
      [0, 76, 0, 238, 7],
      [-248, 0, -83, 0, 7],
      [84, 0, 264, 0, 7],
      [-182, -158, -64, -58, 4],
      [98, -88, 230, -222, 8],
      [-184, 172, -70, 66, 6],
      [82, 72, 220, 160, 5],
      [76, 118, 146, 246, 8],
      [-94, -220, -48, -74, 4],
      [166, 118, 246, 190, 4],
      [-232, 70, -82, 28, 4],
    ];
    rays.forEach(([x1, y1, x2, y2, width], index) => {
      strokePath([[x1, y1], [x2, y2]], index % 3 === 0 ? violet : starlight, width);
    });

    const mazePaths = [
      [[-120, -42], [-148, -42], [-148, -86], [-98, -86], [-98, -124], [-36, -124], [-36, -86], [-68, -86], [-68, -46]],
      [[-96, -16], [-142, -16], [-142, 28], [-96, 28], [-96, 72], [-46, 72], [-46, 118], [-7, 118]],
      [[-34, -118], [-34, -66], [-72, -66], [-72, -24], [-34, -24], [-34, 24], [-72, 24], [-72, 66]],
      [[24, -124], [24, -76], [68, -76], [68, -36], [112, -36], [112, -82], [146, -82]],
      [[52, -108], [92, -108], [92, -62], [42, -62], [42, -18], [86, -18], [86, 30]],
      [[122, -20], [152, -20], [152, 34], [112, 34], [112, 82], [60, 82], [60, 122]],
      [[28, 118], [28, 70], [-14, 70], [-14, 28], [30, 28], [30, -16]],
      [[-122, 58], [-166, 58], [-166, 104], [-116, 104], [-116, 138], [-60, 138]],
      [[-158, -58], [-196, -58], [-196, -12], [-154, -12], [-154, 20]],
      [[146, 60], [188, 60], [188, 16], [148, 16]],
      [[-14, -150], [18, -150], [18, -106], [-14, -106], [-14, -64]],
      [[-18, 154], [18, 154], [18, 104], [-18, 104], [-18, 72]],
    ];
    mazePaths.forEach((path, index) => {
      strokePath(path, index % 4 === 0 ? violet : starlight, index % 5 === 0 ? 9 : 7);
    });

    ctx.shadowBlur = 0;
    ctx.globalCompositeOperation = "destination-out";
    ctx.beginPath();
    ctx.arc(cx, cy, 43, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalCompositeOperation = "source-over";
  }, {
    opacity: 0.9,
    blending: THREE.AdditiveBlending,
  });
}

function makeCoordinateGlyphs() {
  return makeCanvasSprite(980, 230, (ctx, w, h) => {
    ctx.translate(28, 16);
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.shadowColor = "rgba(130, 118, 255, 0.54)";
    ctx.shadowBlur = 22;
    ctx.strokeStyle = "#e2e6ff";
    ctx.lineWidth = 16;

    function draw(points, offsetX) {
      ctx.beginPath();
      points.forEach(([x, y], index) => {
        if (index === 0) ctx.moveTo(offsetX + x, y);
        else ctx.lineTo(offsetX + x, y);
      });
      ctx.stroke();
    }

    draw([[150, 10], [12, 98], [78, 192]], 0);
    draw([[20, 10], [176, 10], [102, 104], [20, 210]], 260);
    draw([[176, 10], [102, 104], [176, 210]], 260);
    draw([[120, 10], [34, 104], [120, 210]], 512);
    draw([[132, 10], [228, 104], [132, 210]], 512);
    draw([[20, 10], [84, 104], [20, 210]], 816);
    draw([[150, 10], [216, 104], [150, 210]], 816);
  }, {
    opacity: 0.92,
    blending: THREE.AdditiveBlending,
  });
}

function makeCanvasSprite(width, height, draw, options = {}) {
  const canvas2d = document.createElement("canvas");
  canvas2d.width = width;
  canvas2d.height = height;
  const ctx = canvas2d.getContext("2d");
  ctx.clearRect(0, 0, width, height);
  draw(ctx, width, height);
  const texture = new THREE.CanvasTexture(canvas2d);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  const material = new THREE.SpriteMaterial({
    map: texture,
    transparent: true,
    opacity: options.opacity ?? 1,
    blending: options.blending ?? THREE.NormalBlending,
    depthTest: options.depthTest ?? true,
    depthWrite: false,
  });
  material.fog = false;
  return new THREE.Sprite(material);
}

function makeTextSprite(text, options = {}) {
  const canvas2d = document.createElement("canvas");
  canvas2d.width = options.width ?? 512;
  canvas2d.height = options.height ?? 96;
  const ctx = canvas2d.getContext("2d");
  ctx.clearRect(0, 0, canvas2d.width, canvas2d.height);
  ctx.fillStyle = "rgba(2, 3, 10, 0.42)";
  ctx.fillRect(0, 0, canvas2d.width, canvas2d.height);
  ctx.strokeStyle = options.accent ?? "#76e5d2";
  ctx.lineWidth = 3;
  ctx.strokeRect(10, 10, canvas2d.width - 20, canvas2d.height - 20);
  ctx.fillStyle = options.color ?? "#f7f0d4";
  ctx.font = "700 32px ui-monospace, Menlo, monospace";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(text, canvas2d.width / 2, canvas2d.height / 2);

  const texture = new THREE.CanvasTexture(canvas2d);
  texture.colorSpace = THREE.SRGBColorSpace;
  return new THREE.Sprite(
    new THREE.SpriteMaterial({
      map: texture,
      transparent: true,
      depthWrite: false,
    }),
  );
}

function replaceWithReferenceLineArt(sprite, src, options = {}) {
  const image = new Image();
  image.onload = () => {
    const pad = options.pad ?? 24;
    const source = document.createElement("canvas");
    source.width = image.naturalWidth + pad * 2;
    source.height = image.naturalHeight + pad * 2;
    const ctx = source.getContext("2d");
    ctx.drawImage(image, pad, pad);

    const imageData = ctx.getImageData(0, 0, source.width, source.height);
    const data = imageData.data;
    const [r, g, b] = options.color ?? [247, 240, 212];
    const threshold = options.threshold ?? 235;
    const softness = options.softness ?? threshold;
    const alphaPower = options.alphaPower ?? 1;
    const edgeClear = options.edgeClear ?? 0;
    for (let i = 0; i < data.length; i += 4) {
      const pixel = i / 4;
      const x = pixel % source.width;
      const y = Math.floor(pixel / source.width);
      const luminance = data[i] * 0.2126 + data[i + 1] * 0.7152 + data[i + 2] * 0.0722;
      const normalized = luminance >= threshold ? 0 : Math.max(0, Math.min(1, (threshold - luminance) / softness));
      const alpha = Math.pow(normalized, alphaPower) * 255;
      data[i] = r;
      data[i + 1] = g;
      data[i + 2] = b;
      data[i + 3] = x < edgeClear || y < edgeClear || x > source.width - edgeClear || y > source.height - edgeClear ? 0 : alpha;
    }
    ctx.putImageData(imageData, 0, 0);

    const glow = document.createElement("canvas");
    glow.width = source.width;
    glow.height = source.height;
    const glowCtx = glow.getContext("2d");
    const [gr, gg, gb] = options.glowColor ?? [118, 229, 210];
    glowCtx.filter = "blur(8px)";
    glowCtx.drawImage(source, 0, 0);
    glowCtx.globalCompositeOperation = "source-in";
    glowCtx.fillStyle = `rgba(${gr}, ${gg}, ${gb}, ${options.glow ?? 0.48})`;
    glowCtx.fillRect(0, 0, glow.width, glow.height);
    glowCtx.globalCompositeOperation = "source-over";
    glowCtx.filter = "none";
    glowCtx.drawImage(source, 0, 0);

    const texture = new THREE.CanvasTexture(glow);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.minFilter = THREE.LinearFilter;
    texture.magFilter = THREE.LinearFilter;
    sprite.material.map?.dispose();
    sprite.material.map = texture;
    sprite.material.opacity = options.opacity ?? sprite.material.opacity;
    sprite.material.needsUpdate = true;
  };
  image.src = src;
}

function updateClock(now) {
  const hours = now.getHours();
  const minutes = now.getMinutes();
  const seconds = now.getSeconds();
  const ms = now.getMilliseconds();
  clockEl.textContent = `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
  dateEl.textContent = new Intl.DateTimeFormat("zh-CN", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  }).format(now);

  const secondAngle = ((seconds + ms / 1000) / 60) * Math.PI * 2;
  const minuteAngle = ((minutes + seconds / 60) / 60) * Math.PI * 2;
  const hourAngle = (((hours % 12) + minutes / 60) / 12) * Math.PI * 2;

  return { hours, minutes, seconds, secondAngle, minuteAngle, hourAngle };
}

function animate(time = 0) {
  const t = time * 0.001;
  const now = new Date();
  const clock = updateClock(now);
  const motion = (reducedMotion ? 0.18 : 1) * motionScale;
  const beat = 0.82 + Math.sin(clock.secondAngle * 6 + t * 4) * 0.06;
  const emberPulse = 0.86
    + Math.sin(t * 7.4) * 0.07
    + Math.sin(t * 13.7 + 1.8) * 0.045
    + clickBurst * 0.18;
  const focusBoost = focusIntensityActive ? 1.1 : 1;

  fireLight.intensity = (26 + emberPulse * 8 + clickBurst * 8) * focusBoost;
  fireLight.position.set(
    Math.sin(t * 5.8) * 0.16,
    1.04 + Math.sin(t * 8.7 + 0.6) * 0.12,
    Math.cos(t * 4.9) * 0.14,
  );
  fireLight.color.setHSL(0.065 + Math.sin(t * 2.2) * 0.014, 1, 0.57);
  emberFillLight.intensity = (7.4 + emberPulse * 3.4 + clickBurst * 3.5) * focusBoost;
  forestBounceLights.forEach((light, index) => {
    light.intensity = (4.5 + emberPulse * 2.1 + Math.sin(t * (1.4 + index * 0.23)) * 0.42) * focusBoost;
  });
  canopyWashLight.intensity = (9.2 + emberPulse * 4.8 + clickBurst * 2.6) * focusBoost;
  canopyWashLight.target.position.set(
    Math.sin(t * 0.64) * 1.1,
    3.2 + Math.sin(t * 1.2) * 0.34,
    -5.4 + Math.cos(t * 0.5) * 0.9,
  );
  fireGlow.material.opacity = 0.46 + emberPulse * 0.1 + clickBurst * 0.07;
  fireGlow.scale.setScalar(0.98 + emberPulse * 0.055 + clickBurst * 0.035);
  groundRing.material.opacity = 0.2 + emberPulse * 0.08;
  treeMat.emissiveIntensity = 0.36 + emberPulse * 0.18;
  barkMat.emissiveIntensity = 0.28 + emberPulse * 0.12;

  flames.forEach((flame, index) => {
    const wobble = Math.sin(t * (2.6 + flame.userData.layer) + flame.userData.seed);
    flame.scale.set(
      (0.75 + flame.userData.layer * 0.16) * beat * (1 + wobble * 0.06),
      (1.05 + flame.userData.layer * 0.18) * beat * (1 + wobble * 0.16),
      (0.75 + flame.userData.layer * 0.16) * beat,
    );
    flame.position.y = flame.userData.baseY + wobble * 0.12;
    flame.rotation.y += (0.004 + index * 0.0002) * motion;
    flame.material.opacity = Math.max(0.24, (0.62 - flame.userData.layer * 0.12) + Math.sin(t * 3 + index) * 0.05);
  });

  const positions = sparks.geometry.attributes.position.array;
  for (let i = 0; i < sparkCount; i += 1) {
    const seed = sparkSeeds[i];
    const y = ((t * seed.speed * motion + seed.offset + clickBurst * 2) % 5.4);
    const twist = seed.angle + t * seed.drift + y * 0.18;
    const radius = seed.radius + y * 0.08 + clickBurst * 0.75 * (1 - y / 5.4);
    positions[i * 3] = Math.cos(twist) * radius;
    positions[i * 3 + 1] = y + 0.5;
    positions[i * 3 + 2] = Math.sin(twist) * radius;
  }
  sparks.geometry.attributes.position.needsUpdate = true;
  sparks.material.opacity = 0.72 + clickBurst * 0.22;
  clickBurst *= 0.92;

  cosmicVFX.update(t, camera);
  horizonGlow.material.opacity = 0.1 + Math.sin(t * 0.7) * 0.025;
  violetLight.intensity = 1.85 + Math.sin(t * 0.75) * 0.32;
  stones.rotation.y = Math.sin(t * 0.17) * 0.015;
  forest.children.forEach((tree) => {
    tree.rotation.z = tree.userData.lean * 0.18 + Math.sin(t * 0.9 + tree.userData.seed) * 0.012 * motion;
  });
  ship.position.y = ship.userData.baseY;
  ship.rotation.z = 0.02 + Math.sin(t * 0.5) * 0.003 * motion;
  eyeSky.rotation.z = Math.sin(t * 0.08) * 0.035;
  eyeSymbol.rotation.z += 0.0019 * motion;
  coordinateGlyphs.material.opacity = 0.78 + Math.sin(t * 1.4) * 0.1;

  const cometAngle = clock.secondAngle + t * 0.22;
  comet.position.set(Math.cos(cometAngle) * 10.5, 5.6 + Math.sin(t * 0.8) * 1.2, -7 + Math.sin(cometAngle) * 6.2);

  const targetBlend = roastViewActive ? 1 : 0;
  roastBlend += (targetBlend - roastBlend) * (roastTransitioningOut ? 0.035 : 0.065);
  roastReach += ((roastViewActive ? 1 : 0) - roastReach) * 0.012;
  if (roastBlend < 0.015 && !roastViewActive) {
    roastingRig.visible = false;
    roastTransitioningOut = false;
  }
  if (roastBlend > 0.015) {
    roastingRig.visible = true;
    camera.position.lerp(roastViewActive ? roastCameraPosition : defaultCameraPosition, roastViewActive ? 0.075 : 0.04);
    controls.target.lerp(roastViewActive ? roastControlsTarget : defaultControlsTarget, roastViewActive ? 0.08 : 0.045);
    roastingRig.position.y = Math.sin(t * 1.8) * 0.018;
    roastingRig.rotation.z = Math.sin(t * 1.35) * 0.015;
    roastingRig.rotation.y = Math.sin(t * 0.9) * 0.012;
    roastingRig.userData.marshmallow.rotation.x += 0.012 * motion;
    const reachEase = roastReach * roastReach * (3 - 2 * roastReach);
    roastingRig.userData.modelHolder.position.lerpVectors(
      roastingRig.userData.holderStart,
      roastingRig.userData.holderEnd,
      reachEase,
    );
    roastingRig.userData.modelHolder.rotation.x = roastingRig.userData.modelHolderBaseRotation.x + Math.sin(t * 1.15) * 0.045;
    roastingRig.userData.modelHolder.rotation.y = roastingRig.userData.modelHolderBaseRotation.y + Math.sin(t * 0.82) * 0.035;
    roastingRig.userData.emberLight.intensity = 0.45 + Math.sin(t * 4.2) * 0.15;
  }

  controls.update();
  if (!roastViewActive) {
    controls.target.y = Math.max(0.72, controls.target.y);
    camera.position.y = Math.max(1.05, camera.position.y);
  }
  composer.render();
  requestAnimationFrame(animate);
}

function handleResize() {
  const pixelRatio = Math.min(window.devicePixelRatio, 2);
  const postPixelRatio = Math.min(window.devicePixelRatio, window.innerWidth < 720 ? 1.35 : 1.75);
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setPixelRatio(pixelRatio);
  renderer.setSize(window.innerWidth, window.innerHeight);
  composer.setPixelRatio(postPixelRatio);
  composer.setSize(window.innerWidth, window.innerHeight);
  bloomPass.setSize(window.innerWidth, window.innerHeight);
  fxaaPass.material.uniforms.resolution.value.set(
    1 / (window.innerWidth * postPixelRatio),
    1 / (window.innerHeight * postPixelRatio),
  );
  cosmicVFX.setPixelRatio(pixelRatio);
}

window.addEventListener("resize", handleResize);
window.addEventListener("beforeunload", () => {
  cosmicVFX.dispose();
  composer.dispose?.();
});
animate();

  return {
    enterRoastView,
    exitRoastView,
    isRoastViewActive: () => roastViewActive,
    setMotionScale: (scale) => {
      motionScale = scale;
    },
    setFocusIntensity: (active) => {
      focusIntensityActive = active;
    },
  };
}
