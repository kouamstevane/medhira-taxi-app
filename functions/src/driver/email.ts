export function normalizeEmail(value: string | null | undefined): string {
  return value?.trim().toLowerCase() ?? '';
}

export function emailsMatch(first: string | null | undefined, second: string | null | undefined): boolean {
  return normalizeEmail(first) === normalizeEmail(second);
}
