const FOOTER_NOTES = ["Prices in INR (Paise precision)", "Zero-float guarantee", "Deterministic Audit"];

export function Footer() {
  return (
    <footer className="bg-white border-t border-slate-200 mt-auto py-8">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col md:flex-row items-center justify-between text-xs text-slate-500 gap-4 text-center md:text-left">
        <p>© 2026 ShopFlow Inc. Customer-facing System of Record for RITOS.</p>
        <ul className="flex flex-wrap items-center justify-center gap-x-4 gap-y-2">
          {FOOTER_NOTES.map((note, i) => (
            <li key={note} className="flex items-center gap-4">
              {i > 0 && <span aria-hidden className="hidden sm:block w-1 h-1 rounded-full bg-slate-300" />}
              <span className="whitespace-nowrap">{note}</span>
            </li>
          ))}
        </ul>
      </div>
    </footer>
  );
}
