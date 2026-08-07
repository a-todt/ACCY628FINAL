/**
 * Strip currency symbols, commas, and whitespace from a money amount string
 * while keeping digits, a single decimal point, and an optional leading minus.
 */
export function sanitizeMoneyInput(raw: string): string {
  let cleaned = raw.replace(/[$,\s]/g, "");
  const negative = cleaned.startsWith("-");
  cleaned = cleaned.replace(/-/g, "");
  const parts = cleaned.split(".");
  const intPart = (parts[0] ?? "").replace(/[^\d]/g, "");
  const fracPart = parts.length > 1 ? parts.slice(1).join("").replace(/[^\d]/g, "") : null;
  let result = fracPart != null ? `${intPart}.${fracPart}` : intPart;
  if (negative && result.length > 0) result = `-${result}`;
  else if (negative && result.length === 0) result = "-";
  return result;
}

/** Parse a money input string to a number (after sanitizing). Empty → null. */
export function parseMoneyInput(value: string): number | null {
  const cleaned = sanitizeMoneyInput(value).trim();
  if (!cleaned || cleaned === "-" || cleaned === ".") return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : NaN;
}
