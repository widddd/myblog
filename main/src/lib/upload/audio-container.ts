/**
 * 纯音频的 WebM / MP4 容器判定 —— 上传链路上**唯一**一处"看容器里有没有视频轨"的地方。
 *
 * 为什么必须有它（实测结论，见 docs/moment-audio-spec.md §2.3）：
 *  - `file-type` 判 MP4 只看 `ftyp` **主品牌**：`M4A ` → `audio/x-m4a`，
 *    其余（Android `MediaRecorder`/`MediaMuxer` 写的是 `isom`/`mp42`）→ **`video/mp4`**；
 *  - 判 WebM 只看 EBML DocType `webm`：**音频-only 的 WebM 照样是 `video/webm`**。
 * 所以浏览器录的 WebM/Opus、App 录的 M4A 会被 `validateDetectedType()` 判成 video →
 * `MEDIA_KIND_MISMATCH` 400。这里按容器结构（不是字符串嗅探）把纯音频认出来。
 *
 * 纪律：
 *  - **只在调用方声明 `kind=audio` 时才用**（`lib/upload/handle.ts` 里判），
 *    不给"把真视频伪装成音频"开后门；
 *  - **一切异常输入都返回 null**（截断、畸形、看不懂的结构）→ 调用方走原来的拒绝路径，失败关闭；
 *  - 有界：只读内存里已有的 Buffer，步数与嵌套都有上限，不递归展开、不额外分配等长缓冲。
 */

export type AudioOnlyContainer = {
  mime: "audio/mp4" | "audio/webm";
  /** 与 `lib/storage/media-keys.ts` 的扩展名白名单对齐（m4a / weba） */
  ext: "m4a" | "weba";
};

const MP4_FTYP = "ftyp";
const WEBM_EBML_ID = 0x1a45dfa3;

/** MP4 / WebM 一共最多看这么多个 box / 元素，超了就放弃（当成看不懂 → null）。 */
const MAX_ELEMENTS = 4096;

function ascii(buffer: Buffer, offset: number, length: number): string {
  if (offset < 0 || offset + length > buffer.length) {
    return "";
  }
  return buffer.toString("latin1", offset, offset + length);
}

function uint32(buffer: Buffer, offset: number): number {
  if (offset < 0 || offset + 4 > buffer.length) {
    return -1;
  }
  return buffer.readUInt32BE(offset);
}

function isMp4(buffer: Buffer): boolean {
  return buffer.length >= 12 && ascii(buffer, 4, 4) === MP4_FTYP;
}

function isWebm(buffer: Buffer): boolean {
  return buffer.length >= 4 && uint32(buffer, 0) === WEBM_EBML_ID;
}

type Mp4Box = {
  type: string;
  payloadStart: number;
  payloadEnd: number;
};

/** box / 元素走不下去时置位 —— 调用方据此**失败关闭**（看不懂就不认它是纯音频）。 */
type WalkState = { malformed: boolean };

/**
 * 遍历 `[start, end)` 里的同级 box。回调返回 `false` 即停止遍历。
 * box 头 = size(4) + type(4)；size 为 1 时跟 8 字节 largesize；size 为 0 表示"直到末尾"。
 */
function walkMp4Boxes(
  buffer: Buffer,
  start: number,
  end: number,
  state: WalkState,
  visit: (box: Mp4Box) => boolean,
): void {
  let cursor = start;
  let seen = 0;
  while (cursor + 8 <= end && seen < MAX_ELEMENTS) {
    seen += 1;
    const size = uint32(buffer, cursor);
    if (size < 0) {
      state.malformed = true;
      return;
    }
    const type = ascii(buffer, cursor + 4, 4);
    let headerSize = 8;
    let boxSize = size;
    if (size === 1) {
      if (cursor + 16 > end) {
        state.malformed = true;
        return;
      }
      const large = buffer.readBigUInt64BE(cursor + 8);
      if (large > BigInt(Number.MAX_SAFE_INTEGER)) {
        state.malformed = true;
        return;
      }
      boxSize = Number(large);
      headerSize = 16;
    } else if (size === 0) {
      boxSize = end - cursor;
    }
    if (boxSize < headerSize || cursor + boxSize > end) {
      state.malformed = true;
      return;
    }
    const payloadStart = cursor + headerSize;
    const payloadEnd = cursor + boxSize;
    if (visit({ type, payloadStart, payloadEnd }) === false) {
      return;
    }
    cursor = payloadEnd;
  }
  if (seen >= MAX_ELEMENTS) {
    state.malformed = true;
  }
}

/** moov 里逐个 trak 的 handler_type：`soun` = 音频轨，`vide` = 视频轨。 */
function mp4TrackHandlers(buffer: Buffer): { audio: boolean; video: boolean } | null {
  let found = false;
  const state: WalkState = { malformed: false };
  const handlers: string[] = [];
  walkMp4Boxes(buffer, 0, buffer.length, state, (box) => {
    if (box.type !== "moov") {
      return true;
    }
    walkMp4Boxes(buffer, box.payloadStart, box.payloadEnd, state, (trak) => {
      if (trak.type !== "trak") {
        return true;
      }
      walkMp4Boxes(buffer, trak.payloadStart, trak.payloadEnd, state, (mdia) => {
        if (mdia.type !== "mdia") {
          return true;
        }
        walkMp4Boxes(buffer, mdia.payloadStart, mdia.payloadEnd, state, (child) => {
          if (child.type !== "hdlr") {
            return true;
          }
          // hdlr: version+flags(4) + pre_defined(4) + handler_type(4)
          if (child.payloadStart + 12 > child.payloadEnd) {
            state.malformed = true;
            return true;
          }
          const handler = ascii(buffer, child.payloadStart + 8, 4);
          if (!handler) {
            state.malformed = true;
            return true;
          }
          handlers.push(handler);
          found = true;
          return true;
        });
        return true;
      });
      return true;
    });
    // moov 只有一个，找到就可以停
    return false;
  });
  if (state.malformed || !found) {
    return null;
  }
  return {
    audio: handlers.includes("soun"),
    video: handlers.includes("vide"),
  };
}

type Vint = { value: number; length: number };

/** 读 EBML 变长整数；`keepMarker` = 保留长度标记位（ID 用，size 不用）。 */
function readVint(buffer: Buffer, offset: number, keepMarker: boolean): Vint | null {
  if (offset >= buffer.length) {
    return null;
  }
  const first = buffer[offset] ?? 0;
  if (first === 0) {
    // 长度标记位不可能落在第 9 位之后
    return null;
  }
  let length = 1;
  let mask = 0x80;
  while (length <= 8 && (first & mask) === 0) {
    mask >>= 1;
    length += 1;
  }
  if (length > 8 || offset + length > buffer.length) {
    return null;
  }
  let value = keepMarker ? first : first & (mask - 1);
  for (let index = 1; index < length; index += 1) {
    value = value * 256 + (buffer[offset + index] ?? 0);
  }
  // size 字段全 1 = "未知长度"（MediaRecorder 录的 WebM 常见），用 -1 表示
  if (!keepMarker && value === 2 ** (7 * length) - 1) {
    return { value: -1, length };
  }
  return { value, length };
}

const EBML_SEGMENT = 0x18538067;
const EBML_TRACKS = 0x1654ae6b;
const EBML_TRACK_ENTRY = 0xae;
const EBML_TRACK_TYPE = 0x83;
/** 只下钻这几层：Segment → Tracks → TrackEntry；再往里没有我们要的字段。 */
const EBML_MASTERS = new Set([EBML_SEGMENT, EBML_TRACKS, EBML_TRACK_ENTRY]);

/** WebM 里每条轨的 TrackType：1 = 视频，2 = 音频。 */
function webmTrackTypes(buffer: Buffer): { audio: boolean; video: boolean } | null {
  let audio = false;
  let video = false;
  let tracks = 0;
  let elements = 0;
  // 显式栈：不递归，深度有上限
  const stack: Array<{ start: number; end: number }> = [
    { start: 0, end: buffer.length },
  ];
  let depth = 0;
  while (stack.length > 0) {
    if (depth > 4) {
      return null;
    }
    const region = stack.pop();
    if (!region) {
      break;
    }
    depth += 1;
    let cursor = region.start;
    while (cursor < region.end) {
      elements += 1;
      if (elements > MAX_ELEMENTS) {
        return null;
      }
      const id = readVint(buffer, cursor, true);
      if (!id) {
        return null;
      }
      const size = readVint(buffer, cursor + id.length, false);
      if (!size) {
        return null;
      }
      const payloadStart = cursor + id.length + size.length;
      if (payloadStart > region.end) {
        return null;
      }
      // 未知长度（-1）：按"一直到本区域末尾"处理
      const payloadEnd =
        size.value < 0 ? region.end : Math.min(payloadStart + size.value, region.end);

      if (id.value === EBML_TRACK_TYPE) {
        if (size.value < 1 || size.value > 8) {
          return null;
        }
        let value = 0;
        for (let index = 0; index < size.value; index += 1) {
          value = value * 256 + (buffer[payloadStart + index] ?? 0);
        }
        if (value === 1) {
          video = true;
        } else if (value === 2) {
          audio = true;
        }
        cursor = payloadEnd;
        continue;
      }

      if (EBML_MASTERS.has(id.value)) {
        if (id.value === EBML_TRACK_ENTRY) {
          tracks += 1;
          if (tracks > 32) {
            return null;
          }
        }
        stack.push({ start: payloadStart, end: payloadEnd });
        // 未知长度的主元素后面接什么说不准，本层到此为止
        if (size.value < 0) {
          break;
        }
      }
      cursor = payloadEnd;
    }
    depth -= 1;
  }
  if (!audio && !video) {
    return null;
  }
  return { audio, video };
}

/**
 * 判定"这是不是纯音频容器"。**只在调用方声明 `kind=audio` 时调用。**
 *
 * @returns 命中的音频 mime/ext；容器里没有音频轨、有视频轨、或结构看不懂 → `null`
 */
export function audioOnlyContainer(buffer: Buffer): AudioOnlyContainer | null {
  if (isMp4(buffer)) {
    const tracks = mp4TrackHandlers(buffer);
    if (tracks?.audio && !tracks.video) {
      return { mime: "audio/mp4", ext: "m4a" };
    }
    return null;
  }
  if (isWebm(buffer)) {
    const tracks = webmTrackTypes(buffer);
    if (tracks?.audio && !tracks.video) {
      return { mime: "audio/webm", ext: "weba" };
    }
    return null;
  }
  return null;
}
