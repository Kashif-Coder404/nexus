import { useEffect, useState, useCallback, useMemo } from "react";
import { jwtDecode } from "jwt-decode";
import Navbar from "./Navbar";
import PairingCard from "./PairingCard";
import ExecutionControls from "./ExecutionControls";
import InstallCard from "./InstallCard";
import ConfirmModal from "./ConfirmModal";
import UpdateModal from "./UpdateModal";

interface StatusResponse {
  isConnected: boolean;
  isPaired: boolean;
  isInstalled?: boolean;
  installPath?: string;
  isEnable?: boolean;
  code?: string;
  token?: string | null;
  deviceName?: string;
  remainingSeconds?: number;
  cooldown?: number;
  pairingError?: string;
  version?: string;
}

interface ModalConfig {
  isOpen: boolean;
  title: string;
  message: string;
  confirmLabel: string;
  dangerLevel: "danger" | "warning";
  action: () => Promise<void>;
}

interface DeviceTokenPayload {
  deviceId?: string;
  device_id?: string;
  id?: string;
  userId?: string;
  user_id?: string;
  sub?: string;
  email?: string;
  deviceName?: string;
  device_name?: string;
}

// Safely decode JWT token payload using jwt-decode npm package
function parseDeviceToken(rawToken?: string | null): DeviceTokenPayload | null {
  if (!rawToken) return null;
  try {
    let token = rawToken.trim();
    if (token.startsWith("{")) {
      try {
        const parsed = JSON.parse(token);
        token = parsed.token || parsed.deviceToken || token;
      } catch {}
    }
    token = token.replace(/^Bearer\s+/i, "").trim();
    if (!token) return null;
    return jwtDecode<DeviceTokenPayload>(token);
  } catch (err) {
    console.warn("[JWT Decode]: Failed to decode token:", err);
    return null;
  }
}

export default function PairingPage() {
  const [status, setStatus] = useState<StatusResponse | null>({
    isConnected: false,
    isPaired: false,
    isEnable: true,
    code: "",
    remainingSeconds: 0,
  });

  const [isDaemonInstalled, setIsDaemonInstalled] = useState<boolean>(true);
  const [isStopped, setIsStopped] = useState<boolean>(false);
  const [isStarting, setIsStarting] = useState<boolean>(false);
  const [codeLoading, setCodeLoading] = useState<boolean>(false);
  const [isToggling, setIsToggling] = useState<boolean>(false);
  const [isInstalling, setIsInstalling] = useState<boolean>(false);
  const [installProgress, setInstallProgress] = useState<number>(0);
  const [liveLog, setLiveLog] = useState<string>("");
  const [modalLoading, setModalLoading] = useState<boolean>(false);

  // Custom Confirmation Modal state
  const [modalConfig, setModalConfig] = useState<ModalConfig>({
    isOpen: false,
    title: "",
    message: "",
    confirmLabel: "",
    dangerLevel: "danger",
    action: async () => {},
  });

  // Update Modal state
  const [showUpdateModal, setShowUpdateModal] = useState<boolean>(false);
  const [updateStatus, setUpdateStatus] = useState<string>(
    "Checking GitHub releases...",
  );
  const [latestVersion, setLatestVersion] = useState<string | null>(null);

  // Check if nexus.exe is actually installed
  const fetchStatus = useCallback(async () => {
    // 1. Electron Native Check (if running in desktop app)
    const electronAPI = (
      window as unknown as {
        nexusAPI?: { isInstalled: () => Promise<boolean> };
      }
    ).nexusAPI;

    let isElectronInstalled: boolean | null = null;
    if (electronAPI?.isInstalled) {
      try {
        const exists = await electronAPI.isInstalled();
        isElectronInstalled = Boolean(exists);
        setIsDaemonInstalled(isElectronInstalled);
        try {
          localStorage.setItem(
            "nexus_installed",
            isElectronInstalled ? "true" : "false",
          );
        } catch {}
        if (!isElectronInstalled) return;
      } catch {
        // fallback
      }
    }

    // 2. Vite Dev Server Middleware Check (can inspect disk even when port 4100 is stopped)
    try {
      const devRes = await fetch("/__api/check-installed");
      if (devRes.ok) {
        const devData = await devRes.json();
        if (devData.isInstalled !== undefined) {
          setIsDaemonInstalled(Boolean(devData.isInstalled));
        }
      }
    } catch {
      // not in dev server or endpoint unavailable
    }

    // 3. Fetch local API status from C# daemon
    try {
      const res = await fetch("http://localhost:4100/api/pairing-status");
      if (res.ok) {
        const data = await res.json();
        setStatus(data);
        const reallyInstalled =
          data.isInstalled !== undefined ? Boolean(data.isInstalled) : true;
        setIsDaemonInstalled(reallyInstalled);
        setIsStopped(false);
        try {
          localStorage.setItem("nexus_installed", "true");
          if (data.token) {
            localStorage.setItem("nexus_device_token", data.token);
          }
        } catch {}
      } else {
        setIsStopped(true);
      }
    } catch {
      // Local daemon is offline or stopped
      setIsStopped(true);

      // Agar Electron native check pehle ho chuka hai, to offline hone par isDaemonInstalled ko false mat banao
      if (isElectronInstalled === null) {
        try {
          const cached = localStorage.getItem("nexus_installed");
          if (cached === "true") {
            setIsDaemonInstalled(true);
          } else {
            setIsDaemonInstalled(false);
          }
        } catch {}
      }
    }
  }, []);

  useEffect(() => {
    fetchStatus();
    const interval = setInterval(fetchStatus, 2500);
    return () => clearInterval(interval);
  }, [fetchStatus]);

  // Subscribe to live installer / background logs from Electron
  useEffect(() => {
    const electronAPI = (window as any).nexusAPI;
    if (electronAPI?.onLog) {
      const unsub = electronAPI.onLog((log: string) => {
        if (log && log.trim()) {
          setLiveLog(log.trim());
        }
      });
      return () => {
        if (typeof unsub === "function") unsub();
      };
    }
  }, []);

  // Read active token from daemon status or persistent localStorage
  const activeToken = useMemo(() => {
    if (status?.token) return status.token;
    try {
      return localStorage.getItem("nexus_device_token");
    } catch {
      return null;
    }
  }, [status?.token]);

  // Decode JWT payload whenever activeToken changes
  const decodedJwt = useMemo(() => {
    return parseDeviceToken(activeToken);
  }, [activeToken]);

  // Device ID: Normalized deviceId from token, or strictly "Not Paired" if unpaired
  const deviceId = useMemo(() => {
    if (!activeToken && !status?.isPaired) return "Not Paired";
    const id = decodedJwt?.deviceId || decodedJwt?.device_id || decodedJwt?.id;
    return id || (status?.isPaired ? "Paired" : "Not Paired");
  }, [activeToken, status?.isPaired, decodedJwt]);

  // Extracted User Display (Email or User ID)
  const userDisplay = useMemo(() => {
    if (decodedJwt?.email) return decodedJwt.email;
    const uid = decodedJwt?.userId || decodedJwt?.user_id || decodedJwt?.sub;
    if (uid) return `UID-${uid.slice(-10)}`;
    return status?.isPaired || activeToken ? "Paired Account" : "Unassigned";
  }, [decodedJwt, status?.isPaired, activeToken]);

  // Real Device Name (in place of TSNS)
  const deviceName = status?.deviceName || "Nexus Host";

  // Regenerate pairing code
  const handleRegenerate = async () => {
    if (codeLoading || !status?.isConnected) return;
    setCodeLoading(true);
    try {
      const res = await fetch("http://localhost:4100/api/generate-code", {
        method: "POST",
      });
      const data = await res.json();
      if (data.code) {
        setStatus((prev) =>
          prev ? { ...prev, code: data.code, remainingSeconds: 300 } : null,
        );
      }
    } catch (err) {
      console.error("Failed to regenerate code:", err);
    } finally {
      setCodeLoading(false);
    }
  };

  // Copy code
  const handleCopy = async () => {
    if (!status?.code) return;
    const fullCode = `NX-${status.code.replace(/^NX-?/i, "")}`;
    try {
      await navigator.clipboard.writeText(fullCode);
    } catch {
      // clipboard error
    }
  };

  // Toggle Remote Command Execution Killswitch
  const handleToggleSwitch = async () => {
    if (isToggling) return;
    const nextState = !status?.isEnable;
    setIsToggling(true);
    try {
      await fetch("http://localhost:4100/switch", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ value: nextState }),
      });
      setStatus((prev) => (prev ? { ...prev, isEnable: nextState } : null));
    } catch (err) {
      console.error("Failed to toggle switch:", err);
    } finally {
      setIsToggling(false);
    }
  };

  // Trigger Custom Modal for UNINSTALL
  const onRequestUninstall = () => {
    setModalConfig({
      isOpen: true,
      title: "Uninstall & Wipe Nexus Companion?",
      message:
        "This action will completely unregister the Windows background service, remove scheduled tasks, wipe local device tokens, and erase your device from the cloud. You will have to re-install and re-pair your machine.",
      confirmLabel: "Yes, Uninstall & Wipe",
      dangerLevel: "danger",
      action: async () => {
        try {
          await (window as any).nexusAPI?.uninstallNexusFile();
          setStatus(null);
          setIsDaemonInstalled(false);
          try {
            localStorage.removeItem("nexus_installed");
            localStorage.removeItem("nexus_device_token");
          } catch {}
        } catch (err) {
          console.error("Uninstall failed:", err);
        }
      },
    });
  };

  // Trigger Custom Modal for REVOKE
  const onRequestRevoke = () => {
    setModalConfig({
      isOpen: true,
      title: "Revoke Device Pairing?",
      message:
        "This action will immediately disconnect this computer from your active cloud account and destroy stored session credentials. Autonomous command execution will halt, and you will need to generate a new pairing code to re-link.",
      confirmLabel: "Yes, Revoke Pairing",
      dangerLevel: "danger",
      action: async () => {
        try {
          await fetch("http://localhost:4100/api/revoke", { method: "POST" });
          setStatus((prev) =>
            prev ? { ...prev, isPaired: false, token: null, code: "" } : null,
          );
          try {
            localStorage.removeItem("nexus_device_token");
          } catch {}
        } catch (err) {
          console.error("Revoke failed:", err);
        }
      },
    });
  };

  // Trigger Custom Modal for STOP SERVICE
  const onRequestStopServer = () => {
    setModalConfig({
      isOpen: true,
      title: "Stop Companion Daemon?",
      message:
        "This will cleanly shut down the Nexus background agent running on port 4100. Cloud connection will pause until you restart the daemon.",
      confirmLabel: "Stop Service",
      dangerLevel: "warning",
      action: async () => {
        try {
          await (window as any).nexusAPI?.stopNexus();
          setIsStopped(true);
        } catch {
          setIsStopped(true);
        }
      },
    });
  };

  // Start Companion Daemon again in place of stop button
  const handleStartServer = async () => {
    setIsStarting(true);
    try {
      const electronAPI = (
        window as unknown as { nexusAPI?: { startNexus: () => Promise<void> } }
      ).nexusAPI;
      if (electronAPI?.startNexus) {
        await electronAPI.startNexus();
      } else {
        await new Promise((r) => setTimeout(r, 1500));
      }
      setIsStopped(false);
      fetchStatus();
    } catch (err) {
      console.error("Failed to start service:", err);
    } finally {
      setIsStarting(false);
    }
  };

  // Execute modal action
  const handleExecuteModalAction = async () => {
    setModalLoading(true);
    try {
      await modalConfig.action();
    } finally {
      setModalLoading(false);
      setModalConfig((prev) => ({ ...prev, isOpen: false }));
    }
  };

  // Check for updates
  const handleCheckUpdate = async () => {
    setShowUpdateModal(true);
    setUpdateStatus("Checking GitHub releases...");
    try {
      const res = await fetch(
        "https://api.github.com/repos/Kashif-Coder404/nexus-v2/releases/latest",
      );
      if (res.ok) {
        const release = await res.json();
        setLatestVersion(release.tag_name || "v2.6.2");
        if (release.tag_name && release.tag_name !== "v2.6.2") {
          setUpdateStatus(`New release available: ${release.tag_name}!`);
        } else {
          setUpdateStatus("You are running the latest version (v2.6.2).");
        }
      } else {
        setUpdateStatus("Nexus v2.6.2 — Current release is active.");
      }
    } catch {
      setUpdateStatus("Nexus v2.6.2 — Active release.");
    }
  };

  // Install / Start Nexus
  const handleInstall = async () => {
    setIsInstalling(true);
    setLiveLog("Initializing setup...");
    setInstallProgress(15);

    const interval = setInterval(() => {
      setInstallProgress((p) => {
        if (p >= 85) {
          clearInterval(interval);
          return 85;
        }
        return p + 15;
      });
    }, 500);

    try {
      const electronAPI = (window as any).nexusAPI;
      if (electronAPI?.installNexusFile) {
        await electronAPI.installNexusFile();
      } else {
        await new Promise((r) => setTimeout(r, 1800));
      }
      setInstallProgress(100);
      setLiveLog("Installation complete! Starting service...");
      setTimeout(() => {
        setIsInstalling(false);
        setIsDaemonInstalled(true);
        setIsStopped(false);
        setLiveLog("");
        try {
          localStorage.setItem("nexus_installed", "true");
        } catch {}
        fetchStatus();
      }, 700);
    } catch (err) {
      console.error("Install failed:", err);
      setLiveLog("Installation encountered an issue.");
      setIsInstalling(false);
    } finally {
      clearInterval(interval);
    }
  };

  const displayCode = status?.code
    ? status.code.replace(/^NX-?/i, "").trim()
    : "";

  return (
    <div className="min-h-screen w-full flex flex-col justify-between bg-[#080711] text-white select-none">
      {/* ── TOP DESKTOP NAVBAR (Status Indicator Removed) ── */}
      <Navbar
        isDaemonInstalled={isDaemonInstalled}
        onOpenUpdate={handleCheckUpdate}
        onRequestUninstall={onRequestUninstall}
      />

      {/* ── MAIN WORKSPACE CONTENT ── */}
      <main className="flex-1 w-full max-w-4xl mx-auto px-6 py-6 sm:py-10 flex flex-col justify-center items-center">
        {!isDaemonInstalled ? (
          /* View: Install Nexus Hero (Only when nexus.exe is not installed on disk) */
          <InstallCard
            isInstalling={isInstalling}
            installProgress={installProgress}
            onInstall={handleInstall}
            liveLog={liveLog}
          />
        ) : (
          /* Main Dashboard UI: Kept even when stopped, with Start button in place of Stop */
          <div className="w-full space-y-6">
            <PairingCard
              deviceName={deviceName}
              deviceId={deviceId}
              userDisplay={userDisplay}
              isConnected={Boolean(status?.isConnected && !isStopped)}
              isPaired={Boolean(status?.isPaired)}
              isEnable={Boolean(status?.isEnable)}
              displayCode={displayCode}
              isToggling={isToggling}
              codeLoading={codeLoading}
              onCopy={handleCopy}
              onRegenerate={handleRegenerate}
              onRequestRevoke={onRequestRevoke}
              onToggleSwitch={handleToggleSwitch}
            />

            <ExecutionControls
              isStopped={isStopped}
              isStarting={isStarting}
              onRequestStopServer={onRequestStopServer}
              onStartServer={handleStartServer}
            />
          </div>
        )}
      </main>

      {/* ── BOTTOM DANGER CONFIRMATION MODAL ── */}
      <ConfirmModal
        isOpen={modalConfig.isOpen}
        title={modalConfig.title}
        message={modalConfig.message}
        confirmLabel={modalConfig.confirmLabel}
        dangerLevel={modalConfig.dangerLevel}
        loading={modalLoading}
        onConfirm={handleExecuteModalAction}
        onCancel={() => setModalConfig((prev) => ({ ...prev, isOpen: false }))}
      />

      {/* ── UPDATE CHECK MODAL ── */}
      <UpdateModal
        isOpen={showUpdateModal}
        currentVersion="v2.6.2"
        latestVersion={latestVersion}
        statusText={updateStatus}
        onClose={() => setShowUpdateModal(false)}
      />
    </div>
  );
}
