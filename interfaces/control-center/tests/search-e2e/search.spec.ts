import { test, expect } from "@playwright/test";
import { createServer, type Server } from "node:http";
let fixture: Server, url: string;
test.beforeAll(async () => {
  fixture = createServer((_, r) => {
    r.setHeader("Content-Type", "application/json");
    r.end(
      JSON.stringify({
        results: [
          {
            url: "https://example.com/official",
            title: "Official fixture",
            content: "Verified fixture content",
          },
        ],
      }),
    );
  });
  await new Promise<void>((r) => fixture.listen(0, "127.0.0.1", r));
  url = `http://127.0.0.1:${(fixture.address() as any).port}/search`;
});
test.afterAll(async () => {
  await new Promise<void>((r) => fixture.close(() => r()));
});
test("legacy chat entry redirects before rendering and preserves query parameters", async ({ request, baseURL }) => {
  const response = await request.get("/codex?chat=fixture%2Fchat&tag=one&tag=two&draft=%D0%BF%D0%BE%D0%B8%D1%81%D0%BA", { maxRedirects: 0 });
  expect(response.status()).toBe(307);
  const target = new URL(response.headers().location, baseURL);
  expect(target.pathname).toBe("/task-chat");
  expect(target.searchParams.get("chat")).toBe("fixture/chat");
  expect(target.searchParams.getAll("tag")).toEqual(["one", "two"]);
  expect(target.searchParams.get("draft")).toBe("поиск");
  expect(await response.text()).not.toContain("<!DOCTYPE html>");
  expect((await request.get(target.href)).ok()).toBeTruthy();
});
test("Settings controls persist, test search returns sources and disable works", async ({
  page,
  request,
  baseURL,
}, info) => {
  const before = await request.get("/api/settings/search");
  expect(before.ok()).toBeTruthy();
  const d = await before.json();
  const save = await request.patch("/api/settings/search", {
    headers: { Origin: baseURL! },
    data: {
      expectedRevision: d.settings.revision,
      patch: { enabled: false, provider: "searxng", searxngUrl: url },
    },
  });
  expect(save.ok()).toBeTruthy();
  await page.goto("/settings");
  const section = page.getByRole("region", { name: "Search settings" });
  await expect(
    section.getByRole("heading", { name: "Search", exact: true }),
  ).toBeVisible();
  await section.getByLabel("Enable web search").check();
  await section.getByLabel("Search mode", { exact: true }).selectOption("auto");
  await section.getByRole("button", { name: "Save search settings" }).click();
  await expect(
    section.getByText("Search settings saved.", { exact: true }),
  ).toBeVisible();
  await section
    .getByRole("button", { name: "Test search (uses quota)" })
    .click();
  await expect(section.getByText(/Search test: 1 sources/)).toBeVisible();
  await expect(section.getByText("Connection: healthy")).toBeVisible();
  await section.getByLabel("Enable web search").uncheck();
  await section.getByRole("button", { name: "Save search settings" }).click();
  await expect(
    section.getByRole("button", { name: "Test search (uses quota)" }),
  ).toBeDisabled();
  await page.reload();
  await expect(section.getByLabel("Enable web search")).not.toBeChecked();
  await section.screenshot({
    path: `${process.env.PRITHA_STATE_ROOT}/artifacts/search-${info.project.name}.png`,
  });
});
test("stale revision and cross-origin writes fail without changing settings", async ({
  request,
  baseURL,
}) => {
  const d = await (await request.get("/api/settings/search")).json();
  const r = await request.patch("/api/settings/search", {
    headers: { Origin: baseURL! },
    data: {
      expectedRevision: d.settings.revision - 1,
      patch: { enabled: true },
    },
  });
  expect(r.status()).toBe(409);
  const x = await request.patch("/api/settings/search", {
    headers: { Origin: "https://untrusted.example" },
    data: { expectedRevision: d.settings.revision, patch: { enabled: true } },
  });
  expect(x.status()).toBe(403);
});
test("research panel exposes explicit start, not automatic creation", async ({
  page,
  request,
}) => {
  const before = await (await request.get("/api/search/research")).json();
  await page.goto("/settings");
  await expect(
    page.getByRole("heading", { name: "Deep Research", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Start research", exact: true }),
  ).toBeDisabled();
  const after = await (await request.get("/api/search/research")).json();
  expect(after.jobs.length).toBe(before.jobs.length);
});

test("research job is idempotent, cancellation is repeatable and missing credential never creates a completed report", async ({
  request,
  baseURL,
  page,
}) => {
  const settings = await (await request.get("/api/settings/search")).json();
  await request.patch("/api/settings/search", {
    headers: { Origin: baseURL! },
    data: {
      expectedRevision: settings.settings.revision,
      patch: {
        enabled: true,
        mode: "requested",
        surfaces: { ...settings.settings.surfaces, research: true },
      },
    },
  });
  const input = {
    question:
      "Synthetic research lifecycle with unavailable fixture credential",
    requestKey: `fixture_${crypto.randomUUID()}`,
  };
  const first = await request.post("/api/search/research", {
    headers: { Origin: baseURL! },
    data: input,
  });
  expect(first.status()).toBe(202);
  const created = await first.json();
  const second = await request.post("/api/search/research", {
    headers: { Origin: baseURL! },
    data: input,
  });
  expect((await second.json()).job.id).toBe(created.job.id);
  const id = created.job.id;
  for (let n = 0; n < 2; n++) {
    const cancel = await request.post(`/api/search/research/${id}/cancel`, {
      headers: { Origin: baseURL! },
      data: {},
    });
    expect(cancel.ok()).toBeTruthy();
  }
  await expect
    .poll(async () => {
      const result = await (
        await request.get(`/api/search/research/${id}`)
      ).json();
      return result.job.state;
    })
    .toMatch(/cancelled|failed/);
  const result = await (await request.get(`/api/search/research/${id}`)).json();
  expect(result.job.checkpoint.calls).toBe(0);
  expect(result.job.checkpoint.messages).toBeUndefined();
  await page.goto("/settings");
  const jobSummary = page
    .getByRole("region", { name: "Search settings" })
    .locator('[aria-label="Deep Research"] > details > summary')
    .filter({ hasText: input.question })
    .first();
  await jobSummary.scrollIntoViewIfNeeded();
  await expect(jobSummary).toBeVisible();
  const current = await (await request.get("/api/settings/search")).json();
  await request.patch("/api/settings/search", {
    headers: { Origin: baseURL! },
    data: {
      expectedRevision: current.settings.revision,
      patch: { enabled: false },
    },
  });
});
