interface InstallCardProps {
  isInstalling: boolean;
  installProgress: number;
  onInstall: () => void;
}

export default function InstallCard({
  isInstalling,
  installProgress,
  onInstall,
}: InstallCardProps) {
  return (
    <div className="w-full max-w-xl mx-auto flex flex-col items-center justify-center space-y-6 text-center animate-in fade-in zoom-in-95 duration-300">
      {/* Giant CTA Button (Figma View 3) */}
      <button
        type="button"
        onClick={onInstall}
        disabled={isInstalling}
        className="group relative px-14 sm:px-20 py-6 sm:py-7 rounded-full bg-gradient-to-r from-[#6366f1] via-[#7c3aed] to-[#6366f1] bg-[length:200%_auto] hover:bg-[position:right_center] transition-all duration-300 shadow-[0_0_50px_rgba(124,58,237,0.55)] hover:shadow-[0_0_75px_rgba(168,85,247,0.75)] hover:scale-105 active:scale-95 flex flex-col items-center justify-center cursor-pointer border border-purple-300/35"
      >
        <span className="text-2xl sm:text-4xl font-black tracking-wider text-white drop-shadow-md">
          INSTALL NEXUS
        </span>
        <span className="text-xs sm:text-sm font-mono text-purple-200/90 mt-1">
          v2.6.x • Windows Desktop Daemon
        </span>
      </button>

      {/* Installation / Start Progress Track */}
      {isInstalling && (
        <div className="w-72 sm:w-80 space-y-2 text-center animate-in fade-in">
          <div className="w-full h-2.5 rounded-full bg-zinc-800/80 overflow-hidden border border-zinc-700/60 shadow-inner">
            <div
              className="h-full bg-gradient-to-r from-purple-500 to-indigo-500 rounded-full transition-all duration-300 shadow-[0_0_12px_#a855f7]"
              style={{ width: `${installProgress}%` }}
            />
          </div>
          <p className="text-xs text-zinc-300 font-mono">
            {installProgress < 40
              ? "Fetching binary..."
              : installProgress < 85
                ? "Configuring Windows Service..."
                : "Starting localhost:4100..."}{" "}
            {installProgress}%
          </p>
        </div>
      )}
    </div>
  );
}
