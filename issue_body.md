### Summary
Implement a high-resilience distributed device presence and schema synchronization engine for Nexus companion devices (`nexus.exe`), featuring a 10-second anti-flap disconnect grace period, dual-timestamp presence/mutation tracking, and a 3-day inactivity security lease.

### Problem
1. **Network Flapping & Reconnect Storms:** On unstable or mobile Wi-Fi connections, companion agents micro-disconnect every 5–10s. Currently, rapid reconnections trigger repeated cryptographic JWT parsing, database query spikes, and UI status flickering.
2. **Abandoned & Stolen Device Risk:** Orphaned or lost laptops remain linked in MongoDB indefinitely without an automatic lease cutoff.
3. **Presence vs. Configuration Conflation:** Tracking only a single `updatedAt` timestamp causes connection heartbeats to be confused with schema mutations (e.g. device name changes).

### Architecture & Requirements

- [ ] **1. Presence Debouncing (10s Disconnect Grace Period):**
  - When companion WebSocket disconnects in `websocket.service.ts`, start a 10-second grace timer before mutating MongoDB or alerting web clients.
  - Cancel the timer if the companion reconnects within 10s (eliminates 95% of DB writes during transient Wi-Fi drops and prevents green/gray UI flicker).
  - Only mark `online: false` and commit `lastSeenAt = new Date()` once the 10-second window elapses.

- [ ] **2. Dual-Timestamp Schema Separation (`UserModel.devices`):**
  - `lastSeenAt: Date` — Heartbeat / presence timestamp (updated on genuine disconnect / connection).
  - `configUpdatedAt: Date` — Configuration timestamp (updated *only* when a human renames the device or alters settings).

- [ ] **3. 3-Day Security Lease (Abandoned / Stolen Device Cutoff):**
  - When companion initiates `{ type: "auth" }`, check: `Date.now() - device.lastSeenAt <= 3 days`.
  - Auto-revoke devices inactive for > 3 days, clean MongoDB registration, and reply with `{ type: "device_revoked" }` to force local token wipe and re-pairing.

- [ ] **4. Offline Device Name Reconciliation:**
  - Companion transmits its local `configUpdatedAt` timestamp during `{ type: "auth" }`.
  - If `companion.configUpdatedAt < device.configUpdatedAt`, cloud backend pushes updated `deviceName` over WebSocket without re-signing JWT or resetting token expiration.
  - Companion persists updated name to disk (`%APPDATA%\Nexus\deviceToken.json`) and refreshes local dashboard state instantly.

### Related Components
- `backend/services/websocket/websocket.service.ts`
- `backend/controllers/device.controller.ts`
- `Local-BE-v2/companion/services/WebSocketClientService.cs`
- `Local-BE-v2/SetupPage/src/components/page1.tsx`
