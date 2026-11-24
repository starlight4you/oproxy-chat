import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import assert from "node:assert/strict";
import asar from "@electron/asar";

const bundle = path.resolve(process.argv[2] || "dist/mac-arm64/Oproxy Chat.app");
const archive = path.join(bundle, "Contents/Resources/app.asar");
const localPackage = JSON.parse(fs.readFileSync("package.json"));
const packaged = JSON.parse(asar.extractFile(archive, "package.json"));
assert.equal(packaged.version, localPackage.version);
const sourceFiles = fs.readdirSync("src", { recursive: true }).filter(f => fs.statSync(path.join("src", f)).isFile()).map(f => `src/${f}`);
const files = sourceFiles.map(file => {
  const actual = asar.extractFile(archive, file);
  assert.ok(actual.equals(fs.readFileSync(file)), `Stale packaged source: ${file}`);
  return { file, sha256: crypto.createHash("sha256").update(actual).digest("hex") };
});
const entries = asar.listPackage(archive);
assert.ok(!entries.some(p => p.endsWith("/src/runtime.js")), "Legacy Python runtime must not be packaged");
for (const type of ["docx", "pdf", "xlsx", "pptx"]) assert.ok(entries.includes(`/src/skills/${type}.md`));
for (const dep of Object.keys(localPackage.dependencies)) assert.ok(entries.includes(`/node_modules/${dep}/package.json`), `Missing bundled dependency: ${dep}`);
console.log(JSON.stringify({ ok: true, bundle, version: packaged.version, files, dependencies: Object.keys(localPackage.dependencies) }, null, 2));
