"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import { AdminSection } from "@/components/admin/AdminSection";
import {
  BackupSchedule,
  type BackupScheduleValues,
} from "@/components/admin/BackupSchedule";
import { useAdminConfirm, useAdminPrompt } from "@/components/admin/useAdminConfirm";
import {
  backupLocationLabel as locationLabel,
  backupUploadActionLabel,
  isCosUploadInFlight as isUploadInFlight,
  type BackupCosUpload,
} from "@/lib/backup/upload-view";
import { adminJson } from "@/lib/client/admin";
import { fetchCsrfToken } from "@/lib/client/csrf";
import { readJsonResponse } from "@/lib/client/http";

type BackupFile = {
  name: string;
  size: number;
  createdAt: string;
  encrypted: boolean;
  format?: string;
  channel?: string | null;
  version?: string | null;
  releaseLabel?: string;
  keyFingerprint?: string | null;
  local?: boolean;
  cos?: boolean;
  cosUpload?: BackupCosUpload;
};

type PendingRestore = {
  name: string;
  requestedAt: string;
  restartAt?: string | null;
};

type EncryptPolicy = {
  enabled: boolean;
  userSet: boolean;
  cosHttps: boolean;
};

type AppRelease = {
  channel: string | null;
  version: string | null;
  label: string;
};

type BackupListResponse = {
  data: {
    files: BackupFile[];
    running: boolean;
    lastBackupAt: string | null;
    pendingRestore: PendingRestore | null;
    encrypt?: EncryptPolicy;
    appRelease?: AppRelease;
    cosConfigured?: boolean;
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

export function BackupPanel({
  initialFiles,
  initialLastBackupAt,
  initialPendingRestore,
  initialEncrypt,
  initialAppRelease,
  initialCosConfigured,
  initialSchedule,
}: {
  initialFiles: BackupFile[];
  initialLastBackupAt: string | null;
  initialPendingRestore: PendingRestore | null;
  initialEncrypt: EncryptPolicy;
  initialAppRelease: AppRelease;
  /** COS 配没配：决定列表要不要给「上传到 COS」的按钮与「只留本机」的说明 */
  initialCosConfigured: boolean;
  /** 自动备份那一节的设置（原先在站点设置页，2026-10 搬到这里） */
  initialSchedule: BackupScheduleValues;
}) {
  const router = useRouter();
  const [files, setFiles] = useState(initialFiles);
  const [lastBackupAt, setLastBackupAt] = useState(initialLastBackupAt);
  const [pendingRestore, setPendingRestore] = useState(initialPendingRestore);
  const [encrypt, setEncrypt] = useState(initialEncrypt);
  const [appRelease, setAppRelease] = useState(initialAppRelease);
  const [cosConfigured, setCosConfigured] = useState(initialCosConfigured);
  const [passphrase, setPassphrase] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [restarting, setRestarting] = useState(false);
  const [restartAtInput, setRestartAtInput] = useState(
    toDatetimeLocal(initialPendingRestore?.restartAt),
  );
  const uploadInputRef = useRef<HTMLInputElement>(null);
  const { confirm, dialog: confirmDialog } = useAdminConfirm();
  const { prompt, dialog: promptDialog } = useAdminPrompt();

  const lastLabel = useMemo(() => {
    if (!lastBackupAt) {
      return "尚未备份";
    }
    const parsed = new Date(lastBackupAt);
    return Number.isNaN(parsed.getTime())
      ? lastBackupAt
      : parsed.toLocaleString("zh-CN");
  }, [lastBackupAt]);

  async function refresh({ syncServer = true }: { syncServer?: boolean } = {}) {
    const payload = await adminJson<BackupListResponse>("/api/admin/backup/list");
    setFiles(payload.data.files);
    setLastBackupAt(payload.data.lastBackupAt);
    setPendingRestore(payload.data.pendingRestore);
    setRestartAtInput(toDatetimeLocal(payload.data.pendingRestore?.restartAt));
    if (payload.data.encrypt) {
      setEncrypt(payload.data.encrypt);
    }
    if (payload.data.appRelease) {
      setAppRelease(payload.data.appRelease);
    }
    if (typeof payload.data.cosConfigured === "boolean") {
      setCosConfigured(payload.data.cosConfigured);
    }
    if (syncServer) {
      router.refresh();
    }
  }

  /**
   * 有包正在后台上传时，列表自己隔几秒取一次进度——上传是「静默」的，但结果要看得见。
   * 轮询以数据变化驱动：`files` 换了新对象 → effect 再排下一次；队列空了就自然停。
   * `syncServer: false`：轮询只更新面板自己的数据，不每次去重渲染整页（那要跑一遍服务端取数）。
   */
  const uploadInFlight = files.some(isUploadInFlight);
  const pollRoundsRef = useRef(0);
  useEffect(() => {
    if (!uploadInFlight) {
      pollRoundsRef.current = 0;
      return;
    }
    // 兜底：万一状态一直卡在「上传中」（进程被打断后还没来得及补传），别无限轮询
    if (pollRoundsRef.current >= 30) {
      return;
    }
    pollRoundsRef.current += 1;
    let cancelled = false;
    const timer = window.setTimeout(() => {
      if (cancelled) {
        return;
      }
      void refresh({ syncServer: false }).catch(() => {
        // 轮询失败不弹错：下一次刷新或用户手动操作会重新同步
      });
    }, 4000);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
    // refresh 每次渲染都是新函数，这里只需要「上传中 + 列表变了」来驱动下一次轮询
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 只用 files 变化当节拍器，挂了 refresh 会自己空转
  }, [uploadInFlight, files]);

  async function setEncryptEnabled(enabled: boolean) {
    setError("");
    setNotice("");
    setBusy(true);
    try {
      const payload = await adminJson<{ data: EncryptPolicy }>(
        "/api/admin/backup/encrypt",
        { method: "PUT", body: JSON.stringify({ enabled }) },
      );
      setEncrypt(payload.data);
      setNotice(enabled ? "已打开加密备份。" : "已关闭加密备份。之后的备份将以非加密包保存，并仍可上传 COS、出现在列表里。");
      await refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "更新加密开关失败");
    } finally {
      setBusy(false);
    }
  }

  async function waitForRestartRestore(expectedName: string) {
    setRestarting(true);
    setNotice("正在重启并恢复备份，请不要关闭本页。");
    let sawDowntime = false;
    const startedAt = Date.now();
    const deadline = startedAt + 90_000;
    while (Date.now() < deadline) {
      await new Promise((resolve) => window.setTimeout(resolve, 2_000));
      try {
        const payload = await adminJson<BackupListResponse>(
          "/api/admin/backup/list",
        );
        const pending = payload.data.pendingRestore;
        if (!pending) {
          setPendingRestore(null);
          setRestarting(false);
          setNotice("恢复完成。");
          await refresh();
          return;
        }
        if (sawDowntime) {
          setPendingRestore(pending);
          setRestarting(false);
          setError(
            `应用已重启，但「${expectedName}」没有恢复成功。可取消预约，或点「立即重启并恢复」再试。`,
          );
          return;
        }
        if (Date.now() - startedAt > 20_000) {
          setPendingRestore(pending);
          setRestarting(false);
          setError(
            "未能自动重启。预约已写入，请点「立即重启并恢复」，或自行重启应用后再打开本页。",
          );
          return;
        }
      } catch {
        sawDowntime = true;
      }
    }
    setRestarting(false);
    setError(
      "等待重启超时。预约已写入，请点「立即重启并恢复」，或自行重启应用后再打开本页。",
    );
  }

  async function restartPending() {
    const confirmed = await confirm(
      "将立刻重启，并用已预约的备份覆盖当前全部文章、图片和设置。覆盖后无法用现在的数据还原。确定继续？",
    );
    if (!confirmed) {
      return;
    }
    setError("");
    setNotice("");
    setBusy(true);
    try {
      const payload = await adminJson<{ data: { name: string } }>(
        "/api/admin/backup/restore",
        { method: "PUT", body: JSON.stringify({ restartNow: true }) },
      );
      await waitForRestartRestore(payload.data.name);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "重启恢复失败");
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
      await adminJson("/api/admin/backup/restore", {
        method: "PUT",
        body: JSON.stringify({ restartAt: when.toISOString() }),
      });
      setNotice(
        `已预约在 ${when.toLocaleString("zh-CN")} 重启并恢复。在此之前站点照常使用。`,
      );
      await refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "设定重启时间失败");
    } finally {
      setBusy(false);
    }
  }

  async function restoreUpload(file: File) {
    const confirmed = await confirm(
      "将把这份备份加入列表，不会立刻覆盖当前数据。之后可在列表里点「恢复」预约。\n\n确定上传？",
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
      const response = await fetch("/api/admin/backup/restore/upload", {
        method: "POST",
        headers: { "x-csrf-token": token },
        body,
      });
      const payload = await readJsonResponse<{
        message?: string;
        data?: {
          name: string;
          encrypted?: boolean;
          releaseLabel?: string;
          cosUploadQueue?: "queued" | "skipped";
        };
      }>(response, "/api/admin/backup/restore/upload");
      if (!response.ok) {
        throw new Error(payload.message || "上传备份包失败");
      }
      const kind = payload.data?.encrypted ? "加密" : "非加密";
      const version = payload.data?.releaseLabel
        ? ` · ${payload.data.releaseLabel}`
        : "";
      const cosPart =
        payload.data?.cosUploadQueue === "queued"
          ? "，正在后台上传到 COS"
          : "";
      setNotice(
        `已加入备份列表：「${payload.data?.name ?? file.name}」（${kind}${version}）${cosPart}。需要覆盖数据时再点「恢复」。`,
      );
      await refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "上传备份包失败");
    } finally {
      setBusy(false);
      if (uploadInputRef.current) {
        uploadInputRef.current.value = "";
      }
    }
  }

  async function run() {
    setError("");
    setNotice("");
    setBusy(true);
    try {
      const payload = await adminJson<{
        data: { name: string; cosUploadQueue?: "queued" | "skipped" };
      }>("/api/admin/backup/run", {
        method: "POST",
        body: JSON.stringify({ passphrase: passphrase || undefined }),
      });
      setPassphrase("");
      const cosUpload = payload.data.cosUploadQueue;
      setNotice(
        cosUpload === "queued"
          ? `备份完成：「${payload.data.name}」已保存在本机，正在后台上传到 COS（不用等它，位置列会自己更新）。`
          : cosUpload === "skipped"
            ? `备份完成：「${payload.data.name}」已保存在本机。没有配置 COS，所以不会上云。`
            : `备份完成：「${payload.data.name}」已保存在本机。`,
      );
      await refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "备份失败");
    } finally {
      setBusy(false);
    }
  }

  /** 手动补传：给「上云失败」或上次被进程打断的本地包用（不用删掉重备一次）。 */
  async function pushToCos(name: string) {
    setError("");
    setNotice("");
    setBusy(true);
    try {
      await adminJson("/api/admin/backup/push", {
        method: "POST",
        body: JSON.stringify({ name }),
      });
      setNotice(`已把「${name}」排进 COS 上传队列，完成后位置列会变成「本地 + COS」。`);
      await refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "排队上传失败");
    } finally {
      setBusy(false);
    }
  }

  async function restore(name: string, encrypted: boolean) {
    let passphraseForRestore = "";
    if (encrypted) {
      const typed = await prompt("请输入备份口令（仅本次恢复使用，不会保存）：");
      if (typed == null) {
        return;
      }
      passphraseForRestore = typed.trim();
    }
    if (encrypted && passphraseForRestore.length < 8) {
      setError("加密备份恢复需要输入至少 8 个字符的口令");
      return;
    }
    const confirmed = await confirm(
      `将预约恢复「${name}」。现在站点还能用，要到点或点「立刻重启」才会覆盖当前数据。\n\n覆盖后无法用现在的数据还原。${encrypted ? "口令仅保存在当前进程内存，重启前不会写入文件。" : ""}\n\n确定预约？`,
    );
    if (!confirmed) {
      return;
    }
    setError("");
    setNotice("");
    setBusy(true);
    try {
      await adminJson("/api/admin/backup/restore", {
        method: "POST",
        body: JSON.stringify({
          name,
          confirm: true,
          ...(encrypted ? { passphrase: passphraseForRestore } : {}),
        }),
      });
      setNotice(
        `已预约恢复「${name}」。站点照常使用，请设定重启时间或点「立刻重启」。`,
      );
      await refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "预约恢复失败");
    } finally {
      setBusy(false);
    }
  }

  async function cancelPending() {
    setError("");
    setNotice("");
    setBusy(true);
    try {
      await adminJson("/api/admin/backup/restore", { method: "DELETE" });
      setNotice("已取消预约恢复。");
      await refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "取消失败");
    } finally {
      setBusy(false);
    }
  }

  async function pullFromCos(name: string) {
    setError("");
    setNotice("");
    setBusy(true);
    try {
      await adminJson("/api/admin/backup/pull", {
        method: "POST",
        body: JSON.stringify({ name }),
      });
      setNotice(`已从 COS 拉回「${name}」。`);
      await refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "拉回失败");
    } finally {
      setBusy(false);
    }
  }

  async function remove(name: string) {
    if (!(await confirm(`确定删除备份「${name}」？删除后无法恢复。`))) {
      return;
    }
    setError("");
    setNotice("");
    setBusy(true);
    try {
      await adminJson(`/api/admin/backup/${encodeURIComponent(name)}`, {
        method: "DELETE",
      });
      await refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "删除失败");
    } finally {
      setBusy(false);
    }
  }

  const locked = busy || restarting;
  const canRunBackup = true;

  return (
    <div className="admin-backup">
      {restarting ? (
        <p className="admin-backup-restarting admin-danger" role="status">
          正在重启并恢复备份，请不要关闭本页。
        </p>
      ) : null}
      <AdminSection title="加密">
        <label className="admin-backup-toggle">
          <input
            checked={encrypt.enabled}
            disabled={locked}
            onChange={(event) => void setEncryptEnabled(event.target.checked)}
            type="checkbox"
          />
          加密备份
        </label>
        <p className="admin-muted">
          {encrypt.cosHttps
            ? "已检测到 COS 使用 HTTPS，默认关闭加密（仍可手动打开）。"
            : "未检测到 COS HTTPS，默认打开加密。"}
          {encrypt.userSet ? " 当前是你手动设定的。" : " 当前是默认值。"}
        </p>
        <p className="admin-muted">
          加密备份不会保存口令。每次点击“立即备份”或恢复加密备份时，都必须手动输入口令。
        </p>
      </AdminSection>
      <AdminSection title="做备份">
        <p className="admin-muted">
          上次备份：{lastLabel}
          <span> · </span>
          当前版本：{appRelease.label}
        </p>
        {encrypt.enabled ? (
          <label className="admin-field">
            加密口令（每次备份临时输入，不保存）
            <input
              autoComplete="off"
              minLength={8}
              onChange={(event) => setPassphrase(event.target.value)}
              type="password"
              value={passphrase}
            />
          </label>
        ) : null}
        <div className="admin-btn-row">
          <button
            className="admin-btn"
            disabled={locked || !canRunBackup || (encrypt.enabled && passphrase.length < 8)}
            onClick={() => void run()}
            type="button"
          >
            {locked ? "处理中…" : "立即备份"}
          </button>
          <button
            className="admin-btn"
            disabled={locked}
            onClick={() => uploadInputRef.current?.click()}
            type="button"
          >
            上传备份
          </button>
          <input
            accept=".tar.gz,application/gzip"
            hidden
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) {
                void restoreUpload(file);
              }
            }}
            ref={uploadInputRef}
            type="file"
          />
        </div>
        <p className="admin-muted">
          {encrypt.enabled
            ? "当前会生成加密包；每次备份和恢复都要手动输入口令，口令不会保存。"
            : "当前会生成非加密包。备份完成后立刻可用，" +
              (cosConfigured
                ? "同时在后台上传到 COS（不用等它传完）。"
                : "还没有配置 COS，所以只保存在本机。")}
          点恢复只是预约，到点或点「立刻重启」才会覆盖。
        </p>
      </AdminSection>
      {/* 自动备份：每 N 天 + 几点几分。lastBackupAt / 加密开关都取面板自己的实时 state，
          手动备份或切开关后这节的文案立刻跟着变，不用等整页刷新 */}
      <BackupSchedule
        encryptEnabled={encrypt.enabled}
        initial={initialSchedule}
        lastBackupAt={lastBackupAt}
      />
      {pendingRestore ? (
        <div className="admin-section admin-backup-pending" role="status">
          <h3 className="admin-section__title">等待重启</h3>
          <p>
            已预约恢复「{pendingRestore.name}」。
            {restarting
              ? "正在重启并恢复。"
              : pendingRestore.restartAt
                ? `将在 ${new Date(pendingRestore.restartAt).toLocaleString("zh-CN")} 自动重启。在此之前站点照常使用。`
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
                <button
                  className="admin-btn"
                  disabled={locked}
                  onClick={() => void saveRestartAt()}
                  type="button"
                >
                  保存重启时间
                </button>
                <button
                  className="admin-btn"
                  disabled={locked}
                  onClick={() => void restartPending()}
                  type="button"
                >
                  立刻重启
                </button>
                <button
                  className="admin-btn admin-btn--link"
                  disabled={locked}
                  onClick={() => void cancelPending()}
                  type="button"
                >
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
      <AdminSection title="已有备份">
      {files.length === 0 ? (
        <p className="admin-muted">还没有备份。点「立即备份」或「上传备份」会留在这里。</p>
      ) : (
        <div className="admin-list admin-list--files">
          <div className="admin-list__head">
            <span>文件</span>
            <span>时间</span>
            <span>大小</span>
            <span>版本</span>
            <span>加密</span>
            <span>位置</span>
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
                {file.releaseLabel ?? "未知版本"}
              </div>
              <div className="admin-list__cell" data-label="加密">
                {file.encrypted
                  ? `已加密${file.keyFingerprint ? ` · ${file.keyFingerprint}` : ""}`
                  : "未加密"}
              </div>
              <div className="admin-list__cell" data-label="位置">
                {locationLabel(file)}
              </div>
              <div className="admin-list__actions">
                {file.local === false && file.cos ? (
                  <button
                    className="admin-btn admin-btn--link"
                    disabled={locked}
                    onClick={() => void pullFromCos(file.name)}
                    type="button"
                  >
                    从 COS 拉回
                  </button>
                ) : (
                  <a
                    className="admin-btn admin-btn--link"
                    href={`/api/admin/backup/download/${encodeURIComponent(file.name)}`}
                  >
                    下载
                  </a>
                )}
                {file.local !== false && !file.cos && cosConfigured ? (
                  <button
                    className="admin-btn admin-btn--link"
                    disabled={locked || isUploadInFlight(file)}
                    onClick={() => void pushToCos(file.name)}
                    title={
                      file.cosUpload?.status === "failed"
                        ? `上次上传失败：${file.cosUpload.error ?? "未知原因"}`
                        : undefined
                    }
                    type="button"
                  >
                    {backupUploadActionLabel(file)}
                  </button>
                ) : null}
                <button
                  className="admin-btn admin-btn--link"
                  disabled={locked}
                  onClick={() => void restore(file.name, file.encrypted)}
                  type="button"
                >
                  恢复
                </button>
                <button
                  className="admin-btn admin-btn--link"
                  disabled={locked}
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
      {promptDialog}
    </div>
  );
}
