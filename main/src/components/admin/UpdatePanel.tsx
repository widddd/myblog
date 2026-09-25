"use client";

import { useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import { AdminSection } from "@/components/admin/AdminSection";
import { DataClearDialog } from "@/components/admin/DataClearDialog";
import { useAdminConfirm } from "@/components/admin/useAdminConfirm";
import { adminJson } from "@/lib/client/admin";
import { fetchCsrfToken } from "@/lib/client/csrf";

type UpdateFile = {
  name: string;
  size: number;
  createdAt: string;
  channel?: string | null;
  version?: string | null;
  label?: string;
  packedAt?: string;
  fileCount?: number | null;
};

type PendingUpdate = {
  name: string;
  requestedAt: string;
  restartAt?: string | null;
};

type AppRelease = {
  channel: string | null;
  version: string | null;
  label: string;
};

type LastApply = {
  status: "ok" | "failed" | "skipped";
  name?: string;
  appliedAt?: string;
  error?: string;
  copied?: number;
  removed?: number;
  installed?: boolean;
  migrated?: boolean;
  built?: boolean;
};

type UpdateListResponse = {
  data: {
    files: UpdateFile[];
    pendingUpdate: PendingUpdate | null;
    restorePending?: boolean;
    lastApply?: LastApply | null;
    appRelease?: AppRelease;
  };
};

function toDatetimeLocal(iso: string | null | undefined) {
  if (!iso) {
    return "";
  }
  const parsed = new Date(iso);
  if (Number.isNaN(parsed.getTime())) {
    return "";
  }
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${parsed.getFullYear()}-${pad(parsed.getMonth() + 1)}-${pad(parsed.getDate())}T${pad(parsed.getHours())}:${pad(parsed.getMinutes())}`;
}

function formatSize(size: number) {
  if (size < 1024) {
    return `${size} B`;
  }
  if (size < 1024 * 1024) {
    return `${(size / 1024).toFixed(1)} KB`;
  }
  return `${(size / (1024 * 1024)).toFixed(2)} MB`;
}

export function UpdatePanel({
  initialFiles,
  initialPendingUpdate,
  initialRestorePending,
  initialLastApply,
  initialAppRelease,
}: {
  initialFiles: UpdateFile[];
  initialPendingUpdate: PendingUpdate | null;
  initialRestorePending: boolean;
  initialLastApply: LastApply | null;
  initialAppRelease: AppRelease;
}) {
  const router = useRouter();
  const [files, setFiles] = useState(initialFiles);
  const [pendingUpdate, setPendingUpdate] = useState(initialPendingUpdate);
  const [restorePending, setRestorePending] = useState(initialRestorePending);
  const [lastApply, setLastApply] = useState(initialLastApply);
  const [appRelease, setAppRelease] = useState(initialAppRelease);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [restarting, setRestarting] = useState(false);
  const [restartAtInput, setRestartAtInput] = useState(
    toDatetimeLocal(initialPendingUpdate?.restartAt),
  );
  const [selectedTag, setSelectedTag] = useState("");
  const [githubReleases, setGithubReleases] = useState<
    Array<{ tag: string; name: string; publishedAt: string | null; prerelease: boolean; asset: { name: string; size: number } }>
  >([]);
  const [githubRepo, setGithubRepo] = useState("");
  const uploadInputRef = useRef<HTMLInputElement>(null);
  const { confirm, dialog: confirmDialog } = useAdminConfirm();

  async function refresh() {
    const payload = await adminJson<UpdateListResponse>("/api/admin/update");
    setFiles(payload.data.files);
    setPendingUpdate(payload.data.pendingUpdate);
    setRestorePending(Boolean(payload.data.restorePending));
    setRestartAtInput(toDatetimeLocal(payload.data.pendingUpdate?.restartAt));
    setLastApply(payload.data.lastApply ?? null);
    if (payload.data.appRelease) {
      setAppRelease(payload.data.appRelease);
    }
    router.refresh();
  }

  async function waitForRestart(expectedName: string) {
    setRestarting(true);
    setNotice("正在重启并应用更新，请不要关闭本页。第一次可能要几分钟（装依赖 / 迁移 / 生产构建）。");
    let sawDowntime = false;
    const startedAt = Date.now();
    const deadline = startedAt + 180_000;
    while (Date.now() < deadline) {
      await new Promise((resolve) => window.setTimeout(resolve, 2_000));
      try {
        const payload = await adminJson<UpdateListResponse>("/api/admin/update");
        const pending = payload.data.pendingUpdate;
        if (!pending) {
          setPendingUpdate(null);
          setLastApply(payload.data.lastApply ?? null);
          setRestarting(false);
          const failed = payload.data.lastApply?.status === "failed";
          setNotice(
            failed
              ? `应用已重启，但更新失败：${payload.data.lastApply?.error ?? "未知错误"}`
              : "更新完成。",
          );
          if (failed) {
            setError(payload.data.lastApply?.error ?? "更新失败");
          }
          await refresh();
          return;
        }
        if (sawDowntime) {
          setPendingUpdate(pending);
          setRestarting(false);
          setError(
            `应用已重启，但「${expectedName}」没有更新成功。可取消预约，或点「立即重启并更新」再试。`,
          );
          return;
        }
        if (Date.now() - startedAt > 40_000 && !sawDowntime) {
          setPendingUpdate(pending);
          setRestarting(false);
          setError(
            "未能自动重启。预约已写入，请点「立即重启并更新」，或自行重启应用后再打开本页。",
          );
          return;
        }
      } catch {
        sawDowntime = true;
      }
    }
    setRestarting(false);
    setError("等待重启超时。预约已写入，请点「立即重启并更新」，或自行重启应用后再打开本页。");
  }

  async function checkGithub() {
    setError("");
    setNotice("");
    setBusy(true);
    try {
      const payload = await adminJson<{
        data: {
          repo: string;
          configured: boolean;
          releases: Array<{
            tag: string;
            name: string;
            publishedAt: string | null;
            prerelease: boolean;
            asset: { name: string; size: number };
          }>;
        };
      }>("/api/admin/update/github");
      setGithubRepo(payload.data.repo);
      setGithubReleases(payload.data.releases);
      if (!payload.data.configured) {
        setNotice("还没有填写 GitHub 仓库。请到「设置」里填 owner/repo，保存后再检查。");
        setSelectedTag("");
        return;
      }
      if (payload.data.releases.length === 0) {
        setNotice(
          `已检查 ${payload.data.repo}，没有找到名为 myblog-update-*.tar.gz 的 Release 资产。`,
        );
        setSelectedTag("");
        return;
      }
      setSelectedTag(payload.data.releases[0]?.tag ?? "");
      setNotice(`已检查 ${payload.data.repo}，共 ${payload.data.releases.length} 个可用版本。`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "检查 GitHub 更新失败");
    } finally {
      setBusy(false);
    }
  }

  async function importGithub() {
    if (!selectedTag) {
      setError("请先检查更新并选择一个版本");
      return;
    }
    const confirmed = await confirm(
      `将从 GitHub 下载「${selectedTag}」的更新包并加入列表，不会立刻覆盖正在运行的程序。\n\n确定导入？`,
    );
    if (!confirmed) {
      return;
    }
    setError("");
    setNotice("");
    setBusy(true);
    try {
      const payload = await adminJson<{ data: { name: string; label?: string; fileCount?: number } }>(
        "/api/admin/update/github",
        { method: "POST", body: JSON.stringify({ tag: selectedTag }) },
      );
      setNotice(
        `已从 GitHub 加入更新列表：「${payload.data.name}」${
          payload.data.label ? ` · ${payload.data.label}` : ""
        }。需要换程序时再点「应用」。`,
      );
      await refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "从 GitHub 导入失败");
    } finally {
      setBusy(false);
    }
  }

  async function packCurrent() {
    setError("");
    setNotice("");
    setBusy(true);
    try {
      const payload = await adminJson<{ data: { name: string; fileCount: number } }>(
        "/api/admin/update/pack",
        { method: "POST" },
      );
      setNotice(
        `已打好当前程序包「${payload.data.name}」（${payload.data.fileCount} 个文件）。可下载后拷到另一台机器导入。`,
      );
      await refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "打包失败");
    } finally {
      setBusy(false);
    }
  }

  async function uploadPackage(file: File) {
    const confirmed = await confirm(
      "将把这份程序更新包加入列表，不会立刻覆盖正在运行的程序。之后可在列表里点「应用」。\n\n确定导入？",
    );
    if (!confirmed) {
      return;
    }
    setError("");
    setNotice("");
    setBusy(true);
    try {
      const token = await fetchCsrfToken();
      const body = new FormData();
      body.set("file", file);
      const response = await fetch("/api/admin/update/upload", {
        method: "POST",
        headers: { "x-csrf-token": token },
        body,
      });
      const payload = (await response.json()) as {
        message?: string;
        data?: { name: string; label?: string; fileCount?: number };
      };
      if (!response.ok) {
        throw new Error(payload.message || "导入更新包失败");
      }
      setNotice(
        `已加入更新列表：「${payload.data?.name ?? file.name}」${
          payload.data?.label ? ` · ${payload.data.label}` : ""
        }。需要换程序时再点「应用」。`,
      );
      await refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "导入更新包失败");
    } finally {
      setBusy(false);
      if (uploadInputRef.current) {
        uploadInputRef.current.value = "";
      }
    }
  }

  async function apply(name: string) {
    const confirmed = await confirm(
      `将预约应用「${name}」。现在站点还能用，要到点或点「立刻重启」才会覆盖程序文件。\n\ndata、.env 和备份密钥不会被改。建议先打包当前程序以便回退。\n\n确定预约？`,
    );
    if (!confirmed) {
      return;
    }
    setError("");
    setNotice("");
    setBusy(true);
    try {
      await adminJson("/api/admin/update/apply", {
        method: "POST",
        body: JSON.stringify({ name, confirm: true }),
      });
      setNotice(`已预约更新「${name}」。站点照常使用，请设定重启时间或点「立刻重启」。`);
      await refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "预约更新失败");
    } finally {
      setBusy(false);
    }
  }

  async function restartPending() {
    const confirmed = await confirm(
      "将立刻重启，并用已预约的更新包覆盖当前程序文件。文章和图片不会被这份操作覆盖。确定继续？",
    );
    if (!confirmed) {
      return;
    }
    setError("");
    setNotice("");
    setBusy(true);
    try {
      const payload = await adminJson<{ data: { name: string } }>(
        "/api/admin/update/apply",
        { method: "PUT", body: JSON.stringify({ restartNow: true }) },
      );
      await waitForRestart(payload.data.name);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "重启更新失败");
      setRestarting(false);
    } finally {
      setBusy(false);
    }
  }

  async function saveRestartAt() {
    if (!restartAtInput) {
      setError("请选择预约重启时间");
      return;
    }
    const when = new Date(restartAtInput);
    if (Number.isNaN(when.getTime()) || when.getTime() <= Date.now()) {
      setError("预约重启时间必须晚于现在");
      return;
    }
    setError("");
    setNotice("");
    setBusy(true);
    try {
      await adminJson("/api/admin/update/apply", {
        method: "PUT",
        body: JSON.stringify({ restartAt: when.toISOString() }),
      });
      setNotice(`已预约在 ${when.toLocaleString("zh-CN")} 重启并更新。在此之前站点照常使用。`);
      await refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "设定重启时间失败");
    } finally {
      setBusy(false);
    }
  }

  async function cancelPending() {
    setError("");
    setNotice("");
    setBusy(true);
    try {
      await adminJson("/api/admin/update/apply", { method: "DELETE" });
      setNotice("已取消预约更新。");
      await refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "取消预约失败");
    } finally {
      setBusy(false);
    }
  }

  async function remove(name: string) {
    const confirmed = await confirm(`删除更新包「${name}」？这不会影响当前正在运行的程序。`);
    if (!confirmed) {
      return;
    }
    setError("");
    setNotice("");
    setBusy(true);
    try {
      await adminJson(`/api/admin/update/${encodeURIComponent(name)}`, {
        method: "DELETE",
      });
      setNotice("已删除。");
      await refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "删除失败");
    } finally {
      setBusy(false);
    }
  }

  const lastApplyLabel = useMemo(() => {
    if (!lastApply?.appliedAt) {
      return null;
    }
    const parsed = new Date(lastApply.appliedAt);
    const when = Number.isNaN(parsed.getTime())
      ? lastApply.appliedAt
      : parsed.toLocaleString("zh-CN");
    if (lastApply.status === "ok") {
      return `上次成功：${when}${lastApply.name ? ` · ${lastApply.name}` : ""}`;
    }
    if (lastApply.status === "failed") {
      return `上次失败：${when}${lastApply.error ? ` · ${lastApply.error}` : ""}`;
    }
    return null;
  }, [lastApply]);

  const disabled = busy || restarting;

  function handleDataClearCompleted(requiresSetup: boolean) {
    if (requiresSetup) {
      setNotice("数据与管理员账号已清空，即将进入重建管理员页面；也可停服后在 main/ 下执行 pnpm setup。");
      window.setTimeout(() => {
        router.replace("/admin/setup");
      }, 1200);
      return;
    }
    setFiles([]);
    setPendingUpdate(null);
    setRestorePending(false);
    setLastApply(null);
    setRestartAtInput("");
    setNotice("已清空文章、瞬间、评论、媒体、备份和更新暂存；站点配置保持不变。");
    router.refresh();
  }

  return (
    <div className="admin-backup">
      {restarting ? (
        <p className="admin-backup-restarting admin-danger" role="status">
          正在重启并应用更新，请不要关闭本页。第一次可能要几分钟。
        </p>
      ) : null}
      <AdminSection title="当前程序">
        <p className="admin-muted">
          {appRelease.label}
          {appRelease.channel ? `（${appRelease.channel}）` : ""}
        </p>
        {lastApplyLabel ? <p className="admin-muted">{lastApplyLabel}</p> : null}
        {restorePending ? (
          <p className="admin-danger">已有预约恢复备份。请先到「备份」页取消，才能预约更新。</p>
        ) : null}
        <div className="admin-btn-row">
          <button className="admin-btn" disabled={disabled} onClick={() => void packCurrent()} type="button">
            {disabled ? "处理中…" : "打包当前程序"}
          </button>
          <button
            className="admin-btn"
            disabled={disabled}
            onClick={() => uploadInputRef.current?.click()}
            type="button"
          >
            导入更新包
          </button>
          <input
            accept=".tar.gz,application/gzip"
            hidden
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) {
                void uploadPackage(file);
              }
            }}
            ref={uploadInputRef}
            type="file"
          />
        </div>
        <p className="admin-muted">
          打包只含程序文件，不含 data、.env 和 node_modules。导入后点「应用」只是预约，到点或立刻重启才会覆盖。
        </p>
      </AdminSection>
      <DataClearDialog disabled={disabled || restorePending} onCompleted={handleDataClearCompleted} />
      <AdminSection title="从 GitHub 检查">
        <p className="admin-muted">
          仓库在「设置」里填写。只在你点检查时向 GitHub 要公开 Release 列表，资产文件名必须是{" "}
          <code>myblog-update-*.tar.gz</code>。
        </p>
        {githubRepo ? <p className="admin-muted">当前仓库：{githubRepo}</p> : null}
        <div className="admin-btn-row">
          <button className="admin-btn" disabled={disabled} onClick={() => void checkGithub()} type="button">
            检查更新
          </button>
          {githubReleases.length > 0 ? (
            <>
              <label className="admin-field">
                选择版本
                <select
                  disabled={disabled}
                  onChange={(event) => setSelectedTag(event.target.value)}
                  value={selectedTag}
                >
                  {githubReleases.map((release) => (
                    <option key={release.tag} value={release.tag}>
                      {release.tag}
                      {release.name && release.name !== release.tag ? ` · ${release.name}` : ""}
                      {release.prerelease ? "（预发布）" : ""}
                    </option>
                  ))}
                </select>
              </label>
              <button className="admin-btn" disabled={disabled} onClick={() => void importGithub()} type="button">
                导入该版本
              </button>
            </>
          ) : null}
        </div>
      </AdminSection>
      {pendingUpdate ? (
        <div className="admin-section admin-backup-pending" role="status">
          <h3 className="admin-section__title">等待重启</h3>
          <p>
            已预约更新「{pendingUpdate.name}」。
            {restarting
              ? "正在重启并更新。"
              : pendingUpdate.restartAt
                ? `将在 ${new Date(pendingUpdate.restartAt).toLocaleString("zh-CN")} 自动重启。在此之前站点照常使用。`
                : "尚未设定重启时间，站点照常使用。"}
          </p>
          {restarting ? null : (
            <>
              <label className="admin-field">
                预约重启时间
                <input
                  min={toDatetimeLocal(new Date().toISOString())}
                  onChange={(event) => setRestartAtInput(event.target.value)}
                  type="datetime-local"
                  value={restartAtInput}
                />
              </label>
              <div className="admin-btn-row">
                <button className="admin-btn" disabled={disabled} onClick={() => void saveRestartAt()} type="button">
                  保存重启时间
                </button>
                <button className="admin-btn" disabled={disabled} onClick={() => void restartPending()} type="button">
                  立刻重启
                </button>
                <button className="admin-btn admin-btn--link" disabled={disabled} onClick={() => void cancelPending()} type="button">
                  取消预约
                </button>
              </div>
            </>
          )}
        </div>
      ) : null}
      {notice ? <p className="admin-backup-notice">{notice}</p> : null}
      {error ? (
        <p className="admin-error" role="alert">
          {error}
        </p>
      ) : null}
      <AdminSection title="已有更新包">
        {files.length === 0 ? (
          <p className="admin-muted">还没有更新包。点「打包当前程序」、「导入更新包」或从 GitHub 检查后导入，会留在这里。</p>
        ) : (
          <div className="admin-list admin-list--files">
            <div className="admin-list__head">
              <span>文件</span>
              <span>时间</span>
              <span>大小</span>
              <span>版本</span>
              <span>文件数</span>
              <span />
            </div>
            {files.map((file) => (
              <article className="admin-list__row" key={file.name}>
                <div className="admin-list__cell admin-list__cell--main" data-label="文件">
                  {file.name}
                </div>
                <div className="admin-list__cell" data-label="时间">
                  {new Date(file.createdAt).toLocaleString("zh-CN")}
                </div>
                <div className="admin-list__cell" data-label="大小">
                  {formatSize(file.size)}
                </div>
                <div className="admin-list__cell" data-label="版本">
                  {file.label ?? "未知版本"}
                </div>
                <div className="admin-list__cell" data-label="文件数">
                  {file.fileCount ?? "—"}
                </div>
                <div className="admin-list__actions">
                  <a
                    className="admin-btn admin-btn--link"
                    href={`/api/admin/update/download/${encodeURIComponent(file.name)}`}
                  >
                    下载
                  </a>
                  <button
                    className="admin-btn admin-btn--link"
                    disabled={disabled || restorePending}
                    onClick={() => void apply(file.name)}
                    type="button"
                  >
                    应用
                  </button>
                  <button
                    className="admin-btn admin-btn--link"
                    disabled={disabled}
                    onClick={() => void remove(file.name)}
                    type="button"
                  >
                    删除
                  </button>
                </div>
              </article>
            ))}
          </div>
        )}
      </AdminSection>
      {confirmDialog}
    </div>
  );
}
