"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type ReactNode } from "react";

import { AdminSection } from "@/components/admin/AdminSection";
import { adminJson } from "@/lib/client/admin";
import { toDatetimeLocalValue } from "@/lib/home/uptime";
import {
  formatBytes,
  usagePercent,
  type LocalStorageUsage,
} from "@/lib/uploads/usage-format";

type SettingsValues = {
  siteName: string;
  announcement: string;
  banner: string;
  pageSize: number;
  backupPeriodDays: number;
  backupKeep: number;
  backupLocalMaxMB: number;
  localMediaMaxMB: number;
  uploadMaxSizeMB: number;
  thumbMaxPx: number;
  thumb2MaxPx: number;
  homeModuleOpacity: number;
  homeBackdropOpacity: number;
  siteUrl: string;
  siteStartedAt: string;
  lastBackupAt: string | null;
  updateGithubRepo: string;
  cosBucket: string;
  cosRegion: string;
  cosSecretId: string;
  cosSecretKey: string;
  cosPublicBaseUrl: string;
  cosSecretIdSet: boolean;
  cosSecretKeySet: boolean;
};

function fileCount(count: number): string {
  return `${count} 个文件`;
}

function UsageMeter({
  title,
  usedBytes,
  maxMB,
  warn,
  children,
}: {
  title: string;
  usedBytes: number;
  maxMB: number;
  warn?: boolean;
  children: ReactNode;
}) {
  const percent = usagePercent(usedBytes, maxMB);
  const hot = warn || percent >= 90;
  return (
    <div className="admin-usage">
      <div className="admin-usage__head">
        <strong>{title}</strong>
        <span className={hot ? "admin-usage__cap is-warn" : "admin-usage__cap"}>
          {formatBytes(usedBytes)} / {maxMB} MB（{percent}%）
        </span>
      </div>
      <div
        aria-hidden
        className={hot ? "admin-usage__bar is-warn" : "admin-usage__bar"}
      >
        <span style={{ width: `${percent}%` }} />
      </div>
      <ul className="admin-usage__list">{children}</ul>
    </div>
  );
}

function UsageRow({
  label,
  bytes,
  extra,
  file,
}: {
  label: string;
  bytes: number;
  extra?: string;
  file?: boolean;
}) {
  return (
    <li className={file ? "admin-usage__row is-file" : "admin-usage__row"}>
      <span title={file ? label : undefined}>{label}</span>
      <span>
        {formatBytes(bytes)}
        {extra ? ` · ${extra}` : ""}
      </span>
    </li>
  );
}

export function SettingsForm({ initial }: { initial: SettingsValues }) {
  const router = useRouter();
  const [values, setValues] = useState(initial);
  const [usage, setUsage] = useState<LocalStorageUsage | null>(null);
  const [editSecretId, setEditSecretId] = useState(!initial.cosSecretIdSet);
  const [editSecretKey, setEditSecretKey] = useState(!initial.cosSecretKeySet);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [scanning, setScanning] = useState(false);

  async function handleSubmit() {
    setError("");
    setNotice("");
    setSaving(true);
    try {
      const payload = await adminJson<{ data: SettingsValues }>(
        "/api/admin/settings",
        {
          method: "PUT",
          body: JSON.stringify({
            siteName: values.siteName,
            announcement: values.announcement,
            banner: values.banner,
            homeModuleOpacity: Number(values.homeModuleOpacity),
            homeBackdropOpacity: Number(values.homeBackdropOpacity),
            pageSize: Number(values.pageSize),
            backupPeriodDays: Number(values.backupPeriodDays),
            backupKeep: Number(values.backupKeep),
            backupLocalMaxMB: Number(values.backupLocalMaxMB),
            localMediaMaxMB: Number(values.localMediaMaxMB),
            uploadMaxSizeMB: Number(values.uploadMaxSizeMB),
            thumbMaxPx: Number(values.thumbMaxPx),
            thumb2MaxPx: Number(values.thumb2MaxPx),
            siteUrl: values.siteUrl.trim(),
            updateGithubRepo: values.updateGithubRepo.trim(),
            siteStartedAt: toDatetimeLocalValue(values.siteStartedAt),
            cosBucket: values.cosBucket.trim(),
            cosRegion: values.cosRegion.trim(),
            cosSecretId: editSecretId ? values.cosSecretId.trim() : "",
            cosSecretKey: editSecretKey ? values.cosSecretKey : "",
            cosPublicBaseUrl: values.cosPublicBaseUrl.trim(),
          }),
        },
      );
      const next = payload.data;
      setValues({
        ...next,
        cosSecretId: "",
        cosSecretKey: "",
      });
      setEditSecretId(!next.cosSecretIdSet);
      setEditSecretKey(!next.cosSecretKeySet);
      setNotice("已保存。");
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "保存失败");
    } finally {
      setSaving(false);
    }
  }

  async function testConnection() {
    setError("");
    setNotice("");
    setTesting(true);
    try {
      await adminJson("/api/admin/cos/test", { method: "POST" });
      setNotice(
        "COS 连接成功。测试只核对凭证，不会在桶里创建文件；上传媒体或做加密备份后才会出现 media/、backups/。",
      );
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "COS 连接失败");
    } finally {
      setTesting(false);
    }
  }

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

  function renderScanButton() {
    return (
      <button
        className="admin-btn admin-btn--ghost"
        disabled={saving || testing || scanning}
        onClick={() => void scanUsage()}
        type="button"
      >
        {scanning ? "扫描中…" : usage ? "重新扫描本机占用" : "扫描本机占用"}
      </button>
    );
  }

  return (
    <form
      className="admin-form"
      onSubmit={(event) => {
        event.preventDefault();
        void handleSubmit();
      }}
    >
      <p className="admin-danger">保存成功前不要关闭本页。</p>
      <AdminSection title="站点信息">
        <label className="admin-field">
          站点名称
          <input
            onChange={(event) =>
              setValues((current) => ({ ...current, siteName: event.target.value }))
            }
            required
            value={values.siteName}
          />
        </label>
        <label className="admin-field">
          公告
          <textarea
            onChange={(event) =>
              setValues((current) => ({
                ...current,
                announcement: event.target.value,
              }))
            }
            rows={3}
            value={values.announcement}
          />
        </label>
        <label className="admin-field">
          首页顶图地址（空着就用每日风景图）
          <input
            onChange={(event) =>
              setValues((current) => ({ ...current, banner: event.target.value }))
            }
            value={values.banner}
          />
        </label>
        <label className="admin-field">
          站点地址（sitemap / RSS / 分享链接用）
          <input
            onChange={(event) =>
              setValues((current) => ({ ...current, siteUrl: event.target.value }))
            }
            placeholder="https://example.com"
            value={values.siteUrl ?? ""}
          />
        </label>
        <label className="admin-field">
          GitHub 仓库（检查更新用，公开库）
          <input
            onChange={(event) =>
              setValues((current) => ({
                ...current,
                updateGithubRepo: event.target.value,
              }))
            }
            placeholder="owner/repo 或 https://github.com/owner/repo"
            value={values.updateGithubRepo ?? ""}
          />
        </label>
      </AdminSection>
      <AdminSection title="首页外观">
        <div className="admin-field">
          <span className="admin-field__head">
            站点开始运行时间
            <button
              className="admin-field__reset"
              onClick={() =>
                setValues((current) => ({ ...current, siteStartedAt: "" }))
              }
              type="button"
            >
              清除
            </button>
          </span>
          <input
            onChange={(event) =>
              setValues((current) => ({
                ...current,
                siteStartedAt: event.target.value,
              }))
            }
            step={1}
            type="datetime-local"
            value={toDatetimeLocalValue(values.siteStartedAt)}
          />
          <span className="admin-muted">
            首页底部版本信息栏使用。空着则前台不显示该模块。
          </span>
        </div>
        <label className="admin-field">
          首页模块不透明度（{values.homeModuleOpacity}%）
          <input
            max={100}
            min={0}
            onChange={(event) =>
              setValues((current) => ({
                ...current,
                homeModuleOpacity: Number(event.target.value),
              }))
            }
            type="range"
            value={values.homeModuleOpacity}
          />
        </label>
        <label className="admin-field">
          首页背景不透明度（{values.homeBackdropOpacity}%）
          <input
            max={100}
            min={0}
            onChange={(event) =>
              setValues((current) => ({
                ...current,
                homeBackdropOpacity: Number(event.target.value),
              }))
            }
            type="range"
            value={values.homeBackdropOpacity}
          />
        </label>
      </AdminSection>
      <AdminSection title="列表与上传">
        <label className="admin-field">
          每页文章数
          <input
            min={1}
            max={50}
            onChange={(event) =>
              setValues((current) => ({
                ...current,
                pageSize: Number(event.target.value),
              }))
            }
            type="number"
            value={values.pageSize}
          />
        </label>
        <label className="admin-field">
          上传大小上限（MB）
          <input
            min={1}
            max={50}
            onChange={(event) =>
              setValues((current) => ({
                ...current,
                uploadMaxSizeMB: Number(event.target.value),
              }))
            }
            type="number"
            value={values.uploadMaxSizeMB}
          />
        </label>
        <label className="admin-field">
          缩略图最长边（像素）
          <input
            min={128}
            max={1280}
            onChange={(event) =>
              setValues((current) => ({
                ...current,
                thumbMaxPx: Number(event.target.value),
              }))
            }
            type="number"
            value={values.thumbMaxPx}
          />
        </label>
        <label className="admin-field">
          二级缩略图最长边（像素）
          <input
            min={128}
            max={640}
            onChange={(event) =>
              setValues((current) => ({
                ...current,
                thumb2MaxPx: Number(event.target.value),
              }))
            }
            type="number"
            value={values.thumb2MaxPx}
          />
        </label>
        <label className="admin-field">
          本地媒体缓存上限（MB）
          <input
            min={64}
            max={10240}
            onChange={(event) =>
              setValues((current) => ({
                ...current,
                localMediaMaxMB: Number(event.target.value),
              }))
            }
            type="number"
            value={values.localMediaMaxMB}
          />
        </label>
        <div className="admin-usage-toolbar">{renderScanButton()}</div>
        {usage ? (
          <UsageMeter
            maxMB={Number(values.localMediaMaxMB) || 0}
            title="媒体库占用"
            usedBytes={usage.media.total.bytes}
          >
            <UsageRow
              bytes={usage.media.total.bytes}
              extra={fileCount(usage.media.total.count)}
              label="合计"
            />
            <UsageRow
              bytes={usage.media.original.bytes}
              extra={fileCount(usage.media.original.count)}
              label="原图与音视频"
            />
            <UsageRow
              bytes={usage.media.thumb.bytes}
              extra={fileCount(usage.media.thumb.count)}
              label="一级缩略图"
            />
            <UsageRow
              bytes={usage.media.thumb2.bytes}
              extra={fileCount(usage.media.thumb2.count)}
              label="二级缩略图"
            />
          </UsageMeter>
        ) : (
          <p className="admin-muted">
            点「扫描本机占用」后显示媒体库合计、原图/音视频、一级与二级缩略图的体积。打开本页不会自动扫盘。
          </p>
        )}
        <p className="admin-muted">
          占用只统计本机缓存，不含 COS。新上传会同时写本地和 COS。一级缩略图走 COS；二级缩略图只留在本机，给首页瞬间瀑布用。原图保持原格式。超上限只删最早的本地副本，不删云端。已有图片可到{" "}
          <Link href="/admin/uploads">媒体库</Link> 重新生成一级或二级缩略图。
        </p>
      </AdminSection>
      <AdminSection title="自动备份">
        <label className="admin-field">
          每隔几天自动备份
          <input
            min={1}
            max={365}
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
          最多留几份
          <input
            min={1}
            max={30}
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
            min={64}
            max={10240}
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
        <div className="admin-usage-toolbar">{renderScanButton()}</div>
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
                <UsageRow file key={file.name} bytes={file.size} label={file.name} />
              ))
            )}
          </UsageMeter>
        ) : (
          <p className="admin-muted">
            点「扫描本机占用」后显示各本地备份包体积。打开本页不会自动扫盘。
          </p>
        )}
        <p className="admin-muted">
          占用统计本机备份包（加密与非加密都算），不含 COS。上次备份：
          {values.lastBackupAt ?? "尚未备份"}。本地超上限只删本机旧包，COS
          上的副本还在。手动备份和恢复在 <Link href="/admin/backups">备份</Link> 页。
        </p>
      </AdminSection>
      <AdminSection title="腾讯云 COS">
        <p className="admin-muted">
          新上传的原图、视频、音频、缩略图和备份会放到这个桶。访客封面和缩略图走
          COS。SecretId / SecretKey 保存后显示「已占用」，不会回显原文；要换就点旁边的「重设」。
          备份是否加密在「备份」页开关；COS 为 HTTPS 时默认不加密。
        </p>
        <label className="admin-field">
          存储桶
          <input
            onChange={(event) =>
              setValues((current) => ({ ...current, cosBucket: event.target.value }))
            }
            placeholder="example-1300000000"
            value={values.cosBucket}
          />
        </label>
        <label className="admin-field">
          地域
          <input
            onChange={(event) =>
              setValues((current) => ({ ...current, cosRegion: event.target.value }))
            }
            placeholder="ap-shanghai"
            value={values.cosRegion}
          />
        </label>
        <div className="admin-field">
          <div className="admin-field__head">
            <span>SecretId</span>
            {values.cosSecretIdSet && !editSecretId ? (
              <button
                className="admin-field__reset"
                onClick={() => {
                  setEditSecretId(true);
                  setValues((current) => ({ ...current, cosSecretId: "" }));
                }}
                type="button"
              >
                重设
              </button>
            ) : null}
          </div>
          <input
            autoComplete="off"
            disabled={values.cosSecretIdSet && !editSecretId}
            onChange={(event) =>
              setValues((current) => ({
                ...current,
                cosSecretId: event.target.value,
              }))
            }
            placeholder={
              values.cosSecretIdSet && !editSecretId ? undefined : "粘贴 SecretId"
            }
            value={
              values.cosSecretIdSet && !editSecretId
                ? "已占用"
                : values.cosSecretId
            }
          />
        </div>
        <div className="admin-field">
          <div className="admin-field__head">
            <span>SecretKey</span>
            {values.cosSecretKeySet && !editSecretKey ? (
              <button
                className="admin-field__reset"
                onClick={() => {
                  setEditSecretKey(true);
                  setValues((current) => ({ ...current, cosSecretKey: "" }));
                }}
                type="button"
              >
                重设
              </button>
            ) : null}
          </div>
          <input
            autoComplete="new-password"
            disabled={values.cosSecretKeySet && !editSecretKey}
            onChange={(event) =>
              setValues((current) => ({
                ...current,
                cosSecretKey: event.target.value,
              }))
            }
            placeholder={
              values.cosSecretKeySet && !editSecretKey
                ? undefined
                : "粘贴 SecretKey"
            }
            type={
              values.cosSecretKeySet && !editSecretKey ? "text" : "password"
            }
            value={
              values.cosSecretKeySet && !editSecretKey
                ? "已占用"
                : values.cosSecretKey
            }
          />
        </div>
        <label className="admin-field">
          公网访问域名（可空，默认桶域名）
          <input
            onChange={(event) =>
              setValues((current) => ({
                ...current,
                cosPublicBaseUrl: event.target.value,
              }))
            }
            placeholder="https://bucket.cos.ap-shanghai.myqcloud.com"
            value={values.cosPublicBaseUrl}
          />
        </label>
        <button
          className="admin-btn admin-btn--ghost"
          disabled={saving || testing || scanning}
          onClick={() => void testConnection()}
          type="button"
        >
          {testing ? "测试中…" : "测试连接"}
        </button>
      </AdminSection>
      {notice ? <p className="admin-backup-notice">{notice}</p> : null}
      {error ? (
        <p className="admin-error" role="alert">
          {error}
        </p>
      ) : null}
      <button className="admin-btn" disabled={saving} type="submit">
        {saving ? "保存中…" : "保存设置"}
      </button>
    </form>
  );
}
