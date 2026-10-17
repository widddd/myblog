import assert from "node:assert/strict";
import test from "node:test";

import {
  detectClientPlatform,
  isModuleHidden,
  isSmartBlogApp,
} from "./detect";

/** 真实形态的取样：桌面浏览器 / 安卓 WebView / GeckoView 默认 / App 追加标记。 */
const EDGE_CASES = {
  desktop:
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36",
  geckoviewDefault:
    "Mozilla/5.0 (Android 11; Mobile; rv:157.0) Gecko/157.0 Firefox/157.0",
  androidWebView:
    "Mozilla/5.0 (Linux; Android 14; K) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/120.0.0.0 Mobile Safari/537.36",
  smartblog:
    "Mozilla/5.0 (Android 11; Mobile; rv:157.0) Gecko/157.0 Firefox/157.0 SmartBlog/0.1.1",
} as const;

test("普通浏览器不被当成 App", () => {
  assert.equal(isSmartBlogApp(EDGE_CASES.desktop), false);
  assert.equal(isSmartBlogApp(EDGE_CASES.geckoviewDefault), false);
  assert.equal(isSmartBlogApp(EDGE_CASES.androidWebView), false);
});

test("带 SmartBlog 标记的 UA 被认出来（含裸标记与大小写）", () => {
  assert.equal(isSmartBlogApp(EDGE_CASES.smartblog), true);
  assert.equal(isSmartBlogApp(`${EDGE_CASES.geckoviewDefault} SmartBlog`), true);
  assert.equal(isSmartBlogApp(`${EDGE_CASES.geckoviewDefault} smartblog/2.0`), true);
});

test("缺 UA / 空串按浏览器处理（不能抛错）", () => {
  assert.equal(isSmartBlogApp(null), false);
  assert.equal(isSmartBlogApp(undefined), false);
  assert.equal(isSmartBlogApp(""), false);
  assert.equal(detectClientPlatform(null), "browser");
});

test("平台标识只有两档，App 判定的唯一入口就是这一个函数", () => {
  assert.equal(detectClientPlatform(EDGE_CASES.smartblog), "smartblog");
  assert.equal(detectClientPlatform(EDGE_CASES.desktop), "browser");
});

test("只有「App 里 + 不是后台预览」才藏推荐卡", () => {
  assert.equal(isModuleHidden({ builtinKey: "app-promo" }, { appMode: true }), true);
  assert.equal(isModuleHidden({ builtinKey: "app-promo" }, { appMode: false }), false);
  // 后台画布/手机画框是预览，必须照常可见，否则站长看不到自己配的内容
  assert.equal(
    isModuleHidden({ builtinKey: "app-promo" }, { appMode: true, preview: true }),
    false,
  );
  // 默认参数（没传 context）= 浏览器视角，照常显示
  assert.equal(isModuleHidden({ builtinKey: "app-promo" }), false);
});

test("用模板建的自建推荐卡（无 builtinKey）也认得出", () => {
  const html = `<span class="home-app-promo__logo"></span><a class="home-app-promo__action">立即下载</a>`;
  assert.equal(isModuleHidden({ html }, { appMode: true }), true);
  assert.equal(isModuleHidden({ html }, { appMode: false }), false);
  assert.equal(isModuleHidden({ html }, { appMode: true, preview: true }), false);
});

test("普通模块与弹出模块不受影响", () => {
  assert.equal(
    isModuleHidden({ builtinKey: "popup", html: "" }, { appMode: true }),
    false,
  );
  assert.equal(
    isModuleHidden(
      { html: `<div class="my-popup"><p class="my-popup__title">欢迎回来</p></div>` },
      { appMode: true },
    ),
    false,
  );
});
