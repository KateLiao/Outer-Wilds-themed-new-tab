export const starVertexShader = `
  attribute float aSize;
  attribute float aBrightness;
  attribute float aTemperature;
  attribute float aTwinkleSpeed;
  attribute float aPhase;

  uniform float uTime;
  uniform float uPixelRatio;
  uniform float uAnimationSpeed;

  varying float vBrightness;
  varying float vTemperature;
  varying float vTwinkle;

  void main() {
    vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
    float softPulse = sin(uTime * uAnimationSpeed * aTwinkleSpeed + aPhase);
    float slowPulse = sin(uTime * uAnimationSpeed * aTwinkleSpeed * 0.37 + aPhase * 1.7);
    vTwinkle = 0.88 + softPulse * 0.08 + slowPulse * 0.04;
    vBrightness = aBrightness;
    vTemperature = aTemperature;
    gl_PointSize = aSize * uPixelRatio * vTwinkle * (180.0 / max(40.0, -mvPosition.z));
    gl_Position = projectionMatrix * mvPosition;
  }
`;

export const starFragmentShader = `
  precision highp float;

  varying float vBrightness;
  varying float vTemperature;
  varying float vTwinkle;

  vec3 temperatureColor(float t) {
    vec3 warm = vec3(1.0, 0.84, 0.66);
    vec3 paleGold = vec3(1.0, 0.94, 0.78);
    vec3 coldWhite = vec3(0.88, 0.94, 1.0);
    vec3 blue = vec3(0.7, 0.8, 1.0);
    vec3 a = mix(warm, paleGold, smoothstep(0.0, 0.35, t));
    vec3 b = mix(coldWhite, blue, smoothstep(0.58, 1.0, t));
    return mix(a, b, smoothstep(0.28, 0.78, t));
  }

  void main() {
    vec2 uv = gl_PointCoord - 0.5;
    float dist = length(uv);
    float core = smoothstep(0.48, 0.02, dist);
    float feather = smoothstep(0.5, 0.18, dist) * 0.34;
    float alpha = (core + feather) * vBrightness * vTwinkle;
    if (alpha < 0.01) discard;
    gl_FragColor = vec4(temperatureColor(vTemperature) * (0.68 + vBrightness * 0.52), alpha);
  }
`;

export const dustVertexShader = `
  attribute float aSize;
  attribute float aPhase;

  uniform float uTime;
  uniform float uPixelRatio;
  uniform float uAnimationSpeed;

  varying float vPhase;

  void main() {
    vec3 drifted = position;
    drifted.x += sin(uTime * 0.018 * uAnimationSpeed + aPhase) * 4.0;
    drifted.y += cos(uTime * 0.014 * uAnimationSpeed + aPhase * 0.7) * 2.2;
    vec4 mvPosition = modelViewMatrix * vec4(drifted, 1.0);
    vPhase = aPhase;
    gl_PointSize = aSize * uPixelRatio * (220.0 / max(70.0, -mvPosition.z));
    gl_Position = projectionMatrix * mvPosition;
  }
`;

export const dustFragmentShader = `
  precision highp float;

  uniform float uIntensity;
  varying float vPhase;

  float hash(vec2 p) {
    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
  }

  void main() {
    vec2 uv = gl_PointCoord - 0.5;
    float dist = length(uv);
    float cloud = smoothstep(0.5, 0.04, dist);
    float grain = hash(gl_PointCoord * 18.0 + vPhase) * 0.16;
    float alpha = (cloud * 0.42 + grain * cloud) * uIntensity;
    if (alpha < 0.004) discard;
    vec3 color = mix(vec3(0.05, 0.08, 0.16), vec3(0.16, 0.14, 0.25), hash(vec2(vPhase, dist)));
    gl_FragColor = vec4(color, alpha);
  }
`;

export const billboardVertexShader = `
  varying vec2 vUv;

  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

export const supernovaCoreFragmentShader = `
  precision highp float;

  uniform float uTime;
  uniform float uIntensity;
  uniform float uAnimationSpeed;
  varying vec2 vUv;

  void main() {
    vec2 uv = vUv - 0.5;
    float d = length(uv);
    float pulse = 0.72 + sin(uTime * 0.28 * uAnimationSpeed) * 0.16 + sin(uTime * 0.071 * uAnimationSpeed) * 0.08;
    float core = smoothstep(0.11, 0.0, d);
    float halo = smoothstep(0.48, 0.02, d) * 0.32;
    float alpha = (core * 1.15 + halo) * pulse * uIntensity;
    if (alpha < 0.006) discard;
    vec3 color = mix(vec3(0.64, 0.78, 1.0), vec3(1.0, 0.96, 0.82), core);
    gl_FragColor = vec4(color, alpha);
  }
`;

export const supernovaRaysFragmentShader = `
  precision highp float;

  uniform float uTime;
  uniform float uIntensity;
  uniform float uAnimationSpeed;
  varying vec2 vUv;

  float hash(float n) {
    return fract(sin(n) * 43758.5453123);
  }

  void main() {
    vec2 uv = vUv - 0.5;
    float d = length(uv);
    float angle = atan(uv.y, uv.x);
    float rayAlpha = 0.0;
    for (int i = 0; i < 18; i++) {
      float fi = float(i);
      float a = -3.14159265 + fi * 0.369 + hash(fi * 2.17) * 0.19;
      float diff = abs(atan(sin(angle - a), cos(angle - a)));
      float width = 0.008 + hash(fi + 8.0) * 0.018;
      float lengthNoise = 0.32 + hash(fi * 5.1) * 0.48;
      float ray = smoothstep(width, 0.0, diff) * smoothstep(lengthNoise, 0.05, d);
      rayAlpha += ray * (0.32 + hash(fi * 9.3) * 0.65);
    }
    float pulse = 0.55 + sin(uTime * 0.11 * uAnimationSpeed) * 0.18;
    float alpha = rayAlpha * smoothstep(0.52, 0.04, d) * pulse * uIntensity;
    if (alpha < 0.006) discard;
    vec3 color = mix(vec3(0.52, 0.72, 1.0), vec3(1.0, 0.94, 0.74), 0.28);
    gl_FragColor = vec4(color, alpha);
  }
`;

export const supernovaShockwaveFragmentShader = `
  precision highp float;

  uniform float uTime;
  uniform float uIntensity;
  uniform float uAnimationSpeed;
  varying vec2 vUv;

  void main() {
    vec2 uv = vUv - 0.5;
    uv.x *= 1.32;
    float d = length(uv);
    float cycle = fract(uTime * 0.045 * uAnimationSpeed);
    float radius = mix(0.16, 0.48, cycle);
    float ring = smoothstep(0.028, 0.0, abs(d - radius));
    float fade = smoothstep(1.0, 0.12, cycle);
    float alpha = ring * fade * 0.32 * uIntensity;
    if (alpha < 0.004) discard;
    gl_FragColor = vec4(vec3(0.55, 0.76, 1.0), alpha);
  }
`;

export const debrisVertexShader = `
  attribute vec3 aVelocity;
  attribute float aSize;
  attribute float aPhase;

  uniform float uTime;
  uniform float uPixelRatio;
  uniform float uAnimationSpeed;

  varying float vLife;

  void main() {
    float cycle = fract(uTime * 0.045 * uAnimationSpeed + aPhase);
    vec3 p = position + aVelocity * cycle * 3.8;
    vLife = smoothstep(1.0, 0.0, cycle);
    vec4 mvPosition = modelViewMatrix * vec4(p, 1.0);
    gl_PointSize = aSize * uPixelRatio * (160.0 / max(40.0, -mvPosition.z));
    gl_Position = projectionMatrix * mvPosition;
  }
`;

export const debrisFragmentShader = `
  precision highp float;

  uniform float uIntensity;
  varying float vLife;

  void main() {
    vec2 uv = gl_PointCoord - 0.5;
    float d = length(uv);
    float alpha = smoothstep(0.5, 0.05, d) * vLife * 0.28 * uIntensity;
    if (alpha < 0.006) discard;
    gl_FragColor = vec4(vec3(0.75, 0.88, 1.0), alpha);
  }
`;
