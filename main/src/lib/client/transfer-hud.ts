export type TransferStage =
  | "等待确认"
  | "压缩"
  | "上传"
  | "生成缩略图"
  | "上传到云存储"
  | "加载"
  | "完成";

export const HOME_LOAD_TRANSFER_NAME = "首页大图";
export const HOME_LOAD_REVEAL_MS = 2000;

export type TransferJob = {
  id: string;
  name: string;
  stage: TransferStage;
  percent: number;
  status: "active" | "done" | "error";
  error?: string;
};

export type CompressConfirmRequest = {
  id: string;
  fileName: string;
  size: number;
  resolve: (ok: boolean) => void;
};

type Listener = () => void;

const jobs = new Map<string, TransferJob>();
const listeners = new Set<Listener>();
let confirmRequest: CompressConfirmRequest | null = null;
let jobSeq = 0;

function emit() {
  for (const listener of listeners) {
    listener();
  }
}

export function subscribeTransfers(listener: Listener) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function listTransfers(): TransferJob[] {
  return [...jobs.values()];
}

export function getCompressConfirm(): CompressConfirmRequest | null {
  return confirmRequest;
}

export function beginTransfer(name: string): string {
  jobSeq += 1;
  const id = `${Date.now().toString(36)}-${jobSeq}`;
  jobs.set(id, {
    id,
    name,
    stage: "上传",
    percent: 0,
    status: "active",
  });
  emit();
  return id;
}

export function updateTransfer(
  id: string,
  patch: Partial<Omit<TransferJob, "id" | "name">>,
) {
  const current = jobs.get(id);
  if (!current) {
    return;
  }
  jobs.set(id, { ...current, ...patch });
  emit();
}

export function finishTransfer(id: string, error?: string) {
  const current = jobs.get(id);
  if (!current) {
    return;
  }
  if (error) {
    jobs.set(id, {
      ...current,
      status: "error",
      error,
      stage: current.stage,
    });
    emit();
    return;
  }
  jobs.set(id, {
    ...current,
    status: "done",
    percent: 100,
    stage: "完成",
  });
  emit();
}

export function removeTransfer(id: string) {
  if (jobs.delete(id)) {
    emit();
  }
}

export function clearFinishedTransfers() {
  for (const [id, job] of jobs) {
    if (job.status !== "active") {
      jobs.delete(id);
    }
  }
  emit();
}

export function hasActiveTransfers() {
  return [...jobs.values()].some((job) => job.status === "active");
}

export function confirmCompressIfNeeded(
  fileName: string,
  size: number,
): Promise<boolean> {
  return new Promise((resolve) => {
    confirmRequest = {
      id: `${Date.now().toString(36)}-confirm`,
      fileName,
      size,
      resolve: (ok) => {
        confirmRequest = null;
        emit();
        resolve(ok);
      },
    };
    emit();
  });
}

export function answerCompressConfirm(ok: boolean) {
  confirmRequest?.resolve(ok);
}

let homeLoadId: string | null = null;
let homeLoadPending = false;
let homeLoadPercent = 8;
let homeLoadRevealTimer: ReturnType<typeof setTimeout> | null = null;

function clearHomeLoadReveal() {
  if (homeLoadRevealTimer !== null) {
    clearTimeout(homeLoadRevealTimer);
    homeLoadRevealTimer = null;
  }
}

function revealHomeLoad() {
  homeLoadRevealTimer = null;
  if (!homeLoadPending || homeLoadId) {
    return;
  }
  homeLoadId = beginTransfer(HOME_LOAD_TRANSFER_NAME);
  updateTransfer(homeLoadId, { stage: "加载", percent: homeLoadPercent });
}

export function startHomeLoad() {
  if (homeLoadPending) {
    return homeLoadId;
  }
  if (homeLoadId) {
    const current = jobs.get(homeLoadId);
    if (current?.status === "active") {
      return homeLoadId;
    }
  }
  homeLoadPending = true;
  homeLoadPercent = 8;
  homeLoadRevealTimer = setTimeout(revealHomeLoad, HOME_LOAD_REVEAL_MS);
  return homeLoadId;
}

export function setHomeLoadPercent(percent: number) {
  homeLoadPercent = Math.max(homeLoadPercent, Math.min(90, Math.round(percent)));
  if (!homeLoadId) {
    return;
  }
  const current = jobs.get(homeLoadId);
  if (!current || current.status !== "active") {
    return;
  }
  updateTransfer(homeLoadId, {
    stage: "加载",
    percent: homeLoadPercent,
  });
}

export function finishHomeLoad() {
  homeLoadPending = false;
  clearHomeLoadReveal();
  if (!homeLoadId) {
    return;
  }
  const current = jobs.get(homeLoadId);
  if (current?.status === "active") {
    finishTransfer(homeLoadId);
  }
  homeLoadId = null;
}

export function cancelHomeLoad() {
  homeLoadPending = false;
  clearHomeLoadReveal();
  if (!homeLoadId) {
    return;
  }
  removeTransfer(homeLoadId);
  homeLoadId = null;
}
