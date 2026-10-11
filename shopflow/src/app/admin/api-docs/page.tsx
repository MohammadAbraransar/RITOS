import Link from "next/link";
import fs from "fs";
import path from "path";
import { ArrowLeft, BookOpen } from "lucide-react";

export const dynamic = "force-dynamic";

export default function AdminApiDocsPage() {
  const docsPath = path.join(process.cwd(), "docs", "02_API_CONTRACT.md");
  let content = "";
  try {
    content = fs.readFileSync(docsPath, "utf-8");
  } catch {
    content = "Unable to load docs/02_API_CONTRACT.md";
  }

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800 pb-12">
      <header className="bg-slate-900 text-white px-6 py-4 flex items-center justify-between shadow">
        <div className="flex items-center space-x-3">
          <Link href="/admin" className="text-slate-400 hover:text-white transition">
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <span className="font-bold text-lg tracking-tight">API Contract Specification (docs/02)</span>
        </div>
      </header>

      <main className="max-w-5xl mx-auto p-6 space-y-6">
        <div className="bg-white rounded-xl border border-slate-200 p-8 shadow-sm">
          <pre className="font-mono text-xs text-slate-800 whitespace-pre-wrap leading-relaxed">
            {content}
          </pre>
        </div>
      </main>
    </div>
  );
}
