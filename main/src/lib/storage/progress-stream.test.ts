import assert from "node:assert/strict";
import test from "node:test";

import { createProgressStream } from "./progress-stream";

async function drain(stream: NodeJS.ReadableStream, onChunk?: () => void) {
  const chunks: Buffer[] = [];
  for await (const chunk of stream) {
    chunks.push(Buffer.from(chunk as Uint8Array));
    onChunk?.();
  }
  return Buffer.concat(chunks);
}

test("按块被读走，进度随消费推进到整长", async () => {
  const bytes = Buffer.alloc(200 * 1024, 3);
  const seen: number[] = [];
  const stream = createProgressStream(bytes, (loaded, total) => {
    assert.equal(total, bytes.byteLength);
    seen.push(loaded);
  });

  const collected = await drain(stream);
  assert.equal(collected.byteLength, bytes.byteLength);
  assert.deepEqual(collected, bytes, "内容必须与源字节逐字节一致（包一层不能改数据）");
  assert.ok(seen.length >= 3, `应被分成多块：${seen.length}`);
  assert.equal(seen[seen.length - 1], bytes.byteLength);
  for (let index = 1; index < seen.length; index += 1) {
    assert.ok(seen[index] > seen[index - 1], `进度必须递增：${seen.join(",")}`);
  }
});

test("慢消费者：读多少报多少（不是一次性报到整长）", async () => {
  const bytes = Buffer.alloc(64 * 1024 * 4, 9);
  const seen: number[] = [];
  const stream = createProgressStream(bytes, (loaded) => seen.push(loaded), 16 * 1024);

  const collected = await drain(stream, async () => {
    await new Promise((resolve) => setTimeout(resolve, 1));
  });
  assert.equal(collected.byteLength, bytes.byteLength);
  // 每块 16 KB → 4 块；第一个回调必须是第一块，而不是整长
  assert.equal(seen[0], 16 * 1024);
  assert.ok(seen.length >= 4, `采样太少：${seen.length}`);
});

test("空数据不炸（0 字节对象照样收尾）", async () => {
  const seen: number[] = [];
  const stream = createProgressStream(Buffer.alloc(0), (loaded) => seen.push(loaded));
  const collected = await drain(stream);
  assert.equal(collected.byteLength, 0);
  assert.deepEqual(seen, []);
});

test("chunkSize 之外不影响字节完整性（含非整除长度）", async () => {
  const bytes = Buffer.from(Array.from({ length: 100_003 }, (_, i) => i % 251));
  const stream = createProgressStream(bytes, () => {}, 7 * 1024);
  const collected = await drain(stream);
  assert.equal(collected.byteLength, bytes.byteLength);
  assert.deepEqual(collected, bytes);
});
