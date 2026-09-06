"use client";

import { useEffect, useState } from "react";

import {
  answerCompressConfirm,
  clearFinishedTransfers,
  getCompressConfirm,
  HOME_LOAD_TRANSFER_NAME,
  listTransfers,
  subscribeTransfers,
  type TransferJob,
} from "@/lib/client/transfer-hud";
import { formatBytes } from "@/lib/uploads/usage-format";
import { cn } from "@/lib/utils/cn";

function jobLabel(job: TransferJob) {
  if (job.status === "error") {
    return job.error || "失败";
  }
  if (job.status === "done") {
    return "完成";
  }
  return `${job.stage} ${job.percent}%`;
}

export function TransferHud() {
  const [jobs, setJobs] = useState<TransferJob[]>([]);
  const [confirm, setConfirm] = useState(getCompressConfirm());
  const [collapsed, setCollapsed] = useState(false);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    function sync() {
      setJobs(listTransfers());
      setConfirm(getCompressConfirm());
    }
    sync();
    return subscribeTransfers(sync);
  }, []);

  const active = jobs.some((job) => job.status === "active");
  const failed = jobs.some((job) => job.status === "error");
  const hasJobs = jobs.length > 0;
  const holdOpen = Boolean(confirm) || active || failed;

  useEffect(() => {
    if (holdOpen) {
      setVisible(true);
      setCollapsed(false);
      return;
    }
    if (!hasJobs && !visible) {
      return;
    }
    const timer = window.setTimeout(() => {
      setVisible(false);
      setCollapsed(false);
      clearFinishedTransfers();
    }, 720);
    return () => window.clearTimeout(timer);
  }, [hasJobs, holdOpen, visible]);

  const open = Boolean(confirm) || (visible && hasJobs && !collapsed);
  const peek = visible && hasJobs && collapsed && !confirm;
  const hidden = !open && !peek;

  return (
    <div
      aria-hidden={hidden && !confirm}
      className={cn(
        "transfer-hud",
        open && "is-open",
        peek && "is-peek",
        hidden && "is-hidden",
      )}
    >
      {confirm ? (
        <div className="transfer-hud__confirm" role="dialog" aria-modal="true">
          <p>
            「{confirm.fileName}」{formatBytes(confirm.size)}，超过 10
            MB。继续上传会压缩至 10 MB 以下（保持原格式），压缩后的图片将作为原图。
          </p>
          <div className="transfer-hud__confirm-actions">
            <button
              className="heo-button heo-button--ghost"
              onClick={() => answerCompressConfirm(false)}
              type="button"
            >
              取消
            </button>
            <button
              className="heo-button"
              onClick={() => answerCompressConfirm(true)}
              type="button"
            >
              继续上传
            </button>
          </div>
        </div>
      ) : null}
      {hasJobs ? (
        <div className="transfer-hud__panel">
          <div className="transfer-hud__head">
            <p>
              {jobs.every((job) => job.name === HOME_LOAD_TRANSFER_NAME)
                ? "加载进度"
                : "传输进度"}
            </p>
            <button
              aria-label="隐藏进度"
              className="transfer-hud__hide"
              onClick={() => setCollapsed(true)}
              type="button"
            >
              ×
            </button>
          </div>
          <ul className="transfer-hud__list">
            {jobs.map((job) => (
              <li key={job.id}>
                <div className="transfer-hud__row">
                  <span className="transfer-hud__name" title={job.name}>
                    {job.name}
                  </span>
                  <span
                    className={cn(
                      "transfer-hud__meta",
                      job.status === "error" && "is-error",
                    )}
                  >
                    {jobLabel(job)}
                  </span>
                </div>
                <div
                  aria-hidden
                  className={cn(
                    "transfer-hud__bar",
                    job.status === "error" && "is-error",
                  )}
                >
                  <span style={{ width: `${job.percent}%` }} />
                </div>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {peek ? (
        <button
          aria-label="显示传输进度"
          className="transfer-hud__peek"
          onClick={() => setCollapsed(false)}
          type="button"
        />
      ) : null}
    </div>
  );
}