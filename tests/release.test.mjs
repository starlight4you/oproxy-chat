import test from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { releaseConfig } from "../scripts/release-config.mjs";
const directory=fileURLToPath(new URL("../build/",import.meta.url));
const identity="Developer ID Application: Example (TEAMID)",identities=`1) HASH "${identity}"`;
test("Public release refuses ad-hoc/development certificates and missing notarization",()=>{
  assert.throws(()=>releaseConfig({},identities,directory),/Developer ID/);
  assert.throws(()=>releaseConfig({OPROXY_SIGNING_IDENTITY:"Apple Development: Example"},identities,directory),/Developer ID/);
  assert.throws(()=>releaseConfig({OPROXY_SIGNING_IDENTITY:identity},identities,directory),/公证/);
  assert.throws(()=>releaseConfig({OPROXY_SIGNING_IDENTITY:identity,APPLE_ID:"example"},identities,directory),/不完整/);
});
test("Public release requires hardened runtime, signing and notarization in a distinct output directory",()=>{
  const result=releaseConfig({OPROXY_SIGNING_IDENTITY:identity,APPLE_KEYCHAIN_PROFILE:"test-profile"},identities,directory);
  assert.equal(result.forceCodeSigning,true);assert.equal(result.mac.hardenedRuntime,true);assert.equal(result.mac.notarize,true);
  assert.equal(result.directories.output,"dist/release");
});
