import assert from "node:assert/strict";
import { test } from "node:test";

import {
  countMomentAudios,
  countMomentVideos,
  MOMENT_AUDIO_LIMIT_ERROR,
  MOMENT_AUDIO_TOO_LONG_ERROR,
  MOMENT_EMPTY_ERROR,
  MOMENT_MAX_AUDIOS,
  MOMENT_MAX_AUDIO_MS,
  MOMENT_MAX_MEDIA_ITEMS,
  MOMENT_MAX_VIDEOS,
  MOMENT_MAX_VIDEO_MS,
  MOMENT_MEDIA_LIMIT_ERROR,
  MOMENT_VIDEO_LIMIT_ERROR,
  MOMENT_VIDEO_TOO_LONG_ERROR,
  momentClock,
  momentContentError,
  splitMomentMedia,
} from "./compose-rules";

const image = { kind: "image" as const };
const video = { kind: "video" as const };
const audio = (duration?: number) => ({ kind: "audio" as const, duration });
/** 旧数据：媒体项没有 kind 字段（当年只有图片） */
const legacy = {};
const videoWith = (duration?: number) => ({ kind: "video" as const, duration });

test("momentContentError：文字与媒体至少要有一个", () => {
  assert.equal(momentContentError({ content: "" }), MOMENT_EMPTY_ERROR);
  assert.equal(momentContentError({ content: "   " }), MOMENT_EMPTY_ERROR);
  assert.equal(momentContentError({ content: "", images: [] }), MOMENT_EMPTY_ERROR);
  // 只发媒体、只写文字都成立（需求 1：可以不发文字）
  assert.equal(momentContentError({ content: "", images: [image] }), null);
  assert.equal(momentContentError({ content: "", images: [video] }), null);
  assert.equal(momentContentError({ content: "今天天气不错" }), null);
});

test("momentContentError：一条瞬间最多 1 个视频（用户决策）", () => {
  assert.equal(MOMENT_MAX_VIDEOS, 1);
  assert.equal(momentContentError({ content: "", images: [video, image] }), null);
  assert.equal(
    momentContentError({ content: "配个视频", images: [video, image, image] }),
    null,
  );
  assert.equal(
    momentContentError({ content: "", images: [video, video] }),
    MOMENT_VIDEO_LIMIT_ERROR,
  );
});

test("momentContentError：缺 kind 的旧数据按图片算，不会撞视频上限", () => {
  assert.equal(momentContentError({ content: "", images: [legacy, legacy, legacy] }), null);
  assert.equal(countMomentVideos([legacy, image, video]), 1);
});

test("countMomentVideos 只数 kind === video 的项", () => {
  assert.equal(countMomentVideos([]), 0);
  assert.equal(countMomentVideos([image, image]), 0);
  assert.equal(countMomentVideos([image, video, legacy]), 1);
  assert.equal(countMomentVideos([video, video]), 2);
});

test("momentContentError：视频时长硬上限 30 分钟（用户决策，App 侧同一口径）", () => {
  assert.equal(MOMENT_MAX_VIDEO_MS, 30 * 60 * 1000);
  assert.equal(MOMENT_VIDEO_TOO_LONG_ERROR, "视频不能超过 30 分钟，请先剪短");
  // 超了就拦（示例就是那条 42 分钟的屏录）
  assert.equal(
    momentContentError({ content: "屏录", images: [videoWith(42 * 60 * 1000 + 1216)] }),
    MOMENT_VIDEO_TOO_LONG_ERROR,
  );
  // 正好 30 分钟算过（严格大于才拦）
  assert.equal(momentContentError({ content: "", images: [videoWith(MOMENT_MAX_VIDEO_MS)] }), null);
  assert.equal(momentContentError({ content: "", images: [videoWith(34_134)] }), null);
  // 时长拿不到（老数据 / 平台没给）时不误拦 —— 拦在客户端选择阶段，而不是把老瞬间判成非法
  assert.equal(momentContentError({ content: "", images: [videoWith(undefined)] }), null);
  assert.equal(momentContentError({ content: "", images: [video] }), null);
  // 图片不受这条约束（图片没有时长概念，带上也不判）
  assert.equal(
    momentContentError({ content: "", images: [{ kind: "image" as const, duration: 9_999_999 }] }),
    null,
  );
});

test("momentClock：m:ss / h:mm:ss（与 App 侧 clockOf 同写法）", () => {
  assert.equal(momentClock(34_000), "0:34");
  assert.equal(momentClock(2_521_216), "42:01");
  assert.equal(momentClock(3_723_000), "1:02:03");
  assert.equal(momentClock(-5), "0:00");
});

test("momentContentError：一条瞬间最多 5 条语音（用户决策，见 docs/moment-audio-spec.md）", () => {
  assert.equal(MOMENT_MAX_AUDIOS, 5);
  assert.equal(MOMENT_AUDIO_LIMIT_ERROR, "一条瞬间最多 5 条语音");
  assert.equal(
    momentContentError({ content: "", images: [audio(), audio(), audio(), audio(), audio()] }),
    null,
  );
  assert.equal(
    momentContentError({
      content: "",
      images: [audio(), audio(), audio(), audio(), audio(), audio()],
    }),
    MOMENT_AUDIO_LIMIT_ERROR,
  );
});

test("momentContentError：单条语音 ≤ 5 分钟（不是合计 5 分钟）", () => {
  assert.equal(MOMENT_MAX_AUDIO_MS, 5 * 60 * 1000);
  assert.equal(MOMENT_AUDIO_TOO_LONG_ERROR, "语音不能超过 5 分钟");
  // 正好 5:00 算过（严格大于才拦）
  assert.equal(momentContentError({ content: "", images: [audio(MOMENT_MAX_AUDIO_MS)] }), null);
  assert.equal(
    momentContentError({ content: "", images: [audio(MOMENT_MAX_AUDIO_MS + 1)] }),
    MOMENT_AUDIO_TOO_LONG_ERROR,
  );
  // 5 条各 4:59 ≈ 25 分钟：**按单条判**，不该被"合计"口径误拦
  const fourFiveNine = 4 * 60 * 1000 + 59 * 1000;
  assert.equal(
    momentContentError({
      content: "",
      images: Array.from({ length: 5 }, () => audio(fourFiveNine)),
    }),
    null,
  );
  // 时长拿不到（发布端没探测出来）时不误拦
  assert.equal(momentContentError({ content: "", images: [audio(undefined)] }), null);
});

test("momentContentError：图片 / 视频与语音可混发，各走各的上限", () => {
  assert.equal(
    momentContentError({ content: "", images: [image, image, video, audio(), audio()] }),
    null,
  );
  // 非音频仍然 ≤ 9（语音不占这个名额）
  assert.equal(MOMENT_MAX_MEDIA_ITEMS, 9);
  assert.equal(
    momentContentError({
      content: "",
      images: [...Array.from({ length: 9 }, () => image), audio(), audio()],
    }),
    null,
  );
  assert.equal(
    momentContentError({
      content: "",
      images: [...Array.from({ length: 10 }, () => image), audio()],
    }),
    MOMENT_MEDIA_LIMIT_ERROR,
  );
  // 语音条数上限不因为夹了图片而放宽
  assert.equal(
    momentContentError({
      content: "",
      images: [...Array.from({ length: 6 }, () => audio()), image],
    }),
    MOMENT_AUDIO_LIMIT_ERROR,
  );
});

test("countMomentAudios 只数 kind === audio 的项", () => {
  assert.equal(countMomentAudios([]), 0);
  assert.equal(countMomentAudios([image, video, legacy]), 0);
  assert.equal(countMomentAudios([audio(), image, audio()]), 2);
});

test("splitMomentMedia：语音单独成区，顺序不变（展示分区的唯一入口）", () => {
  const first = { kind: "image" as const, key: "a" };
  const voice = { kind: "audio" as const, key: "voice" };
  const second = { kind: "video" as const, key: "b" };
  const third = { kind: "image" as const, key: "c" };
  const { visual, audios } = splitMomentMedia([first, voice, second, third]);
  assert.deepEqual(visual.map((item) => item.key), ["a", "b", "c"]);
  assert.deepEqual(audios.map((item) => item.key), ["voice"]);
  // 缺 kind 的旧数据按图片算（落在 visual）
  assert.deepEqual(splitMomentMedia([legacy]).visual, [legacy]);
  assert.deepEqual(splitMomentMedia([legacy]).audios, []);
});

test("momentContentError：只有语音也能发（正文可空）", () => {
  assert.equal(momentContentError({ content: "   ", images: [audio()] }), null);
});
