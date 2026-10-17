import assert from "node:assert/strict";
import { test } from "node:test";

import {
  allowsMicrophone,
  normalizePermissionPathname,
  permissionsPolicyFor,
} from "./permissions-policy";

test("管理后台整棵路径树允许麦克风，但不误伤 /administrator", () => {
  assert.equal(allowsMicrophone("/admin"), true);
  assert.equal(allowsMicrophone("/admin/moments"), true);
  assert.equal(allowsMicrophone("/admin/moments/"), true, "末尾斜杠不能把入口关掉");
  assert.equal(allowsMicrophone("/admin?tab=compose"), true, "查询串不参与路径判定");
  assert.equal(allowsMicrophone("/admin/posts"), true, "后台软导航不能丢策略");
  assert.equal(allowsMicrophone("/admin/uploads"), true);
  assert.equal(allowsMicrophone("/admin/moments/123"), true);
  assert.equal(allowsMicrophone("/administrator"), false, "前缀必须落在路径段边界");
  assert.equal(allowsMicrophone("/moments"), false, "前台瞬间页不录音");
});

test("路径归一化只处理路径本身", () => {
  assert.equal(normalizePermissionPathname("/admin/moments/"), "/admin/moments");
  assert.equal(normalizePermissionPathname("//admin///moments//?x=1"), "/admin/moments");
  assert.equal(normalizePermissionPathname("/"), "/");
});

test("Permissions-Policy 的 camera / geolocation 永远保持关闭", () => {
  assert.equal(
    permissionsPolicyFor("/admin/moments"),
    "camera=(), microphone=(self), geolocation=()",
  );
  assert.equal(
    permissionsPolicyFor("/admin/posts"),
    "camera=(), microphone=(self), geolocation=()",
  );
  assert.equal(
    permissionsPolicyFor("/moments"),
    "camera=(), microphone=(), geolocation=()",
  );
});
