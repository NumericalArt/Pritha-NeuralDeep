import test from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { isolatedProject } from "./helpers/isolated-project.mjs";
import {
  detectProject,
  fileExists,
  projectAgentData,
  readJsonIfExists,
  readProjectText,
} from "../scripts/agents-mother/test.mjs";

const root = path.resolve(".");

test("Agents Mother test module detects the Pritha harness", () => {
  const detection = detectProject(root);
  assert.equal(detection.classification, "agent-project");
  assert.ok(detection.signals.some((signal) => signal.includes("AGENTS.md")));
  assert.ok(fileExists(root, "scripts/agents-mother.mjs"));
});

test("test module reads optional JSON manifests safely", () => {
  assert.equal(readJsonIfExists(root, "missing/manifest.json"), null);
  const pkg = readJsonIfExists(root, "package.json");
  assert.equal(typeof pkg, "object");
  assert.equal(typeof pkg.scripts, "object");
});

test("improve metadata extraction reads project manifests with the supported two-argument API", () => {
  const project = mkdtempSync(path.join(os.tmpdir(), "pritha-improve-project-"));
  try {
    for (const directory of ["interfaces", "memory", "tools", "operations"]) {
      mkdirSync(path.join(project, directory));
    }
    writeFileSync(path.join(project, "README.md"), "# Metadata Agent\n\nProject mission.\n");
    writeFileSync(path.join(project, "AGENTS.md"), "# Instructions\n\nKeep changes bounded.\n");
    writeFileSync(path.join(project, "package.json"), JSON.stringify({ dependencies: { alpha: "1.0.0" } }));
    writeFileSync(path.join(project, "interfaces", "manifest.json"), JSON.stringify({ adapters: [{ name: "web" }, { name: "telegram" }] }));
    writeFileSync(path.join(project, "memory", "manifest.json"), JSON.stringify({ profile: "Markdown-first", search: "FTS" }));
    writeFileSync(path.join(project, "tools", "manifest.json"), JSON.stringify({ description: "bounded project tools" }));
    writeFileSync(path.join(project, "operations", "manifest.json"), JSON.stringify({
      deployment_target: "local Mac",
      deployment_profile: "local-development",
      service_mode: "foreground",
      autostart: "disabled",
    }));

    const data = projectAgentData(project, "Add a bounded feature");
    assert.equal(data.primaryMission, "Metadata Agent Project mission.");
    assert.equal(data.primaryInterface, "web, telegram");
    assert.equal(data.telegramMode, "operator-control");
    assert.equal(data.memoryModel, "Markdown-first");
    assert.equal(data.indexingSearchNeeds, "FTS");
    assert.equal(data.toolSystem, "bounded project tools");
    assert.equal(data.dependencies, "alpha");
    assert.equal(data.serviceMode, "foreground");
  } finally {
    rmSync(project, { recursive: true, force: true });
  }
});

test("project metadata reads reject traversal, symlinks and oversized files", () => {
  const project = mkdtempSync(path.join(os.tmpdir(), "pritha-project-read-"));
  const outside = mkdtempSync(path.join(os.tmpdir(), "pritha-project-outside-"));
  try {
    writeFileSync(path.join(project, "README.md"), "# Safe\n\n  compact   text\n");
    writeFileSync(path.join(project, "BIG.md"), "x".repeat(256_001));
    writeFileSync(path.join(outside, "outside.md"), "outside private text");
    writeFileSync(path.join(outside, "outside.json"), JSON.stringify({ private: true }));
    symlinkSync(path.join(outside, "outside.md"), path.join(project, "AGENTS.md"));
    symlinkSync(path.join(outside, "outside.json"), path.join(project, "package.json"));

    assert.equal(readProjectText(project, "README.md"), "# Safe compact text");
    assert.equal(readProjectText(project, "AGENTS.md"), "");
    assert.equal(readProjectText(project, "BIG.md"), "");
    assert.equal(readProjectText(project, "../outside.md"), "");
    assert.equal(readJsonIfExists(project, "package.json"), null);
    assert.equal(readJsonIfExists(project, "../outside.json"), null);
  } finally {
    rmSync(project, { recursive: true, force: true });
    rmSync(outside, { recursive: true, force: true });
  }
});

test("Agents Mother test command still supports no-report mode through wrapper and direct entrypoint", t => {
  const fixture = isolatedProject(t);
  for (const entrypoint of ["scripts/agents-mother.mjs", "scripts/agents-mother/index.mjs"]) {
    const result = fixture.run(entrypoint, ["test", ".", "--no-report"]);
    assert.equal(result.status, 0, `${entrypoint}\n${result.stdout}\n${result.stderr}`);
    assert.match(result.stdout, /Classification: agent-project/);
    assert.match(result.stdout, /Report: skipped \(--no-report\)/);
  }
  fixture.assertNoReports();
});
