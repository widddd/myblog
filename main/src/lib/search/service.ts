import { Prisma } from "@prisma/client";

import { prisma } from "@/lib/db";
import { getSetting } from "@/lib/settings";
import { likePattern } from "@/lib/search/escape";
import type { SearchHit } from "@/lib/search/types";

export type { SearchHit } from "@/lib/search/types";

const MAX_QUERY_LENGTH = 80;

type SearchRow = {
  publicId: string;
  slug: string;
  title: string;
  excerpt: string | null;
  passwordHash: string | null;
  publishedAt: Date | string | null;
};

function publishedLikeWhere(pattern: string, now: Date) {
  return Prisma.sql`
    status = 'published'
    AND publishedAt IS NOT NULL
    AND publishedAt <= ${now}
    AND (
      title LIKE ${pattern} ESCAPE char(92)
      OR (
        passwordHash IS NULL
        AND (
          content LIKE ${pattern} ESCAPE char(92)
          OR IFNULL(excerpt, '') LIKE ${pattern} ESCAPE char(92)
        )
      )
    )
  `;
}

function toHit(row: SearchRow): SearchHit {
  const locked = Boolean(row.passwordHash);
  return {
    publicId: row.publicId,
    slug: row.slug,
    title: row.title,
    excerpt: locked ? null : row.excerpt,
    locked,
    publishedAt: row.publishedAt,
  };
}

async function pageSize(): Promise<number> {
  const size = await getSetting<number>("pageSize");
  return size && size > 0 ? size : 10;
}

export async function searchPosts(
  q: string,
  page = 1,
): Promise<{ data: SearchHit[]; total: number; page: number; pageSize: number }> {
  const keyword = q.trim().slice(0, MAX_QUERY_LENGTH);
  const currentPage = Math.max(1, page);
  const size = await pageSize();

  if (!keyword) {
    return { data: [], total: 0, page: currentPage, pageSize: size };
  }

  const pattern = likePattern(keyword);
  const now = new Date();
  const where = publishedLikeWhere(pattern, now);
  const offset = (currentPage - 1) * size;

  const [countRows, rows] = await Promise.all([
    prisma.$queryRaw<Array<{ total: number | bigint }>>`
      SELECT COUNT(*) AS total
      FROM Post
      WHERE ${where}
    `,
    prisma.$queryRaw<SearchRow[]>`
      SELECT publicId, slug, title, excerpt, passwordHash, publishedAt
      FROM Post
      WHERE ${where}
      ORDER BY pinned DESC, publishedAt DESC
      LIMIT ${size} OFFSET ${offset}
    `,
  ]);

  const total = Number(countRows[0]?.total ?? 0);

  return {
    data: rows.map(toHit),
    total,
    page: currentPage,
    pageSize: size,
  };
}
