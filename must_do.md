# Nexus v2: Active Engineering Roadmap (To-Do Only)

> **Last Updated:** October 4, 2026  
> **Status:** Current Sprint — Focus: Process Control, Edge Logging, Fast Chat & Agent Skills  
> **Core Concept:** _"The local device is sovereign. The cloud is a stateless projection hub."_

---

## 🎯 Active Tasks Checklist (What We Have To Do)

| Status | Task | Location | Core Deliverable |
| :---: | :--- | :--- | :--- |
| 🟡 **NEXT** | **1. Active Process Bar & Kill Button (✖️)** | `SendMsg.tsx`, `ws.service.ts`, `useTasks.ts` | Floating active process pill pinned above input with 1-click process tree kill. |
| ⚪ **TODO** | **2. Render-Style Edge Buffered Live Logs** | `local-be-v2`, `websocket.service.ts`, `XTerminal.tsx` | 150-line catch-up tail on open + live WebSocket streaming. Zero cloud RAM waste. |
| ⚪ **TODO** | **3. Device-Authoritative Sync on Connect** | `WebSocketClientService.cs`, `websocket.service.ts` | Local backend re-announces active PIDs on boot/wake-up; Cloud auto-rehydrates. |
| ⚪ **TODO** | **4. Fast Chat Loading & Image Lightbox** | `chat.history.service.ts`, `AIMsgBox.tsx` | 15 KB thumbnails in chat feed + high-res original loaded in fullscreen modal on click. |
| ⚪ **TODO** | **5. AI Prompt Guardrails & Winget Rules** | `main.Instructions.ts` | Negative rules: ban modal dialogs, ban infinite ping, prefer `winget --disable-interactivity`. |
| ⚪ **TODO** | **6. Dynamic Skills Architecture (MongoDB + LRU)** | `AskAI_OOP.ts`, MongoDB `Skills` | Split 470-line prompt into on-demand skills. Reduce latency and greetings token cost. |
| ⚪ **TODO** | **7. Native OS Mouse & Key Inputs** | `local-be-v2` | `click_coordinate(x, y)` and `press_key(key)` to bypass GUI installers when CLI flags don't exist. |
| ⚪ **TODO** | **8. Desktop Electron App & Dual-Release Architecture** | `SetupPage`, Electron, `Local-BE-v2` | SetupPage UI (Install/Uninstall/Update) ➔ Electron Desktop Wrapper ➔ Dual GitHub Releases. |

---

## 1. Active Task Kill System & Render-Style Edge Buffered Logs

### 🛑 The Problems It Solves:
1. Infinite commands like `ping 8.8.8.8 -t` or `npm run dev` run in the background without UI visibility or a kill button.
2. Cloud servers (like Render) sleep or crash if they hoard megabytes of terminal logs in server memory.
3. Closing a browser tab causes all logs during those 10 minutes to be permanently lost (the "black hole" effect).
4. If a PC sleeps or powers off, the cloud has no way of knowing whether a task is dead, creating zombie tasks.

### 💡 The Core Solutions:
1. **Device is Sovereign Master:** `nexus.exe` (`local-be-v2`) on Windows is where the real CPU and PIDs live. The cloud is only a stateless viewer.
2. **Edge Ring-Buffering (Render / Vercel Model):** `local-be-v2` buffers the rolling last 150 lines in RAM (`TaskLogBuffers`). Zero cloud RAM is used when no browser tab is open.
3. **Catch-Up Live Tail:** Reopening the browser tab fetches the last 150 lines from the local device, paints them into `xterm.js`, and seamlessly continues live streaming.
4. **On-Connect Sync & Re-hydration:** Whenever `nexus.exe` connects or wakes from sleep, it sends `{ type: "sync_active_tasks", tasks: [...] }`. The cloud auto-rehydrates in <50ms.
5. **Deep Sleep Eviction:** If the PC disconnects for >2 minutes, cloud safely unloads the tasks from RAM and DB so memory breathes.

### 💻 Protocol & Logic Snippets:

#### A. Frontend Active Task Store (`frontend/app/store/useTasks.ts`):
```typescript
export interface TaskItem {
  taskId: string;
  pid: number;
  cmd: string;
  startedAt: number;
}
// Stores active tasks received from WebSocket `task_promoted` or `sync_active_tasks`
```

#### B. The Kill Command Flow:
```typescript
// 1. User clicks [ ✖ Kill ] in UI above SendMsg input:
sendWsJson({ type: "kill_task", taskId: "task-16068", pid: 16068 });

// 2. Cloud backend routes to Local-BE:
// 3. Local-BE executes:
pProc.Kill(entireProcessTree: true);

// 4. Local-BE emits:
// { "type": "task_finished", "taskId": "task-16068", "exitCode": -1 }
// 5. Frontend removes task from store with exit animation.
```

#### C. Catch-Up Tail Fetch on Reopening Logs:
```typescript
// 1. Fetch the last 150 lines buffered on the local machine:
const res = await fetch(`${localBeUrl}/api/tasks/${taskId}/logs?lines=150`);
const { logs } = await res.json();

// 2. Paint instant history into xterm:
term.write(logs);

// 3. Continue live streaming incoming WebSocket chunks:
window.addEventListener("nexus_ws_message", (e) => {
  if (e.detail?.type === "cmd_chunk" && e.detail?.taskId === taskId) {
    term.write(e.detail.chunk);
  }
});
```

---

## 2. Fast Chat Loading & High-Res Image Lightbox Architecture

### 🛑 The Problem:
- Full 1080p desktop screenshots are ~800 KB to 1 MB of base64 text each.
- A 4-step execution turn contains ~3.5 MB of base64.
- After 5 messages, a chat document reaches 15 MB in MongoDB, leading to slow network transfers, browser RAM lag, and MongoDB's 16 MB BSON document limit (`BSONObjectTooLarge`).

### 💡 The Solution (Thumbnail + Lightbox Pattern):
1. **Shrink & Thumbnail for the Chat Feed:**
   - On capture, generate a compressed ~15 KB thumbnail (300px width).
   - `ChatModel` stores only the 15 KB thumbnails.
   - Initial chat load drops from **15 MB to 15 KB** (600x faster load time!).
2. **Dedicated Image Collection for Full-Res:**
   - Full 1080p raw screenshots are stored in a dedicated `Images` collection (`sessionId`, `stepIndex`, `fullImageBase64`).
   - `ChatModel` documents never hit the 16 MB limit.
3. **Frontend Fullscreen Lightbox:**
   - Clicking any thumbnail in `AIMsgBox.tsx` fetches the full 1080p image and opens a zoomable fullscreen dark-mode lightbox modal.

---

## 3. AI Prompt Guardrails & Winget Automation

### 🛑 The Problem:
- Nexus used `[System.Windows.MessageBox]::Show`, which froze PowerShell for 150 seconds waiting for a human click.
- Nexus ran infinite `ping -t` without count limits.
- Nexus downloaded raw temporary executables to `$env:TEMP` instead of using verified package managers.

### 💡 The Solution (in `main.Instructions.ts`):
1. **Negative Rule: No Modal Popups:** Never call `[System.Windows.MessageBox]::Show`, `Wscript.Shell.Popup`, or `Read-Host`. Always communicate directly through chat.
2. **Negative Rule: No Infinite Commands:** Always include counts/limits (e.g. `ping -n 4`, not `ping -t`).
3. **Tier-1 Winget Priority:** When installing/uninstalling software, always use:
   `winget install --id <id> --silent --accept-package-agreements --accept-source-agreements --disable-interactivity`

---

## 4. Dynamic Agent Skills Architecture (MongoDB + LRU Cache)

### 🛑 The Problem:
`main.Instructions.ts` is ~470 lines long (~10,000 tokens). Every single chat request (even a simple "hey") sends this massive payload, wasting tokens and causing casual greetings to trigger unsolicited commands.

### 💡 The Solution:
1. **Core Prompt (~40 lines):** Persona, strict JSON-only format, conversational greeting rule.
2. **MongoDB `Skills` Collection:** Stores domain manuals (`app_launcher`, `powershell`, `diagnostics`, `vision`, `filesystem`).
3. **In-Memory LRU Cache:** Capped at 50 skills, 15-minute TTL, shared across all users (<250 KB memory footprint).
4. **On-Demand Loading:** Query contains "open" ➔ load `app_launcher`; Query is greeting ➔ 0 skills loaded.

---

## 5. Native OS Mouse & Key Inputs

### 🛑 The Problem:
Many Windows apps (AnyDesk, VPNs, older installers) do not support silent CLI uninstallation. They pop up a GUI dialog asking: *"Do you want to remove user data? [Yes] [No]"*, causing background tasks to hang until timeout.

### 💡 The Solution (in `local-be-v2`):
Add native OS interaction tools:
1. `click_coordinate(x, y)`: Simulates left/right mouse click via Windows `SendInput`.
2. `press_key(key)`: Simulates `Enter`, `Tab`, `Space`, or `Escape`.
Nexus can use `capture_screen` to see the prompt, click `[Yes]`, and successfully finish the installation/uninstallation!

---

## 6. Desktop Electron App, SetupPage & Dual-Release Architecture

### 🛑 The Problem:
1. `nexus.exe` currently runs as a silent background daemon with a local browser tab (`http://localhost:4100`). Users prefer a dedicated, native desktop app window rather than opening a browser tab.
2. If `nexus.exe` is uninstalled or offline, the web page cannot easily restart or re-download it without manual PowerShell scripts.
3. Users need an intuitive desktop workflow with system tray management, 1-click install/uninstall, and silent auto-updates.

### 💡 The Solution (Modular Manager + Daemon Pipeline):

```
SetupPage (UI States) ➔ Electron Desktop Wrapper ➔ Dual GitHub Release Assets (Installer + WinExe)
```

#### Step 1: `SetupPage` UI Enhancements (`Local-BE-v2/SetupPage`)
Add explicit UI states to manage the daemon lifecycle:
- **Offline / Uninstalled State**:
  - Show clean hero card with **`[Install / Start Nexus]`** primary button.
  - Download / installation progress bar with percentage.
- **Active & Paired State**:
  - Green status badge, live pairing code, command toggle switch.
  - Secondary controls: **`[Stop Service]`** and **`[Uninstall Daemon]`**.
- **Update Check & Banner**:
  - Automatically queries latest GitHub release tag against local version.
  - Shows **`[Update to vX.X.X]`** banner with 1-click in-place update.

#### Step 2: Electron Desktop Wrapper
Wrap the existing React/Vite `SetupPage` inside Electron:
- **Main Process (`main.js`)**:
  - Creates the desktop window and system tray icon.
  - IPC handler for `nexus.exe --start`, `nexus.exe --stop`, and `nexus.exe --uninstall`.
  - Stream-downloader to download latest `nexus.exe` from GitHub releases directly into `%LOCALAPPDATA%\Programs\Nexus\nexus.exe`.
- **System Tray**:
  - Minimizes to tray on close with quick menu: `Open Dashboard`, `Status: Active`, `Restart Companion`, `Quit`.

#### Step 3: Packaging & Installer (`electron-builder` / NSIS)
- Build a production-ready Windows installer: **`Nexus-Setup.exe`**.
- Bundles the initial `nexus.exe` inside `resources/` for immediate offline installation on first launch.
- **NSIS Custom Uninstaller Hook (`installer.nsh`)**:
  - When the user uninstalls the Electron app via Windows Settings, the uninstaller automatically executes `nexus.exe --uninstall` and deletes the Scheduled Task to prevent leftover zombie background services.

#### Step 4: Dual GitHub Releases
Publish two assets per release on GitHub:
1. **`Nexus-Setup-<version>.exe`**: The complete graphical desktop installer for end users.
2. **`nexus.exe`**: The standalone C# WinExe companion binary (for headless CLI servers and for Electron's in-place auto-updater).
