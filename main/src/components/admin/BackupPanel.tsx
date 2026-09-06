"use client";

import { useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import { adminJson } from "@/lib/client/admin";
import { fetchCsrfToken } from "@/lib/client/csrf";

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
    passphraseConfigured?: boolean;
    encrypt?: EncryptPolicy;
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

export function BackupPanel({
  initialFiles,
  initialLastBackupAt,
  initialPendingRestore,
  initialPassphraseConfigured,
  initialEncrypt,
  initialAppRelease,
}: {
  initialFiles: BackupFile[];
  initialLastBackupAt: string | null;
  initialPendingRestore: PendingRestore | null;
  initialPassphraseConfigured: boolean;
  initialEncrypt: EncryptPolicy;
  initialAppRelease: AppRelease;
}) {
  const router = useRouter();
  const [files, setFiles] = useState(initialFiles);
  const [lastBackupAt, setLastBackupAt] = useState(initialLastBackupAt);
  const [pendingRestore, setPendingRestore] = useState(initialPendingRestore);
  const [passphraseConfigured, setPassphraseConfigured] = useState(
    initialPassphraseConfigured,
  );
  const [encrypt, setEncrypt] = useState(initialEncrypt);
  const [appRelease, setAppRelease] = useState(initialAppRelease);
  const [passphrase, setPassphrase] = useState("");
  const [passphraseConfirm, setPassphraseConfirm] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [restarting, setRestarting] = useState(false);
  const [restartAtInput, setRestartAtInput] = useState(
    toDatetimeLocal(initialPendingRestore?.restartAt),
  );
  const uploadInputRef = useRef<HTMLInputElement>(null);

  const lastLabel = useMemo(() => {
    if (!lastBackupAt) {
      return "尚未备份";
    }
    const parsed = new Date(lastBackupAt);
    return Number.isNaN(parsed.getTime())
      ? lastBackupAt
      : parsed.toLocaleString("zh-CN");
  }, [lastBackupAt]);

  async function refresh() {
    const payload = await adminJson<BackupListResponse>("/api/admin/backup/list");
    setFiles(payload.data.files);
    setLastBackupAt(payload.data.lastBackupAt);
    setPendingRestore(payload.data.pendingRestore);
    setRestartAtInput(toDatetimeLocal(payload.data.pendingRestore?.restartAt));
    if (typeof payload.data.passphraseConfigured === "boolean") {
      setPassphraseConfigured(payload.data.passphraseConfigured);
    }
    if (payload.data.encrypt) {
      setEncrypt(payload.data.encrypt);
    }
    if (payload.data.appRelease) {
      setAppRelease(payload.data.appRelease);
    }
    router.refresh();
  }

  async function savePassphrase() {
    setError("");
    setNotice("");
    setBusy(true);
    try {
      await adminJson("/api/admin/backup/passphrase", {
        method: "POST",
        body: JSON.stringify({
          passphrase,
          confirm: passphraseConfirm,
        }),
      });
      setPassphrase("");
      setPassphraseConfirm("");
      setPassphraseConfigured(true);
      setNotice("备份口令已设定，之后不能再改。");
      await refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "设定备份口令失败");
    } finally {
      setBusy(false);
    }
  }

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
    const confirmed = window.confirm(
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
    const confirmed = window.confirm(
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
      const payload = (await response.json()) as {
        message?: string;
        data?: { name: string; encrypted?: boolean; releaseLabel?: string };
      };
      if (!response.ok) {
        throw new Error(payload.message || "上传备份包失败");
      }
      const kind = payload.data?.encrypted ? "加密" : "非加密";
      const version = payload.data?.releaseLabel
        ? ` · ${payload.data.releaseLabel}`
        : "";
      setNotice(
        `已加入备份列表：「${payload.data?.name ?? file.name}」（${kind}${version}）。需要覆盖数据时再点「恢复」。`,
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
      await adminJson("/api/admin/backup/run", { method: "POST" });
      await refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "备份失败");
    } finally {
      setBusy(false);
    }
  }

  async function restore(name: string) {
    const confirmed = window.confirm(
      `将预约恢复「${name}」。现在站点还能用，要到点或点「立刻重启」才会覆盖当前数据。\n\n覆盖后无法用现在的数据还原。换电脑恢复加密包请用 pnpm restore --passphrase。\n\n确定预约？`,
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
        body: JSON.stringify({ name, confirm: true }),
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
    if (!window.confirm(`确定删除备份「${name}」？删除后无法恢复。`)) {
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
  const canRunBackup = !encrypt.enabled || passphraseConfigured;

  return (
    <div className="admin-backup">
      {restarting ? (
        <p className="admin-backup-restarting admin-danger" role="status">
          正在重启并恢复备份，请不要关闭本页。
        </p>
      ) : null}
      <div className="admin-section">
        <h3 className="admin-section__title">加密</h3>
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
        {passphraseConfigured ? (
          <p className="admin-muted">备份口令已经设好，不能再改。</p>
        ) : (
          <form
            className="admin-form"
            onSubmit={(event) => {
              event.preventDefault();
              void savePassphrase();
            }}
          >
            <p className="admin-muted">
              打开加密前需要先设备份口令。只能设一次，设完不能改。不加密备份不需要口令。
            </p>
            <p className="admin-danger">口令设完不能改，请先记下来。</p>
            <label className="form-field">
              备份口令
              <input
                autoComplete="new-password"
                minLength={8}
                onChange={(event) => setPassphrase(event.target.value)}
                required
                type="password"
                value={passphrase}
              />
            </label>
            <label className="form-field">
              再输入一次
              <input
                autoComplete="new-password"
                minLength={8}
                onChange={(event) => setPassphraseConfirm(event.target.value)}
                required
                type="password"
                value={passphraseConfirm}
              />
            </label>
            <div className="admin-form-actions">
              <button className="heo-button" disabled={locked} type="submit">
                {locked ? "处理中…" : "设定备份口令"}
              </button>
            </div>
          </form>
        )}
      </div>
      <div className="admin-section">
        <h3 className="admin-section__title">做备份</h3>
        <p className="admin-muted">
          上次备份：{lastLabel}
          <span> · </span>
          当前版本：{appRelease.label}
        </p>
        <div className="admin-form-actions">
          <button
            className="heo-button"
            disabled={locked || !canRunBackup}
            onClick={() => void run()}
            type="button"
          >
            {locked ? "处理中…" : "立即备份"}
          </button>
          <button
            className="heo-button"
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
        {encrypt.enabled && !passphraseConfigured ? (
          <p className="admin-muted">设好备份口令后才能做加密备份。也可以先关掉加密再备份。</p>
        ) : (
          <p className="admin-muted">
            {encrypt.enabled
              ? "当前会生成加密包。只拿走文件打不开。"
              : "当前会生成非加密包。会保存到列表，配置了 COS 时也会上传。"}
            点恢复只是预约，到点或点「立刻重启」才会覆盖。
          </p>
        )}
      </div>
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
              <label className="form-field">
                预约重启时间
                <input
                  min={toDatetimeLocal(new Date().toISOString())}
                  onChange={(event) => setRestartAtInput(event.target.value)}
                  type="datetime-local"
                  value={restartAtInput}
                />
              </label>
              <div className="admin-form-actions">
                <button
                  className="heo-button"
                  disabled={locked}
                  onClick={() => void saveRestartAt()}
                  type="button"
                >
                  保存重启时间
                </button>
                <button
                  className="heo-button"
                  disabled={locked}
                  onClick={() => void restartPending()}
                  type="button"
                >
                  立刻重启
                </button>
                <button
                  className="admin-link-button"
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
        <p className="form-error" role="alert">
          {error}
        </p>
      ) : null}
      <div className="admin-section">
        <h3 className="admin-section__title">已有备份</h3>
      {files.length === 0 ? (
        <p className="admin-muted">还没有备份。点「立即备份」或「上传备份」会留在这里。</p>
      ) : (
        <table className="admin-table">
          <thead>
            <tr>
              <th>文件</th>
              <th>时间</th>
              <th>大小</th>
              <th>版本</th>
              <th>加密</th>
              <th>位置</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {files.map((file) => (
              <tr key={file.name}>
                <td>{file.name}</td>
                <td>{new Date(file.createdAt).toLocaleString("zh-CN")}</td>
                <td>{formatSize(file.size)}</td>
                <td>{file.releaseLabel ?? "未知版本"}</td>
                <td>
                  {file.encrypted
                    ? `已加密${file.keyFingerprint ? ` · ${file.keyFingerprint}` : ""}`
                    : "未加密"}
                </td>
                <td>
                  {file.local === false && file.cos
                    ? "仅 COS"
                    : file.cos
                      ? "本地 + COS"
                      : "本地"}
                </td>
                <td className="admin-table-actions">
                  {file.local === false && file.cos ? (
                    <button
                      className="admin-link-button"
                      disabled={locked}
                      onClick={() => void pullFromCos(file.name)}
                      type="button"
                    >
                      从 COS 拉回
                    </button>
                  ) : (
                    <a href={`/api/admin/backup/download/${encodeURIComponent(file.name)}`}>
                      下载
                    </a>
                  )}
                  <button
                    className="admin-link-button"
                    disabled={locked}
                    onClick={() => void restore(file.name)}
                    type="button"
                  >
                    恢复
                  </button>
                  <button
                    className="admin-link-button"
                    disabled={locked}
                    onClick={() => void remove(file.name)}
                    type="button"
                  >
                    删除
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      </div>
    </div>
  );
}
