import assert from "node:assert/strict";
import test from "node:test";

import {
  bucketFeedCursor,
  FEED_BUCKET_MS,
} from "@/lib/feed/query";
import {
  MOMENT_NOTIFY_CHARS,
  momentFingerprint,
  momentImageKinds,
  momentNotifyText,
  parseFeedCursor,
  postFingerprint,
  postNotifyText,
  resolveFeedLimit,
  toFeedMomentItem,
  toFeedPostItem,
} from "@/lib/feed/updates";

test("since 三种结果：合法 / 缺省 / 非法", () => {
  const ok = parseFeedCursor("2026-10-05T03:04:05Z");
  assert.equal(ok.mode, "since");
  assert.equal(
    ok.mode === "since" ? ok.value.toISOString() : null,
    "2026-10-05T03:04:05.000Z",
  );

  assert.equal(parseFeedCursor(null).mode, "latest");
  assert.equal(parseFeedCursor("").mode, "latest");
  assert.equal(parseFeedCursor("   ").mode, "latest");

  assert.equal(parseFeedCursor("昨天").mode, "invalid");
  // 少一段时区信息的日期字符串会被 Date 当 UTC 午夜解析 → 客户端时区上错位一天，必须判非法
  assert.equal(parseFeedCursor("2026-10-05").mode, "invalid");
  assert.equal(parseFeedCursor("2026-13-45T99:99:99Z").mode, "invalid");
});

test("limit 收口到 1..50，非法值退回默认", () => {
  assert.equal(resolveFeedLimit("8"), 8);
  assert.equal(resolveFeedLimit("0"), 1);
  assert.equal(resolveFeedLimit("-3"), 1);
  assert.equal(resolveFeedLimit("999"), 50);
  assert.equal(resolveFeedLimit("abc"), 20);
  assert.equal(resolveFeedLimit(null), 20);
  assert.equal(resolveFeedLimit(null, 5), 5);
});

test("瞬间通知文案：压空白 + 超长截断", () => {
  assert.equal(momentNotifyText("  今天  风很大\n\n出门了 "), "今天 风很大 出门了");
  const long = "字".repeat(MOMENT_NOTIFY_CHARS + 10);
  const text = momentNotifyText(long);
  assert.equal(text.length, MOMENT_NOTIFY_CHARS + 1);
  assert.equal(text.endsWith("…"), true);
});

test("只发媒体不发文字的瞬间：通知文案不能是空行", () => {
  // 需求 1（瞬间可以不发文字）：通知栏得有话说
  assert.equal(momentNotifyText("", [{ kind: "image" }]), "分享了一张图片");
  assert.equal(momentNotifyText("   ", [{ kind: "video" }]), "分享了一个视频");
  // 混排里有视频就按视频说；缺 kind 的旧数据按图片算
  assert.equal(
    momentNotifyText("", [{ kind: "image" }, { kind: "video" }]),
    "分享了一个视频",
  );
  assert.equal(momentNotifyText("", [{}, {}]), "分享了一张图片");
  assert.equal(momentNotifyText("", []), "（无文字）");
  assert.equal(momentNotifyText(""), "（无文字）");
});

test("只发语音的瞬间：通知文案说「语音」，不能当成图片", () => {
  assert.equal(momentNotifyText("", [{ kind: "audio" }]), "发了一段语音");
  // 混排里有语音就按语音说（比"发了张图"更贴近内容）
  assert.equal(
    momentNotifyText("   ", [{ kind: "image" }, { kind: "audio" }]),
    "发了一段语音",
  );
  assert.equal(
    momentNotifyText("", [{ kind: "video" }, { kind: "audio" }]),
    "发了一段语音",
  );
});

test("momentImageKinds：JSON 字符串 / 数组 / 脏值都收得住", () => {
  assert.deepEqual(momentImageKinds('[{"kind":"video"},{"kind":"image"}]'), [
    { kind: "video" },
    { kind: "image" },
  ]);
  // 旧数据没有 kind：一律当图片（与 lib/moments/types.ts 的 momentMediaKind 同口径）
  assert.deepEqual(momentImageKinds('[{"key":"a/b.jpg"}]'), [{ kind: "image" }]);
  assert.deepEqual(momentImageKinds([{ kind: "video" }]), [{ kind: "video" }]);
  // 语音要能跟"缺 kind = 图片"分开（否则通知里会把语音说成图片）
  assert.deepEqual(momentImageKinds('[{"kind":"audio"},{"kind":"image"}]'), [
    { kind: "audio" },
    { kind: "image" },
  ]);
  assert.deepEqual(momentImageKinds("not json"), []);
  assert.deepEqual(momentImageKinds(null), []);
  assert.deepEqual(momentImageKinds(undefined), []);
});

test("文章通知正文：有摘要用摘要，没有退回标题", () => {
  assert.equal(
    postNotifyText({ title: "标题", excerpt: "  一句\n摘要  " }),
    "一句 摘要",
  );
  assert.equal(postNotifyText({ title: "标题", excerpt: null }), "标题");
  assert.equal(postNotifyText({ title: "标题", excerpt: "   " }), "标题");
});

test("行 → 载荷：瞬间带锚点链接，文章按 publishedAt 优先", () => {
  const moment = toFeedMomentItem({
    id: 7,
    content: "刚到山上",
    createdAt: new Date("2026-10-05T01:02:03Z"),
  });
  assert.deepEqual(moment, {
    id: 7,
    href: "/moments#moment-7",
    text: "刚到山上",
    createdAt: "2026-10-05T01:02:03.000Z",
  });

  const post = toFeedPostItem(
    {
      publicId: "abc123",
      slug: "hello",
      title: "你好",
      excerpt: null,
      publishedAt: new Date("2026-10-04T00:00:00Z"),
      createdAt: new Date("2026-10-01T00:00:00Z"),
    },
    "/posts/abc123/hello",
  );
  assert.equal(post.href, "/posts/abc123/hello");
  assert.equal(post.publishedAt, "2026-10-04T00:00:00.000Z");
  assert.equal(post.createdAt, "2026-10-01T00:00:00.000Z");

  // publishedAt 为空（排期表里还没落时间）时退回 createdAt，不能让 App 拿到 null
  const noDate = toFeedPostItem(
    {
      publicId: "abc124",
      slug: "later",
      title: "稍后",
      excerpt: "摘要",
      publishedAt: null,
      createdAt: new Date("2026-10-02T00:00:00Z"),
    },
    "/posts/abc124/later",
  );
  assert.equal(noDate.publishedAt, "2026-10-02T00:00:00.000Z");
});

test("指纹不含正文：改标题/改正文不会重复推送", () => {
  assert.equal(momentFingerprint(7), "moment:7");
  assert.equal(postFingerprint("abc123"), "post:abc123");
});

test("游标桶化：向下对齐到 15 秒，null 保持 null", () => {
  assert.equal(bucketFeedCursor(null), null);
  const aligned = bucketFeedCursor(new Date("2026-10-05T03:04:05.123Z"));
  assert.equal(
    aligned?.toISOString(),
    new Date(Math.floor(Date.parse("2026-10-05T03:04:05.123Z") / FEED_BUCKET_MS) * FEED_BUCKET_MS)
      .toISOString(),
  );
  assert.equal((aligned?.getTime() ?? 0) % FEED_BUCKET_MS, 0);
});
