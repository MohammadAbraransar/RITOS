import Link from "next/link";
import type { ReactNode } from "react";
import { ArrowLeft, RefreshCw } from "lucide-react";

type BadgeTone = "indigo" | "amber";

const BADGE_TONES: Record<BadgeTone, string> = {
  indigo: "bg-indigo-500/20 text-indigo-300 border-indigo-500/30",
  amber: "bg-amber-500/20 text-amber-300 border-amber-500/30",
};

/**
 * Dark header shared by every admin console page. Wraps onto two lines on narrow screens
 * instead of overflowing, and keeps the back link and actions at a comfortable tap size.
 */
export function AdminHeader({
  title,
  backHref,
  icon,
  badge,
  badgeTone = "indigo",
  onRefresh,
  action,
}: {
  title: ReactNode;
  /** Shows a back arrow before the title. */
  backHref?: string;
  /** Leading icon when there is no back link (the console hub). */
  icon?: ReactNode;
  badge?: ReactNode;
  badgeTone?: BadgeTone;
  /** Adds a Refresh button on the right. */
  onRefresh?: () => void;
  /** Any other right-hand content (used instead of, or next to, Refresh). */
  action?: ReactNode;
}) {
  return (
    <header className="bg-slate-900 text-white px-4 sm:px-6 py-3 sm:py-4 flex flex-wrap items-center justify-between gap-x-4 gap-y-2 shadow">
      <div className="flex items-center gap-3 min-w-0">
        {backHref ? (
          <Link
            href={backHref}
            aria-label="Back"
            className="inline-flex items-center justify-center w-9 h-9 -ml-2 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition shrink-0"
          >
            <ArrowLeft className="w-5 h-5" />
          </Link>
        ) : (
          icon && <span className="shrink-0">{icon}</span>
        )}
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 min-w-0">
          <span className="font-bold text-base sm:text-lg tracking-tight break-words">{title}</span>
          {badge && (
            <span className={`text-xs border px-2 py-0.5 rounded whitespace-nowrap ${BADGE_TONES[badgeTone]}`}>
              {badge}
            </span>
          )}
        </div>
      </div>

      {(onRefresh || action) && (
        <div className="flex items-center gap-2 shrink-0">
          {action}
          {onRefresh && (
            <button
              onClick={onRefresh}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium transition"
            >
              <RefreshCw className="w-3.5 h-3.5" /> Refresh
            </button>
          )}
        </div>
      )}
    </header>
  );
}
