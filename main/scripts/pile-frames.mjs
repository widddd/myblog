/**
 * pile-frames.mjs —— 「一叠照片抽出」动画的**逐帧验证**（开发用，配 P-160）。
 *
 * 为什么不复用 `pnpm shot`：截图只能证明"画出来了、几何对"，证明不了"动画在跑、第几张什么时候动"。
 * 这里对着**已经在跑的** server 打开页面，从 document start 起用 rAF **每帧**记录每一层的
 * `getBoundingClientRect()`（相对一叠的容器）与计算样式，然后给判定：
 *
 *   首帧叠放 / 第一张不动 / 逐张补间 / 顺序递增 / 终态递增 / 过渡属性
 *
 * 用法（在 main/ 下；另开一个终端先 `pnpm dev`）：
 *   pnpm pile:frames                          # /albums，桌面 1400 + 手机 390 各跑一遍
 *   pnpm pile:frames /albums --view mobile --width 390 --width 412   # 只跑手机，390 与 412
 *   pnpm pile:frames / --view desktop --scroll .home-album-cards     # 首页「相册卡片」模块
 *   pnpm pile:frames /albums --reduced-motion                        # 终态直出、不该有补间
 *   pnpm pile:frames /albums --block "*thumbs2*"                     # 二级缩略图全 404 时仍要跑
 *
 * 参数：
 *   [path|url]             默认 /albums
 *   --base <url>           默认 http://127.0.0.1:3000
 *   --view <desktop|mobile|both>  默认 both
 *   --width <px>           可重复；桌面默认 1400，手机默认 390
 *   --height <px>          默认 900
 *   --reduced-motion       模拟 prefers-reduced-motion: reduce
 *   --block <pattern,...>  CDP 拦掉的 URL（如 *thumbs2*）
 *   --scroll <selector>    截图前把它滚进视野（首页模块常用）
 *   --out <dir>            截图目录，默认 <main>/.ui-shots（已 gitignore）
 *   --json                 把逐帧结果写到 <out>/<slug>-frames.json
 *   --wait <ms>            采样结束后额外等待，默认 3000
 *
 * 依赖 Node ≥22（全局 WebSocket 走 CDP）。浏览器取 UI_SHOT_BROWSER，否则自动找 Edge / Chrome。
 */
import { spawn } from "node:child_process";
import fs from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PROFILE_DIR = path.join(os.tmpdir(), "myblog-pile-frames-profile");
const BROWSER_CANDIDATES = [
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
  "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
];

/** 一叠的两个落点：/albums 列表卡与首页「相册卡片」模块（层选择器 + 它所在的一叠容器） */
const GROUPS = [
  { name: "list", layers: ".album-card__stack img", container: ".album-card__stack" },
  { name: "home", layers: ".home-album-cards__layer", container: ".home-album-cards__pile" },
];

/** 四个观察阶段（秒）：叠放 → 停留末 → 第二张起始 → 全部到位 */
const PHASES = [0.15, 1.0, 1.25, 1.6, 2.6];

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function parseArgs(argv) {
  const options = {
    target: "/albums",
    base: "http://127.0.0.1:3000",
    out: path.join(ROOT, ".ui-shots"),
    view: "both",
    widths: { desktop: [], mobile: [] },
    height: 900,
    reducedMotion: false,
    blocked: [],
    scroll: null,
    json: false,
    wait: 3000,
  };
  let lastView = "desktop";
  const rest = [...argv];
  while (rest.length > 0) {
    const key = rest.shift();
    const next = () => {
      const value = rest.shift();
      if (value === undefined) throw new Error(`${key} 缺参数`);
      return value;
    };
    switch (key) {
      case "--base":
        options.base = next().replace(/\/$/, "");
        break;
      case "--out":
        options.out = path.resolve(ROOT, next());
        break;
      case "--view":
        options.view = next();
        lastView = options.view === "both" ? "desktop" : options.view;
        break;
      case "--width":
        options.widths[lastView].push(Number(next()));
        break;
      case "--height":
        options.height = Number(next());
        break;
      case "--reduced-motion":
        options.reducedMotion = true;
        break;
      case "--block":
        options.blocked.push(...next().split(",").map((item) => item.trim()).filter(Boolean));
        break;
      case "--scroll":
        options.scroll = next();
        break;
      case "--json":
        options.json = true;
        break;
      case "--wait":
        options.wait = Number(next());
        break;
      default:
        if (key.startsWith("--")) throw new Error(`未知参数 ${key}`);
        options.target = key;
    }
  }
  if (options.widths.desktop.length === 0) options.widths.desktop.push(1400);
  if (options.widths.mobile.length === 0) options.widths.mobile.push(390);
  return options;
}

function findBrowser() {
  const fromEnv = process.env.UI_SHOT_BROWSER?.trim();
  if (fromEnv) return fromEnv;
  for (const candidate of BROWSER_CANDIDATES) {
    if (fs.existsSync(candidate)) return candidate;
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
  for (let port = 9370; port < 9410; port += 1) {
    if (await isPortFree(port)) return port;
  }
  throw new Error("9370-9409 都被占用，先关掉别的调试实例");
}

async function waitForDevtools(port, timeoutMs) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/json/version`);
      if (response.ok) return (await response.json()).webSocketDebuggerUrl;
    } catch {
      /* 还没起来 */
    }
    await sleep(100);
  }
  throw new Error("浏览器 devtools 没起来");
}

/** 极简 CDP 客户端（够用即可） */
class Cdp {
  constructor(ws) {
    this.ws = ws;
    this.seq = 0;
    this.pending = new Map();
    ws.addEventListener("message", (event) => {
      const message = JSON.parse(event.data);
      const entry = this.pending.get(message.id);
      if (!entry) return;
      this.pending.delete(message.id);
      if (message.error) entry.reject(new Error(JSON.stringify(message.error)));
      else entry.resolve(message.result);
    });
  }

  send(method, params = {}, sessionId) {
    const id = (this.seq += 1);
    const payload = { id, method, params };
    if (sessionId) payload.sessionId = sessionId;
    this.ws.send(JSON.stringify(payload));
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      setTimeout(() => {
        if (this.pending.delete(id)) reject(new Error(`${method} 超时`));
      }, 60_000);
    });
  }
}

/** 注入页面：从 document start 起每帧记录一次（位置取**相对一叠容器**的 rect） */
function samplerSource() {
  return `(() => {
  const GROUPS = ${JSON.stringify(GROUPS)};
  const samples = [];
  window.__pileSamples = samples;
  window.__pileMeta = null;
  const round = (value) => Math.round(value * 10) / 10;
  const record = () => {
    const time = performance.now();
    const row = { t: round(time) };
    for (const group of GROUPS) {
      const nodes = [...document.querySelectorAll(group.layers)];
      const container = nodes[0]?.closest(group.container) ?? null;
      const origin = container ? container.getBoundingClientRect().left : 0;
      row[group.name] = nodes.map((node) => {
        const rect = node.getBoundingClientRect();
        const style = getComputedStyle(node);
        return {
          left: round(rect.left - origin),
          width: round(rect.width),
          inlineLeft: style.left,
          transform: style.transform === "none" ? "" : style.transform,
          transition: style.transitionProperty,
          delay: style.transitionDelay,
        };
      });
    }
    samples.push(row);
    if (time < 10000) requestAnimationFrame(record);
  };
  window.__pileCollect = () => {
    window.__pileMeta = {
      reduced: matchMedia("(prefers-reduced-motion: reduce)").matches,
      viewport: window.innerWidth + "x" + window.innerHeight,
      frames: samples.length,
    };
    return true;
  };
  requestAnimationFrame(record);
})();`;
}

/** 把逐帧采样收成"每一层发生了什么" */
function analyze(samples, groupName) {
  const rows = samples.filter((row) => (row[groupName] ?? []).length > 0);
  if (rows.length === 0) return null;
  const layerCount = Math.max(...rows.map((row) => row[groupName].length));
  const layers = [];
  for (let index = 0; index < layerCount; index += 1) {
    const points = rows
      .map((row) => ({ layer: row[groupName][index], t: row.t }))
      .filter((entry) => Boolean(entry.layer))
      .map((entry) => ({ ...entry.layer, t: entry.t }));
    const moves = [];
    let previous = null;
    for (const point of points) {
      if (previous === null || Math.abs(point.left - previous) > 0.4) {
        moves.push({ t: point.t, left: point.left });
        previous = point.left;
      }
    }
    const afterFirst = moves.slice(1);
    layers.push({
      index,
      firstLeft: points[0]?.left,
      endLeft: points[points.length - 1]?.left,
      distinctLefts: new Set(points.map((point) => Math.round(point.left))).size,
      firstMoveT: afterFirst[0]?.t ?? null,
      lastMoveT: afterFirst[afterFirst.length - 1]?.t ?? null,
      transformStart: points[0]?.transform,
      transition: points[0]?.transition,
      delay: points[0]?.delay,
    });
  }
  return { frames: rows.length, layers };
}

/** 判定：把验收条件写成布尔（页面上会直接打印） */
function judge(group, reducedMotion) {
  const [first, ...rest] = group.layers;
  const sameStart = group.layers.every((layer) => Math.abs(layer.firstLeft - first.firstLeft) < 0.5);
  const still = first.distinctLefts === 1;
  return {
    首帧叠放: sameStart && !reducedMotion,
    第一张不动: still,
    逐张补间: reducedMotion ? rest.every((layer) => layer.distinctLefts === 1) : rest.every((layer) => layer.distinctLefts > 4),
    顺序递增: rest.every(
      (layer, position) => position === 0 || (layer.firstMoveT ?? 0) >= (rest[position - 1].firstMoveT ?? 0) - 40,
    ),
    终态递增: rest.every((layer, position) => position === 0 || layer.endLeft > rest[position - 1].endLeft),
    过渡: first.transition,
  };
}

async function runWidth(cdp, session, options, width, label, url) {
  await cdp.send(
    "Emulation.setDeviceMetricsOverride",
    { width, height: options.height, deviceScaleFactor: 1, mobile: width < 720 },
    session,
  );
  await cdp.send(
    "Emulation.setEmulatedMedia",
    {
      features: [
        {
          name: "prefers-reduced-motion",
          value: options.reducedMotion ? "reduce" : "no-preference",
        },
      ],
    },
    session,
  );
  await cdp.send("Network.setBlockedURLs", { urls: options.blocked }, session);

  const evaluate = async (expression) => {
    const result = await cdp.send(
      "Runtime.evaluate",
      { expression, awaitPromise: true, returnByValue: true },
      session,
    );
    if (result.exceptionDetails) throw new Error(result.exceptionDetails.text);
    return result.result.value;
  };
  const shot = async (name) => {
    const data = await cdp.send("Page.captureScreenshot", { format: "png" }, session);
    const file = path.join(options.out, `${label}-${name}.png`);
    fs.writeFileSync(file, Buffer.from(data.data, "base64"));
    return file;
  };

  await cdp.send("Page.navigate", { url }, session);
  const deadline = Date.now() + 60_000;
  let started = false;
  while (Date.now() < deadline) {
    if ((await evaluate("typeof window.__pileSamples !== 'undefined'")) === true) {
      started = true;
      break;
    }
    await sleep(100);
  }
  if (!started) {
    throw new Error("页面采样器没起来（页面是不是没渲染出来？）");
  }

  const shots = [];
  if (options.scroll) {
    await sleep(options.wait);
    await evaluate(
      `document.querySelector(${JSON.stringify(options.scroll)})?.scrollIntoView({block:"center"})`,
    );
    await sleep(300);
    shots.push(await shot("final"));
  } else {
    for (const phase of PHASES) {
      for (;;) {
        const now = await evaluate("performance.now()");
        if (now >= phase * 1000) break;
        await sleep(Math.min(50, Math.max(8, phase * 1000 - now)));
      }
      shots.push(await shot(`t${String(Math.round(phase * 1000)).padStart(4, "0")}ms`));
    }
    await sleep(Math.max(0, options.wait));
  }

  await evaluate("window.__pileCollect()");
  const meta = JSON.parse(await evaluate("JSON.stringify(window.__pileMeta)"));
  const samples = JSON.parse(await evaluate("JSON.stringify(window.__pileSamples)"));
  const report = { width, label, meta, groups: {}, verdict: {}, shots };
  for (const group of GROUPS) {
    const analyzed = analyze(samples, group.name);
    if (!analyzed) continue;
    report.groups[group.name] = analyzed;
    report.verdict[group.name] = judge(analyzed, options.reducedMotion);
  }
  return report;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const url = options.target.startsWith("http") ? options.target : options.base + options.target;
  const slug =
    new URL(url).pathname
      .replace(/^\/+|\/+$/g, "")
      .replace(/[^a-zA-Z0-9]+/g, "-") || "home";

  // 先确认服务在跑（不启服务、不碰库；首次编译交给这一下预热）
  const started = Date.now();
  try {
    const warm = await fetch(url);
    if (!warm.ok) throw new Error(`HTTP ${warm.status}`);
  } catch (error) {
    throw new Error(
      `连不上 ${url}（${error instanceof Error ? error.message : error}）——先另开终端跑 pnpm dev`,
    );
  }

  fs.mkdirSync(options.out, { recursive: true });
  fs.mkdirSync(PROFILE_DIR, { recursive: true });
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
  // spawn 出来的浏览器必须 unref + kill：否则子进程句柄吊着事件循环，命令永不返回（见 P-086）
  browser.unref();

  const reports = [];
  let cdpRef;
  try {
    const ws = new WebSocket(await waitForDevtools(port, 15_000));
    await new Promise((resolve, reject) => {
      ws.addEventListener("open", resolve, { once: true });
      ws.addEventListener("error", reject, { once: true });
    });
    const cdp = new Cdp(ws);
    cdpRef = cdp;
    const { targetId } = await cdp.send("Target.createTarget", { url: "about:blank" });
    const { sessionId } = await cdp.send("Target.attachToTarget", { targetId, flatten: true });
    await cdp.send("Page.enable", {}, sessionId);
    await cdp.send("Runtime.enable", {}, sessionId);
    await cdp.send("Network.enable", {}, sessionId);
    const { windowId } = await cdp.send("Browser.getWindowForTarget", { targetId });
    await cdp.send("Browser.setWindowBounds", {
      windowId,
      bounds: { width: 1400, height: options.height, windowState: "normal" },
    });
    await cdp.send("Page.addScriptToEvaluateOnNewDocument", { source: samplerSource() }, sessionId);

    const views = [];
    if (options.view === "both" || options.view === "desktop") {
      for (const width of options.widths.desktop) views.push(["desktop", width]);
    }
    if (options.view === "both" || options.view === "mobile") {
      for (const width of options.widths.mobile) views.push(["mobile", width]);
    }

    for (const [view, width] of views) {
      // label 里带上模式与屏蔽，免得两轮验证互相覆盖截图
      const suffix = `${options.reducedMotion ? "-rm" : ""}${options.blocked.length > 0 ? "-blocked" : ""}`;
      const report = await runWidth(
        cdp,
        sessionId,
        options,
        width,
        `${slug}-${view}-${width}${suffix}`,
        url,
      );
      reports.push(report);
    }

    await cdp.send("Browser.close");
  } finally {
    try {
      cdpRef?.ws.close();
    } catch {
      /* ignore */
    }
    try {
      browser.kill();
    } catch {
      /* ignore */
    }
  }

  console.log(
    `warm fetch ${Date.now() - started}ms | ${url}${options.reducedMotion ? " | prefers-reduced-motion: reduce" : ""}`,
  );
  for (const report of reports) {
    console.log(`\n[${report.label}] ${report.meta.viewport}  采样 ${report.meta.frames} 帧`);
    if (options.reducedMotion) {
      console.log(
        "  模式：prefers-reduced-motion = reduce —— 期望「首帧就是终态、每个层只有 1 个位置」" +
          "（所以 首帧叠放 这一项本来就该是 false）",
      );
    }
    for (const [name, verdict] of Object.entries(report.verdict)) {
      console.log(
        `  ${name}: 首帧叠放=${verdict.首帧叠放} 第一张不动=${verdict.第一张不动} ` +
          `逐张补间=${verdict.逐张补间} 顺序递增=${verdict.顺序递增} 终态递增=${verdict.终态递增} ` +
          `过渡=${verdict.过渡}`,
      );
      for (const layer of report.groups[name].layers) {
        console.log(
          `    第 ${layer.index} 张  left ${layer.firstLeft} → ${layer.endLeft}（${layer.distinctLefts} 个中间位置` +
            `${layer.firstMoveT === null ? "" : `，${Math.round(layer.firstMoveT)}ms 开始抽`}）延迟 ${layer.delay}`,
        );
      }
    }
    console.log(`  截图：${report.shots.map((file) => path.basename(file)).join(", ")}`);
  }
  if (options.json) {
    const file = path.join(options.out, `${slug}-frames.json`);
    fs.writeFileSync(file, JSON.stringify(reports, null, 2), "utf8");
    console.log(`json → ${file}`);
  }

  // 收尾硬退出（子进程已 unref、WS 已 close，但 undici 的 keep-alive 等句柄可能多活几秒）
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
  console.error(`[pile-frames] ${error instanceof Error ? error.message : error}`);
  process.exitCode = 1;
});
