// Store currency and locale for display, shared by server and browser code (NEXT_PUBLIC_* is inlined at build).
export const STORE_CURRENCY = process.env.NEXT_PUBLIC_STORE_CURRENCY?.trim() || "INR";
export const STORE_LOCALE = process.env.NEXT_PUBLIC_STORE_LOCALE?.trim() || "en-IN";

/** Format an amount in minor units (paise, cents). */
export function formatMoney(minor: number, currency: string = STORE_CURRENCY, fractionDigits = 0): string {
  return new Intl.NumberFormat(STORE_LOCALE, {
    style: "currency",
    currency,
    maximumFractionDigits: fractionDigits,
  }).format(minor / 100);
}
