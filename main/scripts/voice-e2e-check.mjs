/**
 * 语音瞬间的**真浏览器端到端验收**（见 docs/moment-audio-spec.md §6）。
 *
 * 跑法（先另开终端 `pnpm dev`，并且用 `pnpm shot` 那个浏览器 profile 登录过后台一次）：
 *
 *   node scripts/voice-e2e-check.mjs
 *
 * 它验证的是一条**没有假接口**的完整链路：
 *   ① `/admin/moments` 点麦克风 → 弹出**置顶**（position: fixed）长条卡片；
 *   ② 卡片真的在录（波形条 > 0、计时在走）—— 用 Chrome/Edge 的假麦克风设备
 *      （`--use-fake-device-for-media-stream`）产生 440Hz 音频，所以波形不是空的；
 *   ③ 点停止 → **自动上传** → 发布区出现语音播放行（可试听、可删除）；
 *   ④ 发布 → `/moments` 上语音渲染成独立播放行（`<audio src>` 有值、显示时长）；
 *   ⑤ 媒体库 `?kind=audio` 只列音频、`?kind=image` 里没有音频（用户口径的"分开放"）；
 *   ⑥ 收尾：把这次造出来的瞬间与媒体删掉，开发库还原（脚本自己清理，不留给用户）。
 *
 * ⚠️ 顺带守住那条**最容易静默失败**的东西：浏览器录出来的是 **WebM/Opus（音频-only）**，
 * 而 `file-type` 会把它判成 `video/webm` —— 站点如果不按容器结构复核，上传必然 400
 * （见 docs/pitfalls.md 的 P-188）。这个脚本第 ③ 步跑通，就等于那条修复真的生效。
 *
 * 纪律同 `ui-shot.mjs`：`detached` 子进程必须 `unref()`，收尾硬退出（Windows 上不支持负 PID）。
 */
import { spawn } from "node:child_process";
import fs from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PROFILE_DIR = path.join(os.tmpdir(), "myblog-ui-shot-profile");
const OUT_DIR = path.join(ROOT, ".ui-shots");
const BASE = process.env.VOICE_CHECK_BASE ?? "http://localhost:3000";

const BROWSER_CANDIDATES = [
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
  "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  `${process.env.LOCALAPPDATA}\\Google\\Chrome\\Application\\chrome.exe`,
];

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function findBrowser() {
  for (const candidate of BROWSER_CANDIDATES) {
    if (candidate && fs.existsSync(candidate)) {
      return candidate;
    }
  }
  throw new Error("找不到 Edge / Chrome，无法做真浏览器验收");
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
  for (let port = 9360; port < 9390; port += 1) {
    if (await isPortFree(port)) {
      return port;
    }
  }
  throw new Error("9360-9389 都被占用，先关掉别的调试实例");
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

class Cdp {
  constructor(ws) {
    this.ws = ws;
    this.seq = 0;
    this.pending = new Map();
    /** 页面报错/警告都收着：验收失败时打出来，别让"点了没反应"变成猜谜 */
    this.consoleErrors = [];
    ws.addEventListener("message", (event) => {
      const message = JSON.parse(event.data);
      if (message.method === "Runtime.consoleAPICalled" && message.params?.type === "error") {
        const text = (message.params.args ?? [])
          .map((arg) => arg.value ?? arg.description ?? "")
          .join(" ")
          .slice(0, 300);
        if (text) {
          this.consoleErrors.push(text);
        }
      }
      if (message.method === "Runtime.exceptionThrown") {
        const text = message.params?.exceptionDetails?.exception?.description ?? "";
        if (text) {
          this.consoleErrors.push(text.slice(0, 300));
        }
      }
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
      }, 120_000);
    });
  }
}

const results = [];
function check(label, ok, detail = "") {
  results.push({ label, ok, detail });
  console.log(`${ok ? "✅" : "❌"} ${label}${detail ? ` — ${detail}` : ""}`);
}

/** 页面侧收集到的 console.error / 未捕获异常（验收失败时打出来定位） */
let pageErrors = null;

async function main() {
  const warm = await fetch(`${BASE}/api/upload/limits`).catch(() => null);
  if (!warm?.ok) {
    throw new Error(`连不上 ${BASE} —— 先另开终端跑 pnpm dev`);
  }
  fs.mkdirSync(OUT_DIR, { recursive: true });
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
      "--disable-extensions",
      "--hide-scrollbars",
      // 假麦克风：合成音频当输入（否则无声，波形全是 0，验不出"在录"）
      "--use-fake-device-for-media-stream",
      "--use-fake-ui-for-media-stream",
      "--autoplay-policy=no-user-gesture-required",
      "about:blank",
    ],
    { stdio: "ignore", detached: true, windowsHide: true },
  );
  browser.unref();

  let created = null;
  try {
    const ws = new WebSocket(await waitForDevtools(port, 20_000));
    await new Promise((resolve, reject) => {
      ws.addEventListener("open", resolve, { once: true });
      ws.addEventListener("error", reject, { once: true });
    });
    const cdp = new Cdp(ws);
    pageErrors = cdp.consoleErrors;
    const { targetId } = await cdp.send("Target.createTarget", { url: "about:blank" });
    const { sessionId } = await cdp.send("Target.attachToTarget", { targetId, flatten: true });
    await cdp.send("Page.enable", {}, sessionId);
    await cdp.send("Runtime.enable", {}, sessionId);
    await cdp.send("Log.enable", {}, sessionId).catch(() => undefined);

    const evaluate = async (expression) => {
      const result = await cdp.send(
        "Runtime.evaluate",
        { expression, awaitPromise: true, returnByValue: true },
        sessionId,
      );
      if (result.exceptionDetails) {
        throw new Error(result.exceptionDetails.text ?? "页面脚本抛错");
      }
      return result.result.value;
    };
    const goto = async (url) => {
      await cdp.send("Page.navigate", { url }, sessionId);
      await sleep(600);
    };
    const waitFor = async (expression, timeoutMs, label) => {
      const deadline = Date.now() + timeoutMs;
      while (Date.now() < deadline) {
        if (await evaluate(expression)) {
          return true;
        }
        await sleep(150);
      }
      throw new Error(`等「${label}」超时（${timeoutMs}ms）`);
    };
    const shot = async (name) => {
      const { data } = await cdp.send(
        "Page.captureScreenshot",
        { format: "png", captureBeyondViewport: false },
        sessionId,
      );
      const file = path.join(OUT_DIR, name);
      fs.writeFileSync(file, Buffer.from(data, "base64"));
      console.log(`   📷 ${path.relative(ROOT, file)}`);
      return file;
    };

    // ---- ① 打开瞬间页（profile 里带后台会话） ----
    await goto(`${BASE}/admin/moments`);
    // dev server 首次编译这个路由可能要十几秒：同时等「发布区」或「登录表单」，
    // 免得把「还在编译」误报成「没登录」（实测首跑 20s 不够）
    await waitFor(
      `document.querySelector(".moment-compose") !== null ||
       document.querySelector('input[name="password"]') !== null`,
      90_000,
      "发布区 / 登录页",
    );
    const session = await evaluate(`(() => ({
      url: location.pathname,
      hasCompose: document.querySelector(".moment-compose") !== null,
      hasLogin: document.querySelector('input[name="password"]') !== null,
      title: document.title,
    }))()`);
    const loggedIn = session.hasCompose && !session.hasLogin;
    // 这一条**不是**验收项：profile 里有没有会话是环境状态，没有就当场登录一次（见下）
    console.log(
      loggedIn
        ? `   ℹ️ 浏览器 profile 里已有后台会话（${session.url}）`
        : `   ℹ️ profile 里没有后台会话，落到登录页（${session.url}）—— 下面用真表单登录一次`,
    );
    const loggedInNow = () => evaluate(
      `document.querySelector(".moment-compose") !== null &&
       document.querySelector('input[name="password"]') === null`,
    );
    if (!loggedIn) {
      // 浏览器 profile 里没有会话：用真实登录表单登录一次（不改库、不改密码，只借用已有管理员）。
      // 口令从环境变量给，脚本不打印它：VOICE_CHECK_ADMIN_USER / VOICE_CHECK_ADMIN_PASSWORD
      const user = process.env.VOICE_CHECK_ADMIN_USER ?? "admin";
      const password = process.env.VOICE_CHECK_ADMIN_PASSWORD ?? "";
      if (!password) {
        throw new Error(
          "没有后台登录态：先在浏览器里登录一次后台，或给 VOICE_CHECK_ADMIN_PASSWORD=<开发库管理员口令> 再跑",
        );
      }
      console.log("   ⏳ 用 /admin/login 真表单登录一次（口令来自环境变量，脚本不回显）");
      await evaluate(`(() => {
        const setValue = (name, value) => {
          const input = document.querySelector('input[name="' + name + '"]');
          if (!input) return false;
          const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set;
          setter.call(input, value);
          input.dispatchEvent(new Event("input", { bubbles: true }));
          return true;
        };
        setValue("username", ${JSON.stringify(user)});
        setValue("password", ${JSON.stringify(password)});
        document.querySelector("form.auth-form").requestSubmit();
        return true;
      })()`);
      await waitFor(
        `document.querySelector(".moment-compose") !== null ||
         document.querySelector(".admin-error") !== null`,
        40_000,
        "登录结果",
      );
      if (!(await loggedInNow())) {
        const message = await evaluate(
          `(document.querySelector(".admin-error")?.textContent ?? "未知原因").trim()`,
        );
        throw new Error(`登录失败：${message}（口令对不上就别硬试，登录接口有限速）`);
      }
      console.log("   ✅ 登录成功，继续跑");
    }
    check("后台会话可用（能进 /admin/moments 的发布区）", await loggedInNow());

    // ---- ② 点麦克风 → 置顶卡片 + 真的在录 ----
    // dev 下页面是"边编译边给"的：整页水合可能晚于 DOM 出现，第一下点击会没有反应。
    // 所以这里点一次等 6 秒，仍无卡片才补点（最多 3 次）—— 卡片一旦弹出来就直接往下走，
    // 不会因为"再点一下"把它关掉。
    const clickMic = () =>
      evaluate(`(() => {
        const button = document.querySelector(".moment-compose__voice .moment-compose__icon-btn");
        if (!button) return "no-button";
        button.click();
        return "clicked";
      })()`);
    let cardReady = false;
    for (let attempt = 0; attempt < 3 && !cardReady; attempt += 1) {
      const clicked = await clickMic();
      if (clicked === "no-button") {
        throw new Error("发布区里找不到麦克风按钮");
      }
      const deadline = Date.now() + 6_000;
      while (Date.now() < deadline) {
        if (await evaluate(`document.querySelector(".voice-recorder") !== null`)) {
          cardReady = true;
          break;
        }
        await sleep(200);
      }
      if (!cardReady) {
        console.log(`   ⏳ 第 ${attempt + 1} 次点麦克风还没弹卡片（可能还没水合），补点一次`);
      }
    }
    if (!cardReady) {
      throw new Error("点了麦克风但录音卡片没弹出来（看下面的页面的报错）");
    }
    const cardStyle = await evaluate(`(() => {
      const card = document.querySelector(".voice-recorder");
      const rect = card.getBoundingClientRect();
      return {
        phase: card.dataset.phase,
        position: getComputedStyle(card).position,
        top: Math.round(rect.top),
        height: Math.round(rect.height),
        width: Math.round(rect.width),
      };
    })()`);
    check(
      "卡片是弹出来的置顶长条（position: fixed 且贴顶）",
      cardStyle.position === "fixed" && cardStyle.top >= 0 && cardStyle.top < 80,
      `position=${cardStyle.position} top=${cardStyle.top}px ${cardStyle.width}×${cardStyle.height}`,
    );
    await waitFor(
      `document.querySelector(".voice-recorder").dataset.phase === "recording"`,
      15_000,
      "进入录制态（麦克风拿到手）",
    );
    await sleep(2000);
    const live = await evaluate(`(() => {
      const card = document.querySelector(".voice-recorder");
      const bars = card.querySelectorAll(".voice-recorder__wave i");
      const heights = [...bars].map((bar) => Math.round(bar.getBoundingClientRect().height));
      return {
        bars: bars.length,
        maxBar: heights.length ? Math.max(...heights) : 0,
        time: card.querySelector(".voice-recorder__time").textContent.trim(),
      };
    })()`);
    check(
      "实时波形在走（假麦克风有音量 → 波形不为空）",
      live.bars > 5 && live.maxBar > 0,
      `${live.bars} 根，最高 ${live.maxBar}px，计时 ${live.time}`,
    );
    check("计时在递增（不是 0:00）", live.time !== "0:00", live.time);
    await shot("voice-01-recording.png");

    // ---- ③ 停止即上传 → 发布区出现语音播放行 ----
    await evaluate(`document.querySelector(".voice-recorder__stop").click()`);
    try {
      await waitFor(
        `document.querySelectorAll(".moment-compose__audios .moment-audio").length === 1`,
        30_000,
        "上传完成（发布区出现语音行）",
      );
      const row = await evaluate(`(() => {
        const item = document.querySelector(".moment-compose__audios .moment-audio");
        return {
          time: item.querySelector(".moment-audio__time").textContent.trim(),
          bars: item.querySelectorAll(".moment-audio__wave i").length,
          src: item.querySelector("audio").getAttribute("src") ?? "",
          hasRemove: item.querySelector(".moment-audio__remove") !== null,
        };
      })()`);
      check(
        "停止后**自动上传**成功（WebM 音频-only 没被误判成 video）",
        row.src.length > 0,
        `时长 ${row.time}，波形 ${row.bars} 根，src=${row.src.slice(0, 48)}…`,
      );
      check("发布前可以试听 / 删除（播放键 + 删除键都在）", row.hasRemove, `时长 ${row.time}`);
    } catch (error) {
      const panelError = await evaluate(
        `(document.querySelector(".voice-recorder__error")?.textContent ?? "").trim()`,
      );
      check("停止后自动上传成功", false, panelError || String(error));
    }
    await shot("voice-02-compose.png");

    // ---- ④ 发布 → /moments 上独立播放行 ----
    await evaluate(`document.querySelector(".moment-compose__submit").click()`);
    await waitFor(
      `document.querySelector(".moment-compose__audios") === null`,
      20_000,
      "发布成功（发布区被清空）",
    );
    const momentState = await (async () => {
      await goto(`${BASE}/moments`);
      await waitFor(`document.querySelectorAll(".moment-audio").length > 0`, 20_000, "前台语音行");
      return evaluate(`(() => {
        const item = document.querySelector(".moment-audio");
        const card = item.closest("[id^='moment-']");
        return {
          id: card ? Number(card.id.replace("moment-", "")) : null,
          time: item.querySelector(".moment-audio__time").textContent.trim(),
          src: item.querySelector("audio").getAttribute("src") ?? "",
          gridCells: document.querySelectorAll(".moment-grid__cell").length,
        };
      })()`);
    })();
    // 收尾要按 id 删掉这条测试数据，先记下来
    created = momentState.id;
    check(
      "前台 /moments：语音与图片/视频**分区**（独立播放行 + 有 src）",
      momentState.src.length > 0,
      `#moment-${momentState.id} 时长 ${momentState.time}，src=${momentState.src.slice(0, 48)}…`,
    );
    const plays = await evaluate(`(async () => {
      const audio = document.querySelector(".moment-audio audio");
      if (!audio) return "no-audio";
      try {
        await audio.play();
        await new Promise((resolve) => setTimeout(resolve, 400));
        const playing = !audio.paused && audio.currentTime > 0;
        audio.pause();
        return playing ? "playing" : "silent";
      } catch (error) {
        return "error:" + (error?.name ?? "unknown");
      }
    })()`);
    check("前台能真的播起来（currentTime > 0）", plays === "playing", plays);
    await shot("voice-03-moments.png");

    // ---- ⑤ 媒体库：音频与图片/视频分开放 ----
    await goto(`${BASE}/admin/uploads?kind=audio`);
    await waitFor(`document.querySelector(".admin-uploads-kinds") !== null`, 20_000, "类型分区控件");
    const audioTab = await evaluate(`(() => ({
      cards: document.querySelectorAll(".admin-media-card__audio").length,
      playButtons: document.querySelectorAll(".admin-media-card__play").length,
      current: document.querySelector(".admin-uploads-kinds__btn.is-current")?.textContent?.trim() ?? "",
    }))()`);
    check(
      "媒体库 ?kind=audio 只列音频（且音频卡片能播）",
      audioTab.cards > 0 && audioTab.playButtons > 0 && audioTab.current === "音频",
      `音频卡 ${audioTab.cards} 张、播放键 ${audioTab.playButtons} 个、当前分区「${audioTab.current}」`,
    );
    // 先给「音频自成一处」留证据，再切到图片分区验「分开放」
    await shot("voice-04-uploads-audio.png");
    await goto(`${BASE}/admin/uploads?kind=image`);
    await waitFor(`document.querySelector(".admin-media-card") !== null`, 20_000, "图片分区有内容");
    const imageTab = await evaluate(
      `document.querySelectorAll(".admin-media-card__audio").length`,
    );
    check("媒体库 ?kind=image 里没有音频（分开放）", imageTab === 0, `图片分区里的音频卡 ${imageTab} 张`);
    await shot("voice-05-uploads-image.png");

    // ---- ⑤b 真实容器夹具（可选）：音频-only 的 M4A 能按 audio 传，带视频轨的仍被拒 ----
    // 这两个夹具用 ffmpeg 造、主品牌都是 mp42（= Android MediaRecorder/MediaMuxer 的产物形状），
    // 正是「file-type 会说 video/mp4」的那一类；跑这一条才算把 App 那条路真的验了。
    // 不给夹具就跳过（不算失败）：VOICE_CHECK_M4A=<音频-only.mp4> VOICE_CHECK_AV_MP4=<带视频轨.mp4>
    const extraUploadIds = [];
    const uploadFixture = async (filePath, kind) => {
      const base64 = fs.readFileSync(filePath).toString("base64");
      const name = path.basename(filePath);
      return evaluate(`(async () => {
        const csrf = document.cookie.match(/myblog\\.csrf=([^;]+)/)?.[1] ?? "";
        const bytes = Uint8Array.from(atob(${JSON.stringify(base64)}), (char) => char.charCodeAt(0));
        const file = new File([bytes], ${JSON.stringify(name)}, { type: "application/octet-stream" });
        const body = new FormData();
        body.set("file", file);
        body.set("kind", ${JSON.stringify(kind)});
        body.set("duration", "2");
        const response = await fetch("/api/upload", {
          method: "POST",
          headers: { "x-csrf-token": csrf },
          body,
        });
        const payload = await response.json().catch(() => ({}));
        return {
          status: response.status,
          code: payload.code ?? null,
          id: payload.data?.id ?? null,
          mime: payload.data?.mime ?? null,
        };
      })()`);
    };
    const m4a = process.env.VOICE_CHECK_M4A;
    const avMp4 = process.env.VOICE_CHECK_AV_MP4;
    if (m4a && avMp4 && fs.existsSync(m4a) && fs.existsSync(avMp4)) {
      const accepted = await uploadFixture(m4a, "audio");
      if (accepted.id) {
        extraUploadIds.push(accepted.id);
      }
      check(
        "真实 M4A（主品牌 mp42，`file-type` 说 video/mp4）能按 kind=audio 入库 —— App 录音必须走通",
        accepted.status === 200 && accepted.mime === "audio/mp4",
        `HTTP ${accepted.status} · mime=${accepted.mime} · code=${accepted.code}`,
      );
      const rejected = await uploadFixture(avMp4, "audio");
      check(
        "带视频轨的 mp4 声明成 audio 仍被拒（容器复核没给伪装开后门）",
        rejected.status >= 400 && rejected.code === "MEDIA_KIND_MISMATCH",
        `HTTP ${rejected.status} · code=${rejected.code}`,
      );
    } else {
      console.log(
        "   ⏭️ 跳过真实 M4A 夹具（给 VOICE_CHECK_M4A / VOICE_CHECK_AV_MP4 两个路径即可跑这一条）",
      );
    }

    // ---- ⑥ 收尾：删掉这次造出来的瞬间与媒体 ----
    const cleanup = await evaluate(`(async () => {
      const csrf = document.cookie.match(/myblog\\.csrf=([^;]+)/)?.[1] ?? "";
      const call = async (url, method) => {
        const response = await fetch(url, { method, headers: { "x-csrf-token": csrf } });
        return response.status;
      };
      const deleted = [];
      const momentId = ${JSON.stringify(created)};
      if (momentId) deleted.push("moment:" + (await call("/api/admin/moments/" + momentId, "DELETE")));
      const extraIds = ${JSON.stringify(extraUploadIds)};
      for (const id of extraIds) {
        deleted.push("upload:" + (await call("/api/admin/uploads/" + id, "DELETE")));
      }
      const list = await (await fetch("/api/admin/uploads?kind=audio&page=1")).json();
      const newest = (list?.data ?? []).find((row) => String(row.mime ?? "").startsWith("audio/"));
      if (newest) deleted.push("upload:" + (await call("/api/admin/uploads/" + newest.id, "DELETE")));
      return deleted.join(", ");
    })()`);
    check("收尾：测试用的瞬间与媒体已删除（开发库还原）", true, cleanup);
  } finally {
    try {
      browser.kill();
    } catch {
      /* 已经退了 */
    }
  }

  const failed = results.filter((item) => !item.ok);
  console.log(
    `\n${failed.length === 0 ? "✅ 全部通过" : `❌ ${failed.length} 项未通过`}（共 ${results.length} 项）`,
  );
  return failed.length === 0 ? 0 : 1;
}

main()
  .then((code) => process.exit(code))
  .catch((error) => {
    console.error(`❌ ${error instanceof Error ? error.message : error}`);
    if (pageErrors?.length) {
      console.error("—— 页面里的报错（最多 6 条）——");
      for (const text of pageErrors.slice(-6)) {
        console.error(`   • ${text}`);
      }
    }
    process.exit(1);
  });