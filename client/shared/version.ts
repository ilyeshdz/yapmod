/**
 * Compares two semantic-version-like strings.
 *
 * Returns a positive number when `b` is newer than `a` (update available),
 * a negative number when `a` is newer, and 0 when they are equal or both
 * missing. Non-numeric segments are compared lexicographically.
 */
export function isNewerVersion(a: string | null | undefined, b: string | null | undefined): boolean {
  if (!a || !b || a === b) return false;

  const partsA = a.split(".").map(parseSegment);
  const partsB = b.split(".").map(parseSegment);
  const length = Math.max(partsA.length, partsB.length);

  for (let i = 0; i < length; i++) {
    const segA = partsA[i] ?? 0;
    const segB = partsB[i] ?? 0;

    if (segB > segA) return true;
    if (segB < segA) return false;
  }

  return false;
}

function parseSegment(segment: string): number {
  const parsed = Number(segment);
  return Number.isFinite(parsed) ? parsed : 0;
}
