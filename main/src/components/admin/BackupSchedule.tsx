"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";

import { AdminSection } from "@/components/admin/AdminSection";
import { UsageMeter, UsageRow } from "@/components/admin/UsageMeter";
import {
  BACKUP_LIMITS,
  nextBackupDueMs,
  validateBackupSchedule,
} from "@/lib/backup/schedule";
import { adminJson } from "@/lib/client/admin";
import type { LocalStorageUsage } from "@/lib/uploads/usage-format";

export type BackupScheduleValues = {
  backupPeriodDays: number;
  backupAtTime: string;
  backupKeep: number;
  backupLocalMaxMB: number;
};

/**
 * 「自动备份」设置：每 N 天 + 几点几分自动打包。
 *
 * 这一节原先长在 `/admin/settings`（站点设置页），2026-10 搬到备份页——周期备份本来就是
 * 备份这件事的一部分，用户找「自动备份」时先想到的是备份页。Setting 仍是同一批键
 * （`backupPeriodDays` / `backupAtTime` / `backupKeep` / `backupLocalMaxMB`）。
 *
 * 时间口径见 `lib/backup/schedule.ts`：**服务器本地时间**，判定锚点是「上次备份那天 + N 天的 HH:MM」。
 */
export function BackupSchedule({
  initial,
  lastBackupAt,
  encryptEnabled,
}: {
  initial: BackupScheduleValues;
  lastBackupAt: string | null;
  encryptEnabled: boolean;
}) {
  const router = useRouter();
  const [values, setValues] = useState(initial);
  const [usage, setUsage] = useState<LocalStorageUsage | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [saving, setSaving] = useState(false);
  const [scanning, setScanning] = useState(false);

  const nextDueMs = useMemo(
    () =>
      nextBackupDueMs(
        lastBackupAt,
        Number(values.backupPeriodDays),
        values.backupAtTime,
      ),
    [lastBackupAt, values.backupAtTime, values.backupPeriodDays],
  );

  const lastLabel = useMemo(() => {
    if (!lastBackupAt) {
      return "尚未备份";
    }
    const parsed = new Date(lastBackupAt);
    return Number.isNaN(parsed.getTime())
      ? lastBackupAt
      : parsed.toLocaleString("zh-CN");
  }, [lastBackupAt]);

  /** 下一次自动备份那句话：加密时不会跑 / 没备份过会先补一份 / 其余给具体时间 */
  const nextLabel = useMemo(() => {
    if (encryptEnabled) {
      return "已开启加密：自动备份不会执行，到点要你自己点「立即备份」并输入口令。";
    }
    if (nextDueMs === null) {
      return "还没备份过：保存后 1 分钟内会自动先备一份。";
    }
    return `下次自动备份：${new Date(nextDueMs).toLocaleString("zh-CN")}（服务器本地时间）。`;
  }, [encryptEnabled, nextDueMs]);

  async function scanUsage() {
    setError("");
    setNotice("");
    setScanning(true);
    try {
      const payload = await adminJson<{ data: LocalStorageUsage }>(
        "/api/admin/settings/usage",
        { method: "POST" },
      );
      setUsage(payload.data);
      setNotice("已扫描本机占用。");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "扫描失败");
    } finally {
      setScanning(false);
    }
  }

  async function save() {
    setError("");
    setNotice("");
    // 范围与格式先在本地拦一道：设置 API 的 Zod 默认报错是英文，不该端到用户脸上（P-122）。
    // 区间与接口共用 lib/backup/schedule.ts 的 BACKUP_LIMITS / validateBackupSchedule。
    const problem = validateBackupSchedule({
      backupPeriodDays: Number(values.backupPeriodDays),
      backupAtTime: values.backupAtTime,
      backupKeep: Number(values.backupKeep),
      backupLocalMaxMB: Number(values.backupLocalMaxMB),
    });
    if (problem) {
      setError(problem);
      return;
    }

    setSaving(true);
    try {
      const payload = await adminJson<{ data: BackupScheduleValues }>(
        "/api/admin/settings",
        {
          method: "PUT",
          body: JSON.stringify({
            backupPeriodDays: Number(values.backupPeriodDays),
            backupAtTime: values.backupAtTime,
            backupKeep: Number(values.backupKeep),
            backupLocalMaxMB: Number(values.backupLocalMaxMB),
          }),
        },
      );
      setValues({
        backupPeriodDays: payload.data.backupPeriodDays,
        backupAtTime: payload.data.backupAtTime,
        backupKeep: payload.data.backupKeep,
        backupLocalMaxMB: payload.data.backupLocalMaxMB,
      });
      setNotice("已保存。调度器每分钟对一次点，到点后 1 分钟内开始备份。");
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "保存失败");
    } finally {
      setSaving(false);
    }
  }

  const locked = saving || scanning;

  return (
    <AdminSection title="自动备份">
      <form
        className="admin-form"
        onSubmit={(event) => {
          event.preventDefault();
          void save();
        }}
      >
        <p className="admin-muted">
          按「每几天 + 时刻」自动备份数据库与本地图片。时刻是<strong>服务器本地时间</strong>
          ，到点后 1 分钟内开始；应用当时没运行，则下次启动立刻补跑。
          {encryptEnabled ? (
            <>
              已开启加密，<strong>自动备份不会执行</strong>
              ——加密包要你每次在本页「做备份」里输入口令，口令不落盘，定时任务拿不到。
            </>
          ) : null}
        </p>
        <label className="admin-field">
          每隔几天自动备份
          <input
            max={BACKUP_LIMITS.periodDays.max}
            min={BACKUP_LIMITS.periodDays.min}
            onChange={(event) =>
              setValues((current) => ({
                ...current,
                backupPeriodDays: Number(event.target.value),
              }))
            }
            type="number"
            value={values.backupPeriodDays}
          />
        </label>
        <label className="admin-field">
          备份时刻（几点几分）
          <input
            onChange={(event) =>
              setValues((current) => ({
                ...current,
                backupAtTime: event.target.value,
              }))
            }
            required
            step={60}
            type="time"
            value={values.backupAtTime}
          />
        </label>
        <label className="admin-field">
          最多留几份
          <input
            max={BACKUP_LIMITS.keep.max}
            min={BACKUP_LIMITS.keep.min}
            onChange={(event) =>
              setValues((current) => ({
                ...current,
                backupKeep: Number(event.target.value),
              }))
            }
            type="number"
            value={values.backupKeep}
          />
        </label>
        <label className="admin-field">
          本地备份总大小上限（MB）
          <input
            max={BACKUP_LIMITS.localMaxMB.max}
            min={BACKUP_LIMITS.localMaxMB.min}
            onChange={(event) =>
              setValues((current) => ({
                ...current,
                backupLocalMaxMB: Number(event.target.value),
              }))
            }
            type="number"
            value={values.backupLocalMaxMB}
          />
        </label>
        <div className="admin-usage-toolbar">
          <button
            className="admin-btn admin-btn--ghost"
            disabled={locked}
            onClick={() => void scanUsage()}
            type="button"
          >
            {scanning ? "扫描中…" : usage ? "重新扫描本机占用" : "扫描本机占用"}
          </button>
        </div>
        {usage ? (
          <UsageMeter
            maxMB={Number(values.backupLocalMaxMB) || 0}
            title="本地备份占用"
            usedBytes={usage.backups.bytes}
          >
            <UsageRow
              bytes={usage.backups.bytes}
              extra={`${usage.backups.count} 份 / 最多 ${values.backupKeep} 份`}
              label="合计"
            />
            {usage.backups.files.length === 0 ? (
              <li className="admin-usage__empty">还没有本地备份包</li>
            ) : (
              usage.backups.files.map((file) => (
                <UsageRow
                  bytes={file.size}
                  file
                  key={file.name}
                  label={file.name}
                />
              ))
            )}
          </UsageMeter>
        ) : (
          <p className="admin-muted">
            点「扫描本机占用」后显示各本地备份包体积。打开本页不会自动扫盘。
          </p>
        )}
        <p className="admin-muted">
          占用统计本机备份包（加密与非加密都算），不含 COS。本地超上限只删本机旧包，
          COS 上的副本还在。
        </p>
        <p className="admin-muted">
          {nextLabel}上次备份：{lastLabel}。
        </p>
        {notice ? <p className="admin-backup-notice">{notice}</p> : null}
        {error ? (
          <p className="admin-error" role="alert">
            {error}
          </p>
        ) : null}
        <div className="admin-form-actions">
          <button className="admin-btn" disabled={locked} type="submit">
            {saving ? "保存中…" : "保存自动备份设置"}
          </button>
        </div>
      </form>
    </AdminSection>
  );
}
