"use client";

import React, { useEffect, useState } from "react";
import { Laptop } from "lucide-react";
import Dropdown from "../Dropdown";
import DeviceItem from "./DeviceItem";
import { useDevices } from "../../store/useDevices";
import { useUserCredentials } from "../../store/useUserCredentials";
import { useSideBar } from "../../store/useSideBar";
import { requestDevices } from "@/services/ws.service";

export default function SidebarDevices() {
  const devices = useDevices((state) => state.devices);
  const openPairModal = useDevices((state) => state.openPairModal);
  const user = useUserCredentials((state) => state.user);
  const token = useUserCredentials((state) => state.token);
  const { toggleSidebar, isSidebarOpen } = useSideBar();

  const [isDevicesLoading, setIsDevicesLoading] = useState(false);

  const handleDevicesRefresh = () => {
    setIsDevicesLoading(true);
    requestDevices();
  };

  const handleOpenPairModal = () => {
    openPairModal();
    if (isSidebarOpen) toggleSidebar(false);
  };

  const handleDeviceRevoke = async (deviceId: string) => {
    if (!token || !deviceId) return;
    try {
      const backendUrl =
        process.env.NEXT_PUBLIC_BACKEND_URL ||
        "https://nexus-v2-e38m.onrender.com";
      const res = await fetch(`${backendUrl}/api/device/${deviceId}`, {
        method: "DELETE",
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });
      const data = await res.json();
      if (data.success || res.status === 404) {
        useDevices.getState().removeDevice(deviceId);
      } else {
        console.error("[REVOKE DEVICE FAILED]:", data.message);
      }
    } catch (err: any) {
      console.error("[REVOKE DEVICE ERROR]:", err.message);
      useDevices.getState().removeDevice(deviceId);
    }
  };

  useEffect(() => {
    setIsDevicesLoading(false);
  }, [devices]);

  useEffect(() => {
    // Request fresh devices from MongoDB on mount
    requestDevices();
  }, []);

  return (
    <Dropdown
      title="Devices"
      itemNum={devices.length}
      icon={<Laptop className="w-5 h-5" />}
      isLoading={isDevicesLoading}
      onRefresh={handleDevicesRefresh}
      onAdd={handleOpenPairModal}
      viewAllHref="/devices"
      classname={{ mainCont: "my-2" }}
    >
      <div className="max-h-36 overflow-y-auto flex flex-col gap-1 pr-1">
        {devices.length === 0 ? (
          <span className="text-xs text-zinc-500 p-2">
            No companion devices linked.
          </span>
        ) : (
          devices.map((el) => (
            <DeviceItem key={el.id} data={el} onRevoke={handleDeviceRevoke} />
          ))
        )}
      </div>
    </Dropdown>
  );
}
