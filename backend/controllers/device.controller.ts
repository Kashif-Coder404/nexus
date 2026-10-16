import { UserModel } from "../db/schema/user-schema.js";

const renameDeviceHandler = async (req: any, res: any) => {
  try {
    const { id, deviceName } = req.body;
    const updatedDevice = await UserModel.findOneAndUpdate(
      { _id: req.userId, "devices._id": id },
      { $set: { "devices.$.deviceName": deviceName } },
      { new: true },
    );
    if (!updatedDevice) {
      return res.status(404).json({
        success: false,
        message: "Device not found",
        data: null,
      });
    }
    res.status(200).json({
      success: true,
      message: "Device renamed successfully",
      data: null,
    });
  } catch (error: any) {
    return res.status(500).json({
      success: false,
      message: "Internal Server Error",
      data: null,
    });
  }
};

const getDevicesHandler = async (req: any, res: any) => {
  try {
    const userId = req.userId;
    const user = await UserModel.findById(userId);
    if (!user) {
      res.status(404).json({
        success: false,
        message: "User not found",
        data: null,
      });
      return;
    }
    const devices = user?.devices;
    const safeDevices = devices.map((d) => {
      return {
        id: d._id,
        deviceName: d.deviceName,
        name: d.deviceName,
        online: (d as any).online || false,
      };
    });
    res.status(200).json({
      success: true,
      message: "Devices fetched successfully",
      data: safeDevices,
    });
  } catch (error) {
    console.error("[DEVICE CONTROLLER ERROR]:", error);
    res.status(500).json({
      success: false,
      message: "Internal Server Error",
      data: null,
    });
  }
};
export { renameDeviceHandler, getDevicesHandler };
