import { createRequire } from "node:module";
import { mkdir, readdir, readFile, stat, writeFile } from "node:fs/promises";
import { mkdtempSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

const repoRoot = process.cwd();
const musicSourceRoot = path.join(repoRoot, "interfaces", "control-center", "src", "lib", "music");
const prithaPathsSource = path.join(repoRoot, "interfaces", "control-center", "src", "lib", "pritha-paths.ts");
let transpilePromise;

function loadTypeScript() {
  const controlCenterRequire = createRequire(path.join(repoRoot, "interfaces", "control-center", "package.json"));
  return controlCenterRequire("typescript");
}

async function collectTsFiles(dir) {
  const rows = await readdir(dir, { withFileTypes: true });
  const files = [];
  for (const row of rows) {
    const fullPath = path.join(dir, row.name);
    if (row.isDirectory()) {
      files.push(...(await collectTsFiles(fullPath)));
    } else if (row.isFile() && row.name.endsWith(".ts")) {
      files.push(fullPath);
    }
  }
  return files;
}

function rewriteTsImports(source) {
  return source
    .replace(/(from\s+["']\.[^"']*)\.ts(["'])/g, "$1.mjs$2")
    .replace(/(from\s+["']\.\.\/pritha-paths)(["'])/g, "$1.mjs$2");
}

async function transpileMusicModules() {
  const ts = loadTypeScript();
  const outRoot = mkdtempSync(path.join(os.tmpdir(), "pritha-control-center-ts-"));
  const files = await collectTsFiles(musicSourceRoot);
  for (const sourcePath of files) {
    const relativePath = path.relative(musicSourceRoot, sourcePath);
    const outPath = path.join(outRoot, relativePath.replace(/\.ts$/, ".mjs"));
    await mkdir(path.dirname(outPath), { recursive: true });
    const source = await readFile(sourcePath, "utf8");
    const compiled = ts.transpileModule(source, {
      compilerOptions: {
        target: ts.ScriptTarget.ES2022,
        module: ts.ModuleKind.ES2022,
        moduleResolution: ts.ModuleResolutionKind.Bundler,
        verbatimModuleSyntax: false,
      },
      fileName: sourcePath,
    });
    await writeFile(outPath, rewriteTsImports(compiled.outputText), "utf8");
  }
  const pathSource = await readFile(prithaPathsSource, "utf8");
  const pathCompiled = ts.transpileModule(pathSource, {
    compilerOptions: {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.ES2022,
      moduleResolution: ts.ModuleResolutionKind.Bundler,
      verbatimModuleSyntax: false,
    },
    fileName: prithaPathsSource,
  });
  await writeFile(path.join(path.dirname(outRoot), "pritha-paths.mjs"), pathCompiled.outputText, "utf8");
  return outRoot;
}

export async function importControlCenterMusicModule(relativePath) {
  transpilePromise ||= transpileMusicModules();
  const outRoot = await transpilePromise;
  const modulePath = path.join(outRoot, relativePath.replace(/\.ts$/, ".mjs"));
  const moduleStat = await stat(modulePath).catch(() => null);
  if (!moduleStat?.isFile()) throw new Error(`Missing transpiled Control Center music module: ${relativePath}`);
  return import(pathToFileURL(modulePath).href);
}
