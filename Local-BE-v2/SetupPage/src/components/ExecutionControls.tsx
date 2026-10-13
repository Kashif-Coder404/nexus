import { Power, Play, Loader2 } from "lucide-react";

interface ExecutionControlsProps {
  isStopped: boolean;
  isStarting: boolean;
  onRequestStopServer: () => void;
  onStartServer: () => void;
}

export default function ExecutionControls({
  isStopped,
  isStarting,
  onRequestStopServer,
  onStartServer,
}: ExecutionControlsProps) {
  return (
    <div className="w-full max-w-2xl mx-auto flex items-center justify-end pt-4 text-xs font-medium">
      {isStopped ? (
        /* If stopped: Show Start Service button in place of Stop button */
        <button
          type="button"
          onClick={onStartServer}
          disabled={isStarting}
          className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-bold transition shadow-md shadow-emerald-950/40 cursor-pointer active:scale-95 disabled:opacity-50"
          title="Start local companion daemon"
        >
          {isStarting ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <Play className="w-4 h-4 fill-current" />
          )}
          <span>{isStarting ? "Starting Service..." : "Start Companion Service"}</span>
        </button>
      ) : (
        /* If running: Show Stop Service button */
        <button
          type="button"
          onClick={onRequestStopServer}
          className="flex items-center gap-2 px-4 py-2 rounded-xl border border-zinc-800/80 bg-[#0c0817] hover:bg-rose-950/20 hover:border-rose-500/30 text-zinc-400 hover:text-rose-300 transition cursor-pointer text-xs"
          title="Stop local background daemon"
        >
          <Power className="w-3.5 h-3.5 text-zinc-400" />
          <span>Stop Companion Service</span>
        </button>
      )}
    </div>
  );
}
