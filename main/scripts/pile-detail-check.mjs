/**
 * pile-detail-check.mjs —— 相册详情「一叠照片」的**真浏览器几何验收**（开发用）。
 *
 * 为什么单测之外还要这一遍：`photo-pile.test.ts` 证明的是**算术**，证明不了
 * 「组件真的把它写进了 DOM、写进 DOM 之后没被别的东西压回去」（历史教训见 P-160：
 * 终态写进首帧、整叠铺满画框，两处都是"算对了但看不见"）。
 *
 * 判定（竖屏 / 窄屏 ≤720px = 随手叠放、往下错，2026-10-07 用户需求）：
 *   1. 折叠态：档位越深越低（视觉中心按 z 严格递增）、最上面那张基本摆正、底下各张明显歪着
 *      （2°–7°、各不相同）且左右错开、每张旋转后都完整落在容器里（不被 overflow 裁掉）；
 *   2. 换张（左右滑动，横竖两支都跑）：最上面那张换人、层数不变、换完仍满足折叠态判定；
 *   3. 展开态：`data-axis="y"` 一行一张、容器高 = 各张高 + 10 的行距；
 *   4. 对照项：≥721px 折叠态仍是**同心叠放**（与 demo 一致：各层 left 相等、有旋转缩放），
 *      展开态是 `data-axis="x"` 的一行。
 *
 * 用法（另开一个终端先 `pnpm dev`）：
 *   node scripts/pile-detail-check.mjs                       # 390 / 412 竖屏 + 1400 对照
 *   node scripts/pile-detail-check.mjs --width 390           # 只跑一档
 *   node scripts/pile-detail-check.mjs --base http://127.0.0.1:3000 --path /albums/sakura
 *   node scripts/pile-detail-check.mjs --out .ui-shots       # 截图目录（默认 <main>/.ui-shots）
 *
 * 截图落在 `--out`（已 gitignore）：`pile-detail-<宽>-<阶段>.png`。
 * 依赖 Node ≥22（全局 WebSocket 走 CDP）。浏览器取 `UI_SHOT_BROWSER`，否则自动找 Edge / Chrome。
 */
import { spawn } from "node:child_process";
import fs from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PROFILE_DIR = path.join(os.tmpdir(), "myblog-pile-detail-profile");
const BROWSER_CANDIDATES = [
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
  "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
];

/** 竖屏随手叠放的倾角口径（与 lib/albums/photo-pile.ts 的 LOOSE_PILE 同一口径） */
const LOOSE = { topTilt: 1.2, minTilt: 2, maxTilt: 7 };
/** 展开态的行距 / 列距（同上，PILE_GEOMETRY_OPTIONS 的 gap 与 rowGap） */
const GAP = 10;
const ROW_GAP = 8;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function parseArgs(argv) {
  const options = {
    base: "http://127.0.0.1:3000",
    path: "/albums/sakura",
    widths: [],
    height: 900,
    out: path.join(ROOT, ".ui-shots"),
    settle: 1600,
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
      case "--path":
        options.path = next();
        break;
      case "--width":
        options.widths.push(Number(next()));
        break;
      case "--height":
        options.height = Number(next());
        break;
      case "--out":
        options.out = path.resolve(ROOT, next());
        break;
      case "--settle":
        options.settle = Number(next());
        break;
      default:
        throw new Error(`未知参数 ${key}`);
    }
  }
  if (options.widths.length === 0) options.widths.push(390, 412, 1400);
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
  for (let port = 9430; port < 9470; port += 1) {
    if (await isPortFree(port)) return port;
  }
  throw new Error("9430-9469 都被占用，先关掉别的调试实例");
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

/** 量页面上**每一叠**（相册详情按卷分叠，一页可能有好几叠）：内联几何 + 视口盒 */
function measureSource() {
  return `(() => {
  const round = (value) => Math.round(value * 100) / 100;
  const piles = [...document.querySelectorAll(".pile")];
  if (piles.length === 0) return { error: "页面里没有 .pile（是不是没渲染相册？）" };
  return {
    width: window.innerWidth,
    height: window.innerHeight,
    piles: piles.map((pile, index) => {
      const viewport = pile.querySelector(".pile__viewport");
      const rect = viewport.getBoundingClientRect();
      const cards = [...pile.querySelectorAll(".pile__card")];
      return {
        index,
        axis: pile.dataset.axis ?? null,
        expanded: pile.dataset.expanded === "true",
        badge: pile.querySelector(".pile__badge")?.textContent?.trim() ?? null,
        // 组头（「周末散步 6 张」）与这一叠的**组名 + 张数**：用来对"渲染了几张 == 组头写几张"
        folder: pile.closest(".album-fold")?.querySelector(".album-fold__head")?.textContent?.trim() ?? "",
        cardKeys: cards.map((card) => card.querySelector("img")?.dataset.lightboxKey ?? ""),
        // 这一叠里有没有横过来的图（宽 > 高）—— 版式方向由它 + 视口一起决定
        hasLandscape: cards.some((card) => {
          const image = card.querySelector("img");
          return Boolean(image && image.naturalWidth && image.naturalWidth > image.naturalHeight);
        }),
        allPortrait: cards.every((card) => {
          const image = card.querySelector("img");
          return Boolean(image && image.naturalHeight && image.naturalHeight >= image.naturalWidth);
        }),
        // 最上面那张是谁（z 最大）：换张判定要看的是"换人"，不是"第几个 DOM 节点动了"
        topCard: (() => {
          const top = cards
            .map((card, position) => ({ z: Number(card.style.zIndex) || 0, position }))
            .sort((a, b) => b.z - a.z)[0];
          return top ? (cards[top.position].querySelector("img")?.dataset.lightboxKey ?? null) : null;
        })(),
        hint: (() => {
          const node = pile.querySelector(".pile__hint");
          return node ? { hidden: node.hidden === true, text: node.textContent?.trim() ?? "" } : null;
        })(),
        viewport: {
          width: round(viewport.clientWidth),
          height: round(viewport.clientHeight),
          scrollWidth: viewport.scrollWidth,
          scrollLeft: viewport.scrollLeft,
          overflowX: getComputedStyle(viewport).overflowX,
        },
        cards: cards.map((card) => {
          /* 布局盒 = 写进 left/top/width 的那一层，必须用 offset* 量：
             getBoundingClientRect() 已经把 transform 算进去了，拿它再乘一次 scale 就是缩放算两遍。
             视觉盒（叠加缩放之后长什么样）用 rect 量，两者分开。 */
          const box = card.getBoundingClientRect();
          const computed = getComputedStyle(card).transform;
          const layoutTop = card.offsetTop;
          const layoutLeft = card.offsetLeft;
          const layoutHeight = card.offsetHeight;
          const layoutWidth = card.offsetWidth;
          /* 全部用**浏览器算好的值**，不再自己解析 transform（这段解析反复出错，且它是"第二个事实源"）：
             - rectTop / rectBottom 就是视觉盒（含旋转包络）；
             - 视觉**中心**（旋转/缩放都以它为原点，实测 transformOrigin 在中心）直接由 rect 求，
               它才是"档位"的不变量：第 d 档中心 = d × peerY + h/2。 */
          const rectTop = box.top - rect.top;
          const rectCenter = rectTop + box.height / 2;
          return {
            transform: card.style.transform,
            computedTransform: computed,
            inlineTop: card.style.top,
            transformOrigin: getComputedStyle(card).transformOrigin,
            zIndex: card.style.zIndex,
            rectLeft: round(box.left - rect.left),
            rectTop: round(rectTop),
            rectBottom: round(box.bottom - rect.top),
            rectWidth: round(box.width),
            rectHeight: round(box.height),
            layoutTop: round(layoutTop),
            layoutLeft: round(layoutLeft),
            layoutWidth: round(layoutWidth),
            layoutHeight: round(layoutHeight),
            visualTop: round(rectTop),
            visualBottom: round(box.bottom - rect.top),
            visualCenter: round(rectCenter),
            visualLeft: round(box.left - rect.left),
            visualWidth: round(box.width),
          };
        }),
      };
    }),
  };
})();`;
}

/** 点开某一叠，边点边按帧采样（用户报的就是"看不到动作"，所以这一步按**位移**判，不按终态判） */
function frameSamplerSource(pileIndex) {
  return `(() => {
  const round = (value) => Math.round(value * 100) / 100;
  const pile = document.querySelectorAll(".pile")[${pileIndex}];
  const viewport = pile.querySelector(".pile__viewport");
  const cards = [...pile.querySelectorAll(".pile__card")];
  const frames = [];
  window.__pileFrames = frames;
  const sample = () => {
    const origin = viewport.getBoundingClientRect();
    frames.push({
      t: Math.round(performance.now()),
      height: round(viewport.clientHeight),
      boxes: cards.map((card) => {
        const box = card.getBoundingClientRect();
        return {
          left: round(box.left - origin.left),
          top: round(box.top - origin.top),
          width: round(box.width),
          height: round(box.height),
          styleWidth: card.style.width,
          styleTop: card.style.top,
          styleTransform: card.style.transform,
        };
      }),
    });
    if (frames.length < 80) requestAnimationFrame(sample);
  };
  window.__pileStart = () => {
    frames.length = 0;
    sample();
    document.querySelectorAll(".pile__badge")[${pileIndex}].click();
    return true;
  };
  return true;
})();`;
}

/** 把逐帧样本收成"这一叠到底动没动" */
function summarizeFrames(frames) {
  const widths = frames.map((frame) => frame.boxes.map((box) => box.width));
  const lefts = frames.map((frame) => frame.boxes.map((box) => box.left));
  const tops = frames.map((frame) => frame.boxes.map((box) => box.top));
  const heights = frames.map((frame) => frame.height);
  const spread = (values) => Math.max(...values) - Math.min(...values);
  // 每一层各自"动了几次"：宽 / 左 / 上 三个方向里取变化次数最多的那个
  const travelOf = (index) =>
    spread(widths.map((row) => row[index])) +
    spread(lefts.map((row) => row[index])) +
    spread(tops.map((row) => row[index]));
  return {
    frames: frames.length,
    widthTravel: Math.max(...widths[0].map((_value, index) => spread(widths.map((row) => row[index])))),
    leftTravel: Math.max(...lefts[0].map((_value, index) => spread(lefts.map((row) => row[index])))),
    topTravel: Math.max(...tops[0].map((_value, index) => spread(tops.map((row) => row[index])))),
    heightTravel: spread(heights),
    // 补间过的层：相邻帧之间出现过 ≥4 次变化（直接跳到终态只会变 1 次）
    animatedLayers: widths[0].filter((_value, index) => {
      let changes = 0;
      for (let frame = 1; frame < frames.length; frame += 1) {
        if (
          Math.abs(widths[frame][index] - widths[frame - 1][index]) > 0.5 ||
          Math.abs(lefts[frame][index] - lefts[frame - 1][index]) > 0.5 ||
          Math.abs(tops[frame][index] - tops[frame - 1][index]) > 0.5
        ) {
          changes += 1;
        }
      }
      return changes >= 4;
    }).length,
    layerTravel: widths[0].map((_value, index) => Math.round(travelOf(index))),
  };
}

/** 在某一叠上派发一次左右滑动（组件在 pointerup 里判定） */
function swipeSource(pileIndex, dx) {
  return `(() => {
  const viewport = document.querySelectorAll(".pile__viewport")[${pileIndex}];
  if (!viewport) return false;
  const box = viewport.getBoundingClientRect();
  const opts = (x) => ({
    bubbles: true,
    cancelable: true,
    pointerId: 1,
    pointerType: "touch",
    isPrimary: true,
    clientX: x,
    clientY: box.top + box.height / 2,
  });
  const start = box.left + box.width / 2;
  viewport.dispatchEvent(new PointerEvent("pointerdown", opts(start)));
  viewport.dispatchEvent(new PointerEvent("pointermove", opts(start + ${dx})));
  viewport.dispatchEvent(new PointerEvent("pointerup", opts(start + ${dx})));
  return true;
})();`;
}

function near(actual, expected, tolerance = 0.75) {
  return Math.abs(actual - expected) <= tolerance;
}

const same = (values, tolerance = 0.6) => {
  const rounded = values.map((value) => Math.round(value / tolerance) * tolerance);
  return new Set(rounded.map((value) => value.toFixed(2))).size === 1;
};

/** 从「周末散步 6 张」这样的组头里取张数（取不到返回 null） */function countFromFolder(text) {
  const match = text?.match(/(\d+)\s*张/);
  return match ? Number(match[1]) : null;
}

/** 从「展开 6」这样的角标里取张数 */
function countFromBadge(text) {
  const match = text?.match(/展开\s*(\d+)/);
  return match ? Number(match[1]) : null;
}

/** 竖屏 / 窄屏折叠态：**随手叠放**（保留原比例、随机倾角与横移、往下错一档） */
function judgeCollapsed(pile) {
  const cards = pile.cards;
  const count = cards.length;
  // 档位由 **z-index 反推**（z = count − depth），不按视觉位置排序 —— 视觉位置正是被测对象
  const depthOf = (card) => count - Number(card.zIndex);
  const byDepth = [...cards].sort((a, b) => depthOf(a) - depthOf(b));
  const tilt = (card) => Number(card.transform.match(/rotate\((-?[\d.]+)deg\)/)?.[1]);
  const shift = (card) => Number(card.transform.match(/translateX\((-?[\d.]+)px\)/)?.[1] ?? 0);
  const facts = {
    布局盒满宽: cards.every((card) => near(card.layoutWidth, pile.viewport.width, 1.5)),
    每张完整落在容器里: cards.every(
      (card) =>
        card.visualTop >= -1 &&
        card.visualBottom <= pile.viewport.height + 1 &&
        card.visualLeft >= -1 &&
        card.visualLeft + card.visualWidth <= pile.viewport.width + 1,
    ),
    折叠态无横向滚动: pile.viewport.overflowX === "hidden",
    角标: pile.badge?.startsWith("展开") === true,
    提示: pile.hint?.hidden === false && pile.hint?.text === "左右滑动翻看 · 点一下展开",
    最上面那张基本摆正: Math.abs(tilt(byDepth[0])) <= LOOSE.topTilt + 0.01,
  };
  if (count >= 2) {
    const centers = byDepth.map((card) => card.visualCenter);
    facts.档位越深越低 = centers.slice(1).every((center, index) => center > centers[index]);
    facts["底下各张明显歪着（2°–7°）"] = byDepth.slice(1).every((card) => {
      const value = Math.abs(tilt(card));
      return value >= LOOSE.minTilt - 0.01 && value <= LOOSE.maxTilt + 0.01;
    });
    facts.倾角各不相同 = new Set(cards.map((card) => tilt(card).toFixed(2))).size === count;
    facts.左右错开 = new Set(cards.map((card) => Math.round(shift(card)))).size > 1;
  }
  return facts;
}

/** 竖屏 / 窄屏展开态：一行一张，自上而下累加行位 */
function judgeExpandedColumn(pile) {
  const cards = [...pile.cards].sort((a, b) => a.visualTop - b.visualTop);
  const gaps = cards.slice(1).map((card, index) => card.visualTop - cards[index].visualBottom);
  return {
    轴为纵向: pile.axis === "y",
    每层满宽: pile.cards.every((card) => near(card.layoutWidth, pile.viewport.width, 1.5)),
    左缘对齐: same(pile.cards.map((card) => card.visualLeft + card.visualWidth / 2)),
    行距一致: gaps.every((gap) => near(gap, GAP, 1.5)),
    首张在顶: near(cards[0].visualTop, 0, 1.5),
    容器高等于列高: near(
      pile.viewport.height,
      cards.reduce((total, card) => total + (card.visualBottom - card.visualTop), 0) +
        GAP * (cards.length - 1),
      2,
    ),
    角标变收起: pile.badge === "收起",
    无横向滚动: pile.viewport.scrollWidth <= pile.viewport.width + 1,
  };
}

/** ≥721px 折叠态：同心叠放（本需求刻意不动的那一支） */
function judgeCollapsedWide(pile) {
  const cards = pile.cards;
  return {
    // 同心叠放的准据是**布局盒中心**：各层中心重合、只做跟随中心的左右位移。
    // 旋转后 rect 的中心会因"卡片高度不同"而漂移（高卡转一点中心就挪几像素）——那是测量口径，不是版式。
    同心叠放: same(cards.map((card) => card.layoutLeft + card.layoutWidth / 2), 1),
    有旋转缩放: cards
      .slice(1)
      .every((card) => /rotate\(/.test(card.transform) && /scale\(/.test(card.transform)),
    // 当前那张是基准：**一定不转**。缩放可能不为 1（单张/窄容器时整叠要缩才能装进画框，
    // 那是几何约束不是缺陷），所以只断言不转，不写死 scale(1)。
    第一层不转: (() => {
      const top = [...cards].sort((a, b) => Number(b.zIndex) - Number(a.zIndex))[0];
      return /rotate\(0(\.0+)?deg\)/.test(top.transform);
    })(),
    角标: pile.badge?.startsWith("展开") === true,
  };
}

/** ≥721px 展开态：等高一行（`data-axis="x"`） */
function judgeExpandedRow(pile) {
  const cards = [...pile.cards].sort((a, b) => a.visualLeft - b.visualLeft);
  const gaps = cards
    .slice(1)
    .map((card, index) => card.visualLeft - (cards[index].visualLeft + cards[index].visualWidth));
  return {
    轴为横向: pile.axis === "x",
    同一行: same(cards.map((card) => card.visualTop), 1),
    行距一致: gaps.every((gap) => near(gap, ROW_GAP, 1.5)),
    角标变收起: pile.badge === "收起",
    宽度为正: cards.every((card) => card.visualWidth > 0),
  };
}

async function runWidth(cdp, session, options, width, url) {
  const label = String(width);
  const mobile = width <= 720;
  const viewportOverride = { width, height: options.height, deviceScaleFactor: 1, mobile: width < 721 };
  await cdp.send("Emulation.setDeviceMetricsOverride", viewportOverride, session);
  await cdp.send("Emulation.setEmulatedMedia", { features: [] }, session);
  const evaluate = async (expression) => {
    const result = await cdp.send(
      "Runtime.evaluate",
      { expression, awaitPromise: true, returnByValue: true },
      session,
    );
    if (result.exceptionDetails) throw new Error(result.exceptionDetails.text);
    return result.result.value;
  };
  const shot = async (name, full = false) => {
    if (full) {
      const metrics = await cdp.send("Page.getLayoutMetrics", {}, session);
      const size = metrics.cssContentSize ?? metrics.contentSize;
      await cdp.send(
        "Emulation.setDeviceMetricsOverride",
        { ...viewportOverride, height: Math.min(Math.ceil(size.height), 12000) },
        session,
      );
      await sleep(300);
    }
    const data = await cdp.send("Page.captureScreenshot", { format: "png" }, session);
    const file = path.join(options.out, `pile-detail-${label}-${name}.png`);
    fs.writeFileSync(file, Buffer.from(data.data, "base64"));
    if (full) {
      await cdp.send("Emulation.setDeviceMetricsOverride", viewportOverride, session);
      await sleep(150);
    }
    return file;
  };
  const measure = async () => {
    // `returnByValue: true` 拿到的是**已经反序列化好的对象**，别再 JSON.parse 一次
    const value = await evaluate(measureSource());
    if (value?.error) throw new Error(`第 ${width}px：${value.error}`);
    // 存一份到页面里，便于用 DevTools 单独复查某一叠（不额外开销）
    await evaluate(`window.__pileDetail = ${JSON.stringify(value)}`);
    return value;
  };

  await cdp.send("Page.navigate", { url }, session);
  const deadline = Date.now() + 60_000;
  let ready = false;
  while (Date.now() < deadline) {
    if ((await evaluate("Boolean(document.querySelector('.pile__card'))")) === true) {
      ready = true;
      break;
    }
    await sleep(120);
  }
  if (!ready) throw new Error(`第 ${width}px：页面里没有渲染出一叠照片`);
  // 图片没加载完时卡片高度是错的（几何会随 load / ResizeObserver 重算）——先等图全到位
  await evaluate(`Promise.all([...document.querySelectorAll(".pile__card img")].map((img) =>
    img.complete ? true : new Promise((resolve) => { img.addEventListener("load", resolve, { once: true }); img.addEventListener("error", resolve, { once: true }); })
  ))`);
  await sleep(options.settle);
  // 再等几何"连续两次量到同一个值"：折叠态是布局效果，稳定了才是它真正的样子
  let previous = "";
  for (let attempt = 0; attempt < 12; attempt += 1) {
    const snapshot = JSON.stringify((await evaluate(measureSource())).piles.map((pile) => pile.cards.map((card) => [card.layoutTop, card.layoutWidth, card.scale])));
    if (snapshot === previous) break;
    previous = snapshot;
    await sleep(250);
  }

  const steps = [];
  const warn = [];
  const check = (name, facts) => {
    const bad = Object.entries(facts).filter(([, value]) => value !== true).map(([key]) => key);
    steps.push({ name, facts, bad });
  };
  // 只在竖屏那一支用：露出的边不能太窄（挤成线就失去"堆叠"的意义）
  const notice = (pile, direction) => {
    if (pile.cards.length < 2) return;
    // 折叠态每层露出多少：按**档位**算（视觉顶逐层差），不是拿 box 高度相减
    const tops = [...pile.cards.map((card) => card.visualTop)].sort((a, b) => a - b);
    const steps = tops.slice(1).map((top, index) => top - tops[index]);
    if (Math.min(...steps) <= 0) {
      warn.push(`第 ${pile.index + 1} 叠：层的次序乱了（${tops.join(" / ")}）`);
    }
  };

  // ① 折叠态：逐叠判（一页多叠，张数不同、长宽比不同）
  const collapsed = await measure();
  collapsed.piles.forEach((pile) => {
    // 方向**只看视口**（2026-10-07 用户口径）：竖屏 / ≤720px 一律竖向堆叠（含横图的叠也一样），
    // 横屏 / 宽屏才是同心叠放。
    const wide = !mobile;
    check(
      `折叠态 · 第 ${pile.index + 1} 叠（${pile.cards.length} 张${pile.hasLandscape ? " · 含横图" : ""}）`,
      wide ? judgeCollapsedWide(pile) : judgeCollapsed(pile),
    );
    // 张数/去重：图片在折叠态是重叠的（还带随机倾角），肉眼数不准 —— 直接用 key 判，
    // 「渲染了几张 == 组头写几张、且没有同一张出现两遍」（用户 2026-10-07 误判过一次重复）
    check(`张数与去重 · 第 ${pile.index + 1} 叠`, {
      组头张数与渲染一致: countFromFolder(pile.folder) === pile.cards.length,
      角标张数与渲染一致: countFromBadge(pile.badge) === pile.cards.length,
      同一张没渲染两遍: new Set(pile.cardKeys).size === pile.cards.length,
      每张都有key: pile.cardKeys.every((key) => key.length > 0),
    });
    if (!wide) {
      warn.push(
        `第 ${pile.index + 1} 叠 折叠态：容器高 ${pile.viewport.height} · overflowX=${pile.viewport.overflowX} · ` +
          pile.cards
            .map(
              (card) =>
                `z${card.zIndex} c${card.visualCenter} cx${Math.round((card.visualLeft + card.rectWidth / 2) * 10) / 10} rot${card.transform.match(/rotate\(([^)]+)\)/)?.[1] ?? ""}`,
            )
            .join(" · "),
      );
      notice(pile, "fan");
    }
  });
  const stacked = collapsed.piles.findIndex((pile) => pile.cards.length >= 2);
  const landscapePile = collapsed.piles.findIndex((pile) => pile.cards.length >= 2);
  const shots = [await shot("collapsed", true)];

  // ② 换上面那张（左右滑动）：横竖两支都跑 —— 同比例的一叠曾因"静默写"指纹太粗而换张失效
  if (stacked >= 0) {
    const before = collapsed.piles[stacked];
    await evaluate(`document.querySelectorAll(".pile__viewport")[${stacked}].focus()`);
    await evaluate(swipeSource(stacked, -80));
    await sleep(options.settle);
    const after = (await measure()).piles[stacked];
    check(`换上面那张 · 第 ${stacked + 1} 叠`, {
      层数不变: after.cards.length === before.cards.length,
      最上面那张换成了另一张: after.topCard !== before.topCard,
      ...(mobile ? judgeCollapsed(after) : judgeCollapsedWide(after)),
    });
    shots.push(await shot("swapped", true));
  } else {
    console.log("  · 页面上没有 ≥2 张的叠，换张一项跳过（夹具只有单张）");
  }

  // ③ 展开动画（用户报的就是"横图看不到展开"）：边点边按帧采样，按**位移**判，不按终态判
  if (landscapePile >= 0) {
    await evaluate(frameSamplerSource(landscapePile));
    await evaluate("window.__pileStart()");
    await sleep(1400);
    const frames = await evaluate("window.__pileFrames");
    const summary = summarizeFrames(frames);
    const travel = Math.max(summary.widthTravel, summary.leftTravel, summary.topTravel, summary.heightTravel);
    check(`展开动画 · 第 ${landscapePile + 1} 叠（含横图，${summary.frames} 帧）`, {
      采到足够的帧: summary.frames >= 8,
      [`有位移（≥120px，实测 ${Math.round(travel)}px）`]: travel >= 120,
      [`补间过的层 ≥2（实测 ${summary.animatedLayers}）`]: summary.animatedLayers >= 2,
    });
    warn.push(
      `展开动画实测：位移 ${Math.round(travel)}px（宽 ${Math.round(summary.widthTravel)} / 左 ${Math.round(summary.leftTravel)} / 上 ${Math.round(summary.topTravel)} / 容器高 ${Math.round(summary.heightTravel)}）· 补间层 ${summary.animatedLayers}`,
    );
  }

  // ④ 逐叠展开，判终态
  const count = collapsed.piles.length;
  for (let index = 0; index < count; index += 1) {
    if (index !== landscapePile) {
      await evaluate(`document.querySelectorAll(".pile__badge")[${index}].click()`);
    }
  }
  await sleep(options.settle + 500);
  const expanded = await measure();
  expanded.piles.forEach((pile) => {
    check(`展开态 · 第 ${pile.index + 1} 叠`, mobile ? judgeExpandedColumn(pile) : judgeExpandedRow(pile));
  });
  shots.push(await shot("expanded", true));

  // ⑤ 再全部收起，回到堆叠（可逆）
  for (let index = 0; index < count; index += 1) {
    await evaluate(`document.querySelectorAll(".pile__badge")[${index}].click()`);
  }
  await sleep(options.settle + 500);
  const recollapsed = await measure();
  recollapsed.piles.forEach((pile) => {
    check(`收起后 · 第 ${pile.index + 1} 叠`, mobile ? judgeCollapsed(pile) : judgeCollapsedWide(pile));
  });

  return { label, url, steps, shots, warn, raw: { collapsed, expanded, recollapsed } };
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const url = options.base + options.path;
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

    for (const width of options.widths) {
      reports.push(await runWidth(cdp, sessionId, options, width, url));
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

  let failed = 0;
  for (const report of reports) {
    console.log(`\n=== ${report.label}px  ${report.url} ===`);
    for (const step of report.steps) {
      failed += step.bad.length;
      console.log(`  ${step.bad.length === 0 ? "PASS" : "FAIL"} ${step.name}`);
      for (const key of step.bad) {
        console.log(`       ✗ ${key} = ${JSON.stringify(step.facts[key])}`);
      }
    }
    for (const pile of report.raw.collapsed.piles) {
      console.log(
        `  折叠态 第 ${pile.index + 1} 叠：${pile.cards.length} 张 · 容器 ${pile.viewport.width}×${pile.viewport.height}` +
          ` · 视觉 top ${pile.cards.map((card) => card.visualTop).join(" / ")}` +
          ` · 视觉下缘 ${pile.cards.map((card) => card.visualBottom).join(" / ")}` +
          ` · 布局盒 top ${pile.cards.map((card) => card.layoutTop).join(" / ")}` +
          ` · scale ${pile.cards.map((card) => card.scale).join(" / ")}` +
          ` · 矩阵 ${pile.cards.map((card) => card.computedTransform).join(" | ")}` +
          (pile.cards.length > 1 ? `\n        inline[0] = ${JSON.stringify(pile.cards[0].transform)}` : ""),
      );
    }
    for (const line of report.warn) {
      console.log(`  ⚠ ${line}`);
    }
    console.log(`  截图：${report.shots.map((file) => path.basename(file)).join(", ")}`);
  }
  console.log(`\n${failed === 0 ? "全部通过 ✅" : `失败项 ${failed} ❌`}`);

  const hardExit = setTimeout(() => process.exit(failed === 0 ? 0 : 1), 3000);
  hardExit.unref();
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((error) => {
  console.error(`[pile-detail-check] ${error instanceof Error ? error.message : error}`);
  process.exitCode = 1;
});
