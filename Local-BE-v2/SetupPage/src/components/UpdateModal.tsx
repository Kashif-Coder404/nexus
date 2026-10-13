import { Download, ExternalLink, X, Sparkles } from "lucide-react";

interface UpdateModalProps {
  isOpen: boolean;
  currentVersion: string;
  latestVersion: string | null;
  statusText: string;
  onClose: () => void;
}

export default function UpdateModal({
  isOpen,
  currentVersion,
  latestVersion,
  statusText,
  onClose,
}: UpdateModalProps) {
  if (!isOpen) return null;

  const hasUpdate = Boolean(latestVersion && latestVersion !== currentVersion);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in duration-200">
      <div className="w-full max-w-sm bg-[#140d24] border border-purple-500/40 rounded-2xl p-6 shadow-[0_0_50px_rgba(168,85,247,0.35)] text-center space-y-4 relative">
        <button
          type="button"
          onClick={onClose}
          className="absolute top-4 right-4 text-zinc-400 hover:text-white p-1 rounded-lg hover:bg-zinc-800 transition cursor-pointer"
        >
          <X className="w-4 h-4" />
        </button>

        <div className="w-12 h-12 mx-auto rounded-full bg-purple-900/40 border border-purple-500/50 flex items-center justify-center text-purple-300">
          {hasUpdate ? (
            <Sparkles className="w-6 h-6 text-purple-400 animate-bounce" />
          ) : (
            <Download className="w-6 h-6" />
          )}
        </div>

        <div>
          <h3 className="text-base font-bold text-white">Nexus Companion Update</h3>
          <p className="text-xs text-zinc-300 mt-1">{statusText}</p>
        </div>

        <div className="p-3 rounded-xl bg-zinc-900/80 border border-zinc-800 flex items-center justify-around text-xs">
          <div>
            <span className="text-[10px] uppercase font-mono text-zinc-500 block">Current</span>
            <span className="font-mono text-zinc-300 font-semibold">{currentVersion}</span>
          </div>
          <div className="h-6 w-px bg-zinc-800" />
          <div>
            <span className="text-[10px] uppercase font-mono text-zinc-500 block">Latest</span>
            <span className="font-mono text-purple-400 font-semibold">{latestVersion || "Checking..."}</span>
          </div>
        </div>

        {hasUpdate ? (
          <a
            href="https://github.com/Kashif-Coder404/nexus-v2/releases/latest"
            target="_blank"
            rel="noreferrer"
            className="w-full py-2.5 px-4 rounded-xl bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white text-xs font-bold flex items-center justify-center gap-2 transition shadow-md shadow-purple-900/40 active:scale-95"
          >
            <span>Download {latestVersion}</span>
            <ExternalLink className="w-3.5 h-3.5" />
          </a>
        ) : (
          <button
            type="button"
            onClick={onClose}
            className="w-full py-2 px-4 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-xs font-medium transition cursor-pointer"
          >
            Done
          </button>
        )}
      </div>
    </div>
  );
}
