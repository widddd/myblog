import { fetchCsrfToken } from "@/lib/client/csrf";

export type AdminUploadKind = "image" | "video";

export type AdminUploadVariant = {
  key: string;
  mime: string;
  width: number | null;
  height: number | null;
  size: number;
  url: string;
};

export type AdminUploadResult = {
  id: number;
  hash: string;
  kind: AdminUploadKind;
  mime: string;
  original: AdminUploadVariant;
  thumb: AdminUploadVariant | null;
  content: AdminUploadVariant | null;
};

type UploadErrorBody = {
  message?: string;
};

export async function uploadAdminFile(
  file: File,
  kind: AdminUploadKind,
): Promise<AdminUploadResult> {
  const token = await fetchCsrfToken();
  const body = new FormData();
  body.set("file", file);
  body.set("kind", kind);

  const response = await fetch("/api/upload", {
    method: "POST",
    headers: { "x-csrf-token": token },
    body,
  });
  const payload = (await response.json()) as UploadErrorBody & {
    data?: AdminUploadResult;
  };

  if (!response.ok || !payload.data) {
    throw new Error(payload.message || "上传失败");
  }

  return payload.data;
}

export function editorImageUrl(result: AdminUploadResult): string {
  return result.content?.url ?? result.original.url;
}

export async function uploadAdminFiles(
  files: File[],
  kind: AdminUploadKind,
  onProgress?: (done: number, total: number) => void,
): Promise<AdminUploadResult[]> {
  const results: AdminUploadResult[] = [];
  for (const [index, file] of files.entries()) {
    results.push(await uploadAdminFile(file, kind));
    onProgress?.(index + 1, files.length);
  }
  return results;
}
