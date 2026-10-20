# 🧭 Nexus v2 — Master Engineering Roadmap & Architecture (`ROADMAP.md`)

> **Single Source of Truth** for Nexus v2 development, completed milestones, active sprint priorities, and long-term architectural specifications.  
> **Last Updated:** October 20, 2026  
> **Consolidates:** `TASKS.md`, `must_do.md`, and `issue_body.md`

---

## ⚡ System Status Overview

| Component | Stack | Status | Health | Active Branch / Runtime |
| :--- | :--- | :---: | :---: | :--- |
| **`Local-BE-v2`** | C# .NET 9 / ConPTY | 🟢 Operational | 0 Errors | Native Windows Agent (`dotnet watch -- --service`) |
| **`backend`** | Node.js / Express / WS | 🟢 Operational | 0 Errors | Port `3100` (`npm run dev:server`) |
| **`frontend`** | Next.js 16 / Turbopack | 🟢 Operational | 0 Errors | Port `3000` (`npm run dev`) / Vercel Deploy |

---

## ✅ Completed & Verified Milestones

### 1. WebSocket OOP Refactor & Device Mutex (`ws-oop` merged to `main`)
- [x] **Modular OOP Session Hierarchy:** Refactored raw procedural WebSocket handlers into clean classes: `BaseWSSession`, `FrontendSession`, and `ClientDeviceSession`.
- [x] **$O(1)$ Single-Worker Device Mutex:** Replaced unbounded message queues with a single active request pointer (`pendingRequest: PendingRequest | null = null`) on each device, eliminating concurrent race conditions on physical terminals.
- [x] **15-Second Reconnect Grace Window:** When a device socket drops, cloud holds in-flight requests for 15s and broadcasts `status: "reconnecting"` (amber pulsing dot in UI) instead of immediately terminating or deselecting.
- [x] **Client Resync (`sync_session`):** Frontend queries live session and device state on WebSocket reconnect without losing chat context.

### 2. PowerShell Execution, Terminal Sanitization & CLI Directives
- [x] **PowerShell Quote Unwrapper:** Fixed nested quote stripping in `Parsers.ts` so `$downloads`, loop variables, and complex scripts preserve quotes without generating blank strings.
- [x] **Dual-Layer ANSI / VT100 Cleaning:** Sanitizes row repositioning escapes (`\x1b[\d+;\d+[Hhf]`), CSI codes, and OSC window title chimes across C# and Node.js before saving to database.
- [x] **Strict Search Tool Directives:** Updated `search.tools.ts`, `terminal.tools.ts`, and `main.Instructions.ts` to strictly require the native `search` tool and forbid recursive shell crawls (`dir /s`, `Get-ChildItem -Recurse`).

### 3. Packaging & Repository Cleanliness
- [x] **Standalone Binary Packaging:** Automated builds via `build-agent.ps1` outputting `Local-BE-v2/dist/nexus.exe`.
- [x] **Git Cleanliness:** Untracked heavy compiled binaries from Git history and ignored `Local-BE-v2/nexus/resource/*`.

---

## 🎯 Active Sprint Priorities

| Priority | Feature / Task | Target Files | Core Value |
| :---: | :--- | :--- | :--- |
| 🔴 **P1** | **Responsive Stop Button & Process Tree Kill** | `ExecuteServices.cs`, `AskAI_OOP.ts`, `websocket.main.service.ts` | 0ms emergency brake: terminates host process tree & unblocks frozen 300s wait. |
| 🟡 **P2** | **Tasks Tab & Live Edge Log Streaming** | `tasks-demo/page.tsx`, `ExecuteServices.cs`, `useTasks.ts` | Displays real-time console chunks (`cmd_chunk`) so user is never blind during long installs. |
| 🟡 **P3** | **Distributed Device Presence & Anti-Flap Sync** | `websocket.main.service.ts`, `UserModel.ts`, `device.controller.ts` | 10s disconnect grace period, dual timestamps, and 3-day security lease. |
| ⚪ **P4** | **Fast Chat Loading & High-Res Lightbox** | `chat.controller.ts`, `AIMsgBox.tsx` | 15 KB thumbnails in chat feed + 1080p lazy-loaded in modal (drops 15 MB payload by 99%). |
| ⚪ **P5** | **Dynamic Agent Skills (MongoDB + LRU Cache)** | `AskAI_OOP.ts`, `Skills` schema | Splitting 470-line system prompt into on-demand skills (reduces greetings token waste). |
| ⚪ **P6** | **Native OS Mouse & Key Inputs** | `Local-BE-v2` (`SendInput`) | `click_coordinate(x, y)` and `press_key(key)` to bypass interactive GUI installers. |
| ⚪ **P7** | **Desktop Electron App & Setup UI** | `Local-BE-v2/SetupPage`, Electron | Dedicated native desktop app wrapper replacing browser tab on `localhost:4100`. |
| ⚪ **P8** | **WebRTC P2P DataChannel Telemetry** | `liveFeedWs.service.ts`, companion | Direct encrypted P2P telemetry tunnel with 0 relay bandwidth costs. |

---

## 📐 Deep Architectural Specifications

### 1. The Responsive Stop Button & Process Kill Pipeline
- **The Problem:** When commands like `winget install` or long loops run, `waitForTaskCompletion` holds the cloud thread for up to 300 seconds. Clicking Stop sets `isAborted = true`, but JavaScript is frozen awaiting the promise. The host PC keeps running the process in the background.
- **The Solution:**
  1. **Physical Stop:** `Local-BE-v2` looks up `ActiveTasks[taskId]`, kills the descendant process tree (`Process.GetProcessById(pid).Kill(entireProcessTree: true)`), and disposes the PTY.
  2. **Logical Unblock:** Cloud backend cancels `pendingTasks[taskId]` and `pendingRequest` in 0ms, unblocking the AI loop.
  3. **Safety Law:** Only tasks registered in `ActiveTasks[taskId]` can be killed. Arbitrary system PIDs are forbidden.

### 2. Durable Task Execution & Disconnection Reconciliation
- **The Core Law:** *The local device is sovereign. The cloud is a stateless projection hub.*
- **Normal Flow:** Commands taking >5s are promoted to the background task list. Chunks stream via `cmd_chunk`.
- **Disconnection:** If the WebSocket drops, the PC keeps running the task locally (e.g., Docker installation continues uninterrupted). Cloud marks device as `reconnecting`.
- **Reconnection (Log Catch-up):** On reconnect, companion transmits `{ type: "sync_active_tasks", tasks: [...] }`. Companion flushes its rolling 200-line buffer (`TaskLogBuffers`) so the web UI catches up without missing logs.

```
[ Normal Flow ]
User ──► Cloud Backend ──► AI ──► Local Backend (PC) ──► Runs ConPTY
                                       │ (>5s threshold)
                                       ▼
                              Task Log Buffer & cmd_chunk ──► UI Tasks Tab

[ Disconnection Flow ]
WebSocket Drops ──► PC task continues locally ──► Cloud marks "Reconnecting"

[ Reconnection Flow ]
PC Reconnects ──► Sends Active Task List & Log Tail ──► Cloud & UI Rehydrate in <50ms
```

### 3. Anti-Flap Presence & Device Security Lease
- **10-Second Presence Debounce:** On WebSocket disconnect, start a 10s timer before mutating MongoDB or alerting web clients. Cancelling on quick reconnect saves 95% of database writes on mobile/flapping Wi-Fi.
- **Dual-Timestamp Schema:**
  - `lastSeenAt: Date` — Heartbeat / presence timestamp.
  - `configUpdatedAt: Date` — Modified *only* when a human alters device settings or renames the device.
- **3-Day Security Lease:** Automatically revoke devices inactive for >3 days to prevent abandoned or stolen machines from lingering with valid tokens.

### 4. Fast Chat Loading (Thumbnail + Lightbox Pattern)
- Full 1080p desktop screenshots are ~1 MB each. 5 messages can bloat MongoDB documents to 15 MB, risking MongoDB's 16 MB BSON limit.
- **Architecture:**
  - `ChatModel` stores compressed ~15 KB thumbnails (300px width).
  - Raw 1080p images are stored in a separate `Images` collection.
  - Clicking any thumbnail in the chat opens a zoomable fullscreen lightbox modal.

---

## 🗂️ Unified File Index

| Old Tracker File | Status | Notes |
| :--- | :---: | :--- |
| `TASKS.md` | **Consolidated** | Historical milestones and roadmap merged into `ROADMAP.md`. |
| `must_do.md` | **Consolidated** | 9-task active sprint specifications merged into `ROADMAP.md`. |
| `issue_body.md` | **Consolidated** | Anti-flap presence & security lease specifications merged into `ROADMAP.md`. |
