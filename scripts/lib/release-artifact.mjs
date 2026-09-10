import { createHash } from "node:crypto";
import { cpSync, existsSync, lstatSync, mkdirSync, readFileSync, readdirSync, realpathSync, writeFileSync } from "node:fs";
import path from "node:path";

export const ND_STORAGE_COMPATIBILITY = Object.freeze({ coordination: 4, history: 1, historyRegistry: 3, usage: 2 });
const identityName = "pritha-release.json";
const validCommit = value => /^[a-f0-9]{40}$/.test(value || "");

export function readBuildIdentity(directory) {
  if (!existsSync(path.join(directory, identityName))) return null;
  const value = JSON.parse(readFileSync(path.join(directory, identityName), "utf8"));
  const actual = readFileSync(path.join(directory, "BUILD_ID"), "utf8").trim();
  if (value.schema !== "pritha-build-identity-v1" || !validCommit(value.commit) || !actual || value.buildId !== actual
      || !value.storage || Object.values(value.storage).some(version => !Number.isSafeInteger(version) || version < 1)) {
    throw new Error("Invalid compiled build identity");
  }
  return value;
}

export function sealBuildIdentity(directory, commit, storage = {}) {
  if (!validCommit(commit)) throw new Error("A full compiled source pin is required");
  const buildId = readFileSync(path.join(directory, "BUILD_ID"), "utf8").trim();
  writeFileSync(path.join(directory, identityName), JSON.stringify({ schema: "pritha-build-identity-v1", commit, buildId, storage }, null, 2));
  return readBuildIdentity(directory);
}

export function compatibleBuild(identity, required) {
  return Boolean(identity && Object.entries(required).every(([key, version]) => identity.storage[key] === version));
}

// Next's cache is disposable. Every executable, chunk, manifest and identity is covered.
export function buildTreeDigest(directory) {
  const root = realpathSync(directory), digest = createHash("sha256");
  let files = 0;
  function visit(relative) {
    for (const name of readdirSync(path.join(root, relative)).sort()) {
      if (!relative && name === "cache") continue;
      const entry = path.join(relative, name), file = path.join(root, entry), stat = lstatSync(file);
      if (stat.isSymbolicLink() || (!stat.isFile() && !stat.isDirectory())) throw new Error("Release artifacts require regular owned files");
      if (stat.isDirectory()) visit(entry);
      else { digest.update(`${entry}\0${stat.size}\0`); digest.update(readFileSync(file)); files += 1; }
    }
  }
  visit("");
  return { sha256: digest.digest("hex"), files };
}

export function prepareRollbackArtifact(source, destination, required = ND_STORAGE_COMPATIBILITY) {
  const identity = readBuildIdentity(source);
  if (!compatibleBuild(identity, required)) throw new Error("Rollback writer is incompatible with the target storage");
  if (existsSync(destination)) throw new Error("Rollback artifact destination already exists");
  mkdirSync(destination, { recursive: true, mode: 0o700 });
  const build = path.join(destination, "build");
  cpSync(source, build, { recursive: true, filter: file => path.relative(source, file).split(path.sep)[0] !== "cache" });
  const receipt = { schema: "pritha-rollback-artifact-v1", identity, digest: buildTreeDigest(build) };
  writeFileSync(path.join(destination, "artifact.json"), JSON.stringify(receipt, null, 2), { mode: 0o600 });
  return verifyRollbackArtifact(destination, required);
}

export function verifyRollbackArtifact(directory, required = ND_STORAGE_COMPATIBILITY) {
  const root = realpathSync(directory), build = path.join(root, "build");
  if (lstatSync(build).isSymbolicLink()) throw new Error("Rollback build must not be a symlink");
  const receipt = JSON.parse(readFileSync(path.join(root, "artifact.json"), "utf8"));
  const identity = readBuildIdentity(build), digest = buildTreeDigest(build);
  if (receipt.schema !== "pritha-rollback-artifact-v1" || !compatibleBuild(identity, required)
      || JSON.stringify(receipt.identity) !== JSON.stringify(identity)
      || receipt.digest?.sha256 !== digest.sha256 || receipt.digest?.files !== digest.files) throw new Error("Rollback artifact integrity or writer compatibility failed");
  return { root, build, identity, digest };
}
