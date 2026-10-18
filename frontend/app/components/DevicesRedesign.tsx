"use client";

import React, { useEffect, useState } from "react";
import { Device, useDevices } from "../store/useDevices";
import { useUserCredentials } from "../store/useUserCredentials";
import { livewebsocket } from "@/services/liveFeedWs.service";
import {
  Activity,
  ArrowDown,
  ArrowUp,
  Cpu,
  HardDrive,
  Laptop,
  Pencil,
  Radio,
  Trash2,
  Wifi,
  Zap,
} from "lucide-react";
import { requestDevices } from "@/services/ws.service";
import Devices from "./Devices";

export interface SystemDiskInfo {
  name: string;
  temp?: number;
  used_pct?: number;
  read_rate?: string;
  write_rate?: string;
  total_space?: string;
  free_space?: string;
}

export interface SystemFanInfo {
  name: string;
  rpm: number;
  pct: number;
}

export interface DeviceTelemetry {
  cpu_usage?: number;
  cpu_temp?: number;
  cpu_load?: number;
  cpu_power?: number;
  cpu_clock_ghz?: number;
  cpu_voltage?: number;
  cpu_fan_rpm?: number;
  cpu_fan_pct?: number;
  cpu_model?: string;

  gpu_temp?: number;
  gpu_hotspot?: number;
  gpu_load?: number;
  gpu_power?: number;
  gpu_vram_used?: number;
  gpu_vram_total?: number;
  gpu_fan_rpm?: number;
  gpu_fan_pct?: number;
  gpu_clock_mhz?: number;
  gpu_memory_clock_mhz?: number;
  gpu_voltage?: number;

  ram_usage?: number;
  ram_used_gb?: number;
  ram_avail_gb?: number;

  disk_usage?: number;
  nvme_temp?: number;
  nvme_used_pct?: number;
  disks?: SystemDiskInfo[];

  net_up_mbps?: number;
  net_down_mbps?: number;
  net_up_str?: string;
  net_down_str?: string;

  motherboard_system_temp?: number;
  motherboard_vrm_temp?: number;
  motherboard_pch_temp?: number;
  system_fans?: SystemFanInfo[];

  uptime_hours?: number;
}

export interface SystemInfo {
  os?: {
    platform: string;
    type: string;
    release: string;
    arch: string;
    hostname: string;
    uptimeHours: string;
  };

  cpu?: {
    model: string;
    cores: number;
    speedMHz: number;
  };

  memory?: {
    totalGB: string;
    freeGB: string;
    usedGB: string;
    usagePercentage: string;
  };

  userInfo?: {
    username: string;
    homedir: string;
  };

  telemetry?: DeviceTelemetry | null;
}

const Progress = ({
  value,
  className = "",
}: {
  value: number;
  className?: string;
}) => {
  const safeValue = Math.min(100, Math.max(0, value));

  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/[0.06]">
      <div
        className={`h-full rounded-full bg-gradient-to-r from-violet-500 to-fuchsia-400 transition-all duration-500 ${className}`}
        style={{ width: `${safeValue}%` }}
      />
    </div>
  );
};

const Stat = ({
  label,
  value,
  sub,
}: {
  label: string;
  value: string;
  sub?: string;
}) => (
  <div>
    <p className="text-[10px] uppercase tracking-[0.16em] text-zinc-500">
      {label}
    </p>

    <p className="mt-1 text-lg font-semibold tracking-tight text-white">
      {value}
    </p>

    {sub && <p className="mt-0.5 text-[10px] text-zinc-500">{sub}</p>}
  </div>
);

const DevicesRedesign = ({ device }: { device: Device }) => {
  const [data, setData] = useState<any>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [isRenaming, setIsRenaming] = useState(false);
  const [newName, setNewName] = useState(device.deviceName);
  const [isRevoking, setIsRevoking] = useState(false);
  const token = useUserCredentials((state) => state.token);
  const handleRevoke = async () => {
    if (!token || !device.id) return;

    setIsRevoking(true);

    try {
      const backendUrl =
        process.env.NEXT_PUBLIC_BACKEND_URL ||
        "https://nexus-v2-e38m.onrender.com";

      const res = await fetch(`${backendUrl}/api/device/${device.id}`, {
        method: "DELETE",
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      const result = await res.json();

      if (result.success || res.status === 404) {
        useDevices.getState().removeDevice(device.id);
      } else {
        console.error("[REVOKE DEVICE FAILED]:", result.message);
      }
    } catch (err: any) {
      console.error("[REVOKE DEVICE ERROR]:", err.message);
      useDevices.getState().removeDevice(device.id);
    } finally {
      setIsRevoking(false);
    }
  };

  const handleRenaming = async () => {
    try {
      const res = await fetch(
        `${process.env.NEXT_PUBLIC_BACKEND_URL}/api/devices/rename`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            id: device.id,
            deviceName: newName,
          }),
        },
      );

      const result = await res.json();
      if (result.success) {
        requestDevices();
      } else {
        setNewName(device.deviceName);
        console.error("Device rename failed:", result.message);
      }
    } catch (error) {
      console.error("Error renaming device:", error);
    } finally {
      setIsRenaming(false);
    }
  };

  const currentDevice = useDevices((state) =>
    state.devices.find((d) => d.id === device.id),
  );

  useEffect(() => {
    if (!currentDevice?.ipAddress || !currentDevice?.online) {
      setIsConnected(false);
      return;
    }

    const socket = livewebsocket(
      currentDevice?.ipAddress,
      (msg) => setData(msg),
      (connected) => setIsConnected(connected),
    );

    return () => {
      socket?.close();
      setIsConnected(false);
    };
  }, [currentDevice?.ipAddress, currentDevice?.online]);

  let sysInfo: SystemInfo | null = null;
  let telemetry: DeviceTelemetry | null = null;

  try {
    const raw = data?.data
      ? typeof data.data === "string"
        ? JSON.parse(data.data)
        : data.data
      : data;

    if (raw?.info) {
      sysInfo = typeof raw.info === "string" ? JSON.parse(raw.info) : raw.info;
    } else {
      sysInfo = raw;
    }

    if (raw?.telemetry) {
      telemetry =
        typeof raw.telemetry === "string"
          ? JSON.parse(raw.telemetry)
          : raw.telemetry;

      if (sysInfo) {
        sysInfo.telemetry = telemetry;
      }
    }
  } catch {
    sysInfo = null;
    telemetry = null;
  }

  const cpuUsage = telemetry?.cpu_usage ?? telemetry?.cpu_load ?? 0;

  const cpuTemp = telemetry?.cpu_temp ?? 0;

  const cpuSpeed =
    sysInfo?.cpu?.speedMHz ??
    (telemetry?.cpu_clock_ghz ? Math.round(telemetry.cpu_clock_ghz * 1000) : 0);

  const cpuPower = telemetry?.cpu_power ?? 0;

  const gpuLoad = telemetry?.gpu_load ?? 0;
  const gpuTemp = telemetry?.gpu_temp ?? 0;
  const gpuPower = telemetry?.gpu_power ?? 0;

  const ramPercent = parseFloat(sysInfo?.memory?.usagePercentage || "0");

  const ramUsed = sysInfo?.memory?.usedGB || "0 GB";
  const ramTotal = sysInfo?.memory?.totalGB || "0 GB";

  const netDown = telemetry?.net_down_str || "0 Mbps";
  const netUp = telemetry?.net_up_str || "0 Mbps";

  const disks = telemetry?.disks || [];

  const primaryDisk =
    disks.find((disk) => disk.name.toUpperCase().includes("ORICO")) ||
    disks.find((disk) => (disk.used_pct ?? 0) > 1) ||
    disks[0];

  const diskUsage = primaryDisk?.used_pct ?? telemetry?.disk_usage ?? 0;

  const hasGpu =
    gpuTemp > 0 ||
    gpuLoad > 0 ||
    Boolean(telemetry?.gpu_vram_total && telemetry.gpu_vram_total > 0);

  return (
    <div className="group relative w-full max-w-2xl overflow-hidden rounded-3xl border border-white/[0.08] bg-[#0b0912] text-white shadow-2xl shadow-black/30 m-2">
      {/* Ambient glow */}
      <div className="pointer-events-none absolute -right-32 -top-32 h-72 w-72 rounded-full bg-violet-600/10 blur-3xl transition-all duration-700 group-hover:bg-violet-600/15" />

      {/* HEADER */}
      <div className="relative flex items-center justify-between border-b border-white/[0.06] px-5 py-4">
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-violet-400/10 bg-violet-500/10">
            <Laptop className="h-5 w-5 text-violet-300" />
          </div>

          <div className="min-w-0">
            {isRenaming ? (
              <div className="flex items-center gap-2">
                <input
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  autoFocus
                  className="w-40 rounded-lg border border-violet-500/30 bg-white/[0.06] px-2 py-1 text-sm outline-none focus:border-violet-400"
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleRenaming();
                    if (e.key === "Escape") {
                      setNewName(device.deviceName);
                      setIsRenaming(false);
                    }
                  }}
                />

                <button
                  onClick={handleRenaming}
                  className="text-xs text-violet-300 hover:text-white"
                >
                  Save
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <h2 className="truncate text-sm font-semibold">
                  {device.deviceName}
                </h2>

                <button
                  onClick={() => {
                    setNewName(device.deviceName || (device as any).name || "");
                    setIsRenaming(true);
                  }}
                  className="text-zinc-600 transition hover:text-zinc-300"
                >
                  <Pencil className="h-3.5 w-3.5" />
                </button>
              </div>
            )}

            <div className="mt-1 flex items-center gap-2 text-[10px] text-zinc-500">
              <span>{sysInfo?.os?.platform || "Windows"}</span>
              <span className="text-zinc-700">•</span>
              <span className="font-mono">
                {currentDevice?.ipAddress ||
                  currentDevice?.ipAddress ||
                  "Unknown"}
                :4100
              </span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <div
            className={`flex items-center gap-1.5 rounded-full border px-2.5 py-1.5 text-[10px] font-medium ${
              isConnected
                ? "border-emerald-400/10 bg-emerald-400/[0.07] text-emerald-400"
                : "border-red-400/10 bg-red-400/[0.07] text-red-400"
            }`}
          >
            <span
              className={`h-1.5 w-1.5 rounded-full ${
                isConnected ? "animate-pulse bg-emerald-400" : "bg-red-400"
              }`}
            />

            {isConnected ? "LIVE" : "OFFLINE"}
          </div>

          <button
            onClick={handleRevoke}
            disabled={isRevoking}
            title="Remove device"
            className="rounded-lg p-2 text-zinc-600 transition hover:bg-red-500/10 hover:text-red-400"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* MAIN VITALS */}
      <div className="relative grid grid-cols-1 gap-px bg-white/[0.05] sm:grid-cols-3">
        {/* CPU */}
        <div className="bg-[#0b0912] p-5">
          <div className="mb-4 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Cpu className="h-4 w-4 text-violet-400" />
              <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-zinc-500">
                CPU
              </span>
            </div>

            <span className="font-mono text-[10px] text-zinc-600">
              {cpuSpeed} MHz
            </span>
          </div>

          <div className="flex items-end justify-between">
            <div>
              <span className="text-3xl font-semibold tracking-tight">
                {cpuUsage.toFixed(0)}
                <span className="text-base text-zinc-500">%</span>
              </span>

              <p className="mt-1 text-[10px] text-zinc-500">
                {telemetry?.cpu_model || sysInfo?.cpu?.model || "Processor"}
              </p>
            </div>

            <div className="text-right">
              <p className="text-xl font-medium">
                {cpuTemp}
                <span className="text-xs text-zinc-500">°C</span>
              </p>
              <p className="text-[9px] text-zinc-600">TEMP</p>
            </div>
          </div>

          <div className="mt-4">
            <Progress value={cpuUsage} />
          </div>
        </div>

        {/* GPU */}
        <div className="bg-[#0b0912] p-5">
          <div className="mb-4 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Zap className="h-4 w-4 text-fuchsia-400" />
              <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-zinc-500">
                GPU
              </span>
            </div>

            <span className="text-[10px] text-zinc-600">
              {hasGpu ? "Detected" : "N/A"}
            </span>
          </div>

          {hasGpu ? (
            <>
              <div className="flex items-end justify-between">
                <div>
                  <span className="text-3xl font-semibold tracking-tight">
                    {gpuLoad.toFixed(0)}
                    <span className="text-base text-zinc-500">%</span>
                  </span>

                  <p className="mt-1 text-[10px] text-zinc-500">
                    {gpuPower} W power
                  </p>
                </div>

                <div className="text-right">
                  <p className="text-xl font-medium">
                    {gpuTemp}
                    <span className="text-xs text-zinc-500">°C</span>
                  </p>
                  <p className="text-[9px] text-zinc-600">TEMP</p>
                </div>
              </div>

              <div className="mt-4">
                <Progress value={gpuLoad} />
              </div>
            </>
          ) : (
            <div className="flex h-[72px] items-center text-sm text-zinc-600">
              No GPU telemetry
            </div>
          )}
        </div>

        {/* RAM */}
        <div className="bg-[#0b0912] p-5">
          <div className="mb-4 flex items-center justify-between">
            <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-zinc-500">
              MEMORY
            </span>

            <Activity className="h-4 w-4 text-violet-400" />
          </div>

          <div className="flex items-end justify-between">
            <div>
              <span className="text-3xl font-semibold tracking-tight">
                {ramPercent.toFixed(0)}
                <span className="text-base text-zinc-500">%</span>
              </span>

              <p className="mt-1 text-[10px] text-zinc-500">
                {ramUsed} / {ramTotal}
              </p>
            </div>
          </div>

          <div className="mt-4">
            <Progress value={ramPercent} />
          </div>
        </div>
      </div>

      {/* SECONDARY TELEMETRY */}
      <div className="grid grid-cols-2 gap-px border-t border-white/[0.06] bg-white/[0.04] sm:grid-cols-4">
        <div className="bg-[#0b0912] p-4">
          <Stat label="CPU Power" value={`${cpuPower} W`} />
        </div>

        <div className="bg-[#0b0912] p-4">
          <Stat
            label="Storage"
            value={`${diskUsage.toFixed(0)}%`}
            sub={
              primaryDisk
                ? `${primaryDisk.name}${primaryDisk.temp ? ` • ${primaryDisk.temp}°C` : " drive"}`
                : "No disk data"
            }
          />
        </div>

        <div className="bg-[#0b0912] p-4">
          <div className="mb-1 flex items-center gap-1.5">
            <ArrowDown className="h-3 w-3 text-violet-400" />
            <span className="text-[10px] uppercase tracking-[0.16em] text-zinc-500">
              Download
            </span>
          </div>

          <p className="text-sm font-semibold text-white">{netDown}</p>
        </div>

        <div className="bg-[#0b0912] p-4">
          <div className="mb-1 flex items-center gap-1.5">
            <ArrowUp className="h-3 w-3 text-fuchsia-400" />
            <span className="text-[10px] uppercase tracking-[0.16em] text-zinc-500">
              Upload
            </span>
          </div>

          <p className="text-sm font-semibold text-white">{netUp}</p>
        </div>
      </div>

      {/* FOOTER */}
      <div className="flex items-center justify-between border-t border-white/[0.06] px-5 py-3">
        <div className="flex items-center gap-2 text-[10px] text-zinc-600">
          <Radio className="h-3.5 w-3.5" />

          <span>
            {isConnected ? "Telemetry streaming" : "Waiting for agent"}
          </span>
        </div>

        <div className="flex items-center gap-3 text-[10px] text-zinc-600">
          {sysInfo?.os?.arch && <span>{sysInfo.os.arch}</span>}

          {sysInfo?.os?.hostname && (
            <>
              <span className="text-zinc-800">•</span>
              <span>{sysInfo.os.hostname}</span>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default DevicesRedesign;
