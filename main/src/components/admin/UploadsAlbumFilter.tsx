"use client";

import { useMemo, useRef } from "react";

import { AdminSelect } from "@/components/admin/AdminSelect";

export type UploadsAlbumFilterOption = {
  /** `""` = 全部、`"none"` = 未分类、其余 = 相册 id 字符串（与 `listAdminUploads()` 的口径一致） */
  value: string;
  label: string;
};

/**
 * 媒体库的「按相册看」筛选。用 `AdminSelect` 的浮层自绘下拉取代原生 `<select>`
 * （全站后台不再出现浏览器自带样式的下拉，媒体库页一个原生 `<select>` 都不留）。
 *
 * 服务端筛选的语义**原样保留**：外层仍是 `method="get"` 的表单，`AdminSelect` 渲染的
 * `<input type="hidden" name="album">` 照常提交；因为不再有原生 `<select>` 的
 * 「选完即提交」行为，选中后显式 `form.requestSubmit()`（与点「筛选」等效，
 * 空值 → `?album=`，不会带出脏查询串）。
 */
export function UploadsAlbumFilter({
  options,
  value,
  /** 额外要带着走的查询参数（例如媒体库的类型分区 `kind`）——否则一改相册就把类型筛选丢了 */
  hidden,
}: {
  options: UploadsAlbumFilterOption[];
  value: string;
  hidden?: Record<string, string>;
}) {
  const formRef = useRef<HTMLFormElement | null>(null);
  const selectOptions = useMemo(
    () => options.map((option) => ({ value: option.value, label: option.label })),
    [options],
  );

  return (
    <form className="admin-uploads-filter" method="get" ref={formRef}>
      {Object.entries(hidden ?? {})
        .filter(([, hiddenValue]) => hiddenValue)
        .map(([name, hiddenValue]) => (
          <input key={name} name={name} type="hidden" value={hiddenValue} />
        ))}
      <AdminSelect
        ariaLabel="按相册看"
        label="按相册看"
        name="album"
        onChange={() => formRef.current?.requestSubmit()}
        options={selectOptions}
        value={value}
      />
      <button className="admin-btn admin-btn--sm" type="submit">
        筛选
      </button>
    </form>
  );
}
