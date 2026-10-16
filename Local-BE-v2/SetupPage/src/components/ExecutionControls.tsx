import { Activity, Loader2 } from "lucide-react";

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
  const isRunning = !isStopped;

  const handleToggle = () => {
    if (isStarting) return;
    if (isRunning) {
      onRequestStopServer();
    } else {
      onStartServer();
    }
  };

  return (
    <div className="w-full max-w-2xl mx-auto pt-1">
      <div className="flex items-center justify-between p-3.5 rounded-xl bg-[#0c0817]/70 border border-[#2a1745] backdrop-blur-md transition-all shadow-md shadow-black/20">
        {/* Left: Status Indicator & Info */}
        <div className="flex items-center gap-3">
          <div
            className={`w-2.5 h-2.5 rounded-full ${
              isStarting
                ? "bg-amber-400 animate-ping"
                : isRunning
                  ? "bg-emerald-400 shadow-[0_0_8px_#34d399]"
                  : "bg-rose-500 shadow-[0_0_8px_#f43f5e]"
            }`}
          />
          <div className="flex flex-col text-left">
            <span className="text-xs font-semibold text-white tracking-wide flex items-center gap-1.5">
              <Activity className="w-3.5 h-3.5 text-purple-400" />
              Background Companion Daemon
            </span>
            <span className="text-[11px] font-mono text-zinc-400">
              {isStarting
                ? "Starting service on port 4100..."
                : isRunning
                  ? "Port 4100 • Active & Listening"
                  : "Service Stopped • Offline"}
            </span>
          </div>
        </div>

        {/* Right: Modern Sliding Toggle Switch */}
        <button
          type="button"
          onClick={handleToggle}
          disabled={isStarting}
          role="switch"
          aria-checked={isRunning}
          className={`relative inline-flex h-6 w-12 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none disabled:opacity-50 ${
            isRunning ? "bg-emerald-600 shadow-[0_0_12px_rgba(16,185,129,0.5)]" : "bg-zinc-700/80"
          }`}
          title={isRunning ? "Click to Stop Service" : "Click to Start Service"}
        >
          {isStarting ? (
            <span className="absolute inset-0 flex items-center justify-center">
              <Loader2 className="w-3.5 h-3.5 text-white animate-spin" />
            </span>
          ) : (
            <span
              aria-hidden="true"
              className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-lg ring-0 transition duration-200 ease-in-out ${
                isRunning ? "translate-x-6" : "translate-x-0"
              }`}
            />
          )}
        </button>
      </div>
    </div>
  );
}
