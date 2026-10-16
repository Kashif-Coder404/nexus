import { AlertTriangle, AlertOctagon, Loader2 } from "lucide-react";

interface ConfirmModalProps {
  isOpen: boolean;
  title: string;
  message: string;
  confirmLabel: string;
  dangerLevel?: "danger" | "warning";
  loading?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export default function ConfirmModal({
  isOpen,
  title,
  message,
  confirmLabel,
  dangerLevel = "danger",
  loading = false,
  onConfirm,
  onCancel,
}: ConfirmModalProps) {
  if (!isOpen) return null;

  const isDanger = dangerLevel === "danger";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in duration-200">
      <div
        className={`w-full max-w-md p-6 rounded-2xl bg-[#140d24] border ${
          isDanger ? "border-rose-500/50 shadow-[0_0_50px_rgba(244,63,94,0.35)]" : "border-amber-500/50 shadow-[0_0_50px_rgba(245,158,11,0.35)]"
        } text-left space-y-4`}
      >
        {/* Header Icon & Title */}
        <div className="flex items-start gap-3.5">
          <div
            className={`w-12 h-12 rounded-xl flex items-center justify-center shrink-0 ${
              isDanger
                ? "bg-rose-500/15 border border-rose-500/30 text-rose-400"
                : "bg-amber-500/15 border border-amber-500/30 text-amber-400"
            }`}
          >
            {isDanger ? (
              <AlertOctagon className="w-6 h-6 animate-pulse" />
            ) : (
              <AlertTriangle className="w-6 h-6" />
            )}
          </div>
          <div className="space-y-1">
            <h3 className="text-base font-bold text-white tracking-tight">
              {title}
            </h3>
            <p className="text-xs text-zinc-300 leading-relaxed">
              {message}
            </p>
          </div>
        </div>

        {/* Warning callout banner */}
        <div
          className={`p-3 rounded-xl text-[11px] leading-relaxed border ${
            isDanger
              ? "bg-rose-950/30 border-rose-500/30 text-rose-300"
              : "bg-amber-950/30 border-amber-500/30 text-amber-300"
          }`}
        >
          {isDanger
            ? "⚠️ Critical Action: Stored local tokens will be erased from disk and the device connection will be severed."
            : "⚠️ Caution: Incoming autonomous execution will be interrupted immediately."}
        </div>

        {/* Action Buttons */}
        <div className="flex items-center justify-end gap-3 pt-2">
          <button
            type="button"
            onClick={onCancel}
            disabled={loading}
            className="px-4 py-2 rounded-xl text-xs font-semibold text-zinc-400 hover:text-white hover:bg-zinc-800/80 border border-zinc-800 transition cursor-pointer disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={loading}
            className={`px-5 py-2 rounded-xl text-xs font-bold text-white flex items-center gap-2 transition cursor-pointer shadow-md active:scale-95 disabled:opacity-50 ${
              isDanger
                ? "bg-gradient-to-r from-rose-600 to-red-700 hover:from-rose-500 hover:to-red-600 shadow-rose-900/40"
                : "bg-gradient-to-r from-amber-600 to-orange-600 hover:from-amber-500 hover:to-orange-500 shadow-amber-900/40"
            }`}
          >
            {loading && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
            <span>{confirmLabel}</span>
          </button>
        </div>
      </div>
    </div>
  );
}
