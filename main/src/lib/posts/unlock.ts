import {
  createHash,
  createHmac,
  timingSafeEqual,
} from "node:crypto";
import { cookies } from "next/headers";

export const POST_UNLOCK_TTL_SECONDS = 2 * 60 * 60;

const COOKIE_PREFIX = "myblog.post-unlock.";
const TOKEN_VERSION = "v1";
const SIGNATURE_PATTERN = /^[a-f0-9]{64}$/;

function sessionSecret(): string {
  const secret = process.env.SESSION_SECRET?.trim();
  if (!secret || secret.length < 32) {
    throw new Error("SESSION_SECRET 必须至少包含 32 个字符");
  }
  return secret;
}

function cookieName(slug: string): string {
  const digest = createHash("sha256").update(slug).digest("hex").slice(0, 24);
  return `${COOKIE_PREFIX}${digest}`;
}

function signature(payload: string, secret: string): string {
  return createHmac("sha256", secret)
    .update(`myblog-post-unlock\n${payload}`)
    .digest("hex");
}

function safeEqual(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return (
    leftBuffer.length === rightBuffer.length &&
    timingSafeEqual(leftBuffer, rightBuffer)
  );
}

export function createPostUnlockToken(
  slug: string,
  expiresAtSeconds: number,
  secret = sessionSecret(),
): string {
  const encoded = Buffer.from(
    JSON.stringify({ slug, exp: expiresAtSeconds }),
  ).toString("base64url");
  const payload = `${TOKEN_VERSION}.${encoded}`;
  return `${payload}.${signature(payload, secret)}`;
}

export function verifyPostUnlockToken(
  token: string,
  slug: string,
  nowSeconds = Math.floor(Date.now() / 1000),
  secret = sessionSecret(),
): boolean {
  const [version, encoded, receivedSignature, extra] = token.split(".");
  if (
    extra !== undefined ||
    version !== TOKEN_VERSION ||
    !encoded ||
    !receivedSignature ||
    !SIGNATURE_PATTERN.test(receivedSignature)
  ) {
    return false;
  }

  const payload = `${version}.${encoded}`;
  if (!safeEqual(receivedSignature, signature(payload, secret))) {
    return false;
  }

  try {
    const parsed = JSON.parse(
      Buffer.from(encoded, "base64url").toString("utf8"),
    ) as { slug?: unknown; exp?: unknown };
    return (
      parsed.slug === slug &&
      Number.isSafeInteger(parsed.exp) &&
      (parsed.exp as number) > nowSeconds
    );
  } catch {
    return false;
  }
}

export async function issuePostUnlockCookie(slug: string): Promise<void> {
  const expiresAt = Math.floor(Date.now() / 1000) + POST_UNLOCK_TTL_SECONDS;
  const cookieStore = await cookies();
  cookieStore.set(cookieName(slug), createPostUnlockToken(slug, expiresAt), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/posts",
    maxAge: POST_UNLOCK_TTL_SECONDS,
  });
}

export async function isPostUnlocked(slug: string): Promise<boolean> {
  const cookieStore = await cookies();
  const token = cookieStore.get(cookieName(slug))?.value;
  return token ? verifyPostUnlockToken(token, slug) : false;
}
