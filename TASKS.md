# 📋 Nexus v2 — Master Task Tracker & Roadmap (`TASKS.md`)

> **Single Source of Truth** for current progress, active goals, and upcoming features across the Nexus ecosystem.  
> **Last Updated:** September 30, 2026

---

## 🧭 System Status Overview

| Component                       | Status         | Health   | Active Branch / Process                                                     |
| :------------------------------ | :------------- | :------- | :-------------------------------------------------------------------------- |
| **`Local-BE-v2`** (C# .NET 8)   | 🟢 Operational | 0 Errors | Elevated Service (`dotnet watch -- --service`) / Binary in `dist/nexus.exe` |
| **`backend`** (Node.js/Express) | 🟢 Operational | 0 Errors | Running on port `3100` (`npm run dev:server`)                               |
| **`frontend`** (Next.js 16)     | 🟢 Operational | 0 Errors | Running on port `3000` (`npm run dev`)                                      |

---

## ✅ Section 1: Completed Milestones

### 1. PowerShell Execution & Variable Preservation

- [x] **Unwrapper for Native PowerShell**: Fixed inner-quote stripping where `$downloads`, `$_`, and `foreach` loop variables were stripped into empty strings by nested `powershell -Command` wrappers.
- [x] **Trailing Quote Fix**: Refined `unwrapper` in `Parsers.ts` so path quotes like `"Get-ChildItem -Path \"$env:USERPROFILE\\Downloads\""` preserve internal quotes accurately.
- [x] **Native PowerShell Directives**: Updated `main.Instructions.ts` to enforce writing native PowerShell cmdlets directly without nested wrappers.

### 2. Terminal Noise & ANSI Escape Sequence Cleaning

- [x] **Cursor Position Jump Translation**: Replaced ConPTY row-repositioning escape codes (`\x1b[\d+;\d+[Hhf]`) with line breaks (`\n`) so table columns and output lines do not get squished together.
- [x] **CSI & Private Mode Scrubbing**: Cleaned private modes (`\u001b[?9001h`, `\u001b[?25h`), erase sequences (`\u001b[65X`), and OSC titles across both C# `SanitizeTerminalOutput` and Node.js `cleanTerminalOutput`.
- [x] **Dual-Layer Architecture**: Applied terminal sanitization in both the C# agent output stream and the Node.js backend parser before saving to DB or sending to Gemini.

### 3. Agent Stability & WebSocket Communication

- [x] **Zero-Wait Local Agent Error Reporting**: Updated `WebSocketClientService.cs` so if an exception occurs during command execution, it dispatches an immediate failure `cmd_response` back to the cloud instead of hanging for 30s.
- [x] **Null-Safe Regex Execution**: Guarded `ExecuteServices.SanitizeTerminalOutput` with null propagation (`?.`) and fallback try-catch to prevent Hot-Reload Rude Edit crashes.
- [x] **Safe Catch Block in `RunAsync`**: Fallback to raw string output on execution errors to prevent secondary crashes.
- [x] **Background Task Completion Routing**: Implemented `waitForTaskCompletion(taskId, timeoutMs)` and `task_finished` resolution in `websocket.service.ts` so background tasks (>5s) report their final exit codes cleanly.

### 4. Continuous Process & Daemon Handling

- [x] **Daemon Non-Blocking Execution**: Fixed the infinite-wait blunder in `Parsers.ts` where continuous/daemon processes (e.g. `ping -t`, dev servers) blocked the chat turn for 300s. Daemons now return immediately with their `taskId` so the AI can report status.
- [x] **Generalized Lifecycle Instructions**: Updated `main.Instructions.ts` to instruct the AI on evaluating command lifecycle (finite vs. continuous background services) rather than hardcoded rules.

### 5. UI Polish & Packaging

- [x] **Execution HUD Typography Scaling**: Scaled typography in `ExecutionsStep.tsx` (badges `text-xs`, counters `text-[11px]`, terminal output `text-[11px]`, action titles `text-xs`) and stripped verbose divider banner comments from `ExecutionsStep.tsx` and `ChatUI.tsx`.
- [x] **Single-File Standalone Release**: Compiled standalone self-contained binary `Local-BE-v2/dist/nexus.exe` (47.16 MB) via `build-agent.ps1` and deployed to `%LOCALAPPDATA%\Programs\Nexus\nexus.exe`.

---

## 🎯 Section 2: Active & Immediate Goals

### Phase 1: Verified App Launching & Process Management (Current Priority)

- [ ] **Application Launch Verification (`launch_app`)**:
  - Add native verification in `Local-BE-v2` (`ExecuteServices.cs`): After starting a process or shortcut, wait up to 1.5s to confirm PID creation and main window handle existence.
  - Return structured verification: `{ "started": true, "pid": 1234, "processName": "Discord", "hasWindow": true }`.
  - Expose as first-class tool intercept or structured feedback so the AI knows with 100% certainty if the app actually opened.
- [ ] **First-Class Process Management (`kill_process` & `peek_processes`)**:
  - `peek_processes`: C# native method to query top CPU/RAM processes or search running processes by name/PID without heavy PowerShell startup overhead.
  - `kill_process`: First-class C# handler supporting both graceful (`CloseMainWindow`) and force-kill (`Kill(entireProcessTree: true)`) by PID or ProcessName.
  - Expose `kill_process` and `peek_processes` in `ParserTypes.ts`, `Parsers.ts`, and `main.Instructions.ts`.

### Phase 2: Live Terminals & UI Polish

- [ ] **Beautify Tool Output in `ExecutionsStep.tsx`**:
  - Replace raw JSON `<pre>` blocks for `search_app` and `memory_*` with responsive, styled cards (app icon, badges, file path, one-click copy).
- [ ] **Active Terminals Drawer / Sidebar UI**:
  - Add visual indicator badge (`Active Tasks: X / 4`) in the web sidebar.
  - Display list of background tasks (PID, command, elapsed uptime, status).
- [ ] **One-Click Task Termination**:
  - Add `[Kill]` button next to each running task in the web UI that dispatches `{ "type": "kill_task", "taskId": ..., "pid": ... }` to `Local-BE-v2`.

### Phase 3: Hardware Sensors & Elevation Polish

- [ ] **CPU Temperature / HVCI Blocklist Documentation & Workaround**:
  - Note root cause: `WinRing0x64.sys` used by LibreHardwareMonitor is blocked by Windows Code Integrity / HVCI driver blocklist on Windows 11.
  - Provide fallback / user toggle guide for Core Isolation Vulnerable Driver Blocklist or investigate alternative WMI / vendor SDKs for AMD Ryzen SMU temps.
- [ ] **UAC Elevation Refinement**:
  - Distinguish read-only commands (`--version`, `--status`) from elevated commands (`--install`, `--service`).
  - Eliminate flashing UAC windows when run from non-elevated prompts; display clean console notice: `"[!] Error: This command requires Administrator privileges."`

---

## 🔭 Section 3: Feature Backlog & Future Roadmap

### 1. Active Target Device Selection (Multi-PC Management)

- [ ] **Sidebar Radio Selector**:
  - Add device selection radio buttons in `SideBar.tsx` when a user has multiple linked PCs ("Gaming Desktop", "Work Laptop").
- [ ] **Targeted Dispatch in Gateway**:
  - Pass `activeDeviceId` in `sendCmdRequest` so commands execute only on the selected machine instead of broadcasting.

### 2. Zero-Trust Device PIN / 2FA Security

- [ ] **Physical Machine PIN Setup**:
  - Allow defining a 6-digit unlock PIN during local companion setup (`localhost:4100`).
  - Store bcrypt hash in MongoDB (`deviceSecretHash`).
- [ ] **Web Unlock Challenge**:
  - Require PIN verification before unlocking remote shell execution on that device.

### 3. Chromium Browser Companion Extension

- [ ] **Native Tab & Media Control**:
  - Connect browser extension to `Local-BE-v2` via local WebSocket (`ws://localhost:4100/extension`).
  - Provide surgical tab management (close specific tabs without killing browser process).
  - Extract live DOM / web page text for AI research.
  - Control YouTube / media playback directly.

### 4. Remote Mobile Companion (`nexus_app_v2`)

- [ ] Sync chat sessions, live execution steps, and task management with the React Native / Expo mobile app.
- [ ] Biometric confirmation (FaceID / Fingerprint) before executing high-risk system commands remotely.

### 5. Distributed Device Presence, Anti-Flap Debouncing & Offline Schema Reconciliation

- [ ] **Presence Debouncing (10s Disconnect Grace Period)**:
  - On companion WebSocket disconnect in `websocket.service.ts`, start a 10-second grace timer before updating MongoDB or broadcasting offline status to web clients.
  - Cancel the timer if companion reconnects within 10s (saves 95% of database writes on flapping Wi-Fi and eliminates green/gray UI flicker).
  - Only mark `online: false` and commit `lastSeenAt = new Date()` once the 10-second threshold elapses without reconnection.
- [ ] **Dual-Timestamp Schema Separation (`UserModel.devices`)**:
  - `lastSeenAt: Date` — Heartbeat / presence timestamp (updated on genuine disconnect / connection).
  - `configUpdatedAt: Date` — Configuration timestamp (updated _only_ when a human renames the device or changes settings).
- [ ] **3-Day Security Lease (Abandoned / Stolen Device Cutoff)**:
  - When companion initiates `{ type: "auth" }`, verify: `Date.now() - device.lastSeenAt <= 3 days`.
  - Auto-revoke devices inactive for > 3 days, clean MongoDB registration, and reply with `{ type: "device_revoked" }` to force local token wipe and re-pairing.
- [ ] **Offline Device Name Reconciliation**:
  - Companion transmits its local `configUpdatedAt` timestamp during `{ type: "auth" }`.
  - If `companion.configUpdatedAt < device.configUpdatedAt`, cloud backend pushes updated `deviceName` over WebSocket without re-signing JWT or resetting token expiration.
  - Companion persists updated name to disk (`%APPDATA%\Nexus\deviceToken.json`) and refreshes local dashboard state instantly.

### 6. The task manager got the tasks in the queue but the too daemon processes can freak out the frontend so we have to solve it too
