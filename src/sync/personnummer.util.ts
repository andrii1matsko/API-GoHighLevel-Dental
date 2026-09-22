/**
 * Normalize Nordic personal IDs from GHL forms into digit-only strings.
 *
 * - Norwegian fødselsnummer: 11 digits
 * - Swedish personnummer: 12 digits (YYYYMMDDXXXX) as Muntra expects, or
 *   the common short form 10 digits (YYMMDDXXXX) which we expand to 12
 */
export function normalizeNordicPersonalId(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  const digits = String(value).replace(/\D/g, '');
  if (digits.length === 11 || digits.length === 12) return digits;
  if (digits.length === 10) return expandSwedishShortPersonnummer(digits);
  return null;
}

/** YYMMDDXXXX → YYYYMMDDXXXX (century chosen so birth is not in the future). */
export function expandSwedishShortPersonnummer(tenDigits: string): string | null {
  if (!/^\d{10}$/.test(tenDigits)) return null;
  const yy = Number(tenDigits.slice(0, 2));
  const mm = Number(tenDigits.slice(2, 4));
  const rawDd = Number(tenDigits.slice(4, 6));
  if (!Number.isFinite(yy) || !Number.isFinite(mm) || !Number.isFinite(rawDd)) {
    return null;
  }

  const now = new Date();
  let year = 2000 + yy;
  // Samordningsnummer uses day+60; only use day for century heuristic.
  const dd = rawDd > 60 ? rawDd - 60 : rawDd;
  if (mm >= 1 && mm <= 12 && dd >= 1 && dd <= 31) {
    const candidate = new Date(year, mm - 1, Math.min(dd, 28));
    if (candidate.getTime() > now.getTime()) {
      year -= 100;
    }
  } else if (year > now.getFullYear()) {
    year -= 100;
  }

  return `${year}${tenDigits.slice(2)}`;
}
