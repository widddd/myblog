const MEDIA_HASH_SOURCE_RE =
  /(?:uploads\/(?:images\/(?:thumbs2?\/[0-9a-f]{2}\/)?)?|images\/(?:thumbs2?|original)\/[0-9a-f]{2}\/|(?:videos|audio)\/[a-z0-9]+\/[0-9a-f]{2}\/|media\/(?:images|videos|audio)\/)([a-f0-9]{64})/g;
const ANY_HASH_RE = /[a-f0-9]{64}/g;

export { MEDIA_HASH_SOURCE_RE };

export function collectMediaHashes(
  ...texts: Array<string | null | undefined>
): string[] {
  const found = new Set<string>();
  for (const text of texts) {
    if (!text) {
      continue;
    }
    const before = found.size;
    MEDIA_HASH_SOURCE_RE.lastIndex = 0;
    for (const match of text.matchAll(MEDIA_HASH_SOURCE_RE)) {
      found.add(match[1]);
    }
    if (found.size === before) {
      ANY_HASH_RE.lastIndex = 0;
      for (const match of text.matchAll(ANY_HASH_RE)) {
        found.add(match[0]);
      }
    }
  }
  return [...found];
}

export function firstMediaHash(value: string | null | undefined): string | null {
  if (!value) {
    return null;
  }
  return collectMediaHashes(value)[0] ?? null;
}
