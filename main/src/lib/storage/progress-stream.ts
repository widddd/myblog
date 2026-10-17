import { Readable } from "node:stream";

/**
 * 把一段字节包成「边被消费、边报进度」的流。
 *
 * 为什么不能用 SDK 自带的 `onProgress`：COS SDK 的简单上传（`putObject`）把进度挂在
 * 请求对象的 `drain` 事件上（`base.js`：`sender.on('drain', …)` 用
 * `socket.bytesWritten - 头部长度` 算），实测**一个 4 MB 的 Buffer body 只回调 2 次**
 * （0 和整长）——拿它画进度条就是「从头卡到尾」。而把 body 换成流之后，流是按 socket 的
 * 回压一段段被读走的：实测同一个 4 MB 对象被读走 **64 次**（每次 64 KB），
 * 所以「被读走的字节数」就是真实的传输进度。
 *
 * ⚠️ 代价（改动时必须知道）：SDK 对**流** body 不做自动重试
 * （`base.js` 里 `!(params.body && params.body.pipe)` 才会重试），所以调用方要自己重试，
 * 并且**每次重试都要重新建流**（流是一次性的）。
 */
export function createProgressStream(
  data: Uint8Array,
  onProgress: (loaded: number, total: number) => void,
  chunkSize = 64 * 1024,
): Readable {
  const buffer = Buffer.isBuffer(data) ? data : Buffer.from(data);
  const total = buffer.byteLength;
  const size = Math.max(1, Math.min(chunkSize, total || 1));
  let loaded = 0;

  return new Readable({
    read() {
      if (loaded >= total) {
        this.push(null);
        return;
      }
      const end = Math.min(loaded + size, total);
      this.push(buffer.subarray(loaded, end));
      loaded = end;
      onProgress(loaded, total);
    },
  });
}
