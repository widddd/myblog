import assert from "node:assert/strict";
import test from "node:test";

import {
  registerLocalPreview,
  registerLocalPreviews,
  releaseLocalPreview,
  releaseLocalPreviews,
  resolveLocalPreview,
} from "./local-preview";

function imageFile(name: string): File {
  return new File([`fake-bytes-${name}`], name, { type: "image/png" });
}

test("登记后按服务端地址能取到本机 blob；没登记过返回 null", () => {
  const url = "/api/uploads/media/images/original/aa/demo.png";
  assert.equal(resolveLocalPreview(url), null);

  const blobUrl = registerLocalPreview(imageFile("demo.png"), url);
  assert.ok(blobUrl?.startsWith("blob:"), `期望 blob URL，拿到 ${blobUrl}`);
  assert.equal(resolveLocalPreview(url), blobUrl);
  // 空值一律当"没有本机预览"，调用方直接回退到原地址
  assert.equal(resolveLocalPreview(""), null);
  assert.equal(resolveLocalPreview(null), null);
  assert.equal(resolveLocalPreview(undefined), null);

  releaseLocalPreview(url);
});

test("同一地址重复登记只留第一份（同一张图选两次不多占内存）", () => {
  const url = "/api/uploads/media/images/original/bb/twice.png";
  const first = registerLocalPreview(imageFile("a.png"), url);
  const second = registerLocalPreview(imageFile("b.png"), url);
  assert.equal(second, first);

  releaseLocalPreview(url);
  assert.equal(resolveLocalPreview(url), null);
});

test("回收会真的 revoke 掉 blob（谁创建谁回收，见 P-150）", () => {
  const revoked: string[] = [];
  const original = URL.revokeObjectURL;
  URL.revokeObjectURL = (url: string) => {
    revoked.push(url);
  };
  try {
    const url = "/api/uploads/media/images/original/cc/revoke.png";
    const blobUrl = registerLocalPreview(imageFile("c.png"), url) ?? "";
    releaseLocalPreview(url);
    assert.deepEqual(revoked, [blobUrl]);
    assert.equal(resolveLocalPreview(url), null);
    // 再回收一次是安全的（重复删除不该重复 revoke）
    releaseLocalPreview(url);
    assert.equal(revoked.length, 1);
  } finally {
    URL.revokeObjectURL = original;
  }
});

test("批量登记按位对齐（本机文件与上传结果一一对应）", () => {
  const urls = [
    "/api/uploads/media/images/original/dd/one.png",
    "/api/uploads/media/images/original/dd/two.png",
  ];
  registerLocalPreviews([imageFile("one.png"), imageFile("two.png")], urls);
  assert.ok(resolveLocalPreview(urls[0]));
  assert.ok(resolveLocalPreview(urls[1]));

  releaseLocalPreviews(urls);
  assert.equal(resolveLocalPreview(urls[0]), null);
  assert.equal(resolveLocalPreview(urls[1]), null);
});

test("没有 blob 能力时安全降级为「没有本机预览」", () => {
  const original = URL.createObjectURL;
  // @ts-expect-error 故意破坏，验证调用方不会因此报错
  URL.createObjectURL = undefined;
  try {
    assert.equal(
      registerLocalPreview(
        imageFile("d.png"),
        "/api/uploads/media/images/original/ee/unsupported.png",
      ),
      null,
    );
  } finally {
    URL.createObjectURL = original;
  }
});
