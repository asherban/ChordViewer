/** PostgreSQL text/JSONB cannot store NUL or unpaired UTF-16 surrogates. */
export function isStorageSafeText(value: string): boolean {
  // Unicode mode treats a valid surrogate pair as one code point, preserving emoji.
  return !value.includes('\0') && !/[\uD800-\uDFFF]/u.test(value);
}
