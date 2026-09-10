import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

function validateAdapter(adapter, manifest, adapterDir) {
  for (const name of ["canHandle", "prepareSource"]) {
    if (typeof adapter[name] !== "function") {
      throw new Error(`Invalid media adapter in ${adapterDir}: missing ${name}().`);
    }
  }
  return {
    manifest: adapter.manifest || manifest,
    canHandle: adapter.canHandle,
    prepareSource: adapter.prepareSource,
  };
}

export async function loadAdapters({ adaptersDir }) {
  if (!existsSync(adaptersDir)) return [];
  const entries = readdirSync(adaptersDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .sort((a, b) => a.name.localeCompare(b.name));
  const adapters = [];
  for (const entry of entries) {
    const adapterDir = path.join(adaptersDir, entry.name);
    const manifestPath = path.join(adapterDir, "manifest.json");
    const adapterPath = path.join(adapterDir, "adapter.mjs");
    if (!existsSync(manifestPath) || !existsSync(adapterPath)) continue;
    const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
    const adapter = await import(pathToFileURL(adapterPath).href);
    adapters.push(validateAdapter(adapter, manifest, adapterDir));
  }
  return adapters;
}

export async function resolveAdapter(source, options) {
  const adapters = await loadAdapters(options);
  for (const adapter of adapters) {
    if (await adapter.canHandle(source)) return adapter;
  }
  throw new Error("No compatible media adapter found for this source.");
}
