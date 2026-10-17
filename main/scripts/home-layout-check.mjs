/**
 * home-layout-check.mjs —— 首页管理页的**交互式浏览器验证**（开发用）。
 *
 * 为什么不靠 `pnpm shot`：截图 + 量尺寸证明不了「拖到两个模块之间会插进去」「拖住边缘不动会一直滚」
 * 「松手后的落点 == 保存/刷新后的样子」。这里对着**已经在跑的** server 用 CDP 真的按住、真的移动、
 * 真的松手，每一步都用 DOM 几何与落点提示做判定。
 *
 * 用法（在 main/ 下；另开一个终端先 `pnpm dev`）：
 *   node scripts/home-layout-check.mjs                 # 全套（写测试布局，跑完还原格点表）
 *   node scripts/home-layout-check.mjs --keep-db        # 不还原（调试用）
 *   node scripts/home-layout-check.mjs --no-seed        # 不写测试布局，只跑只读判定
 *   node scripts/home-layout-check.mjs --section s2,s3  # 只跑指定小节
 *   node scripts/home-layout-check.mjs --headful        # 显示窗口（排查用）
 *
 * 登录态：复用 `pnpm shot` 的浏览器 profile（里面的 `myblog.session` cookie 是按 host 存的），
 * 所以默认走 `http://localhost:3000` —— 先在浏览器里登录过一次后台就是这个 host。会话过期时
 * 页面会停在登录页，脚本会明确报出来（不去猜账号密码）。
 *
 * ⚠️ 这会在**开发库**上真的改格点（HomePlacement）与模块 config（栏位 `pin`）。脚本开头把两者
 * 快照到系统临时目录，结束时逐行 UPDATE 还原（不删表、不迁移、不碰其它表），还原结果会打印核对。
 * 依赖 Node 22+（全局 WebSocket 做 CDP）。浏览器用 UI_SHOT_BROWSER，否则自动找 Edge / Chrome。
 */
import { spawn } from "node:child_process";
import fs from "node:fs";
import { createRequire } from "node:module";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DB_FILE = path.join(ROOT, "data", "blog.db");
const require = createRequire(import.meta.url);
/** better-sqlite3 main/node_modules 取（脚本main/ 下跑，不走应用层代码*/
function loadSqlite() {
  return require(path.join(ROOT, "node_modules", "better-sqlite3"));
}

/** 复用 `pnpm shot` 的浏览器 profile：里面已经有登录态（myblog.session*/
const PROFILE_DIR = path.join(os.tmpdir(), "myblog-ui-shot-profile");
const BROWSER_CANDIDATES = [
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
  "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
];

const DESKTOP = { width: 1440, height: 900 };
const MOBILE = { width: 390, height: 844 };

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** 落点安全区（**视觉** px）：比页面里的边缘自动滚动带（64）留出余量，免得松手前又被滚走 */
const SAFE_ZONE = 96;

function parseArgs(argv) {
  const options = {
    base: "http://localhost:3000",
    keepDb: false,
    seed: true,
    headful: false,
    sections: null,
    out: path.join(ROOT, ".ui-shots"),
  };
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
      case "--keep-db":
        options.keepDb = true;
        break;
      case "--no-seed":
        options.seed = false;
        break;
      case "--headful":
        options.headful = true;
        break;
      case "--section":
        options.sections = next().split(",").map((item) => item.trim().toLowerCase());
        break;
      default:
        throw new Error(`未知参数 ${key}`);
    }
  }
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
  for (let port = 9360; port < 9400; port += 1) {
    if (await isPortFree(port)) return port;
  }
  throw new Error("9360-9399 都被占用，先关掉别的调试实例");
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
  throw new Error("浏览器 devtools 没起来 —— 先另开一个终端跑 pnpm dev");
}

/** 极简 CDP 客户端（够用即可；与 ui-shot.mjs 同款，脚本刻意自包含*/
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

// ── 开发库快照 / 还原（只HomePlacement，逐行 UPDATE──────────────────────────
function snapshotPlacements() {
  const Database = loadSqlite();
  const db = new Database(DB_FILE, { readonly: true });
  try {
    return db.prepare("select * from HomePlacement order by id").all();
  } finally {
    db.close();
  }
}

function snapshotConfigs() {
  const Database = loadSqlite();
  const db = new Database(DB_FILE, { readonly: true });
  const rows = db
    .prepare("select id, config from HomeModule order by id")
    .all();
  db.close();
  return rows.map((row) => ({ id: row.id, config: row.config }));
}

function restoreConfigs(rows) {
  const Database = loadSqlite();
  const db = new Database(DB_FILE);
  const update = db.prepare("update HomeModule set config = ? where id = ?");
  db.transaction((items) => {
    for (const item of items) {
      update.run(item.config, item.id);
    }
  })(rows);
  db.close();
}

function restorePlacements(rows) {
  const Database = loadSqlite();
  const db = new Database(DB_FILE);
  try {
    const update = db.prepare(
      "update HomePlacement set enabled=?, col=?, colSpan=?, row=?, rowSpan=?, sort=?, hPct=?, mobileCol=?, mobileColSpan=?, mobileRow=?, mobileHPct=? where id=?",
    );
    const run = db.transaction((items) => {
      for (const item of items) {
        update.run(
          item.enabled,
          item.col,
          item.colSpan,
          item.row,
          item.rowSpan,
          item.sort,
          item.hPct,
          item.mobileCol,
          item.mobileColSpan,
          item.mobileRow,
          item.mobileHPct,
          item.id,
        );
      }
    });
    run(rows);
  } finally {
    db.close();
  }
}

/**
 * 写一份**确定版**测试布局（只 UPDATE HomePlacement；`--keep-db` 时不还原）。
 *
 * 版式（桌面 / 手机）：
 *   row1 banner 满宽 · row2 欢迎光临(6) + 相册卡片(6) · row3 文章卡片(9) + 右侧 widget(3 列, 堆叠 5 块)
 *   · row5 相册模块（呆在最下面，等着被插到 row2 与 row3 之间）。
 * 「运行时间」与「推荐应用」保持启用：它们**不该**出现在格点流里（S9 就查这个）。
 */
function seedPlacement() {
  const Database = loadSqlite();
  const db = new Database(DB_FILE);
  const rows = [
    // id, enabled, col, colSpan, row, hPct, mobileCol, mobileColSpan, mobileRow, mobileHPct
    [1, 1, 1, 12, 1, 0, 1, 12, 1, 0], // banner
    [2, 1, 1, 6, 2, 300, 1, 12, 2, 340], // welcome（固定高度：桌面 300 / 手机 340）
    [15, 1, 7, 6, 2, 380, 1, 12, 3, 380], // album-cards
    [5, 1, 1, 9, 3, 0, 1, 12, 4, 0], // posts（自适应）
    [6, 1, 10, 3, 3, 0, 1, 12, 5, 0], // announcement ┐
    [7, 1, 10, 3, 3, 0, 1, 12, 6, 0], // site         │ 同一格堆叠
    [8, 1, 10, 3, 3, 0, 1, 12, 7, 0], // categories   │
    [9, 1, 10, 3, 3, 0, 1, 12, 8, 0], // tags         │
    [10, 1, 10, 3, 3, 0, 1, 12, 9, 0], // recent      ┘
    [14, 1, 1, 12, 5, 250, 1, 12, 10, 200], // albums（待插入的那一块）
    [3, 0, 7, 6, 2, 380, 1, 12, 3, 340], // recommend 关闭
    [4, 0, 7, 6, 2, 380, 1, 12, 3, 340], // moments 关闭
    [11, 1, 1, 12, 9, 0, 1, 12, 11, 0], // uptime（页脚，不进格点）
    [12, 0, 9, 4, 1, 0, 1, 12, 12, 0], // popup 关闭
    [13, 1, 9, 4, 1, 0, 1, 12, 13, 0], // app-promo（覆盖层，不进格点）
  ];
  try {
    const update = db.prepare(
      "update HomePlacement set enabled=?, col=?, colSpan=?, row=?, hPct=?, mobileCol=?, mobileColSpan=?, mobileRow=?, mobileHPct=?, sort=? where moduleId=?",
    );
    const run = db.transaction((items) => {
      items.forEach((line, index) => {
        const [id, enabled, col, colSpan, lineRow, hPct, mCol, mSpan, mRow, mHPct] = line;
        update.run(enabled, col, colSpan, lineRow, hPct, mCol, mSpan, mRow, mHPct, index, id);
      });
    });
    run(rows);
  } finally {
    db.close();
  }
}

// ── 判定与打印 ───────────────────────────────────────────────────────────────
const results = [];
function check(section, name, ok, detail) {
  results.push({ section, name, ok, detail });
  const mark = ok ? "✅" : "❌";
  console.log(`${mark} [${section}] ${name}${detail ? `  —  ${detail}` : ""}`);
}

function info(message) {
  console.log(`   · ${message}`);
}

// ── 页面侧读────────────────────────────────────────────────────────────────
const READ_CELLS = (scope) => `(() => {
  const nodes = [...document.querySelectorAll(${JSON.stringify(scope)} + " [data-cell-module]")];
  const list = nodes.map((node) => {
    const rect = node.getBoundingClientRect();
    return {
      moduleId: Number(node.dataset.cellModule),
      cell: node.dataset.cell,
      banner: node.classList.contains("home-grid__cell--banner"),
      left: Math.round(rect.left * 10) / 10,
      top: Math.round(rect.top * 10) / 10,
      width: Math.round(rect.width * 10) / 10,
      height: Math.round(rect.height * 10) / 10,
      right: Math.round(rect.right * 10) / 10,
      bottom: Math.round(rect.bottom * 10) / 10,
    };
  });
  list.sort((a, b) => a.top - b.top || a.left - b.left);
  return JSON.stringify(list);
})()`;

/**
 * 相交的格子对。
 * Banner 那对是**前台故意叠出来的**（`.home-grid__area:has(.home-grid__cell--banner)`
 * 给下一行带 -64px 的负外边距，Hero 才会压住下面的卡片），所以默认把带 banner 的一对排除；
 * 要查「多出来的重叠」，用它当判定，别用肉眼。
 */
function overlapPairs(cells, { ignoreBanner = true, tolerance = 1.5 } = {}) {
  const pairs = [];
  for (let i = 0; i < cells.length; i += 1) {
    for (let j = i + 1; j < cells.length; j += 1) {
      const a = cells[i];
      const b = cells[j];
      if (ignoreBanner && (a.banner || b.banner)) {
        continue;
      }
      const dx = Math.min(a.right, b.right) - Math.max(a.left, b.left);
      const dy = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
      if (dx > tolerance && dy > tolerance) {
        pairs.push(`${a.moduleId}×${b.moduleId}(${Math.round(dx)}×${Math.round(dy)})`);
      }
    }
  }
  return pairs;
}

function cellOf(cells, moduleId) {
  return cells.find((cell) => cell.moduleId === moduleId) ?? null;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  /** 诊断小节：只`--section` 里点名时才跑（默认整洁，失败时再拿它们定位） */
  const DIAGNOSTIC_SECTIONS = new Set(["s2d", "s2p", "s2c"]);
  const only = (name) =>
    DIAGNOSTIC_SECTIONS.has(name)
      ? Boolean(options.sections?.includes(name))
      : !options.sections || options.sections.includes(name);

  console.log(`\n=== 首页管理画布验证（${options.base}）===`);
  try {
    const warm = await fetch(`${options.base}/admin/home`);
    if (warm.status !== 200) {
      throw new Error(`/admin/home 返回 HTTP ${warm.status}`);
    }
  } catch (error) {
    throw new Error(
      `连不上 ${options.base}/admin/home（${error instanceof Error ? error.message : error}）——先另开一个终端跑 pnpm dev`,
    );
  }

  let snapshot = null;
  let configSnapshot = null;
  if (options.seed || !options.keepDb) {
    snapshot = snapshotPlacements();
    // 栏位（`config.pin`）跟格点一起存 —用例会真的保存一次，所以模config 也要一起还原，
    // 否则「测试里选的侧面」会留在开发库里（用户下次打开就发现栏位变了）。
    configSnapshot = snapshotConfigs();
    const file = path.join(os.tmpdir(), `myblog-homeplacement-${Date.now()}.json`);
    fs.writeFileSync(file, JSON.stringify(snapshot, null, 2), "utf8");
    info(`格点表快照 ${snapshot.length} 行 → ${file}`);
  }
  if (options.seed) {
    seedPlacement();
    info("已写入确定版测试布局（跑完会还原）");
  }

  fs.mkdirSync(PROFILE_DIR, { recursive: true });
  for (const lock of ["SingletonLock", "SingletonSocket", "SingletonCookie"]) {
    fs.rmSync(path.join(PROFILE_DIR, lock), { force: true });
  }
  const port = await pickPort();
  const browser = spawn(
    findBrowser(),
    [
      options.headful ? "" : "--headless=new",
      `--remote-debugging-port=${port}`,
      `--user-data-dir=${PROFILE_DIR}`,
      "--no-first-run",
      "--no-default-browser-check",
      "--disable-extensions",
      `--window-size=${DESKTOP.width},${DESKTOP.height}`,
      "about:blank",
    ].filter(Boolean),
    { stdio: "ignore", detached: true, windowsHide: true },
  );
  browser.unref();

  let cdp = null;
  let session = null;
  let windowId = null;
  const consoleErrors = [];
  const dropDiag = [];

  const evaluate = async (expression) => {
    const result = await cdp.send(
      "Runtime.evaluate",
      { expression, awaitPromise: true, returnByValue: true },
      session,
    );
    if (result.exceptionDetails) {
      throw new Error(String(result.exceptionDetails.text));
    }
    return result.result.value;
  };
  const json = async (expression) => JSON.parse(await evaluate(expression));

  const setWindow = async (width, height) => {
    await cdp.send("Browser.setWindowBounds", {
      windowId,
      bounds: { width, height, windowState: "normal" },
    });
  };

  const goto = async (url, selector, timeout = 30_000) => {
    await cdp.send("Page.navigate", { url }, session);
    const deadline = Date.now() + timeout;
    while (Date.now() < deadline) {
      const count = await evaluate(
        `document.querySelectorAll(${JSON.stringify(selector)}).length`,
      );
      if (count > 0) return true;
      await sleep(120);
    }
    throw new Error(`等 ${selector} 超时（${url}）`);
  };

  const mouse = async (type, x, y, buttons) => {
    await cdp.send(
      "Input.dispatchMouseEvent",
      { type, x: Math.round(x), y: Math.round(y), button: "left", buttons, clickCount: 1 },
      session,
    );
  };

  /** 真的松开（`pressEscape` 的搭子：取消拖动用例要「按 Esc 后再松手」） */
  const pressEscape = async () => {
    await cdp.send(
      "Input.dispatchKeyEvent",
      {
        type: "keyDown",
        key: "Escape",
        code: "Escape",
        windowsVirtualKeyCode: 27,
        nativeVirtualKeyCode: 27,
      },
      session,
    );
    await cdp.send(
      "Input.dispatchKeyEvent",
      { type: "keyUp", key: "Escape", code: "Escape", windowsVirtualKeyCode: 27 },
      session,
    );
  };

  const cellRects = async (scope) => json(READ_CELLS(scope));

  try {
    const ws = new WebSocket(await waitForDevtools(port, 15_000));
    await new Promise((resolve, reject) => {
      ws.addEventListener("open", resolve, { once: true });
      ws.addEventListener("error", reject, { once: true });
    });
    cdp = new Cdp(ws);
    const { targetId } = await cdp.send("Target.createTarget", { url: "about:blank" });
    ({ sessionId: session } = await cdp.send("Target.attachToTarget", {
      targetId,
      flatten: true,
    }));
    await cdp.send("Page.enable", {}, session);
    await cdp.send("Runtime.enable", {}, session);
    await cdp.send("Log.enable", {}, session).catch(() => {});
    ({ windowId } = await cdp.send("Browser.getWindowForTarget", { targetId }));

    ws.addEventListener("message", (event) => {
      const message = JSON.parse(event.data);
      if (message.method === "Runtime.exceptionThrown") {
        consoleErrors.push(
          String(message.params?.exceptionDetails?.exception?.description ?? "").slice(0, 200),
        );
      }
      if (message.method === "Runtime.consoleAPICalled") {
        const text = (message.params?.args ?? [])
          .map((arg) => String(arg.value ?? ""))
          .join(" ");
        if (
          text.includes("[drop-diag]") ||
          text.includes("[commit-diag]") ||
          text.includes("[resize-diag]") ||
          text.includes("[resize-down]")
        ) {
          dropDiag.push(text.slice(0, 700));
          if (dropDiag.length > 8) {
            dropDiag.shift();
          }
        }
      }
    });

    await setWindow(DESKTOP.width, DESKTOP.height);
    await goto(
      `${options.base}/admin/home`,
      ".home-editor__device .home-grid__cell",
    );
    await sleep(600);

    // ── S1 会话与画布就───────────────────────────────────────────────────
    if (only("s1")) {
      const url = await evaluate("location.pathname");
      const hasLogin = await evaluate(
        `document.querySelectorAll('input[name="password"]').length > 0`,
      );
      check(
        "s1",
        "登录态可用（复用 pnpm shot 的浏览器 profile）",
        !hasLogin && url.startsWith("/admin"),
        `pathname=${url}${hasLogin ? "（停在登录页：先在浏览器里登录一次后台）" : ""}`,
      );
      const frame = await json(`(() => {
        const node = document.querySelector(".home-editor__device");
        return JSON.stringify({ width: node.clientWidth, height: node.clientHeight, scrollHeight: node.scrollHeight });
      })()`);
      check(
        "s1",
        "画框是设计视口真尺寸 1440×900",
        Math.abs(frame.width - 1440) <= 16 && Math.abs(frame.height - 900) <= 1,
        `clientWidth=${frame.width} clientHeight=${frame.height}`,
      );
    }

    /** *窗口**调到让页面视口正好是 targetW×targetH（headless 也有窗口边框，要迭代两轮*/
    const fitWindow = async (targetW, targetH) => {
      for (let attempt = 0; attempt < 4; attempt += 1) {
        const view = await json(
          `JSON.stringify({ w: window.innerWidth, h: window.innerHeight })`,
        );
        if (view.w === targetW && view.h === targetH) return view;
        await setWindow(targetW + (targetW - view.w), targetH + (targetH - view.h));
        await sleep(220);
      }
      return json(`JSON.stringify({ w: window.innerWidth, h: window.innerHeight })`);
    };

    const clickZoom = async (label) =>
      evaluate(
        `(() => {
          const button = [...document.querySelectorAll(".home-editor__zoom button")]
            .find((node) => node.textContent.trim() === ${JSON.stringify(label)});
          if (!button) return "missing";
          button.click();
          return "ok";
        })()`,
      );

    const clickViewport = async (label) =>
      evaluate(
        `(() => {
          const button = [...document.querySelectorAll(".home-editor__vp button")]
            .find((node) => node.textContent.trim() === ${JSON.stringify(label)});
          if (!button) return "missing";
          button.click();
          return "ok";
        })()`,
      );

    // ── S2 预览几何 = 前台几何 ──────────────────────────────────────────────
    if (only("s2")) {
      /**
       * 直连数据库改的格点不会经过应用的 `revalidatePublicContent()`，前台会继续吃缓 * （表现为「新启用的模块在前台根本没渲染」）。这里把当前格点原样 PUT 一— * 走的就是用户点「保存布局」那条路，顺手把公开缓存刷掉 */
      const syncPublicLayout = async () => {
        const result = await evaluate(`(async () => {
          const { token } = await (await fetch("/api/auth/csrf", { cache: "no-store" })).json();
          const current = await (await fetch("/api/admin/home/layout", { cache: "no-store" })).json();
          const response = await fetch("/api/admin/home/layout", {
            method: "PUT",
            headers: { "content-type": "application/json", "x-csrf-token": token },
            body: JSON.stringify({ items: current.data }),
          });
          return response.status + ":" + current.data.length;
        })()`);
        info(`公开缓存同步（PUT /api/admin/home/layout）→ ${result}`);
        return result;
      };
      await syncPublicLayout();

      const compare = (label, preview, front) => {
        const byId = new Map(front.map((cell) => [cell.moduleId, cell]));
        const widthIssues = [];
        const heightNotes = [];
        for (const cell of preview) {
          const same = byId.get(cell.moduleId);
          if (!same) {
            widthIssues.push(`${cell.moduleId} 只出现在预览`);
            continue;
          }
          if (Math.abs(cell.width - same.width) > 1.5) {
            widthIssues.push(`（${cell.moduleId}：${cell.width} vs ${same.width}）`);
          }
          const dw = Math.abs(cell.height - same.height);
          heightNotes.push(`${cell.moduleId}:${Math.round(cell.height)}/${Math.round(same.height)}${dw > 4 ? " ⚠️" : ""}`);
        }
        check(
          "s2",
          `${label}：每个模块的宽度与前台一致（≤1.5px）`,
          widthIssues.length === 0,
          widthIssues.join("；"),
        );
        info(`${label} 高度（预览/前台）：${heightNotes.join(" ")}`);
        const heightIssues = preview.filter((cell) => {
          const same = byId.get(cell.moduleId);
          return same && Math.abs(cell.height - same.height) > 24;
        });
        check(
          "s2",
          `${label}：每个模块的高度与前台接近（≤24px）`,
          heightIssues.length === 0,
          heightIssues
            .map((cell) => `${cell.moduleId} ${Math.round(cell.height)} vs ${Math.round(byId.get(cell.moduleId).height)}`)
            .join("；"),
        );
      };

      // 电脑：先把页面视口对齐到设计视口 1440×900
      const desktopView = await fitWindow(DESKTOP.width, DESKTOP.height);
      info(`电脑前台视口 ${desktopView.w}×${desktopView.h}`);
      await goto(`${options.base}/`, ".home-grid .home-grid__cell");
      await sleep(800);
      const frontDesktop = await cellRects(".home-grid:not([data-vp])");

      await goto(`${options.base}/admin/home`, ".home-editor__device .home-grid__cell");
      await sleep(500);
      await clickZoom("100%");
      await sleep(400);
      const previewDesktop = await cellRects(".home-editor__device");
      check(
        "s2",
        "电脑：前台与预览渲染同一批格点",
        previewDesktop.length === frontDesktop.length,
        `${previewDesktop.length} vs ${frontDesktop.length}`,
      );
      compare("电脑", previewDesktop, frontDesktop);

      // 手机：用 CDP 把设备视口改成 390×844（真机断点：max-width 959px 命中）
      await cdp.send(
        "Emulation.setDeviceMetricsOverride",
        {
          width: MOBILE.width,
          height: MOBILE.height,
          deviceScaleFactor: 1,
          mobile: true,
        },
        session,
      );
      await goto(`${options.base}/`, ".home-grid .home-grid__cell");
      await sleep(800);
      const frontMobile = await cellRects(".home-grid:not([data-vp])");
      await cdp.send("Emulation.clearDeviceMetricsOverride", {}, session);
      await sleep(200);

      await goto(`${options.base}/admin/home`, ".home-editor__device .home-grid__cell");
      await sleep(400);
      await clickViewport("手机");
      await clickZoom("100%");
      await sleep(500);
      const previewMobile = await cellRects(".home-editor__device");
      check(
        "s2",
        "手机：前台与预览渲染同一批格点",
        previewMobile.length === frontMobile.length,
        `${previewMobile.length} vs ${frontMobile.length}`,
      );
      compare("手机", previewMobile, frontMobile);

      await clickViewport("电脑");
      await clickZoom("适应");
      await sleep(200);
    }

    // ── S9 覆盖层与页脚运行时间不进格点────────────────────────────────────
    if (only("s9")) {
      const grid = await cellRects(".home-editor__device");
      const hasUptime = Boolean(cellOf(grid, 11));
      const hasPromo = Boolean(cellOf(grid, 13));
      check(
        "s9",
        "运行时间与覆盖层模块不在格点流里",
        !hasUptime && !hasPromo,
        `uptime=${hasUptime} app-promo=${hasPromo}`,
      );
      const slots = await json(`(() => {
        const float = document.querySelector('[data-float-module="13"]');
        const footer = document.querySelector(".home-editor__footer-band");
        return JSON.stringify({
          float: Boolean(float),
          floatPopup: Boolean(float && float.querySelector(".home-popup")),
          footer: Boolean(footer),
          footerUptime: Boolean(footer && footer.querySelector(".home-uptime, .widget")),
        });
      })()`);
      check(
        "s9",
        "覆盖层画在画框覆盖层里、运行时间画在页脚带里",
        slots.float && slots.floatPopup && slots.footer && slots.footerUptime,
        JSON.stringify(slots),
      );
    }

    // ── S2d 预览与前台「模块内部」的差异定位（诊断用，不是判定） ──────────────
    if (only("s2d")) {
      const probe = `(() => {
        const pick = (root, selector, props) => {
          const node = root.querySelector(selector);
          if (!node) return { selector, missing: true };
          const style = getComputedStyle(node);
          const out = { selector, box: Math.round(node.getBoundingClientRect().height) };
          for (const prop of props) out[prop] = style[prop];
          return out;
        };
        const root = document.querySelector(".home-grid");
        return JSON.stringify([
          pick(root, ".post-card", ["flexDirection", "width"]),
          pick(root, ".post-card__cover", ["width", "height"]),
          pick(root, ".widget", ["padding", "fontSize", "gap", "height"]),
          pick(root, ".widget__title", ["fontSize", "margin", "padding"]),
          pick(root, ".widget__list", ["gap", "fontSize"]),
          pick(root, ".weibo-item, .site-stats, .widget__row", ["fontSize"]),
        ]);
      })()`;

      await cdp.send(
        "Emulation.setDeviceMetricsOverride",
        { width: MOBILE.width, height: MOBILE.height, deviceScaleFactor: 1, mobile: true },
        session,
      );
      await goto(`${options.base}/`, ".home-grid .home-grid__cell");
      await sleep(700);
      const front = await json(probe);
      await cdp.send("Emulation.clearDeviceMetricsOverride", {}, session);
      await sleep(200);

      await goto(`${options.base}/admin/home`, ".home-editor__device .home-grid__cell");
      await sleep(400);
      await clickViewport("手机");
      await sleep(600);
      const preview = await json(probe);

      const keys = new Set([...front, ...preview].map((row) => row.selector));
      for (const key of keys) {
        const a = front.find((row) => row.selector === key);
        const b = preview.find((row) => row.selector === key);
        const diff = [];
        for (const prop of Object.keys(a ?? {})) {
          if (prop === "selector" || prop === "missing") continue;
          if (String(a?.[prop]) !== String(b?.[prop])) {
            diff.push(`${prop}: ${a?.[prop]} → ${b?.[prop]}`);
          }
        }
        console.log(`   · ${key}  ${diff.length ? diff.join(" | ") : "一致"}`);
      }
      await clickViewport("电脑");
    }

    // ── S2p 设计视口坐标映射自检（诊断用：落点为什么算歪了，看这里──────────
    if (only("s2p")) {
      const dump = `(() => {
        const frame = document.querySelector(".home-editor__device");
        const rect = frame.getBoundingClientRect();
        const scale = rect.width / frame.clientWidth || 1;
        const rows = [...frame.querySelectorAll("[data-cell-module]")].map((node) => {
          const r = node.getBoundingClientRect();
          return {
            id: Number(node.dataset.cellModule),
            cell: node.dataset.cell,
            top: Math.round((r.top - rect.top) / scale + frame.scrollTop),
            bottom: Math.round((r.bottom - rect.top) / scale + frame.scrollTop),
            height: Math.round(r.height / scale),
            position: getComputedStyle(node).position,
          };
        });
        return JSON.stringify({
          scale: Math.round(scale * 1000) / 1000,
          scrollTop: Math.round(frame.scrollTop),
          clientWidth: frame.clientWidth,
          contentHeight: frame.scrollHeight,
          rows,
        });
      })()`;
      for (const value of [0, 1200]) {
        await evaluate(`document.querySelector(".home-editor__device").scrollTop = ${value}`);
        await sleep(350);
        const data = await json(dump);
        console.log(
          `   · scrollTop=${data.scrollTop} scale=${data.scale} clientWidth=${data.clientWidth} contentHeight=${data.contentHeight}`,
        );
        for (const row of data.rows) {
          console.log(
            `     ${row.id} cell=${row.cell} 设计 top=${row.top} bottom=${row.bottom} h=${row.height} pos=${row.position}`,
          );
        }
      }
    }

    // ── S2c 找出「哪CSS 规则把预览里的元素改了样」（诊断用） ────────────────
    if (only("s2c")) {
      const dump = `(() => {
        const node = document.querySelector(".home-grid .pagination a");
        if (!node) return JSON.stringify({ missing: true });
        const hits = [];
        for (const sheet of document.styleSheets) {
          let rules = [];
          try {
            rules = [...sheet.cssRules];
          } catch {
            continue;
          }
          const walk = (list, media) => {
            for (const rule of list) {
              if (rule.cssRules) {
                walk([...rule.cssRules], rule.conditionText ?? media);
                continue;
              }
              if (!rule.selectorText || !rule.style) continue;
              const interesting = ["display", "height", "min-height", "align-items", "flex-wrap"].filter(
                (prop) => rule.style.getPropertyValue(prop),
              );
              if (interesting.length === 0) continue;
              if (!interesting.includes("display")) continue;
              let matches = false;
              try {
                matches = node.matches(rule.selectorText);
              } catch {
                matches = false;
              }
              if (!matches) continue;
              hits.push({
                sheet: (sheet.href ?? "inline").split("/").pop(),
                media: media ?? "",
                selector: rule.selectorText.slice(0, 90),
                decl: interesting.map((prop) => prop + ":" + rule.style.getPropertyValue(prop)).join(" "),
              });
            }
          };
          walk(rules, null);
        }
        return JSON.stringify(hits.slice(0, 12));
      })()`;
      const hits = await json(dump);
      console.log("   命中 .pagination a —— display/height 规则来自后台样式");
      for (const hit of hits) {
        console.log(`     ${hit.media ? `@${hit.media} ` : ""}${hit.selector}  { ${hit.decl} }   [${hit.sheet}]`);
      }
    }

    /** 拿某个模块手柄中心（画布坐标 = client 坐标*/
    const handleCenter = async (moduleId) =>
      json(`(() => {
        const node = document.querySelector('[data-cell-module="${moduleId}"] .home-editor__badge');
        if (!node) return "null";
        const rect = node.getBoundingClientRect();
        return JSON.stringify({ x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 });
      })()`);

    const frameRect = async () =>
      json(`(() => {
        const rect = document.querySelector(".home-editor__device").getBoundingClientRect();
        return JSON.stringify({ top: rect.top, bottom: rect.bottom, left: rect.left, right: rect.right });
      })()`);

    /**
     * 把某一格滚进画框视野（`place` = 它距画框上沿多少**设计** px）。
     * 用 rect 差值而不是 `offsetTop`：格子被 `position: relative` 的 area 夹着，
     * `offsetTop` 是相对那个 area 的，遇到单独成格的模块会算出 0，于是「以为滚了其实没滚」。
     * 坐标一律按「画框视觉宽 ÷ 画框 client 宽」换算成设计 px（zoom 怎么变都对）。
     */
    const revealCell = async (moduleId, place = 200) => {
      const value = await evaluate(`(() => {
        const frame = document.querySelector(".home-editor__device");
        const cell = frame.querySelector('[data-cell-module="${moduleId}"]');
        if (!cell) return -1;
        const frameRect = frame.getBoundingClientRect();
        const scale = frameRect.width / frame.clientWidth || 1;
        const target = frameRect.top + ${place} * scale;
        frame.scrollTop += (cell.getBoundingClientRect().top - target) / scale;
        return frame.scrollTop;
      })()`);
      await sleep(220);
      return value;
    };

    /**
     * 按下某个模块的拖拽手柄：先把它滚进视野（`place` = 距画框上沿多少设计 px），
     * 再核对落点确实落在画框可见区 —— 一屏放不下整个首页（Banner 就有 900px），
     * 不先滚就会「按在画框外，拖动根本没开始」。
     */
    const pressHandle = async (moduleId, place = 420) => {
      await revealCell(moduleId, place);
      const handle = await handleCenter(moduleId);
      const frame = await frameRect();
      const inside =
        Boolean(handle) &&
        handle.x > frame.left + 4 &&
        handle.x < frame.right - 4 &&
        handle.y > frame.top + 2 &&
        handle.y < frame.bottom - 2;
      if (!inside) {
        info(`⚠️ 手柄不在画框可见区：handle=${JSON.stringify(handle)} frame=${JSON.stringify(frame)}`);
      }
      await mouse("mouseMoved", handle.x, handle.y, 0);
      await mouse("mousePressed", handle.x, handle.y, 1);
      // 等按下触发的「让位补间」（FLIP，220ms）跑完再量目标：动画期间的 rect 是被
      // `transform` 挪过的，照着它算目标会整体偏几十像素（实测偏 88px，落点跑进隔壁格）。
      await sleep(340);
      return { handle, frame, inside };
    };

    const lastPointer = { x: 0, y: 0 };
    const moveMouse = async (x, y, buttons = 1) => {
      lastPointer.x = x;
      lastPointer.y = y;
      await mouse("mouseMoved", x, y, buttons);
    };

    const mouseToDesign = async (point) =>
      json(`(() => {
        const frame = document.querySelector(".home-editor__device");
        const rect = frame.getBoundingClientRect();
        const scale = rect.width / frame.clientWidth || 1;
        return JSON.stringify({
          x: Math.round((${point.x} - rect.left) / scale + frame.scrollLeft),
          y: Math.round((${point.y} - rect.top) / scale + frame.scrollTop),
          scrollTop: Math.round(frame.scrollTop),
        });
      })()`);

    /** 设计视口坐标 当前屏幕坐标（zoom / 滚动都会体现出来）*/
    const designToClient = async (point) =>
      json(`(() => {
        const frame = document.querySelector(".home-editor__device");
        const rect = frame.getBoundingClientRect();
        const scale = rect.width / frame.clientWidth || 1;
        return JSON.stringify({
          x: rect.left + (${point.x} - frame.scrollLeft) * scale,
          y: rect.top + (${point.y} - frame.scrollTop) * scale,
        });
      })()`);

    const designFrame = async (moduleId) =>
      json(`(() => {
        const frame = document.querySelector(".home-editor__device");
        const rect = frame.getBoundingClientRect();
        const scale = rect.width / frame.clientWidth || 1;
        const cell = document.querySelector('[data-cell-module="${moduleId}"]').getBoundingClientRect();
        const box = {
          top: (cell.top - rect.top) / scale + frame.scrollTop,
          bottom: (cell.bottom - rect.top) / scale + frame.scrollTop,
          left: (cell.left - rect.left) / scale + frame.scrollLeft,
          right: (cell.right - rect.left) / scale + frame.scrollLeft,
        };
        const all = [...frame.querySelectorAll("[data-cell-module]")].map((node) => {
          const r = node.getBoundingClientRect();
          return {
            top: (r.top - rect.top) / scale + frame.scrollTop,
            bottom: (r.bottom - rect.top) / scale + frame.scrollTop,
          };
        });
        return JSON.stringify({
          box,
          firstTop: Math.min(...all.map((item) => item.top)),
          lastBottom: Math.max(...all.map((item) => item.bottom)),
        });
      })()`);

    /**
     * 目标一律换算成**设计视口坐标**再交给拖拽：
     *
     * 必须这样 —拖动中的预览会重排（被拖的模块插进目标格，下面的格子整体下移），
     * 直接盯着 DOM rect 算目标，会跟着预览一起跑，落点永远追不上（实测偏 600px） * 设计坐标在按下那一刻就固定了，正是画布内部那套冻结模型的同一套坐标 */
    const designGap = async (upperId, lowerId, ratio = 0.5) => {
      const upper = await designFrame(upperId);
      const lower = await designFrame(lowerId);
      const y = Math.round(upper.box.bottom + (lower.box.top - upper.box.bottom) * ratio);
      info(
        `designGap(${upperId}, ${lowerId})：上 bottom=${Math.round(upper.box.bottom)}（${upperId} box ${Math.round(upper.box.top)}..${Math.round(upper.box.bottom)}）· 下 top=${Math.round(lower.box.top)}（${lowerId}）→ y=${y}`,
      );
      return { x: Math.round((upper.box.left + upper.box.right) / 2), y };
    };

    /** 整页最上沿之外 插到开头）。`anchorId` 只是取一次几何，真正用的是全局 first/lastTop*/
    const designAboveAll = async (anchorId) => {
      const { firstTop } = await designFrame(anchorId);
      return { x: 200, y: Math.round(firstTop - 20) };
    };

    const designBelowAll = async (anchorId) => {
      const { lastBottom } = await designFrame(anchorId);
      return { x: 200, y: Math.round(lastBottom + 20) };
    };

    /** 某一格里靠左上的一点（设计坐标）：用来把模块「并入」这一*/
    const designInsideCell = async (moduleId, offsetX = 40, offsetY = 30) => {
      const { box } = await designFrame(moduleId);
      return { x: Math.round(box.left + offsetX), y: Math.round(box.top + offsetY) };
    };

    /**
     * 把源模块滚到「让目标落在画框正中」的位置（`place` = 按下时它距画框上沿多少设计 px）。
     * 目标在视野里时整段拖拽就是一条直线，不用靠自动滚动 —— 落点判定更纯粹；
     * 目标确实在视野之外时（比如从页面最底下爬到第 2 行）才走边缘自动滚动那条路，
     * 那条路由 S6 单独盯。
     */
    const pressPlaceFor = async (moduleId, targetY) => {
      const { box } = await designFrame(moduleId);
      // 上限 700 是留给「边缘带」的：画框高 900，起点离下沿少于 64（设计 px 约 36）就会
      // 一按下就自动滚动、把方向带偏（实测偏 692px、落点掉进隔壁格）。
      return Math.max(120, Math.min(700, Math.round(box.top - (targetY - 450))));
    };

    /**
     * 一次真实拖拽：按下 → 盯住**设计坐标**目标（不在视野里就握住边缘等自动滚动）→ 精确落点 → 松手。
     * `designPoint` 在按下之后立刻算（此时预览还没动，DOM 就是当前位置），此后不再重算。
     */
    const dragTo = async (moduleId, designPointOf, { settle = 240, pressPlace = 420 } = {}) => {
      const { inside } = await pressHandle(moduleId, pressPlace);
      let frame = await frameRect();
      // 起点可能正好落在边缘带里（按下就自动滚），先挪到画框正中把滚动停掉，
      // 方向交给下面的循环统一决定 —— 否则「向外滚」与「目标方向」会打架。
      await moveMouse(frame.left + 180, (frame.top + frame.bottom) / 2, 1);
      await sleep(140);
      frame = await frameRect();
      const designPoint = await designPointOf();
      let client = await designToClient(designPoint);
      const upward = client.y < frame.top;
      const edgeY = upward ? frame.top - 24 : frame.bottom + 24;

      for (let guard = 0; guard < 60; guard += 1) {
        // 安全区按**视觉** px 算：边缘自动滚动带是 64 视觉 px，用设计 px 当余量会被 zoom 骗
        // （zoom 0.57 时 80 设计 px 只有 46 视觉 px，落在带里 → 松手前又被滚走，实测偏 588px）。
        if (client.y > frame.top + SAFE_ZONE && client.y < frame.bottom - SAFE_ZONE) {
          break;
        }
        await moveMouse(frame.left + 180, edgeY, 1);
        await sleep(150);
        frame = await frameRect();
        client = await designToClient(designPoint);
      }

      // 先离开边缘带（自动滚动当场停），再落到精确位置：否则最后一段里内容还在滚，
      // 指针实际压到的位置会偏上一两百像素（落点就成了「并入隔壁」）。
      await moveMouse(frame.left + 180, (frame.top + frame.bottom) / 2, 1);
      await sleep(260);
      frame = await frameRect();
      client = await designToClient(designPoint);
      // 还没进安全区（比如循环被上限打断）：按「滚轮」的方式直接把目标对到画框中间。
      // 用户拖长距离时也是这么干的（滚轮 / 边缘滚动），只是这里要一次到位、保证可复现。
      if (client.y < frame.top + SAFE_ZONE || client.y > frame.bottom - SAFE_ZONE) {
        await evaluate(`(() => {
          const frame = document.querySelector(".home-editor__device");
          const rect = frame.getBoundingClientRect();
          const scale = rect.width / frame.clientWidth || 1;
          const center = (rect.top + rect.bottom) / 2;
          frame.scrollTop += (${client.y} - center) / scale;
          return frame.scrollTop;
        })()`);
        await sleep(200);
        frame = await frameRect();
        client = await designToClient(designPoint);
      }
      await moveMouse(client.x, client.y, 1);
      await sleep(settle);

      // 松手前的落点提示就是解析结果本身（画HUD 与内部状态同一份数据）
      const hud = await evaluate(
        `document.querySelector(".home-editor__dragchip")?.textContent ?? ""`,
      );
      const landed = await mouseToDesign(client);
      info(
        `目标设计坐标 (${designPoint.x}, ${designPoint.y}) · 指针落点 (${landed.x}, ${landed.y}) · 落点：${hud.replace(/\s+/g, " ")}`,
      );
      await mouse("mouseReleased", client.x, client.y, 0);
      await sleep(300);
      if (dropDiag.length > 0) {
        info(`画布内部落点模型（最后一条）：${dropDiag[dropDiag.length - 1]}`);
        dropDiag.length = 0;
      }
      return { designPoint, landed, inside, hud };
    };

    const scrollTopOf = async () =>
      evaluate(`document.querySelector(".home-editor__device").scrollTop`);

    const scrollFrameTo = async (value) => {
      await evaluate(
        `(() => { const node = document.querySelector(".home-editor__device"); node.scrollTop = ${value}; return node.scrollTop; })()`,
      );
      await sleep(120);
    };

    // ── S3 插到两个模块之间 ─────────────────────────────────────────────────
    if (only("s3")) {
      const before = await cellRects(".home-editor__device");
      // 「相册」在最下面（row5），先握住它，靠边缘自动滚动爬到「相册卡片row2) 与「文章卡片row3) 之间
      const s3Drag = await dragTo(14, () => designGap(15, 5));
      const s3Hud = s3Drag.hud;

      const after = await cellRects(".home-editor__device");
      const overlaps = overlapPairs(after);
      check(
        "s3",
        "拖到两个模块之间后没有重叠",
        overlaps.length === 0,
        overlaps.join("；"),
      );
      const albums = cellOf(after, 14);
      const posts = cellOf(after, 5);
      const cards = cellOf(after, 15);
      check(
        "s3",
        "相册模块落在两个模块之间（相册卡片下、文章卡片上）",
        Boolean(albums && posts && cards) &&
          albums.top >= cards.bottom - 1 &&
          albums.bottom <= posts.top + 1,
        `albums top=${albums?.top} cards bottom=${cards?.bottom} posts top=${posts?.top}`,
      );
      check(
        "s3",
        "相册模块占满 12 列或并入同格（两种落点都是合法的，看 HUD 声明哪一种）",
        Boolean(albums) &&
          (() => {
            const [, , span] = (albums.cell ?? "").split(":").map(Number);
            const hud = String(s3Hud);
            if (hud.includes("并入")) {
              return span === (cellOf(after, 15)?.cell.split(":")[2] ?? 0);
            }
            return span === 12;
          })(),
        `data-cell=${albums?.cell} · HUD=${String(s3Hud).replace(/\s+/g, " ").slice(0, 60)}`,
      );
      info(`文档序：${after.map((cell) => `${cell.moduleId}@${cell.cell}`).join(" → ")}`);
      check(
        "s3",
        "格点数不变（没有模块被挤丢）",
        after.length === before.length,
        `${before.length} → ${after.length}`,
      );
    }

    // ── S4 同格中间插入 / 跨行 / 首尾 ────────────────────────────────────────
    if (only("s4")) {
      // 同格中间插入：把「公告6) 拖进右侧 widget 列（102 列），落在「分类8) 与「标签9) 之间
      {
        const spot = await designGap(8, 9);
        await dragTo(6, () => spot, { pressPlace: await pressPlaceFor(6, spot.y) });
      }
      const stack = await json(`(() => {
        const area = document.querySelector('[data-cell-module="8"]')?.parentElement;
        if (!area) return "[]";
        return JSON.stringify([...area.querySelectorAll("[data-cell-module]")].map((n) => Number(n.dataset.cellModule)));
      })()`);
      check(
        "s4",
        "同格中间插入：公告插到「分类」与「标签」之间",
        stack.join(",") === "7,8,6,9,10",
        `列内顺序 ${stack.join(" → ")}`,
      );
      const afterStack = await cellRects(".home-editor__device");
      check(
        "s4",
        "同格堆叠不重叠",
        overlapPairs(afterStack).length === 0,
        overlapPairs(afterStack).join("；"),
      );

      // 跨行移动：把「最近发布10) 从右widget 列（3 行）拖进「欢迎光临」那一格（2 行）
      {
        const spot = await designInsideCell(2, 40, 60);
        await dragTo(10, () => spot, { pressPlace: await pressPlaceFor(10, spot.y) });
      }
      const afterRow = await cellRects(".home-editor__device");
      const recent = cellOf(afterRow, 10);
      check(
        "s4",
        "跨行移动：最近发布落到第 2 行带、并入欢迎光临那一格（6 列）",
        Boolean(recent) &&
          recent.cell.split(":")[0] === "2" &&
          recent.cell.split(":")[2] === "6",
        `recent=${recent?.cell}`,
      );

      // 首尾：把相册模块拖到最上面 再拖到最下面
      await dragTo(14, () => designAboveAll(1));
      let cells = await cellRects(".home-editor__device");
      check(
        "s4",
        "移到开头：相册模块成为第一格",
        cells[0]?.moduleId === 14,
        `第一格 moduleId=${cells[0]?.moduleId}`,
      );
      // 末尾：落到所有格子下方（会触发向下自动滚动，正好也覆盖「拖到原本看不到的位置」）
      await dragTo(14, () => designBelowAll(5), { settle: 900 });
      cells = await cellRects(".home-editor__device");
      // 用**行号**判断末尾而不是视觉位置：右侧 widget 列是 sticky，滚动时会往下偏一点，
      // 按 top 排序会把它的格子排到最后（那是定位假象，不是文档序）。
      const maxRow = Math.max(
        ...cells.map((cell) => Number((cell.cell ?? "0:0:0").split(":")[0])),
      );
      const albumsLast = cellOf(cells, 14);
      check(
        "s4",
        "移到末尾：相册模块落在最后一行带",
        Boolean(albumsLast) && Number(albumsLast.cell.split(":")[0]) === maxRow,
        `albums=${albumsLast?.cell} 最大行=${maxRow}`,
      );
      check(
        "s4",
        "首尾移动后仍无重叠",
        overlapPairs(cells).length === 0,
        overlapPairs(cells).join("；"),
      );
    }

    // ── S5 固定/自适应混排 + 电脑手机高度互不影响 ────────────────────────────
    if (only("s5")) {
      /** 读左栏「当前选中模块」的输入框值（拖拽只改客户端状态，没点保存就不进库*/
      const railField = async (prefix) =>
        json(`(() => {
          const label = [...document.querySelectorAll(".home-editor__grid-fields label.admin-field")]
            .find((node) => node.textContent.trim().startsWith(${JSON.stringify(prefix)}));
          const input = label?.querySelector("input");
          return JSON.stringify({ found: Boolean(input), value: input ? Number(input.value) : null });
        })()`);

      const clickHeightMode = async (label) => {
        const result = await evaluate(`(() => {
          const button = [...document.querySelectorAll(".home-editor__height button")]
            .find((node) => node.textContent.trim() === ${JSON.stringify(label)});
          if (!button) return "missing";
          button.click();
          return "ok";
        })()`);
        await sleep(260);
        return result;
      };

      // 拖一下「欢迎光临」（桌面固定 300 / 手机 340）丢进「相册卡片」那一格附近，位置变、高度不许变
      await dragTo(2, () => designInsideCell(15, 40, 30));
      const desktopHeight = await railField("高度");
      check(
        "s5",
        "拖动后桌面高度原样（左栏 300）",
        desktopHeight.found && desktopHeight.value === 300,
        `高度=${desktopHeight.value}`,
      );
      await clickViewport("手机");
      await sleep(320);
      const mobileHeight = await railField("高度");
      const mobileWidth = await railField("宽度");
      check(
        "s5",
        "手机高度独立（左栏 340），且没被桌面值覆盖",
        mobileHeight.found && mobileHeight.value === 340 && mobileWidth.value === 12,
        `手机高度=${mobileHeight.value} 宽度=${mobileWidth.value}`,
      );
      await clickViewport("电脑");
      await sleep(320);

      // 固定高度真的落在内容上：量预览里格子的高度与「固定高度」一
      const cells = await cellRects(".home-editor__device");
      const welcomeCell = cellOf(cells, 2);
      const zoom = await evaluate(
        `Number(getComputedStyle(document.querySelector(".home-editor__device")).zoom) || 1`,
      );
      const scaled = welcomeCell ? welcomeCell.height / zoom : 0;
      check(
        "s5",
        "固定高度按像素作用于格子（300px）",
        Math.abs(scaled - 300) <= 2,
        `量到 ${Math.round(scaled)}px（zoom=${zoom}）`,
      );

      // 切换高度模式：自适应 格子不再被钉300；切回固又有固定高度
      await clickHeightMode("自适应");
      const autoCells = await cellRects(".home-editor__device");
      const autoHeight = autoCells.find((cell) => cell.moduleId === 2)?.height ?? 0;
      check(
        "s5",
        "切到自适应后高度由内容决定（不再是 300）",
        Math.abs(autoHeight / zoom - 300) > 8,
        `自适应量到 ${Math.round(autoHeight / zoom)}px`,
      );
      await clickHeightMode("固定");
      const fixedCells = await cellRects(".home-editor__device");
      const fixedHeight = fixedCells.find((cell) => cell.moduleId === 2)?.height ?? 0;
      const fixedField = await railField("高度");
      check(
        "s5",
        "切回固定后按左栏的像素高度生效",
        fixedField.found &&
          fixedField.value > 0 &&
          Math.abs(fixedHeight / zoom - fixedField.value) <= 2,
        `高度输入=${fixedField.value} · 量到 ${Math.round(fixedHeight / zoom)}px`,
      );

      // 改宽度：真的按住格子右缘的宽度手柄往右拖一格，不产生重
      await revealCell(2, 300);
      const widthBefore = await railField("宽度");
      const widthHandle = await json(`(() => {
        const node = document.querySelector('[data-cell-module="2"] .home-editor__resize.is-width');
        if (!node) return "null";
        const rect = node.getBoundingClientRect();
        const frame = document.querySelector(".home-editor__device");
        const frameRect = frame.getBoundingClientRect();
        const scale = frameRect.width / frame.clientWidth || 1;
        const x = rect.left + rect.width / 2;
        const y = rect.top + rect.height / 2;
        const hit = document.elementFromPoint(x, y);
        const rulers = [...document.querySelectorAll(".home-grid__ruler")].map((item) => {
          const box = item.getBoundingClientRect();
          return Math.round(box.left) + ".." + Math.round(box.right);
        });
        return JSON.stringify({
          x,
          y,
          step: 101.33 * scale,
          hit: hit ? hit.className : null,
          hittable: Boolean(node.contains(hit) || hit === node),
          rulerCount: rulers.length,
          rulerFirst: rulers[0] ?? null,
          rulerLast: rulers[rulers.length - 1] ?? null,
        });
      })()`);
      if (!widthHandle) {
        check("s5", "格子右缘有宽度手柄", false, "没找到 .home-editor__resize.is-width");
      } else {
        check(
          "s5",
          "宽度手柄在命中测试里点得到（没被裁掉）",
          widthHandle.hittable,
          `elementFromPoint → ${widthHandle.hit} · 标尺 ${widthHandle.rulerCount} 条 ${widthHandle.rulerFirst} … ${widthHandle.rulerLast}`,
        );
        await mouse("mouseMoved", widthHandle.x, widthHandle.y, 0);
        await mouse("mousePressed", widthHandle.x, widthHandle.y, 1);
        await sleep(80);
        for (let step = 1; step <= 6; step += 1) {
          await moveMouse(widthHandle.x - (widthHandle.step * step) / 6, widthHandle.y, 1);
          await sleep(25);
        }
        await sleep(180);
        await mouse("mouseReleased", widthHandle.x - widthHandle.step, widthHandle.y, 0);
        await sleep(320);
        const widthAfter = await railField("宽度");
        if (dropDiag.length > 0) {
          info(`宽度手柄诊断：${dropDiag.slice(-2).join(" | ")}`);
          dropDiag.length = 0;
        }
        // 往左拖一格 = 少一列（往右要看右边还有没有位置，被 clamp 挡住就测不出东西）。
        check(
          "s5",
          "拖动宽度手柄真的改了这一格（同格一起改）",
          widthAfter.found && widthAfter.value === widthBefore.value - 1,
          `宽度 ${widthBefore.value} → ${widthAfter.value}`,
        );
        const widened = await cellRects(".home-editor__device");
        const overlaps = overlapPairs(widened);
        check("s5", "改宽度后仍无重叠", overlaps.length === 0, overlaps.join("；"));
      }
    }

    // ── S6 边缘自动滚动 ─────────────────────────────────────────────────────
    if (only("s6")) {
      // 先按下「相册」模块的手柄（pressHandle 会把它滚进视野），再从一个「没到顶」的位置开始
      const { handle } = await pressHandle(14);
      const startScroll = await scrollTopOf();
      if (startScroll <= 0) {
        // 起点太靠上就先把内容往下滚一点，否则「向上滚动」没有观察空间
        await scrollFrameTo(260);
      }
      const base = await scrollTopOf();
      const frameTop = await frameRect();
      await mouse("mouseMoved", handle.x, frameTop.top + 12, 1);
      await sleep(120);
      const mid = await scrollTopOf();
      await sleep(700);
      const after = await scrollTopOf();
      const hud = await evaluate(
        `document.querySelector(".home-editor__dragchip")?.textContent ?? ""`,
      );
      check(
        "s6",
        "指针停在画框上沿不动，预览持续向上滚动",
        after < mid && mid <= base,
        `scrollTop ${base} → ${mid} → ${after}`,
      );
      info(`滚动中落点提示：${hud.replace(/\s+/g, " ")}`);

      // 移回画框中间 立即停止
      const stableBefore = await scrollTopOf();
      await mouse("mouseMoved", frameTop.left + 40, (frameTop.top + frameTop.bottom) / 2, 1);
      await sleep(120);
      const stableMid = await scrollTopOf();
      await sleep(500);
      const stableAfter = await scrollTopOf();
      check(
        "s6",
        "离开边缘带立即停止滚动",
        stableMid === stableAfter,
        `scrollTop ${stableBefore} → ${stableMid} → ${stableAfter}`,
      );

      // 下沿同样生效
      await mouse("mouseMoved", frameTop.left + 40, frameTop.bottom - 12, 1);
      await sleep(120);
      const downBefore = await scrollTopOf();
      await sleep(600);
      const downAfter = await scrollTopOf();
      check(
        "s6",
        "指针停在画框下沿不动，预览持续向下滚动",
        downAfter > downBefore,
        `scrollTop ${downBefore} → ${downAfter}`,
      );

      await mouse("mouseReleased", frameTop.left + 40, frameTop.bottom - 12, 0);
      await sleep(200);
      const afterRelease = await scrollTopOf();
      await sleep(400);
      const released = await scrollTopOf();
      check(
        "s6",
        "松手后停止滚动",
        afterRelease === released,
        `scrollTop ${afterRelease} → ${released}`,
      );
    }

    // ── S8 取消拖动还原原布局 ───────────────────────────────────────────────
    if (only("s8")) {
      const before = await cellRects(".home-editor__device");
      const { handle } = await pressHandle(14);
      const middle = await json(`(() => {
        const node = document.querySelector(".home-editor__device");
        const rect = node.getBoundingClientRect();
        return JSON.stringify({ x: rect.left + 80, y: rect.top + rect.height / 2 });
      })()`);
      for (let step = 1; step <= 6; step += 1) {
        await moveMouse(
          handle.x + ((middle.x - handle.x) * step) / 6,
          handle.y + ((middle.y - handle.y) * step) / 6,
          1,
        );
        await sleep(20);
      }
      await sleep(150);
      await pressEscape();
      await sleep(150);
      await mouse("mouseReleased", middle.x, middle.y, 0);
      await sleep(300);
      const after = await cellRects(".home-editor__device");
      // `moduleId:data-cell`（行列跨度）而不是屏幕坐标：S6 刚把画框滚过 // 绝对位置随滚动变化，按坐标比会把「滚了一下」误判成「布局变了」
      const fingerprint = (cells) =>
        cells.map((cell) => `${cell.moduleId}:${cell.cell}`).sort().join(" ");
      check(
        "s8",
        "Esc 取消拖动后布局原样",
        fingerprint(before) === fingerprint(after),
        `before=${fingerprint(before)} ↔ after=${fingerprint(after)}`,
      );
    }

    // ── S7 保存 + 刷新后一────────────────────────────────────────────────
    if (only("s7")) {
      await scrollFrameTo(0);
      const before = await cellRects(".home-editor__device");
      const stackBefore = await json(`(() => {
        const area = document.querySelector('[data-cell-module="8"]')?.parentElement;
        return JSON.stringify(area ? [...area.querySelectorAll("[data-cell-module]")].map((n) => Number(n.dataset.cellModule)) : []);
      })()`);
      const saved = await evaluate(`(() => {
        const button = [...document.querySelectorAll(".home-editor__rail-foot button")][0];
        if (!button || button.disabled) return "disabled";
        button.click();
        return "clicked";
      })()`);
      if (saved === "disabled") {
        check("s7", "有未保存改动可保存", false, "保存按钮是禁用的（前面的用例没产生改动？）");
      } else {
        await sleep(1500);
        await goto(`${options.base}/admin/home`, ".home-editor__device .home-grid__cell");
        await sleep(700);
        const after = await cellRects(".home-editor__device");
        const stackAfter = await json(`(() => {
          const area = document.querySelector('[data-cell-module="8"]')?.parentElement;
          return JSON.stringify(area ? [...area.querySelectorAll("[data-cell-module]")].map((n) => Number(n.dataset.cellModule)) : []);
        })()`);
        const sameOrder = before.map((cell) => cell.moduleId).join(",") === after.map((cell) => cell.moduleId).join(",");
        const sameCells =
          before.length === after.length &&
          before.every((cell, index) => after[index]?.cell === cell.cell);
        check(
          "s7",
          "刷新后格点顺序一致",
          sameOrder,
          `${before.map((c) => c.moduleId).join(",")} ↔ ${after.map((c) => c.moduleId).join(",")}`,
        );
        check(
          "s7",
          "刷新后行列跨度一致",
          sameCells,
          sameCells ? "" : `before=${before.map((c) => `${c.moduleId}:${c.cell}`).join(" ")}`,
        );
        check(
          "s7",
          "刷新后同格堆叠顺序一致（sort 已随保存落库）",
          stackBefore.join(",") === stackAfter.join(","),
          `${stackBefore.join(",")} ↔ ${stackAfter.join(",")}`,
        );
        const overlaps = overlapPairs(after);
        check(
          "s7",
          "刷新后没有重叠",
          overlaps.length === 0,
          overlaps.join("；"),
        );
      }
    }

    // ── S10 前台首页：滚动全程不重叠（侧固定栏目的核心回归） ───────────────
    if (only("s10")) {
      const scan = `(() => {
        const nodes = [...document.querySelectorAll(".home-grid:not([data-vp]) [data-cell-module]")];
        const list = nodes.map((node) => {
          const rect = node.getBoundingClientRect();
          const style = getComputedStyle(node.parentElement);
          return {
            moduleId: Number(node.dataset.cellModule),
            cell: node.dataset.cell,
            banner: node.classList.contains("home-grid__cell--banner"),
            side: node.parentElement.classList.contains("is-sticky"),
            position: style.position,
            top: Math.round(rect.top),
            bottom: Math.round(rect.bottom),
            left: Math.round(rect.left),
            right: Math.round(rect.right),
          };
        });
        return JSON.stringify({ scrollY: Math.round(window.scrollY), height: document.documentElement.scrollHeight, list });
      })()`;

      await setWindow(DESKTOP.width, DESKTOP.height);
      await fitWindow(DESKTOP.width, DESKTOP.height);
      await goto(`${options.base}/`, ".home-grid .home-grid__cell");
      await sleep(700);
      const total = await evaluate(`document.documentElement.scrollHeight`);
      const step = 600;
      let worst = [];
      const sideSeen = new Set();
      for (let y = 0; y <= total; y += step) {
        await evaluate(`window.scrollTo(0, ${y})`);
        await sleep(120);
        const frame = await json(scan);
        for (const cell of frame.list) {
          if (cell.side) {
            sideSeen.add(cell.moduleId);
          }
        }
        const pairs = overlapPairs(frame.list, { ignoreBanner: true, tolerance: 2 });
        if (pairs.length > 0) {
          worst.push(`scrollY=${frame.scrollY}: ${pairs.join("；")}`);
        }
      }
      check(
        "s10",
        "前台首页从头滚到底，模块之间没有多出来的重叠",
        worst.length === 0,
        worst.slice(0, 3).join(" | "),
      );
      info(`侧面（is-sticky）模块：${[...sideSeen].join(",") || "（无）"}`);
      await evaluate(`window.scrollTo(0, 0)`);
    }

    // ── S11 栏位：被占列挡住 → 一键并进来 → 设成侧面 → 保存 → 前台真的钉住 ──────
    if (only("s11")) {
      const railPinText = async () =>
        evaluate(
          `document.querySelector(".home-editor__pin .home-editor__tag")?.textContent?.trim() ?? ""`,
        );
      const clickRailButton = async (label) =>
        evaluate(`(() => {
          const scope = document.querySelector(".home-editor__pin");
          const button = scope
            ? [...scope.querySelectorAll("button")].find((node) => node.textContent.trim() === ${JSON.stringify(label)})
            : null;
          if (!button) return "missing";
          button.click();
          return button.disabled ? "disabled" : "ok";
        })()`);

      // ① 选中右侧那一列（分类/标签/最近发布所在格）：按一下手柄、**原地松手**（不拖动）
      const { handle } = await pressHandle(8, 420);
      await mouse("mouseReleased", handle.x, handle.y, 0);
      await sleep(320);
      const blockedText = await railPinText();
      check(
        "s11",
        "下面还有同列模块时，左栏明说「侧面被占列挡住」",
        blockedText.includes("挡住"),
        `栏位状态：${blockedText || "(空)"}`,
      );

      // 一键把下面这一列并进来
      const merged = await clickRailButton("把下面这一列的模块并进来");
      await sleep(320);
      const afterMerge = await railPinText();
      check(
        "s11",
        "点「并进来」之后不再被挡（成为这些列里的最后一格）",
        merged === "ok" && !afterMerge.includes("挡住"),
        `点击=${merged} · 栏位状态：${afterMerge || "(空)"}`,
      );

      // 设成「侧面」并保存
      const side = await clickRailButton("侧面");
      await sleep(200);
      const saved = await evaluate(`(() => {
        const button = [...document.querySelectorAll(".home-editor__rail-foot button")][0];
        if (!button || button.disabled) return "disabled";
        button.click();
        return "clicked";
      })()`);
      await sleep(1600);
      check(
        "s11",
        "设成侧面并保存",
        side === "ok" && saved === "clicked",
        `侧面=${side} 保存=${saved}`,
      );

      // ④ 前台：这一列真的钉住，且滚到底仍然不重叠
      await setWindow(DESKTOP.width, DESKTOP.height);
      await goto(`${options.base}/`, ".home-grid .home-grid__cell");
      await sleep(700);
      const sticky = await json(`(() => {
        const areas = [...document.querySelectorAll(".home-grid:not([data-vp]) .home-grid__area.is-sticky")];
        return JSON.stringify(areas.map((area) => [...area.querySelectorAll("[data-cell-module]")].map((n) => Number(n.dataset.cellModule))));
      })()`);
      check(
        "s11",
        "前台这一列是侧面（is-sticky），且包含并进来的模块",
        sticky.length === 1 && sticky[0].includes(8) && sticky[0].length >= 2,
        `侧面列：${JSON.stringify(sticky)}`,
      );
      const total = await evaluate(`document.documentElement.scrollHeight`);
      let overlaps = [];
      for (let y = 0; y <= total; y += 600) {
        await evaluate(`window.scrollTo(0, ${y})`);
        await sleep(120);
        const cells = await cellRects(".home-grid:not([data-vp])");
        overlaps = overlaps.concat(overlapPairs(cells, { ignoreBanner: true, tolerance: 2 }));
      }
      check("s11", "设成侧面后滚到底也不重叠", overlaps.length === 0, overlaps.slice(0, 3).join("；"));
      await evaluate(`window.scrollTo(0, 0)`);
    }

    if (consoleErrors.length > 0) {
      check("s1", "页面没有未捕获异常", false, consoleErrors.slice(0, 3).join(" | "));
    } else {
      check("s1", "页面没有未捕获异常", true, "");
    }

    // ── 收尾：还原格点表 **并把公开缓存刷回还原后的布局** ────────────────────
    //
    // 顺序很关键：脚本中途保存过一次布局，前台首页的公开缓存停在那份「测试布局」上；
    // 只把数据库还原回来，前台还是旧缓存（表现：用户关掉的模块在前台又出现了）。
    // 做法：还原库 → 让页面重新读一次（此时客户端状态 = 还原后的数据）→ 用应用自己的
    // 写入路径 PUT 一遍刷缓存 → 再精确还原一次库（PUT 会把行列规范成渲染坐标，
    // 视觉完全一致，但存储数值要按用户的快照放回去）。
    if (snapshot && !options.keepDb) {
      restorePlacements(snapshot);
      restoreConfigs(configSnapshot ?? []);
      let synced = "skipped";
      try {
        await goto(`${options.base}/admin/home`, ".home-editor__device .home-grid__cell");
        await sleep(400);
        synced = await evaluate(`(async () => {
          const { token } = await (await fetch("/api/auth/csrf", { cache: "no-store" })).json();
          const current = await (await fetch("/api/admin/home/layout", { cache: "no-store" })).json();
          const response = await fetch("/api/admin/home/layout", {
            method: "PUT",
            headers: { "content-type": "application/json", "x-csrf-token": token },
            body: JSON.stringify({ items: current.data }),
          });
          return response.status + ":" + current.data.length;
        })()`);
        restorePlacements(snapshot);
        restoreConfigs(configSnapshot ?? []);
      } catch (error) {
        synced = `failed: ${error instanceof Error ? error.message : error}`;
      }
      info(`公开缓存按还原后的格点重刷 → ${synced}`);

      const now = snapshotPlacements();
      const same =
        now.length === snapshot.length &&
        now.every((row, index) => {
          const before = snapshot[index];
          return (
            row.id === before.id &&
            row.enabled === before.enabled &&
            row.row === before.row &&
            row.col === before.col &&
            row.colSpan === before.colSpan &&
            row.hPct === before.hPct &&
            row.sort === before.sort &&
            row.mobileRow === before.mobileRow &&
            row.mobileCol === before.mobileCol &&
            row.mobileColSpan === before.mobileColSpan &&
            row.mobileHPct === before.mobileHPct
          );
        });
      check("db", "开发库格点表已还原（且公开缓存已按它重刷）", same, `核对 ${now.length} 行`);
    } else if (options.keepDb) {
      info("--keep-db：保留测试布局，没有还原");
    }

    await cdp.send("Browser.close").catch(() => {});
  } finally {
    try {
      cdp?.ws.close();
    } catch {
      /* ignore */
    }
    try {
      browser.kill();
    } catch {
      /* ignore */
    }
    // ⚠️ 还原必须在 `finally` 里：中途任何一个用例抛错（渲染报错、选择器变了…）都不能
    // 把「测试布局」留在开发库里 —— 之前就是这里漏了一次，下一次运行的快照把污染接了盘。
    if (snapshot && !options.keepDb) {
      try {
        restorePlacements(snapshot);
        restoreConfigs(configSnapshot ?? []);
        const now = snapshotPlacements();
        const same =
          now.length === snapshot.length &&
          now.every((row, index) => {
            const before = snapshot[index];
            return (
              row.id === before.id &&
              row.enabled === before.enabled &&
              row.row === before.row &&
              row.col === before.col &&
              row.colSpan === before.colSpan &&
              row.sort === before.sort &&
              row.hPct === before.hPct &&
              row.mobileRow === before.mobileRow &&
              row.mobileCol === before.mobileCol &&
              row.mobileColSpan === before.mobileColSpan &&
              row.mobileHPct === before.mobileHPct
            );
          });
        check("db", "开发库格点表已还原（finally 兜底）", same, `核对 ${now.length} 行`);
      } catch (error) {
        check("db", "开发库格点表已还原", false, String(error));
      }
    } else if (options.keepDb) {
      info("--keep-db：保留测试布局，没有还原");
    }
  }

  if (snapshot && !options.keepDb) {
    // 还原与缓存重刷已经在浏览器还开着的时候做完了（失败时由 finally 兜底）
  }

  const failed = results.filter((item) => !item.ok);
  console.log(
    `\n=== ${results.length - failed.length}/${results.length} 通过${failed.length ? `，失败 ${failed.length}` : ""} ===`,
  );
  for (const item of failed) {
    console.log(`❌ [${item.section}] ${item.name} — ${item.detail}`);
  }

  const hardExit = setTimeout(() => process.exit(failed.length ? 1 : 0), 2500);
  hardExit.unref();
  await new Promise((resolve) => process.stdout.write("", resolve));
  process.exit(failed.length ? 1 : 0);
}

main().catch((error) => {
  console.error(`[home-layout-check] ${error instanceof Error ? error.message : error}`);
  process.exitCode = 1;
});
