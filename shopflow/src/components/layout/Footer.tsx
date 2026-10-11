export function Footer() {
  return (
    <footer className="bg-white border-t border-slate-200 mt-auto py-8">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col md:flex-row items-center justify-between text-xs text-slate-500 gap-4">
        <p>© 2026 ShopFlow Inc. Customer-facing System of Record for RITOS.</p>
        <div className="flex space-x-6">
          <span>Prices in INR (Paise precision)</span>
          <span>•</span>
          <span>Zero-float guarantee</span>
          <span>•</span>
          <span>Deterministic Audit</span>
        </div>
      </div>
    </footer>
  );
}
