import { randomBytes } from "node:crypto";

import { prisma } from "@/lib/db";

import { PUBLIC_ID_LENGTH } from "./path";

const ALPHABET = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";

export function createPublicId(): string {
  const bytes = randomBytes(PUBLIC_ID_LENGTH);
  let out = "";
  for (let i = 0; i < PUBLIC_ID_LENGTH; i += 1) {
    out += ALPHABET[bytes[i]! % 62];
  }
  return out;
}

export async function allocatePublicId(): Promise<string> {
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const publicId = createPublicId();
    const existing = await prisma.post.findUnique({
      where: { publicId },
      select: { id: true },
    });
    if (!existing) {
      return publicId;
    }
  }
  throw new Error("无法生成文章公开 ID");
}

export async function ensurePostPublicIds(): Promise<void> {
  const rows = await prisma.post.findMany({
    where: { publicId: "" },
    select: { id: true },
  });
  for (const row of rows) {
    await prisma.post.update({
      where: { id: row.id },
      data: { publicId: await allocatePublicId() },
    });
  }
}
