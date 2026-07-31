/**
 * Zimbabwean phone handling.
 *
 * The platform spec makes phone the primary lookup key for the shared customer
 * record, so "0771234567", "263 77 123 4567" and "+263771234567" MUST resolve
 * to one customer, not three. Everything written to the database goes through
 * normalisePhone first.
 */

const ZW_COUNTRY_CODE = "263";

/**
 * Reduce any local or international spelling of a Zimbabwean number to the
 * canonical +263XXXXXXXXX form. Returns null when the input cannot be a valid
 * Zimbabwean number, so callers can reject rather than silently store junk.
 */
export function normalisePhone(input: string): string | null {
  if (!input) return null;

  // Keep digits only; a leading + carries no information once we know the shape.
  let digits = input.replace(/\D/g, "");
  if (!digits) return null;

  // 00263... international prefix
  if (digits.startsWith("00" + ZW_COUNTRY_CODE)) {
    digits = digits.slice(2);
  }

  if (digits.startsWith(ZW_COUNTRY_CODE)) {
    digits = digits.slice(ZW_COUNTRY_CODE.length);
  } else if (digits.startsWith("0")) {
    // National trunk prefix
    digits = digits.slice(1);
  }

  // Zimbabwean subscriber numbers are 9 digits after the country code.
  if (digits.length !== 9) return null;

  return `+${ZW_COUNTRY_CODE}${digits}`;
}

/** True when the input is a usable Zimbabwean number. */
export function isValidPhone(input: string): boolean {
  return normalisePhone(input) !== null;
}

/**
 * Display form: +263 77 123 4567. Used on screen and receipts; never stored.
 */
export function formatPhone(phone: string): string {
  const normalised = normalisePhone(phone);
  if (!normalised) return phone;
  const d = normalised.slice(4); // drop +263
  return `+${ZW_COUNTRY_CODE} ${d.slice(0, 2)} ${d.slice(2, 5)} ${d.slice(5)}`;
}

/**
 * Best-effort partial normalisation for live search: the attendant is halfway
 * through typing, so we cannot demand a complete number, but we still want
 * "077" and "+26377" to hit the same index prefix.
 */
export function searchPrefix(input: string): string {
  let digits = input.replace(/\D/g, "");
  if (!digits) return "";

  if (digits.startsWith("00" + ZW_COUNTRY_CODE)) digits = digits.slice(2);
  if (digits.startsWith(ZW_COUNTRY_CODE)) {
    digits = digits.slice(ZW_COUNTRY_CODE.length);
  } else if (digits.startsWith("0")) {
    digits = digits.slice(1);
  }

  return `+${ZW_COUNTRY_CODE}${digits}`;
}

/** Normalise a vehicle registration for comparison: ABC 1234 -> ABC1234 */
export function normaliseReg(reg: string): string {
  return (reg || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
}
