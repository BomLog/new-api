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
import * as THREE from 'three'
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js'
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js'
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js'
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js'

import {
  atmosphereFragment,
  bridgeLineFragment,
  bridgeLineVertex,
  bridgePulseVertex,
  galaxyVertex,
  nebulaFragment,
  nebulaVertex,
  planetFragment,
  planetVertex,
  ringFragment,
  ringVertex,
  softPointFragment,
  starFragment,
  starVertex,
} from './shaders'

export type CosmicSceneVariant = 'hero' | 'ambient'
export type CosmicColorMode = 'dark' | 'light'

export interface CosmicGalaxyController {
  setSize: (width: number, height: number) => void
  setPointer: (x: number, y: number) => void
  setColorMode: (mode: CosmicColorMode) => void
  start: () => void
  stop: () => void
  dispose: () => void
}

type GalaxyClusterSpec = {
  id: string
  position: [number, number, number]
  rotation: [number, number, number]
  radius: number
  arms: number
  spinDir: number
  particleShare: number
  coreColor: string
  armColor: string
  rimColor: string
  knotColor: string
  glowStops: [string, string, string]
  glowScale: number
}

type PlanetSpec = {
  kind: number
  radius: number
  hubIndex: number
  orbitRadius: number
  orbitInclination: number
  orbitSpeed: number
  orbitOffset: number
  verticalAmp: number
  colors: [
    THREE.ColorRepresentation,
    THREE.ColorRepresentation,
    THREE.ColorRepresentation,
  ]
  glow: THREE.ColorRepresentation
  tilt: number
  spin: number
  seed: number
  ring?: { inner: number; outer: number; color: THREE.ColorRepresentation }
  moon?: {
    radius: number
    distance: number
    speed: number
    color: THREE.ColorRepresentation
  }
}

type BridgeSpec = {
  fromHub: number
  toHub: number
  arcLift: [number, number, number]
  colorA: string
  colorB: string
  speed: number
  pulseCount: number
}

const INTRO_SECONDS = 4.2
const LIGHT_POSITION = new THREE.Vector3(-42, 22, 28)

// Three interconnected spiral galaxies forming a cosmic routing constellation.
const GALAXY_CLUSTERS: GalaxyClusterSpec[] = [
  {
    id: 'core',
    position: [1.5, -0.5, 0],
    rotation: [0.56, 0.12, -0.18],
    radius: 13.5,
    arms: 4,
    spinDir: 1,
    particleShare: 0.5,
    coreColor: '#ffe8be',
    armColor: '#6bb8ff',
    rimColor: '#5c52ff',
    knotColor: '#ff78c4',
    glowStops: [
      'rgba(255,246,225,0.95)',
      'rgba(125,205,255,0.45)',
      'rgba(110,90,255,0.1)',
    ],
    glowScale: 5.6,
  },
  {
    id: 'azure',
    position: [-15.5, 8.2, -13.5],
    rotation: [0.82, -0.35, 0.42],
    radius: 8.6,
    arms: 3,
    spinDir: -1.15,
    particleShare: 0.27,
    coreColor: '#d9fbff',
    armColor: '#38bdf8',
    rimColor: '#14b8a6',
    knotColor: '#93c5fd',
    glowStops: [
      'rgba(220,252,255,0.92)',
      'rgba(56,189,248,0.42)',
      'rgba(20,184,166,0.08)',
    ],
    glowScale: 4.1,
  },
  {
    id: 'violet',
    position: [14.8, 7.6, -15.0],
    rotation: [0.7, 0.4, -0.45],
    radius: 7.8,
    arms: 3,
    spinDir: 1.25,
    particleShare: 0.23,
    coreColor: '#ffe0f2',
    armColor: '#c084fc',
    rimColor: '#7c3aed',
    knotColor: '#f472b6',
    glowStops: [
      'rgba(255,228,246,0.92)',
      'rgba(192,132,252,0.44)',
      'rgba(124,58,237,0.08)',
    ],
    glowScale: 3.8,
  },
]

const BRIDGES: BridgeSpec[] = [
  {
    fromHub: 0,
    toHub: 1,
    arcLift: [-2.5, 6.2, 4.5],
    colorA: '#7dd3fc',
    colorB: '#2dd4bf',
    speed: 0.55,
    pulseCount: 16,
  },
  {
    fromHub: 0,
    toHub: 2,
    arcLift: [3.2, 6.4, 3.8],
    colorA: '#93c5fd',
    colorB: '#e879f9',
    speed: 0.62,
    pulseCount: 16,
  },
  {
    fromHub: 1,
    toHub: 2,
    arcLift: [0, 8.8, -5.0],
    colorA: '#38bdf8',
    colorB: '#c084fc',
    speed: 0.44,
    pulseCount: 18,
  },
]

const PLANETS: PlanetSpec[] = [
  {
    // Ringed gas giant orbiting the primary galaxy
    kind: 0,
    radius: 2.05,
    hubIndex: 0,
    orbitRadius: 9.2,
    orbitInclination: 0.22,
    orbitSpeed: 0.085,
    orbitOffset: 0.6,
    verticalAmp: 0.7,
    colors: ['#c68a58', '#f2d9b0', '#8d4d30'],
    glow: '#ffb780',
    tilt: 0.38,
    spin: 0.055,
    seed: 3.1,
    ring: { inner: 2.65, outer: 4.55, color: '#dfc9a4' },
  },
  {
    // Oceanic world with cloud layer + orbiting moon
    kind: 1,
    radius: 1.25,
    hubIndex: 0,
    orbitRadius: 6.4,
    orbitInclination: -0.28,
    orbitSpeed: 0.13,
    orbitOffset: 3.3,
    verticalAmp: 0.55,
    colors: ['#0c3478', '#2d7a4f', '#a89268'],
    glow: '#60b2ff',
    tilt: 0.41,
    spin: 0.09,
    seed: 7.7,
    moon: { radius: 0.24, distance: 2.15, speed: 0.65, color: '#dbeafe' },
  },
  {
    // Crystalline ice planet around the Azure galaxy
    kind: 2,
    radius: 0.92,
    hubIndex: 1,
    orbitRadius: 6.2,
    orbitInclination: 0.34,
    orbitSpeed: -0.11,
    orbitOffset: 1.1,
    verticalAmp: 0.5,
    colors: ['#7db3e8', '#eff8ff', '#5373c4'],
    glow: '#7dd3fc',
    tilt: 0.18,
    spin: 0.12,
    seed: 12.4,
  },
  {
    // Volcanic amber exoplanet around the Violet galaxy
    kind: 3,
    radius: 0.86,
    hubIndex: 2,
    orbitRadius: 5.8,
    orbitInclination: -0.32,
    orbitSpeed: 0.14,
    orbitOffset: 4.6,
    verticalAmp: 0.48,
    colors: ['#35192a', '#7c2d45', '#fb923c'],
    glow: '#f472b6',
    tilt: 0.27,
    spin: 0.1,
    seed: 19.2,
  },
  {
    // Distant luminous sapphire moon above the core
    kind: 2,
    radius: 0.55,
    hubIndex: 0,
    orbitRadius: 12.6,
    orbitInclination: 0.42,
    orbitSpeed: 0.065,
    orbitOffset: 5.1,
    verticalAmp: 0.9,
    colors: ['#8b5cf6', '#e9d5ff', '#38bdf8'],
    glow: '#c4b5fd',
    tilt: 0.12,
    spin: 0.14,
    seed: 25.8,
  },
]

function gaussian(): number {
  const u = 1 - Math.random()
  const v = Math.random()
  const g = Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v)
  return Math.max(-3, Math.min(3, g))
}

function createCoreGlow(
  stops: [string, string, string],
  scale: number
): THREE.Sprite {
  const size = 256
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const ctx = canvas.getContext('2d')
  if (ctx) {
    const half = size / 2
    const g = ctx.createRadialGradient(half, half, 0, half, half, half)
    g.addColorStop(0, stops[0])
    g.addColorStop(0.24, stops[1])
    g.addColorStop(0.58, stops[2])
    g.addColorStop(1, 'rgba(0,0,0,0)')
    ctx.fillStyle = g
    ctx.fillRect(0, 0, size, size)
  }
  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  const sprite = new THREE.Sprite(
    new THREE.SpriteMaterial({
      map: texture,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    })
  )
  sprite.scale.set(scale, scale, 1)
  return sprite
}

function createSpiralGalaxy(
  spec: GalaxyClusterSpec,
  count: number,
  pixelRatio: number,
  ambient: boolean
) {
  const radii = new Float32Array(count)
  const angles = new Float32Array(count)
  const heights = new Float32Array(count)
  const scales = new Float32Array(count)
  const colors = new Float32Array(count * 3)
  const core = new THREE.Color(spec.coreColor)
  const arm = new THREE.Color(spec.armColor)
  const rim = new THREE.Color(spec.rimColor)
  const knot = new THREE.Color(spec.knotColor)
  const color = new THREE.Color()

  for (let i = 0; i < count; i++) {
    const inBulge = Math.random() < 0.2
    const t = inBulge
      ? Math.abs(gaussian()) * 0.09
      : Math.pow(Math.random(), 0.82)
    const radius = t * spec.radius
    const branch = ((i % spec.arms) / spec.arms) * Math.PI * 2
    const spread = gaussian() * (0.18 + t * 0.36)
    radii[i] = Math.max(0.05, radius + gaussian() * 0.32)
    angles[i] = inBulge
      ? Math.random() * Math.PI * 2
      : branch + t * 5.0 * Math.sign(spec.spinDir) + spread
    heights[i] = gaussian() * (inBulge ? 0.48 : 0.14 * (1 - t) + 0.04)
    scales[i] = Math.random() * 1.55 + 0.45

    if (inBulge || t < 0.13) {
      color.copy(core)
    } else if (Math.random() < 0.045) {
      color.copy(knot)
      scales[i] *= 2.1
    } else {
      color.copy(arm).lerp(rim, t)
    }
    color.multiplyScalar((ambient ? 0.28 : 0.35) + Math.random() * 0.45)
    color.toArray(colors, i * 3)
  }

  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute(
    'position',
    new THREE.BufferAttribute(new Float32Array(count * 3), 3)
  )
  geometry.setAttribute('aRadius', new THREE.BufferAttribute(radii, 1))
  geometry.setAttribute('aAngle', new THREE.BufferAttribute(angles, 1))
  geometry.setAttribute('aHeight', new THREE.BufferAttribute(heights, 1))
  geometry.setAttribute('aScale', new THREE.BufferAttribute(scales, 1))
  geometry.setAttribute('aColor', new THREE.BufferAttribute(colors, 3))
  geometry.boundingSphere = new THREE.Sphere(
    new THREE.Vector3(),
    spec.radius * 1.5
  )

  const material = new THREE.ShaderMaterial({
    vertexShader: galaxyVertex,
    fragmentShader: softPointFragment,
    uniforms: {
      uTime: { value: 0 },
      uSize: { value: ambient ? 14 : 17 },
      uPixelRatio: { value: pixelRatio },
      uReveal: { value: 0 },
      uOpacity: { value: ambient ? 0.48 : 0.62 },
      uSpinDir: { value: spec.spinDir },
    },
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  })

  const group = new THREE.Group()
  group.position.set(...spec.position)
  group.rotation.set(...spec.rotation)

  const points = new THREE.Points(geometry, material)
  group.add(points)

  const coreSprite = createCoreGlow(spec.glowStops, spec.glowScale)
  group.add(coreSprite)

  return { group, points, material, coreSprite, spec }
}

function createStarfield(count: number, pixelRatio: number, ambient: boolean) {
  const positions = new Float32Array(count * 3)
  const scales = new Float32Array(count)
  const phases = new Float32Array(count)
  const colors = new Float32Array(count * 3)
  const palette = [
    '#9bb7ff',
    '#ffffff',
    '#fff1d6',
    '#ffd2a1',
    '#cfe0ff',
    '#d8b4fe',
  ]
  const color = new THREE.Color()
  for (let i = 0; i < count; i++) {
    const u = Math.random() * 2 - 1
    const theta = Math.random() * Math.PI * 2
    const r = 95 + Math.random() * 175
    const s = Math.sqrt(1 - u * u)
    positions[i * 3] = r * s * Math.cos(theta)
    positions[i * 3 + 1] = r * u
    positions[i * 3 + 2] = r * s * Math.sin(theta)
    scales[i] = Math.pow(Math.random(), 5.2) * 5.6 + 0.9
    phases[i] = Math.random()
    color.set(palette[i % palette.length])
    color.toArray(colors, i * 3)
  }
  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3))
  geometry.setAttribute('aScale', new THREE.BufferAttribute(scales, 1))
  geometry.setAttribute('aPhase', new THREE.BufferAttribute(phases, 1))
  geometry.setAttribute('aColor', new THREE.BufferAttribute(colors, 3))

  const material = new THREE.ShaderMaterial({
    vertexShader: starVertex,
    fragmentShader: starFragment,
    uniforms: {
      uTime: { value: 0 },
      uPixelRatio: { value: pixelRatio },
      uOpacity: { value: ambient ? 0.78 : 1.0 },
    },
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  })
  return new THREE.Points(geometry, material)
}

function createGalaxyBridge(
  spec: BridgeSpec,
  start: THREE.Vector3,
  end: THREE.Vector3,
  pixelRatio: number,
  ambient: boolean
) {
  const mid1 = start
    .clone()
    .lerp(end, 0.33)
    .add(
      new THREE.Vector3(
        spec.arcLift[0],
        spec.arcLift[1],
        spec.arcLift[2]
      ).multiplyScalar(0.85)
    )
  const mid2 = start
    .clone()
    .lerp(end, 0.67)
    .add(
      new THREE.Vector3(
        spec.arcLift[0] * 0.4,
        spec.arcLift[1] * 0.95,
        spec.arcLift[2] * 0.7
      )
    )

  const curve = new THREE.CubicBezierCurve3(start, mid1, mid2, end)
  const segments = 96
  const samplePoints = curve.getPoints(segments)
  const linePositions = new Float32Array((segments + 1) * 3)
  const progress = new Float32Array(segments + 1)

  for (let i = 0; i <= segments; i++) {
    const pt = samplePoints[i]
    linePositions[i * 3] = pt.x
    linePositions[i * 3 + 1] = pt.y
    linePositions[i * 3 + 2] = pt.z
    progress[i] = i / segments
  }

  const lineGeometry = new THREE.BufferGeometry()
  lineGeometry.setAttribute(
    'position',
    new THREE.BufferAttribute(linePositions, 3)
  )
  lineGeometry.setAttribute('aProgress', new THREE.BufferAttribute(progress, 1))

  const lineMaterial = new THREE.ShaderMaterial({
    vertexShader: bridgeLineVertex,
    fragmentShader: bridgeLineFragment,
    uniforms: {
      uTime: { value: 0 },
      uOpacity: { value: ambient ? 0.38 : 0.58 },
      uColorA: { value: new THREE.Color(spec.colorA) },
      uColorB: { value: new THREE.Color(spec.colorB) },
      uSpeed: { value: spec.speed },
    },
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  })
  const line = new THREE.Line(lineGeometry, lineMaterial)

  // Traveling starlight pulse packets moving bidirectionally along the curve.
  const pulseCount = ambient
    ? Math.max(8, Math.floor(spec.pulseCount * 0.6))
    : spec.pulseCount
  const pulsePositions = new Float32Array(pulseCount * 3)
  const pulseScales = new Float32Array(pulseCount)
  const pulseColors = new Float32Array(pulseCount * 3)
  const pulseOffsets = new Float32Array(pulseCount)
  const pulseDirs = new Float32Array(pulseCount)
  const cA = new THREE.Color(spec.colorA)
  const cB = new THREE.Color(spec.colorB)
  const tmpColor = new THREE.Color()

  for (let i = 0; i < pulseCount; i++) {
    pulseOffsets[i] = i / pulseCount
    pulseDirs[i] = i % 2 === 0 ? 1 : -1
    pulseScales[i] = 1.2 + (i % 3) * 0.55
    tmpColor.copy(cA).lerp(cB, (i % 5) / 4)
    tmpColor.toArray(pulseColors, i * 3)
  }

  const pulseGeometry = new THREE.BufferGeometry()
  const pulsePosAttr = new THREE.BufferAttribute(pulsePositions, 3)
  pulseGeometry.setAttribute('position', pulsePosAttr)
  pulseGeometry.setAttribute('aScale', new THREE.BufferAttribute(pulseScales, 1))
  pulseGeometry.setAttribute('aColor', new THREE.BufferAttribute(pulseColors, 3))

  const pulseMaterial = new THREE.ShaderMaterial({
    vertexShader: bridgePulseVertex,
    fragmentShader: softPointFragment,
    uniforms: {
      uPixelRatio: { value: pixelRatio },
      uSize: { value: ambient ? 34 : 44 },
      uOpacity: { value: ambient ? 0.72 : 0.95 },
    },
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  })
  const pulses = new THREE.Points(pulseGeometry, pulseMaterial)

  const group = new THREE.Group()
  group.add(line)
  group.add(pulses)

  const sampleVec = new THREE.Vector3()
  const update = (elapsed: number) => {
    lineMaterial.uniforms.uTime.value = elapsed
    for (let i = 0; i < pulseCount; i++) {
      const raw =
        (pulseOffsets[i] + elapsed * spec.speed * 0.14 * pulseDirs[i]) % 1
      const t = raw < 0 ? raw + 1 : raw
      curve.getPoint(t, sampleVec)
      pulsePositions[i * 3] = sampleVec.x
      pulsePositions[i * 3 + 1] = sampleVec.y
      pulsePositions[i * 3 + 2] = sampleVec.z
    }
    pulsePosAttr.needsUpdate = true
  }

  return { group, lineMaterial, pulseMaterial, update }
}

function createPlanet(spec: PlanetSpec) {
  const group = new THREE.Group()
  group.rotation.z = spec.tilt

  const bodyMaterial = new THREE.ShaderMaterial({
    vertexShader: planetVertex,
    fragmentShader: planetFragment,
    uniforms: {
      uTime: { value: 0 },
      uKind: { value: spec.kind },
      uSeed: { value: spec.seed },
      uColorA: { value: new THREE.Color(spec.colors[0]) },
      uColorB: { value: new THREE.Color(spec.colors[1]) },
      uColorC: { value: new THREE.Color(spec.colors[2]) },
      uLightPos: { value: LIGHT_POSITION },
    },
  })
  const body = new THREE.Mesh(
    new THREE.SphereGeometry(spec.radius, 40, 40),
    bodyMaterial
  )
  group.add(body)

  const atmosphere = new THREE.Mesh(
    new THREE.SphereGeometry(spec.radius * 1.07, 28, 28),
    new THREE.ShaderMaterial({
      vertexShader: planetVertex,
      fragmentShader: atmosphereFragment,
      uniforms: {
        uGlow: { value: new THREE.Color(spec.glow) },
        uLightPos: { value: LIGHT_POSITION },
      },
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    })
  )
  group.add(atmosphere)

  if (spec.ring) {
    const ringMaterial = new THREE.ShaderMaterial({
      vertexShader: ringVertex,
      fragmentShader: ringFragment,
      uniforms: {
        uColor: { value: new THREE.Color(spec.ring.color) },
        uInner: { value: spec.ring.inner },
        uOuter: { value: spec.ring.outer },
      },
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
    })
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(spec.ring.inner, spec.ring.outer, 96, 1),
      ringMaterial
    )
    ring.rotation.x = -Math.PI / 2 + 0.14
    group.add(ring)
  }

  let moonMesh: THREE.Mesh | null = null
  if (spec.moon) {
    moonMesh = new THREE.Mesh(
      new THREE.SphereGeometry(spec.moon.radius, 18, 18),
      new THREE.MeshBasicMaterial({ color: spec.moon.color })
    )
    group.add(moonMesh)
  }

  return { group, body, bodyMaterial, moonMesh, spec }
}

/**
 * Multi-galaxy interconnected WebGL cosmic scene: three distinct spiral
 * galaxies linked by luminous energy bridges with bidirectional traveling
 * starlight pulses, twinkling multi-color stars, and shader-lit orbiting
 * planets with rings and moons.
 */
export function createCosmicGalaxyScene(
  canvas: HTMLCanvasElement,
  options: {
    lowPower: boolean
    reducedMotion: boolean
    variant: CosmicSceneVariant
    colorMode: CosmicColorMode
  }
): CosmicGalaxyController | null {
  let renderer: THREE.WebGLRenderer
  try {
    renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: false,
      alpha: false,
      powerPreference: options.variant === 'ambient' ? 'low-power' : 'high-performance',
    })
  } catch {
    return null
  }

  const ambient = options.variant === 'ambient'
  let maxPixelRatio = 1.3
  if (ambient || options.lowPower) {
    maxPixelRatio = 1.0
  }
  const pixelRatio = Math.min(window.devicePixelRatio || 1, maxPixelRatio)
  renderer.setPixelRatio(pixelRatio)
  renderer.toneMapping = THREE.ACESFilmicToneMapping
  renderer.toneMappingExposure = ambient ? 0.78 : 0.92

  const scene = new THREE.Scene()
  const camera = new THREE.PerspectiveCamera(44, 1, 0.1, 1000)

  const nebulaMaterial = new THREE.ShaderMaterial({
    vertexShader: nebulaVertex,
    fragmentShader: nebulaFragment,
    uniforms: {
      uTime: { value: 0 },
      uResolution: { value: new THREE.Vector2(1, 1) },
      uPointer: { value: new THREE.Vector2() },
      uLightMode: { value: options.colorMode === 'light' && ambient ? 1 : 0 },
    },
    depthWrite: false,
    depthTest: false,
  })
  const nebula = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), nebulaMaterial)
  nebula.frustumCulled = false
  nebula.renderOrder = -1
  scene.add(nebula)

  let starCount = 2200
  if (ambient) {
    starCount = 900
  } else if (options.lowPower) {
    starCount = 1100
  }
  const stars = createStarfield(starCount, pixelRatio, ambient)
  scene.add(stars)

  const system = new THREE.Group()
  scene.add(system)

  let totalGalaxyParticles = 50000
  if (ambient) {
    totalGalaxyParticles = 14000
  } else if (options.lowPower) {
    totalGalaxyParticles = 22000
  }
  const galaxies = GALAXY_CLUSTERS.map((spec) => {
    const cluster = createSpiralGalaxy(
      spec,
      Math.max(2500, Math.round(totalGalaxyParticles * spec.particleShare)),
      pixelRatio,
      ambient
    )
    system.add(cluster.group)
    return cluster
  })

  const hubPositions = GALAXY_CLUSTERS.map(
    (g) => new THREE.Vector3(...g.position)
  )
  const bridges = BRIDGES.map((spec) => {
    const bridge = createGalaxyBridge(
      spec,
      hubPositions[spec.fromHub],
      hubPositions[spec.toHub],
      pixelRatio,
      ambient
    )
    system.add(bridge.group)
    return bridge
  })

  const planets = (ambient ? PLANETS.slice(0, 3) : PLANETS).map(createPlanet)
  for (const planet of planets) {
    system.add(planet.group)
  }

  let composer: EffectComposer | null = null
  let bloom: UnrealBloomPass | null = null
  if (!ambient) {
    composer = new EffectComposer(renderer)
    composer.addPass(new RenderPass(scene, camera))
    bloom = new UnrealBloomPass(new THREE.Vector2(512, 512), 0.72, 0.48, 0.52)
    composer.addPass(bloom)
    composer.addPass(new OutputPass())
  }

  const pointer = new THREE.Vector2()
  const pointerTarget = new THREE.Vector2()
  const cameraBase = new THREE.Vector3(0, 8, 46)
  const lookTarget = new THREE.Vector3(0, 1.5, -2)
  let lastTime = 0
  let elapsed = options.reducedMotion || ambient ? INTRO_SECONDS : 0
  let frame = 0
  const starUniforms = (stars.material as THREE.ShaderMaterial).uniforms

  const applyColorMode = (mode: CosmicColorMode) => {
    const isLightAmbient = ambient && mode === 'light'
    let galaxyOpacity = 0.62
    let bridgeOpacity = 0.58
    let pulseOpacity = 0.95
    let starOpacity = 1.0
    if (isLightAmbient) {
      galaxyOpacity = 0.28
      bridgeOpacity = 0.26
      pulseOpacity = 0.45
      starOpacity = 0.35
    } else if (ambient) {
      galaxyOpacity = 0.48
      bridgeOpacity = 0.38
      pulseOpacity = 0.72
      starOpacity = 0.78
    }

    nebulaMaterial.uniforms.uLightMode.value = isLightAmbient ? 1 : 0
    for (const cluster of galaxies) {
      cluster.material.blending = isLightAmbient
        ? THREE.NormalBlending
        : THREE.AdditiveBlending
      cluster.material.uniforms.uOpacity.value = galaxyOpacity
      cluster.coreSprite.material.opacity = isLightAmbient ? 0.24 : 0.65
    }
    for (const bridge of bridges) {
      bridge.lineMaterial.blending = isLightAmbient
        ? THREE.NormalBlending
        : THREE.AdditiveBlending
      bridge.lineMaterial.uniforms.uOpacity.value = bridgeOpacity
      bridge.pulseMaterial.uniforms.uOpacity.value = pulseOpacity
    }
    starUniforms.uOpacity.value = starOpacity
  }
  applyColorMode(options.colorMode)

  const render = () => {
    const now = performance.now()
    const delta = lastTime ? Math.min((now - lastTime) / 1000, 0.05) : 0
    lastTime = now
    elapsed += delta

    const intro = Math.min(elapsed / INTRO_SECONDS, 1)
    const ease = 1 - Math.pow(1 - intro, 4)

    pointer.lerp(pointerTarget, Math.min(1, delta * 2.4))

    for (let i = 0; i < galaxies.length; i++) {
      const cluster = galaxies[i]
      cluster.material.uniforms.uTime.value = elapsed
      cluster.material.uniforms.uReveal.value = ambient
        ? 1.0
        : 0.18 + ease * 0.82
      cluster.coreSprite.material.opacity =
        (ambient ? 0.42 : 0.64) + Math.sin(elapsed * 1.15 + i * 1.7) * 0.08
    }

    for (const bridge of bridges) {
      bridge.update(elapsed)
    }

    for (const planet of planets) {
      const hub = hubPositions[planet.spec.hubIndex]
      const angle = elapsed * planet.spec.orbitSpeed + planet.spec.orbitOffset
      const rx = planet.spec.orbitRadius
      const rz = planet.spec.orbitRadius * 0.78
      planet.group.position.set(
        hub.x + Math.cos(angle) * rx,
        hub.y +
          Math.sin(angle) * rx * Math.sin(planet.spec.orbitInclination) +
          Math.sin(elapsed * 0.32 + planet.spec.seed) * planet.spec.verticalAmp,
        hub.z + Math.sin(angle) * rz
      )
      planet.body.rotation.y += planet.spec.spin * delta
      planet.bodyMaterial.uniforms.uTime.value = elapsed

      if (planet.moonMesh && planet.spec.moon) {
        const moonAngle = elapsed * planet.spec.moon.speed + planet.spec.seed
        planet.moonMesh.position.set(
          Math.cos(moonAngle) * planet.spec.moon.distance,
          Math.sin(moonAngle * 1.3) * 0.35,
          Math.sin(moonAngle) * planet.spec.moon.distance
        )
      }
    }

    starUniforms.uTime.value = elapsed
    nebulaMaterial.uniforms.uTime.value = elapsed
    nebulaMaterial.uniforms.uPointer.value.copy(pointer)
    stars.rotation.y += (ambient ? 0.0022 : 0.0042) * delta

    const breathe = ambient
      ? Math.sin(elapsed * 0.05) * 1.6
      : Math.sin(elapsed * 0.045) * 2.8 + Math.cos(elapsed * 0.075) * 1.6
    const driftX =
      Math.sin(elapsed * 0.04) * (ambient ? 1.2 : 2.4) +
      Math.cos(elapsed * 0.09) * 0.9
    const driftY = Math.sin(elapsed * 0.065) * (ambient ? 0.8 : 1.5)
    const introOffset = ambient ? 0 : THREE.MathUtils.lerp(85, 0, ease)

    camera.position.set(
      cameraBase.x + pointer.x * (ambient ? 1.1 : 2.6) + driftX,
      cameraBase.y +
        pointer.y * (ambient ? 0.8 : 1.7) +
        introOffset * 0.22 +
        driftY,
      cameraBase.z + introOffset + (intro >= 1 ? breathe : 0)
    )
    camera.lookAt(lookTarget)

    if (composer) {
      composer.render(delta)
    } else {
      renderer.render(scene, camera)
    }
  }

  const tick = () => {
    render()
    frame = requestAnimationFrame(tick)
  }

  return {
    setSize(width, height) {
      const safeW = Math.max(width, 1)
      const safeH = Math.max(height, 1)
      renderer.setSize(safeW, safeH, false)
      composer?.setSize(safeW, safeH)
      bloom?.resolution.set(safeW, safeH)
      camera.aspect = safeW / safeH
      const wide = camera.aspect > 1.2
      if (ambient) {
        cameraBase.set(0, 10, wide ? 54 : 74)
        system.position.set(0, 0, 0)
        lookTarget.set(0, 2, -4)
      } else {
        cameraBase.set(0, 8.5, wide ? 46 : 78)
        system.position.set(wide ? 7.5 : 1.5, wide ? 0.5 : 11, 0)
        lookTarget.set(wide ? 1.5 : 0, wide ? 1.5 : 3, -3)
      }
      camera.updateProjectionMatrix()
      nebulaMaterial.uniforms.uResolution.value.set(safeW, safeH)
      if (!frame) render()
    },
    setPointer(x, y) {
      pointerTarget.set(x, y)
    },
    setColorMode(mode) {
      applyColorMode(mode)
      if (!frame) render()
    },
    start() {
      if (frame) return
      lastTime = 0
      frame = requestAnimationFrame(tick)
    },
    stop() {
      cancelAnimationFrame(frame)
      frame = 0
    },
    dispose() {
      cancelAnimationFrame(frame)
      frame = 0
      scene.traverse((object) => {
        if (
          object instanceof THREE.Mesh ||
          object instanceof THREE.Points ||
          object instanceof THREE.Sprite ||
          object instanceof THREE.Line
        ) {
          object.geometry.dispose()
          const material = object.material as THREE.Material & {
            map?: THREE.Texture | null
          }
          material.map?.dispose()
          material.dispose()
        }
      })
      composer?.dispose()
      renderer.dispose()
    },
  }
}
