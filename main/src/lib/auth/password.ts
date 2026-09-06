import bcrypt from "bcryptjs";

const BCRYPT_COST = 12;

/** Precomputed cost-12 hash so missing-user logins still spend bcrypt time. */
const TIMING_DUMMY_HASH =
  "$2b$12$xBrRL98NQl0vv7hKUVkeOua4QmkZa8sO5YJcfXcG8IlhRg/gSCVkG";

export function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, BCRYPT_COST);
}

export function verifyPassword(
  password: string,
  passwordHash: string,
): Promise<boolean> {
  return bcrypt.compare(password, passwordHash);
}

export async function verifyPasswordAgainstKnownOrDummy(
  password: string,
  passwordHash: string | null | undefined,
): Promise<boolean> {
  const matched = await verifyPassword(password, passwordHash ?? TIMING_DUMMY_HASH);
  return Boolean(passwordHash) && matched;
}
