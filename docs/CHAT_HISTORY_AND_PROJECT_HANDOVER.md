# Nexus v2 — Full Chat History, Architecture & Handover Document

> **Conversation ID:** `8e281f34-9891-4702-8f03-4e89a6e770e3`  
> **Repository:** `d:\Coding\PROJECTS\Next\Nexus_v2`  
> **Remote Origin:** `https://github.com/Kashif-Coder404/nexus-v2`  
> **Date of Backup:** October 17, 2026  
> **Status:** All branches clean, committed & pushed to GitHub. Complete backup stored on `D:\Config_Backup`.

---

## 1. Executive Summary & Context

Nexus v2 is a distributed AI-assisted desktop automation & remote execution ecosystem consisting of:
1. **Frontend (`frontend/`):** Next.js 16 / React 19 web application for cloud control, chat, and command dispatch.
2. **Backend (`backend/`):** Node.js / TypeScript WebSocket & REST API server (hosted on Render).
3. **Local Companion (`Local-BE-v2/`):**
   - **Daemon (`companion/`):** C# .NET 8 background agent running on port 4100 with scheduled task auto-start.
   - **Desktop UI (`nexus/` & `SetupPage/`):** Electron Forge Vite desktop shell managing installation, status, and pairing.

---

## 2. Key Problems Solved in This Chat

### A. Nexus Desktop Setup & Install Card Premature Unmount
- **The Issue:** When clicking "INSTALL NEXUS", the `InstallCard` disappeared after ~100ms, prematurely rendering `PairingCard` even though installation tasks (Defender exclusions, Firewall rules, Task Scheduler) were still executing. Live logs and progress bar were never visible.
- **Root Cause:**
  - `page1.tsx` / `main.tsx` ran a polling interval every 2.5s calling `fetchStatus()`.
  - `fetchStatus()` called `electronAPI.isInstalled()`, which checked `fs.existsSync("%LOCALAPPDATA%/Programs/Nexus/nexus.exe")`.
  - C#'s `InstallAsync()` copied `nexus.exe` to disk within the first 100ms.
  - The poll immediately returned `true`, flipping `isDaemonInstalled` to `true`.
  - The JSX render condition `{!isDaemonInstalled ? <InstallCard /> : <PairingCard />}` unmounted `InstallCard`.
- **The Fix Applied:**
  1. **Render Guard:** Changed condition to `{(!isDaemonInstalled || isInstalling) ? <InstallCard /> : <PairingCard />}` so the card stays on screen as long as `isInstalling` is active.
  2. **Polling Guard:** Added `isInstallingRef` to prevent `fetchStatus` from overwriting states during an active install.
  3. **Localhost:4100 Live Wait Loop:** Replaced the hardcoded 700ms timeout in `handleInstall` with an active polling loop against `http://localhost:4100/api/pairing-status`. The UI only flips to `PairingCard` when the ASP.NET Core Kestrel server returns `200 OK`. This guarantees the dashboard opens with 100% green status and no false "Service Stopped" alarms.

### B. Silent Process Execution & Real-Time Log Streaming
- **The Issue:** Spawning `nexus.exe` created flashing command prompt windows on Windows.
- **The Fix Applied:**
  - In `Local-BE-v2/nexus/src/helpers.ts`, created `runNexusWithLogs()` using `spawn` with `windowsHide: true`, `shell: false`, and streamed `stdout`/`stderr` lines via `mainWindow.webContents.send("nexus-log", line)`.
  - In `Local-BE-v2/companion/services/SetupServices.cs`, updated `EnsureElevated()` to set `psi.WindowStyle = ProcessWindowStyle.Hidden` during UAC elevation.

### C. WebRTC P2P DataChannel Telemetry (Task 9 Roadmap)
- Documented in `must_do.md`: Direct P2P WebRTC connection between web browser and local companion to bypass HTTPS mixed content & Private Network Access (PNA) restrictions without burning Render server cloud bandwidth.

---

## 3. Git Branches & Repository State

| Branch Name | Status | Purpose |
|---|---|---|
| `companion-ui-setup` | Committed (`912e221`) & Pushed to `origin/companion-ui-setup` | Desktop Companion installer, helpers, polling guard, and live-wait logic. |
| `ws-oop` | Committed (`821a796`) & Pushed to `origin/ws-oop` | WebSocket Object-Oriented Refactor in `backend/services/websocket/WS_OOP.ts`. |
| `main` | Committed (`155f975`) & Pushed to `origin/main` | Stable production branch. |

---

## 4. Post-PC Reset Restoration Guide

### Step 1: Essential Tools Installation
1. Install **Git for Windows**: https://git-scm.com/
2. Install **Node.js LTS** (v20 or v22): https://nodejs.org/
3. Install **.NET 8 SDK**: https://dotnet.microsoft.com/download/dotnet/8.0
4. Install **VS Code** (or your preferred IDE).

### Step 2: One-Click Config Restoration
Open PowerShell as Administrator and run:
```powershell
# 1. Restore VS Code Extensions
Get-Content "D:\Config_Backup\vscode_extensions.txt" | ForEach-Object { code --install-extension $_ }

# 2. Restore VS Code Settings & Keybindings
$codeUser = "$env:APPDATA\Code\User"
New-Item -ItemType Directory -Force -Path $codeUser
Copy-Item "D:\Config_Backup\settings.json" $codeUser -Force
Copy-Item "D:\Config_Backup\keybindings.json" $codeUser -Force
Copy-Item "D:\Config_Backup\snippets" $codeUser -Recurse -Force

# 3. Restore Git Global Config
Copy-Item "D:\Config_Backup\.gitconfig" "$HOME\.gitconfig" -Force

# 4. Restore Antigravity AI Custom Skills
New-Item -ItemType Directory -Force -Path "$HOME\.gemini\config"
Copy-Item "D:\Config_Backup\.gemini_config\*" "$HOME\.gemini\config\" -Recurse -Force

# 5. Restore Antigravity Raw Conversation Brain (Optional, to resume exact chat)
New-Item -ItemType Directory -Force -Path "$HOME\.gemini\antigravity-ide\brain\8e281f34-9891-4702-8f03-4e89a6e770e3"
Copy-Item "D:\Config_Backup\chat_brain_8e281f34\*" "$HOME\.gemini\antigravity-ide\brain\8e281f34-9891-4702-8f03-4e89a6e770e3\" -Recurse -Force

Write-Host "All configs, extensions, and chat context restored successfully!" -ForegroundColor Green
```

---

## 5. Next Planned Work (When You Resume)

1. **Merge `companion-ui-setup` into `ws-oop`:**
   ```powershell
   git checkout ws-oop
   git merge companion-ui-setup
   git push origin ws-oop
   ```
2. **Continue `backend/services/websocket/WS_OOP.ts`:**
   - Complete `ClientSession.onMessage` command routing (`chat_message`, `get_devices`, `pair_device`, `stop_ai`, `kill_task`).
   - Test end-to-end device command execution through the OOP sessions.
3. **Pure Electron UI Refactor:**
   - Move the React setup components directly into Electron Forge's `src/renderer` to enable seamless HMR without needing `main.ps1` builds.
