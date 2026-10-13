import { Sparkles, Trash2, Download } from "lucide-react";

interface NavbarProps {
  isDaemonInstalled: boolean;
  onOpenUpdate: () => void;
  onRequestUninstall: () => void;
}

export default function Navbar({
  isDaemonInstalled,
  onOpenUpdate,
  onRequestUninstall,
}: NavbarProps) {
  return (
    <header className="w-full px-6 sm:px-10 py-5 flex items-center justify-between">
      {/* Left: Brand Logo & Title */}
      <div className="flex items-center gap-3.5">
        <div className="relative flex items-center justify-center">
          <img
            src="/favicon.svg"
            alt="Nexus Logo"
            className="w-8 h-8 object-contain drop-shadow-[0_0_14px_rgba(168,85,247,0.7)]"
          />
        </div>
        <div className="flex items-center gap-3">
          <span className="text-xl font-bold tracking-tight text-white flex items-center">
            Nexus<span className="text-[#c084fc] drop-shadow-[0_0_6px_rgba(192,132,252,0.8)]">.</span>
          </span>
          <span className="px-3 py-1 rounded-full text-xs font-medium text-zinc-300 bg-[#140d24]/70 border border-[#4c227b]/40 backdrop-blur-md">
            Desktop Companion
          </span>
        </div>
      </div>

      {/* Right: Actions (Download, Update, Uninstall) — Connected indicator removed per user request */}
      <div className="flex items-center gap-3">
        {/* Download Standalone Binary Button */}
        <a
          href="https://github.com/Kashif-Coder404/nexus-v2/releases/latest/download/nexus.exe"
          target="_blank"
          rel="noreferrer"
          className="hidden sm:flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-xs font-medium text-zinc-300 hover:text-white bg-[#140d24]/60 hover:bg-[#1f1338] border border-[#4c227b]/30 hover:border-[#a855f7]/50 transition-all cursor-pointer"
          title="Download standalone nexus.exe"
        >
          <Download className="w-3.5 h-3.5 text-purple-400" />
          <span>Download Binary</span>
        </a>

        {/* Update Button */}
        <button
          type="button"
          onClick={onOpenUpdate}
          className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-xs font-medium text-zinc-300 hover:text-white bg-[#140d24]/60 hover:bg-[#1f1338] border border-[#4c227b]/30 hover:border-[#a855f7]/50 transition-all cursor-pointer"
        >
          <Sparkles className="w-3.5 h-3.5 text-purple-400" />
          <span>Update</span>
        </button>

        {/* Uninstall Button */}
        {isDaemonInstalled && (
          <button
            type="button"
            onClick={onRequestUninstall}
            className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-xs font-medium text-zinc-400 hover:text-rose-400 bg-transparent hover:bg-rose-950/20 border border-transparent hover:border-rose-900/40 transition-all cursor-pointer"
            title="Uninstall daemon & wipe pairing"
          >
            <Trash2 className="w-3.5 h-3.5" />
            <span>Uninstall</span>
          </button>
        )}
      </div>
    </header>
  );
}
