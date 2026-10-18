"use client";

import { useEffect, useState } from "react";
import { Device, useDevices } from "../store/useDevices";
import { useUserCredentials } from "../store/useUserCredentials";
import { livewebsocket } from "@/services/liveFeedWs.service";
import {
  Cpu,
  HardDrive,
  Clock,
  Wifi,
  User,
  Laptop,
  Pencil,
  Minus,
  Dot,
  Flame,
  ArrowDown,
  ArrowUp,
  Activity,
  Gauge,
  Disc,
} from "lucide-react";

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
  // CPU Vitals & Thermals
  cpu_usage?: number;
  cpu_temp?: number;
  cpu_load?: number;
  cpu_power?: number;
  cpu_clock_ghz?: number;
  cpu_voltage?: number;
  cpu_fan_rpm?: number;
  cpu_fan_pct?: number;
  cpu_model?: string;

  // GPU Vitals & Thermals
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

  // RAM
  ram_usage?: number;
  ram_used_gb?: number;
  ram_avail_gb?: number;

  // Storage / NVMe
  disk_usage?: number;
  nvme_temp?: number;
  nvme_used_pct?: number;
  disks?: SystemDiskInfo[];

  // Live Network Speed
  net_up_mbps?: number;
  net_down_mbps?: number;
  net_up_str?: string;
  net_down_str?: string;

  // Motherboard & System Fans
  motherboard_system_temp?: number;
  motherboard_vrm_temp?: number;
  motherboard_pch_temp?: number;
  system_fans?: SystemFanInfo[];

  // Uptime
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

const Devices = ({ device }: { device: Device }) => {
  const [data, setData] = useState<any>(null);
  const [isConnected, setIsConnected] = useState<boolean>(false);
  const [isRenaming, setIsRenaming] = useState<boolean>(false);
  const [newName, setNewName] = useState<string>(device.deviceName);
  const [isRevoking, setIsRevoking] = useState<boolean>(false);

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
      const data = await res.json();
      if (data.success || res.status === 404) {
        useDevices.getState().removeDevice(device.id);
      } else {
        console.error("[REVOKE DEVICE FAILED]:", data.message);
      }
    } catch (err: any) {
      console.error("[REVOKE DEVICE ERROR]:", err.message);
      useDevices.getState().removeDevice(device.id);
    } finally {
      setIsRevoking(false);
    }
  };

  const handleRenaming = async () => {
    // Not added yet
    try {
      const res = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL}/devices/rename`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            id: device.id,
            deviceName: newName,
          }),
        },
      );
      const data = await res.json();
      if (data.success) {
        setIsRenaming(false);
      } else {
        setNewName(device.deviceName);
      }
    } catch (error) {
      console.error("Error renaming device:", error);
    } finally {
      setIsRenaming(false);
    }
  };

  const currentDevice = useDevices((state) => {
    return state.devices.find((d) => d.id === device.id);
  });
  const isDeviceOnline = Boolean(currentDevice?.online && isConnected);
  useEffect(() => {
    if (!currentDevice?.ipAddress || !currentDevice?.online) {
      setIsConnected(false);
      return;
    }
    const socket = livewebsocket(
      currentDevice.ipAddress,
      (msg) => setData(msg),
      (connected) => setIsConnected(connected),
    );
    return () => {
      socket?.close();
      setIsConnected(false);
    };
  }, [currentDevice?.ipAddress, currentDevice?.online]);

  // Safely extract system info whether wrapped or raw
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

  const ramPercentNumber = parseFloat(sysInfo?.memory?.usagePercentage || "0");
  const cpuUsagePercent = telemetry?.cpu_usage ?? telemetry?.cpu_load ?? 0;
  const cpuTemp = telemetry?.cpu_temp ?? 0;
  const cpuSpeed =
    sysInfo?.cpu?.speedMHz ||
    (telemetry?.cpu_clock_ghz ? Math.round(telemetry.cpu_clock_ghz * 1000) : 0);
  const cpuVoltage = telemetry?.cpu_voltage ?? 0;
  const cpuPower = telemetry?.cpu_power ?? 0;
  const gpuTemp = telemetry?.gpu_temp ?? 0;
  const gpuHotspot = telemetry?.gpu_hotspot ?? 0;
  const gpuLoad = telemetry?.gpu_load ?? 0;
  const gpuPower = telemetry?.gpu_power ?? 0;
  const gpuClock = telemetry?.gpu_clock_mhz ?? 0;
  const gpuVoltage = telemetry?.gpu_voltage ?? 0;
  const hasGpu =
    gpuTemp > 0 ||
    gpuLoad > 0 ||
    (telemetry?.gpu_vram_total !== undefined && telemetry.gpu_vram_total > 0);
  const netDown = telemetry?.net_down_str;
  const netUp = telemetry?.net_up_str;
  const nvmeTemp = telemetry?.nvme_temp ?? 0;
  const cpuFanRpm = telemetry?.cpu_fan_rpm ?? 0;
  const disks = telemetry?.disks || [];
  const primaryDisk =
    disks.find((d) => d.name.toUpperCase().startsWith("C")) || disks[0];
  const otherDisks = disks.filter((d) => d !== primaryDisk);

  return (
    <div className="relative w-full max-w-lg p-5 rounded-2xl bg-brand-surface/70 border border-brand-border/40 shadow-[0_8px_30px_rgba(0,0,0,0.5)] backdrop-blur-xl text-white space-y-4 transition-all">
      {/* 1. Header: Top row (Title + Actions), Bottom row (Hostname + IP) */}
      <div className="border-b border-brand-border/30 pb-4 space-y-2.5">
        {/* Top Row: Device Name & Action Buttons */}
        <div className="flex items-center justify-between gap-3">
          {/* Left: Icon & Name */}
          <div className="flex items-center gap-3 min-w-0">
            <div className="relative w-10 h-10 shrink-0 rounded-xl bg-brand/15 border border-brand-border/40 flex items-center justify-center text-brand-hover shadow-sm">
              <div
                className={`absolute -right-4 -bottom-2 flex items-center gap-1.5 px-2.5 sm:px-3 py-1 sm:py-1.5 rounded-full text-xs font-semibold shrink-0 transition-all ${
                  isDeviceOnline
                    ? "text-emerald-400"
                    : "border-rose-500/30 text-rose-400"
                }`}
              >
                <Dot
                  strokeWidth={10}
                  className={`w-3.5 h-3.5 ${isDeviceOnline ? "animate-pulse text-emerald-400" : " animate-spin text-rose-400"}`}
                />
              </div>
              <Laptop className="w-5 h-5" />
            </div>
            <div className="flex items-center gap-2 min-w-0">
              <div>
                <input
                  type="text"
                  id="renameDevice"
                  value={newName}
                  className="w-full min-w-0 max-w-[14rem] bg-transparent border-none text-white font-bold text-lg truncate focus:outline-none focus:ring-1 focus:ring-brand-hover rounded px-1"
                  onChange={(e) => {
                    setNewName(e.target.value);
                  }}
                  onFocus={(e) => {
                    e.target.select();
                  }}
                  maxLength={15}
                  onBlur={(e) => {
                    if (e.target.value !== device.deviceName) {
                      // handle rename
                    }
                  }}
                  disabled={!isRenaming}
                />
              </div>
              <button
                type="button"
                className="text-zinc-400 hover:text-brand-hover transition-colors p-0.5 rounded shrink-0"
                title="Rename device"
                onClick={(e) => {
                  e.stopPropagation();
                  // focus to the input field
                  if (!isRenaming) {
                    setTimeout(() => {
                      document.getElementById("renameDevice")?.focus();
                    }, 100);
                  }
                  setIsRenaming((prev) => !prev);
                }}
              >
                <Pencil
                  className={`w-3.5 h-3.5 ${
                    isRenaming ? "text-brand-hover scale-110" : "text-zinc-400"
                  }`}
                />
              </button>
            </div>
          </div>

          {/* Right: Live Badge & Revoke Button */}
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={handleRevoke}
              disabled={isRevoking}
              className="flex items-center gap-1.5 px-2.5 sm:px-3 py-1 sm:py-1.5 rounded-full border transform hover:scale-110 active:border-white active:bg-red-950 border-rose-500/70 text-rose-400 text-xs font-semibold hover:bg-rose-500/20 hover:border-rose-500/60 hover:text-rose-300 transition-all shrink-0 cursor-pointer shadow-sm active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed disabled:scale-100"
              title="Revoke device"
              aria-label={`Revoke device ${device.deviceName}`}
            >
              <Minus className="w-3.5 h-3.5 shrink-0" />
              <span className="hidden sm:inline text-[11px]">
                {isRevoking ? "Revoking..." : "Revoke"}
              </span>
            </button>
          </div>
        </div>

        {/* Subtitle Row: Hostname and IP (Full width, no squishing) */}
        <div className="flex flex-wrap justify-center w-full items-center gap-x-3 gap-y-1 text-xs font-mono text-zinc-400">
          <span>({sysInfo?.os?.hostname || device.id.slice(0, 8)})</span>
          <span className="text-zinc-600 hidden sm:inline">•</span>
          <p className="text-brand-glow/80 flex items-center gap-1.5">
            <Wifi className="w-3.5 h-3.5 text-brand shrink-0" />
            <span>Direct LAN • {device.ipAddress}:4100</span>
          </p>
        </div>
      </div>

      {!sysInfo ? (
        !isDeviceOnline ? (
          <div className="py-10 px-4 text-center rounded-xl bg-brand-base/40 border border-brand-border/30 space-y-2">
            <div className="w-2.5 h-2.5 rounded-full bg-rose-500 mx-auto animate-ping" />
            <p className="text-sm font-semibold text-rose-300">
              Device is Offline
            </p>
            <p className="text-xs text-zinc-500 font-mono">
              Unable to establish direct local connection at {device.ipAddress}
              :4100
            </p>
          </div>
        ) : (
          <div className="py-10 px-4 text-center font-semibold text-zinc-400 text-sm animate-pulse">
            Connecting and receiving live telemetry from {device.ipAddress}...
          </div>
        )
      ) : (
        <div
          className={`space-y-3.5 transition-all duration-300 ${!isDeviceOnline ? "opacity-45 grayscale pointer-events-none" : ""}`}
        >
          {/* 2. CPU & Memory Primary Grid */}
          <div className="grid sm:grid-cols-2 gap-3.5">
            {/* CPU Card */}
            <div className="p-4 rounded-xl bg-brand-base/60 border border-brand-border/30 space-y-2.5 flex flex-col justify-between">
              <div className="flex items-center justify-between text-xs text-zinc-400 gap-2">
                <span className="flex items-center gap-1.5 font-semibold uppercase tracking-wider">
                  <Cpu className="w-4 h-4 text-brand-hover shrink-0" />{" "}
                  Processor
                </span>
                <div className="flex items-center gap-1.5 shrink-0">
                  {cpuTemp > 0 && (
                    <span className="text-[10px] font-mono text-amber-300 bg-amber-500/15 px-1.5 py-0.5 rounded border border-amber-500/30 flex items-center gap-0.5">
                      <Flame className="w-3 h-3 text-amber-400" /> {cpuTemp}°C
                    </span>
                  )}
                  <span className="text-[11px] font-mono text-brand-glow bg-brand-surface px-1.5 py-0.5 rounded border border-brand-border/40 whitespace-nowrap">
                    {sysInfo.cpu?.cores} Cores
                  </span>
                </div>
              </div>

              <p
                className="text-sm font-bold text-white truncate"
                title={sysInfo.cpu?.model}
              >
                {sysInfo.cpu?.model}
              </p>

              {/* Real-Time CPU Load Bar */}
              <div className="space-y-1">
                <div className="w-full bg-zinc-800/80 rounded-full h-1.5 overflow-hidden border border-white/5">
                  <div
                    className="bg-gradient-to-r from-brand to-brand-hover h-full rounded-full transition-all duration-500"
                    style={{ width: `${Math.min(cpuUsagePercent, 100)}%` }}
                  />
                </div>
                <div className="flex justify-between items-center text-[11px] font-mono text-zinc-400">
                  <span>Speed: {cpuSpeed} MHz</span>
                  <div className="flex items-center gap-2">
                    {cpuVoltage > 0 && (
                      <span className="text-zinc-300">{cpuVoltage}V</span>
                    )}
                    {cpuPower > 0 && (
                      <span className="text-zinc-300">{cpuPower}W</span>
                    )}
                    <span className="text-zinc-200 font-semibold">
                      {cpuUsagePercent.toFixed(0)}% Load
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* RAM Usage Card */}
            <div className="p-4 rounded-xl bg-brand-base/60 border border-brand-border/30 space-y-2.5 flex flex-col justify-between">
              <div className="flex items-center justify-between text-xs text-zinc-400 gap-2">
                <span className="flex items-center gap-1.5 font-semibold uppercase tracking-wider">
                  <HardDrive className="w-4 h-4 text-brand-hover shrink-0" />{" "}
                  Memory (RAM)
                </span>
                <span className="font-mono text-brand-hover font-bold whitespace-nowrap shrink-0">
                  {sysInfo.memory?.usagePercentage}
                </span>
              </div>

              {/* Progress Bar */}
              <div className="space-y-1">
                <div className="w-full bg-zinc-800/80 rounded-full h-1.5 overflow-hidden border border-white/5">
                  <div
                    className="bg-gradient-to-r from-brand to-brand-hover h-full rounded-full transition-all duration-500 shadow-[0_0_12px_rgba(168,85,247,0.5)]"
                    style={{ width: `${Math.min(ramPercentNumber, 100)}%` }}
                  />
                </div>
                <div className="flex justify-between items-center text-[11px] font-mono text-zinc-400">
                  <span>
                    {Number(sysInfo.memory?.usedGB.replace("GB", "")).toFixed(
                      1,
                    )}{" "}
                    GB used
                  </span>
                  <span>of {sysInfo.memory?.totalGB}</span>
                </div>
              </div>

              {/* Sub Vitals: Available Memory */}
              <div className="text-[11px] font-mono text-zinc-400">
                Free:{" "}
                <span className="text-zinc-200">{sysInfo.memory?.freeGB}</span>
              </div>
            </div>
          </div>

          {/* 3. GPU & Live Telemetry Secondary Grid */}
          <div className="grid sm:grid-cols-2 gap-3.5">
            {/* GPU Card */}
            {hasGpu ? (
              <div className="p-3.5 rounded-xl bg-brand-base/40 border border-brand-border/25 space-y-2 flex flex-col justify-between">
                <div className="flex items-center justify-between text-xs text-zinc-400">
                  <span className="flex items-center gap-1.5 font-semibold text-zinc-300">
                    <Gauge className="w-3.5 h-3.5 text-brand-hover shrink-0" />{" "}
                    GPU Vitals
                  </span>
                  <div className="flex items-center gap-1.5">
                    {gpuTemp > 0 && (
                      <span className="text-[10px] font-mono text-amber-300 bg-amber-500/15 px-1.5 py-0.5 rounded border border-amber-500/30 flex items-center gap-0.5">
                        <Flame className="w-3 h-3 text-amber-400" /> {gpuTemp}°C
                      </span>
                    )}
                    {gpuHotspot > 0 && (
                      <span
                        className="text-[10px] font-mono text-rose-300 bg-rose-500/15 px-1.5 py-0.5 rounded border border-rose-500/30 hidden sm:inline"
                        title="GPU Hotspot Temperature"
                      >
                        {gpuHotspot}°C HS
                      </span>
                    )}
                  </div>
                </div>

                <div className="flex items-center justify-between text-xs font-mono">
                  <span className="text-zinc-400">Core Load:</span>
                  <span className="text-white font-semibold">
                    {gpuLoad.toFixed(0)}%
                  </span>
                </div>

                {telemetry?.gpu_vram_total && telemetry.gpu_vram_total > 0 ? (
                  <div className="space-y-1">
                    <div className="w-full bg-zinc-800/80 rounded-full h-1 overflow-hidden border border-white/5">
                      <div
                        className="bg-gradient-to-r from-purple-500 to-brand-hover h-full rounded-full transition-all duration-500"
                        style={{
                          width: `${Math.min(((telemetry.gpu_vram_used || 0) / telemetry.gpu_vram_total) * 100, 100)}%`,
                        }}
                      />
                    </div>
                    <div className="flex items-center justify-between text-[11px] font-mono text-zinc-400">
                      <span>VRAM:</span>
                      <span className="text-zinc-200">
                        {telemetry.gpu_vram_used?.toFixed(1)} /{" "}
                        {telemetry.gpu_vram_total?.toFixed(1)} GB
                      </span>
                    </div>
                  </div>
                ) : null}

                {(gpuClock > 0 || gpuPower > 0 || gpuVoltage > 0) && (
                  <div className="flex items-center justify-between text-[10px] font-mono text-zinc-400 pt-1 border-t border-brand-border/20">
                    {gpuClock > 0 && <span>{gpuClock} MHz</span>}
                    {gpuPower > 0 && <span>{gpuPower} W</span>}
                    {gpuVoltage > 0 && <span>{gpuVoltage} V</span>}
                  </div>
                )}
              </div>
            ) : /* Fallback Single Storage Card when no dedicated GPU */
            primaryDisk ? (
              <div className="p-3.5 rounded-xl bg-brand-base/40 border border-brand-border/25 space-y-2 flex flex-col justify-between">
                <div className="flex items-center justify-between text-xs text-zinc-400">
                  <span className="flex items-center gap-1.5 font-semibold text-zinc-300">
                    <HardDrive className="w-3.5 h-3.5 text-brand-hover shrink-0" />{" "}
                    Storage ({primaryDisk.name})
                  </span>
                  <span className="text-[11px] font-mono font-bold text-brand-hover">
                    {primaryDisk.used_pct?.toFixed(0)}%
                  </span>
                </div>
                <div className="w-full bg-zinc-800/80 rounded-full h-1.5 overflow-hidden border border-white/5">
                  <div
                    className="bg-gradient-to-r from-brand to-brand-hover h-full rounded-full transition-all duration-500"
                    style={{
                      width: `${Math.min(primaryDisk.used_pct ?? 0, 100)}%`,
                    }}
                  />
                </div>
                <div className="flex justify-between items-center text-[11px] font-mono text-zinc-400">
                  <span>{primaryDisk.free_space} free</span>
                  <span>of {primaryDisk.total_space}</span>
                </div>
              </div>
            ) : null}

            {/* Live Network Bandwidth Card */}
            <div className="p-3.5 rounded-xl bg-brand-base/40 border border-brand-border/25 space-y-2 flex flex-col justify-between">
              <div className="flex items-center justify-between text-xs text-zinc-400">
                <span className="flex items-center gap-1.5 font-semibold text-zinc-300">
                  <Activity className="w-3.5 h-3.5 text-brand-hover shrink-0" />{" "}
                  Live Throughput
                </span>
                {cpuFanRpm > 0 && (
                  <span className="text-[10px] font-mono text-zinc-300 bg-zinc-800 px-1.5 py-0.5 rounded border border-brand-border/30">
                    {cpuFanRpm} RPM
                  </span>
                )}
              </div>
              <div className="grid grid-cols-2 gap-2 text-xs font-mono py-1">
                <div className="flex items-center gap-1 text-emerald-400">
                  <ArrowDown className="w-3.5 h-3.5 shrink-0" />
                  <span className="truncate">{netDown || "0.0 KB/s"}</span>
                </div>
                <div className="flex items-center gap-1 text-cyan-400">
                  <ArrowUp className="w-3.5 h-3.5 shrink-0" />
                  <span className="truncate">{netUp || "0.0 KB/s"}</span>
                </div>
              </div>
              <div className="text-[10px] font-mono text-zinc-500 truncate">
                Direct LAN Stream
              </div>
            </div>
          </div>

          {/* 4. Dedicated Storage Card (Shown when GPU is also present) */}
          {hasGpu && primaryDisk && (
            <div className="p-3.5 rounded-xl bg-brand-base/40 border border-brand-border/25 space-y-2">
              <div className="flex items-center justify-between text-xs text-zinc-400">
                <span className="flex items-center gap-1.5 font-semibold text-zinc-300">
                  <HardDrive className="w-3.5 h-3.5 text-brand-hover shrink-0" />{" "}
                  Primary Storage ({primaryDisk.name})
                </span>
                <div className="flex items-center gap-1.5">
                  {nvmeTemp > 0 && (
                    <span className="text-[10px] font-mono text-zinc-300 bg-zinc-800 px-1.5 py-0.5 rounded border border-brand-border/30 flex items-center gap-0.5">
                      <Flame className="w-3 h-3 text-amber-400" /> {nvmeTemp}°C
                    </span>
                  )}
                  <span className="text-[11px] font-mono font-bold text-brand-hover">
                    {primaryDisk.used_pct?.toFixed(0)}%
                  </span>
                </div>
              </div>

              <div className="space-y-1">
                <div className="w-full bg-zinc-800/80 rounded-full h-1.5 overflow-hidden border border-white/5">
                  <div
                    className="bg-gradient-to-r from-brand to-brand-hover h-full rounded-full transition-all duration-500"
                    style={{
                      width: `${Math.min(primaryDisk.used_pct ?? 0, 100)}%`,
                    }}
                  />
                </div>
                <div className="flex justify-between items-center text-[11px] font-mono text-zinc-400">
                  <span>Drive {primaryDisk.name}</span>
                  <span>
                    {primaryDisk.free_space
                      ? `${primaryDisk.free_space} free of ${primaryDisk.total_space}`
                      : primaryDisk.total_space}
                  </span>
                </div>
              </div>

              {/* Secondary Partitions Row */}
              {otherDisks.length > 0 && (
                <div className="flex flex-wrap items-center gap-1.5 pt-1.5 border-t border-brand-border/15">
                  <span className="text-[9px] uppercase font-mono text-zinc-500 tracking-wider">
                    Other:
                  </span>
                  {otherDisks.slice(0, 5).map((d, i) => {
                    const match =
                      d.name.match(/\(([A-Z]:\\?)\)/i) ||
                      d.name.match(/^([A-Z]:\\?)/i);
                    const label = match ? match[1] : d.name.slice(0, 10);
                    return (
                      <span
                        key={i}
                        className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-brand-surface/60 border border-brand-border/20 text-[10px] font-mono text-zinc-300"
                        title={`${d.name}: ${d.used_pct}% used (${d.free_space} free of ${d.total_space})`}
                      >
                        <Disc className="w-2.5 h-2.5 text-brand" />
                        <span className="font-semibold text-white">
                          {label}
                        </span>
                        <span className="text-zinc-400">
                          {d.used_pct?.toFixed(0)}%
                        </span>
                      </span>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* 4. System Vitals Bottom Bar */}
          <div className="grid grid-cols-3 gap-2 pt-1 text-xs font-mono">
            <div className="p-2 rounded-lg bg-brand-surface/50 border border-brand-border/20 flex items-center gap-2">
              <Clock className="w-3.5 h-3.5 text-brand-hover shrink-0" />
              <div className="min-w-0">
                <span className="text-zinc-400 block text-[9px] uppercase tracking-wider">
                  UPTIME
                </span>
                <span className="text-white font-semibold truncate block text-[11px]">
                  {sysInfo.os?.uptimeHours} hrs
                </span>
              </div>
            </div>
            <div className="p-2 rounded-lg bg-brand-surface/50 border border-brand-border/20 flex items-center gap-2">
              <User className="w-3.5 h-3.5 text-brand-hover shrink-0" />
              <div className="min-w-0 truncate">
                <span className="text-zinc-400 block text-[9px] uppercase tracking-wider">
                  OPERATOR
                </span>
                <span className="text-white font-semibold truncate block text-[11px]">
                  {sysInfo.userInfo?.username}
                </span>
              </div>
            </div>
            <div className="p-2 rounded-lg bg-brand-surface/50 border border-brand-border/20 flex items-center gap-2">
              <Laptop className="w-3.5 h-3.5 text-brand-hover shrink-0" />
              <div className="min-w-0 truncate">
                <span className="text-zinc-400 block text-[9px] uppercase tracking-wider">
                  PLATFORM
                </span>
                <span className="text-white font-semibold truncate block text-[11px]">
                  {sysInfo.os?.platform} ({sysInfo.os?.arch})
                </span>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Devices;
