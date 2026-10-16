import { spawn, SpawnOptions } from "child_process";
import { BrowserWindow } from "electron";

export const runNexusWithLogs = (
  exePath: string,
  args: string[],
  mainWindow: BrowserWindow,
  options?: SpawnOptions,
) => {
  const defaultOpt: SpawnOptions = {
    detached: options?.detached ?? false,
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true,
    shell: false,
  };
  const proc = spawn(exePath, args, { ...defaultOpt, ...options });

  const streamOutput = (stream: NodeJS.ReadableStream | null, tag: string) => {
    stream?.on("data", (data) => {
      const lines = data.toString().split(/\r?\n/).filter(Boolean);
      for (const line of lines) {
        const trimmed = line.trim();
        console.log(`[${tag}]:`, trimmed);
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send("nexus-log", trimmed);
        }
      }
    });
  };
  streamOutput(proc.stdout, "Nexus Log");
  streamOutput(proc.stderr, "Nexus Err");
  const promise = new Promise<{ success: boolean; code: number | null }>(
    (resolve) => {
      proc.on("close", (code) => resolve({ success: code === 0, code }));
      proc.on("error", (err) => {
        console.error("[Nexus Error]:", err);
        resolve({ success: false, code: -1 });
      });
    },
  );
  return { proc, promise };
};
