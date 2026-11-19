import fs from "fs";
import path from "path";
import { AdminHeader } from "@/components/layout/AdminHeader";

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
      <AdminHeader backHref="/admin" title="API Contract Specification (docs/02)" />

      <main className="max-w-5xl mx-auto p-4 sm:p-6 space-y-6">
        <div className="bg-white rounded-xl border border-slate-200 p-4 sm:p-8 shadow-sm">
          <pre className="font-mono text-xs text-slate-800 whitespace-pre-wrap break-words leading-relaxed">
            {content}
          </pre>
        </div>
      </main>
    </div>
  );
}
