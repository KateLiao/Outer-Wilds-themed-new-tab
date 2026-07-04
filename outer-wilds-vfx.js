import * as THREE from "three";
import {
  billboardVertexShader,
  debrisFragmentShader,
  debrisVertexShader,
  dustFragmentShader,
  dustVertexShader,
  starFragmentShader,
  starVertexShader,
  supernovaCoreFragmentShader,
  supernovaRaysFragmentShader,
  supernovaShockwaveFragmentShader,
} from "./vfx-shaders.js";

const coldWhite = new THREE.Color(0xdde8ff);
const paleBlue = new THREE.Color(0x9fbfff);
const paleGold = new THREE.Color(0xffe4a1);
const paleOrange = new THREE.Color(0xffbd87);

export class OuterWildsInspiredStarfield {
  constructor({
    starCount = 10000,
    radius = 210,
    shellDepth = 165,
    animationSpeed = 1,
  } = {}) {
    this.group = new THREE.Group();
    this.group.name = "OuterWildsInspiredStarfield";
    this.animationSpeed = animationSpeed;
    this.geometry = new THREE.BufferGeometry();

    const positions = new Float32Array(starCount * 3);
    const sizes = new Float32Array(starCount);
    const brightness = new Float32Array(starCount);
    const temperature = new Float32Array(starCount);
    const twinkleSpeed = new Float32Array(starCount);
    const phase = new Float32Array(starCount);
    const clusters = createClusters(22);

    for (let i = 0; i < starCount; i += 1) {
      const clustered = Math.random() < 0.28;
      const direction = clustered ? sampleClusterDirection(clusters) : randomDirection();
      const distance = radius + Math.pow(Math.random(), 0.72) * shellDepth;
      positions[i * 3] = direction.x * distance;
      positions[i * 3 + 1] = direction.y * distance;
      positions[i * 3 + 2] = direction.z * distance;

      const brightChance = Math.random();
      sizes[i] = brightChance > 0.994 ? 3.5 + Math.random() * 1.15 : 0.82 + Math.pow(Math.random(), 2.35) * 2.35;
      brightness[i] = brightChance > 0.994 ? 0.66 + Math.random() * 0.24 : 0.14 + Math.pow(Math.random(), 1.55) * 0.48;
      temperature[i] = Math.random();
      twinkleSpeed[i] = 0.18 + Math.random() * 0.62;
      phase[i] = Math.random() * Math.PI * 2;
    }

    this.geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    this.geometry.setAttribute("aSize", new THREE.BufferAttribute(sizes, 1));
    this.geometry.setAttribute("aBrightness", new THREE.BufferAttribute(brightness, 1));
    this.geometry.setAttribute("aTemperature", new THREE.BufferAttribute(temperature, 1));
    this.geometry.setAttribute("aTwinkleSpeed", new THREE.BufferAttribute(twinkleSpeed, 1));
    this.geometry.setAttribute("aPhase", new THREE.BufferAttribute(phase, 1));

    this.material = new THREE.ShaderMaterial({
      vertexShader: starVertexShader,
      fragmentShader: starFragmentShader,
      uniforms: {
        uTime: { value: 0 },
        uPixelRatio: { value: Math.min(window.devicePixelRatio, 2) },
        uAnimationSpeed: { value: animationSpeed },
      },
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });

    this.points = new THREE.Points(this.geometry, this.material);
    this.points.frustumCulled = false;
    this.group.add(this.points);
  }

  update(time, camera) {
    this.group.position.copy(camera.position);
    this.group.rotation.y = time * 0.004 * this.animationSpeed;
    this.group.rotation.x = Math.sin(time * 0.006) * 0.015;
    this.material.uniforms.uTime.value = time;
  }

  setPixelRatio(pixelRatio) {
    this.material.uniforms.uPixelRatio.value = pixelRatio;
  }

  dispose() {
    this.geometry.dispose();
    this.material.dispose();
  }
}

export class NebulaDust {
  constructor({
    particleCount = 70,
    radius = 165,
    dustIntensity = 0.13,
    animationSpeed = 1,
  } = {}) {
    this.group = new THREE.Group();
    this.group.name = "NebulaDust";
    this.geometry = new THREE.BufferGeometry();
    this.animationSpeed = animationSpeed;

    const positions = new Float32Array(particleCount * 3);
    const sizes = new Float32Array(particleCount);
    const phases = new Float32Array(particleCount);
    for (let i = 0; i < particleCount; i += 1) {
      const direction = randomDirection();
      const distance = radius + Math.random() * 80;
      positions[i * 3] = direction.x * distance;
      positions[i * 3 + 1] = direction.y * distance + 12;
      positions[i * 3 + 2] = direction.z * distance;
      sizes[i] = 34 + Math.random() * 90;
      phases[i] = Math.random() * Math.PI * 2;
    }

    this.geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    this.geometry.setAttribute("aSize", new THREE.BufferAttribute(sizes, 1));
    this.geometry.setAttribute("aPhase", new THREE.BufferAttribute(phases, 1));
    this.material = new THREE.ShaderMaterial({
      vertexShader: dustVertexShader,
      fragmentShader: dustFragmentShader,
      uniforms: {
        uTime: { value: 0 },
        uPixelRatio: { value: Math.min(window.devicePixelRatio, 2) },
        uIntensity: { value: dustIntensity },
        uAnimationSpeed: { value: animationSpeed },
      },
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    this.points = new THREE.Points(this.geometry, this.material);
    this.points.frustumCulled = false;
    this.group.add(this.points);
  }

  update(time, camera) {
    this.group.position.copy(camera.position);
    this.group.rotation.y = -time * 0.002 * this.animationSpeed;
    this.material.uniforms.uTime.value = time;
  }

  setPixelRatio(pixelRatio) {
    this.material.uniforms.uPixelRatio.value = pixelRatio;
  }

  dispose() {
    this.geometry.dispose();
    this.material.dispose();
  }
}

export class DistantSupernova {
  constructor({
    position = new THREE.Vector3(0, 13, -42),
    supernovaIntensity = 0.58,
    animationSpeed = 1,
  } = {}) {
    this.group = new THREE.Group();
    this.group.name = "DistantSupernova";
    this.group.position.copy(position);
    this.animationSpeed = animationSpeed;
    this.disposables = [];

    this.core = this.makeBillboard(2.35, supernovaCoreFragmentShader, supernovaIntensity);
    this.halo = this.makeBillboard(6.4, supernovaCoreFragmentShader, supernovaIntensity * 0.38);
    this.rays = this.makeBillboard(8.7, supernovaRaysFragmentShader, supernovaIntensity * 0.74);
    this.shockwave = this.makeBillboard(11.4, supernovaShockwaveFragmentShader, supernovaIntensity * 0.82);
    this.group.add(this.halo, this.rays, this.shockwave, this.core);

    this.debris = this.makeDebris(supernovaIntensity);
    this.group.add(this.debris);
  }

  makeBillboard(size, fragmentShader, intensity) {
    const geometry = new THREE.CircleGeometry(size * 0.5, 96);
    const material = new THREE.ShaderMaterial({
      vertexShader: billboardVertexShader,
      fragmentShader,
      uniforms: {
        uTime: { value: 0 },
        uIntensity: { value: intensity },
        uAnimationSpeed: { value: this.animationSpeed },
      },
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      depthTest: true,
    });
    material.fog = false;
    const mesh = new THREE.Mesh(geometry, material);
    this.disposables.push(geometry, material);
    return mesh;
  }

  makeDebris(intensity) {
    const count = 20;
    const geometry = new THREE.BufferGeometry();
    const positions = new Float32Array(count * 3);
    const velocities = new Float32Array(count * 3);
    const sizes = new Float32Array(count);
    const phases = new Float32Array(count);
    for (let i = 0; i < count; i += 1) {
      const dir = randomDirection();
      positions[i * 3] = dir.x * Math.random() * 0.35;
      positions[i * 3 + 1] = dir.y * Math.random() * 0.35;
      positions[i * 3 + 2] = dir.z * Math.random() * 0.35;
      velocities[i * 3] = dir.x * (0.12 + Math.random() * 0.58);
      velocities[i * 3 + 1] = dir.y * (0.12 + Math.random() * 0.58);
      velocities[i * 3 + 2] = dir.z * (0.12 + Math.random() * 0.58);
      sizes[i] = 0.75 + Math.random() * 1.35;
      phases[i] = Math.random();
    }
    geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute("aVelocity", new THREE.BufferAttribute(velocities, 3));
    geometry.setAttribute("aSize", new THREE.BufferAttribute(sizes, 1));
    geometry.setAttribute("aPhase", new THREE.BufferAttribute(phases, 1));
    const material = new THREE.ShaderMaterial({
      vertexShader: debrisVertexShader,
      fragmentShader: debrisFragmentShader,
      uniforms: {
        uTime: { value: 0 },
        uPixelRatio: { value: Math.min(window.devicePixelRatio, 2) },
        uIntensity: { value: intensity },
        uAnimationSpeed: { value: this.animationSpeed },
      },
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const points = new THREE.Points(geometry, material);
    this.disposables.push(geometry, material);
    return points;
  }

  update(time, camera) {
    this.group.children.forEach((child) => {
      if (child.isMesh) child.quaternion.copy(camera.quaternion);
      if (child.material?.uniforms?.uTime) child.material.uniforms.uTime.value = time;
    });
    this.debris.material.uniforms.uTime.value = time;
    this.group.rotation.z = Math.sin(time * 0.013 * this.animationSpeed) * 0.08;
  }

  setPixelRatio(pixelRatio) {
    if (this.debris.material?.uniforms?.uPixelRatio) {
      this.debris.material.uniforms.uPixelRatio.value = pixelRatio;
    }
  }

  dispose() {
    this.disposables.forEach((item) => item.dispose());
  }
}

export class OuterWildsCosmicVFX {
  constructor({
    starCount = window.innerWidth < 720 ? 6000 : 11000,
    supernovaPosition = new THREE.Vector3(-7.5, 15.5, -38),
    supernovaIntensity = 0.58,
    dustIntensity = 0.12,
    orbitLineOpacity = 0.16,
    animationSpeed = 1,
  } = {}) {
    this.group = new THREE.Group();
    this.group.name = "OuterWildsCosmicVFX";
    this.starfield = new OuterWildsInspiredStarfield({ starCount, animationSpeed });
    this.dust = new NebulaDust({ dustIntensity, animationSpeed });
    this.supernova = supernovaIntensity > 0
      ? new DistantSupernova({ position: supernovaPosition, supernovaIntensity, animationSpeed })
      : null;
    this.orbitLineOpacity = orbitLineOpacity;
    this.group.add(this.dust.group, this.starfield.group);
    if (this.supernova) this.group.add(this.supernova.group);
  }

  update(time, camera) {
    this.starfield.update(time, camera);
    this.dust.update(time, camera);
    this.supernova?.update(time, camera);
  }

  setPixelRatio(pixelRatio) {
    this.starfield.setPixelRatio(pixelRatio);
    this.dust.setPixelRatio(pixelRatio);
    this.supernova?.setPixelRatio(pixelRatio);
  }

  dispose() {
    this.starfield.dispose();
    this.dust.dispose();
    this.supernova?.dispose();
  }
}

function createClusters(count) {
  const clusters = [];
  for (let i = 0; i < count; i += 1) {
    clusters.push({
      direction: randomDirection(),
      spread: 0.075 + Math.random() * 0.18,
      weight: 0.35 + Math.random() * 0.85,
    });
  }
  return clusters;
}

function sampleClusterDirection(clusters) {
  const total = clusters.reduce((sum, cluster) => sum + cluster.weight, 0);
  let cursor = Math.random() * total;
  let chosen = clusters[0];
  for (const cluster of clusters) {
    cursor -= cluster.weight;
    if (cursor <= 0) {
      chosen = cluster;
      break;
    }
  }
  const jitter = randomDirection().multiplyScalar(chosen.spread * Math.random());
  return chosen.direction.clone().add(jitter).normalize();
}

function randomDirection() {
  const z = Math.random() * 2 - 1;
  const theta = Math.random() * Math.PI * 2;
  const radius = Math.sqrt(1 - z * z);
  return new THREE.Vector3(Math.cos(theta) * radius, z, Math.sin(theta) * radius);
}
