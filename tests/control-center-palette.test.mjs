import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";

const require = createRequire(new URL("../interfaces/control-center/package.json", import.meta.url));
const postcss = require("postcss");
const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const prefix = "interfaces/control-center/src/";
const palette = read(`${prefix}styles/neuraldeep-palette.css`);
const css = read(`${prefix}styles/globals.css`);
const star = read(`${prefix}components/voice/PrithaStarScene.tsx`);
const tokens = new Map();
postcss.parse(palette).walkDecls(d => { if (d.prop.startsWith("--")) tokens.set(d.prop, d.value); });
const paint = /^(color|background(?:-.*)?|border(?:-.*)?|outline(?:-.*)?|box-shadow|text-shadow|filter|fill|stroke|text-decoration-color|accent-color)$/;

test("NeuralDeep palette is dark-only and contains no layout or typography changes", () => {
  const tree = postcss.parse(palette);
  tree.walkRules((rule) => assert.ok(rule.selector.split(",\n").every(s => s.startsWith(':root:not([data-theme="light"])')), rule.selector));
  tree.walkDecls((d) => assert.ok(d.prop.startsWith("--") || paint.test(d.prop), d.toString()));
  assert.match(css, /@import "\.\/neuraldeep-palette\.css"/);
  assert.match(palette, /96px 1px/);
  assert.match(palette, /144px 1px/);
});

test("every new semantic variable resolves in the dark palette", () => {
  const declarations = new Set();
  postcss.parse(palette).walkDecls(d => declarations.add(d.prop));
  for (const [, name] of (palette + css).matchAll(/var\((--nd-[a-z-]+)/g)) assert.ok(declarations.has(name), name);
});

function luminance(hex) {
  const rgb = hex.replace("#", "").match(/../g).map(v => parseInt(v, 16) / 255).map(v => v <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4);
  return .2126 * rgb[0] + .7152 * rgb[1] + .0722 * rgb[2];
}
function contrast(a, b) { const x = luminance(a), y = luminance(b); return (Math.max(x, y) + .05) / (Math.min(x, y) + .05); }

test("text, pastel CTA and meaningful control contours meet target contrast", () => {
  for (const token of ["--text-primary", "--text-secondary", "--text-muted", "--nd-link", "--nd-success", "--nd-warning", "--nd-error", "--nd-voice", "--nd-info"])
    for (const bg of ["#0c1015", "#19222c", "#1c2530", "#25313e", "#302733", "#222b3c", "#1b2a2c"]) assert.ok(contrast(tokens.get(token), bg) >= 4.5, `${token} on ${bg}`);
  for (const token of ["--nd-action", "--nd-selection"]) {
    const stops = tokens.get(token).match(/#[a-f0-9]{6}/g);
    for (let i = 0; i < stops.length - 1; i++) {
      const a = stops[i].slice(1).match(/../g).map(v => parseInt(v, 16));
      const b = stops[i + 1].slice(1).match(/../g).map(v => parseInt(v, 16));
      for (let t = 0; t <= 100; t++) {
        const sample = "#" + a.map((v, j) => Math.round(v + (b[j] - v) * t / 100).toString(16).padStart(2, "0")).join("");
        assert.ok(contrast(tokens.get("--nd-on-action"), sample) >= 4.5, `${token} at ${i}:${t}`);
      }
    }
  }
  assert.ok(contrast("#728294", "#1c2530") >= 3);
});

test("star retains canonical renderer, geometry and motion constants", () => {
  for (const invariant of ["WEB_STRAND_WIDTH = 0.018", "CALM_SWAY_MULTIPLIER = 4.0", "NODE_DIAMETER_MULTIPLIER = 4.0", "DIRECTION_COUNT = 16", "LONG_RADIUS = 3.68", "const RINGS = [0.27, 0.48, 0.7, 1.0]", "startCanvasFallback", "new THREE.WebGLRenderer"])
    assert.ok(star.includes(invariant), invariant);
  for (const hex of ["#f15380", "#eb94ac", "#e9ecf3", "#67a9ea", "#3fcbd7"]) assert.ok(star.includes(hex), hex);
  assert.match(star, /getStyle\(THREE.SRGBColorSpace\)/);
});

test("logo, QR contrast and default dark preference are preserved", () => {
  assert.match(read(`${prefix}components/primitives/PrithaLogoPlaceholder.tsx`), /src="\/pritha-logo.png"/);
  assert.match(read(`${prefix}components/settings/SettingsControlPage.tsx`), /dark: "#111827", light: "#ffffff"/);
  assert.match(read(`${prefix}app/layout.tsx`), /import \{ themeInitScript \} from "@\/lib\/theme"/);
  assert.match(read(`${prefix}lib/theme.ts`), /DEFAULT_THEME: ControlCenterTheme = "dark"/);
});
