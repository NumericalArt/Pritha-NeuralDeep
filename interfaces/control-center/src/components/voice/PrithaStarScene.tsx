"use client";

import { useEffect, useRef } from "react";
import { useControlCenterTheme } from "@/components/shell/ThemeSync";
import type { ControlCenterTheme } from "@/lib/theme";
import * as THREE from "three";
import type { RealtimePhase } from "./usePrithaRealtime";

// Port of the no-spider Three.js web from pritha_spiderweb_three_v5_no_spider.html.
// Keep this component as the canonical UI implementation; do not replace it with
// CSS/SVG asterisk fallbacks.
const DARK_COLORS = {
  violet: new THREE.Color("#f15380"),
  purple: new THREE.Color("#eb94ac"),
  blue: new THREE.Color("#67a9ea"),
  cyan: new THREE.Color("#3fcbd7"),
  white: new THREE.Color("#e9ecf3"),
};

// Accepted light theme: luminous strands above the mineral-green panel.
const LIGHT_COLORS = {
  violet: new THREE.Color("#f7c0d6"),
  purple: new THREE.Color("#f8d9e9"),
  white: new THREE.Color("#fffafb"),
  blue: new THREE.Color("#d1e4ff"),
  cyan: new THREE.Color("#bcebf0"),
};

// Original canonical Pritha palette, including its two-stage gradient.
const CLASSIC_COLORS = {
  violet: new THREE.Color("#a45cff"),
  purple: new THREE.Color("#7048ff"),
  blue: new THREE.Color("#2f7dff"),
  cyan: new THREE.Color("#22d7ff"),
  white: new THREE.Color("#f7f8ff"),
};

const WEB_STRAND_WIDTH = 0.018;
const CALM_SWAY_MULTIPLIER = 4.0;
const IDLE_SWAY_RANGE_MULTIPLIER = 2.0;
const REALTIME_ROOT_PULSE_AMPLITUDE = 0.018 * 2.0;
const NODE_DIAMETER_MULTIPLIER = 4.0;
const DIRECTION_COUNT = 16;
const LONG_RADIUS = 3.68;
const SHORT_RADIUS = LONG_RADIUS * 0.58;
const RINGS = [0.27, 0.48, 0.7, 1.0] as const;
const START_ANGLE = Math.PI / 2;

type NodeMeta = {
  direction: number;
  ring: number;
  frac: number;
  isLong: boolean;
  isCenter: boolean;
  size: number;
};

function directionInfo(i: number) {
  const angle = START_ANGLE - i * ((Math.PI * 2) / DIRECTION_COUNT);
  const isLong = i % 2 === 0;
  const radius = isLong ? LONG_RADIUS : SHORT_RADIUS;
  return { angle, isLong, radius };
}

function nodeIndex(direction: number, ringIndex: number) {
  return 1 + direction * RINGS.length + ringIndex;
}

function makeWebTopology() {
  const baseNodes: THREE.Vector3[] = [];
  const dynamicNodes: THREE.Vector3[] = [];
  const nodeMeta: NodeMeta[] = [];
  const segments: Array<[number, number]> = [];

  baseNodes.push(new THREE.Vector3(0, 0, 0));
  dynamicNodes.push(new THREE.Vector3(0, 0, 0));
  nodeMeta.push({ direction: -1, ring: -1, frac: 0, isLong: true, isCenter: true, size: 0.15 });

  for (let i = 0; i < DIRECTION_COUNT; i += 1) {
    const { angle, isLong, radius } = directionInfo(i);
    const dir = new THREE.Vector3(Math.cos(angle), Math.sin(angle), 0);
    for (let r = 0; r < RINGS.length; r += 1) {
      const frac = RINGS[r];
      const pos = dir.clone().multiplyScalar(radius * frac);
      baseNodes.push(pos);
      dynamicNodes.push(pos.clone());
      nodeMeta.push({
        direction: i,
        ring: r,
        frac,
        isLong,
        isCenter: false,
        size: r === RINGS.length - 1 ? (isLong ? 0.18 : 0.12) : 0.075,
      });
    }
  }

  for (let i = 0; i < DIRECTION_COUNT; i += 1) {
    segments.push([0, nodeIndex(i, 0)]);
    for (let r = 0; r < RINGS.length - 1; r += 1) {
      segments.push([nodeIndex(i, r), nodeIndex(i, r + 1)]);
    }
  }

  for (let r = 0; r < RINGS.length; r += 1) {
    for (let i = 0; i < DIRECTION_COUNT; i += 1) {
      segments.push([nodeIndex(i, r), nodeIndex((i + 1) % DIRECTION_COUNT, r)]);
    }
  }

  for (let r = 0; r < RINGS.length - 1; r += 1) {
    for (let i = 0; i < DIRECTION_COUNT; i += 2) {
      segments.push([nodeIndex(i, r), nodeIndex((i + 1) % DIRECTION_COUNT, r + 1)]);
      segments.push([nodeIndex(i, r), nodeIndex((i + DIRECTION_COUNT - 1) % DIRECTION_COUNT, r + 1)]);
    }
  }

  return { baseNodes, dynamicNodes, nodeMeta, segments };
}

function phasePulseActive(state: RealtimePhase) {
  return state === "connecting" || state === "listening" || state === "speaking" || state === "working";
}

function updateDynamicNodes(
  baseNodes: THREE.Vector3[],
  dynamicNodes: THREE.Vector3[],
  nodeMeta: NodeMeta[],
  t: number,
  state: RealtimePhase,
) {
  const realtimePulse = phasePulseActive(state);
  const activeBoost = realtimePulse ? 1.18 : 1;
  const idleSwayBoost = realtimePulse ? 1 : IDLE_SWAY_RANGE_MULTIPLIER;
  const workBoost = state === "working" ? 1.16 : 1;

  for (let i = 0; i < baseNodes.length; i += 1) {
    const base = baseNodes[i];
    const meta = nodeMeta[i];
    const out = dynamicNodes[i];

    if (meta.isCenter) {
      out.set(0, 0, 0);
      continue;
    }

    const angle = directionInfo(meta.direction).angle;
    const radial = new THREE.Vector3(Math.cos(angle), Math.sin(angle), 0);
    const tangent = new THREE.Vector3(-Math.sin(angle), Math.cos(angle), 0);
    const waveA = Math.sin(t * 0.82 * workBoost + meta.direction * 0.67 + meta.ring * 1.8);
    const waveB = Math.cos(t * 0.56 * workBoost + meta.direction * 0.41 - meta.ring * 1.2);
    const mobility = (1.16 - meta.frac * 0.42) * (meta.isLong ? 1.0 : 0.92);
    const tangentSway = 0.03 * CALM_SWAY_MULTIPLIER * idleSwayBoost * mobility * waveA * activeBoost;
    const endpointBreath =
      meta.ring === RINGS.length - 1
        ? (meta.isLong ? 0.072 : 0.052) * idleSwayBoost * Math.sin(t * 0.72 * workBoost + meta.direction * 0.71) * activeBoost
        : 0;
    const radialSway = (0.014 * CALM_SWAY_MULTIPLIER * idleSwayBoost * mobility * waveB + endpointBreath) * activeBoost;

    out.copy(base).addScaledVector(tangent, tangentSway).addScaledVector(radial, radialSway);
  }
}

function makeRadialColor(x: number, COLORS = DARK_COLORS) {
  const t = THREE.MathUtils.clamp((x / LONG_RADIUS + 1) * 0.5, 0, 1);
  const c = new THREE.Color();
  if (COLORS === CLASSIC_COLORS) {
    return t < 0.5 ? c.lerpColors(COLORS.violet, COLORS.purple, t * 2) : c.lerpColors(COLORS.purple, COLORS.cyan, (t - 0.5) * 2);
  }
  if (t < 0.3) c.lerpColors(COLORS.violet, COLORS.purple, t / 0.3);
  else if (t < 0.5) c.lerpColors(COLORS.purple, COLORS.white, (t - 0.3) / 0.2);
  else if (t < 0.72) c.lerpColors(COLORS.white, COLORS.blue, (t - 0.5) / 0.22);
  else c.lerpColors(COLORS.blue, COLORS.cyan, (t - 0.72) / 0.28);
  return c;
}

function makeNodeTexture(theme: ControlCenterTheme) {
  const lightTheme = theme === "light";
  const size = 128;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;

  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  g.addColorStop(0.0, "rgba(255,255,255,1)");
  g.addColorStop(0.18, "rgba(255,255,255,0.94)");
  g.addColorStop(0.42, lightTheme ? "rgba(255,255,255,0.48)" : theme === "classic" ? "rgba(130,100,255,0.48)" : "rgba(233,236,243,0.48)");
  g.addColorStop(0.7, lightTheme ? "rgba(255,255,255,0.20)" : theme === "classic" ? "rgba(70,70,255,0.20)" : "rgba(233,236,243,0.20)");
  g.addColorStop(1.0, lightTheme ? "rgba(255,255,255,0)" : "rgba(0,0,0,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function markGeometryDirty(geometry: THREE.BufferGeometry) {
  (geometry.getAttribute("position") as THREE.BufferAttribute).needsUpdate = true;
  (geometry.getAttribute("color") as THREE.BufferAttribute).needsUpdate = true;
}

function colorCss(color: THREE.Color, alpha = 1, classic = false) {
  // Preserve the original Canvas renderer appearance for Classic as well.
  if (classic) return `rgba(${Math.round(color.r * 255)}, ${Math.round(color.g * 255)}, ${Math.round(color.b * 255)}, ${alpha})`;
  // Match WebGL's sRGB output without altering material opacity or line geometry.
  return color.getStyle(THREE.SRGBColorSpace).replace("rgb(", "rgba(").replace(")", `, ${alpha})`);
}

function startCanvasFallback(hostEl: HTMLDivElement, phaseRef: { current: RealtimePhase }, mobile: boolean, COLORS = DARK_COLORS) {
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    hostEl.dataset.rendered = "false";
    return () => {
      delete hostEl.dataset.rendered;
      delete hostEl.dataset.renderer;
    };
  }
  const context = ctx;

  hostEl.dataset.rendered = "fallback";
  hostEl.dataset.renderer = "canvas2d";
  canvas.setAttribute("aria-hidden", "true");
  canvas.className = "pritha-star-canvas-fallback";
  canvas.style.display = "block";
  canvas.style.position = "absolute";
  canvas.style.inset = "0";
  canvas.style.width = "100%";
  canvas.style.height = "100%";
  canvas.style.pointerEvents = "none";
  hostEl.appendChild(canvas);

  const { baseNodes, dynamicNodes, nodeMeta, segments } = makeWebTopology();
  let width = 1;
  let height = 1;
  let dpr = 1;

  function resize() {
    const rect = hostEl.getBoundingClientRect();
    const fallbackSize = mobile ? 208 : 278;
    width = Math.max(1, Math.round(hostEl.clientWidth || rect.width || fallbackSize));
    height = Math.max(1, Math.round(hostEl.clientHeight || rect.height || fallbackSize));
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.max(1, Math.round(width * dpr));
    canvas.height = Math.max(1, Math.round(height * dpr));
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    context.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  function project(point: THREE.Vector3, rootScale: number) {
    const viewHeight = mobile ? 8.7 : 8.25;
    const scale = height / viewHeight;
    return {
      x: width / 2 + point.x * rootScale * scale,
      y: height / 2 - point.y * rootScale * scale,
      scale,
    };
  }

  function strokeSegments(rootScale: number, lineWidth: number, alpha: number) {
    context.lineCap = "round";
    context.lineJoin = "round";
    context.lineWidth = lineWidth;
    for (const [a, b] of segments) {
      const pa = dynamicNodes[a];
      const pb = dynamicNodes[b];
      const ca = makeRadialColor(pa.x, COLORS);
      const cb = makeRadialColor(pb.x, COLORS);
      const sa = project(pa, rootScale);
      const sb = project(pb, rootScale);
      const gradient = context.createLinearGradient(sa.x, sa.y, sb.x, sb.y);
      gradient.addColorStop(0, colorCss(ca, alpha, COLORS === CLASSIC_COLORS));
      gradient.addColorStop(1, colorCss(cb, alpha, COLORS === CLASSIC_COLORS));
      context.strokeStyle = gradient;
      context.beginPath();
      context.moveTo(sa.x, sa.y);
      context.lineTo(sb.x, sb.y);
      context.stroke();
    }
  }

  function drawNodes(t: number, rootScale: number) {
    for (let i = 0; i < dynamicNodes.length; i += 1) {
      const point = dynamicNodes[i];
      const meta = nodeMeta[i];
      const p = project(point, rootScale);
      const baseSize = meta.size * (meta.isCenter ? 1.55 : 1.0) * NODE_DIAMETER_MULTIPLIER;
      const pulse = meta.ring === RINGS.length - 1 ? 1 + 0.035 * Math.sin(t * 1.9 + i) : 1;
      const centerPulse = meta.isCenter ? 1 + 0.06 * Math.sin(t * 1.4) : 1;
      const radius = Math.max(1.3, baseSize * pulse * centerPulse * p.scale * 0.5);
      const color = meta.isCenter ? COLORS.white : makeRadialColor(point.x, COLORS);
      const gradient = context.createRadialGradient(p.x, p.y, 0, p.x, p.y, radius);
      gradient.addColorStop(0, colorCss(COLORS.white, meta.isCenter ? 1 : 0.92, COLORS === CLASSIC_COLORS));
      gradient.addColorStop(0.22, colorCss(color, 0.72, COLORS === CLASSIC_COLORS));
      gradient.addColorStop(0.62, colorCss(color, 0.22, COLORS === CLASSIC_COLORS));
      gradient.addColorStop(1, colorCss(color, 0, COLORS === CLASSIC_COLORS));
      context.fillStyle = gradient;
      context.beginPath();
      context.arc(p.x, p.y, radius, 0, Math.PI * 2);
      context.fill();
    }
  }

  resize();
  const resizeObserver = typeof ResizeObserver !== "undefined" ? new ResizeObserver(resize) : null;
  resizeObserver?.observe(hostEl);
  window.addEventListener("resize", resize);
  const resizeFrame = requestAnimationFrame(resize);

  const startTime = performance.now();
  let frame = 0;
  function animate() {
    frame = requestAnimationFrame(animate);
    const t = (performance.now() - startTime) / 1000;
    const state = phaseRef.current;
    const rootScale = phasePulseActive(state) ? 1 + REALTIME_ROOT_PULSE_AMPLITUDE * Math.sin(t * 2.1) : 1;
    updateDynamicNodes(baseNodes, dynamicNodes, nodeMeta, t, state);
    context.clearRect(0, 0, width, height);
    context.save();
    context.globalCompositeOperation = COLORS === LIGHT_COLORS ? "source-over" : "lighter";
    strokeSegments(rootScale * 1.003, 4.4, 0.12);
    strokeSegments(rootScale, 2.0, 0.42);
    strokeSegments(rootScale, 1.0, 0.92);
    drawNodes(t, rootScale);
    context.restore();
  }
  animate();

  return () => {
    cancelAnimationFrame(frame);
    cancelAnimationFrame(resizeFrame);
    resizeObserver?.disconnect();
    window.removeEventListener("resize", resize);
    delete hostEl.dataset.rendered;
    delete hostEl.dataset.renderer;
    if (canvas.parentNode === hostEl) hostEl.removeChild(canvas);
  };
}

export function PrithaStarScene({ phase, mobile = false }: { phase: RealtimePhase; mobile?: boolean }) {
  const hostRef = useRef<HTMLDivElement>(null);
  const phaseRef = useRef(phase);
  const theme = useControlCenterTheme();

  useEffect(() => {
    phaseRef.current = phase;
  }, [phase]);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const hostEl = host;
    const lightTheme = theme === "light";
    const COLORS = lightTheme ? LIGHT_COLORS : theme === "classic" ? CLASSIC_COLORS : DARK_COLORS;
    const blending = lightTheme ? THREE.NormalBlending : THREE.AdditiveBlending;

    const scene = new THREE.Scene();
    const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 100);
    camera.position.set(0, 0, 10);
    camera.lookAt(0, 0, 0);

    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({
        antialias: true,
        alpha: true,
        preserveDrawingBuffer: true,
        powerPreference: "high-performance",
      });
    } catch {
      return startCanvasFallback(hostEl, phaseRef, mobile, COLORS);
    }
    hostEl.dataset.rendered = "true";
    hostEl.dataset.renderer = "webgl";
    renderer.setClearColor(0x000000, 0);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.domElement.setAttribute("aria-hidden", "true");
    renderer.domElement.style.display = "block";
    renderer.domElement.style.width = "100%";
    renderer.domElement.style.height = "100%";
    hostEl.appendChild(renderer.domElement);

    const root = new THREE.Group();
    scene.add(root);

    const { baseNodes, dynamicNodes, nodeMeta, segments } = makeWebTopology();

    const linePositions = new Float32Array(segments.length * 2 * 3);
    const lineColors = new Float32Array(segments.length * 2 * 3);
    const lineGeometry = new THREE.BufferGeometry();
    lineGeometry.setAttribute("position", new THREE.BufferAttribute(linePositions, 3));
    lineGeometry.setAttribute("color", new THREE.BufferAttribute(lineColors, 3));

    const thickPositions = new Float32Array(segments.length * 6 * 3);
    const thickColors = new Float32Array(segments.length * 6 * 3);
    const thickGeometry = new THREE.BufferGeometry();
    thickGeometry.setAttribute("position", new THREE.BufferAttribute(thickPositions, 3));
    thickGeometry.setAttribute("color", new THREE.BufferAttribute(thickColors, 3));

    const thickMaterial = new THREE.MeshBasicMaterial({
      vertexColors: true,
      transparent: true,
      opacity: 0.58,
      blending,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    const thickWeb = new THREE.Mesh(thickGeometry, thickMaterial);
    thickWeb.renderOrder = 1;
    root.add(thickWeb);

    const lineMaterial = new THREE.LineBasicMaterial({
      vertexColors: true,
      transparent: true,
      opacity: 0.86,
      blending,
      depthWrite: false,
    });
    const webLines = new THREE.LineSegments(lineGeometry, lineMaterial);
    webLines.renderOrder = 3;
    root.add(webLines);

    const glowGeometry = lineGeometry.clone();
    const glowMaterial = new THREE.LineBasicMaterial({
      vertexColors: true,
      transparent: true,
      opacity: 0.24,
      blending,
      depthWrite: false,
    });
    const glowLines = new THREE.LineSegments(glowGeometry, glowMaterial);
    glowLines.scale.setScalar(1.003);
    glowLines.renderOrder = 0;
    root.add(glowLines);

    const nodeTexture = makeNodeTexture(theme);
    const nodeSprites: THREE.Sprite[] = [];
    if (nodeTexture) {
      for (let i = 0; i < dynamicNodes.length; i += 1) {
        const meta = nodeMeta[i];
        const sprite = new THREE.Sprite(
          new THREE.SpriteMaterial({
            map: nodeTexture,
            color: meta.isCenter ? COLORS.white : makeRadialColor(baseNodes[i].x, COLORS),
            transparent: true,
            opacity: meta.isCenter ? 1 : 0.92,
            blending,
            depthWrite: false,
          }),
        );
        const s = meta.size * (meta.isCenter ? 1.55 : 1.0) * NODE_DIAMETER_MULTIPLIER;
        sprite.scale.set(s, s, 1);
        sprite.position.copy(dynamicNodes[i]);
        sprite.position.z = 0.02;
        nodeSprites.push(sprite);
        root.add(sprite);
      }
    }

    function resize() {
      const rect = hostEl.getBoundingClientRect();
      const fallbackSize = mobile ? 208 : 278;
      const width = Math.max(1, Math.round(hostEl.clientWidth || rect.width || fallbackSize));
      const height = Math.max(1, Math.round(hostEl.clientHeight || rect.height || fallbackSize));
      renderer.setSize(width, height, false);
      const aspect = width / height;
      const viewHeight = mobile ? 8.7 : 8.25;
      camera.left = (-viewHeight * aspect) / 2;
      camera.right = (viewHeight * aspect) / 2;
      camera.top = viewHeight / 2;
      camera.bottom = -viewHeight / 2;
      camera.updateProjectionMatrix();
    }

    function updateWeb(t: number) {
      const state = phaseRef.current;
      updateDynamicNodes(baseNodes, dynamicNodes, nodeMeta, t, state);

      let p = 0;
      for (let s = 0; s < segments.length; s += 1) {
        const [a, b] = segments[s];
        const pa = dynamicNodes[a];
        const pb = dynamicNodes[b];
        linePositions[p++] = pa.x;
        linePositions[p++] = pa.y;
        linePositions[p++] = pa.z;
        linePositions[p++] = pb.x;
        linePositions[p++] = pb.y;
        linePositions[p++] = pb.z;

        const ca = makeRadialColor(pa.x, COLORS);
        const cb = makeRadialColor(pb.x, COLORS);
        const colorOffset = s * 2 * 3;
        lineColors[colorOffset] = ca.r;
        lineColors[colorOffset + 1] = ca.g;
        lineColors[colorOffset + 2] = ca.b;
        lineColors[colorOffset + 3] = cb.r;
        lineColors[colorOffset + 4] = cb.g;
        lineColors[colorOffset + 5] = cb.b;
      }

      let tp = 0;
      let tc = 0;
      for (let s = 0; s < segments.length; s += 1) {
        const [a, b] = segments[s];
        const pa = dynamicNodes[a];
        const pb = dynamicNodes[b];
        const ca = makeRadialColor(pa.x, COLORS);
        const cb = makeRadialColor(pb.x, COLORS);
        const dx = pb.x - pa.x;
        const dy = pb.y - pa.y;
        const len = Math.hypot(dx, dy) || 1;
        const nx = (-dy / len) * WEB_STRAND_WIDTH * 0.5;
        const ny = (dx / len) * WEB_STRAND_WIDTH * 0.5;
        const verts = [
          [pa.x + nx, pa.y + ny, pa.z],
          [pa.x - nx, pa.y - ny, pa.z],
          [pb.x + nx, pb.y + ny, pb.z],
          [pb.x + nx, pb.y + ny, pb.z],
          [pa.x - nx, pa.y - ny, pa.z],
          [pb.x - nx, pb.y - ny, pb.z],
        ];
        const cols = [ca, ca, cb, cb, ca, cb];
        for (let i = 0; i < 6; i += 1) {
          thickPositions[tp++] = verts[i][0];
          thickPositions[tp++] = verts[i][1];
          thickPositions[tp++] = verts[i][2] - 0.008;
          thickColors[tc++] = cols[i].r;
          thickColors[tc++] = cols[i].g;
          thickColors[tc++] = cols[i].b;
        }
      }

      markGeometryDirty(thickGeometry);
      markGeometryDirty(lineGeometry);
      (glowGeometry.getAttribute("position") as THREE.BufferAttribute).copy(lineGeometry.getAttribute("position") as THREE.BufferAttribute);
      (glowGeometry.getAttribute("color") as THREE.BufferAttribute).copy(lineGeometry.getAttribute("color") as THREE.BufferAttribute);
      markGeometryDirty(glowGeometry);

      for (let i = 0; i < nodeSprites.length; i += 1) {
        nodeSprites[i].position.copy(dynamicNodes[i]);
        nodeSprites[i].position.z = nodeMeta[i].isCenter ? 0.07 : 0.04;
        const baseSize = nodeMeta[i].size * (nodeMeta[i].isCenter ? 1.55 : 1.0) * NODE_DIAMETER_MULTIPLIER;
        const pulse = nodeMeta[i].ring === RINGS.length - 1 ? 1 + 0.035 * Math.sin(t * 1.9 + i) : 1;
        const centerPulse = nodeMeta[i].isCenter ? 1 + 0.06 * Math.sin(t * 1.4) : 1;
        nodeSprites[i].scale.setScalar(baseSize * pulse * centerPulse);
      }
    }

    const resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(hostEl);
    resize();
    const resizeFrame = requestAnimationFrame(resize);

    const startTime = performance.now();
    let frame = 0;
    function animate() {
      frame = requestAnimationFrame(animate);
      const t = (performance.now() - startTime) / 1000;
      const state = phaseRef.current;
      const realtimePulse = phasePulseActive(state);
      root.scale.setScalar(realtimePulse ? 1 + REALTIME_ROOT_PULSE_AMPLITUDE * Math.sin(t * 2.1) : 1);
      updateWeb(t);
      renderer.render(scene, camera);
    }
    animate();

    return () => {
      cancelAnimationFrame(frame);
      cancelAnimationFrame(resizeFrame);
      resizeObserver.disconnect();
      delete hostEl.dataset.rendered;
      delete hostEl.dataset.renderer;
      if (renderer.domElement.parentNode === hostEl) hostEl.removeChild(renderer.domElement);
      lineGeometry.dispose();
      thickGeometry.dispose();
      glowGeometry.dispose();
      lineMaterial.dispose();
      thickMaterial.dispose();
      glowMaterial.dispose();
      nodeTexture?.dispose();
      for (const sprite of nodeSprites) {
        const material = sprite.material;
        if (Array.isArray(material)) {
          material.forEach((item) => item.dispose());
        } else {
          material.dispose();
        }
      }
      renderer.dispose();
    };
  }, [mobile, theme]);

  return (
    <div className={mobile ? "mobile-pritha-star-scene" : "pritha-star-scene"} ref={hostRef} data-testid="pritha-star-scene" data-state={phase} aria-hidden="true" />
  );
}
