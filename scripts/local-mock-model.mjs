#!/usr/bin/env node
/**
 * Fully local OpenAI-compatible mock model for LibreChat.
 *
 * It exists only to exercise the MCP chain without an external model provider:
 *   LibreChat -> relay -> Oproxy Chat.app -> local MCP -> ~/Downloads
 *
 * First turn: return a tool call to one of the local document tools.
 * After the tool result arrives: return a short final answer.
 *
 * Run:
 *   node scripts/local-mock-model.mjs
 *   # listens on http://127.0.0.1:5555/v1
 */

import http from "node:http";

const PORT = Number(process.env.MOCK_MODEL_PORT || 5555);
const HOST = process.env.MOCK_MODEL_HOST || "127.0.0.1";
const MODEL = process.env.MOCK_MODEL_NAME || "mock-model";

function sendJson(res, status, value) {
  const body = JSON.stringify(value);
  res.writeHead(status, {
    "Content-Type": "application/json",
    "Content-Length": Buffer.byteLength(body),
  });
  res.end(body);
}

function completionId() {
  return `chatcmpl-mock-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
}

function documentType(prompt) {
  if (/pdf/i.test(prompt)) return "pdf";
  if (/excel|xlsx|表格|工作簿/i.test(prompt)) return "xlsx";
  if (/ppt|powerpoint|幻灯片|演示文稿/i.test(prompt)) return "pptx";
  return "docx";
}

function documentSpec(prompt) {
  const type = documentType(prompt);
  let title = "本地联调测试文档";
  let filename = `本地联调测试.${type}`;
  let content =
    "# 一、简介\n\n这是 LibreChat 全本地联调生成的测试文档。\n\n- 链路：LibreChat → 本地文档生成器\n- 文件保存在本机下载文件夹\n\n## 二、结论\n\n全本地链路正常。";

  if (type === "xlsx") {
    content =
      "# 测试数据\n\n| 项目 | 结果 |\n| --- | --- |\n| 链路 | 正常 |\n| 文件落盘 | 正常 |\n";
  } else if (type === "pptx") {
    content = "# 本地联调\n\n- LibreChat 全本地运行\n- 文档生成正常\n- 文件写入下载文件夹\n";
  }

  return { type, title, content, filename };
}

function toolArguments(prompt) {
  return JSON.stringify(documentSpec(prompt));
}

function pickTool(tools, prompt) {
  const available = (tools || [])
    .map((tool) => tool?.function?.name)
    .filter((name) => typeof name === "string");

  const wanted = `create_${documentType(prompt)}`;

  return (
    available.find((name) => name.includes(wanted)) ||
    available.find((name) => /create_(docx|pdf|xlsx|pptx)/.test(name)) ||
    null
  );
}

function finalText(messages) {
  const toolMessage = [...messages].reverse().find((m) => m?.role === "tool");
  const text =
    typeof toolMessage?.content === "string"
      ? toolMessage.content
      : "已通过本地 MCP 生成文档。";
  return `本地联调完成。\n\n${text}`;
}

function messageText(content) {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content
      .map((part) => {
        if (typeof part === "string") return part;
        if (part && typeof part.text === "string") return part.text;
        return "";
      })
      .join("\n");
  }
  return "";
}

function handleChat(req, res) {
  let raw = "";
  req.setEncoding("utf8");
  req.on("data", (chunk) => {
    raw += chunk;
  });
  req.on("end", () => {
    let body;
    try {
      body = JSON.parse(raw);
    } catch {
      sendJson(res, 400, { error: { message: "Invalid JSON" } });
      return;
    }

    const messages = Array.isArray(body.messages) ? body.messages : [];
    const userMessages = messages.filter((m) => m?.role === "user");
    const rawPrompt = messageText(userMessages.at(-1)?.content);
    // The desktop app appends a hidden runtime instruction to every message.
    // Ignore it so the mock chooses the format the user actually asked for.
    const prompt = rawPrompt
      .replace(
        /\[\[OPROXY_LOCAL_RUNTIME\]\][\s\S]*?\[\[\/OPROXY_LOCAL_RUNTIME\]\]/g,
        "",
      )
      .trim();
    if (!prompt) {
      console.log(
        "[mock-model] no prompt; messages tail",
        JSON.stringify(messages.slice(-4)).slice(0, 2000),
      );
    }
    const hasToolResult = (() => {
      const lastUserIndex = messages.findLastIndex((m) => m?.role === "user");
      return messages
        .slice(lastUserIndex + 1)
        .some((m) => m?.role === "tool");
    })();
    const stream = Boolean(body.stream);
    const id = completionId();
    const created = Math.floor(Date.now() / 1000);

    let message;
    let finishReason;
    if (hasToolResult) {
      message = { role: "assistant", content: finalText(messages) };
      finishReason = "stop";
    } else {
      const toolName = pickTool(body.tools, prompt);
      if (!toolName) {
        const spec = documentSpec(prompt);
        message = {
          role: "assistant",
          content: `\`\`\`oproxy-document\n${JSON.stringify(spec, null, 2)}\n\`\`\``,
        };
        finishReason = "stop";
      } else {
        message = {
          role: "assistant",
          content: null,
          tool_calls: [
            {
              id: `call_mock_${Date.now()}`,
              type: "function",
              function: {
                name: toolName,
                arguments: toolArguments(prompt),
              },
            },
          ],
        };
        finishReason = "tool_calls";
      }
    }

    console.log(
      `[mock-model] messages=${messages.length} tools=${(body.tools || []).length} ` +
        `toolResult=${hasToolResult} finish=${finishReason} ` +
        `prompt=${JSON.stringify(prompt.slice(0, 80))} ` +
        `tool=${message.tool_calls?.[0]?.function?.name || "none"}`,
    );

    if (!stream) {
      sendJson(res, 200, {
        id,
        object: "chat.completion",
        created,
        model: body.model || MODEL,
        choices: [{ index: 0, message, finish_reason: finishReason }],
        usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 },
      });
      return;
    }

    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    });

    const send = (delta, finish = null) => {
      res.write(
        `data: ${JSON.stringify({
          id,
          object: "chat.completion.chunk",
          created,
          model: body.model || MODEL,
          choices: [{ index: 0, delta, finish_reason: finish }],
        })}\n\n`,
      );
    };

    if (message.tool_calls) {
      send({ role: "assistant", content: null });
      const call = message.tool_calls[0];
      send({
        tool_calls: [
          {
            index: 0,
            id: call.id,
            type: "function",
            function: { name: call.function.name, arguments: "" },
          },
        ],
      });
      send({
        tool_calls: [
          {
            index: 0,
            function: { arguments: call.function.arguments },
          },
        ],
      });
      send({}, "tool_calls");
    } else {
      send({ role: "assistant", content: message.content });
      send({}, "stop");
    }

    res.write("data: [DONE]\n\n");
    res.end();
  });
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url || "/", "http://127.0.0.1");

  if (req.method === "GET" && url.pathname === "/v1/models") {
    sendJson(res, 200, {
      object: "list",
      data: [
        {
          id: MODEL,
          object: "model",
          created: Math.floor(Date.now() / 1000),
          owned_by: "local",
        },
      ],
    });
    return;
  }

  if (req.method === "POST" && url.pathname === "/v1/chat/completions") {
    handleChat(req, res);
    return;
  }

  if (req.method === "GET" && url.pathname === "/health") {
    sendJson(res, 200, { ok: true, model: MODEL });
    return;
  }

  sendJson(res, 404, { error: { message: "Not found" } });
});

server.listen(PORT, HOST, () => {
  console.log(`[mock-model] listening on http://${HOST}:${PORT}/v1 (${MODEL})`);
});
