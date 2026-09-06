"use strict";

const { spawnSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

function log(message) {
  const line = `[boot ${new Date().toISOString()}] ${message}\n`;
  try {
    const file = path.join(process.cwd(), "data", "update.log");
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.appendFileSync(file, line);
  } catch {
    // ignore
  }
  console.info(`[myblog] ${message}`);
}

function inferMode(argv) {
  if (argv.includes("dev")) {
    return "dev";
  }
  if (argv.includes("start")) {
    return "start";
  }
  return process.env.npm_lifecycle_event === "start" ? "start" : "dev";
}

function extraAfterMode(argv, mode) {
  const index = argv.lastIndexOf(mode);
  return index >= 0 ? argv.slice(index + 1) : [];
}

function resolveTsx(cwd) {
  try {
    return require.resolve("tsx/cli", { paths: [cwd] });
  } catch {
    const candidates = [
      path.join(cwd, "node_modules", "tsx", "dist", "cli.mjs"),
      path.join(cwd, "node_modules", "tsx", "dist", "cli.js"),
    ];
    return candidates.find((file) => fs.existsSync(file)) ?? null;
  }
}

function applyPending(cwd, mode) {
  const script = path.join(__dirname, "apply-pending-update.ts");
  if (!fs.existsSync(script)) {
    log("找不到 apply-pending-update.ts，跳过预约更新");
    return 0;
  }
  const tsxCli = resolveTsx(cwd);
  if (!tsxCli) {
    log("找不到 tsx，无法在启动前应用更新（与 pnpm restore 一样需要 tsx）");
    return 0;
  }
  log(`检查预约更新（${mode}）`);
  const result = spawnSync(process.execPath, [tsxCli, script, mode], {
    cwd,
    stdio: "inherit",
    windowsHide: true,
    env: process.env,
  });
  if (result.error) {
    log(`应用更新失败：${result.error.message}`);
    return 1;
  }
  return result.status ?? 0;
}

function startNext(cwd, mode, extra) {
  const nextBin = path.join(cwd, "node_modules", "next", "dist", "bin", "next");
  if (!fs.existsSync(nextBin)) {
    console.error(`[myblog] 找不到 Next：${nextBin}`);
    process.exit(1);
  }
  process.argv = [process.execPath, nextBin, mode, ...extra];
  require(nextBin);
}

function main() {
  const cwd = process.cwd();
  const argv = process.argv.slice(2);
  const mode = inferMode(["boot", ...argv]);
  const extra = extraAfterMode(argv, mode);
  const applyStatus = applyPending(cwd, mode);
  if (applyStatus !== 0) {
    log(`预约更新返回 ${applyStatus}，仍尝试启动应用`);
  }
  startNext(cwd, mode, extra);
}

main();
