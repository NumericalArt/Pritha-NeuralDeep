import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import test from "node:test";

import ts from "../interfaces/control-center/node_modules/typescript/lib/typescript.js";

const source = readFileSync("interfaces/control-center/src/lib/security/api-guard.ts", "utf8");

async function loadGuardModule() {
  const output = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.ES2022,
      target: ts.ScriptTarget.ES2022,
      isolatedModules: true,
    },
  }).outputText;
  const tmp = mkdtempSync(path.join(os.tmpdir(), "pritha-api-guard-test-"));
  const modulePath = path.join(tmp, "api-guard.mjs");
  writeFileSync(modulePath, output, "utf8");
  return {
    module: await import(pathToFileURL(modulePath).href),
    cleanup: () => rmSync(tmp, { recursive: true, force: true }),
  };
}

function headers(values = {}) {
  return new Headers(values);
}

function request(overrides = {}) {
  const { headers: headerOverrides, ...rest } = overrides;
  return {
    url: "http://127.0.0.1:3420/api/realtime/tool",
    method: "POST",
    headers: headers({
      host: "127.0.0.1:3420",
      origin: "http://127.0.0.1:3420",
      "sec-fetch-site": "same-origin",
      ...(headerOverrides || {}),
    }),
    env: overrides.env || {},
    ...rest,
  };
}

test("Control Center API guard blocks untrusted host headers", async () => {
  const loaded = await loadGuardModule();
  try {
    const decision = loaded.module.evaluateApiRequestGuard(request({ headers: { host: "evil.com", origin: "http://evil.com" } }));
    assert.deepEqual(decision, { action: "deny", error: "untrusted_host" });
  } finally {
    loaded.cleanup();
  }
});

test("Control Center API guard blocks cross-origin mutating requests", async () => {
  const loaded = await loadGuardModule();
  try {
    assert.deepEqual(
      loaded.module.evaluateApiRequestGuard(request({ headers: { origin: "https://evil.com", "sec-fetch-site": "same-origin" } })),
      { action: "deny", error: "origin_mismatch" },
    );
    assert.deepEqual(
      loaded.module.evaluateApiRequestGuard(request({ headers: { "sec-fetch-site": "cross-site" } })),
      { action: "deny", error: "cross_site_blocked" },
    );
    assert.deepEqual(loaded.module.evaluateApiRequestGuard(request({ headers: { origin: "not a url" } })), {
      action: "deny",
      error: "bad_origin",
    });
  } finally {
    loaded.cleanup();
  }
});

test("Control Center API guard requires trusted Tailscale identity on tailnet hosts", async () => {
  const loaded = await loadGuardModule();
  try {
    const base = {
      host: "pritha.example.ts.net",
      origin: "https://pritha.example.ts.net",
      "sec-fetch-site": "same-origin",
    };
    assert.deepEqual(loaded.module.evaluateApiRequestGuard(request({ headers: base })), {
      action: "deny",
      error: "untrusted_tailscale_identity",
    });
    assert.deepEqual(
      loaded.module.evaluateApiRequestGuard(
        request({
          headers: { ...base, "tailscale-user-login": "friend@example.com" },
          env: { PRITHA_TAILSCALE_ALLOWED_LOGINS: "operator@example.com" },
        }),
      ),
      { action: "deny", error: "untrusted_tailscale_identity" },
    );
    assert.deepEqual(
      loaded.module.evaluateApiRequestGuard(
        request({
          headers: { ...base, "tailscale-user-login": "operator@example.com" },
          env: { PRITHA_TAILSCALE_ALLOWED_LOGINS: "operator@example.com" },
        }),
      ),
      { action: "allow" },
    );
  } finally {
    loaded.cleanup();
  }
});

test("Control Center API guard accepts loopback and strips spoofed Tailscale identity", async () => {
  const loaded = await loadGuardModule();
  try {
    assert.deepEqual(loaded.module.evaluateApiRequestGuard(request()), { action: "allow" });

    const spoofed = loaded.module.evaluateApiRequestGuard(request({ headers: { "tailscale-user-login": "operator@example.com" } }));
    assert.equal(spoofed.action, "allow");
    assert.equal(spoofed.requestHeaders.get("tailscale-user-login"), null);

    const ipv6 = loaded.module.evaluateApiRequestGuard(
      request({
        headers: {
          host: "[::1]:3420",
          origin: "http://[::1]:3420",
          "sec-fetch-site": "same-origin",
        },
      }),
    );
    assert.deepEqual(ipv6, { action: "allow" });
  } finally {
    loaded.cleanup();
  }
});
