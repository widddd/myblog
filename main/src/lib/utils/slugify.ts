import makeSlug from "slugify";

export function slugify(value: string): string {
  const asciiSlug = makeSlug(value, {
    lower: true,
    strict: true,
    trim: true,
  });

  if (asciiSlug) {
    return asciiSlug;
  }

  return value
    .normalize("NFKC")
    .trim()
    .toLowerCase()
    .replace(/[^\p{Letter}\p{Number}]+/gu, "-")
    .replace(/^-+|-+$/g, "");
}
