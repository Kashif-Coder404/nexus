import { app, BrowserWindow, ipcMain, shell } from "electron";
import path from "node:path";
import started from "electron-squirrel-startup";
import { exec, spawn } from "node:child_process";
import fs from "fs";
import { runNexusWithLogs } from "./helpers";
// Handle creating/removing shortcuts on Windows when installing/uninstalling.
if (started) {
  app.quit();
}

const createWindow = () => {
  // Create the browser window.
  const mainWindow = new BrowserWindow({
    width: 800,
    height: 600,
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
    },
  });

  // and load the index.html of the app.
  if (MAIN_WINDOW_VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(MAIN_WINDOW_VITE_DEV_SERVER_URL);
  } else {
    mainWindow.loadFile(
      path.join(__dirname, `../renderer/${MAIN_WINDOW_VITE_NAME}/index.html`),
    );
  }

  // Open the DevTools.
  mainWindow.webContents.openDevTools();
  // External links ko user ke default browser me open karo (Electron ke andar nahi):
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith("http:") || url.startsWith("https:")) {
      shell.openExternal(url);
      return { action: "deny" }; // Electron window me load hona block kar do
    }
    return { action: "allow" };
  });
  const getSourceNexusExe = () => {
    return app.isPackaged
      ? path.join(process.resourcesPath, "nexus.exe")
      : path.resolve(__dirname, "../../../production/nexus.exe");
  };
  //background node handlers//
  ipcMain.handle("nexus-status", async () => {
    try {
      const res = await fetch("http://localhost:4100/status");
      console.log(res);
      const data = await res.json();
      return { isRunnign: true, data };
    } catch (error: any) {
      return { isRunnign: false, data: error.message };
    }
  });
  ipcMain.handle("nexus-start", async () => {
    try {
      const { proc } = runNexusWithLogs("nexus", ["--service"], mainWindow, {
        detached: true,
        shell: false,
        windowsHide: true,
      });
      proc.unref();
      return {
        status: "success",
        message: "Nexus started successfully",
        pid: proc.pid,
      };
    } catch (error: any) {
      return { status: "failed", message: error.message };
    }
  });
  ipcMain.handle("nexus-stop", async () => {
    try {
      const { promise } = runNexusWithLogs("nexus", ["--stop"], mainWindow);
      await promise;
      return { status: "success", message: "Nexus stopped successfully" };
    } catch (error: any) {
      return { status: "failed", message: error.message };
    }
  });
  ipcMain.handle("nexus-installed", () => {
    const pathOfInstalledExeFile = `${process.env.LOCALAPPDATA}/Programs/Nexus/nexus.exe`;
    return fs.existsSync(pathOfInstalledExeFile);
  });
  // mainWindow ko event bhejne ke liye:
  ipcMain.handle("nexus-install", async () => {
    const { promise } = runNexusWithLogs(
      getSourceNexusExe(),
      ["--install"],
      mainWindow,
    );
    return await promise;
  });

  ipcMain.handle("nexus-uninstall", async () => {
    const targetExe = `${process.env.LOCALAPPDATA}/Programs/Nexus/nexus.exe`;
    const exeToRun = fs.existsSync(targetExe) ? targetExe : "nexus";
    const { promise } = runNexusWithLogs(exeToRun, ["--uninstall"], mainWindow);
    return await promise;
  });
};

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
app.setPath("userData", path.join(app.getPath("appData"), "NexusDesktopApp"));

app.whenReady().then(() => {
  createWindow();

  // On OS X it's common to re-create a window in the app when the
  // dock icon is clicked and there are no other windows open.
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

// Quit when all windows are closed, except on macOS. There, it's common
// for applications and their menu bar to stay active until the user quits
// explicitly with Cmd + Q.
app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

// In this file you can include the rest of your app's specific main process
// code. You can also put them in separate files and import them here.
