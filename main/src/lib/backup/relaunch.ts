import { spawn, type ChildProcess } from "node:child_process";
import { existsSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";

export const RELAUNCH_SCRIPT = "scripts/relaunch-app.cjs";
export const BOOT_SCRIPT = "scripts/boot.cjs";

type EnvLike = Record<string, string | undefined>;

export function isManagedByPm2(env: EnvLike = process.env): boolean {
  return Boolean(env.pm_id);
}

/** pm2 或 systemd 会自己拉起进程，这时只退出、不要再 spawn */
export function isExternallySupervised(env: EnvLike = process.env): boolean {
  return isManagedByPm2(env) || Boolean(env.INVOCATION_ID);
}

export function nextBinPath(cwd = process.cwd()): string {
  return path.join(cwd, "node_modules", "next", "dist", "bin", "next");
}

export function inferNextMode(
  rawArgv: readonly string[],
  lifecycleEvent?: string,
): "dev" | "start" | null {
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

export function bootScriptPath(cwd = process.cwd()): string {
  return path.join(cwd, BOOT_SCRIPT);
}

export function resolveRelaunchCommand(
  rawArgv: readonly string[],
  options: {
    cwd?: string;
    execPath?: string;
    lifecycleEvent?: string;
  } = {},
): { command: string; args: string[] } {
  if (
    !Array.isArray(rawArgv) ||
    rawArgv.length < 1 ||
    rawArgv.some((item) => typeof item !== "string")
  ) {
    throw new Error("relaunch argv must be a non-empty string array");
  }

  const cwd = options.cwd ?? process.cwd();
  const execPath = options.execPath ?? process.execPath;
  const mode = inferNextMode(rawArgv, options.lifecycleEvent);
  const boot = bootScriptPath(cwd);
  if (mode && existsSync(boot)) {
    const modeIndex = rawArgv.lastIndexOf(mode);
    const extra = modeIndex >= 0 ? rawArgv.slice(modeIndex + 1) : [];
    return { command: execPath, args: [boot, mode, ...extra] };
  }

  const bin = nextBinPath(cwd);
  if (mode && existsSync(bin)) {
    const modeIndex = rawArgv.lastIndexOf(mode);
    const extra = modeIndex >= 0 ? rawArgv.slice(modeIndex + 1) : [];
    return { command: execPath, args: [bin, mode, ...extra] };
  }

  return { command: rawArgv[0], args: rawArgv.slice(1) };
}

export function relaunchScriptPath(cwd = process.cwd()): string {
  return path.join(cwd, RELAUNCH_SCRIPT);
}

export function serializeRelaunchArgv(argv: readonly string[]): string {
  return JSON.stringify(argv);
}

export function parseRelaunchArgv(raw: string): string[] {
  const parsed = JSON.parse(raw) as unknown;
  if (
    !Array.isArray(parsed) ||
    parsed.length < 1 ||
    parsed.some((item) => typeof item !== "string")
  ) {
    throw new Error("relaunch argv must be a non-empty string array");
  }
  return parsed;
}

function vbsEscape(value: string): string {
  return value.replace(/"/g, '""');
}

export function buildWscriptRun(
  command: string,
  args: readonly string[],
  cwd: string,
): string {
  const quote = (value: string) => `"${vbsEscape(value)}"`;
  const commandLine = [command, ...args].map(quote).join(" ");
  return [
    'Set sh = CreateObject("WScript.Shell")',
    `sh.CurrentDirectory = "${vbsEscape(cwd)}"`,
    `sh.Run "${vbsEscape(commandLine)}", 0, False`,
  ].join("\r\n");
}

/** Windows 用 wscript 隐藏启动，避免 detached node 弹出 cmd；Linux 用 detached */
export function spawnDetachedProcess(
  command: string,
  args: string[],
  cwd = process.cwd(),
): ChildProcess {
  if (process.platform === "win32") {
    const vbsPath = path.join(os.tmpdir(), `myblog-relaunch-${process.pid}.vbs`);
    writeFileSync(vbsPath, buildWscriptRun(command, args, cwd), "utf8");
    const child = spawn("wscript.exe", ["//B", "//Nologo", vbsPath], {
      detached: true,
      stdio: "ignore",
      windowsHide: true,
      cwd,
    });
    child.unref();
    return child;
  }

  const child = spawn(command, args, {
    detached: true,
    stdio: "ignore",
    cwd,
    env: process.env,
  });
  child.unref();
  return child;
}
