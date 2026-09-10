import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { parseFrontmatterData } from "../scripts/lib/frontmatter.mjs";
import {
  contractData,
  contractFingerprint,
  isExplicitRepositoryApproval,
  isRepositoryLicenseApproved,
  isRepositoryPermissionsBounded,
  sectionItems,
  validateContract,
} from "../scripts/agents-mother/contract.mjs";

test("valid fixture contract passes Agents Mother validation", () => {
  const result = spawnSync("node", [
    "scripts/agents-mother.mjs",
    "validate",
    "tests/fixtures/contracts/valid-agent-contract.md",
  ], { encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.match(result.stdout, /Contract validation passed/);
});

test("invalid fixture contract fails with actionable messages", () => {
  const result = spawnSync("node", [
    "scripts/agents-mother.mjs",
    "validate",
    "tests/fixtures/contracts/invalid-agent-contract.md",
  ], { encoding: "utf8" });
  assert.notEqual(result.status, 0);
  const output = `${result.stdout}\n${result.stderr}`;
  assert.match(output, /Contract validation failed/);
  assert.match(output, /Runtime placement profile/);
  assert.match(output, /invalid Runtime family/);
});

test("contract module validates fixture contracts directly", () => {
  assert.deepEqual(validateContract("tests/fixtures/contracts/valid-agent-contract.md", { print: false }), []);
  const issues = validateContract("tests/fixtures/contracts/invalid-agent-contract.md", { print: false });
  assert.ok(issues.some((issue) => issue.includes("invalid Runtime family")));
  assert.ok(issues.some((issue) => issue.includes("Runtime placement profile")));
});

test("contract enum validation never echoes an invalid credential-like value", () => {
  const root = mkdtempSync(path.join(os.tmpdir(), "pritha-contract-redaction-"));
  try {
    const contractPath = path.join(root, "credential-in-wrong-field.md");
    const token = "ghp_abcdefghijklmnopqrstuvwxyz123456";
    writeFileSync(
      contractPath,
      readFileSync("tests/fixtures/contracts/valid-agent-contract.md", "utf8")
        .replace("- Repository adoption mode: none", `- Repository adoption mode: ${token}`),
    );
    const issues = validateContract(contractPath, { print: false });
    assert.ok(issues.some((issue) => issue.includes("invalid Repository adoption mode")));
    assert.doesNotMatch(JSON.stringify(issues), /ghp_/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("repository research topics reject unknown scopes and ambiguous sentinels without echoing input", () => {
  const root = mkdtempSync(path.join(os.tmpdir(), "pritha-contract-repository-topics-"));
  const contractPath = path.join(root, "topics.md");
  const base = readFileSync("tests/fixtures/contracts/valid-agent-contract.md", "utf8");
  try {
    const credentialLike = `ghp_${"T".repeat(24)}`;
    writeFileSync(contractPath, base.replace(
      "- Repository research topics: none",
      `- Repository research topics: agent-memroy-${credentialLike}`,
    ));
    const unknownIssues = validateContract(contractPath, { print: false });
    assert.ok(unknownIssues.some((issue) => issue.includes("invalid Repository research topics")));
    assert.doesNotMatch(JSON.stringify(unknownIssues), /ghp_/);

    writeFileSync(contractPath, base.replace(
      "- Repository research topics: none",
      "- Repository research topics: auto, agent-memory",
    ));
    assert.ok(validateContract(contractPath, { print: false }).some((issue) => issue.includes("either allowlisted scopes or one sentinel")));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("contract module extracts structured contract data", () => {
  const data = contractData("tests/fixtures/contracts/valid-agent-contract.md");
  assert.equal(data.fm.type, "agent-contract");
  assert.equal(data.agentName, "Snapshot Agent");
  assert.equal(data.runtimeFamily, "codex-native");
  assert.equal(data.telegramMode, "none");
  assert.equal(data.repositoryResearchPolicy, "not-applicable");
  assert.equal(data.repositoryAdoptionMode, "none");
  assert.match(data.fingerprint, /^sha256:[a-f0-9]{64}$/);
  assert.ok(data.coreFunctions.length > 0);
});

test("contract section parser preserves every list item until the next peer heading", () => {
  const markdown = `### V1 core functions

- First function
- Second function

#### Nested note

- Nested evidence

### Deferred functions

- Later function
`;
  assert.deepEqual(sectionItems(markdown, "V1 core functions"), [
    "First function",
    "Second function",
    "Nested evidence",
  ]);
});

test("generated contracts keep sources and related as separate frontmatter fields", () => {
  const root = mkdtempSync(path.join(os.tmpdir(), "pritha-contract-frontmatter-"));
  try {
    const result = spawnSync("node", [
      "scripts/pritha.mjs",
      "init",
      "--name",
      "frontmatter-agent",
      "--mission",
      "Verify generated contract frontmatter",
      "--success",
      "Sources remain a list and related remains an object",
      "--repository-policy",
      "not-applicable",
      "--repository-waiver",
      "deterministic fixture only",
    ], {
      cwd: path.resolve("."),
      encoding: "utf8",
      env: { ...process.env, TECHSCOPE_ROOT: root },
    });
    assert.equal(result.status, 0, result.stderr || result.stdout);
    const contractsDir = path.join(root, "11_agents", "contracts");
    const contractPath = path.join(contractsDir, readdirSync(contractsDir).find((name) => name.endsWith("-agent-contract.md")));
    const contractText = readFileSync(contractPath, "utf8");
    const frontmatter = parseFrontmatterData(contractText);
    assert.ok(Array.isArray(frontmatter.sources));
    assert.ok(frontmatter.sources.includes("07_workflows/agents-mother.md"));
    assert.equal(typeof frontmatter.related, "object");
    assert.ok(Array.isArray(frontmatter.related.standards));
    assert.match(contractText, /^- Target folder: sibling of Pritha$/m);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("selected repository contracts require canonical provenance and immutable approval fields", () => {
  const root = mkdtempSync(path.join(os.tmpdir(), "pritha-selected-repository-contract-"));
  const contractPath = path.join(root, "selected.md");
  const base = readFileSync("tests/fixtures/contracts/valid-agent-contract.md", "utf8")
    .replace("- Repository research policy: not-applicable", "- Repository research policy: required")
    .replace("- Repository research topics: none", "- Repository research topics: agent-harness")
    .replace("- Selected GitHub repositories: none", "- Selected GitHub repositories: https://github.com/example/agent-kit")
    .replace("- Repository adoption mode: none", "- Repository adoption mode: selected-module")
    .replace("- Selected repository module: not-applicable", "- Selected repository module: packages/runtime-adapter")
    .replace("- Repository pin: not-applicable", "- Repository pin: commit:0123456789abcdef0123456789abcdef01234567")
    .replace("- Repository license decision: not-applicable", "- Repository license decision: MIT compatible and approved")
    .replace("- Repository security review: not-applicable", "- Repository security review: passed")
    .replace("- Repository permissions: not-applicable", "- Repository permissions: project folder filesystem read-only")
    .replace("- Repository eval status: not-applicable", "- Repository eval status: passed")
    .replace("- Repository user approval: not-applicable", "- Repository user approval: explicitly approved by user");
  try {
    writeFileSync(contractPath, base);
    assert.deepEqual(validateContract(contractPath, { print: false }), []);

    writeFileSync(contractPath, base.replace("commit:0123456789abcdef0123456789abcdef01234567", "main"));
    assert.ok(validateContract(contractPath, { print: false }).some((issue) => issue.includes("Repository pin must be a verified 40-hex")));

    for (const movingTag of ["tag:refs/heads/main", "tag:latest/v1", "tag:origin/main"]) {
      writeFileSync(contractPath, base.replace("commit:0123456789abcdef0123456789abcdef01234567", movingTag));
      assert.ok(validateContract(contractPath, { print: false }).some((issue) => issue.includes("Repository pin must be a verified 40-hex")), movingTag);
    }

    writeFileSync(contractPath, base.replace("https://github.com/example/agent-kit", "git@github.com:example/agent-kit.git"));
    assert.ok(validateContract(contractPath, { print: false }).some((issue) => issue.includes("canonical https://github.com")));

    writeFileSync(contractPath, base.replace(
      "https://github.com/example/agent-kit",
      "https://github.com/example/agent-kit; https://github.com/example/second-kit",
    ));
    assert.ok(validateContract(contractPath, { print: false }).some((issue) => issue.includes("exactly one selected GitHub repository")));

    const rejectedDecisions = [
      ["MIT compatible and approved", "MIT incompatible and rejected", "license decision"],
      ["Repository security review: passed", "Repository security review: failed", "security review"],
      ["Repository permissions: project folder filesystem read-only", "Repository permissions: unrestricted full access", "permissions"],
      ["Repository eval status: passed", "Repository eval status: failed", "eval status"],
      ["Repository user approval: explicitly approved by user", "Repository user approval: not approved", "positive user approval"],
      ["Repository research policy: required", "Repository research policy: not-applicable", "incompatible with selected-module"],
    ];
    for (const [from, to, expected] of rejectedDecisions) {
      writeFileSync(contractPath, base.replace(from, to));
      assert.ok(validateContract(contractPath, { print: false }).some((issue) => issue.toLowerCase().includes(expected)), expected);
    }
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("reference-only contracts bound selected repositories to a unique maximum of ten", () => {
  const root = mkdtempSync(path.join(os.tmpdir(), "pritha-reference-repository-limit-"));
  const contractPath = path.join(root, "reference.md");
  const base = readFileSync("tests/fixtures/contracts/valid-agent-contract.md", "utf8")
    .replace("- Repository research policy: not-applicable", "- Repository research policy: required")
    .replace("- Repository research topics: none", "- Repository research topics: agent-harness")
    .replace("- Repository adoption mode: none", "- Repository adoption mode: reference-only");
  try {
    const ten = Array.from({ length: 10 }, (_, index) => `https://github.com/example/reference-${index}`).join("; ");
    writeFileSync(contractPath, base.replace("- Selected GitHub repositories: none", `- Selected GitHub repositories: ${ten}`));
    assert.deepEqual(validateContract(contractPath, { print: false }), []);

    const eleven = `${ten}; https://github.com/example/reference-10`;
    writeFileSync(contractPath, base.replace("- Selected GitHub repositories: none", `- Selected GitHub repositories: ${eleven}`));
    assert.ok(validateContract(contractPath, { print: false }).some((issue) => issue.includes("at most 10")));

    const duplicate = "https://github.com/example/reference-0; https://github.com/EXAMPLE/reference-0/";
    writeFileSync(contractPath, base.replace("- Selected GitHub repositories: none", `- Selected GitHub repositories: ${duplicate}`));
    const duplicateIssues = validateContract(contractPath, { print: false });
    assert.ok(duplicateIssues.some((issue) => issue.includes("must not contain duplicates")));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("selected repositories require an explicit recognized adoption mode", () => {
  const root = mkdtempSync(path.join(os.tmpdir(), "pritha-repository-adoption-required-"));
  const contractPath = path.join(root, "missing-adoption.md");
  const selected = readFileSync("tests/fixtures/contracts/valid-agent-contract.md", "utf8")
    .replace("- Selected GitHub repositories: none", "- Selected GitHub repositories: https://github.com/example/reference")
    .replace(/^- Repository adoption mode:.*\n/m, "");
  try {
    writeFileSync(contractPath, selected);
    const missingModeIssues = validateContract(contractPath, { print: false });
    assert.ok(missingModeIssues.some((issue) => issue.includes("require Repository adoption mode reference-only or selected-module")));

    writeFileSync(contractPath, selected.replace(
      "- Selected GitHub repositories: https://github.com/example/reference",
      "- Selected GitHub repositories: https://github.com/example/reference\n- Repository adoption mode: unknown-mode",
    ));
    const unknownModeIssues = validateContract(contractPath, { print: false });
    assert.ok(unknownModeIssues.some((issue) => issue.includes("invalid Repository adoption mode")));
    assert.ok(unknownModeIssues.some((issue) => issue.includes("require Repository adoption mode reference-only or selected-module")));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("contract fingerprint ignores lifecycle metadata but changes with semantic contract fields", () => {
  const draft = readFileSync("tests/fixtures/contracts/valid-agent-contract.md", "utf8").replace("status: accepted", "status: draft");
  const accepted = draft.replace("status: draft", "status: accepted").replace(/updated: \d{4}-\d{2}-\d{2}/, "updated: 2026-07-13");
  assert.equal(contractFingerprint(draft), contractFingerprint(accepted));
  assert.notEqual(
    contractFingerprint(accepted),
    contractFingerprint(accepted.replace("- Runtime family: codex-native", "- Runtime family: cli")),
  );
});

test("selected repository decisions reject negation and wildcard permission forms", () => {
  for (const value of [
    "MIT incompatible",
    "MIT not compatible",
    "MIT not-approved",
    "MIT_not_approved",
    "MIT compatible, approval pending",
    "MIT compatible but unknown",
    "compatible and approved",
    "license compatible and approved",
  ]) {
    assert.equal(isRepositoryLicenseApproved(value), false, value);
  }
  for (const value of ["not approved", "not-approved", "approval denied", "without approval"]) {
    assert.equal(isExplicitRepositoryApproval(value), false, value);
  }
  for (const value of [
    "unrestricted full access",
    "filesystem=*",
    "filesystem=*,network=none",
    "network:any, filesystem:read",
    "filesystem:/**",
    "read/write all files",
    "bananas",
    "approved",
    "network",
    "filesystem",
    "shell",
    "secrets",
    "GitHub API network only; project folder filesystem read-only; approval pending",
  ]) {
    assert.equal(isRepositoryPermissionsBounded(value), false, value);
  }
  assert.equal(isRepositoryPermissionsBounded("project folder filesystem read-only; GitHub API network only"), true);
  for (const ambiguous of ["network bounded", "network specific", "network allowlisted", "tools specific", "filesystem read-only", "api write-only"]) {
    assert.equal(isRepositoryPermissionsBounded(ambiguous), false, ambiguous);
  }
  for (const contradictory of ["network not denied", "network not disabled", "shell denied false", "network enabled no access"]) {
    assert.equal(isRepositoryPermissionsBounded(contradictory), false, contradictory);
  }
  assert.equal(isRepositoryPermissionsBounded("no permissions required"), true);
});
