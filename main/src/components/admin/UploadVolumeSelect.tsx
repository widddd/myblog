"use client";

import { useMemo } from "react";

import { AdminSelect } from "@/components/admin/AdminSelect";
import type { AlbumVolumeOption } from "@/lib/albums/types";

/** 「暂不分类」= 不指定卷（`volumeId = null`），永远排在选项第一行。 */
const NONE_LABEL = "暂不分类";

/**
 * 卷下拉：`AdminSelect` 的**薄封装**，保留「卷」这一族原来的调用点签名
 * （`value` / `volumes` / `onChange(number | null)` / `label`），
 * 上传预览弹窗与媒体库卡片两处都直接用它，不必各自把 `volumes` 拼成 options。
 *
 * 为什么还留这个文件：语义在这一层——`volumes` 是「某个相册的卷」而不是通用选项，
 * 「暂不分类」固定第一行、`volumes` 为空时退化成只有它一项（相册还没建卷，不报错、也不挡上传）、
 * `null` = 不指定卷，这三条都由这里兜住；去掉它就得让两个调用点各写一遍同样的映射。
 *
 * - 只在选中了相册之后才渲染它（卷必须属于相册，不变量见 lib/albums/admin.ts）；
 * - 展开是**浮层**（`AdminSelect` 内部 portal 到 body），不再把下面的内容顶下去。
 */
export function UploadVolumeSelect({
  disabled = false,
  label = "归入卷",
  onChange,
  value,
  volumes,
}: {
  disabled?: boolean;
  label?: string;
  onChange: (next: number | null) => void;
  value: number | null;
  volumes: AlbumVolumeOption[];
}) {
  const options = useMemo(
    () => [
      { value: null, label: NONE_LABEL },
      ...volumes.map((volume) => ({ value: volume.id, label: volume.title })),
    ],
    [volumes],
  );

  return (
    <AdminSelect
      ariaLabel={label}
      disabled={disabled}
      label={label}
      onChange={(next) => onChange(typeof next === "number" ? next : null)}
      options={options}
      placeholder={NONE_LABEL}
      value={value}
    />
  );
}
