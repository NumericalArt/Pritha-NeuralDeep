import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { runInNewContext } from "node:vm";

const require = createRequire(new URL("../interfaces/control-center/package.json", import.meta.url));
const ts = require("typescript");
const postcss = require("postcss");
const read = (path) => readFileSync(new URL(`../interfaces/control-center/src/${path}`, import.meta.url), "utf8");
const module = { exports: {} };
runInNewContext(ts.transpileModule(read("lib/theme.ts"), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText, { exports: module.exports });
const { CONTROL_CENTER_THEMES, DEFAULT_THEME, THEME_STORAGE_KEY, normalizeTheme, themeInitScript } = module.exports;

test("exactly three explicit Neural Deep themes, with a separate preference and dark default", () => {
  assert.deepEqual([...CONTROL_CENTER_THEMES], ["dark", "light", "classic"]);
  assert.equal(DEFAULT_THEME, "dark");
  assert.equal(THEME_STORAGE_KEY, "pritha-neuraldeep-theme");
  for (const value of [undefined, null, "", "system", "LIGHT", "broken", {}]) assert.equal(normalizeTheme(value), "dark");
  for (const theme of CONTROL_CENTER_THEMES) assert.equal(normalizeTheme(theme), theme);
});

test("pre-hydration selection handles saved themes, invalid values and unavailable storage without OS inversion", () => {
  for (const value of [...CONTROL_CENTER_THEMES, null, "system", "broken", "throw"]) {
    const root = { dataset: {} };
    runInNewContext(themeInitScript, {
      document: { documentElement: root },
      window: {
        localStorage: { getItem(key) { assert.equal(key, THEME_STORAGE_KEY); if (value === "throw") throw Error("blocked"); return value; } },
        matchMedia() { throw Error("Explicit themes must not follow device appearance"); },
      },
    });
    assert.equal(root.dataset.theme, normalizeTheme(value));
    assert.equal(root.dataset.themePreference, normalizeTheme(value));
  }
});

test("light and graphite overrides cannot leak into Classic; palettes remain paint-only", () => {
  const graphite = postcss.parse(read("styles/neuraldeep-palette.css"));
  graphite.walkRules(rule => assert.ok(rule.selector.startsWith(':root:not([data-theme="light"]):not([data-theme="classic"])'), rule.selector));
  const light = postcss.parse(read("styles/neuraldeep-light.css"));
  light.walkRules(rule => assert.ok(rule.selector.startsWith(':root[data-theme="light"]'), rule.selector));
  const paint = /^(color(?:-scheme)?|background(?:-.*)?|border(?:-(?:color|top-color|right-color|bottom-color|left-color))?|outline-color|box-shadow|text-shadow|filter|fill|stroke|text-decoration-color|accent-color|opacity)$/;
  light.walkDecls(d => assert.ok(d.prop.startsWith("--") || paint.test(d.prop), d.toString()));
  assert.match(read("styles/globals.css"), /@import "\.\/neuraldeep-light\.css"/);
  const classic = postcss.parse(read("styles/neuraldeep-classic.css"));
  classic.walkRules(rule => assert.ok(rule.selector.startsWith(':root[data-theme="classic"]'), rule.selector));
  classic.walkDecls(d => assert.ok(paint.test(d.prop), d.toString()));
  for (const color of ["#5571a6", "#f2e9ff", "#aab3cb", "#62708b"]) assert.ok(classic.toString().includes(color), color);
});

test("all three stars retain their accepted stops, Classic texture, and light alpha blending", () => {
  const star = read("components/voice/PrithaStarScene.tsx");
  for (const hex of ["#a45cff", "#7048ff", "#2f7dff", "#22d7ff", "#f7f8ff", "#f7c0d6", "#f8d9e9", "#fffafb", "#d1e4ff", "#bcebf0"]) assert.ok(star.includes(hex), hex);
  assert.match(star, /lerpColors\(COLORS.violet, COLORS.purple, t \* 2\)/);
  assert.match(star, /rgba\(130,100,255,0.48\)/);
  assert.match(star, /rgba\(70,70,255,0.20\)/);
  assert.match(star, /lightTheme \? THREE.NormalBlending : THREE.AdditiveBlending/);
  assert.match(star, /COLORS === LIGHT_COLORS \? "source-over" : "lighter"/);
  assert.match(star, /\[mobile, theme\]/);
});
