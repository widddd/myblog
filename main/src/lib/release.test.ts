import assert from "node:assert/strict";
import test from "node:test";

import {
  APP_CHANNEL,
  APP_RELEASE_LABEL,
  APP_VERSION,
  backupReleaseLabel,
  currentBackupRelease,
} from "./release";

test("current release is 0.1.1", () => {
  const release = currentBackupRelease();
  assert.equal(release.channel, APP_CHANNEL);
  assert.equal(release.version, APP_VERSION);
  assert.equal(release.version, "0.1.1");
  assert.equal(release.label, APP_RELEASE_LABEL);
  assert.equal(APP_RELEASE_LABEL, "0.1.1");
});

test("backupReleaseLabel maps alpha packages to the public mark", () => {
  assert.equal(backupReleaseLabel("alpha", null), "0.1.1");
  assert.equal(backupReleaseLabel("alpha", ""), "0.1.1");
  assert.equal(backupReleaseLabel(null, null), "未知版本");
  assert.equal(backupReleaseLabel("alpha", "0.1"), "alpha 0.1");
});
