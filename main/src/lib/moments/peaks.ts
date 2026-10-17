/**
 * 语音波形峰值：**纯函数、跨端一致**（服务端 RSC 与浏览器 hydration 都算同一串数字）。
 *
 * 为什么不用 `Math.random()` / `Math.sin()`：前者每次渲染都变（水合直接对不上），
 * 后者是平台实现定义的浮点结果，服务端 Node 与浏览器可能差最后一两位。
 * 这里全部走整数运算（FNV-1a + LCG + 整数除法），同一 `key` 永远得到同一串峰值。
 *
 * 峰值口径：每项 0–100 的整数（0 = 静音），最多 `MOMENT_PEAK_BUCKETS` 个。
 * 见 docs/moment-audio-spec.md §2.1 / §2.6。
 */

/** 波形条数（瞬间播放行与发布区列表共用一套长度，改这里就够）。 */
export const MOMENT_PEAK_BUCKETS = 48;

/** 单个峰值的上限（百分比）。 */
export const MOMENT_PEAK_MAX = 100;

/** 实时波形：低于这个振幅当作静音，免得静音段抖出一排跳动的细刺。 */
export const MOMENT_SILENCE_AMPLITUDE = 0.008;

function clampBuckets(buckets: number): number {
  if (!Number.isFinite(buckets)) {
    return MOMENT_PEAK_BUCKETS;
  }
  return Math.min(240, Math.max(1, Math.floor(buckets)));
}

function clampPeak(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }
  return Math.min(MOMENT_PEAK_MAX, Math.max(0, Math.round(value)));
}

/** 0–1 的振幅（RMS / 峰值）→ 0–100 的波形高度；开方曲线让人声小音量也看得见。 */
export function peakFromAmplitude(amplitude: number): number {
  if (!Number.isFinite(amplitude) || amplitude <= MOMENT_SILENCE_AMPLITUDE) {
    return 0;
  }
  return clampPeak(Math.sqrt(Math.min(1, amplitude)) * 100);
}

/**
 * 实时波形的推进入口：末尾追加一根，超过 `max` 就从头部丢掉（= 波形整体向左走）。
 * 返回新数组（React state 用），不改入参。
 */
export function pushLiveBar(bars: number[], value: number, max: number): number[] {
  const limit = clampBuckets(max);
  const next = [...bars, clampPeak(value)];
  return next.length > limit ? next.slice(next.length - limit) : next;
}

/**
 * 重采样到固定条数：每个目标桶取组内**最大值**（而不是平均）——
 * 平均会把语音的尖峰抹平成一条带子，看起来就不像波形了。
 */
export function resamplePeaks(values: number[], buckets: number): number[] {
  const count = clampBuckets(buckets);
  if (values.length === 0) {
    return [];
  }
  if (values.length <= count) {
    return values.map(clampPeak);
  }
  const result: number[] = [];
  for (let index = 0; index < count; index += 1) {
    const start = Math.floor((index * values.length) / count);
    const end = Math.max(start + 1, Math.floor(((index + 1) * values.length) / count));
    let peak = 0;
    for (let cursor = start; cursor < end && cursor < values.length; cursor += 1) {
      peak = Math.max(peak, clampPeak(values[cursor] ?? 0));
    }
    result.push(peak);
  }
  return result;
}

/**
 * 从库里读出来的 `peaks`（JSON，可能是任何东西）→ 可直接渲染的整数数组。
 * 不是非空数组 / 全部非法 → `null`（调用方走确定性图案兜底）。
 */
export function normalizePeaks(
  raw: unknown,
  buckets: number = MOMENT_PEAK_BUCKETS,
): number[] | null {
  if (!Array.isArray(raw) || raw.length === 0) {
    return null;
  }
  const values: number[] = [];
  for (const item of raw) {
    if (typeof item === "number" && Number.isFinite(item)) {
      values.push(clampPeak(item));
    }
  }
  if (values.length === 0) {
    return null;
  }
  return resamplePeaks(values, buckets);
}

function fnv1a(seed: string): number {
  let hash = 0x811c9dc5;
  for (let index = 0; index < seed.length; index += 1) {
    hash ^= seed.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash >>> 0;
}

/**
 * 没有真实采样时的确定性波形（按媒体 key 生成，同一段音频每次渲染完全一样）。
 * 形状：低频"词"包络 + 高频抖动 + 两端收口，整数运算、跨端一致。
 */
export function pseudoPeaks(seed: string, buckets: number = MOMENT_PEAK_BUCKETS): number[] {
  const count = clampBuckets(buckets);
  let state = fnv1a(seed) || 1;
  let envelope = 600;
  const result: number[] = [];
  for (let index = 0; index < count; index += 1) {
    if (index % 4 === 0) {
      state = (Math.imul(state, 1103515245) + 12345) >>> 0;
      envelope = 300 + ((state >>> 16) % 700);
    }
    state = (Math.imul(state, 1103515245) + 12345) >>> 0;
    const noise = (state >>> 16) % 1000;
    // 0..999：65% 来自慢包络、35% 来自抖动
    const level = Math.floor((envelope * 65 + noise * 35) / 1000);
    const amplitude = 300 + Math.floor((level * 700) / 1000);
    // 两端收口：第 0 根最低，第 5 根起满幅
    const taper = Math.min(index, count - 1 - index, 5) * 200;
    const shape = 450 + Math.floor((taper * 550) / 1000);
    result.push(Math.floor((amplitude * shape) / 10_000));
  }
  return result;
}

/** 渲染端唯一入口：有真峰值用真的，没有就用确定性图案。 */
export function peaksFor(
  media: { key: string; peaks?: unknown },
  buckets: number = MOMENT_PEAK_BUCKETS,
): number[] {
  return normalizePeaks(media.peaks, buckets) ?? pseudoPeaks(media.key, buckets);
}
