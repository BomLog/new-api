/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
GNU Affero General Public License for more details.

You should have received a copy of the GNU Affero General Public License
along with this program. If not, see <https://www.gnu.org/licenses/>.

For commercial licensing, please contact support@quantumnous.com
*/

// Hash-based 3D value noise and fractal Brownian motion shared by surfaces.
const NOISE = /* glsl */ `
float hash(vec3 p) {
  p = fract(p * 0.3183099 + 0.1);
  p *= 17.0;
  return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
}
float noise(vec3 x) {
  vec3 i = floor(x);
  vec3 f = fract(x);
  f = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(mix(hash(i), hash(i + vec3(1.0, 0.0, 0.0)), f.x),
        mix(hash(i + vec3(0.0, 1.0, 0.0)), hash(i + vec3(1.0, 1.0, 0.0)), f.x), f.y),
    mix(mix(hash(i + vec3(0.0, 0.0, 1.0)), hash(i + vec3(1.0, 0.0, 1.0)), f.x),
        mix(hash(i + vec3(0.0, 1.0, 1.0)), hash(i + vec3(1.0, 1.0, 1.0)), f.x), f.y),
    f.z);
}
float fbm(vec3 p) {
  float value = 0.0;
  float amplitude = 0.5;
  for (int i = 0; i < 3; i++) {
    value += amplitude * noise(p);
    p = p * 2.03 + vec3(1.7, 9.2, 3.1);
    amplitude *= 0.5;
  }
  return value;
}
`

// Spiral galaxy particles orbit on the GPU with differential rotation.
export const galaxyVertex = /* glsl */ `
uniform float uTime;
uniform float uSize;
uniform float uPixelRatio;
uniform float uReveal;
uniform float uSpinDir;
attribute float aRadius;
attribute float aAngle;
attribute float aHeight;
attribute float aScale;
attribute vec3 aColor;
varying vec3 vColor;
void main() {
  float angle = aAngle + uSpinDir * uTime * 0.042 / (0.28 + aRadius * 0.13);
  float radius = aRadius * mix(0.35, 1.0, uReveal);
  vec3 pos = vec3(cos(angle) * radius, aHeight, sin(angle) * radius);
  vec4 mv = modelViewMatrix * vec4(pos, 1.0);
  gl_Position = projectionMatrix * mv;
  gl_PointSize = clamp(uSize * aScale * uPixelRatio / max(-mv.z, 1.0), 1.0, 48.0);
  vColor = aColor * uReveal;
}
`

export const softPointFragment = /* glsl */ `
uniform float uOpacity;
varying vec3 vColor;
void main() {
  float d = length(gl_PointCoord - 0.5);
  float a = exp(-d * d * 22.0) * uOpacity;
  if (a < 0.003) discard;
  gl_FragColor = vec4(vColor, a);
}
`

// Background stars with twinkle and subtle 4-point diffraction sparkle on bright stars.
export const starVertex = /* glsl */ `
uniform float uTime;
uniform float uPixelRatio;
attribute float aScale;
attribute float aPhase;
attribute vec3 aColor;
varying vec3 vColor;
varying float vSparkle;
void main() {
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * mv;
  float twinkle = 0.6 + 0.4 * sin(uTime * (0.7 + aPhase * 1.4) + aPhase * 42.0);
  gl_PointSize = clamp(aScale * uPixelRatio * (0.85 + twinkle * 0.45), 1.0, 26.0);
  vColor = aColor * twinkle;
  vSparkle = smoothstep(2.6, 5.2, aScale);
}
`

export const starFragment = /* glsl */ `
uniform float uOpacity;
varying vec3 vColor;
varying float vSparkle;
void main() {
  vec2 p = gl_PointCoord - 0.5;
  float d = length(p);
  float core = exp(-d * d * 28.0);
  float crossSpike = (exp(-abs(p.x) * 24.0) * exp(-abs(p.y) * 5.0) +
                      exp(-abs(p.y) * 24.0) * exp(-abs(p.x) * 5.0)) * 0.45 * vSparkle;
  float a = (core + crossSpike) * uOpacity;
  if (a < 0.004) discard;
  gl_FragColor = vec4(vColor * (1.0 + crossSpike * 0.6), min(a, 1.0));
}
`

// Inter-galactic energy filament connecting two galaxies or orbital hubs.
export const bridgeLineVertex = /* glsl */ `
attribute float aProgress;
varying float vProgress;
void main() {
  vProgress = aProgress;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`

export const bridgeLineFragment = /* glsl */ `
uniform float uTime;
uniform float uOpacity;
uniform vec3 uColorA;
uniform vec3 uColorB;
uniform float uSpeed;
varying float vProgress;
void main() {
  float endFade = sin(vProgress * 3.14159265);
  float waveA = pow(0.5 + 0.5 * sin((vProgress * 8.0 - uTime * uSpeed) * 3.14159), 6.0);
  float waveB = pow(0.5 + 0.5 * sin((vProgress * 6.0 + uTime * uSpeed * 0.72) * 3.14159), 6.0);
  float shimmer = 0.28 + waveA * 0.65 + waveB * 0.4;
  vec3 color = mix(uColorA, uColorB, vProgress);
  color += vec3(0.45, 0.75, 1.0) * (waveA + waveB) * 0.35;
  float alpha = endFade * shimmer * uOpacity;
  if (alpha < 0.005) discard;
  gl_FragColor = vec4(color, alpha);
}
`

// Traveling starlight pulse packets moving along inter-galactic bridges.
export const bridgePulseVertex = /* glsl */ `
uniform float uPixelRatio;
uniform float uSize;
attribute float aScale;
attribute vec3 aColor;
varying vec3 vColor;
void main() {
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * mv;
  gl_PointSize = clamp(uSize * aScale * uPixelRatio / max(-mv.z, 1.0), 2.0, 42.0);
  vColor = aColor;
}
`

export const planetVertex = /* glsl */ `
varying vec3 vObjPos;
varying vec3 vWorldPos;
varying vec3 vWorldNormal;
varying vec3 vViewDir;
void main() {
  vObjPos = position;
  vec4 world = modelMatrix * vec4(position, 1.0);
  vWorldPos = world.xyz;
  vWorldNormal = normalize(mat3(modelMatrix) * normal);
  vViewDir = normalize(cameraPosition - world.xyz);
  gl_Position = projectionMatrix * viewMatrix * world;
}
`

// uKind: 0 = banded gas giant, 1 = oceanic/cloud world, 2 = ice world, 3 = volcanic ember world.
export const planetFragment = /* glsl */ `
uniform float uTime;
uniform float uKind;
uniform float uSeed;
uniform vec3 uColorA;
uniform vec3 uColorB;
uniform vec3 uColorC;
uniform vec3 uLightPos;
varying vec3 vObjPos;
varying vec3 vWorldPos;
varying vec3 vWorldNormal;
varying vec3 vViewDir;
${NOISE}
void main() {
  vec3 p = normalize(vObjPos);
  vec3 color;
  float emissiveBoost = 0.0;
  if (uKind < 0.5) {
    float warp = fbm(p * 3.0 + vec3(uSeed, uTime * 0.02, 0.0));
    float bands = sin(p.y * 18.0 + warp * 5.0 + uSeed);
    float storm = smoothstep(0.72, 0.78, fbm(p * 7.0 + uSeed));
    color = mix(uColorA, uColorB, bands * 0.5 + 0.5);
    color = mix(color, uColorC, storm * 0.6 + (1.0 - abs(p.y)) * 0.08);
  } else if (uKind < 1.5) {
    float land = fbm(p * 2.6 + uSeed);
    float clouds = fbm(p * 4.5 + vec3(uTime * 0.015, 0.0, uSeed));
    color = land > 0.52 ? mix(uColorB, uColorC, smoothstep(0.52, 0.75, land)) : uColorA * (0.65 + land);
    color = mix(color, vec3(1.0), smoothstep(0.55, 0.8, clouds) * 0.85);
  } else if (uKind < 2.5) {
    float cracks = abs(fbm(p * 6.0 + uSeed) - 0.5) * 2.0;
    color = mix(uColorA, uColorB, smoothstep(0.0, 0.35, cracks));
    color = mix(color, uColorC, fbm(p * 1.5 + uSeed) * 0.5);
  } else {
    float crust = fbm(p * 3.4 + uSeed);
    float magma = smoothstep(0.58, 0.72, fbm(p * 6.5 + vec3(0.0, uTime * 0.03, uSeed)));
    color = mix(uColorA, uColorB, crust);
    color = mix(color, uColorC, magma);
    emissiveBoost = magma * 0.55;
  }
  vec3 n = normalize(vWorldNormal);
  vec3 l = normalize(uLightPos - vWorldPos);
  float diffuse = max(dot(n, l), 0.0);
  float terminator = smoothstep(-0.18, 0.38, dot(n, l));
  float rim = pow(1.0 - max(dot(n, vViewDir), 0.0), 2.8);
  vec3 lit = color * (0.04 + diffuse * 1.05) * terminator;
  lit += color * emissiveBoost * (0.35 + 0.65 * (1.0 - terminator));
  lit += uColorC * rim * (0.12 + terminator * 0.25);
  gl_FragColor = vec4(lit, 1.0);
}
`

export const atmosphereFragment = /* glsl */ `
uniform vec3 uGlow;
uniform vec3 uLightPos;
varying vec3 vWorldPos;
varying vec3 vWorldNormal;
varying vec3 vViewDir;
void main() {
  vec3 n = normalize(vWorldNormal);
  float fresnel = pow(1.0 - max(dot(n, vViewDir), 0.0), 3.0);
  vec3 l = normalize(uLightPos - vWorldPos);
  float sunSide = smoothstep(-0.3, 0.6, dot(n, l));
  gl_FragColor = vec4(uGlow * fresnel * (0.06 + sunSide * 0.72), 1.0);
}
`

export const ringVertex = /* glsl */ `
varying float vRadius;
void main() {
  vRadius = length(position.xy);
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`

export const ringFragment = /* glsl */ `
uniform vec3 uColor;
uniform float uInner;
uniform float uOuter;
varying float vRadius;
${NOISE}
void main() {
  float r = (vRadius - uInner) / (uOuter - uInner);
  if (r < 0.0 || r > 1.0) discard;
  float broad = fbm(vec3(r * 7.0, 1.3, 0.0));
  float fine = noise(vec3(r * 140.0, 5.0, 0.0));
  float density = smoothstep(0.25, 0.75, broad) * (0.75 + fine * 0.25);
  float gap = smoothstep(0.58, 0.61, r) * (1.0 - smoothstep(0.64, 0.67, r));
  float edge = smoothstep(0.0, 0.12, r) * (1.0 - smoothstep(0.85, 1.0, r));
  float alpha = density * edge * (1.0 - gap * 0.95) * 0.58;
  gl_FragColor = vec4(uColor * (0.38 + density * 0.45), alpha);
}
`

export const nebulaVertex = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position.xy, 0.9999, 1.0);
}
`

export const nebulaFragment = /* glsl */ `
uniform float uTime;
uniform vec2 uResolution;
uniform vec2 uPointer;
uniform float uLightMode;
varying vec2 vUv;
${NOISE}
void main() {
  vec2 uv = vUv;
  uv.x *= uResolution.x / max(uResolution.y, 1.0);
  vec3 q = vec3(uv * 1.55 + uPointer * 0.045, uTime * 0.018);
  float a = fbm(q + fbm(q * 1.65));
  float b = fbm(q * 2.2 + vec3(4.0, 1.0, uTime * 0.025));

  vec3 darkCol = vec3(0.008, 0.012, 0.032);
  darkCol += vec3(0.32, 0.16, 0.62) * pow(a, 3.0) * 0.48;
  darkCol += vec3(0.08, 0.38, 0.72) * pow(b, 3.2) * 0.42;
  darkCol += vec3(0.68, 0.22, 0.56) * pow(a * b, 2.7) * 0.32;
  float dust = smoothstep(0.45, 0.76, fbm(q * 4.2 + 7.0));
  darkCol *= 1.0 - dust * 0.78;

  // Ethereal daylight nebula for light-mode Galaxy theme preset.
  vec3 lightCol = vec3(0.955, 0.965, 0.992);
  lightCol -= vec3(0.06, 0.04, 0.01) * pow(a, 2.2) * 0.55;
  lightCol -= vec3(0.07, 0.03, 0.0) * pow(b, 2.5) * 0.45;
  lightCol += vec3(0.02, 0.01, 0.03) * pow(a * b, 2.2) * 0.3;

  gl_FragColor = vec4(mix(darkCol, lightCol, uLightMode), 1.0);
}
`
