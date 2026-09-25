"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type CSSProperties, type KeyboardEvent } from "react";
import { EyeOpenIcon, LockClosedIcon, Pencil2Icon } from "@radix-ui/react-icons";

import { AdminDialog } from "@/components/admin/AdminDialog";
import { DeleteButton } from "@/components/admin/DeleteButton";
import type { AdminPostRow } from "@/lib/admin/post-rows";

const STATUS_LABEL: Record<string, string> = {
  draft: "草稿",
  scheduled: "定时",
  published: "已发布",
};

/**
 * 发布状态的语义色档，取值照 demo 的徽章规范（与概览页「最近文章」同一套）：
 * - published → ok（绿）
 * - draft → warn（暖黄）
 * - scheduled → info（蓝）：已排期、等待生效，归到与「加密」同档的中性蓝
 * 未列出的状态一律回退 muted（中性灰），不猜颜色。
 */
const STATUS_TONE: Record<string, string> = {
  published: "ok",
  draft: "warn",
  scheduled: "info",
};

/**
 * 文章列表：点卡片弹出「查看 / 编辑」二选一（用户 2026-02 需求）。
 * - 查看：新标签打开前台文章页；草稿 / 定时 / 发布时间还没到的文章没有公开页面，这一项置灰并说明原因
 * - 编辑：进写文章页
 * 行内原有的「编辑 / 删除」保持可用，删除按钮的点击不触发二选一弹窗。
 */
export function PostListRows({ rows }: { rows: AdminPostRow[] }) {
  const router = useRouter();
  const [active, setActive] = useState<AdminPostRow | null>(null);

  function onRowKeyDown(event: KeyboardEvent<HTMLElement>, row: AdminPostRow) {
    // 行内的链接 / 按钮自己有键盘行为，这里只管"焦点在整行上"的回车与空格
    if (event.target !== event.currentTarget) {
      return;
    }
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      setActive(row);
    }
  }

  return (
    <>
      <div className="admin-list__head">
        <span>标题</span>
        <span>状态</span>
        <span>更新</span>
        <span />
      </div>
      {rows.map((row, index) => (
        <article
          className="admin-list__row admin-list__row--clickable admin-stagger"
          key={row.id}
          onClick={() => setActive(row)}
          onKeyDown={(event) => onRowKeyDown(event, row)}
          style={{ "--i": index } as CSSProperties}
          tabIndex={0}
        >
          <div className="admin-list__cell admin-list__cell--main" data-label="标题">
            {row.title}
            <span className="admin-list__badges">
              {row.pinned ? (
                <span className="admin-badge admin-badge--on">置顶</span>
              ) : null}
              {row.recommend ? (
                <span className="admin-badge admin-badge--ok">推荐</span>
              ) : null}
              {row.hasPassword ? (
                <span className="admin-badge admin-badge--info">
                  {/* demo 的「密码」徽章就是 badge--info + 12px 锁图标 */}
                  <LockClosedIcon width={12} height={12} />
                  加密
                </span>
              ) : null}
            </span>
          </div>
          <div className="admin-list__cell" data-label="状态">
            <span
              className={`admin-badge admin-badge--${STATUS_TONE[row.status] ?? "muted"}`}
            >
              <span className="admin-dot" />
              {STATUS_LABEL[row.status] ?? row.status}
            </span>
          </div>
          <div className="admin-list__cell" data-label="更新">
            {row.updatedLabel}
          </div>
          <div className="admin-list__actions">
            <Link
              className="admin-btn admin-btn--link"
              href={`/admin/posts/${row.id}/edit`}
              onClick={(event) => event.stopPropagation()}
            >
              编辑
            </Link>
            {/* 删除按钮的点击不要冒泡成"点卡片" */}
            <span onClick={(event) => event.stopPropagation()}>
              <DeleteButton
                confirmText={`确定删除「${row.title}」？删除后无法恢复。`}
                url={`/api/admin/posts/${row.id}`}
              />
            </span>
          </div>
        </article>
      ))}

      <AdminDialog
        onClose={() => setActive(null)}
        open={active !== null}
        title="这篇文章"
      >
        <p className="admin-dialog__lead">{active?.title}</p>
        <div className="admin-choice">
          {active?.canView ? (
            <a
              className="admin-choice__btn"
              href={active.href}
              onClick={() => setActive(null)}
              rel="noreferrer"
              target="_blank"
            >
              <span className="admin-choice__label">
                <EyeOpenIcon />
                查看
              </span>
              <span className="admin-choice__hint">在新标签打开前台文章页</span>
            </a>
          ) : (
            <span aria-disabled="true" className="admin-choice__btn is-disabled">
              <span className="admin-choice__label">
                <EyeOpenIcon />
                查看
              </span>
              <span className="admin-choice__hint">
                草稿 / 定时 / 未到发布时间的文章还没有公开页面
              </span>
            </span>
          )}
          <button
            className="admin-choice__btn"
            onClick={() => {
              const id = active?.id;
              setActive(null);
              if (id) {
                router.push(`/admin/posts/${id}/edit`);
              }
            }}
            type="button"
          >
            <span className="admin-choice__label">
              <Pencil2Icon />
              编辑
            </span>
            <span className="admin-choice__hint">进写文章页改正文与设置</span>
          </button>
        </div>
      </AdminDialog>
    </>
  );
}
