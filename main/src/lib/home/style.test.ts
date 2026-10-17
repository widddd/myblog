import assert from "node:assert/strict";
import test from "node:test";

import {
  colorInputValue,
  isColorValue,
  moduleStyleProps,
  moduleStyleVars,
  normalizeModuleStyle,
  styledAttributeNames,
} from "./style";

test("normalizeModuleStyle keeps only what was actually written", () => {
  // 「什么都没配」必须是空对象：渲染侧据此判断该不该下发变量，
  // 一旦这里塞进默认值，没配过的模块就会被默认样式覆盖掉站点主题（P-137）。
  assert.deepEqual(normalizeModuleStyle(undefined), {});
  assert.deepEqual(normalizeModuleStyle(null), {});
  assert.deepEqual(normalizeModuleStyle("nope"), {});
  assert.deepEqual(normalizeModuleStyle({}), {});
  assert.deepEqual(normalizeModuleStyle({ fontFamily: "inherit", align: "left" }), {});
  assert.deepEqual(normalizeModuleStyle({ buttonFull: false, shadow: true, bgDim: 0 }), {});
});

test("normalizeModuleStyle clamps numbers and drops unknown keys", () => {
  const style = normalizeModuleStyle({
    fontSize: 999,
    radius: -5,
    padding: 12.6,
    unknownKey: "x",
    buttonRadius: 4000,
  });
  assert.equal(style.fontSize, 22);
  assert.equal(style.radius, 0);
  assert.equal(style.padding, 13);
  assert.equal(style.buttonRadius, 999);
  assert.ok(!("unknownKey" in style));
});

test("normalizeModuleStyle rejects anything that is not a safe CSS color", () => {
  assert.equal(isColorValue("#abc"), true);
  assert.equal(isColorValue("#A1B2C3"), true);
  assert.equal(isColorValue("#11223344"), true);
  assert.equal(isColorValue("rgba(0, 0, 0, 0.4)"), true);
  assert.equal(isColorValue("hsl(210 40% 50%)"), true);
  assert.equal(isColorValue("var(--heo-theme)"), true);
  // 这些是「往 style 属性里塞任意 CSS」的入口，必须挡住
  assert.equal(isColorValue("red;background:url(javascript:alert(1))"), false);
  assert.equal(isColorValue("expression(alert(1))"), false);
  assert.equal(isColorValue("url(https://example.com/x.png)"), false);
  assert.equal(isColorValue(""), false);
  assert.equal(isColorValue(42), false);

  assert.deepEqual(normalizeModuleStyle({ textColor: "红色" }), {});
});

test("normalizeModuleStyle only lets in local uploads or https background images", () => {
  assert.equal(
    normalizeModuleStyle({ bgImage: "https://example.com/a.png" }).bgImage,
    "https://example.com/a.png",
  );
  assert.equal(
    normalizeModuleStyle({ bgImage: "/api/uploads/images/ab/hash.png" }).bgImage,
    "/api/uploads/images/ab/hash.png",
  );
  assert.equal(normalizeModuleStyle({ bgImage: "http://example.com/a.png" }).bgImage, undefined);
  assert.equal(normalizeModuleStyle({ bgImage: "javascript:alert(1)" }).bgImage, undefined);
  assert.equal(
    normalizeModuleStyle({ bgImage: 'x" onload="alert(1)' }).bgImage,
    undefined,
  );
});

test("moduleStyleVars emits nothing for an empty style", () => {
  assert.deepEqual(moduleStyleVars({}), {});
  assert.equal(styledAttributeNames({}), "");
  assert.deepEqual(moduleStyleProps({}), { style: {} });
});

test("moduleStyleVars maps every configured field", () => {
  const vars = moduleStyleVars({
    fontFamily: "mono",
    fontSize: 15,
    textColor: "#cccccc",
    headingColor: "#ffffff",
    background: "#101010",
    accent: "#4db8e8",
    radius: 18,
    padding: 20,
    align: "center",
    buttonText: "#4db8e8",
    buttonTextColor: "#ffffff",
    buttonRadius: 999,
    buttonFull: true,
    shadow: false,
    bgImage: "https://example.com/a.png",
    bgDim: 40,
  });

  assert.match(vars["--mod-font"], /monospace/);
  assert.equal(vars["--mod-font-size"], "15px");
  assert.equal(vars["--mod-text"], "#cccccc");
  assert.equal(vars["--mod-heading"], "#ffffff");
  assert.equal(vars["--mod-bg"], "#101010");
  assert.equal(vars["--mod-accent"], "#4db8e8");
  assert.equal(vars["--mod-radius"], "18px");
  assert.equal(vars["--mod-padding"], "20px");
  assert.equal(vars["--mod-align"], "center");
  assert.equal(vars["--mod-btn-bg"], "#4db8e8");
  assert.equal(vars["--mod-btn-text"], "#ffffff");
  assert.equal(vars["--mod-btn-radius"], "999px");
  assert.equal(vars["--mod-btn-width"], "100%");
  assert.equal(vars["--mod-shadow"], "none");
  assert.equal(vars["--mod-bg-image"], 'url("https://example.com/a.png")');
  assert.equal(vars["--mod-bg-dim"], "0.4");
});

test("styledAttributeNames lists exactly the variables that exist", () => {
  const style = { textColor: "#fff", radius: 8 };
  assert.deepEqual(styledAttributeNames(style).split(" ").sort(), [
    "--mod-radius",
    "--mod-text",
  ]);
  const props = moduleStyleProps(style);
  assert.deepEqual(Object.keys(props.style).sort(), ["--mod-radius", "--mod-text"]);
  assert.equal(props["data-mod-style"], "--mod-text --mod-radius");
});

test("colorInputValue feeds <input type=color> a real hex", () => {
  assert.equal(colorInputValue("#ABC"), "#aabbcc");
  assert.equal(colorInputValue("#a1b2c3"), "#a1b2c3");
  assert.equal(colorInputValue("rgba(0,0,0,.4)", "#123456"), "#123456");
  assert.equal(colorInputValue("var(--heo-theme)", "#123456"), "#123456");
  assert.equal(colorInputValue(undefined, "#ffffff"), "#ffffff");
});
