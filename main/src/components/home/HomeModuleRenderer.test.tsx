import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";

import { AppLogoMark } from "@/components/common/AppLogoMark";
import { AlbumCardsModule } from "@/components/home/modules/AlbumCardsModule";
import { AppPromoModule } from "@/components/home/modules/AppPromoModule";
import { PopupShell } from "@/components/home/modules/PopupShell";
import { ModuleBody } from "@/components/home/HomeModuleRenderer";
import { APP_LOGO_COLORS, APP_LOGO_PATHS } from "@/lib/home/app-logo";
import { HOME_ALBUM_CARD_LIMIT_DEFAULT } from "@/lib/home/albums";
import { builtinDefinition } from "@/lib/home/builtins";
import { APP_PROMO_HTML, APP_PROMO_LEGACY_HTML } from "@/lib/home/templates";
import type { HomeData } from "@/lib/home/data";
import type { HomeModuleView } from "@/lib/home/types";

/** 只给被渲染到的字段；这些组件不该碰别的数据。 */
const data = {
  siteName: "测试站",
  announcement: "",
  homeModuleOpacity: 32,
  homeBackdropOpacity: 100,
  banner: null,
  recommend: [],
  recent: [],
  categories: [],
  tags: [],
  stats: null,
  listing: null,
  moments: [],
  albumImages: [],
  albums: [],
  siteStartedAt: "",
} as unknown as HomeData;

function promoModule(overrides: Partial<HomeModuleView> = {}): HomeModuleView {
  const definition = builtinDefinition("app-promo");
  return {
    id: 13,
    slug: "app-promo",
    name: "推荐应用",
    kind: "builtin",
    builtinKey: "app-promo",
    html: definition?.defaultCode?.html ?? "",
    css: definition?.defaultCode?.css ?? "",
    js: "",
    blocks: [],
    config: { ...definition?.defaultConfig, style: {} },
    system: true,
    ...overrides,
  };
}

function customFloatingModule(): HomeModuleView {
  return {
    id: 99,
    slug: "custom-my-popup",
    name: "自定义弹窗",
    kind: "custom",
    builtinKey: null,
    html: "<p class=\"my-popup\">hi</p>",
    css: "",
    js: "",
    blocks: [],
    config: { card: true, scopedCss: true, placement: "bottom-right", floating: true },
    system: false,
  };
}

test("PopupShell renders its own shell element", () => {
  const markup = renderToStaticMarkup(
    <PopupShell config={{}} defaultPlacement="top-right" slug="probe">
      <p>内容</p>
    </PopupShell>,
  );
  assert.match(markup, /class="home-popup home-popup--top-right/);
});

test("AppPromoModule renders its own shell", () => {
  const markup = renderToStaticMarkup(
    <AppPromoModule config={{ title: "标题" }} slug="app-promo" />,
  );
  assert.match(markup, /class="home-popup[^"]*home-app-promo/);
});

/**
 * 这一组是**回归守卫**：浮层的定位 / 关闭按钮 / 出场动画全在 PopupShell 里，
 * 正文一旦绕开外壳直接返回，卡片会静默掉进格点流里 —— 截图看着「有内容」，
 * 位置和交互全丢（P-137）。
 */
test("editable builtin with code renders inside the floating shell, not bare", () => {
  const markup = renderToStaticMarkup(<ModuleBody data={data} module={promoModule()} />);

  assert.match(markup, /class="home-popup[^"]*home-app-promo/);
  assert.match(markup, /home-custom--app-promo/);
  assert.ok(
    markup.indexOf("home-popup") < markup.indexOf("home-custom--app-promo"),
    "外壳必须在内容之前（否则内容被渲染在外壳外）",
  );
});

test("editable builtin without code falls back to the React card", () => {
  const markup = renderToStaticMarkup(
    <ModuleBody data={data} module={promoModule({ html: "", css: "", js: "" })} />,
  );
  assert.match(markup, /class="home-popup[^"]*home-app-promo/);
  assert.match(markup, /home-app-promo__title/);
  assert.ok(!markup.includes("home-custom--app-promo"), "空代码时不该渲染代码运行时");
});

test("a custom floating module also gets the shell", () => {
  const markup = renderToStaticMarkup(
    <ModuleBody data={data} module={customFloatingModule()} />,
  );
  assert.match(markup, /class="home-popup[^"]*home-popup--bottom-right/);
  assert.match(markup, /home-custom--custom-my-popup/);
});

test("a plain custom module is not wrapped in a shell", () => {
  const markup = renderToStaticMarkup(
    <ModuleBody
      data={data}
      module={{
        ...customFloatingModule(),
        id: 98,
        config: { ...customFloatingModule().config, floating: false },
      }}
    />,
  );  assert.ok(markup.includes("home-custom--custom-my-popup"));
  assert.ok(!markup.includes("home-popup"), "普通模块不该被套上覆盖层外壳");
});

/**
 * App 里不渲染「推荐应用」：人已经在 App 里了，还劝他下载 App 是自打脸。
 * 两种承载形态都要守（内置 key 与用模板建的自建卡），并且**后台预览必须照常显示**。
 */
test("App 里打开首页时，推荐应用卡片一律不渲染（含自建模板卡）", () => {
  const builtinInApp = renderToStaticMarkup(
    <ModuleBody appMode data={data} module={promoModule()} />,
  );
  assert.equal(builtinInApp, "");

  // 用模板「推荐应用」建的自建浮层：没有 builtinKey，只能靠 HTML 认出来
  const customInApp = renderToStaticMarkup(
    <ModuleBody
      appMode
      data={data}
      module={{
        ...customFloatingModule(),
        slug: "my-promo",
        name: "我的推荐卡",
        html: APP_PROMO_HTML,
      }}
    />,
  );
  assert.equal(customInApp, "");

  // 弹出模块不受影响：App 里照常弹
  const popupInApp = renderToStaticMarkup(
    <ModuleBody appMode data={data} module={customFloatingModule()} />,
  );
  assert.match(popupInApp, /home-popup/);

  // 后台预览（画布 / 模块编辑页）必须照常看得见，否则站长看不到自己配了什么
  const preview = renderToStaticMarkup(
    <ModuleBody appMode preview data={data} module={promoModule()} />,
  );
  assert.match(preview, /home-app-promo/);
});

/**
 * 「相册卡片」模块（内置 `album-cards`）：封面是这本相册的一叠照片 + 标题 + 张数 + 日期。
 * 守三件事：一叠确实按张数摆出来了（不是一张）、**首帧只有叠放态**（终态内联 left 不许出现 ——
 * 首帧就铺开 = 动画从第一帧起就不存在，见 P-160）、以及**空池时不占格**（前台 `null`）。
 */
test("相册卡片模块渲染出整本相册的卡与封面那一叠", () => {
  const album = {
    slug: "sakura",
    title: "樱花",
    description: "春天的照片",
    count: 12,
    volumeCount: 2,
    dateText: "3 月 28 日 — 4 月 2 日",
    cover: null,
    images: ["a", "b", "c"].map((key) => ({
      key,
      src: `/uploads/original/${key}.jpg`,
      thumbSrc: `/uploads/thumbs/${key}.jpg`,
      thumb2Src: `/uploads/thumbs2/${key}.jpg`,
    })),
  };
  const markup = renderToStaticMarkup(
    <AlbumCardsModule
      albums={[album]}
      config={{
        heading: "相册",
        albumSlugs: [],
        limit: HOME_ALBUM_CARD_LIMIT_DEFAULT,
      }}
    />,
  );

  assert.match(markup, /class="home-album-cards__stack"/);
  assert.equal(markup.match(/home-album-cards__layer/g)?.length, 3, "三张照片 = 三层");
  assert.match(markup, /href="\/albums\/sakura"/);
  assert.match(markup, /樱花/);
  assert.match(markup, /12 张 · 2 卷 · 3 月 28 日 — 4 月 2 日/);
  // 首帧 = 叠放态：三层的内联 left 全是 0（几何不变量，见 lib/albums/pile.ts / P-160）
  const lefts = [...markup.matchAll(/(?:^|[;" ])left:\s*([-\d.]+%)/g)].map((match) => match[1]);
  assert.equal(lefts.length, 3, "三层都要显式写首帧的 left");
  assert.deepEqual([...new Set(lefts)], ["0%"], `首帧不该出现抽出后的位置：${lefts.join(", ")}`);
  // 宽度与层次是终值（尺寸从头到尾不变），错峰交给 CSS 的 --pile-delay
  assert.equal(markup.match(/--pile-delay:/g)?.length, 3, "每层都要带自己的错峰");
  assert.equal(markup.match(/--pile-left:/g)?.length, 3, "每层都要留终态变量（reduced-motion 直接展示）");
  assert.match(markup, /z-index:3/);
  // 图一律二级缩略图（一级只做回退）；next/image 走本站 loader，URL 是百分号编码的。
  // 取的是每个 <img> 的 src 属性（srcSet 里同一条 URL 会重复十几次，数出现次数没有意义）。
  const srcs = [...markup.matchAll(/src="([^"]+)"/g)].map((match) => match[1]);
  assert.equal(srcs.length, 3, "三层各一张图");
  assert.ok(
    srcs.every((src) => src.includes("thumbs2")),
    `展示的必须是二级缩略图：${srcs.join(" | ")}`,
  );
  assert.ok(srcs.every((src) => !src.includes("original")), "原图不许进 <img src>");
});

test("相册卡片模块没有相册时前台不占内容（预览态给占位）", () => {
  const view: HomeModuleView = {
    id: 97,
    slug: "album-cards",
    name: "相册卡片",
    kind: "builtin",
    builtinKey: "album-cards",
    html: "",
    css: "",
    js: "",
    blocks: [],
    config: { heading: "相册", albumSlugs: [], limit: 4 },
    system: true,
  };
  // 只留一个标题入口（与滚动条那版 `albums` 同口径）：没有相册就不该有卡片、
  // 链接或空轨道 —— 「不占格」说的是**没有内容**，不是连标题都不渲染
  const bare = renderToStaticMarkup(<ModuleBody data={data} module={view} />);
  assert.match(bare, /home-album-cards/);
  assert.ok(!bare.includes("home-album-cards__card"), "没有相册时不该有卡片");
  assert.ok(!bare.includes('href="/albums/'), "没有相册时不该有进相册的链接");
  assert.ok(!bare.includes("home-album-cards__empty"), "前台不显示占位文案");

  assert.match(
    renderToStaticMarkup(<ModuleBody data={data} module={view} preview />),
    /还没有相册/,
    "后台画布要给出为什么空的提示",
  );
});

test("相册卡片模块按配置截断，多出来的不进渲染", () => {
  const albumAt = (index: number) => ({
    slug: `a${index}`,
    title: `相册 ${index}`,
    description: "",
    count: index,
    volumeCount: 0,
    dateText: "",
    cover: null,
    images: [],
  });
  const markup = renderToStaticMarkup(
    <AlbumCardsModule
      albums={[albumAt(1), albumAt(2), albumAt(3)]}
      config={{ heading: "相册", limit: 2 }}
    />,
  );
  assert.match(markup, /相册 1/);
  assert.match(markup, /相册 2/);
  assert.ok(!markup.includes("相册 3"), "超过配置本数的相册不该渲染");
});

test("the shipped default html matches the React card's own structure", () => {
  // 出厂代码与 React 组件是同一套类名：改了一边忘了另一边，用户会看到
  // 「我什么都没改，样子却变了」
  for (const className of [
    "home-app-promo__row",
    "home-app-promo__logo",
    "home-app-promo__copy",
    "home-app-promo__action",
  ]) {
    assert.match(APP_PROMO_HTML, new RegExp(className), `默认 HTML 缺少 ${className}`);
  }
});

test("the promo logo in the shipped html is the same mark as the React one", () => {
  // 出厂 HTML 里的方形 logo 必须就是 App 图标那条路径（不是「近似图形」）：
  // 路径数据的事实源是 lib/home/app-logo.ts，React 组件也引它
  for (const path of Object.values(APP_LOGO_PATHS)) {
    assert.ok(APP_PROMO_HTML.includes(path), `默认 HTML 的 logo 缺了路径 ${path.slice(0, 24)}…`);
  }
  assert.ok(APP_PROMO_HTML.includes(APP_LOGO_COLORS.from));
  assert.ok(APP_PROMO_HTML.includes(String(APP_LOGO_COLORS.radius)));

  const reactMarkup = renderToStaticMarkup(<AppLogoMark className="probe-logo" />);
  for (const path of Object.values(APP_LOGO_PATHS)) {
    assert.ok(reactMarkup.includes(path), "AppLogoMark 与出厂 HTML 的路径不一致");
  }
  // 同页两份 SVG 的 defs id 不能撞车（撞了第二份会引用第一份的定义）
  assert.ok(APP_PROMO_HTML.includes('id="app-logo-bg-promo"'));
  assert.ok(reactMarkup.includes('id="app-logo-bg"'));
});

test("出厂代码升版名单里的是历史版本，且与当前版不同", () => {
  // 名单的用途是「库里的 html 逐字命中某一版出厂代码才升版」：
  // 名单里必须**不含**当前版（否则每次启动都无脑覆盖），也不能是空串
  assert.ok(APP_PROMO_LEGACY_HTML.length > 0);
  for (const legacy of APP_PROMO_LEGACY_HTML) {
    assert.ok(legacy.length > 40, "历史版本存的是整份 HTML，不是特征串");
    assert.notEqual(legacy, APP_PROMO_HTML, "当前版不该出现在历史名单里");
    // 历史版的 logo 是占位图形（P-140）
    assert.ok(
      !legacy.includes(APP_LOGO_PATHS.main),
      "历史版不该含新版 logo 路径",
    );
  }
});
