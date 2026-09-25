/**
 * ui-shot.mjs —— 快速 UI 截图 + 量尺寸（开发用）
 *
 * 设计目标是**快**，所以它只做一件事：对着**已经在跑的** server 出一张图。
 *   - 不启动 dev/prod server（那是分钟级冷编译，别塞进来；见 docs/pitfalls.md P-086）
 *   - 不连数据库、不写业务数据：全程只有 HTTP GET + 截图
 *   - 复用同一个浏览器 profile（默认在系统临时目录），第二次起 <1s
 *   - 固定等待换成密集轮询 + 早退；视口切换用 CDP 改窗口 + reload，一次启动跑完所有视口
 *   - spawn 出来的浏览器必须 unref + kill：否则子进程句柄吊着事件循环，命令永不返回（用户看到"卡住"）
 *
 * 用法（在 main/ 下）：
 *   pnpm dev                       # 另开一个终端先起服务
 *   pnpm shot /posts               # 桌面 + 窄屏各出一张，落在 main/.ui-shots/
 *   pnpm shot /admin --view desktop
 *   pnpm shot http://127.0.0.1:3000/posts --measure .post-card --json
 *
 * 参数：
 *   [path|url]            默认 /posts；给 path 时拼在 --base 后面
 *   --base <url>          默认 http://127.0.0.1:3000
 *   --out <dir>           默认 <main>/.ui-shots（已 gitignore）
 *   --view <desktop|mobile|both>   默认 both
 *   --width <px>          桌面宽，默认 1400；--m-width <px> 窄屏宽，默认 430
 *   --selector <css>      等到它出现再截图，默认 body
 *   --measure <css>       额外量这个选择器的尺寸（最多 12 个）
 *   --timeout <ms>        等选择器的上限，默认 20000
 *   --json                额外把结果写成同名 .json
 *
 * 依赖 Node ≥22（用全局 WebSocket 走 CDP）。浏览器取 UI_SHOT_BROWSER，否则自动找 Edge / Chrome。
 * 窄屏视口受浏览器最小窗口宽度限制（实测约 430–500px），正好落在项目 720px 的手机断点内。
 */
import { spawn } from "node:child_process";
import fs from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PROFILE_DIR = path.join(os.tmpdir(), "myblog-ui-shot-profile");
const BROWSER_CANDIDATES = [
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
  "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
];

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function parseArgs(argv) {
  const options = {
    target: "/posts",
    base: "http://127.0.0.1:3000",
    out: path.join(ROOT, ".ui-shots"),
    view: "both",
    width: 1400,
    mobileWidth: 430,
    height: 900,
    selector: "body",
    measure: null,
    timeout: 20_000,
    json: false,
  };

  const rest = [...argv];
  while (rest.length > 0) {
    const value = rest.shift();
    const next = () => {
      const item = rest.shift();
      if (item === undefined) {
        throw new Error(`${value} 缺参数`);
      }
      return item;
    };
    switch (value) {
      case "--base":
        options.base = next().replace(/\/$/, "");
        break;
      case "--out":
        options.out = path.resolve(ROOT, next());
        break;
      case "--view":
        options.view = next();
        break;
      case "--width":
        options.width = Number(next());
        break;
      case "--m-width":
        options.mobileWidth = Number(next());
        break;
      case "--height":
        options.height = Number(next());
        break;
      case "--selector":
        options.selector = next();
        break;
      case "--measure":
        options.measure = next();
        break;
      case "--timeout":
        options.timeout = Number(next());
        break;
      case "--json":
        options.json = true;
        break;
      default:
        if (value.startsWith("--")) {
          throw new Error(`未知参数 ${value}`);
        }
        options.target = value;
    }
  }
  return options;
}

function findBrowser() {
  const fromEnv = process.env.UI_SHOT_BROWSER?.trim();
  if (fromEnv) {
    return fromEnv;
  }
  for (const candidate of BROWSER_CANDIDATES) {
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }
  throw new Error("找不到 Edge/Chrome；用 UI_SHOT_BROWSER=<可执行文件路径> 指定");
}

function isPortFree(port) {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.once("error", () => resolve(false));
    server.once("listening", () => server.close(() => resolve(true)));
    server.listen(port, "127.0.0.1");
  });
}

async function pickPort() {
  for (let port = 9330; port < 9360; port += 1) {
    if (await isPortFree(port)) {
      return port;
    }
  }
  throw new Error("9330-9359 都被占用，先关掉别的调试实例");
}

async function waitForDevtools(port, timeoutMs) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/json/version`);
      if (response.ok) {
        return (await response.json()).webSocketDebuggerUrl;
      }
    } catch {
      /* 还没起来 */
    }
    await sleep(100);
  }
  throw new Error("浏览器 devtools 没起来");
}

/** 极简 CDP 客户端：够用即可（send + 90s 超时） */
class Cdp {
  constructor(ws) {
    this.ws = ws;
    this.seq = 0;
    this.pending = new Map();
    ws.addEventListener("message", (event) => {
      const message = JSON.parse(event.data);
      const entry = this.pending.get(message.id);
      if (!entry) {
        return;
      }
      this.pending.delete(message.id);
      if (message.error) {
        entry.reject(new Error(JSON.stringify(message.error)));
      } else {
        entry.resolve(message.result);
      }
    });
  }

  send(method, params = {}, sessionId) {
    const id = (this.seq += 1);
    const payload = { id, method, params };
    if (sessionId) {
      payload.sessionId = sessionId;
    }
    this.ws.send(JSON.stringify(payload));
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      setTimeout(() => {
        if (this.pending.delete(id)) {
          reject(new Error(`${method} 超时`));
        }
      }, 90_000);
    });
  }
}

function buildMeasure(selector, measureSelector) {
  return `(() => {
    const show = ${JSON.stringify(measureSelector)};
    const round = (value) => Math.round(value);
    const box = (element) => {
      const rect = element.getBoundingClientRect();
      return round(rect.width) + "x" + round(rect.height);
    };
    return JSON.stringify({
      viewport: window.innerWidth + "x" + window.innerHeight,
      scrollWidth: document.documentElement.scrollWidth,
      overflowX: document.documentElement.scrollWidth > window.innerWidth + 1,
      count: document.querySelectorAll(${JSON.stringify(selector)}).length,
      elements: show
        ? [...document.querySelectorAll(show)].slice(0, 12).map((element) => ({
            tag: element.tagName.toLowerCase(),
            cls: String(element.className || "").slice(0, 46),
            box: box(element),
            text: (element.textContent || "").trim().slice(0, 24),
          }))
        : null,
    });
  })()`;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const url = options.target.startsWith("http")
    ? options.target
    : options.base + options.target;
  const slug =
    new URL(url).pathname
      .replace(/^\/+|\/+$/g, "")
      .replace(/[^a-zA-Z0-9]+/g, "-") || "home";
  const views =
    options.view === "both"
      ? [
          ["desktop", options.width, options.height],
          [
            "mobile",
            options.view === "mobile" ? options.mobileWidth : options.mobileWidth,
            options.height,
          ],
        ]
      : [
          [
            options.view,
            options.view === "mobile" ? options.mobileWidth : options.width,
            options.height,
          ],
        ];

  // 先确认服务在跑，并顺手把路由编译热掉（dev server 的首次编译很贵）
  const started = Date.now();
  try {
    const warm = await fetch(url);
    if (!warm.ok) {
      throw new Error(`HTTP ${warm.status}`);
    }
  } catch (error) {
    throw new Error(
      `连不上 ${url}（${error instanceof Error ? error.message : error}）——先另开终端跑 pnpm dev`,
    );
  }
  const warmMs = Date.now() - started;

  fs.mkdirSync(options.out, { recursive: true });
  fs.mkdirSync(PROFILE_DIR, { recursive: true });
  // 上一次没退干净的锁文件会让 Chromium 直接卡住
  for (const lock of ["SingletonLock", "SingletonSocket", "SingletonCookie"]) {
    fs.rmSync(path.join(PROFILE_DIR, lock), { force: true });
  }

  const port = await pickPort();
  const browser = spawn(
    findBrowser(),
    [
      "--headless=new",
      `--remote-debugging-port=${port}`,
      `--user-data-dir=${PROFILE_DIR}`,
      "--no-first-run",
      "--no-default-browser-check",
      "--hide-scrollbars",
      "--disable-extensions",
      "about:blank",
    ],
    { stdio: "ignore", detached: true, windowsHide: true },
  );
  // 关键：detached 子进程句柄会一直吊着事件循环 → 脚本干完活也不退出，
  // 调用方（pnpm/pwsh，或 AI 的每次工具调用）就会一直等到被人工掐掉。
  browser.unref();

  const results = [];
  let cdp;
  try {
    const ws = new WebSocket(await waitForDevtools(port, 15_000));
    await new Promise((resolve, reject) => {
      ws.addEventListener("open", resolve, { once: true });
      ws.addEventListener("error", reject, { once: true });
    });
    cdp = new Cdp(ws);

    const { targetId } = await cdp.send("Target.createTarget", { url: "about:blank" });
    const { sessionId } = await cdp.send("Target.attachToTarget", {
      targetId,
      flatten: true,
    });
    const session = sessionId;
    await cdp.send("Page.enable", {}, session);
    await cdp.send("Runtime.enable", {}, session);
    const { windowId } = await cdp.send("Browser.getWindowForTarget", { targetId });

    const evaluate = async (expression) => {
      const result = await cdp.send(
        "Runtime.evaluate",
        { expression, awaitPromise: true, returnByValue: true },
        session,
      );
      if (result.exceptionDetails) {
        throw new Error(result.exceptionDetails.text);
      }
      return result.result.value;
    };

    for (const [name, width, height] of views) {
      const viewStart = Date.now();
      await cdp.send("Browser.setWindowBounds", {
        windowId,
        bounds: { width, height, windowState: "normal" },
      });
      await cdp.send("Page.navigate", { url }, session);

      let found = false;
      const deadline = Date.now() + options.timeout;
      while (Date.now() < deadline) {
        const count = await evaluate(
          `document.querySelectorAll(${JSON.stringify(options.selector)}).length`,
        );
        if (count > 0) {
          found = true;
          break;
        }
        await sleep(100);
      }
      if (!found) {
        throw new Error(`等 ${options.selector} 超过 ${options.timeout}ms 还没出现`);
      }

      // 字体落地 + 入场动画跑一下（短等，不做固定长睡）
      await evaluate("document.fonts.ready.then(() => true)");
      await sleep(400);

      const measured = JSON.parse(
        await evaluate(buildMeasure(options.selector, options.measure)),
      );
      const shot = await cdp.send("Page.captureScreenshot", { format: "png" }, session);
      const file = path.join(options.out, `${slug}-${name}.png`);
      fs.writeFileSync(file, Buffer.from(shot.data, "base64"));

      results.push({
        view: name,
        width,
        height,
        file,
        ms: Date.now() - viewStart,
        ...measured,
      });
    }

    await cdp.send("Browser.close");
  } finally {
    try {
      cdp?.ws.close();
    } catch {
      /* ignore */
    }
    // Browser.close 已经让它自己退；这里只兜底。
    // 注意 **不要**用 process.kill(-pid)：Windows 不支持负 PID（会抛错），
    // 于是浏览器留着不退、事件循环不结束 —— 表现就是"命令卡住两分钟"。
    try {
      browser.kill();
    } catch {
      /* ignore */
    }
  }

  console.log(`warm fetch ${warmMs}ms | 总耗时 ${Date.now() - started}ms`);
  for (const item of results) {
    const overflow = item.overflowX ? "  ⚠️ 横向溢出" : "";
    console.log(
      `[${item.view}] ${item.file}  ${item.viewport}  滚动宽 ${item.scrollWidth}${overflow}` +
        `  ${item.ms}ms  量了 ${item.elements?.length ?? 0} 个 ${options.measure ?? "元素"}`,
    );
    for (const element of item.elements ?? []) {
      console.log(`    ${element.tag}.${element.cls}  ${element.box}  ${element.text}`);
    }
  }
  if (options.json) {
    const file = path.join(options.out, `${slug}.json`);
    fs.writeFileSync(file, JSON.stringify({ url, results }, null, 2), "utf8");
    console.log(`json → ${file}`);
  }

  // 收尾硬退出：子进程已 unref、WS 已 close，但 undici 的 keep-alive 连接等句柄
  // 仍可能让事件循环多活几秒 —— 结果都落盘并打印完了，不等它。
  // 先把 stdout 冲干净（空写 + 回调），再 exit，避免 Windows 管道下截断输出。
  const hardExit = setTimeout(() => process.exit(0), 3000);
  hardExit.unref();
  await new Promise((resolve) => {
    if (process.stdout.writableLength === 0) {
      resolve();
      return;
    }
    process.stdout.write("", resolve);
  });
  process.exit(0);
}

main().catch((error) => {
  console.error(`[ui-shot] ${error instanceof Error ? error.message : error}`);
  process.exitCode = 1;
});
