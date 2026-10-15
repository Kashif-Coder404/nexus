import {
  Monitor,
  Info,
  Shield,
  Settings,
  ShieldCheck,
  ShieldAlert,
  Copy,
  Check,
  RefreshCw,
  ExternalLink,
} from "lucide-react";
import { useState } from "react";

interface PairingCardProps {
  deviceName: string;
  deviceId: string;
  userDisplay: string;
  isConnected: boolean;
  isPaired: boolean;
  isEnable: boolean;
  displayCode: string;
  isToggling: boolean;
  codeLoading: boolean;
  onCopy: () => void;
  onRegenerate: () => void;
  onRequestRevoke: () => void;
  onToggleSwitch: () => void;
}

export default function PairingCard({
  deviceName,
  deviceId,
  userDisplay,
  isConnected,
  isPaired,
  isEnable,
  displayCode,
  isToggling,
  codeLoading,
  onCopy,
  onRegenerate,
  onRequestRevoke,
  onToggleSwitch,
}: PairingCardProps) {
  const [copied, setCopied] = useState<boolean>(false);
  const [showConfig, setShowConfig] = useState<boolean>(false);

  const handleCopyCode = () => {
    onCopy();
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const isDevicePaired = isPaired && deviceId !== "Not Paired";

  return (
    <div className="w-full max-w-2xl mx-auto flex flex-col space-y-5 animate-in fade-in duration-300">
      {/* ── 1. HERO DEVICE HEADER ── */}
      <div className="flex items-center justify-between w-full pl-1">
        <div className="flex items-center gap-5">
          {/* Glowing Purple Monitor Avatar */}
          <div className="relative flex items-center justify-center shrink-0">
            <div className="w-20 h-20 rounded-full border-2 border-[#a855f7] bg-[#140d24] flex items-center justify-center shadow-[0_0_24px_rgba(168,85,247,0.45)]">
              <Monitor className="w-9 h-9 text-[#c084fc]" />
            </div>
          </div>

          {/* Device Name & Cloud Connection Status */}
          <div className="space-y-1 text-left">
            <div className="flex items-center gap-3">
              <h2 className="text-2xl font-bold tracking-tight text-white font-sans">
                {deviceName}
              </h2>
              {/* Status indicator: "Connected to Cloud" or "Disconnected from Cloud" */}
              <div
                className={`px-3 py-0.5 rounded-full text-xs font-medium flex items-center gap-1.5 border ${
                  isConnected
                    ? "bg-[#071915] border-emerald-900/60 text-emerald-400"
                    : "bg-[#1a0c10] border-rose-900/50 text-rose-400"
                }`}
              >
                <span
                  className={`w-1.5 h-1.5 rounded-full ${
                    isConnected ? "bg-emerald-400 shadow-[0_0_4px_#34d399]" : "bg-rose-400"
                  }`}
                />
                <span>{isConnected ? "Connected to Cloud" : "Disconnected from Cloud"}</span>
              </div>
            </div>

            {/* Subtitle: Device ID if token found, otherwise "Not Paired" */}
            <div className="flex items-center gap-1.5 text-xs text-zinc-400">
              <span className="font-mono text-zinc-400">
                Device ID:{" "}
                <span
                  className={`font-semibold ${
                    deviceId === "Not Paired" ? "text-zinc-500 italic" : "text-zinc-200"
                  }`}
                >
                  {deviceId}
                </span>
              </span>
              <button
                type="button"
                onClick={() => setShowConfig(!showConfig)}
                className="text-zinc-500 hover:text-zinc-300 transition cursor-pointer"
                title="Pairing Info"
              >
                <Info className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        </div>

        {/* Pairing Code on the Right Side of Nexus Host */}
        {!isDevicePaired && (
          <div className="flex flex-col items-end gap-1 shrink-0">
            <span className="text-[11px] font-semibold tracking-wider text-purple-300 uppercase font-sans">
              Pairing Code
            </span>
            <div className="flex items-center gap-2.5 px-4 py-2 rounded-xl bg-[#140d24]/90 border border-[#a855f7]/60 shadow-[0_0_20px_rgba(168,85,247,0.3)]">
              <span className="font-mono text-2xl font-black tracking-widest text-[#c084fc] drop-shadow-[0_0_10px_rgba(192,132,252,0.8)]">
                {displayCode || "----"}
              </span>
              <button
                type="button"
                onClick={handleCopyCode}
                className="p-1.5 rounded-lg text-purple-300 hover:text-white hover:bg-purple-900/40 transition-colors cursor-pointer"
                title="Copy Pairing Code"
              >
                {copied ? (
                  <Check className="w-4 h-4 text-emerald-400" />
                ) : (
                  <Copy className="w-4 h-4 text-purple-300" />
                )}
              </button>
            </div>
            {!isDevicePaired && displayCode && (
              <a
                href="https://nexus-pc-ai.netlify.app"
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 text-[11px] font-mono text-purple-400/80 hover:text-purple-300 transition-colors pt-0.5"
                title="Open nexus-pc-ai.netlify.app to pair"
              >
                <span>Pair at nexus-pc-ai.netlify.app</span>
                <ExternalLink className="w-3 h-3 text-purple-400" />
              </a>
            )}
          </div>
        )}
      </div>

      {/* ── 2. METADATA TELEMETRY CARD (3 Columns) ── */}
      <div className="w-full rounded-2xl bg-[#0c0817]/80 border border-[#2a1745] px-6 py-4 grid grid-cols-3 divide-x divide-[#2a1745] text-left backdrop-blur-md shadow-lg shadow-black/40">
        {/* Col 1: User / Account */}
        <div className="pr-4 space-y-1">
          <span className="text-xs text-zinc-400 block font-sans">User Account</span>
          <span className="font-mono text-sm font-semibold text-white tracking-wide block truncate">
            {userDisplay}
          </span>
        </div>

        {/* Col 2: Pairing Status */}
        <div className="px-4 space-y-1">
          <span className="text-xs text-zinc-400 block font-sans">Pairing Status</span>
          <span
            className={`text-sm font-semibold block ${
              isDevicePaired ? "text-emerald-400" : "text-purple-300"
            }`}
          >
            {isDevicePaired ? "Linked to Cloud" : "Awaiting Pair"}
          </span>
        </div>

        {/* Col 3: Last Seen */}
        <div className="pl-4 space-y-1">
          <span className="text-xs text-zinc-400 block font-sans">Last Seen</span>
          <span className="text-sm font-semibold text-white block">
            {isConnected ? "Now" : "Offline"}
          </span>
        </div>
      </div>

      {/* ── 3. ACTION BUTTONS ROW ── */}
      {isDevicePaired && isConnected ? (
        <div className="grid grid-cols-2 gap-4 w-full animate-in fade-in">
          {/* Left Button: Revoke Access (Only shown when connected & paired) */}
          <button
            type="button"
            onClick={onRequestRevoke}
            className="w-full py-3 px-5 rounded-xl border border-[#a855f7]/40 bg-[#140d24]/50 hover:bg-[#1f1338] hover:border-[#a855f7]/70 text-white font-semibold text-sm flex items-center justify-center gap-2 transition-all cursor-pointer shadow-sm active:scale-[0.99]"
          >
            <Shield className="w-4 h-4 text-purple-300" />
            <span>Revoke Access</span>
          </button>

          {/* Right Button: Configure */}
          <button
            type="button"
            onClick={() => setShowConfig(!showConfig)}
            className="w-full py-3 px-5 rounded-xl bg-gradient-to-r from-[#8b5cf6] via-[#7c3aed] to-[#6366f1] hover:brightness-110 text-white font-semibold text-sm flex items-center justify-center gap-2 transition-all cursor-pointer shadow-[0_0_24px_rgba(139,92,246,0.35)] active:scale-[0.99]"
          >
            <Settings className="w-4 h-4" />
            <span>Configure</span>
          </button>
        </div>
      ) : (
        /* When not paired: Matching 50/50 balanced grid for New Code and Copy Code */
        <div className="grid grid-cols-2 gap-4 w-full animate-in fade-in">
          {/* Left: Generate New Code */}
          <button
            type="button"
            onClick={onRegenerate}
            disabled={codeLoading || !isConnected}
            className="w-full py-3 px-4 rounded-xl bg-gradient-to-r from-[#8b5cf6] via-[#7c3aed] to-[#6366f1] hover:brightness-110 text-white font-semibold text-sm flex items-center justify-center gap-2 transition-all cursor-pointer shadow-[0_0_24px_rgba(139,92,246,0.35)] active:scale-[0.99] disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <RefreshCw className={`w-4 h-4 ${codeLoading ? "animate-spin" : ""}`} />
            <span>{codeLoading ? "Generating..." : "New Code"}</span>
          </button>

          {/* Right: Copy Code (Matching size and style) */}
          <button
            type="button"
            onClick={handleCopyCode}
            disabled={!displayCode || !isConnected}
            className="w-full py-3 px-4 rounded-xl border border-[#a855f7]/40 bg-[#140d24]/60 hover:bg-[#1f1338] hover:border-[#a855f7]/70 text-white font-semibold text-sm flex items-center justify-center gap-2 transition-all cursor-pointer shadow-sm active:scale-[0.99] disabled:opacity-40 disabled:cursor-not-allowed"
            title="Copy Pairing Code"
          >
            {copied ? (
              <>
                <Check className="w-4 h-4 text-emerald-400" />
                <span className="text-emerald-400">Copied!</span>
              </>
            ) : (
              <>
                <Copy className="w-4 h-4 text-purple-300" />
                <span>Copy Code</span>
              </>
            )}
          </button>
        </div>
      )}

      {/* ── 4. REMOTE EXECUTION BANNER WITH TOGGLE SWITCH ── */}
      <div
        className={`w-full p-4 rounded-xl border transition-all flex items-center justify-between text-left ${
          isEnable
            ? "bg-[#071915]/60 border-emerald-900/60 shadow-[0_0_15px_rgba(52,211,153,0.12)]"
            : "bg-[#1f160b]/60 border-amber-900/60 shadow-[0_0_15px_rgba(245,158,11,0.12)]"
        }`}
      >
        <div className="flex items-center gap-3">
          {isEnable ? (
            <ShieldCheck className="w-5 h-5 text-emerald-400 shrink-0" />
          ) : (
            <ShieldAlert className="w-5 h-5 text-amber-400 shrink-0" />
          )}
          <div className="flex flex-col">
            <span
              className={`text-sm font-semibold tracking-wide ${
                isEnable ? "text-emerald-300" : "text-amber-300"
              }`}
            >
              Remote Command Execution: {isEnable ? "ALLOWED" : "PAUSED"}
            </span>
            <span className="text-[11px] font-mono text-zinc-400">
              {isEnable
                ? "Autonomous cloud instructions can run on this PC"
                : "All incoming cloud execution is paused & blocked"}
            </span>
          </div>
        </div>

        {/* Sliding Toggle Switch */}
        <button
          type="button"
          onClick={onToggleSwitch}
          disabled={isToggling}
          role="switch"
          aria-checked={isEnable}
          className={`relative inline-flex h-6 w-12 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none disabled:opacity-50 ${
            isEnable
              ? "bg-emerald-600 shadow-[0_0_12px_rgba(16,185,129,0.5)]"
              : "bg-zinc-700/80"
          }`}
          title={isEnable ? "Click to Pause Remote Execution" : "Click to Allow Remote Execution"}
        >
          <span
            aria-hidden="true"
            className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-lg ring-0 transition duration-200 ease-in-out ${
              isEnable ? "translate-x-6" : "translate-x-0"
            }`}
          />
        </button>
      </div>

      {/* ── 5. OPTIONAL CONFIG DRAWER ── */}
      {showConfig && (
        <div className="w-full p-4 rounded-xl bg-[#0c0817]/90 border border-[#2a1745] text-left space-y-2 text-xs text-zinc-300 animate-in fade-in duration-200">
          <div className="flex items-center justify-between pb-1 border-b border-[#2a1745]">
            <span className="font-semibold text-white">Connection Details</span>
            <span className="font-mono text-[11px] text-zinc-500">Port 4100</span>
          </div>
          <p className="text-[11px] text-zinc-400 leading-relaxed">
            This machine is bound to the local Nexus companion agent and connects to your cloud account via a reverse WebSocket tunnel.
          </p>
        </div>
      )}
    </div>
  );
}
