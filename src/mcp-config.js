import { app } from "electron";
import { randomBytes } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

function configFile() {
  return path.join(app.getPath("userData"), "mcp-config.json");
}

export function loadMcpConfig() {
  try {
    const data = JSON.parse(fs.readFileSync(configFile(), "utf8"));
    const token =
      typeof data.token === "string" && data.token
        ? data.token
        : randomBytes(24).toString("hex");

    return {
      token,
      port: Number.isInteger(data.port) ? data.port : 3333,
      publicBaseUrl:
        typeof data.publicBaseUrl === "string"
          ? data.publicBaseUrl.replace(/\/$/, "")
          : "",
      relayUrl: typeof data.relayUrl === "string" ? data.relayUrl : "",
      relayToken:
        typeof data.relayToken === "string" && data.relayToken
          ? data.relayToken
          : token,
      relayTokenUrl:
        typeof data.relayTokenUrl === "string" ? data.relayTokenUrl : "",
      relayPublicUrl:
        typeof data.relayPublicUrl === "string"
          ? data.relayPublicUrl.replace(/\/$/, "")
          : "",
    };
  } catch {
    const token = randomBytes(24).toString("hex");
    return {
      token,
      port: 3333,
      publicBaseUrl: "",
      relayUrl: "",
      relayToken: token,
      relayTokenUrl: "",
      relayPublicUrl: "",
    };
  }
}

export function saveMcpConfig(config) {
  try {
    fs.mkdirSync(path.dirname(configFile()), { recursive: true });
    fs.writeFileSync(configFile(), JSON.stringify(config, null, 2));
  } catch (error) {
    console.error("Failed to save MCP config", error);
  }
}
