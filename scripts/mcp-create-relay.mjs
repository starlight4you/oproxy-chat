const port = process.env.CDP_PORT || "9245";
const targetUrl = process.env.CDP_TARGET_URL || "chat.oproxy.world";
const relayUrl = process.env.RELAY_PUBLIC_URL;
const token = process.env.MCP_TOKEN;

if (!relayUrl || !token) {
  console.error("RELAY_PUBLIC_URL and MCP_TOKEN are required");
  process.exit(1);
}

const list = await fetch(`http://127.0.0.1:${port}/json/list`).then((r) =>
  r.json(),
);
const page = list.find(
  (target) => target.type === "page" && target.url.includes(targetUrl),
);
if (!page) throw new Error("page not found");

const ws = new WebSocket(page.webSocketDebuggerUrl);
let nextId = 0;
const pending = new Map();
let capturedAuthorization = null;
let resolveAuth;
const authPromise = new Promise((resolve) => {
  resolveAuth = resolve;
});

ws.addEventListener("message", (event) => {
  const message = JSON.parse(event.data);

  if (message.id && pending.has(message.id)) {
    const { resolve, reject } = pending.get(message.id);
    pending.delete(message.id);
    if (message.error) reject(new Error(JSON.stringify(message.error)));
    else resolve(message.result);
    return;
  }

  if (
    message.method === "Network.requestWillBeSent" &&
    message.params.request.url.includes("/api/mcp")
  ) {
    const headers = message.params.request.headers || {};
    const authorization = headers.Authorization || headers.authorization;
    if (authorization && !capturedAuthorization) {
      capturedAuthorization = authorization;
      resolveAuth(authorization);
    }
  }
});

await new Promise((resolve, reject) => {
  ws.addEventListener("open", resolve, { once: true });
  ws.addEventListener("error", reject, { once: true });
});

function send(method, params = {}) {
  const id = ++nextId;
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject });
    ws.send(JSON.stringify({ id, method, params }));
  });
}

await send("Network.enable");

const trigger = await send("Runtime.evaluate", {
  expression: `(() => { const item = [...document.querySelectorAll('[role="listitem"]')].find(e => e.innerText.includes('Oproxy Local MCP')); const btn = item?.querySelector('[aria-label="连接"]'); if (btn) btn.click(); return btn ? 'connect clicked' : 'connect not found'; })()`,
  returnByValue: true,
  awaitPromise: true,
});
console.log("TRIGGER", trigger.result?.value);

const authorization = await Promise.race([
  authPromise,
  new Promise((_, reject) =>
    setTimeout(() => reject(new Error("auth capture timeout")), 10_000),
  ),
]);

console.log("AUTH captured", authorization.slice(0, 20) + "...");

const body = {
  config: {
    type: "streamable-http",
    url: `${relayUrl}/mcp`,
    title: "Oproxy Local Relay",
    description: "Local MCP relay for Oproxy Chat.",
    apiKey: {
      source: "admin",
      authorization_type: "bearer",
      key: token,
    },
  },
};

const response = await fetch("https://chat.oproxy.world/api/mcp/servers", {
  method: "POST",
  headers: {
    Authorization: authorization,
    "Content-Type": "application/json",
    Accept: "application/json, text/plain, */*",
  },
  body: JSON.stringify(body),
  signal: AbortSignal.timeout(60_000),
});

console.log("CREATE", response.status);
console.log(String(await response.text()).slice(0, 4000));

ws.close();
