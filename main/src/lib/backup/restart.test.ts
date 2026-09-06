import assert from "node:assert/strict";
import { access } from "node:fs/promises";
import test from "node:test";

import {
  bootScriptPath,
  buildWscriptRun,
  inferNextMode,
  isExternallySupervised,
  isManagedByPm2,
  parseRelaunchArgv,
  relaunchScriptPath,
  resolveRelaunchCommand,
  serializeRelaunchArgv,
} from "./relaunch";

test("isManagedByPm2 only looks at pm_id", () => {
  assert.equal(isManagedByPm2({}), false);
  assert.equal(isManagedByPm2({ pm_id: "" }), false);
  assert.equal(isManagedByPm2({ pm_id: "0" }), true);
  assert.equal(isManagedByPm2({ PM2_HOME: "C:\\pm2" }), false);
});

test("isExternallySupervised covers pm2 and systemd", () => {
  assert.equal(isExternallySupervised({}), false);
  assert.equal(isExternallySupervised({ pm_id: "1" }), true);
  assert.equal(isExternallySupervised({ INVOCATION_ID: "abc" }), true);
});

test("resolveRelaunchCommand starts boot.cjs so pending updates apply first", () => {
  const argv = [
    process.execPath,
    "C:\\Users\\aou_1\\AppData\\Roaming\\npm\\node_modules\\pnpm\\bin\\pnpm.mjs",
    "dev",
  ];
  const launched = resolveRelaunchCommand(argv, {
    lifecycleEvent: "dev",
    execPath: process.execPath,
  });
  assert.equal(launched.command, process.execPath);
  assert.equal(launched.args[0], bootScriptPath());
  assert.equal(launched.args[1], "dev");
  assert.equal(
    launched.args.some((item) => item.toLowerCase().includes("pnpm")),
    false,
  );
  assert.equal(inferNextMode(argv, "start"), "start");
});

test("relaunch argv roundtrips and rejects junk", () => {
  const argv = [process.execPath, "next", "dev"];
  assert.deepEqual(parseRelaunchArgv(serializeRelaunchArgv(argv)), argv);
  assert.throws(() => parseRelaunchArgv("[]"));
  assert.throws(() => parseRelaunchArgv("[1]"));
  assert.throws(() => parseRelaunchArgv("nope"));
});

test("relaunch and boot scripts exist next to the app cwd", async () => {
  await access(relaunchScriptPath());
  await access(bootScriptPath());
});

test("buildWscriptRun hides the window and quotes spaces", () => {
  const vbs = buildWscriptRun(
    "C:\\Program Files\\nodejs\\node.exe",
    ["D:\\code\\next", "dev"],
    "D:\\code",
  );
  assert.match(vbs, /, 0, False/);
  assert.match(vbs, /Program Files/);
  assert.equal(vbs.includes("pnpm"), false);
});
