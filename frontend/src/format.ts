// Display formatting shared by every screen. Locale/currency come from configuration (frontend/.env);
// records carry their own currency.
export const LOCALE: string = import.meta.env.VITE_LOCALE || navigator.language

export const money = (n: number, c: string | undefined = import.meta.env.VITE_DEFAULT_CURRENCY) =>
  c ? new Intl.NumberFormat(LOCALE, { style: 'currency', currency: c, maximumFractionDigits: 2 }).format(n || 0)
    : new Intl.NumberFormat(LOCALE, { maximumFractionDigits: 2 }).format(n || 0)

export const shortDate = (d?: string | null) =>
  d ? new Date(d).toLocaleDateString(LOCALE, { day: 'numeric', month: 'short', year: 'numeric' }) : ''

export const dateTime = (d?: string | null) =>
  d ? new Date(d).toLocaleString(LOCALE, { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' }) : ''
