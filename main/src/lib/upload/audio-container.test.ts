import assert from "node:assert/strict";
import { test } from "node:test";

import { audioOnlyContainer } from "./audio-container";

/** 造一个 MP4 box：size(4) + type(4) + payload。`large` 走 64 位 largesize 那条分支。 */
function mp4Box(type: string, payload: Buffer, options: { large?: boolean } = {}): Buffer {
  if (options.large) {
    const head = Buffer.alloc(16);
    head.writeUInt32BE(1, 0);
    head.write(type, 4, "latin1");
    head.writeBigUInt64BE(BigInt(payload.length + 16), 8);
    return Buffer.concat([head, payload]);
  }
  const head = Buffer.alloc(8);
  head.writeUInt32BE(payload.length + 8, 0);
  head.write(type, 4, "latin1");
  return Buffer.concat([head, payload]);
}

/** hdlr：version+flags(4) + pre_defined(4) + handler_type(4) + reserved 尾巴。 */
function hdlr(handler: string): Buffer {
  const payload = Buffer.alloc(20);
  payload.write(handler, 8, "latin1");
  return mp4Box("hdlr", payload);
}

function trak(handler: string): Buffer {
  return mp4Box("trak", mp4Box("mdia", hdlr(handler)));
}

/** 一个像 Android MediaRecorder / Safari 产物的 MP4：主品牌不是 `M4A `。 */
function mp4(
  handlers: string[],
  options: { moovLast?: boolean; largeMoov?: boolean } = {},
): Buffer {
  const ftyp = mp4Box("ftyp", Buffer.from("isomiso2mp41", "latin1"));
  const moov = mp4Box("moov", Buffer.concat(handlers.map(trak)), {
    large: options.largeMoov,
  });
  const mdat = mp4Box("mdat", Buffer.alloc(16));
  return options.moovLast
    ? Buffer.concat([ftyp, mdat, moov])
    : Buffer.concat([ftyp, moov, mdat]);
}

const EBML_HEADER = 0x1a45dfa3;
const SEGMENT = 0x18538067;
const TRACKS = 0x1654ae6b;
const TRACK_ENTRY = 0xae;
const TRACK_TYPE = 0x83;
const INFO = 0x1549a966;
/** Segment 长度"未知"（MediaRecorder 边录边写的 WebM 常见形态） */
const UNKNOWN_SIZE = Buffer.from([0x01, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff]);

function ebmlId(id: number): Buffer {
  const bytes: number[] = [];
  let value = id;
  while (value > 0) {
    bytes.unshift(value & 0xff);
    value = Math.floor(value / 256);
  }
  return Buffer.from(bytes);
}

function ebmlSize(size: number): Buffer {
  if (size < 0x7f) {
    return Buffer.from([0x80 | size]);
  }
  return Buffer.from([0x40 | (size >> 8), size & 0xff]);
}

function element(id: number, payload: Buffer): Buffer {
  return Buffer.concat([ebmlId(id), ebmlSize(payload.length), payload]);
}

function trackEntry(trackType: number): Buffer {
  return element(TRACK_ENTRY, element(TRACK_TYPE, Buffer.from([trackType])));
}

function webm(
  trackTypes: number[],
  options: { unknownSegmentSize?: boolean } = {},
): Buffer {
  const header = element(EBML_HEADER, Buffer.from([0x42, 0x86, 0x81, 0x01, 0x77, 0x65]));
  const tracks = element(TRACKS, Buffer.concat(trackTypes.map(trackEntry)));
  const segment = options.unknownSegmentSize
    ? Buffer.concat([ebmlId(SEGMENT), UNKNOWN_SIZE, tracks, element(INFO, Buffer.alloc(4))])
    : element(SEGMENT, tracks);
  return Buffer.concat([header, segment]);
}

test("MP4：只有音频轨（soun）→ 认成 audio/mp4", () => {
  assert.deepEqual(audioOnlyContainer(mp4(["soun"])), {
    mime: "audio/mp4",
    ext: "m4a",
  });
  // moov 写在文件末尾（录制产物的常见形态）照样认
  assert.deepEqual(audioOnlyContainer(mp4(["soun"], { moovLast: true })), {
    mime: "audio/mp4",
    ext: "m4a",
  });
  // 64 位 largesize 的 moov
  assert.deepEqual(audioOnlyContainer(mp4(["soun"], { largeMoov: true })), {
    mime: "audio/mp4",
    ext: "m4a",
  });
});

test("MP4：带视频轨 / 没有可识别的轨道 → null（失败关闭）", () => {
  assert.equal(audioOnlyContainer(mp4(["soun", "vide"])), null);
  assert.equal(audioOnlyContainer(mp4(["vide"])), null);
  assert.equal(audioOnlyContainer(mp4([])), null);
  // 截断在 moov 之前
  assert.equal(audioOnlyContainer(mp4(["soun"]).subarray(0, 20)), null);
  // 只有 ftyp，没有 moov
  assert.equal(audioOnlyContainer(mp4Box("ftyp", Buffer.from("isom", "latin1"))), null);
});

test("WebM：只有音频轨（TrackType=2）→ 认成 audio/webm", () => {
  assert.deepEqual(audioOnlyContainer(webm([2])), {
    mime: "audio/webm",
    ext: "weba",
  });
  // Segment 长度未知（边录边写）：照样能顺着 Tracks 找下去
  assert.deepEqual(audioOnlyContainer(webm([2], { unknownSegmentSize: true })), {
    mime: "audio/webm",
    ext: "weba",
  });
});

test("WebM：带视频轨 / 只有字幕轨 / 截断 → null（失败关闭）", () => {
  assert.equal(audioOnlyContainer(webm([2, 1])), null);
  assert.equal(audioOnlyContainer(webm([1])), null);
  assert.equal(audioOnlyContainer(webm([0x11])), null);
  assert.equal(audioOnlyContainer(webm([])), null);
  // 截断在 Segment 的 ID 中间
  assert.equal(audioOnlyContainer(webm([2]).subarray(0, 12)), null);
  // 只留 EBML 头
  assert.equal(audioOnlyContainer(webm([2]).subarray(0, 9)), null);
});

test("两类容器都不像 → null（别的格式不归它管）", () => {
  assert.equal(audioOnlyContainer(Buffer.alloc(0)), null);
  assert.equal(audioOnlyContainer(Buffer.from("hello world, not media")), null);
  // 有 MP4 的 ftyp 但整体是垃圾
  const fake = Buffer.concat([Buffer.from("0000ftypisom", "latin1"), Buffer.alloc(8, 0xff)]);
  assert.equal(audioOnlyContainer(fake), null);
  // 有 WebM 的 EBML 头但整体是垃圾
  const fakeWebm = Buffer.concat([Buffer.from([0x1a, 0x45, 0xdf, 0xa3]), Buffer.alloc(8, 0xff)]);
  assert.equal(audioOnlyContainer(fakeWebm), null);
});
