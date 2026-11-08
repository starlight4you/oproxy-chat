const { execFileSync } = require("node:child_process");
const path = require("node:path");

/**
 * Ad-hoc sign the packaged app when no Developer ID is configured.
 * This keeps the bundle internally consistent (Info.plist + resources).
 * It does not make the app pass Gatekeeper on other machines; that still
 * requires a Developer ID certificate and notarization.
 */
exports.default = async function afterPack(context) {
  if (context.electronPlatformName !== "darwin") return;

  const configuredIdentity =
    context.packager.platformSpecificBuildOptions?.identity;
  if (configuredIdentity) return;

  const appName = context.packager.appInfo.productFilename;
  const appPath = path.join(context.appOutDir, `${appName}.app`);

  console.log(`Ad-hoc signing ${appPath}`);
  execFileSync("codesign", ["--force", "--deep", "--sign", "-", appPath], {
    stdio: "inherit",
  });
};
