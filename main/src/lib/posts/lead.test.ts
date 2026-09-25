import assert from "node:assert/strict";
import test from "node:test";

import { leadFromContent, LEAD_MAX_CHARS } from "./lead";

test("leadFromContent keeps frontmatter out of the card lead", () => {
  const source = [
    "---",
    "title: 无封面的文章",
    "excerpt: ''",
    "---",
    "",
    "# 开头就是正文",
    "",
    "第一段文字，用来当卡片上的开头。",
  ].join("\n");

  assert.equal(
    leadFromContent(source),
    "开头就是正文 第一段文字，用来当卡片上的开头。",
  );
});

test("leadFromContent drops markup, code and media, keeps readable text", () => {
  const source = [
    "import { Video } from \"@/components/post/Video\";",
    "",
    "```ts",
    "const secret = 1;",
    "```",
    "",
    "> 引用开头。",
    "",
    "![图](/api/uploads/images/a-content.webp)",
    "",
    '<Video src="/api/uploads/videos/a-original.mp4" />',
    "",
    "1. 有序清单里的正文，**加粗** 与 [链接文字](https://example.com) 都应是纯文本。",
    "",
    "| 列一 | 列二 |",
    "| --- | --- |",
    "| 单元甲 | 单元乙 |",
  ].join("\n");

  const lead = leadFromContent(source);

  assert.equal(
    lead,
    "引用开头。 有序清单里的正文，加粗 与 链接文字 都应是纯文本。 列一 列二 单元甲 单元乙",
  );
  assert.doesNotMatch(lead ?? "", /secret|uploads|example\.com|<\w/);
});

test("leadFromContent returns null when there is nothing readable", () => {
  assert.equal(leadFromContent(""), null);
  assert.equal(leadFromContent("```\ncode only\n```"), null);
  assert.equal(leadFromContent("![只有图](/api/uploads/images/a-content.webp)"), null);
});

test("leadFromContent truncates by code point and never splits a surrogate pair", () => {
  const lead = leadFromContent("🙂".repeat(LEAD_MAX_CHARS + 20));

  assert.equal(Array.from(lead ?? "").length, LEAD_MAX_CHARS);
  assert.equal(lead, "🙂".repeat(LEAD_MAX_CHARS));
});
