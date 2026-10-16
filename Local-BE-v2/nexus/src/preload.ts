import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("nexusAPI", {
  onLog: (callback: (log: string) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, log: string) => callback(log);
    ipcRenderer.on("nexus-log", handler);
    return () => {
      ipcRenderer.removeListener("nexus-log", handler);
    };
  },
  isInstalled: () => ipcRenderer.invoke("nexus-installed"),
  startNexus: () => ipcRenderer.invoke("nexus-start"),
  stopNexus: () => ipcRenderer.invoke("nexus-stop"),

  installNexusFile: () => ipcRenderer.invoke("nexus-install"),
  uninstallNexusFile: () => ipcRenderer.invoke("nexus-uninstall"),
  getNexusStatus: () => ipcRenderer.invoke("nexus-status"),
});
