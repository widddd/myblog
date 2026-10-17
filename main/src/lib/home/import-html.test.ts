import assert from "node:assert/strict";
import test from "node:test";

import {
  codeFieldForFileName,
  MODULE_CODE_MAX,
  parseModuleImport,
  splitHtmlDocument,
} from "./import-html";

test("codeFieldForFileName recognises the formats the editor accepts", () => {
  assert.equal(codeFieldForFileName("card.html"), "html");
  assert.equal(codeFieldForFileName("CARD.HTM"), "html");
  assert.equal(codeFieldForFileName("card.css"), "css");
  assert.equal(codeFieldForFileName("card.js"), "js");
  assert.equal(codeFieldForFileName("card.mjs"), "js");
  assert.equal(codeFieldForFileName("snippet.txt"), "html");
  assert.equal(codeFieldForFileName("card.md"), null);
  assert.equal(codeFieldForFileName("noextension"), null);
});

test("splitHtmlDocument moves inline style and script into their own fields", () => {
  const source = `<!doctype html>
<html>
  <head>
    <style>
      .a { color: red; }
    </style>
    <style>.b{color:blue}</style>
  </head>
  <body>
    <div class="a">hi</div>
    <script>console.log("two")</script>
    <script>console.log("one")</script>
  </body>
</html>`;

  const result = splitHtmlDocument(source);
  assert.equal(result.field, "html");
  assert.match(result.html, /<div class="a">hi<\/div>/);
  assert.ok(!result.html.includes("<style"), "style blocks must leave the HTML field");
  assert.ok(!result.html.includes("<script"), "script blocks must leave the HTML field");
  assert.equal(
    result.css,
    ".a { color: red; }\n\n.b{color:blue}",
  );
  assert.equal(result.js, 'console.log("two")\n\nconsole.log("one")');
  assert.deepEqual(result.notes, [
    "把 2 段 <style> 移到了 CSS 栏",
    "把 2 段 <script> 移到了 JS 栏",
  ]);
});

test("splitHtmlDocument keeps external scripts in the HTML", () => {
  const result = splitHtmlDocument(
    `<div>hi</div><script src="https://example.com/x.js" defer></script><script>run()</script>`,
  );
  assert.match(result.html, /<script src="https:\/\/example\.com\/x\.js" defer><\/script>/);
  assert.equal(result.js, "run()");
  assert.deepEqual(result.notes, ["把 1 段 <script> 移到了 JS 栏"]);
});

test("splitHtmlDocument leaves a plain fragment alone", () => {
  const result = splitHtmlDocument("<p>只有一段 html</p>");
  assert.equal(result.html, "<p>只有一段 html</p>");
  assert.equal(result.css, "");
  assert.equal(result.js, "");
  assert.deepEqual(result.notes, []);
});

test("splitHtmlDocument truncates instead of throwing, and says so", () => {
  const big = `<style>${"a".repeat(200)}</style>`;
  const result = splitHtmlDocument(big, 50);
  assert.equal(result.css.length, 50);
  assert.match(result.notes.join("\n"), /CSS超过 0KB，已截断/);
});

test("parseModuleImport routes by extension and keeps HTML split", () => {
  const css = parseModuleImport("theme.css", ".x{color:red}");
  assert.equal(css?.field, "css");
  assert.equal(css?.css, ".x{color:red}");
  assert.equal(css?.html, "");
  assert.equal(css?.fileName, "theme.css");

  const js = parseModuleImport("app.js", "run()");
  assert.equal(js?.field, "js");
  assert.equal(js?.js, "run()");

  const html = parseModuleImport("card.html", "<style>.a{}</style><p>x</p>");
  assert.equal(html?.field, "html");
  assert.equal(html?.html, "<p>x</p>");
  assert.equal(html?.css, ".a{}");

  assert.equal(parseModuleImport("readme.md", "# x"), null);
});

test("parseModuleImport honours the shared 32KB ceiling", () => {
  assert.equal(MODULE_CODE_MAX, 32_768);
  const huge = parseModuleImport("big.js", "x".repeat(MODULE_CODE_MAX + 10));
  assert.equal(huge?.js.length, MODULE_CODE_MAX);
  assert.match(huge?.notes.join("\n") ?? "", /JS超过 32KB，已截断/);
});
