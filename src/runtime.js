import { app, dialog, Notification, shell } from "electron";
import { execFile } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { promisify } from "node:util";
import { writePdf } from "./export.js";

const execFileAsync = promisify(execFile);

let cachedPython = null;

const PYTHON_CANDIDATES = [
  process.env.OPROXY_PYTHON,
  "/Library/Frameworks/Python.framework/Versions/3.13/bin/python3",
  "/Library/Frameworks/Python.framework/Versions/3.12/bin/python3",
  "/Library/Frameworks/Python.framework/Versions/3.11/bin/python3",
  "/Library/Frameworks/Python.framework/Versions/3.10/bin/python3",
  "/opt/homebrew/bin/python3",
  "/usr/local/bin/python3",
  "/usr/bin/python3",
  "python3",
].filter(Boolean);

const IMPORT_CHECK = [
  "-c",
  "import docx, reportlab, openpyxl, pptx, PIL; print('ok')",
];

const REQUIRED_PACKAGES = [
  "python-docx",
  "reportlab",
  "openpyxl",
  "python-pptx",
  "pillow",
];

function uniqueDownloadPath(filename) {
  const directory = app.getPath("downloads");
  const safeName = path.basename(filename || "download");
  const extension = path.extname(safeName);
  const baseName = path.basename(safeName, extension);
  let candidate = path.join(directory, safeName);
  let index = 1;

  while (fs.existsSync(candidate)) {
    candidate = path.join(directory, `${baseName} (${index})${extension}`);
    index += 1;
  }

  return candidate;
}

async function listFilesRecursive(directory) {
  const results = [];
  const entries = await fs.promises.readdir(directory, { withFileTypes: true });

  for (const entry of entries) {
    if (
      entry.name === "main.py" ||
      entry.name === "__pycache__" ||
      entry.name.startsWith(".")
    ) {
      continue;
    }

    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      results.push(...(await listFilesRecursive(fullPath)));
    } else if (entry.isFile()) {
      results.push(fullPath);
    }
  }

  return results;
}

function isRiskyCode(code) {
  return /\b(?:subprocess|os\.system|os\.popen|shutil\.rmtree|requests|urllib|socket|ftplib|paramiko)\b|rm\s+-rf|eval\(|exec\(|__import__|open\(\s*["']\//i.test(
    code,
  );
}

function showMessage(win, options) {
  return win ? dialog.showMessageBox(win, options) : dialog.showMessageBox(options);
}

async function ensurePythonEnvironment(win) {
  if (cachedPython) return cachedPython;

  for (const candidate of PYTHON_CANDIDATES) {
    try {
      await execFileAsync(candidate, IMPORT_CHECK, { timeout: 10_000 });
      cachedPython = candidate;
      return candidate;
    } catch {
      // Try the next Python installation.
    }
  }

  for (const candidate of PYTHON_CANDIDATES) {
    try {
      await execFileAsync(candidate, ["-c", "import sys; print(sys.version)"], {
        timeout: 10_000,
      });

      const { response } = await showMessage(win, {
        type: "info",
        title: "准备本地运行环境",
        message: "首次生成文档需要安装 Python 文档库",
        detail:
          "将安装 python-docx、reportlab、openpyxl、python-pptx 和 pillow，大约需要 1 分钟。",
        buttons: ["继续", "取消"],
        defaultId: 0,
        cancelId: 1,
      });

      if (response !== 0) return null;

      await execFileAsync(
        candidate,
        ["-m", "pip", "install", "--user", ...REQUIRED_PACKAGES],
        { timeout: 300_000 },
      );

      cachedPython = candidate;
      return candidate;
    } catch {
      // Try the next Python installation.
    }
  }

  return null;
}

export async function runLocalCode(payload, win) {
  if (!payload || typeof payload.code !== "string" || !payload.code.trim()) {
    return { ok: false, error: "没有可运行的代码。" };
  }

  if (payload.code.length > 200_000) {
    return { ok: false, error: "代码过长。" };
  }

  if (!/python/i.test(String(payload.language || "python"))) {
    return { ok: false, error: "目前只支持运行 Python 代码。" };
  }

  if (isRiskyCode(payload.code)) {
    const { response } = await showMessage(win, {
      type: "warning",
      title: "本地运行环境",
      message: "AI 生成的代码包含可能访问系统或网络的操作，是否继续运行？",
      detail: "代码会在临时目录中执行，生成的文件会保存到下载文件夹。",
      buttons: ["运行", "取消"],
      defaultId: 1,
      cancelId: 1,
    });

    if (response !== 0) {
      return { ok: false, error: "已取消运行。" };
    }
  }

  const python = await ensurePythonEnvironment(win);
  if (!python) {
    return {
      ok: false,
      error: "未找到可用的 Python 3 环境，或文档库安装失败。",
    };
  }

  const workDir = await fs.promises.mkdtemp(
    path.join(app.getPath("temp"), "oproxy-run-"),
  );
  const scriptPath = path.join(workDir, "main.py");
  await fs.promises.writeFile(scriptPath, payload.code, "utf8");

  try {
    const result = await execFileAsync(python, [scriptPath], {
      cwd: workDir,
      timeout: 120_000,
      maxBuffer: 10 * 1024 * 1024,
      env: { ...process.env, PYTHONIOENCODING: "utf-8" },
    });

    const generatedFiles = await listFilesRecursive(workDir);
    const filesToCopy = [...generatedFiles];

    const htmlFiles = generatedFiles.filter((file) => /\.html?$/i.test(file));
    for (const htmlFile of htmlFiles) {
      const pdfFile = htmlFile.replace(/\.html?$/i, ".pdf");
      try {
        const html = await fs.promises.readFile(htmlFile, "utf8");
        await writePdf(
          html.replace(/<script[\s\S]*?<\/script>/gi, ""),
          pdfFile,
        );

        filesToCopy.push(pdfFile);
        const htmlIndex = filesToCopy.indexOf(htmlFile);
        if (htmlIndex >= 0) filesToCopy.splice(htmlIndex, 1);
      } catch (error) {
        console.error("Failed to convert HTML to PDF", error);
      }
    }

    const savedFiles = [];

    for (const file of filesToCopy) {
      const destination = uniqueDownloadPath(path.basename(file));
      await fs.promises.copyFile(file, destination);
      savedFiles.push(destination);
    }

    if (savedFiles.length > 0) {
      shell.showItemInFolder(savedFiles[0]);

      try {
        if (Notification.isSupported()) {
          new Notification({
            title: "文档已生成",
            body: `${savedFiles
              .map((file) => path.basename(file))
              .join("、")} 已保存到下载文件夹`,
          }).show();
        }
      } catch {
        // Notifications are optional.
      }
    }

    return {
      ok: true,
      files: savedFiles,
      stdout: String(result.stdout || "").slice(-8000),
      stderr: String(result.stderr || "").slice(-8000),
    };
  } catch (error) {
    return {
      ok: false,
      error: String(error?.message || error),
      stdout: String(error?.stdout || "").slice(-8000),
      stderr: String(error?.stderr || "").slice(-8000),
    };
  } finally {
    await fs.promises
      .rm(workDir, { recursive: true, force: true })
      .catch(() => {});
  }
}
