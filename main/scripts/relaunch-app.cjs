"use strict";

const { spawn } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

function log(message) {
  const line = `[relaunch ${new Date().toISOString()}] ${message}\n`;
  try {
    const file = path.join(process.cwd(), "data", "relaunch.log");
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.appendFileSync(file, line);
  } catch {
    // ignore
  }
}

function isPidAlive(pid) {
  if (!Number.isInteger(pid) || pid <= 0) {
    return false;
  }
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return Boolean(error && error.code === "EPERM");
  }
}

function waitForPidExit(pid, timeoutMs) {
  return new Promise((resolve) => {
    const started = Date.now();
    const timer = setInterval(() => {
      if (!isPidAlive(pid) || Date.now() - started >= timeoutMs) {
        clearInterval(timer);
        resolve(!isPidAlive(pid));
      }
    }, 200);
  });
}

function inferNextMode(rawArgv, lifecycleEvent) {
  if (lifecycleEvent === "dev" || lifecycleEvent === "start") {
    return lifecycleEvent;
  }
  if (rawArgv.includes("dev")) {
    return "dev";
  }
  if (rawArgv.includes("start")) {
    return "start";
  }
  return null;
}

function resolveCommand(rawArgv) {
  if (
    !Array.isArray(rawArgv) ||
    rawArgv.length < 1 ||
    rawArgv.some((item) => typeof item !== "string")
  ) {
    throw new Error("启动参数必须是非空字符串数组");
  }

  const mode = inferNextMode(rawArgv, process.env.npm_lifecycle_event);
  const boot = path.join(process.cwd(), "scripts", "boot.cjs");
  if (mode && fs.existsSync(boot)) {
    const modeIndex = rawArgv.lastIndexOf(mode);
    const extra = modeIndex >= 0 ? rawArgv.slice(modeIndex + 1) : [];
    return { command: process.execPath, args: [boot, mode, ...extra] };
  }

  const nextBin = path.join(
    process.cwd(),
    "node_modules",
    "next",
    "dist",
    "bin",
    "next",
  );
  if (mode && fs.existsSync(nextBin)) {
    const modeIndex = rawArgv.lastIndexOf(mode);
    const extra = modeIndex >= 0 ? rawArgv.slice(modeIndex + 1) : [];
    return { command: process.execPath, args: [nextBin, mode, ...extra] };
  }

  return { command: rawArgv[0], args: rawArgv.slice(1) };
}

function vbsEscape(value) {
  return String(value).replace(/"/g, '""');
}

function buildWscriptRun(command, args, cwd) {
  const quote = (value) => `"${vbsEscape(value)}"`;
  const commandLine = [command, ...args].map(quote).join(" ");
  return [
    'Set sh = CreateObject("WScript.Shell")',
    `sh.CurrentDirectory = "${vbsEscape(cwd)}"`,
    `sh.Run "${vbsEscape(commandLine)}", 0, False`,
  ].join("\r\n");
}

function spawnHidden(command, args) {
  if (process.platform === "win32") {
    const vbsPath = path.join(os.tmpdir(), `myblog-relaunch-next-${process.pid}.vbs`);
    fs.writeFileSync(vbsPath, buildWscriptRun(command, args, process.cwd()), "utf8");
    const child = spawn("wscript.exe", ["//B", "//Nologo", vbsPath], {
      detached: true,
      stdio: "ignore",
      windowsHide: true,
      cwd: process.cwd(),
    });
    child.unref();
    return child;
  }

  const logFile = path.join(process.cwd(), "data", "relaunch.log");
  const out = fs.openSync(logFile, "a");
  const child = spawn(command, args, {
    detached: true,
    stdio: ["ignore", out, out],
    cwd: process.cwd(),
    env: process.env,
  });
  child.unref();
  return child;
}

async function main() {
  const pid = Number(process.argv[2]);
  let rawArgv;
  try {
    rawArgv = JSON.parse(process.argv[3] ?? "");
  } catch {
    log("参数不是合法 JSON");
    process.exit(1);
    return;
  }

  let launched;
  try {
    launched = resolveCommand(rawArgv);
  } catch (error) {
    log(error instanceof Error ? error.message : String(error));
    process.exit(1);
    return;
  }

  const exited = await waitForPidExit(pid, 20_000);
  if (!exited) {
    log(`原进程 ${pid} 仍在运行，放弃拉起`);
    process.exit(1);
    return;
  }

  await new Promise((resolve) => setTimeout(resolve, 1000));
  log(`拉起 ${launched.command} ${launched.args.join(" ")}`);
  spawnHidden(launched.command, launched.args);
  log(
    process.platform === "win32"
      ? "已用 wscript 隐藏拉起，不应弹出 cmd"
      : "新进程已脱离",
  );
  process.exit(0);
}

void main();
