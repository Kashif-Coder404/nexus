"use client";

import React, { useState, useEffect } from "react";
import { useDevices } from "../store/useDevices";
import { useUserCredentials } from "../store/useUserCredentials";
import {
  Laptop,
  X,
  CheckCircle2,
  AlertCircle,
  Loader2,
  ExternalLink,
  Download,
} from "lucide-react";
import { requestDevices } from "@/services/ws.service";
import useData from "../store/useData";
const WindowAlert = ({
  setWindowAlert,
}: {
  setWindowAlert?: (val: boolean) => void;
}) => {
  const isDownloadAlertOpen = useData((state) => state.isDownloadAlertOpen);
  const closeDownloadAlert = useData((state) => state.closeDownloadAlert);
  const localBackendVersion = useData((state) => state.localBackendVersion);

  const handleClose = () => {
    if (setWindowAlert) setWindowAlert(false);
    closeDownloadAlert();
  };

  const realNexusDownloadHandler = () => {
    handleClose();
    window.location.href =
      "https://github.com/Kashif-Coder404/nexus-v2/releases/latest/download/nexus.exe";
  };

  return (
    <div
      className="fixed inset-0 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in duration-200 z-[9999]"
      onClick={handleClose}
    >
      <div
        className="relative w-full max-w-lg bg-zinc-900/95 border border-brand-border/70 rounded-2xl p-6 sm:p-7 shadow-2xl shadow-brand/20 text-white flex flex-col gap-4"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={handleClose}
          className="absolute top-4 right-4 text-zinc-400 hover:text-white p-1 rounded-lg transition"
          aria-label="Close"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="flex items-start gap-3">
          <div className="p-2.5 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-400 shrink-0 mt-0.5">
            <AlertCircle className="w-5 h-5" />
          </div>
          <div className="flex flex-col gap-1.5 text-left">
            <h3 className="text-base font-semibold text-white">
              Download Nexus v{localBackendVersion} (Windows)
            </h3>
            <p className="text-xs text-zinc-300 leading-relaxed">
              <strong className="text-amber-400 font-medium">Notice:</strong> Because Nexus is a free open-source companion, browsers and Windows Defender may flag the download or mark it as unverified.
            </p>
          </div>
        </div>

        <div className="bg-brand-surface/40 border border-brand-border/40 rounded-xl p-3.5 space-y-2 text-xs text-zinc-300">
          <div className="flex items-start gap-2">
            <span className="w-1.5 h-1.5 rounded-full bg-brand-hover shrink-0 mt-1.5" />
            <span><strong>Browser warning:</strong> If Chrome/Edge blocks the file, click &quot;Keep&quot; or &quot;Download unverified file&quot;.</span>
          </div>
          <div className="flex items-start gap-2">
            <span className="w-1.5 h-1.5 rounded-full bg-brand-hover shrink-0 mt-1.5" />
            <span><strong>SmartScreen alert:</strong> Click &quot;More info&quot; &rarr; &quot;Run anyway&quot;.</span>
          </div>
          <div className="flex items-start gap-2">
            <span className="w-1.5 h-1.5 rounded-full bg-brand-hover shrink-0 mt-1.5" />
            <span><strong>Run with Administrator rights:</strong> Required for live hardware sensors (CPU/GPU temps) and background service auto-start.</span>
          </div>
        </div>

        <div className="flex items-center justify-end gap-3 pt-2">
          <button
            type="button"
            onClick={handleClose}
            className="px-4 py-2 rounded-xl text-xs font-medium text-zinc-400 hover:text-white hover:bg-zinc-800 transition cursor-pointer"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={realNexusDownloadHandler}
            className="px-5 py-2.5 bg-gradient-to-r from-brand to-brand-hover hover:brightness-110 text-white rounded-xl text-xs font-semibold flex items-center gap-2 transition-all shadow-lg shadow-brand/30 cursor-pointer active:scale-95"
          >
            <Download className="w-4 h-4" />
            <span>Download Nexus.exe</span>
          </button>
        </div>
      </div>
    </div>
  );
};
const PairDevice = ({
  setWindowAlert,
}: {
  setWindowAlert?: (val: boolean) => void;
}) => {
  const { isPairModalOpen, closePairModal } = useDevices();
  const token = useUserCredentials((state) => state.token);
  const localBackendVersion = useData((state) => state.localBackendVersion);
  const openDownloadAlert = useData((state) => state.openDownloadAlert);
  const [code, setCode] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Close modal on Escape key press
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isPairModalOpen) {
        handleClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isPairModalOpen]);

  if (!isPairModalOpen) return null;

  const handleClose = () => {
    if (isLoading) return;
    setCode("");
    setError(null);
    setSuccess(null);
    closePairModal();
  };

  const handlePairing = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const cleanCode = code.trim().toUpperCase();

    if (!cleanCode) {
      setError("Please enter a valid pairing code.");
      return;
    }

    if (!token) {
      setError("You must be logged in to pair a device.");
      return;
    }

    setIsLoading(true);
    setError(null);
    setSuccess(null);

    try {
      const backendUrl =
        process.env.NEXT_PUBLIC_BACKEND_URL ||
        "https://nexus-v2-e38m.onrender.com";

      const res = await fetch(`${backendUrl}/api/pairrequest`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          pairingcode: cleanCode,
          pairingCode: cleanCode,
        }),
      });

      const data = await res.json();

      if (res.ok && data.success) {
        setSuccess(data.message || "Device paired successfully!");
        requestDevices();
        setTimeout(() => {
          handleClose();
        }, 1200);
      } else {
        setError(
          data.message ||
            "Pairing failed. Please check the code and ensure your local device is running.",
        );
      }
    } catch (err: any) {
      console.error("[PAIRING ERROR]:", err);
      setError(
        "Could not reach the server. Please check your network connection.",
      );
    } finally {
      setIsLoading(false);
    }
  };
  const handleDownloadNexus = () => {
    if (setWindowAlert) setWindowAlert(true);
    openDownloadAlert();
  };
  return (
    <div
      className="fixed inset-0 z-999 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in duration-200"
      onClick={handleClose}
    >
      <div
        className="relative w-full max-w-md bg-brand-base/95 border border-brand-border/60 rounded-2xl p-6 sm:p-7 shadow-2xl shadow-brand/10 text-white overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Subtle Ambient Glow */}
        <div className="absolute -top-12 -left-12 w-32 h-32 bg-brand/20 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute -bottom-12 -right-12 w-32 h-32 bg-brand-hover/15 rounded-full blur-3xl pointer-events-none" />

        {/* Close Button */}
        <button
          onClick={handleClose}
          disabled={isLoading}
          className="absolute top-4 right-4 p-1.5 rounded-lg text-zinc-400 hover:text-white hover:bg-white/10 transition-colors disabled:opacity-50"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Header */}
        <div className="flex flex-col items-center text-center mb-6">
          <div className="w-12 h-12 rounded-xl bg-brand-surface/80 border border-brand-border/60 flex items-center justify-center text-brand-hover mb-3 shadow-[0_0_15px_rgba(168,85,247,0.25)]">
            <Laptop className="w-6 h-6" />
          </div>
          <h2 className="text-xl font-bold tracking-tight text-white">
            Link Companion Device
          </h2>
          <p className="text-xs sm:text-sm text-zinc-400 mt-1 max-w-xs">
            Make sure your local Nexus is running and open the page{" "}
            <a
              href="http://localhost:4100"
              target="_blank"
              rel="noopener noreferrer"
              className="text-brand-hover hover:underline inline-flex items-center gap-0.5"
            >
              localhost:4100 <ExternalLink className="w-3 h-3 inline" />
            </a>
          </p>
        </div>

        {/* Error Alert */}
        {error && (
          <div className="mb-4 p-3 rounded-xl bg-red-950/40 border border-red-500/30 flex items-start gap-2.5 text-red-300 text-xs sm:text-sm">
            <AlertCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        {/* Success Alert */}
        {success && (
          <div className="mb-4 p-3 rounded-xl bg-emerald-950/40 border border-emerald-500/30 flex items-center gap-2.5 text-emerald-300 text-xs sm:text-sm">
            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
            <span>{success}</span>
          </div>
        )}

        {/* Pairing Form */}
        <form onSubmit={handlePairing} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <label
              htmlFor="pairing-code"
              className="text-xs font-semibold text-zinc-400 uppercase tracking-wider"
            >
              Pairing Code
            </label>
            <input
              id="pairing-code"
              type="text"
              autoFocus
              disabled={isLoading || Boolean(success)}
              value={code}
              onChange={(e) => {
                setCode(e.target.value.toUpperCase());
                if (error) setError(null);
              }}
              placeholder="e.g. NX-AB12"
              maxLength={12}
              autoComplete="off"
              className="w-full bg-brand-surface/70 border border-brand-border/60 rounded-xl px-4 py-3 text-center text-lg sm:text-xl font-mono font-bold tracking-widest text-white placeholder-zinc-600 outline-none focus:border-brand-hover focus:ring-2 focus:ring-brand/30 transition-all disabled:opacity-50"
            />
          </div>

          <button
            type="submit"
            disabled={isLoading || !code.trim() || Boolean(success)}
            className="w-full mt-2 py-3 px-4 rounded-xl font-medium text-sm flex items-center justify-center gap-2 transition-all bg-gradient-to-r from-brand to-brand-hover hover:brightness-110 text-white shadow-lg shadow-brand/30 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer active:scale-[0.99]"
          >
            {isLoading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>Pairing Device...</span>
              </>
            ) : success ? (
              <>
                <CheckCircle2 className="w-4 h-4" />
                <span>Connected!</span>
              </>
            ) : (
              <span>Pair Device</span>
            )}
          </button>
        </form>

        {/* Footer Hint & Companion Download */}
        <div className="mt-5 pt-4 border-t border-zinc-800/80 flex flex-col gap-3">
          <div className="flex items-center justify-between bg-brand-surface/40 border border-brand-border/40 rounded-xl p-3">
            <div className="flex flex-col text-left">
              <span className="text-xs font-semibold text-zinc-200">
                Need the companion app?
              </span>
              <span className="text-[11px] text-zinc-400">
                Run it on your PC to get your pairing code.
              </span>
            </div>
            <button
              type="button"
              onClick={handleDownloadNexus}
              className="flex items-center gap-2 px-3 py-1.5 bg-brand/20 hover:bg-brand/35 border border-brand-border/50 text-brand-glow hover:text-white rounded-lg text-xs font-medium transition-all cursor-pointer shrink-0 active:scale-95"
            >
              <Download className="w-3.5 h-3.5 text-brand-hover" />
              <span>Nexus.exe (v{localBackendVersion})</span>
            </button>
          </div>

          <p className="text-[11px] text-zinc-500 leading-relaxed text-center">
            Once installed, open{" "}
            <span className="font-mono text-brand-hover">
              http://localhost:4100
            </span>{" "}
            to retrieve your code.
          </p>
        </div>
      </div>
    </div>
  );
};

export { PairDevice, WindowAlert };
