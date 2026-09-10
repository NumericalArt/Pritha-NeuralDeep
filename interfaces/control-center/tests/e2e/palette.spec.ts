import { test, expect, type Page } from "@playwright/test";
import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

const baseline = process.env.PRITHA_PALETTE_BASELINE;
const output = process.env.PRITHA_PALETTE_OUTPUT;
const widths = [1440, 1200, 768, 767, 390, 320];
const routes = ["/agents", "/voice", "/task-chat", "/settings", "/dev"];
const agentId = process.env.PRITHA_PALETTE_AGENT_ID;
if (agentId) routes.push(`/agents/${encodeURIComponent(agentId)}`);
const stripImports = (css: string) => css.replace(/@import[^;]+;/g, "");

function styles() {
  return {
    original: readFileSync(path.join(baseline!, "tokens.css"), "utf8") + stripImports(readFileSync(path.join(baseline!, "globals.css"), "utf8")),
    current: ["tokens.css", "neuraldeep-palette.css", "globals.css"].map(file => stripImports(readFileSync(path.join(process.cwd(), "src/styles", file), "utf8"))).join("\n"),
  };
}

async function comparePaint(page: Page, label: string) {
  const result = await page.evaluate(({ original, current }) => {
    for (const sheet of Array.from(document.styleSheets)) sheet.disabled = true;
    const style = document.createElement("style");
    document.head.append(style);
    const freeze = "\n*,*::before,*::after{animation:none!important;transition:none!important;caret-color:transparent!important}";
    const elements = Array.from(document.querySelectorAll<HTMLElement>("body *"));
    const capture = () => elements.map((el, index) => {
      const r = el.getBoundingClientRect(), s = getComputedStyle(el);
      return { index, tag: el.tagName, cls: el.className?.toString().slice(0, 120), x: r.x, y: r.y, w: r.width, h: r.height, font: [s.fontFamily, s.fontSize, s.fontWeight, s.lineHeight, s.letterSpacing].join("|"), scroll: el.scrollWidth };
    });
    style.textContent = original + freeze;
    const before = capture();
    style.textContent = current + freeze;
    const after = capture();
    const changes = after.flatMap((row, i) => {
      const old = before[i];
      if (!row.w && !old.w) return [];
      const delta = Math.max(Math.abs(row.x-old.x),Math.abs(row.y-old.y),Math.abs(row.w-old.w),Math.abs(row.h-old.h),Math.abs(row.scroll-old.scroll));
      return delta > 1 || row.font !== old.font ? [{ row, old, delta }] : [];
    });
    return { elements: elements.length, changes, overflow: document.documentElement.scrollWidth > innerWidth + 2 };
  }, styles());
  await page.screenshot({ path: path.join(output!, `${label}.png`), fullPage: true });
  expect(result.changes, label).toEqual([]);
  return { label, ...result };
}

test("palette preserves original layout across all routes and six viewport widths", async ({ page }) => {
  test.skip(!baseline || !output, "Explicit private baseline/output paths are required.");
  test.setTimeout(180_000);
  mkdirSync(output!, { recursive: true });
  const report: unknown[] = [];
  for (const width of widths) {
    await page.setViewportSize({ width, height: 1000 });
    for (const route of routes) {
      const response = await page.goto(route);
      expect(response?.ok(), route).toBeTruthy();
      await page.locator(".app-shell").waitFor();
      await page.waitForTimeout(200);
      if (route === "/agents") await page.locator('.agent-view-toggle button:visible').filter({ hasText: /^All$/ }).click();
      const result = await comparePaint(page, `${route.slice(1).replaceAll("/", "-")}-${width}`);
      report.push({ width, route, ...result });
    }
  }
  writeFileSync(path.join(output!, "geometry.json"), JSON.stringify(report, null, 2));
});

test("agent panels, voice confirmation and focus/hover preserve geometry", async ({ page }) => {
  test.skip(!baseline || !output || !agentId, "An inert agent fixture and explicit private paths are required.");
  test.setTimeout(180_000);
  mkdirSync(output!, { recursive: true });
  const report: unknown[] = [];
  for (const width of widths) {
    await page.setViewportSize({ width, height: 1000 });
    await page.goto("/agents");
    await page.locator('.agent-view-toggle button:visible').filter({ hasText: /^All$/ }).click();
    const credentials = page.locator(`[data-testid="agent-credentials-button"][data-agent-id="${agentId}"]:visible`).first();
    await credentials.focus();
    await credentials.hover();
    report.push(await comparePaint(page, `agents-focus-hover-${width}`));
    await credentials.click();
    await expect(page.getByTestId("credentials-panel")).toBeVisible();
    report.push(await comparePaint(page, `agents-credentials-loading-${width}`));
    await expect(page.locator(".credential-row").first()).toBeVisible();
    report.push(await comparePaint(page, `agents-credentials-${width}`));
    await page.getByRole("button", { name: "Close credentials panel" }).click();
    await page.locator('.agent-action:visible, .mobile-agent-action:visible').first().click();
    await expect(page.locator('.operator-action-panel')).toBeVisible();
    await expect(page.getByText("Loading action plan...", { exact: true })).toHaveCount(0);
    report.push(await comparePaint(page, `agents-action-plan-${width}`));
    await page.getByRole("button", { name: "Close action panel" }).click();
    await page.locator('.add-agent-card:visible, .mobile-add-agent-card:visible').click();
    await expect(page.locator('[aria-label="Open in Task Chat / Create Plan"]')).toBeVisible();
    report.push(await comparePaint(page, `agents-create-plan-${width}`));
    await page.getByRole("button", { name: "Close create plan panel" }).click();
    if (width >= 768) {
      await page.locator(".access-card button").click();
      await expect(page.locator(".access-modal")).toBeVisible();
      report.push(await comparePaint(page, `voice-link-${width}`));
    }
    await page.goto("/voice");
    await page.locator('button:visible').filter({ hasText: "Reset Voice Context" }).first().click();
    await expect(page.getByText("Reset current voice context for this session?")).toBeVisible();
    report.push(await comparePaint(page, `voice-confirmation-${width}`));
    await page.getByRole("button", { name: "Cancel", exact: true }).click();
  }
  writeFileSync(path.join(output!, "panels-geometry.json"), JSON.stringify(report, null, 2));
});

test("existing Canvas star fallback renders without WebGL", async ({ page }) => {
  test.skip(!output, "An explicit private screenshot path is required.");
  await page.addInitScript(() => {
    const getContext = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (this: HTMLCanvasElement, contextId: string, ...args: unknown[]) {
      if (contextId === "webgl" || contextId === "webgl2" || contextId === "experimental-webgl") return null;
      return getContext.call(this, contextId, ...args);
    } as typeof getContext;
  });
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 1000 });
    await page.goto("/voice");
    const canvas = page.locator(".pritha-star-canvas-fallback:visible");
    await expect(canvas).toBeVisible();
    await canvas.screenshot({ path: path.join(output!, `star-canvas-${width}.png`) });
  }
});
