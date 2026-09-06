/** Stored original images must be at or below this size (user-facing 10 MB cap). */
export const IMAGE_ORIGINAL_MAX_BYTES = 10 * 1024 * 1024;

/** Incoming image may be larger; it is compressed down to IMAGE_ORIGINAL_MAX_BYTES. */
export const IMAGE_INTAKE_MAX_BYTES = 50 * 1024 * 1024;

export const IMAGE_HASH_PATTERN = /^[a-f0-9]{64}$/;
