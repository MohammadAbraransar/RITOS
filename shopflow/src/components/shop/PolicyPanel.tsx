import { ShieldCheck, AlertCircle, RefreshCw, Truck } from "lucide-react";

export interface StructuredPolicyData {
  policy_version?: number;
  policy_type: string;
  refund_percentage: number;
  return_window_days: number;
  opened_allowed: boolean;
  requires_unused: boolean;
  defective_only?: boolean;
  exchange_only?: boolean;
  replacement_allowed?: boolean;
  return_required: boolean;
  return_shipping: string;
  verification_required?: string;
  evidence_required_reasons?: string[];
  exceptions?: Record<string, boolean>;
  notes?: string | null;
}

export function PolicyPanel({ policy }: { policy: StructuredPolicyData | null }) {
  if (!policy) return null;

  const isNonRefundable = policy.policy_type === "NON_REFUNDABLE" || policy.refund_percentage === 0;

  return (
    <div className="rounded-xl border border-indigo-100 bg-indigo-50/40 p-5 space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-2 text-indigo-900 font-semibold">
          <ShieldCheck className="w-5 h-5 text-indigo-600" />
          <span>Refund & Return Policy</span>
        </div>
        <span
          className={`px-2.5 py-0.5 rounded-full text-xs font-bold uppercase tracking-wide ${
            isNonRefundable
              ? "bg-rose-100 text-rose-700"
              : policy.refund_percentage < 100
              ? "bg-amber-100 text-amber-700"
              : "bg-emerald-100 text-emerald-700"
          }`}
        >
          {policy.policy_type.replace(/_/g, " ")}
        </span>
      </div>

      <div className="grid grid-cols-2 gap-3 text-xs">
        <div className="bg-white p-3 rounded-lg border border-indigo-50/80 shadow-xs">
          <span className="text-slate-500 block">Return Window</span>
          <span className="font-semibold text-slate-800 text-sm">
            {policy.return_window_days > 0 ? `${policy.return_window_days} Days` : "No Returns"}
          </span>
        </div>

        <div className="bg-white p-3 rounded-lg border border-indigo-50/80 shadow-xs">
          <span className="text-slate-500 block">Refund Amount</span>
          <span className="font-semibold text-slate-800 text-sm">
            {policy.refund_percentage}% refundable
          </span>
        </div>

        <div className="bg-white p-3 rounded-lg border border-indigo-50/80 shadow-xs">
          <span className="text-slate-500 block">Item Condition</span>
          <span className="font-medium text-slate-700">
            {policy.requires_unused ? "Must be unused / unworn" : policy.opened_allowed ? "Opened box allowed" : "Sealed only"}
          </span>
        </div>

        <div className="bg-white p-3 rounded-lg border border-indigo-50/80 shadow-xs">
          <span className="text-slate-500 block">Return Shipping</span>
          <span className="font-medium text-slate-700">
            {policy.return_shipping === "FREE" ? "Free Pickup" : policy.return_shipping === "CUSTOMER" ? "Customer Bears Cost" : "N/A"}
          </span>
        </div>
      </div>

      {policy.evidence_required_reasons && policy.evidence_required_reasons.length > 0 && (
        <div className="text-xs bg-white/80 p-2.5 rounded-lg border border-indigo-50 text-slate-600 space-y-1">
          <span className="font-semibold text-slate-700 block">Evidence Mandatory For:</span>
          <div className="flex flex-wrap gap-1">
            {policy.evidence_required_reasons.map((reason) => (
              <span key={reason} className="px-2 py-0.5 bg-slate-100 text-slate-600 rounded text-[11px]">
                {reason.replace(/_/g, " ")}
              </span>
            ))}
          </div>
        </div>
      )}

      {policy.notes && (
        <p className="text-xs text-slate-500 italic">
          Note: {policy.notes}
        </p>
      )}
    </div>
  );
}
