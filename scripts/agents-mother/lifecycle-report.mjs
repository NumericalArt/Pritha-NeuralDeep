import os from "node:os";
import { redactFilesystemPaths } from "../lib/redaction.mjs";
import { writeUniqueArtifact } from "./artifact-selection.mjs";

export function lifecycleRedactionContext(options = {}) {
  return {
    projectRoot: options.projectRoot,
    stateRoot: options.stateRoot,
    root: options.root,
    homeDir: options.homeDir || os.homedir(),
  };
}

export function writeLifecycleReport(filePath, render, options = {}) {
  const context = lifecycleRedactionContext(options);
  return writeUniqueArtifact(filePath, (artifact) => {
    const markdown = typeof render === "function" ? render(artifact) : render;
    const safe = redactFilesystemPaths(markdown, context);
    // This opaque, host-derived identity is metadata, not a credential. Keep
    // its wire field after redacting all authored text and filesystem paths.
    if (options.instanceKey !== undefined) {
      if (!/^pritha-[a-f0-9]{24}$/.test(options.instanceKey)) throw new Error("Invalid lifecycle instance identity");
      return safe.replace(/^instance_key:.*$/m, `instance_key: ${options.instanceKey}`);
    }
    return safe;
  });
}
