import {
  UPLOAD_KIND_FILTERS,
  type UploadKindFilterValue,
} from "@/lib/uploads/kind-filter";
import { cn } from "@/lib/utils/cn";

/** 类型分区取值与解析在 `lib/uploads/kind-filter.ts`（纯逻辑，有单测）——这里只管画。 */
export { parseUploadKindFilter } from "@/lib/uploads/kind-filter";

/**
 * 媒体库的类型筛选。
 *
 * 刻意做成**纯服务端 GET 表单**（不引客户端状态）：四个按钮各自是一个 `name="kind"` 的提交按钮，
 * 相册筛选的值用隐藏字段带着走 —— 两个筛选条件互不吞掉对方，刷新/分享链接都还是同一个结果。
 * 与 `UploadsAlbumFilter`（相册那侧）合起来正好是「哪一类 + 哪个相册」两个维度。
 */
export function UploadsKindFilter({
  album,
  value,
}: {
  /** 当前相册筛选值（`""` / `none` / 相册 id 字符串），点类型按钮时要保住它 */
  album: string;
  value: UploadKindFilterValue;
}) {
  return (
    <form className="admin-uploads-kinds" method="get">
      {album ? <input name="album" type="hidden" value={album} /> : null}
      {UPLOAD_KIND_FILTERS.map((option) => (
        <button
          aria-pressed={option.value === value}
          className={cn(
            "admin-uploads-kinds__btn",
            option.value === value && "is-current",
          )}
          key={option.value}
          name="kind"
          type="submit"
          value={option.value}
        >
          {option.label}
        </button>
      ))}
    </form>
  );
}
