import assert from "node:assert/strict";
import { test } from "node:test";

import { pushLiveBar } from "@/lib/moments/peaks";

import {
  baseMime,
  liveSampleIndexFor,
  microphoneErrorMessage,
  pickVoiceMime,
  VOICE_LIVE_SLOTS,
  VOICE_LIVE_WINDOW_MS,
  VOICE_MIME_CANDIDATES,
  VOICE_SAMPLE_MS,
  voiceExtension,
  voiceFileName,
  voiceMimeForStore,
} from "./voice-recorder";

test("实时波形是「固定 10 秒窗口」：槽位数 = 窗口 ÷ 采样间隔", () => {
  // 用户口径：一行只显示十秒钟，前 10 秒从左往右长，之后滚动，永远显示过去 10 秒
  assert.equal(VOICE_LIVE_WINDOW_MS, 10_000);
  assert.equal(VOICE_SAMPLE_MS, 100);
  assert.equal(VOICE_LIVE_SLOTS, 100);
});

test("实时波形方向：从最左开始向右长，满了之后整条向左滚（用户口径）", () => {
  // 槽位 0（最左）= 窗口里最旧那根；槽位 99（最右）= 最新那根（数组 0 = 最旧）
  assert.equal(liveSampleIndexFor(0), 0);
  assert.equal(liveSampleIndexFor(99), 99);
  // 录到 3 秒（30 根）：只占最左边连续的 0…29
  const slotsFor30 = Array.from({ length: VOICE_LIVE_SLOTS }, (_, slot) => slot).filter(
    (slot) => liveSampleIndexFor(slot) < 30,
  );
  assert.equal(slotsFor30[0], 0);
  assert.equal(slotsFor30[slotsFor30.length - 1], 29);
  // 再录一根：数组头被丢掉，同一槽位显示原来后一根 → 视觉上整条向左滚
  const before = Array.from({ length: VOICE_LIVE_SLOTS }, (_, index) => index % 100);
  const after = pushLiveBar(before, 100, VOICE_LIVE_SLOTS);
  assert.deepEqual(before.slice(0, 2), [0, 1]);
  assert.deepEqual(after.slice(0, 2), [1, 2]);
  assert.equal(after[after.length - 1], 100);
  assert.equal(liveSampleIndexFor(100), 99, "越界槽位夹到最右");
  assert.equal(liveSampleIndexFor(-1), 0, "越界下标夹到最左");
});

test("pickVoiceMime：按优先级挑第一个浏览器支持的 mime", () => {
  assert.equal(
    pickVoiceMime((mime) => mime === "audio/webm;codecs=opus"),
    "audio/webm;codecs=opus",
  );
  // 两个都支持时选排在前面的（WebM/Opus 体积与兼容性都更好）
  assert.equal(pickVoiceMime(() => true), VOICE_MIME_CANDIDATES[0]);
  // Safari 只认 mp4
  assert.equal(pickVoiceMime((mime) => mime === "audio/mp4"), "audio/mp4");
  // 一个都不支持 → null，交给 new MediaRecorder(stream) 自己挑
  assert.equal(pickVoiceMime(() => false), null);
  // 探测本身抛错也不能把整条录音链路带崩
  assert.equal(
    pickVoiceMime(() => {
      throw new Error("isTypeSupported blew up");
    }),
    null,
  );
});

test("baseMime：带参数的 mime 不能直接进媒体库", () => {
  assert.equal(baseMime("audio/webm;codecs=opus"), "audio/webm");
  assert.equal(baseMime("AUDIO/MP4"), "audio/mp4");
  assert.equal(baseMime("audio/ogg; codecs=opus"), "audio/ogg");
  // 不是音频一律不认（免得把视频 mime 写进瞬间 JSON）
  assert.equal(baseMime("video/webm"), "");
  assert.equal(baseMime(null), "");
  assert.equal(baseMime(undefined), "");
});

test("voiceMimeForStore：拿不到就按 audio/webm 兜底", () => {
  assert.equal(voiceMimeForStore("audio/webm;codecs=opus"), "audio/webm");
  assert.equal(voiceMimeForStore(""), "audio/webm");
  assert.equal(voiceMimeForStore(undefined), "audio/webm");
});

test("voiceExtension：与存储层的音频扩展名白名单对齐", () => {
  assert.equal(voiceExtension("audio/webm;codecs=opus"), "webm");
  assert.equal(voiceExtension("audio/ogg"), "ogg");
  assert.equal(voiceExtension("audio/mp4"), "m4a");
  assert.equal(voiceExtension("audio/x-m4a"), "m4a");
  assert.equal(voiceExtension(null), "webm");
});

test("voiceFileName：时间戳 + 跟着 mime 的扩展名", () => {
  assert.equal(
    voiceFileName("audio/mp4", Date.UTC(2026, 0, 2, 3, 4, 5)),
    "voice-2026-01-02-03-04-05.m4a",
  );
  assert.equal(
    voiceFileName("audio/webm;codecs=opus", Date.UTC(2026, 0, 2, 3, 4, 5)),
    "voice-2026-01-02-03-04-05.webm",
  );
});

test("microphoneErrorMessage：每种失败都翻译成一句人话", () => {
  assert.match(microphoneErrorMessage({ name: "NotAllowedError" }), /权限/);
  assert.match(microphoneErrorMessage({ name: "SecurityError" }), /权限/);
  assert.match(microphoneErrorMessage({ name: "NotFoundError" }), /没有可用的麦克风/);
  assert.match(microphoneErrorMessage({ name: "NotReadableError" }), /占用/);
  assert.match(microphoneErrorMessage({ name: "NotSupportedError" }), /不支持/);
  // 不认识的错误也要有兜底文案（不能把 DOMException 的名字丢给站长）
  assert.ok(microphoneErrorMessage(new Error("boom")).length > 0);
  assert.ok(microphoneErrorMessage(undefined).length > 0);
  assert.ok(microphoneErrorMessage("字符串也接").length > 0);
});
