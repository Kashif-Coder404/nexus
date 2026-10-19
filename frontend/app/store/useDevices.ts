import { create } from "zustand";

export interface Device {
  deviceName: string;
  id: string;
  online: boolean;
  service?: boolean;
  ipAddress?: string;
  status?: "online" | "offline" | "reconnecting";
}

type DeviceStore = {
  devices: Device[];
  isPairModalOpen: boolean;
  setDevices: (devices: Device[]) => void;
  setOnlineDevices: (
    id: string,
    online: boolean,
    status?: "online" | "offline" | "reconnecting",
  ) => void;
  setIpAddress: (id: string, ipAddress: string) => void;
  setService: (id: string, service: boolean) => void;
  removeDevice: (id: string) => void;
  openPairModal: () => void;
  closePairModal: () => void;
  selectedDeviceId: string | null;
  setSelectedDeviceId: (id: string | null) => void;
};
export const useDevices = create<DeviceStore>((set) => ({
  devices: [],
  isPairModalOpen: false,
  selectedDeviceId: null,
  setSelectedDeviceId: (id: string | null) => set({ selectedDeviceId: id }),
  setDevices: (devices: Device[]) =>
    set((state) => {
      const isCurrentOnline = devices.some(
        (d) => d.id === state.selectedDeviceId && d.online,
      );
      const firstOnline = devices.find((d) => d.online)?.id || null;
      return {
        devices,
        selectedDeviceId: isCurrentOnline
          ? state.selectedDeviceId
          : firstOnline,
      };
    }),
  setOnlineDevices: (
    id: string,
    online: boolean,
    status?: "online" | "offline" | "reconnecting",
  ) =>
    set((state) => {
      const updatedDevices = state.devices.map((device) =>
        device.id === id
          ? {
              ...device,
              online,
              status: status || (online ? "online" : "offline"),
            }
          : device,
      );
      let nextSelected = state.selectedDeviceId;
      // Do NOT deselect if reconnecting!
      if (
        state.selectedDeviceId === id &&
        !online &&
        status !== "reconnecting"
      ) {
        nextSelected = updatedDevices.find((d) => d.online)?.id || null;
      } else if (!state.selectedDeviceId && online) {
        nextSelected = id;
      }
      return {
        devices: updatedDevices,
        selectedDeviceId: nextSelected,
      };
    }),
  setIpAddress: (id: string, ipAddress: string) =>
    set((state) => ({
      devices: state.devices.map((device) =>
        device.id === id ? { ...device, ipAddress } : device,
      ),
    })),
  setService: (id: string, service: boolean) =>
    set((state) => ({
      devices: state.devices.map((device) =>
        device.id === id ? { ...device, service } : device,
      ),
    })),
  removeDevice: (id: string) =>
    set((state) => {
      const remaining = state.devices.filter((device) => device.id !== id);
      const nextSelected =
        state.selectedDeviceId === id
          ? remaining.find((d) => d.online)?.id || null
          : state.selectedDeviceId;
      return {
        devices: remaining,
        selectedDeviceId: nextSelected,
      };
    }),
  openPairModal: () => set({ isPairModalOpen: true }),
  closePairModal: () => set({ isPairModalOpen: false }),
}));
