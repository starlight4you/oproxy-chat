import fs from "node:fs";

const port = process.env.CDP_PORT || "9222";
const list = await fetch(`http://127.0.0.1:${port}/json/list`).then((r) =>
  r.json(),
);
const page = list.find((target) => target.type === "page");
if (!page) {
  throw new Error("No page target found");
}

const ws = new WebSocket(page.webSocketDebuggerUrl);
let nextId = 0;
const pending = new Map();

ws.addEventListener("message", (event) => {
  const message = JSON.parse(event.data);
  if (!message.id || !pending.has(message.id)) return;
  const { resolve, reject } = pending.get(message.id);
  pending.delete(message.id);
  if (message.error) reject(new Error(JSON.stringify(message.error)));
  else resolve(message.result);
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

const args = process.argv.slice(2);
const screenshotIndex = args.indexOf("--screenshot");
if (screenshotIndex !== -1) {
  const output = args[screenshotIndex + 1] || "/tmp/oproxy-chat.png";
  const { data } = await send("Page.captureScreenshot", {
    format: "png",
    captureBeyondViewport: false,
  });
  fs.writeFileSync(output, Buffer.from(data, "base64"));
  console.log(JSON.stringify({ screenshot: output, page: page.url, title: page.title }));
} else {
  const expression =
    args[0] || "JSON.stringify({ title: document.title, url: location.href })";
  const result = await send("Runtime.evaluate", {
    expression,
    returnByValue: true,
    awaitPromise: true,
  });
  console.log(
    JSON.stringify(result.result?.value ?? result, null, 2),
  );
}

ws.close();
