import { test, expect, type Page } from "@playwright/test";
import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

const evidence = process.env.PRITHA_THEME_REVIEW_ROOT;
const key = "pritha-neuraldeep-theme";
const themes = ["dark", "light", "classic"] as const;
const widths = [1440, 1200, 768, 767, 390, 320];
const routes = ["voice", "agents", "task-chat", "settings", "dev"];

test.beforeEach(async ({ request }) => {
  test.skip(!evidence, "Theme review must use an explicitly isolated instance.");
  const response = await request.get("/api/health");
  const health = await response.json();
  expect(process.env.PRITHA_E2E_ISOLATED_STATE).toBe("1");
  expect(health.instance.id).toBe(process.env.PRITHA_INSTANCE_ID);
  expect(health.instance.id).toMatch(/e2e|fixture|test/);
  expect(health.instance.role).toBe("development");
});

async function choose(page: Page, theme: string) {
  await page.getByRole("radio", { name: theme, exact: true }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", theme.toLowerCase());
}

test("three accessible choices, dark default, keyboard, persistence, navigation and cross-tab synchronization", async ({ page, context }) => {
  await page.emulateMedia({ colorScheme: "light" });
  await page.addInitScript(() => localStorage.setItem("pritha-control-center-theme", "light"));
  await page.goto("/settings");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await expect(page.getByRole("radiogroup", { name: "Theme", exact: true }).getByRole("radio")).toHaveCount(3);
  await page.getByRole("radio", { name: "Dark", exact: true }).focus();
  await page.keyboard.press("ArrowRight");
  await expect(page.getByRole("radio", { name: "Light", exact: true })).toBeFocused();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  await page.keyboard.press("End");
  await expect(page.getByRole("radio", { name: "Classic", exact: true })).toHaveAttribute("aria-checked", "true");
  await page.reload();
  await expect(page.getByRole("radio", { name: "Classic", exact: true })).toHaveAttribute("aria-checked", "true");
  await page.goto("/voice");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "classic");
  const settings = await context.newPage();
  await settings.goto("/settings");
  for (const theme of ["Light", "Dark", "Classic"]) {
    await choose(settings, theme);
    await expect(page.locator("html")).toHaveAttribute("data-theme", theme.toLowerCase());
    await expect(page.locator('[data-testid="pritha-star-scene"]:visible canvas')).toHaveCount(1);
    expect(await settings.evaluate(k => localStorage.getItem(k), key)).toBe(theme.toLowerCase());
  }
  await settings.evaluate(k => localStorage.removeItem(k), key);
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  expect(await page.evaluate(() => localStorage.getItem("pritha-control-center-theme"))).toBe("light");
});

test("blocked theme preference storage still allows an in-tab choice without runtime errors", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.addInitScript(() => {
    const get = Storage.prototype.getItem, set = Storage.prototype.setItem;
    Storage.prototype.getItem = function(key) {
      if (key === "pritha-neuraldeep-theme") throw new DOMException("Blocked", "SecurityError");
      return get.call(this, key);
    };
    Storage.prototype.setItem = function(key, value) {
      if (key === "pritha-neuraldeep-theme") throw new DOMException("Blocked", "SecurityError");
      return set.call(this, key, value);
    };
  });
  await page.goto("/settings");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await choose(page, "Light");
  await choose(page, "Classic");
  expect(errors).toEqual([]);
});

for (const route of routes) test(`${route}: three themes retain geometry, type and scroll at all six widths`, async ({ page }) => {
  test.setTimeout(120_000);
  const report: unknown[] = [];
  for (const width of widths) {
    await page.setViewportSize({ width, height: 1000 });
    await page.goto(`/${route}`);
    await page.locator(".app-shell").waitFor();
    await page.waitForTimeout(500);
    const result = await page.evaluate(() => {
      const style = document.createElement("style");
      style.textContent = "*,*::before,*::after{animation:none!important;transition:none!important}";
      document.head.append(style);
      const original = document.documentElement.dataset.theme;
      const elements = Array.from(document.querySelectorAll<HTMLElement>("body *"));
      const capture = () => elements.map((el, i) => {
        const r = el.getBoundingClientRect(), s = getComputedStyle(el);
        return { i, tag: el.tagName, cls: String(el.className).slice(0, 90), box: [r.x, r.y, r.width, r.height, el.scrollWidth, el.scrollHeight], font: [s.fontFamily, s.fontSize, s.fontWeight, s.lineHeight, s.letterSpacing] };
      });
      document.documentElement.dataset.theme = "dark";
      const baseline = capture();
      const changes: unknown[] = [];
      for (const theme of ["light", "classic"]) {
        document.documentElement.dataset.theme = theme;
        capture().forEach((row, i) => {
          if (!row.box[2] && !baseline[i].box[2]) return;
          const delta = Math.max(...row.box.map((v, j) => Math.abs(v - baseline[i].box[j])));
          if (delta > 1 || row.font.join() !== baseline[i].font.join()) changes.push({ theme, row, baseline: baseline[i], delta });
        });
      }
      document.documentElement.dataset.theme = original;
      style.remove();
      return { elements: elements.length, changes, scrollWidth: document.documentElement.scrollWidth };
    });
    report.push({ width, ...result });
    expect.soft(result.changes, `${route} ${width}`).toEqual([]);
    // Existing Settings forms measure 795px at the 768px desktop breakpoint,
    // also verified on the unchanged dark production and accepted light preview.
    // Theme switching must not introduce or increase that pre-existing overflow.
    expect.soft(result.scrollWidth, `${route} ${width} overflow`).toBeLessThanOrEqual(route === "settings" && width === 768 ? 795 : width + 1);
  }
  mkdirSync(path.join(evidence!, "screens"), { recursive: true });
  writeFileSync(path.join(evidence!, "screens", `geometry-${route}.json`), JSON.stringify(report, null, 2));
});

test("all themes match frozen CSS references on the same current DOM", async ({ page }) => {
  test.setTimeout(180_000);
  const report: unknown[] = [];
  for (const route of routes) for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 1000 });
    await page.goto(`/${route}`);
    await page.locator(".app-shell").waitFor();
    await page.waitForTimeout(300);
    for (const theme of themes) {
      const reference = readFileSync(path.join(evidence!, "references", `${theme}.css`), "utf8");
      const differences = await page.evaluate(({ theme, reference }) => {
        document.documentElement.dataset.theme = theme;
        const sheets = Array.from(document.styleSheets);
        const elements = Array.from(document.querySelectorAll<HTMLElement>("body *"));
        const properties = ["color", "backgroundColor", "backgroundImage", "borderTopColor", "borderRightColor", "borderBottomColor", "borderLeftColor", "boxShadow", "textShadow", "filter", "opacity", "fill", "stroke", "outlineColor", "accentColor"] as const;
        const freeze = document.createElement("style");
        freeze.textContent = "*,*::before,*::after{animation:none!important;transition:none!important}";
        document.head.append(freeze);
        const capture = () => elements.flatMap((el, index) => {
          if (!el.getBoundingClientRect().width) return [];
          return [null, "::before", "::after"].map(pseudo => {
            const s = getComputedStyle(el, pseudo);
            return { index, tag: el.tagName, cls: String(el.className).slice(0, 90), pseudo, paint: properties.map(p => s[p]) };
          });
        });
        const current = capture();
        sheets.forEach(s => s.disabled = true);
        const old = document.createElement("style"); old.textContent = reference; document.head.append(old);
        const baseline = capture();
        old.remove(); sheets.forEach(s => s.disabled = false); freeze.remove();
        return current.flatMap((row, i) => row.paint.join("|") === baseline[i]?.paint.join("|") ? [] : [{ row, baseline: baseline[i] }]);
      }, { theme, reference });
      report.push({ route, width, theme, differences });
      expect.soft(differences, `${route} ${width} ${theme}: exact reference paint`).toEqual([]);
    }
  }
  writeFileSync(path.join(evidence!, "screens", "reference-paint.json"), JSON.stringify(report, null, 2));
});

for (const fallback of [false, true]) test(`${fallback ? "Canvas" : "WebGL"}: real star, transparent canvas and responsive theme screenshots`, async ({ page }) => {
  test.setTimeout(120_000);
  if (fallback) await page.addInitScript(() => {
    const original = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function(this: HTMLCanvasElement, contextId: string, ...args: unknown[]) {
      if (["webgl", "webgl2", "experimental-webgl"].includes(contextId)) return null;
      return original.call(this, contextId, ...args);
    } as typeof original;
  });
  for (const width of [1440, 390]) for (const theme of themes) {
    await page.setViewportSize({ width, height: 1000 });
    await page.goto("/settings");
    await choose(page, theme[0].toUpperCase() + theme.slice(1));
    await page.screenshot({ path: path.join(evidence!, "screens", `settings-${theme}-${width}.png`), fullPage: true });
    await page.goto("/voice");
    const star = page.locator('[data-testid="pritha-star-scene"]:visible');
    await expect(star).toHaveAttribute("data-renderer", fallback ? "canvas2d" : "webgl");
    await expect(star.locator("canvas")).toHaveCount(1);
    await page.waitForTimeout(300);
    const pixels = await star.locator("canvas").evaluate((el: HTMLCanvasElement) => {
      const copy = document.createElement("canvas"); copy.width = el.width; copy.height = el.height;
      const ctx = copy.getContext("2d")!; ctx.drawImage(el, 0, 0);
      const rgba = ctx.getImageData(0, 0, copy.width, copy.height).data;
      let visible = 0, clear = 0;
      for (let i = 3; i < rgba.length; i += 4) { if (rgba[i] > 0) visible++; else clear++; }
      return { visible, clear };
    });
    expect(pixels.visible).toBeGreaterThan(100);
    expect(pixels.clear).toBeGreaterThan(pixels.visible);
    await page.screenshot({ path: path.join(evidence!, "screens", `voice-${theme}-${fallback ? "canvas" : "webgl"}-${width}.png`), fullPage: true });
    if (!fallback) {
      await page.goto("/agents");
      await page.screenshot({ path: path.join(evidence!, "screens", `agents-${theme}-${width}.png`), fullPage: true });
    }
  }
});
